#!/usr/bin/env bash
#
# Install the dispenser firmware onto a Raspberry Pi.
#
#     sudo ./service/install.sh
#
# Run this ON THE PI, not on a development machine — it changes the hostname,
# installs packages and enables services. It prints every change before making
# it, and it is safe to run again over an existing install.
#
# What it does, and why each one is needed:
#
#   python3-lgpio    The GPIO library. The servos and the buzzer both go
#                    through it. Preinstalled on every Raspberry
#                    Pi OS Lite image since 2023, so this is normally a no-op —
#                    but it is the one package the device genuinely needs, and
#                    without it no tray can be opened at all.
#   pigpio           Better still, where it exists: DMA-timed pulses that a busy
#                    CPU cannot stretch. It was preinstalled up to Bookworm and
#                    is GONE from Raspberry Pi OS Trixie — Debian has never
#                    packaged the daemon, and the 64-bit images come from
#                    Debian. Tried, not required.
#   avahi-daemon     publishes pilldispenser.local, which is the exact name
#                    lib/hardware/dispenser.ts in the web app looks for.
#   python3-segno    draws the setup QR. Optional — everything works without it
#                    except the printed label, which falls back to plain text.
#   rpi-ws281x       drives the LED ring. Optional; without it the device is dark.
#   python3-cryptography
#                    AES-GCM for cloud sync — the one thing Python's standard
#                    library cannot do. Optional: without it the dispenser still
#                    dispenses and says on its status page that cloud sync
#                    cannot run. apt rather than pip, because pip builds it from
#                    source on a Pi 3B and that needs a Rust toolchain.
#   i2c + smbus2     talks to the DS3231, and reads the one register that says
#                    whether its battery has ever died.
#   i2c-rtc overlay  lets the kernel set the clock from the DS3231 at boot,
#                    before userspace starts. This is what makes the device know
#                    the time after a power cut with no network.
#   fake-hwclock     disabled — it would overwrite a good RTC time with a stale one.
#   hostname         set to `pilldispenser` so avahi publishes the right name.
#
set -euo pipefail

HOSTNAME_WANTED="${SNAPCARE_HOSTNAME:-pilldispenser}"
INSTALL_DIR=/opt/snapcare
STATE_DIR=/var/lib/snapcare
UNIT=snapcare-dispenser.service

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "This needs root: sudo $0" >&2
  exit 1
fi

if ! command -v nmcli >/dev/null; then
  cat >&2 <<'EOF'
NetworkManager (nmcli) is not installed.

This firmware drives the WiFi through it, and Raspberry Pi OS has shipped it by
default since Bookworm. On an older image, either upgrade the image or:

    sudo apt install network-manager
    sudo systemctl enable --now NetworkManager
    sudo raspi-config   # Advanced Options -> Network Config -> NetworkManager

EOF
  exit 1
fi

say "Installing packages"
apt-get update
# Only these are genuinely required. Everything below is optional: the firmware
# reports at startup which of them it found, so a package that is not in this
# suite must not abort an otherwise good install.
apt-get install -y avahi-daemon python3 i2c-tools python3-smbus2

# The GPIO library. This is the one that actually matters: without some way to
# drive a pin, no tray can be opened, and the firmware will now refuse to
# dispense rather than log doses that never left the hopper.
#
# It is preinstalled on every Raspberry Pi OS Lite image since 2023, on both
# Bookworm and Trixie and both architectures, so this is usually a no-op. It is
# still worth asserting, because the failure it prevents is silent.
if ! apt-get install -y python3-lgpio; then
  echo "  !! python3-lgpio could not be installed."
  echo "  !! Without a GPIO library this device cannot open a tray, and it will"
  echo "  !! say so on its status page rather than pretending. If this is plain"
  echo "  !! Debian rather than Raspberry Pi OS, lgpio comes from the Raspberry"
  echo "  !! Pi archive and is not in Debian at all."
fi

# pigpio is better where it exists — DMA-timed pulses a busy CPU cannot stretch
# — and on a current card it does not exist. It was preinstalled up to and
# including Bookworm and vanished at the Trixie rebase: Debian has never
# packaged the daemon (only the client), and 64-bit Raspberry Pi OS bootstraps
# from Debian. So on 64-bit Trixie there is no apt path to it at all, on 32-bit
# Trixie it comes from Raspbian, and on Bookworm it is simply there.
#
# Which is why this is tried and not required. `servo.make_backend` walks
# pigpio -> lgpio -> RPi.GPIO -> mock by itself.
apt-get install -y pigpio 2>/dev/null \
  || echo "  (no pigpio on this release — lgpio will drive the pins, which is expected on Trixie)"

# Deliberately NOT installed: python3-rpi.gpio.
#
# Raspberry Pi OS now preinstalls `python3-rpi-lgpio`, a shim that provides a
# module literally named RPi.GPIO on top of lgpio. The real python3-rpi.gpio
# package Conflicts with it, so asking for it here would *remove* the working
# shim and replace it with the legacy sysfs implementation — a downgrade on
# this board and a hard break on a Pi 5. The RPi.GPIO path in the firmware is a
# last resort for machines that already have it, not something to install.
apt-get install -y python3-segno || echo "  (segno unavailable — the label will show text instead of a QR)"
apt-get install -y python3-rpi-ws281x || echo "  (rpi-ws281x unavailable — the LED ring will be skipped)"
apt-get install -y python3-cryptography || echo "  (cryptography unavailable — cloud sync will be off; the device still dispenses)"

say "Enabling I2C and the DS3231 real-time clock"
# This is what removes the Pi's worst weakness. The kernel reads the chip and
# sets the system clock before userspace starts — earlier and more reliably
# than any Python could — so the device knows the time after a power cut with
# no network at all.
CONFIG_TXT=/boot/firmware/config.txt
[[ -f $CONFIG_TXT ]] || CONFIG_TXT=/boot/config.txt
for line in "dtparam=i2c_arm=on" "dtoverlay=i2c-rtc,ds3231"; do
  if grep -qxF "$line" "$CONFIG_TXT"; then
    echo "  already set: $line"
  else
    echo "  adding to $CONFIG_TXT: $line"
    echo "$line" >> "$CONFIG_TXT"
    NEEDS_REBOOT=1
  fi
done

# fake-hwclock restores the time the Pi was last shut down at. That is better
# than nothing on a Pi with no RTC and actively harmful on one with a good
# one: it overwrites a correct time with a stale one during boot.
if systemctl list-unit-files 2>/dev/null | grep -q '^fake-hwclock'; then
  say "Disabling fake-hwclock (the DS3231 supersedes it)"
  systemctl disable --now fake-hwclock 2>/dev/null || true
fi

say "Copying the firmware to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cp -r "$here/snapcare_dispenser" "$INSTALL_DIR/"
cp "$here/README.md" "$INSTALL_DIR/" 2>/dev/null || true
find "$INSTALL_DIR" -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true

say "Creating $STATE_DIR"
mkdir -p "$STATE_DIR"
chmod 750 "$STATE_DIR"

# Only if the package arrived. pigpio is a daemon, not a library: installing it
# and not starting it is the failure people actually hit, so this stays here —
# it just no longer assumes the package is present.
if systemctl list-unit-files 2>/dev/null | grep -q '^pigpiod'; then
  say "Enabling pigpiod (DMA-timed servo pulses)"
  systemctl enable --now pigpiod
elif python3 -c 'import lgpio' 2>/dev/null; then
  say "No pigpiod — lgpio will drive the pins"
  echo "  Expected on Raspberry Pi OS Trixie. Pulses are timed by a thread"
  echo "  rather than by DMA, so a heavily loaded Pi can make a horn fidget."
else
  say "NO GPIO LIBRARY IS AVAILABLE"
  echo "  This device cannot open a tray. It will report that on its status"
  echo "  page and refuse to dispense, rather than logging doses that never"
  echo "  came out. Fix it with:"
  echo "      sudo apt install python3-lgpio"
fi

current_hostname="$(hostname)"
if [[ "$current_hostname" != "$HOSTNAME_WANTED" ]]; then
  say "Setting the hostname to $HOSTNAME_WANTED (was $current_hostname)"
  # This is what makes the device answer to pilldispenser.local. The web app's
  # DEFAULT_HOST is that exact string, so a different hostname means the app
  # cannot find the device without somebody typing an IP address.
  hostnamectl set-hostname "$HOSTNAME_WANTED"
  sed -i "s/\b${current_hostname}\b/${HOSTNAME_WANTED}/g" /etc/hosts
fi

say "Enabling avahi (publishes ${HOSTNAME_WANTED}.local)"
systemctl enable --now avahi-daemon

say "Installing the captive portal DNS rule"
mkdir -p /etc/NetworkManager/dnsmasq-shared.d
cat > /etc/NetworkManager/dnsmasq-shared.d/snapcare-portal.conf <<'EOF'
# Written by the SnapCare dispenser installer.
# Resolves every name to the device while its setup hotspot is up, so a phone's
# captive-portal check lands on the setup page and the page opens by itself.
address=/#/10.42.0.1
EOF

say "Installing $UNIT"
cp "$here/service/$UNIT" /etc/systemd/system/
systemctl daemon-reload
systemctl enable "$UNIT"
systemctl restart "$UNIT"

if [[ -n "${NEEDS_REBOOT:-}" ]]; then
  say "A REBOOT IS NEEDED for the I2C/RTC overlay to load"
  echo "  After rebooting, check the clock chip is seen:"
  echo "      ls -l /dev/rtc0 && sudo hwclock -r"
  echo "  And once the Pi has the right time, write it to the RTC:"
  echo "      sudo hwclock --systohc"
fi

say "Done"
python3 - <<'PY'
import sys
sys.path.insert(0, "/opt/snapcare")
from snapcare_dispenser import provisioning
from snapcare_dispenser.store import Store

identity = provisioning.load_identity(Store())
print(f"""
This device's permanent setup network — print it once, it never changes:

    network   {identity.ssid}
    password  {identity.passphrase}
    label     {provisioning.device_url()}label

Print the label from that URL, or run:

    sudo python3 -m snapcare_dispenser --show-qr

Check it is running:

    systemctl status snapcare-dispenser
    journalctl -u snapcare-dispenser -f
""")
PY

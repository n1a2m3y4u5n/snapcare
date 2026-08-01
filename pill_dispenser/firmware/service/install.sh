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
#   python3-cryptography
#                    AES-GCM for cloud sync — the one thing Python's standard
#                    library cannot do. Optional: without it the dispenser still
#                    dispenses and says on its status page that cloud sync
#                    cannot run. apt rather than pip, because pip builds it from
#                    source on a Pi 3B and that needs a Rust toolchain.
#   dtparam=spi=on   the ILI9341 LCD, which is a four-line SPI panel. No
#                    package: the firmware writes the pixels to /dev/spidev0.0
#                    itself, and draws them with a bytearray rather than Pillow.
#   dtparam=i2c_arm=on
#                    the SSD1306 OLED, on GPIO 2/3. Added unconditionally, and
#                    that is a change: it used to go in only on a DS3231 build,
#                    so a machine with the backup panel fitted and no DS3231 had
#                    no bus for it and came up with nothing on the screen. Both
#                    parts share the two pins — 0x3C and 0x68 are different
#                    addresses — so one line covers both.
#   fake-hwclock     left alone on a DS1302 build (nothing competes with it —
#                    the firmware sets the clock from the chip at startup) and
#                    disabled on a DS3231 one, where it would overwrite a good
#                    kernel-applied RTC time with a stale file.
#   hostname         set to `pilldispenser` so avahi publishes the right name.
#
# Only on a DS3231 build (SNAPCARE_RTC=ds3231):
#
#   i2c + smbus2     talks to the DS3231 and reads the one register that says
#                    whether its battery has ever died.
#   i2c-rtc overlay  lets the kernel set the clock from the DS3231 at boot,
#                    before userspace starts.
#
# The default build is the **DS1302**, which is what the assembly guide wires.
# It is three bit-banged GPIOs with no kernel driver, so it needs no I2C, no
# overlay and no /dev/rtc0 — and adding a `i2c-rtc,ds3231` overlay to a board
# with no DS3231 on it makes the kernel probe an address with nothing at it,
# log a failure, and never create /dev/rtc0. That is a confusing afternoon to
# hand somebody, so this script no longer does it by default.
#
set -euo pipefail

HOSTNAME_WANTED="${SNAPCARE_HOSTNAME:-pilldispenser}"
INSTALL_DIR=/opt/snapcare
STATE_DIR=/var/lib/snapcare
UNIT=snapcare-dispenser.service

# Which clock chip is fitted. `ds1302` is what the assembly guide wires and the
# only one this script sets up by default; `ds3231` adds I2C, smbus2 and the
# kernel overlay. `none` skips the clock entirely, for a device that will always
# have a network.
RTC_KIND="$(echo "${SNAPCARE_RTC:-ds1302}" | tr '[:upper:]' '[:lower:]')"
case "$RTC_KIND" in
  ds1302|ds3231|none) ;;
  auto)
    # `auto` is a valid setting for the *firmware*, which probes both chips at
    # runtime. It is not a valid answer to "what should I put in config.txt",
    # because that has to be decided now and cannot be probed. Treated as the
    # build this guide describes.
    RTC_KIND=ds1302 ;;
  *)
    echo "SNAPCARE_RTC must be ds1302, ds3231 or none — not '$RTC_KIND'" >&2
    exit 1 ;;
esac

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

# ── apt, made to wait rather than fall over ─────────────────────────────────
#
# `set -e` plus an unguarded `apt-get update` is a script that dies on the spot
# if anything else holds the dpkg lock. On a freshly imaged card something
# usually does: `apt-daily` and `unattended-upgrades` fire on a systemd timer a
# few minutes after first boot, take the frontend lock, and hold it for as long
# as the upgrade takes — which is exactly when somebody is running this script
# for the first time.
#
# That contention is transient and clears itself, so waiting is the right answer
# rather than exiting and asking somebody to run the whole thing again. apt has
# known how to do this since 2.1.5; every Raspberry Pi OS release this firmware
# supports is well past that.
APT_WAIT_S="${SNAPCARE_APT_WAIT_S:-300}"
apt_get() { apt-get -o DPkg::Lock::Timeout="$APT_WAIT_S" "$@"; }

# Said before the wait, not after it, so a script that appears to hang for four
# minutes has already explained why.
if pgrep -x 'apt|apt-get|dpkg|unattended-upgr' >/dev/null 2>&1; then
  echo
  echo "  .. another package manager is already running:"
  pgrep -a -x 'apt|apt-get|dpkg|unattended-upgr' 2>/dev/null | sed 's/^/     /'
  echo "  .. waiting up to ${APT_WAIT_S}s for it to finish before touching anything."
  echo "     This is normal on a freshly imaged card. Nothing has been changed yet,"
  echo "     and re-running this script later is always safe."
fi

say "Installing packages"
apt_get update
# Only these are genuinely required. Everything below is optional: the firmware
# reports at startup which of them it found, so a package that is not in this
# suite must not abort an otherwise good install.
apt_get install -y avahi-daemon python3

# Only a DS3231 build speaks I2C. On the DS1302 the firmware bit-bangs three
# GPIOs itself, so these two packages would sit there unused.
if [[ $RTC_KIND == ds3231 ]]; then
  apt_get install -y i2c-tools python3-smbus2
fi

# The GPIO library. This is the one that actually matters: without some way to
# drive a pin, no tray can be opened, and the firmware will now refuse to
# dispense rather than log doses that never left the hopper.
#
# It is preinstalled on every Raspberry Pi OS Lite image since 2023, on both
# Bookworm and Trixie and both architectures, so this is usually a no-op. It is
# still worth asserting, because the failure it prevents is silent.
if ! apt_get install -y python3-lgpio; then
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
apt_get install -y pigpio 2>/dev/null \
  || echo "  (no pigpio on this release — lgpio will drive the pins, which is expected on Trixie)"

# Deliberately NOT installed: python3-rpi.gpio.
#
# Raspberry Pi OS now preinstalls `python3-rpi-lgpio`, a shim that provides a
# module literally named RPi.GPIO on top of lgpio. The real python3-rpi.gpio
# package Conflicts with it, so asking for it here would *remove* the working
# shim and replace it with the legacy sysfs implementation — a downgrade on
# this board and a hard break on a Pi 5. The RPi.GPIO path in the firmware is a
# last resort for machines that already have it, not something to install.
apt_get install -y python3-segno || echo "  (segno unavailable — the label will show text instead of a QR)"
apt_get install -y python3-cryptography || echo "  (cryptography unavailable — cloud sync will be off; the device still dispenses)"

# NOT installed: anything at all for the screen.
#
# Neither panel needs a package, and that is deliberate rather than lucky. The
# usual answers — luma.oled, Adafruit's CircuitPython stack, Pillow for the
# drawing — are all pip-only, and pip cannot install system-wide on Trixie at
# all: PEP 668 marks the system Python externally-managed and refuses before it
# gets as far as the compiler Pillow would need.
#
# This is the lesson from the LED ring these panels replaced. The installer
# asked apt for `python3-rpi-ws281x`, which is not a package and never has been
# in any archive, swallowed the failure with a cheerful "(the LED ring will be
# skipped)", and shipped every device dark — with half the user interface of a
# machine that has no other way to say anything missing by default.
#
# So the firmware talks to both panels through the kernel's own device nodes
# and draws into a bytearray: /dev/spidev0.0 and /dev/i2c-1, both created by the
# two config.txt lines below. See snapcare_dispenser/display/.

CONFIG_TXT=/boot/firmware/config.txt
[[ -f $CONFIG_TXT ]] || CONFIG_TXT=/boot/config.txt

add_config_line() {
  local line="$1"
  if grep -qxF "$line" "$CONFIG_TXT"; then
    echo "  already set: $line"
    return
  fi
  echo "  adding to $CONFIG_TXT: $line"
  # Top up the trailing newline first.
  #
  # A plain append onto a file whose last line has no newline fuses the two:
  # `dtparam=audio=on` + `dtparam=spi=on` becomes `dtparam=audio=ondtparam=spi=on`,
  # which destroys the existing setting AND means SPI is never enabled — so the
  # LCD never comes up, while this script prints that it added the line. Worse,
  # `grep -qxF` cannot match either half of the fused line, so re-running never
  # repairs it. A stock image has the newline; a hand-edited config.txt often
  # does not, and this is exactly the file people hand-edit.
  if [[ -s $CONFIG_TXT ]] && [[ -n $(tail -c1 "$CONFIG_TXT") ]]; then
    echo >> "$CONFIG_TXT"
  fi
  echo "$line" >> "$CONFIG_TXT"
  NEEDS_REBOOT=1
}

say "Enabling SPI and I2C (the two panels)"
# /dev/spidev0.0 is the whole dependency for the LCD. SCK is GPIO 11, MOSI
# GPIO 10 and CE0 GPIO 8, none of which is a free choice — they are the pins the
# peripheral shifts out of. DC and RESET are ordinary GPIOs, 25 and 18.
add_config_line "dtparam=spi=on"
# And /dev/i2c-1 for the OLED, on GPIO 2/3. Unconditional, unlike before: this
# line used to be added only on a DS3231 build, so the backup panel on a DS1302
# machine had no bus and the screen stayed blank with nothing to explain it.
add_config_line "dtparam=i2c_arm=on"
# A no-op on a board whose core clock does not scale, and insurance on one that
# does: the SPI baud rate is divided down from the core clock, so a core clock
# that halves under an idle governor halves the frame rate with it — 38 ms to
# paint a screen becomes 76, which is a visible wipe rather than a change.
add_config_line "core_freq_min=400"

case "$RTC_KIND" in
  ds3231)
    say "Enabling the DS3231 real-time clock"
    # The kernel reads the chip and sets the system clock before userspace
    # starts — earlier and more reliably than any Python could — so the device
    # knows the time after a power cut with no network at all.
    #
    # The bus itself is already on, from the panel section above. Asserted again
    # rather than assumed: this branch has to keep working if the screen is ever
    # taken out, and `add_config_line` just says "already set".
    add_config_line "dtparam=i2c_arm=on"
    add_config_line "dtoverlay=i2c-rtc,ds3231"

    # fake-hwclock restores the time the Pi was last shut down at. That is
    # better than nothing on a Pi with no RTC and actively harmful on one whose
    # kernel has just applied a good RTC time: it overwrites the correct time
    # with a stale one during boot.
    if systemctl list-unit-files 2>/dev/null | grep -q '^fake-hwclock'; then
      say "Disabling fake-hwclock (the DS3231 supersedes it)"
      systemctl disable --now fake-hwclock 2>/dev/null || true
    fi
    ;;
  ds1302)
    say "Real-time clock: DS1302 on GPIO 16/20/21"
    echo "  Nothing to configure. The DS1302 has no kernel driver, so there is"
    echo "  no I2C, no device-tree overlay and no /dev/rtc0 — the firmware"
    echo "  bit-bangs the three wires and sets the clock itself at startup."
    echo
    echo "  fake-hwclock is left enabled on purpose. Nothing competes with it"
    echo "  here, and it gives early boot a plausible timestamp before the"
    echo "  firmware reads the chip. The dispenser never trusts it: only NTP,"
    echo "  the chip, or a phone can vouch for the clock."
    ;;
  none)
    say "No real-time clock configured"
    echo "  This device will refuse to dispense until NTP synchronises or a"
    echo "  phone sets its clock, and will refuse again after every power cut"
    echo "  that outlasts the router. Fit a DS1302 if that is not acceptable."
    ;;
esac

say "Copying the firmware to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cp -r "$here/snapcare_dispenser" "$INSTALL_DIR/"
cp "$here/README.md" "$INSTALL_DIR/" 2>/dev/null || true
find "$INSTALL_DIR" -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true

say "Creating $STATE_DIR"
mkdir -p "$STATE_DIR"
chmod 750 "$STATE_DIR"

say "Installing the snapcare-dispenser command"
# Without this, every command in the guide and the README fails after a reboot.
#
# The firmware lives in /opt/snapcare, which is not on Python's path. The unit
# puts it there with `Environment=PYTHONPATH=/opt/snapcare`, and this script's
# own closing heredoc does it with sys.path.insert — but neither of those helps
# somebody who reboots as instructed, logs back in at ~, and runs the printed
#
#     sudo python3 -m snapcare_dispenser --show-qr
#
# which is how the permanent WiFi QR gets printed, and therefore the only way
# onto the no-keyboard join path. It answered "No module named
# snapcare_dispenser" every time.
cat > /usr/local/bin/snapcare-dispenser <<EOF
#!/bin/sh
# Written by the SnapCare dispenser installer. The firmware is not pip-installed
# and $INSTALL_DIR is not on Python's default path, so this supplies it.
exec env PYTHONPATH="$INSTALL_DIR" /usr/bin/python3 -m snapcare_dispenser "\$@"
EOF
chmod 755 /usr/local/bin/snapcare-dispenser
echo "  /usr/local/bin/snapcare-dispenser -> python3 -m snapcare_dispenser"

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
systemctl enable avahi-daemon
# restart, not `enable --now`: on an already-running daemon `--now` is a no-op,
# so avahi carries on publishing whatever hostname it started with. A first run
# gets away with it because the config.txt edits force a reboot; a re-run over an
# existing card does not, and the web app's DEFAULT_HOST then resolves to
# nothing.
systemctl restart avahi-daemon

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
  say "A REBOOT IS NEEDED before the screen lights up"
  echo "  Lines were added to $CONFIG_TXT and the kernel only reads it at boot."
  echo "      sudo reboot"
  echo
  echo "  After rebooting, check the two buses the panels need. The LCD:"
  echo "      ls -l /dev/spidev0.0"
  echo "  and the OLED, which must answer at 0x3c:"
  echo "      ls -l /dev/i2c-1 && i2cdetect -y 1"
  echo "  (i2cdetect comes from i2c-tools, which only a DS3231 build installs —"
  echo "   the device node being there is the part that matters.)"
  if [[ $RTC_KIND == ds3231 ]]; then
    echo "  And that the kernel found the clock chip:"
    echo "      ls -l /dev/rtc0 && sudo hwclock -r"
    echo "  Once the Pi has the right time, write it to the RTC:"
    echo "      sudo hwclock --systohc"
  fi
fi

if [[ $RTC_KIND == ds1302 ]]; then
  echo
  echo "  The DS1302 has no /dev/rtc0 and hwclock cannot see it — that is"
  echo "  expected, not a fault. Ask the firmware instead:"
  echo "      curl -s http://localhost/api/status | python3 -m json.tool | grep -A6 '\"rtc\"'"
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

    sudo snapcare-dispenser --show-qr

Check it is running:

    systemctl status snapcare-dispenser
    journalctl -u snapcare-dispenser -f
""")
PY

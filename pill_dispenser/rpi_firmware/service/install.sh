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
#   pigpio           DMA-timed servo pulses. Without it the fallback is Python
#                    software PWM, which makes the servos buzz audibly at rest.
#   avahi-daemon     publishes pilldispenser.local, which is the exact name
#                    lib/hardware/dispenser.ts in the web app looks for.
#   python3-segno    draws the setup QR. Optional — everything works without it
#                    except the printed label, which falls back to plain text.
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
# python3-segno is not in every suite; the firmware works without it, so a
# failure to find it must not abort an otherwise good install.
apt-get install -y pigpio avahi-daemon python3
apt-get install -y python3-segno || echo "  (segno unavailable — the label will show text instead of a QR)"

say "Copying the firmware to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cp -r "$here/snapcare_dispenser" "$INSTALL_DIR/"
cp "$here/README.md" "$INSTALL_DIR/" 2>/dev/null || true
find "$INSTALL_DIR" -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true

say "Creating $STATE_DIR"
mkdir -p "$STATE_DIR"
chmod 750 "$STATE_DIR"

say "Enabling pigpiod (steady servo pulses)"
systemctl enable --now pigpiod

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

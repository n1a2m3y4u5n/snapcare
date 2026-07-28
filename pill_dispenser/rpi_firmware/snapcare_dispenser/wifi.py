"""Talking to the WiFi, through NetworkManager.

Everything here shells out to `nmcli`. That is a deliberate choice over editing
`wpa_supplicant.conf` or driving `hostapd` and `dnsmasq` directly, for three
reasons that all became visible while building this:

  * Raspberry Pi OS has used NetworkManager by default since Bookworm, so
    hand-written wpa_supplicant files are either ignored or fight with it.
  * `ipv4.method shared` gives DHCP, DNS forwarding and NAT on the hotspot for
    free, from NetworkManager's own dnsmasq. Doing it by hand is two more
    packages, two more config files, two more services to sequence at boot, and
    two more things to be wrong on a device with no screen.
  * `nmcli` is a stable, documented, text interface. D-Bus would be tidier in
    principle and is a much larger surface to get wrong in a firmware that has
    to work unattended.

Every call has a timeout and every failure is a return value. There is no path
here that raises into the scheduler: the dispenser must keep dropping pills
through a WiFi outage, because the medication does not care about the network.
"""
from __future__ import annotations

import logging
import subprocess
from dataclasses import dataclass
from pathlib import Path

from . import config
from .provisioning import Identity

log = logging.getLogger(__name__)

#: The AP profile's name in NetworkManager. Stable so it can be brought up and
#: down repeatedly instead of accumulating a new profile on every boot.
AP_CONNECTION = "snapcare-setup"

#: Where NetworkManager reads extra options for the dnsmasq it runs on shared
#: connections. Dropping a wildcard in here is what makes the captive portal
#: pop up by itself.
DNSMASQ_SHARED_DIR = Path("/etc/NetworkManager/dnsmasq-shared.d")
PORTAL_DNS_CONF = DNSMASQ_SHARED_DIR / "snapcare-portal.conf"


@dataclass
class Network:
    ssid: str
    signal: int          # 0..100
    security: str        # '' means open
    saved: bool = False

    def to_json(self) -> dict:
        return {"ssid": self.ssid, "signal": self.signal,
                "security": self.security, "open": not self.security,
                "saved": self.saved}


@dataclass
class Status:
    #: 'connected' | 'hotspot' | 'disconnected' | 'unavailable'
    mode: str
    ssid: str | None = None
    address: str | None = None
    detail: str = ""

    @property
    def online(self) -> bool:
        return self.mode == "connected"

    def to_json(self) -> dict:
        return {"mode": self.mode, "ssid": self.ssid,
                "address": self.address, "detail": self.detail}


# ── running nmcli ───────────────────────────────────────────────────────────

def _nmcli(*args: str, timeout: int = 30) -> subprocess.CompletedProcess | None:
    """Run nmcli. None means it is not installed or did not answer in time."""
    try:
        return subprocess.run(
            ["nmcli", *args], capture_output=True, text=True,
            timeout=timeout, check=False,
        )
    except FileNotFoundError:
        return None
    except (OSError, subprocess.SubprocessError) as exc:
        log.warning("nmcli %s failed: %s", " ".join(args), exc)
        return None


def available() -> bool:
    result = _nmcli("--version", timeout=5)
    return result is not None and result.returncode == 0


def _split_terse(line: str) -> list[str]:
    r"""Split one `nmcli -t` line on unescaped colons.

    Terse output is colon-separated with `\:` and `\\` escaped inside fields.
    A naive `line.split(':')` works right up until somebody's network is called
    "Guest:2G" — and then it silently reads that as two fields and the SSID the
    user taps is not the one that gets joined.
    """
    fields, current, escaped = [], [], False
    for char in line:
        if escaped:
            current.append(char)
            escaped = False
        elif char == "\\":
            escaped = True
        elif char == ":":
            fields.append("".join(current))
            current = []
        else:
            current.append(char)
    fields.append("".join(current))
    return fields


# ── looking around ──────────────────────────────────────────────────────────

def saved_ssids() -> set[str]:
    """SSIDs NetworkManager already has credentials for, minus our own hotspot."""
    result = _nmcli("-t", "-f", "NAME,TYPE", "connection", "show")
    if result is None or result.returncode != 0:
        return set()

    out = set()
    for line in result.stdout.splitlines():
        parts = _split_terse(line)
        if len(parts) >= 2 and parts[1] == "802-11-wireless" and parts[0] != AP_CONNECTION:
            out.add(parts[0])
    return out


def scan(rescan: bool = True) -> list[Network]:
    """Nearby networks, strongest first.

    Duplicates are collapsed by SSID keeping the strongest reading — a mesh or
    a dual-band router shows the same name several times, and a setup page that
    lists "BT-HOMEHUB" four times looks broken to the person using it.
    """
    args = ["-t", "-f", "SSID,SIGNAL,SECURITY", "device", "wifi", "list",
            "ifname", config.WIFI_INTERFACE]
    if rescan:
        args.append("--rescan")
        args.append("yes")

    # A scan asks the radio to sweep every channel, which takes several seconds
    # and cannot be hurried.
    result = _nmcli(*args, timeout=45)
    if result is None or result.returncode != 0:
        return []

    known = saved_ssids()
    best: dict[str, Network] = {}
    for line in result.stdout.splitlines():
        parts = _split_terse(line)
        if len(parts) < 3:
            continue
        ssid = parts[0].strip()
        if not ssid:
            continue  # a hidden network; there is nothing to show or tap
        try:
            signal = int(parts[1])
        except ValueError:
            signal = 0
        network = Network(ssid=ssid, signal=signal, security=parts[2].strip(),
                          saved=ssid in known)
        if ssid not in best or signal > best[ssid].signal:
            best[ssid] = network

    return sorted(best.values(), key=lambda n: n.signal, reverse=True)


def status() -> Status:
    """What the WiFi is doing right now."""
    if not available():
        return Status(mode="unavailable",
                      detail="NetworkManager is not installed on this machine")

    result = _nmcli("-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device", "status")
    if result is None or result.returncode != 0:
        return Status(mode="unavailable", detail="nmcli did not answer")

    for line in result.stdout.splitlines():
        parts = _split_terse(line)
        if len(parts) < 4 or parts[0] != config.WIFI_INTERFACE:
            continue
        state, connection = parts[2], parts[3]
        if state != "connected":
            return Status(mode="disconnected", detail=state)
        if connection == AP_CONNECTION:
            return Status(mode="hotspot", ssid=_ap_ssid(), address=config.AP_ADDRESS)
        return Status(mode="connected", ssid=connection, address=_address())

    return Status(mode="unavailable",
                  detail=f"no interface called {config.WIFI_INTERFACE}")


def _ap_ssid() -> str | None:
    result = _nmcli("-t", "-f", "802-11-wireless.ssid", "connection", "show", AP_CONNECTION)
    if result is None or result.returncode != 0:
        return None
    parts = _split_terse(result.stdout.strip())
    return parts[1] if len(parts) >= 2 else None


def _address() -> str | None:
    result = _nmcli("-t", "-f", "IP4.ADDRESS", "device", "show", config.WIFI_INTERFACE)
    if result is None or result.returncode != 0:
        return None
    for line in result.stdout.splitlines():
        parts = _split_terse(line)
        if len(parts) >= 2 and parts[1]:
            return parts[1].split("/")[0]
    return None


# ── joining a network ───────────────────────────────────────────────────────

def connect(ssid: str, password: str | None, timeout: int = 45) -> tuple[bool, str]:
    """Join a network. Returns (ok, a sentence to show the person).

    The hotspot is taken down first. One radio cannot be an access point and a
    client on two different channels at once; leaving the AP up makes the join
    fail in a way whose error message is about the driver rather than about
    anything the person did.
    """
    if not available():
        return False, "NetworkManager is not available on this device"

    stop_hotspot()

    args = ["device", "wifi", "connect", ssid, "ifname", config.WIFI_INTERFACE]
    if password:
        args += ["password", password]

    result = _nmcli(*args, timeout=timeout)
    if result is None:
        return False, "the network manager did not respond"
    if result.returncode == 0:
        log.info("joined %s", ssid)
        return True, f"Connected to {ssid}."

    message = (result.stderr or result.stdout).strip().splitlines()
    detail = message[-1] if message else f"exit {result.returncode}"

    # NetworkManager reports a rejected passphrase as a generic activation
    # failure, and "Secrets were required" is the only reliable tell. Getting
    # this wrong means telling somebody their router is broken when they have
    # simply mistyped a password, which is the single most likely thing to go
    # wrong in this entire flow.
    if "secrets were required" in detail.lower() or "802-1x" in detail.lower():
        detail = "The password was not accepted."

    log.warning("could not join %s: %s", ssid, detail)
    return False, detail


def forget(ssid: str) -> bool:
    result = _nmcli("connection", "delete", ssid)
    return result is not None and result.returncode == 0


def has_known_network() -> bool:
    """Is there anything saved to come back up on, other than our own hotspot?"""
    return bool(saved_ssids())


# ── being an access point ───────────────────────────────────────────────────

def ensure_captive_dns() -> bool:
    """Point every DNS name at the device while the hotspot is up.

    This one line is what makes the captive portal open by itself:

        address=/#/10.42.0.1

    A phone that joins a network immediately fetches a known URL to check
    whether it has internet — `captive.apple.com` on iOS, a `generate_204` on
    Android. With this wildcard those lookups resolve to the Pi, the Pi answers
    with a redirect instead of what the phone expected, and the phone concludes
    it is behind a captive portal and opens the setup page in a sheet. Without
    it the phone joins, silently reports "no internet", and the person is left
    holding a device that gave no sign of what to do next.

    NetworkManager reads this directory for the dnsmasq it starts on shared
    connections. Returns False if the file could not be written — the portal
    still works, but only if somebody navigates to the address themselves,
    which is why the printed label carries that URL as a second QR.
    """
    try:
        DNSMASQ_SHARED_DIR.mkdir(parents=True, exist_ok=True)
        PORTAL_DNS_CONF.write_text(
            "# Written by the SnapCare dispenser firmware.\n"
            "# Resolves every name to the device while its setup hotspot is up,\n"
            "# so a phone's captive-portal check lands on the setup page.\n"
            f"address=/#/{config.AP_ADDRESS}\n",
            encoding="utf-8",
        )
        return True
    except OSError as exc:
        log.warning("could not write the captive portal DNS rule (%s)", exc)
        return False


def start_hotspot(identity: Identity) -> tuple[bool, str]:
    """Raise the setup access point with this device's permanent credentials."""
    if not available():
        return False, "NetworkManager is not available on this device"

    ensure_captive_dns()

    # Rebuilt from scratch each time rather than reused. It is cheap, and it
    # means a profile left half-configured by an interrupted earlier run cannot
    # produce a hotspot with the wrong passphrase — which would be a device
    # whose printed QR no longer works, with no way to find out why.
    _nmcli("connection", "delete", AP_CONNECTION)

    created = _nmcli(
        "connection", "add",
        "type", "wifi",
        "ifname", config.WIFI_INTERFACE,
        "con-name", AP_CONNECTION,
        # Never on its own. The AP must come up only when this firmware asks,
        # or a device that is perfectly happy on the home network will raise a
        # competing hotspot at every boot and drop off the network doing it.
        "autoconnect", "no",
        "ssid", identity.ssid,
    )
    if created is None or created.returncode != 0:
        return False, _explain(created, "could not create the hotspot profile")

    modified = _nmcli(
        "connection", "modify", AP_CONNECTION,
        "802-11-wireless.mode", "ap",
        # A Pi 3B's radio is 2.4 GHz only. Saying so stops NetworkManager
        # trying a 5 GHz channel and failing with a driver-level error.
        "802-11-wireless.band", "bg",
        "802-11-wireless.channel", "6",
        "wifi-sec.key-mgmt", "wpa-psk",
        "wifi-sec.psk", identity.passphrase,
        # 'shared' is what brings up DHCP and DNS for whoever joins.
        "ipv4.method", "shared",
        "ipv6.method", "ignore",
    )
    if modified is None or modified.returncode != 0:
        return False, _explain(modified, "could not configure the hotspot")

    up = _nmcli("connection", "up", AP_CONNECTION, timeout=45)
    if up is None or up.returncode != 0:
        return False, _explain(up, "could not start the hotspot")

    log.info("setup hotspot %s is up on %s", identity.ssid, config.AP_ADDRESS)
    return True, identity.ssid


def stop_hotspot() -> bool:
    result = _nmcli("connection", "down", AP_CONNECTION, timeout=20)
    return result is not None and result.returncode == 0


def _explain(result: subprocess.CompletedProcess | None, fallback: str) -> str:
    if result is None:
        return fallback
    detail = (result.stderr or result.stdout).strip().splitlines()
    return detail[-1] if detail else fallback

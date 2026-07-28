"""Everything you are likely to want to change, in one file.

If you are wiring a tray and need to move a servo to a different pin, the map
at the top of this file is the only thing you have to edit. Nothing else in the
firmware names a pin number.

Values can also be overridden at runtime without editing this file, which is
what the systemd unit does:

    SNAPCARE_TRAY_GPIO="1=17,2=27,3=22"   # partial or complete map
    SNAPCARE_STATE_DIR=/var/lib/snapcare
    SNAPCARE_HTTP_PORT=8080
    SNAPCARE_SERVO_BACKEND=mock           # pigpio | rpigpio | mock | auto

The environment wins, because a bench setup should not need a patched file that
somebody later commits by accident.
"""
from __future__ import annotations

import os
from pathlib import Path

# ═══════════════════════════════════════════════════════════════════════════
#  THE PIN MAP  —  edit this
# ═══════════════════════════════════════════════════════════════════════════
#
# Tray number (what the schedule and the app call a "slot") -> Raspberry Pi
# GPIO number, **BCM numbering**, which is what pigpio and RPi.GPIO both use.
# BCM 17 is physical header pin 11; run `pinout` on the Pi for the full map.
#
# The tray is the unit the whole system talks in: `SC1*W*3:1900-021-000` means
# tray 3, and tray 3 is whatever pin this dict says it is. Change a line here
# and the schedule, the API, the web page and the paper form sheet all follow.
#
# Why these eight pins, on a Pi 3B:
#
#   - GPIO 0/1  are reserved for the HAT ID EEPROM. Driving them is how you
#     make a Pi fail to detect a HAT you plug in later.
#   - GPIO 2/3  have permanent 1.8 kΩ pull-ups to 3.3 V for I²C. A servo signal
#     line that idles high before the software starts is a servo that slams to
#     one end at power-on, with a tray full of pills on it.
#   - GPIO 14/15 are the serial console. Fine if you disable it, but then you
#     lose the one way to log into a Pi whose network setup you just broke.
#   - GPIO 7/8/9/10/11 are SPI, free unless you add an SPI display.
#
# The eight below avoid all of that, are contiguous enough to keep the ribbon
# tidy, and none of them is a boot-strapping pin.

TRAY_GPIO: dict[int, int] = {
    1: 17,
    2: 27,
    3: 22,
    4: 5,
    5: 6,
    6: 13,
    7: 19,
    8: 26,
}

# The hardware ceiling. The protocol allows slot numbers up to 99 and the paper
# form sheet up to 8; accepting a tray the machine does not have is a way to
# take a dose off a prescription and never dispense it, so both this and the
# parser refuse rather than ignore.
MAX_TRAYS = 8


# ═══════════════════════════════════════════════════════════════════════════
#  SERVO MOTION
# ═══════════════════════════════════════════════════════════════════════════
#
# One pill drop is: rest at 0°, sweep to 180°, sweep back to 0°. The servo needs
# 0.5 s to cross from one end to the other, so a drop takes about a second.

#: Pulse width in microseconds at 0° — the resting position.
SERVO_MIN_US = 500
#: Pulse width in microseconds at 180° — the far end of the drop stroke.
SERVO_MAX_US = 2500

#: Seconds to allow for one traverse. The servo is not told when it has
#: arrived — nothing on an SG90 reports position — so this is an open-loop wait
#: and must be generous enough for the *slowest* case: a cold servo under the
#: weight of a full tray. 0.5 s is the figure from the hardware spec.
SERVO_TRAVEL_S = 0.5

#: Extra pause at the far end before coming back. A hopper that has just been
#: tipped is still moving; returning the instant it arrives can catch a pill
#: half-way through the gate. Zero is valid and makes the drop a clean sweep.
SERVO_DWELL_S = 0.15

#: Per-tray trim, for a servo whose mechanical zero is not the electrical one.
#: `{3: (520, 2450)}` overrides only tray 3. Leave empty unless a tray is
#: visibly not reaching its stop, or is buzzing because it is being driven past
#: it — the second is what burns out a servo over a few weeks.
SERVO_TRIM: dict[int, tuple[int, int]] = {}

#: Which driver to use. "auto" tries pigpio, then RPi.GPIO, then the mock.
#:
#: pigpio is strongly preferred: it times pulses with the DMA controller, so
#: Linux scheduling jitter cannot reach them. RPi.GPIO's software PWM is timed
#: by a Python thread, and every time the kernel preempts that thread the servo
#: twitches and hums. On a device that sits in a bedroom overnight, that is not
#: a cosmetic difference.
SERVO_BACKEND = os.environ.get("SNAPCARE_SERVO_BACKEND", "auto")


# ═══════════════════════════════════════════════════════════════════════════
#  SCHEDULING
# ═══════════════════════════════════════════════════════════════════════════

#: How long after its scheduled time a dose may still be dispensed.
#:
#: Outside this window the dose is reported as missed and the tray stays shut.
#: Both halves matter. A device unplugged all day must not, on being plugged
#: back in, drop breakfast, lunch and dinner into one hand — that is an
#: overdose. And it must not drop them silently either, because "no pills came
#: out today" is exactly what the person's carer needs to be told.
GRACE_MINUTES = 60

#: Seconds between scheduler ticks. Doses are specified to the minute, so this
#: only needs to be comfortably under 60; smaller just wastes wakeups.
TICK_SECONDS = 15

#: How long the green light / chime stays up waiting for the person to confirm
#: they took the dose. After this the event is recorded as taken anyway — the
#: pills are physically in the cup, and calling that "missed" would make the
#: log lie in the more dangerous direction.
CONFIRM_TIMEOUT_S = 15 * 60


# ═══════════════════════════════════════════════════════════════════════════
#  CLOCK
# ═══════════════════════════════════════════════════════════════════════════

#: Refuse to dispense until the wall clock has been vouched for.
#:
#: A Raspberry Pi has **no real-time clock and no battery**. Unlike the DS3231
#: on the Arduino build, which at least kept time on a coin cell, a Pi that
#: boots without a network does not report *no* time — it reports whatever the
#: filesystem last recorded, confidently. A tray acting on that opens
#: compartments at the wrong hours and looks perfectly healthy doing it.
#:
#: So time has to come from somewhere trustworthy: NTP once the WiFi is up, or
#: an explicit `SC1*C*` / `POST /api/clock` from the phone. Until then the tray
#: stays shut. A tray that does not open is a problem someone notices.
REQUIRE_TRUSTED_CLOCK = True

#: A clock earlier than this is certainly wrong — it is before this firmware
#: was written, so no correct clock can read it.
CLOCK_SANITY_EPOCH = "2026-01-01T00:00:00"


# ═══════════════════════════════════════════════════════════════════════════
#  NETWORK
# ═══════════════════════════════════════════════════════════════════════════

#: mDNS name the device answers to. `lib/hardware/dispenser.ts` in the web app
#: has this exact string as its DEFAULT_HOST, so changing it means changing the
#: app too.
MDNS_HOSTNAME = os.environ.get("SNAPCARE_MDNS_HOSTNAME", "pilldispenser")

#: Port the device's own web server listens on. 80 needs root or a capability;
#: the systemd unit grants CAP_NET_BIND_SERVICE rather than running as root.
HTTP_PORT = int(os.environ.get("SNAPCARE_HTTP_PORT", "80"))

#: SSID prefix for the setup hotspot. The suffix is derived from the board, so
#: the full name — and therefore the printed QR code — is the same on every
#: boot for the life of the device. See provisioning.py.
AP_SSID_PREFIX = "SnapCare"

#: Address the Pi gives itself in hotspot mode. NetworkManager's shared mode
#: uses 10.42.0.1 by default; the captive portal has to know it to answer DNS
#: with it.
AP_ADDRESS = "10.42.0.1"

#: WiFi interface. `wlan0` on every Pi 3B; here so a USB adapter can be used.
WIFI_INTERFACE = os.environ.get("SNAPCARE_WIFI_IFACE", "wlan0")

#: How long to wait for a known network at boot before giving up and raising
#: the setup hotspot. A Pi 3B associates in 5-10 s on a healthy network; 45 s
#: covers a router that is itself still booting after a power cut, which is the
#: common case, since the two are usually on the same failed socket.
WIFI_JOIN_TIMEOUT_S = 45


# ═══════════════════════════════════════════════════════════════════════════
#  STORAGE
# ═══════════════════════════════════════════════════════════════════════════

#: Where the schedule, the scheduler's memory of what has already been
#: dispensed, and the event log live. Must survive a power cut: that memory is
#: the only thing standing between a reboot and a second breakfast dose.
STATE_DIR = Path(os.environ.get("SNAPCARE_STATE_DIR", "/var/lib/snapcare"))

SCHEDULE_FILE = STATE_DIR / "schedule.json"
SCHEDULER_STATE_FILE = STATE_DIR / "scheduler.json"
EVENT_LOG_FILE = STATE_DIR / "events.jsonl"
IDENTITY_FILE = STATE_DIR / "identity.json"

#: Events kept in the log. One dose is one line; eight trays three times a day
#: is 24 a day, so this is about four months of history in a file small enough
#: to read whole into a 1 GB Pi.
EVENT_LOG_LIMIT = 3000


def tray_gpio() -> dict[int, int]:
    """The pin map, with `SNAPCARE_TRAY_GPIO` applied over it.

    The variable is `tray=gpio` pairs: `SNAPCARE_TRAY_GPIO="1=17,2=27"`. It
    patches rather than replaces, so moving one servo on the bench does not
    silently unconfigure the other seven.
    """
    pins = dict(TRAY_GPIO)
    raw = os.environ.get("SNAPCARE_TRAY_GPIO", "").strip()
    if raw:
        for pair in raw.split(","):
            tray_text, _, gpio_text = pair.partition("=")
            pins[int(tray_text.strip())] = int(gpio_text.strip())

    for tray, gpio in pins.items():
        if not 1 <= tray <= MAX_TRAYS:
            raise ValueError(f"tray {tray} is outside the {MAX_TRAYS}-tray machine")
        if not 0 <= gpio <= 27:
            raise ValueError(f"GPIO {gpio} for tray {tray} is not a Pi 3B BCM pin")

    # Two trays on one pin means one of them moves the wrong hopper, and the
    # symptom is the right number of pills from the wrong compartment — which
    # nobody notices until the wrong medication has been taken for a week.
    seen: dict[int, int] = {}
    for tray, gpio in sorted(pins.items()):
        if gpio in seen:
            raise ValueError(
                f"GPIO {gpio} is assigned to both tray {seen[gpio]} and tray {tray}"
            )
        seen[gpio] = tray

    return pins


def servo_range(tray: int) -> tuple[int, int]:
    """Pulse widths for this tray's 0° and 180°, with any trim applied."""
    return SERVO_TRIM.get(tray, (SERVO_MIN_US, SERVO_MAX_US))

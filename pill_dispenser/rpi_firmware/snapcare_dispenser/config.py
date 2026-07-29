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

# The firmware ceiling. The protocol allows slot numbers up to 99 and the paper
# form sheet up to 8; accepting a tray the machine does not have is a way to
# take a dose off a prescription and never dispense it, so both this and the
# parser refuse rather than ignore.
MAX_TRAYS = 8

#: How many hoppers are actually fitted to *this* machine.
#:
#: The contest unit is built with three. The map above still lists all eight,
#: because scaling up should be changing this number and plugging in servos —
#: not rediscovering which pins were safe to use.
#:
#: This is not cosmetic. A tray that is planned for but not fitted is a dose
#: that is scheduled, never dispensed, and reported by nothing: the servo is
#: simply absent, so there is no jam to detect and no error to raise. Trimming
#: the map here means such a schedule is refused when it arrives, by name, while
#: somebody is still looking at the screen that sent it.
#:
#:     SNAPCARE_TRAYS=8 python3 -m snapcare_dispenser
INSTALLED_TRAYS = int(os.environ.get("SNAPCARE_TRAYS", "3"))


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
#  WHAT THE PERSON SEES AND HEARS
# ═══════════════════════════════════════════════════════════════════════════
#
# A light and a sound, never text. That is the founding constraint of the whole
# project: the person cannot be assumed to read.
#
# Both are fitted on this build, and the pairing is the point. A ring alone
# only works if somebody happens to be looking at it, and the confirm button is
# useless if nobody knows there is anything to confirm — so the chirp is what
# actually fetches a person from another room, and the colour is what tells
# them what is going on once they arrive.

#: WS2812 / NeoPixel ring data line. **Must be GPIO 18, 12, 21 or 10** — the
#: driver generates the 800 kHz waveform with the PWM or PCM peripheral, and
#: those are the only pins wired to them. GPIO 18 (PWM0) is the usual choice and
#: is not in the servo map above.
#:
#: Through a 330 Ω resistor, placed close to the ring. The resistor is not
#: optional folklore: it damps the reflection on the first data edge, which is
#: what makes the first pixel latch a wrong colour on a long lead.
RING_GPIO = 18

#: How many pixels. A 12-pixel ring is the common part; 16 and 24 also fit.
RING_PIXELS = 12

#: 0..255. Full brightness on a 12-pixel ring is both dazzling in a dark
#: bedroom at 3 a.m. and about 700 mA, which is a second servo's worth of
#: current on the same rail.
RING_BRIGHTNESS = 60

#: Piezo buzzer, through 100 Ω. Any free GPIO — the tone is generated by pigpio,
#: so this does not need a hardware PWM pin.
BUZZER_GPIO = 23

#: The chirp: frequency in Hz, and how long each beep lasts.
#:
#: 2.7 kHz is where a small piezo element is loudest, and it is also where
#: age-related hearing loss has bitten least compared with anything higher.
BUZZER_HZ = 2700
BUZZER_BEEP_S = 0.12

#: Seconds between chirps while a dose is waiting to be confirmed.
#:
#: Long enough not to be maddening, short enough that somebody in the next room
#: hears it again before they have forgotten the first one. It stops the moment
#: the button is pressed.
BUZZER_REPEAT_S = 20


# ═══════════════════════════════════════════════════════════════════════════
#  THE CONFIRM BUTTON
# ═══════════════════════════════════════════════════════════════════════════

#: Momentary button between this pin and GND. The internal pull-up is enabled
#: in software, so no external resistor is needed — two wires and nothing else.
BUTTON_GPIO = 24

#: Debounce, in microseconds. A mechanical button bounces for a few hundred
#: microseconds to a couple of milliseconds, and every bounce is an edge;
#: without this one press records several doses.
BUTTON_DEBOUNCE_US = 20_000


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
#: A Raspberry Pi has no real-time clock of its own. A Pi that boots without a
#: network does not report *no* time — `fake-hwclock` restores whatever was last
#: written to disk, confidently, so a device unplugged on Friday evening comes
#: back on Tuesday believing it is Friday. A tray acting on that opens the
#: Mon/Wed/Fri compartment on a Tuesday and looks perfectly healthy doing it.
#:
#: This build fits a **DS3231**, which fixes it properly: a battery-backed clock
#: that keeps time through a power cut with no network at all. Three things can
#: now vouch for the time — the RTC, NTP, or an `SC1*C*` code from the phone —
#: and until one of them does, the tray stays shut. A tray that does not open is
#: a problem someone notices.
REQUIRE_TRUSTED_CLOCK = True

#: Trust the system clock when a healthy DS3231 is present.
#:
#: "Healthy" is a real check, not a presence check. The DS3231 has an oscillator
#: stop flag which latches if the chip ever lost both supply and battery — the
#: exact case where its time is meaningless. A dead coin cell does not make the
#: chip disappear; it makes it confidently wrong, which is the failure this
#: whole section exists to refuse. See rtc.py.
USE_RTC = True

#: I2C bus the DS3231 is on. Bus 1 is GPIO 2 (SDA) and GPIO 3 (SCL) — the
#: header pins every Pi since the Model B rev 2 uses, and the reason those two
#: are kept out of the servo map.
RTC_I2C_BUS = 1
RTC_I2C_ADDRESS = 0x68

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
#  CLOUD SYNC
# ═══════════════════════════════════════════════════════════════════════════
#
# The device holds one outbound connection to a relay so that a schedule edited
# in the web app arrives without anybody being on the same WiFi. Outbound and
# HTTPS on purpose: a home router will not forward a port to a dispenser, and
# should not be asked to.
#
# Everything here is optional. With no relay configured the firmware behaves
# exactly as it did before — the schedule arrives over the LAN or off a paper
# sheet, and the local cache and the DS3231 keep the alarms running. Cloud sync
# is an extra way *in*, never a dependency: a relay that is down, unreachable
# or never configured must not cost anybody a dose.

#: Base URL of the relay, e.g. https://snapcare-relay.fly.dev. Empty is off.
CLOUD_RELAY_URL = os.environ.get("SNAPCARE_RELAY_URL", "").strip().rstrip("/")

#: Master switch, separate from the URL so a device can be taken off the cloud
#: for a demo without losing the address it goes back to.
CLOUD_ENABLED = os.environ.get("SNAPCARE_CLOUD", "1").strip().lower() not in (
    "0", "false", "no", "off",
)

#: How long the relay holds a poll open before answering "nothing new".
#:
#: This is the whole responsiveness/cost trade-off in one number, and it is
#: worth being honest about which way it cuts. At 50 s the device is
#: effectively always connected and an edit in the app reaches it in about a
#: second — and the relay is therefore never idle, which on a host that stops
#: idle machines means it never stops. Raise CLOUD_IDLE_POLL_S instead if the
#: bill matters more than the latency.
#:
#: The ceiling is not ours: proxies and load balancers cut idle connections,
#: commonly at 60 s. Answering at 50 leaves the relay closing its own
#: connections tidily rather than having them cut underneath it, which is the
#: difference between a clean reconnect and a stack trace every minute.
CLOUD_HOLD_S = int(os.environ.get("SNAPCARE_CLOUD_HOLD_S", "50"))

#: Seconds to wait between polls once the device decides nothing is happening.
#:
#: Zero — the default — means "reconnect immediately", which is what makes sync
#: feel instant. Set it to 900 and the device checks every fifteen minutes
#: instead: the relay is then idle almost all the time and a machine that stops
#: when idle actually gets to stop. The cost is exactly what it looks like — an
#: edit made in the app can sit for fifteen minutes before the device hears it.
CLOUD_IDLE_POLL_S = int(os.environ.get("SNAPCARE_CLOUD_IDLE_S", "0"))

#: Backoff after a failed poll: first wait, ceiling, and the multiplier.
#:
#: A relay that is down is the normal case during a deploy, and every dispenser
#: in the world reconnecting on the same second afterwards is a thundering herd
#: that keeps it down. The jitter below is what spreads them out.
CLOUD_BACKOFF_MIN_S = 5
CLOUD_BACKOFF_MAX_S = 300
CLOUD_BACKOFF_FACTOR = 2.0

#: How much of the wait to randomise, 0..1. At 0.5 a computed 60 s wait becomes
#: a random 30-90 s.
CLOUD_BACKOFF_JITTER = 0.5

#: How often the device republishes its state even when nothing has changed.
#:
#: This is what makes the app able to say "last heard from, four minutes ago"
#: rather than "connected" forever. A device whose power has been pulled sends
#: nothing and looks identical to a healthy one otherwise — and "the dispenser
#: has been unplugged since Tuesday" is the single most useful thing a carer
#: can be told.
CLOUD_HEARTBEAT_S = 300

#: Seconds without a successful exchange before the status page calls the cloud
#: link down. Comfortably more than one heartbeat plus one backoff, so a single
#: missed poll is not reported as an outage.
CLOUD_STALE_S = 900

#: Largest response the device will read from the relay.
#:
#: The device trusts the relay to be a mailbox, not to be well-behaved. Without
#: a ceiling a compromised or simply broken relay could hand a Pi 3B a body
#: large enough to exhaust its memory, and a dispenser that has been OOM-killed
#: does not dispense. A schedule is a few hundred bytes.
CLOUD_MAX_BODY = 256 * 1024


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

#: The cloud client's memory: the last revision applied, and when the relay was
#: last reached. Its job is to stop a schedule being applied twice, and to stop
#: an *older* one being replayed over a newer one after a reboot.
CLOUD_STATE_FILE = STATE_DIR / "cloud.json"

#: Events kept in the log. One dose is one line; eight trays three times a day
#: is 24 a day, so this is about four months of history in a file small enough
#: to read whole into a 1 GB Pi.
EVENT_LOG_LIMIT = 3000


def tray_gpio(installed: int | None = None) -> dict[int, int]:
    """The pin map for the trays that are actually fitted.

    `SNAPCARE_TRAY_GPIO` patches it — `"1=17,2=27"` — rather than replacing it,
    so moving one servo on the bench does not silently unconfigure the rest.
    `SNAPCARE_TRAYS` decides how many of them exist.
    """
    pins = dict(TRAY_GPIO)
    raw = os.environ.get("SNAPCARE_TRAY_GPIO", "").strip()
    if raw:
        for pair in raw.split(","):
            tray_text, _, gpio_text = pair.partition("=")
            pins[int(tray_text.strip())] = int(gpio_text.strip())

    for tray, gpio in pins.items():
        if not 1 <= tray <= MAX_TRAYS:
            raise ValueError(f"tray {tray} is outside the {MAX_TRAYS}-tray firmware")
        if not 0 <= gpio <= 27:
            raise ValueError(f"GPIO {gpio} for tray {tray} is not a Pi 3B BCM pin")

    # Checked across the whole map, not just the fitted part. A clash on tray 6
    # is worth hearing about now, while somebody is editing this file — not in
    # six months when the sixth hopper is plugged in and the wrong one moves.
    #
    # Two trays on one pin gives the right number of pills from the wrong
    # compartment, and nobody notices that until the wrong medication has been
    # taken for a week.
    seen: dict[int, int] = {}
    for tray, gpio in sorted(pins.items()):
        if gpio in seen:
            raise ValueError(
                f"GPIO {gpio} is assigned to both tray {seen[gpio]} and tray {tray}"
            )
        seen[gpio] = tray

    count = INSTALLED_TRAYS if installed is None else installed
    if not 1 <= count <= MAX_TRAYS:
        raise ValueError(f"INSTALLED_TRAYS must be 1..{MAX_TRAYS}, not {count}")

    return {tray: gpio for tray, gpio in pins.items() if tray <= count}


def servo_range(tray: int) -> tuple[int, int]:
    """Pulse widths for this tray's 0° and 180°, with any trim applied."""
    return SERVO_TRIM.get(tray, (SERVO_MIN_US, SERVO_MAX_US))

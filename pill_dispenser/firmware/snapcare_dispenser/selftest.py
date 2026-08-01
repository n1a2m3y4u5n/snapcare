"""Commissioning: proving an assembled machine, one subsystem at a time.

    sudo systemctl stop snapcare-dispenser
    sudo snapcare-dispenser --selftest

What this replaces, and why
---------------------------
The assembly guide ends in a checklist of about twenty items and a page of
curls. That is a good checklist and it has a structural problem: **it is a list
of claims a person ticks, and most of the claims are not things a person can
actually observe.**

"Servos silent and cool a few seconds after a drop" is a real failure mode with
a real consequence, and it is unanswerable as a line on paper — by the time
somebody reads it they are three stages past the drop. "Every tray you fitted
moves" is ticked by a machine whose trays 1 and 2 are wired to each other's
pins, because both moved. And "the buzzer works" is ticked by an active buzzer
playing the wrong note, which is a device that chirps and is not the device this
firmware thinks it is talking through.

So this splits the job in two, which is the only thing that makes either half
trustworthy:

**Machine-checkable facts** are read out of the running firmware — which GPIO
driver came up, whether the RTC vouches for itself, whether the state directory
is writable by the user the service runs as. A person is never asked about
these, because a person cannot see them and will tick yes.

**Human-confirmed facts** are the ones only eyes and ears can settle. For those
the rule is: *never ask about something this program did not just make happen.*
It paints a dose for tray 3 on the screen and asks which tray the screen says —
by number, because "is there something on the screen" is a question a panel
mounted upside down passes. It drops tray 3 and asks which hopper moved, for the
same reason: that is the question a transposed pin map fails and "did a tray
move" is the one it passes. It chirps and asks whether that was a tone or a
click, because an active buzzer with its own oscillator makes a noise and not
*this* noise.

The report
----------
Written to the state directory as JSON and printed as text. A build that has
been commissioned has a file saying so, with the device's identity, the date,
what passed, and — the part a bare checklist cannot give you — **what was
skipped and why**. "Everything passed" and "everything anybody looked at
passed" are different sentences and only one of them is usually true.

Safety
------
This opens trays. On an assembled machine that means pills on the floor or in a
cup, so it says so first and will not touch a servo until somebody agrees. The
firmware must also not be running: it holds the GPIO lines and port 80, and two
processes driving one servo is the one case the single-servo lock cannot cover.
"""
from __future__ import annotations

import json
import platform
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from . import config, envelope, gpiochip, indicators, provisioning, rtc
from .button import TakeDoseButton
from .clock import Clock
from .display import screens
from .indicators import make_indicator
from .servo import TrayServos, make_backend
from .store import Store

PASS, FAIL, WARN, SKIP = "pass", "fail", "warn", "skip"


@dataclass
class Result:
    name: str
    outcome: str
    detail: str = ""
    #: What to do about it, when there is something to do.
    fix: str = ""

    @property
    def ok(self) -> bool:
        return self.outcome in (PASS, WARN, SKIP)


@dataclass
class Report:
    device: str = ""
    started: str = ""
    results: list[Result] = field(default_factory=list)

    def add(self, name: str, outcome: str, detail: str = "", fix: str = "") -> Result:
        result = Result(name, outcome, detail, fix)
        self.results.append(result)
        _say(result)
        return result

    @property
    def failures(self) -> list[Result]:
        return [r for r in self.results if r.outcome == FAIL]

    @property
    def skipped(self) -> list[Result]:
        return [r for r in self.results if r.outcome == SKIP]

    def to_json(self) -> dict:
        return {
            "device": self.device,
            "startedAt": self.started,
            "finishedAt": datetime.now().isoformat(timespec="seconds"),
            "firmware": platform.node(),
            "board": gpiochip.board_model() or "not a Raspberry Pi",
            "passed": not self.failures,
            "results": [{"name": r.name, "outcome": r.outcome,
                         "detail": r.detail, "fix": r.fix} for r in self.results],
        }


_MARK = {PASS: "  ok  ", FAIL: " FAIL ", WARN: " warn ", SKIP: " skip "}


def _say(result: Result) -> None:
    print(f"[{_MARK[result.outcome]}] {result.name}")
    if result.detail:
        print(f"           {result.detail}")
    if result.fix:
        print(f"           → {result.fix}")


def _ask(question: str, options: str = "y/n") -> str:
    """A question, answered or skipped. Empty input means skip, not yes.

    Deliberately. A default of yes on a commissioning question is a checklist
    that gets held down until it finishes, and the report would then record
    that somebody confirmed a colour they never looked at.
    """
    try:
        answer = input(f"        ?  {question} [{options}, or Enter to skip] ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print()
        return ""
    return answer


# ── the machine-checkable half ──────────────────────────────────────────────

def check_not_already_running(report: Report) -> bool:
    """The service must be stopped. Two processes, one servo, is not testable."""
    if not shutil.which("systemctl"):
        return True
    try:
        result = subprocess.run(["systemctl", "is-active", "snapcare-dispenser"],
                                capture_output=True, text=True, timeout=10, check=False)
    except (OSError, subprocess.SubprocessError):
        return True

    if result.stdout.strip() == "active":
        report.add(
            "the firmware is not already running", FAIL,
            "snapcare-dispenser is active, and it is holding the GPIO lines and "
            "port 80. Anything this test drove would be fighting it.",
            "sudo systemctl stop snapcare-dispenser",
        )
        return False
    report.add("the firmware is not already running", PASS)
    return True


def check_board(report: Report) -> None:
    model = gpiochip.board_model()
    if not model:
        report.add("running on a Raspberry Pi", WARN,
                   "this is not a Pi, so every hardware check below is a dry run",
                   "run this on the assembled device")
        return
    report.add("running on a Raspberry Pi", PASS, model)


def check_servo_backend(report: Report, backend) -> None:
    if not backend.moves_hardware:
        report.add("a GPIO driver came up", FAIL,
                   f"the servo backend is {backend.name!r}, which moves nothing",
                   "sudo apt install python3-lgpio")
        return

    detail = f"{backend.name} ({backend.quality}-timed pulses)"
    if backend.quality == "dma":
        report.add("a GPIO driver came up", PASS, detail)
    elif backend.quality == "threaded":
        # The expected answer on a current card, and worth stating plainly
        # rather than warning about: pigpio is not available to install.
        report.add("a GPIO driver came up", PASS, detail +
                   " — expected on Raspberry Pi OS Trixie, where pigpio is gone")
    else:
        report.add("a GPIO driver came up", WARN,
                   detail + " — the servos will twitch and hum between doses",
                   "sudo apt install python3-lgpio")


def check_pin_map(report: Report, servos: TrayServos) -> None:
    pins = servos.pins
    clashes = [t for t, g in pins.items()
               if g in (config.DISPLAY_DC_GPIO, config.DISPLAY_RESET_GPIO,
                        config.BUZZER_GPIO, config.RTC_SCLK_GPIO,
                        config.RTC_IO_GPIO, config.RTC_CE_GPIO)]
    if clashes:
        # Not theoretical: `SNAPCARE_TRAY_GPIO` exists so a bench can move a
        # servo, and moving one onto the screen's DC line is a tray that sweeps
        # every time a dose changes state.
        report.add("no tray shares a pin with a peripheral", FAIL,
                   f"tray(s) {clashes} are on a pin also used by the screen, "
                   "buzzer or RTC",
                   "check TRAY_GPIO and SNAPCARE_TRAY_GPIO in config.py")
        return
    report.add("no tray shares a pin with a peripheral", PASS,
               ", ".join(f"tray {t}=GPIO {g}" for t, g in sorted(pins.items())))


def check_tray_count(report: Report, servos: TrayServos, fitted: int | None) -> None:
    """How many hoppers are really on the machine.

    Left at the default, the firmware accepts all eight — which is right for a
    machine somebody will add to, and wrong for one being signed off: an absent
    servo cannot jam and has no error to raise, so a schedule naming a tray
    that is not there is a dose that is scheduled, never dispensed, and
    reported by nothing.
    """
    if fitted is None:
        report.add("the machine knows how many hoppers it has", WARN,
                   f"INSTALLED_TRAYS is {config.INSTALLED_TRAYS} (the default is all "
                   "eight), so a schedule for a tray that is not fitted will be "
                   "accepted and silently never dispensed",
                   "set SNAPCARE_TRAYS in the systemd unit to the number really fitted")
        return
    report.add("the machine knows how many hoppers it has", PASS,
               f"{fitted} fitted, of {len(servos.pins)} in the map")


def check_clock(report: Report) -> None:
    clock = Clock()
    clock.adopt_rtc()
    state = rtc.read_status()

    if state.trustworthy:
        detail = state.detail
        if state.reads:
            detail += f"; the chip reads {state.reads.isoformat(sep=' ', timespec='seconds')}"
        report.add("the clock chip vouches for itself", PASS, f"{state.kind}: {detail}")
    elif state.present:
        report.add("the clock chip vouches for itself", FAIL, state.detail,
                   "set the clock — POST /api/clock, or the device's own page — "
                   "and check the coin cell is seated")
    else:
        report.add("the clock chip vouches for itself", FAIL, state.detail,
                   "check the three RTC wires and that VCC is 3.3 V, not 5 V")

    for warning in state.warnings:
        report.add("the clock chip's configuration", WARN, warning)

    source = clock.source
    if source == "untrusted":
        report.add("something vouches for the time", FAIL,
                   "nothing has — the tray will stay shut",
                   "put the device on a network with internet, or set the clock")
    elif source == "ntp" and not state.trustworthy:
        # The trap this catches: a bench with WiFi makes NTP vouch, so the
        # clock passes and the RTC is never actually exercised. It is the power
        # cut on an unplugged network that proves the coin cell, and that is a
        # separate item below.
        report.add("something vouches for the time", WARN,
                   "NTP is vouching, so this passes on a bench with internet "
                   "whether or not the RTC works at all",
                   "the power-cut test at the end is the one that proves the cell")
    else:
        report.add("something vouches for the time", PASS, f"source: {source}")


def check_state_dir(report: Report) -> None:
    """Writable by the user the *service* runs as, not by root.

    Running the bench commands with sudo and the service without it is how this
    breaks: root creates the state directory, the service cannot write it, and
    every dose is dispensed and then not recorded.
    """
    path = Path(config.STATE_DIR)
    try:
        path.mkdir(parents=True, exist_ok=True)
        probe = path / ".selftest"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
    except OSError as exc:
        report.add("the state directory is writable", FAIL, str(exc),
                   f"sudo mkdir -p {path} && sudo chown root:root {path}")
        return

    try:
        owner = path.stat().st_uid
    except OSError:
        owner = -1
    report.add("the state directory is writable", PASS, f"{path} (uid {owner})")


def check_packages(report: Report) -> None:
    if envelope.available():
        report.add("cloud sync can seal an envelope", PASS, "python3-cryptography is present")
    else:
        report.add("cloud sync can seal an envelope", WARN,
                   "the device will dispense; it just cannot sync",
                   "sudo apt install python3-cryptography")

    try:
        import segno  # noqa: F401, PLC0415
        report.add("the label can draw a QR", PASS, "segno is present")
    except ImportError:
        report.add("the label can draw a QR", WARN,
                   "the label page will fall back to plain text somebody has to type",
                   "sudo apt install python3-segno")


def check_identity(report: Report, store: Store) -> str:
    identity = provisioning.load_identity(store)
    if identity.source == "fallback":
        report.add("this board has its own permanent identity", FAIL,
                   "no SoC serial was found, so the setup network and the pairing "
                   "code are the shared fallback values",
                   "this is not a Raspberry Pi, or /proc/cpuinfo is unreadable")
    else:
        report.add("this board has its own permanent identity", PASS,
                   f"{identity.ssid}, pairing code {provisioning.format_claim(identity.claim)}")
    return identity.ssid


# ── the half only a person can settle ───────────────────────────────────────

def check_display(report: Report, indicator, interactive: bool) -> None:
    """Paint each state and ask which one is on the screen.

    Two questions, and which of them gets asked depends on the panel, because
    the two panels do not carry the message the same way. Both are asked about
    something this program has just painted — a screen the person is looking at
    while they answer — rather than about a claim on paper.

    **Which tray** is the first question and it is asked on every build. It is
    the one a panel mounted upside down fails and "is there something on the
    screen" passes, and it is also the only proof that the font is landing
    somewhere a person can read from where they will be standing.

    **What colour** is asked only of the LCD, where the colour *is* the message.
    The failure it catches is the ILI9341's MADCTL BGR bit: get it wrong and the
    panel is perfectly alive, perfectly sharp, and swaps red for blue — so
    "released" and "missed" trade places, which is a device telling somebody
    their pills are in the cup when the window has closed. The OLED has one ink
    and cannot answer this, so it is asked the question it *can*: whether the
    two states that must never be confused look different at a glance.
    """
    display = getattr(indicator, "display", None)
    if not display:
        report.add("the screen shows the right thing", FAIL,
                   "no panel came up",
                   f"for the LCD: check {config.DISPLAY_SPI_DEVICE} exists "
                   "(dtparam=spi=on in /boot/firmware/config.txt, then reboot), "
                   f"and that DC is on GPIO {config.DISPLAY_DC_GPIO} and RESET "
                   f"on GPIO {config.DISPLAY_RESET_GPIO}. For the OLED: "
                   f"`i2cdetect -y {config.DISPLAY_I2C_BUS}` must show "
                   f"{config.DISPLAY_I2C_ADDRESS:#04x}")
        return

    width = getattr(display, "width", 0)
    height = getattr(display, "height", 0)
    report.add("the screen came up", PASS,
               f"{display.backend} backend, {width}x{height}")

    if not interactive:
        report.add("the screen shows the right thing", SKIP, "not asked")
        return

    # Asked of the canvas rather than assumed from the backend name: it is the
    # canvas that decides whether a tone can be a colour at all, and a build
    # that quietly fell back to the mono panel must not be asked a question it
    # has no way to answer.
    try:
        colour = bool(display.new_canvas().colour)
    except Exception as exc:  # noqa: BLE001
        report.add("the screen shows the right thing", FAIL,
                   f"the panel would not give us a canvas to draw on: {exc}")
        return

    # A dose for tray 3 at eight this morning. Both numbers are on the screen,
    # and a person reading them back is proving the panel, the orientation and
    # the font in one answer.
    # Converted here, once. `screens` takes a formatted clock string, not a
    # datetime — handed a datetime it renders `2026-`, which is a panel that is
    # confidently wrong rather than blank. This is the check that asks a person
    # to read the screen back, so it is the one place that must not be showing
    # rubbish while it does.
    due_at = indicators.hhmm(
        datetime.now().replace(hour=8, minute=0, second=0, microsecond=0))
    indicator._paint(screens.due, 3, due_at)  # noqa: SLF001 - the point is to paint it
    answer = _ask("a dose for tray 3 is on the screen. Which tray number does "
                  "it show?", "number/nothing")
    if not answer:
        report.add("the screen names the tray", SKIP, "not answered")
    elif answer.isdigit() and int(answer) == 3:
        report.add("the screen names the tray", PASS)
    elif answer.startswith("n"):
        report.add("the screen names the tray", FAIL, "the screen is blank",
                   "the panel is being talked to but is showing nothing — check "
                   "the backlight lead on the LCD, and that DC is on GPIO "
                   f"{config.DISPLAY_DC_GPIO} and not shorted to a neighbour. A "
                   "DC line stuck at one level paints the initialisation "
                   "sequence as pixels or ignores everything")
    else:
        report.add("the screen names the tray", FAIL, f"it showed {answer!r}",
                   "if the digit is upside down or half off the edge, "
                   f"DISPLAY_ROTATION ({config.DISPLAY_ROTATION}°) does not match "
                   "how the panel is mounted")

    if colour:
        # Green first because it is the one that matters, and because it is the
        # one colour the BGR bit leaves alone — so a person who reads back
        # green, then red where amber should be, has named the fault exactly.
        for tone, name, paint in (
                ("due", "green", (screens.due, 3, due_at)),
                ("missed", "amber", (screens.missed, 3, due_at)),
                # The real setup network, not a placeholder: this is the one
                # screen with a word on it, and a person can read it back
                # against the printed label while they are here.
                ("network", "cyan", (screens.network,
                                     report.device or config.AP_SSID_PREFIX)),
                ("schedule", "violet", (screens.schedule, 3))):
            indicator._paint(*paint)  # noqa: SLF001
            answer = _ask(f"the screen should be {name}. What colour is it?", "colour")
            if not answer:
                report.add(f"the screen shows {tone} as {name}", SKIP, "not answered")
            elif answer.startswith(name[:3]):
                report.add(f"the screen shows {tone} as {name}", PASS)
            else:
                report.add(f"the screen shows {tone} as {name}", FAIL,
                           f"it showed {answer!r}",
                           "red where amber belongs, or blue and red swapped "
                           "anywhere, is the panel's MADCTL BGR bit set the "
                           "wrong way — the colours are right and the order is "
                           "not, so 'released' and 'missed' trade places")
    else:
        # The mono panel spends a treatment on each state instead of a colour —
        # `Mono1` inverts the whole panel for a due dose. That is the one pair
        # that must never be confused: a dose you can still take, and a dose that
        # has gone. If those two look alike here, every other state does too.
        indicator._paint(screens.due, 3, due_at)  # noqa: SLF001
        _ask("look at the screen — a dose is due. Press Enter", "")
        indicator._paint(screens.missed, 3, due_at)  # noqa: SLF001
        answer = _ask("that was the same dose, missed. Did the screen change in "
                      "a way you would notice from a doorway?", "y/n")
        if not answer:
            report.add("the mono panel tells a due dose from a missed one", SKIP,
                       "not answered")
        elif answer.startswith("y"):
            report.add("the mono panel tells a due dose from a missed one", PASS,
                       "the due screen inverts; the missed one does not")
        else:
            report.add("the mono panel tells a due dose from a missed one", FAIL,
                       "the two states are not distinguishable at a glance",
                       "on a panel with one ink the colour cannot carry the "
                       "message, so the treatment has to — fit the LCD if this "
                       "device is going to somebody who will only ever see it "
                       "from across a room")

    indicator.clear()


def check_buzzer(report: Report, indicator, interactive: bool) -> None:
    buzzer = getattr(indicator, "buzzer", None)
    if not buzzer:
        report.add("the buzzer sounds a tone", FAIL,
                   "no buzzer came up — a due dose will paint the screen and make "
                   "no sound, and nobody releases a dose they were never told about",
                   "sudo apt install python3-lgpio, and check the piezo is on "
                   f"GPIO {config.BUZZER_GPIO} through a 100 Ω resistor")
        return
    if not interactive:
        report.add("the buzzer sounds a tone", SKIP, "not asked")
        return

    print(f"        .. sounding three chirps at {config.BUZZER_HZ} Hz")
    for _ in range(3):
        buzzer.beep()
        time.sleep(0.25)

    # Not "did you hear something". An active buzzer has its own oscillator and
    # makes a noise at whatever frequency it likes, so it passes "did you hear
    # something" and then plays the wrong note forever.
    answer = _ask("three clear tones, three faint clicks, or nothing?",
                  "tones/clicks/nothing")
    if not answer:
        report.add("the buzzer sounds a tone", SKIP, "not answered")
    elif answer.startswith("t"):
        report.add("the buzzer sounds a tone", PASS, f"{buzzer.backend} backend")
    elif answer.startswith("c"):
        report.add("the buzzer sounds a tone", FAIL,
                   "clicks rather than a tone means the element is being switched "
                   "but not driven at a frequency",
                   "this is an active buzzer with its own oscillator — fit a "
                   "passive piezo element")
    else:
        report.add("the buzzer sounds a tone", FAIL, "nothing was heard",
                   f"check the piezo on GPIO {config.BUZZER_GPIO} and its 100 Ω resistor")


def check_release_path(report: Report, servos: TrayServos) -> None:
    """Can a tap actually reach this machine and open a tray?

    On this build the release button in the app is the only thing that opens a
    tray on the schedule's behalf, so the question a checklist could never ask —
    "is the one control that matters connected?" — is worth asking here.

    Both halves are machine-checkable and neither needs a person. A device that
    cannot move a horn will fail every release; a device with no way for the app
    to reach it will never be asked to.
    """
    if not servos.backend.moves_hardware:
        report.add("a release can open a tray", FAIL,
                   f"the servo backend is {servos.backend.name}, which moves nothing",
                   "sudo apt install python3-lgpio")
    else:
        report.add("a release can open a tray", PASS,
                   f"{servos.backend.name} backend, {len(servos.pins)} tray(s) wired")

    # Three ways a release can arrive, and any one of them is enough: the
    # button on the machine, the app over the LAN, or the app through the relay.
    # Having none of them is a machine that will chirp for an hour and then
    # record a miss because nobody could tell it to open.
    reachable = []
    if _button_available():
        reachable.append("the button on the machine")
    if shutil.which("avahi-daemon") or Path("/etc/avahi").exists():
        reachable.append(f"{config.MDNS_HOSTNAME}.local on the LAN")
    if config.CLOUD_RELAY_URL:
        reachable.append(f"the relay at {config.CLOUD_RELAY_URL}")

    if reachable:
        report.add("something can ask for a release", PASS, ", ".join(reachable))
    else:
        report.add("something can ask for a release", FAIL,
                   "no button, no mDNS and no relay — nothing can tell this device "
                   "to open a tray, so every dose will expire untaken",
                   "wire the button to GPIO {}, install avahi-daemon for the LAN "
                   "path, or set SNAPCARE_RELAY_URL so a phone can reach it from "
                   "anywhere".format(config.BUTTON_GPIO))


def check_trays(report: Report, servos: TrayServos, fitted: int | None,
                interactive: bool) -> None:
    """Drop each tray and ask *which hopper moved*.

    "Did a tray move" is the question a machine with trays 1 and 2 wired to
    each other's pins passes perfectly. "Which one moved" is the question it
    fails, and a transposed pair is the exact failure that has the right number
    of pills coming out of the wrong compartment — which nobody notices until
    the wrong medication has been taken for a week.
    """
    trays = sorted(servos.pins)[:fitted] if fitted else sorted(servos.pins)

    if not interactive:
        report.add("each tray is the tray it says it is", SKIP,
                   "not run — this one opens trays")
        return

    for tray in trays:
        print(f"        .. dropping tray {tray} (GPIO {servos.gpio_for(tray)})")
        try:
            servos.drop(tray)
        except Exception as exc:  # noqa: BLE001
            report.add(f"tray {tray} moves", FAIL, str(exc))
            continue

        answer = _ask(f"which hopper moved? (expected {tray})", "number/none")
        if not answer:
            report.add(f"tray {tray} is hopper {tray}", SKIP, "not answered")
            continue
        if answer.startswith("n"):
            report.add(f"tray {tray} is hopper {tray}", FAIL, "nothing moved",
                       "check the signal wire, the common ground between the Pi "
                       "and the servo supply, and that the servo has power")
            continue
        if answer.isdigit() and int(answer) == tray:
            report.add(f"tray {tray} is hopper {tray}", PASS)
        else:
            report.add(f"tray {tray} is hopper {tray}", FAIL,
                       f"hopper {answer} moved instead",
                       "two signal wires are transposed — the right number of "
                       "pills will come out of the wrong compartment")

    if interactive and trays:
        # Asked once, after the last drop, because it is a question about the
        # seconds *following* a stroke and a checklist read three stages later
        # cannot answer it.
        time.sleep(3)
        answer = _ask("are the servos silent and cool now, a few seconds after "
                      "the last drop?", "y/n")
        if not answer:
            report.add("the servos go silent between doses", SKIP, "not answered")
        elif answer.startswith("y"):
            report.add("the servos go silent between doses", PASS)
        else:
            report.add("the servos go silent between doses", FAIL,
                       "a servo still being driven draws current, hums and heats "
                       "up for the twenty-three hours until the next dose",
                       "buzzing at the end of a stroke is the servo fighting a "
                       "mechanical stop it has already reached — trim that tray "
                       "in SERVO_TRIM before it burns out")


def _button_available() -> bool:
    """Can a driver claim the button's pin? Opened and released immediately."""
    button = TakeDoseButton(lambda: None)
    try:
        return button.backend != "none"
    finally:
        button.close()


def check_button(report: Report, interactive: bool) -> None:
    """Does the take-dose button register exactly one press per press?

    Two failures hide behind each other here and they need different fixes. A
    button wired to the wrong pin, or not wired at all, registers nothing. A
    button with no debouncing registers four or five presses from one push —
    which on this build is harmless (the second call finds nothing left waiting)
    but means the debounce path is not running, and that is worth knowing before
    the machine leaves the bench.

    The count is the only way to tell them apart, which is why `TakeDoseButton`
    keeps one.
    """
    button = TakeDoseButton(lambda: None)
    try:
        if button.backend == "none":
            report.add("the take-dose button registers a press", FAIL,
                       f"no driver could claim GPIO {config.BUTTON_GPIO}",
                       "sudo apt install python3-lgpio, and check the button goes "
                       f"from GPIO {config.BUTTON_GPIO} (physical pin 18) to a "
                       "ground (pin 20) — two wires, no resistor")
            return

        if not interactive:
            report.add("the take-dose button registers a press", SKIP, "not asked")
            return

        print(f"\n        .. press the button once ({config.BUTTON_DEBOUNCE_US // 1000} ms "
              "debounce), then press Enter")
        before = button.presses
        _ask("press the button now, then Enter", "")
        seen = button.presses - before

        if seen == 0:
            report.add("the take-dose button registers a press", FAIL,
                       "the press was not seen at all",
                       f"check the wire from GPIO {config.BUTTON_GPIO} (pin 18) to "
                       "ground (pin 20). The pull-up is internal, so a button that "
                       "reads nothing is an open circuit, not a missing resistor")
        elif seen == 1:
            report.add("the take-dose button registers a press", PASS,
                       f"{button.backend} backend, one press seen")
        else:
            report.add("the take-dose button registers a press", FAIL,
                       f"one press registered {seen} times",
                       "the debounce filter is not being applied — check which "
                       "backend came up, and that the switch is not a rotary "
                       "encoder or a momentary with a very light action")
    finally:
        button.close()


# ── what a self-test cannot do ──────────────────────────────────────────────

_BY_HAND = [
    ("the power cut", "Pull the power at 08:30, after the 08:00 dose has been "
                      "released, and restore it. No second dose, and the log "
                      "survives. This is the case that dispenses twice without "
                      "persisted state, and it is invisible in any demo."),
    ("the coin cell", "Unplug the Pi, leave it a minute, and bring it back with "
                      "the network unplugged. The clock must still be trusted and "
                      "its source must read `rtc`. Nothing on a bench with WiFi "
                      "proves this, because NTP vouches first."),
    ("the wrong password", "Type the WiFi password wrong on purpose. The setup "
                           "network must come back within a few seconds and the "
                           "page must say the password was not accepted."),
    ("the internet cut", "Pull the router's WAN cable, leave the dispenser and the "
                         "phone on the LAN, and release a due dose from the app. "
                         "The pill must still come out. This is the one that "
                         "catches a release path that only works through the "
                         "relay — everything passes at a desk with internet, and "
                         "the failure is a machine that cannot dispense at all."),
    ("the dose nobody takes", "Let a scheduled dose sit for its whole grace window "
                              "without tapping release. The tray must stay shut, "
                              "the log must record it missed, and the screen must "
                              "go amber and keep the tray number. A build that "
                              "quietly drops it at the end has lost the entire "
                              "point of asking first."),
    ("the idle button", "Press the button on the machine when no dose is due. "
                        "Nothing must move and nothing must appear in the log. "
                        "That is the difference between a take-dose button and a "
                        "dispense button, and it is what stops a hopper being "
                        "walked empty one press at a time."),
    ("the button and the app agree", "Let a dose come due, press the button on the "
                                     "machine, and watch the app. The dose must "
                                     "leave `awaitingRelease` and appear in the log "
                                     "as taken — the same event the app's own "
                                     "release button produces. A build where the "
                                     "button opens a tray without telling the "
                                     "server leaves a carer reading a missed dose "
                                     "that was actually taken."),
    ("the stale notification", "Let a dose expire, then tap the release button on "
                               "a notification still sitting on the phone's lock "
                               "screen. Nothing must move. The device's own sense "
                               "of what is due is the authority, and this is the "
                               "only way to see it refuse."),
    ("the repeated revision", "Send the same schedule revision twice. The second "
                              "must be ignored. The relay refuses it, so this is "
                              "the only way to see the device's own check."),
]


def run(interactive: bool = True, fitted: int | None = None,
        backend: str | None = None, state_dir=None) -> int:
    """The whole procedure. Returns a process exit status."""
    report = Report(started=datetime.now().isoformat(timespec="seconds"))
    store = Store(state_dir)

    print("\nSnapCare dispenser — commissioning\n" + "=" * 60)

    if not check_not_already_running(report):
        return _finish(report, store)

    check_board(report)
    report.device = check_identity(report, store)
    check_state_dir(report)
    check_packages(report)
    check_clock(report)

    servos = TrayServos(backend=make_backend(backend))
    indicator = make_indicator()
    try:
        check_servo_backend(report, servos.backend)
        check_pin_map(report, servos)
        check_tray_count(report, servos, fitted)
        check_display(report, indicator, interactive)
        check_buzzer(report, indicator, interactive)
        check_button(report, interactive)
        check_release_path(report, servos)

        if interactive and servos.backend.moves_hardware:
            print("\n  The next part OPENS TRAYS. Anything loaded will come out.")
            if _ask("open the trays now?", "y/n").startswith("y"):
                check_trays(report, servos, fitted, interactive)
            else:
                report.add("each tray is the tray it says it is", SKIP,
                           "declined — nothing was opened")
        else:
            check_trays(report, servos, fitted, False)
    finally:
        indicator.close()
        servos.close()
        # Before gpiochip: the DS1302 holds lines through that handle.
        try:
            from . import ds1302  # noqa: PLC0415
            ds1302.close_chip()
        except Exception:  # noqa: BLE001 - teardown must not fail the report
            pass
        gpiochip.close()

    return _finish(report, store)


def _finish(report: Report, store: Store) -> int:
    print("\n" + "=" * 60)
    print(f"  {len(report.results) - len(report.failures) - len(report.skipped)} passed, "
          f"{len(report.failures)} failed, {len(report.skipped)} skipped")

    if report.failures:
        print("\n  Not ready:")
        for result in report.failures:
            print(f"    - {result.name}: {result.detail}")
    if report.skipped:
        # Said out loud rather than left implicit. "Everything passed" and
        # "everything anybody looked at passed" are different sentences.
        print("\n  Not checked:")
        for result in report.skipped:
            print(f"    - {result.name} ({result.detail})")

    print("\n  Still to do by hand — none of these can be automated:")
    for name, what in _BY_HAND:
        print(f"    - {name}: {what}")

    path = Path(store.dir) / "commissioning.json"
    try:
        path.write_text(json.dumps(report.to_json(), indent=2) + "\n", encoding="utf-8")
        print(f"\n  Report written to {path}")
    except OSError as exc:
        print(f"\n  Could not write the report: {exc}", file=sys.stderr)

    return 1 if report.failures else 0

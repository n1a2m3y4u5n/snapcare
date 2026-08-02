"""How the device talks to the person standing in front of it.

The project's founding constraint is that the person cannot be assumed to read.
So the channel to them is a picture and a sound, never a sentence — which is why
the Arduino build had an LED ring and a piezo and nothing to read, and why this
build has a screen and a piezo and still nothing to read.

The pairing is the point, and it is not redundancy. A screen alone only works if
somebody happens to be looking at it. The chirp is what fetches a person from
another room; what is on the screen is what tells them what is going on once
they arrive.

That matters more in this build than it did in the last one. The pills do not
leave the hopper until somebody presses the button or taps release in the app,
so the chirp is not a notification about something that has already happened —
it is the entire prompt. A device with no sound waits an hour for a press that
nobody was told to make, and then records a missed dose.

The colour vocabulary is carried over from the ring the screen replaced, exactly
as it was, so that somebody who has used one of these devices understands the
other:

    green + chirp   a dose is due; press the button or release it in the app
    blue            released — the pills are in the cup
    amber           the dose went untaken, or its window closed
    violet          a new schedule was accepted
    cyan            the device is waiting to be put on a WiFi network

Cyan is a light and **never** a sound. A chirp has meant "there are pills in the
cup" since the Arduino build, and spending it on a network problem would teach
the one person the whole project is built around to walk over and find nothing
there. Cyan is also the reason the device is findable at all when setup has not
happened yet: without it, a dispenser sitting on its own hotspot waiting to be
configured is indistinguishable from a dispenser that is switched off, and the
only cue anybody gets is the app staying empty.

A standing dose alert always wins the screen. Medication is the job; the network
is how the schedule got here.

What the screen can do that the ring could not
----------------------------------------------
One thing, and it is worth having: it can say **which tray** and **what time**.
A ring could only say "a dose"; a machine with eight hoppers then leaves the
person to work out which one, and a person who has just walked in has no way to
know whether the amber they are looking at is this morning's dose or last
night's. So `screens.due` gets the tray and the hour, `screens.missed` gets the
hour it was owed, and those two numbers are drawn large enough to read from the
doorway.

What it must not become
-----------------------
A text display. The temptation is obvious — there is a font in
`display/font.py`, and a sentence is easier to write than a picture — and giving
in to it puts the entire interface behind a skill this device may not assume.
The font exists for a tray number, a clock, and the setup network's name. Every
other thing on a screen here is a shape and a colour, and anything that wants a
sentence belongs in the app, where there is a reader.

Everything above this module calls the methods on `Indicator`. What they do
depends on which class is installed, so a device built without a panel still
works — it just relies on the phone for notification, and says so on its status
page rather than pretending something is lit.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime

from . import config, gpiochip, provisioning
from .display import make_display, screens
from .display.canvas import Tone
from .display.health import Health
from .display.presence import Presence

log = logging.getLogger(__name__)


def hhmm(when=None) -> str:
    """A time in the shape the screens read, from any of the shapes we hold one.

    `screens._clock_text` takes `'0800'` off the wire, minutes-since-midnight
    from the scheduler, and `'08:00'` from the API — every shape this project
    already uses except the one `datetime` this module has closest to hand. A
    `datetime` handed to it straight renders as `2026-` on the panel, which is a
    screen that is confidently wrong rather than blank, so the conversion lives
    here and not in a caller that will forget.

    `None` means now, which is right to within a tick: these are called at the
    moment a dose comes due or expires.
    """
    if when is None:
        return datetime.now().strftime("%H:%M")
    if isinstance(when, datetime):
        return when.strftime("%H:%M")
    return when


class _Shifted:
    """A canvas seen a pixel or two over. Everything else about it is the same.

    This is what turns `Presence`'s burn-in drift from a number in a plan into
    something that actually moves. An OLED left showing one static frame for
    months keeps a permanent ghost of it, and the resting screen is on the glass
    for twenty-three hours a day — so the whole layout steps slowly around a
    handful of pixels, which is invisible to a person and is the difference
    between an even panel and a shadow of a clock face burnt into it.

    A proxy rather than an offset argument threaded through every screen: the
    screens are the part of this package most likely to be edited by somebody
    who has never heard of burn-in, and an offset they have to remember to
    honour is one they will forget.
    """

    __slots__ = ("_canvas", "_dx", "_dy")

    def __init__(self, canvas, dx: int, dy: int):
        self._canvas = canvas
        self._dx = dx
        self._dy = dy

    def __getattr__(self, name):
        return getattr(self._canvas, name)

    def pixel(self, x: int, y: int, value: int) -> None:
        self._canvas.pixel(x + self._dx, y + self._dy, value)

    def rect(self, x: int, y: int, w: int, h: int, value: int,
             fill: bool = True) -> None:
        # Forwarded rather than inherited, so the fast slice-assignment path in
        # `Rgb565.rect` is not lost — a full-screen fill through `pixel` is
        # about a second on a Pi 3B.
        self._canvas.rect(x + self._dx, y + self._dy, w, h, value, fill)

    def blit(self, x: int, y: int, rows, span: int, value: int,
             scale: int = 1) -> None:
        self._canvas.blit(x + self._dx, y + self._dy, rows, span, value, scale)


class Indicator:
    """No-op base. Every method must be safe to call from any thread."""

    #: What this device actually has fitted, for the status page.
    fitted: tuple[str, ...] = ()

    def dose_due(self, tray: int, when=None) -> None: ...
    def dose_released(self, tray: int) -> None: ...
    def dose_missed(self, tray: int, when=None) -> None: ...
    def schedule_accepted(self, trays: int | None = None) -> None: ...
    def network_needs_setup(self, ssid: str = "") -> None: ...
    def network_online(self) -> None: ...
    def blocked(self, kind: str) -> None: ...
    def boot(self) -> None: ...
    def silence(self) -> None: ...
    def clear(self, tray: int | None = None, at=None) -> None: ...
    def close(self) -> None: ...

    #: The scheduler tick calls this on every pass (`daemon._show`). It was
    #: added to the screen-backed indicator only, so every build without a
    #: screen — the laptop, the tests, and any dispenser fitted with just a ring
    #: and a buzzer — raised AttributeError once a second. The call is guarded,
    #: so nothing broke; what it cost was the log. A traceback every second
    #: buries the lines that matter, and those lines are how anybody finds out
    #: why a tray did not open.
    def refresh(self, health) -> None: ...


class LogIndicator(Indicator):
    """Writes what a fitted screen and buzzer would have done.

    This is what runs on a laptop and what the tests assert against. It is not
    a placeholder for a broken device — a dispenser with neither part fitted is
    a valid build, and this is the honest description of it.
    """

    fitted = ()

    def dose_due(self, tray: int, when=None) -> None:
        log.info("indicator: green + chirp — tray %d is due, waiting for a release", tray)

    def dose_released(self, tray: int) -> None:
        log.info("indicator: blue — tray %d released", tray)

    def dose_missed(self, tray: int, when=None) -> None:
        log.info("indicator: amber — tray %d was missed", tray)

    def schedule_accepted(self, trays: int | None = None) -> None:
        log.info("indicator: violet — new schedule accepted")

    def network_needs_setup(self, ssid: str = "") -> None:
        log.info("indicator: cyan — waiting to be put on a network")

    def network_online(self) -> None:
        log.info("indicator: cyan off — on a network")

    def blocked(self, kind: str) -> None:
        log.info("indicator: blocked — %s", kind)

    def boot(self) -> None:
        log.info("indicator: the machine is starting up")

    def silence(self) -> None:
        log.info("indicator: chirp silenced; the screen stands")

    def clear(self, tray: int | None = None, at=None) -> None:
        log.debug("indicator: idle")


# ── the buzzer ──────────────────────────────────────────────────────────────

class Buzzer:
    """A piezo element driven as a square wave.

    Any GPIO will do — the tone is software-timed PWM, so this does not compete
    for a hardware PWM channel with anything else on the board.

    **This used to be pigpio and nothing else,** which was the single worst
    consequence of pigpio leaving Raspberry Pi OS. There was no fallback: on a
    Trixie card the buzzer simply did not exist, the failure was logged at INFO
    once at startup, and `/api/status` said nothing about it at all as long as
    the screen had come up. The device then ran in silence — and the module
    docstring above is explicit about what that costs now that the chirp is the
    prompt rather than an announcement. A dose nobody is told about is a dose
    nobody releases, and an hour later it is a missed dose in the log.

    So there are two drivers now, picked the same way the servos pick theirs,
    and `fitted` on the indicator reports which parts are genuinely present.
    """

    def __init__(self, gpio: int | None = None, backend: str = "auto"):
        self.gpio = gpio if gpio is not None else config.BUZZER_GPIO
        self.backend = "none"
        self._pi = None
        self._lgpio = None
        self._handle = None

        tried = []
        for name in (("pigpio", "lgpio") if backend == "auto" else (backend,)):
            try:
                getattr(self, f"_start_{name}")()
            except Exception as exc:  # noqa: BLE001 - try the next driver
                tried.append(f"{name}: {exc}")
                continue
            self.backend = name
            log.info("buzzer on GPIO %d (%s)", self.gpio, name)
            self.off()
            return

        raise RuntimeError("; ".join(tried) or f"unknown buzzer backend {backend!r}")

    def _start_pigpio(self) -> None:
        import pigpio  # noqa: PLC0415

        pi = pigpio.pi()
        if not pi.connected:
            # The import succeeding proves nothing: pigpio is a daemon, and the
            # client library installs on machines where the daemon cannot.
            pi.stop()
            raise RuntimeError("pigpiod is not running")
        self._pi = pi
        self._pi.set_mode(self.gpio, pigpio.OUTPUT)

    def _start_lgpio(self) -> None:
        import lgpio  # noqa: PLC0415

        handle = gpiochip.open_chip()
        if handle is None:
            raise RuntimeError(gpiochip.unavailable_reason())
        self._lgpio = lgpio
        self._handle = handle
        lgpio.gpio_claim_output(handle, self.gpio, 0)

    def beep(self, seconds: float | None = None) -> None:
        import time  # noqa: PLC0415

        duration = seconds if seconds is not None else config.BUZZER_BEEP_S
        if self.backend == "pigpio":
            self._pi.set_PWM_frequency(self.gpio, config.BUZZER_HZ)
            self._pi.set_PWM_dutycycle(self.gpio, 128)  # square wave, loudest
            time.sleep(duration)
        else:
            # lgpio's duty cycle is a percentage, not pigpio's 0-255. Passing
            # 128 here would be clamped to 100% — a pin held high, which is a
            # piezo making no sound at all while drawing current.
            self._lgpio.tx_pwm(self._handle, self.gpio, config.BUZZER_HZ, 50)
            time.sleep(duration)
        self.off()

    def off(self) -> None:
        if self.backend == "pigpio":
            self._pi.set_PWM_dutycycle(self.gpio, 0)
        elif self.backend == "lgpio":
            # Both halves. Cancelling the transmission leaves the pin wherever
            # the timing thread last wrote it, and a piezo left high sits under
            # DC bias for as long as the device is powered.
            gpiochip.stop_pin(self._handle, self.gpio)

    def close(self) -> None:
        try:
            self.off()
            if self.backend == "pigpio":
                self._pi.stop()
            elif self.backend == "lgpio":
                self._lgpio.gpio_free(self._handle, self.gpio)
        except Exception:  # noqa: BLE001 - shutdown must not raise
            pass


# ── the two together ────────────────────────────────────────────────────────

class FittedIndicator(Indicator):
    """The build the contest unit ships with: a screen, a buzzer, or both.

    `display` is anything with `new_canvas()`, `show(canvas)`, `close()` and a
    `backend` name — the ILI9341 on this card, the SSD1306 on a bench. Which one
    it got is on the status page, because "the screen is dark" and "the screen is
    dark *and* nothing tried to paint it" are different problems with different
    fixes, and from the room they look identical.

    The repeating chirp runs on its own thread rather than from the scheduler
    tick. A dose alert has to keep sounding every twenty seconds until somebody
    releases the dose, and hanging that off the tick would either make the tick
    slow or make the interval depend on it.
    """

    def __init__(self, display=None, buzzer: Buzzer | None = None,
                 presence: Presence | None = None):
        self.display = display
        self.buzzer = buzzer
        #: Decides what belongs on the panel and how brightly, and it is the
        #: only thing that decides. Every event here reports to it and then asks
        #: what to draw, rather than drawing what it feels like — otherwise two
        #: authorities disagree, and the one that loses is whichever fired last,
        #: which is how a released screen ends up covering a dose still waiting.
        self.presence = presence or Presence()
        #: The last snapshot the daemon handed over. Events between ticks decide
        #: against it, so it is at most one tick stale — fine for a screen, and
        #: much better than making a dose wait fifteen seconds to be announced.
        #:
        #: **Optimistic until told otherwise**, which is the opposite of
        #: `Health()`'s own default and deliberately so. `Health` defaults to
        #: `dispensing=False` because a *failed snapshot* should read as a
        #: fault; but before the first snapshot has been taken at all, nothing
        #: has said this machine is blocked. Starting at the default put an
        #: octagon on the panel for every event until the daemon's first tick —
        #: the screen inventing a fault out of its own ignorance, which is the
        #: one thing the severity vocabulary must never do.
        self._health = Health(dispensing=True)
        self._level = -1
        self._alerting = threading.Event()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        #: Standing "put me on a network" request, so that a dose can borrow the
        #: screen and hand it back rather than cancelling the hint outright.
        self._needs_network = False
        #: What is on the screen now, in the tone vocabulary. Only ever read to
        #: settle who owns the screen — see `network_online`.
        self._showing = Tone.IDLE
        #: The setup network's name, resolved once. It is derived from the
        #: board's serial and never changes for the life of the device, and on a
        #: machine that has no serial `load_identity` warns every time it is
        #: asked — which would be once a minute for as long as the device sits
        #: unconfigured, since `clear` repaints the setup screen.
        self._ssid_cache = ""
        # The scheduler tick, the release path on an HTTP thread, the cloud's
        # command poll and the network worker all paint this screen. A frame is
        # 150 kB down a bus, and two threads interleaving there is a torn frame
        # on a device whose picture is the entire user interface.
        self._panel = threading.Lock()
        if buzzer:
            self._thread = threading.Thread(target=self._chirp_loop,
                                            name="buzzer", daemon=True)
            self._thread.start()

    #: Consecutive failed beeps before the buzzer is given up on for good.
    #:
    #: This used to be one, by way of a `return` that exited the thread — so a
    #: momentary lgpio EBUSY, of the kind another process claiming a line for a
    #: few milliseconds produces, silenced the machine for the rest of the boot.
    #: On this build the chirp is the entire prompt, so that turned one transient
    #: error into every subsequent dose expiring untaken.
    _CHIRP_STRIKES = 5

    @property
    def fitted(self) -> tuple[str, ...]:
        """What is working *now*, not what came up at startup.

        Computed rather than snapshotted, because both parts can be dropped
        while the machine runs: `_paint` releases a panel that raises, and the
        chirp loop gives up on a buzzer that has failed five times running. A
        status page still listing a screen on a machine that is painting nothing
        sends somebody looking for a loose wire that is not there.
        """
        return tuple(name for name, part in (("display", self.display),
                                             ("buzzer", self.buzzer)) if part)

    def _chirp_loop(self) -> None:
        strikes = 0
        while not self._stop.is_set():
            # Waits without spinning, and wakes the instant an alert starts.
            if self._alerting.wait(timeout=1.0):
                try:
                    self.buzzer.beep()
                except Exception:  # noqa: BLE001
                    strikes += 1
                    if strikes == 1 or strikes >= self._CHIRP_STRIKES:
                        # Logged on the first failure and on the last, not on
                        # every one — a piezo that has genuinely died would
                        # otherwise fill the journal three times a minute.
                        log.exception("the buzzer failed (%d in a row)", strikes)
                    if strikes >= self._CHIRP_STRIKES:
                        log.error(
                            "giving up on the buzzer after %d failures — a due "
                            "dose will paint the screen and make no sound, so "
                            "expect doses to expire untaken", strikes)
                        # Cleared so `fitted` and the status page stop claiming
                        # a part that is not working.
                        self.buzzer = None
                        return
                    self._stop.wait(config.BUZZER_REPEAT_S)
                    continue
                strikes = 0
                self._stop.wait(config.BUZZER_REPEAT_S)

    def _ssid(self) -> str:
        if not self._ssid_cache:
            try:
                self._ssid_cache = provisioning.load_identity().ssid
            except Exception:  # noqa: BLE001
                # A setup screen with no name on it still says "put me on a
                # network", which is the part that gets somebody to look at
                # their phone. It is not worth failing a repaint over.
                log.debug("could not resolve the setup SSID for the screen")
        return self._ssid_cache

    def refresh(self, health) -> None:
        """The scheduler tick's one call. Ask the policy, paint if it changed.

        This is what makes the panel show anything other than the last thing
        that happened to it. Before it existed, a machine that had been sitting
        quietly since breakfast was still showing breakfast — and the network,
        the clock chip and the relay had no way onto the glass at all.

        Cheap on purpose. `Presence.tick` returns None whenever the answer has
        not changed, which on a resting machine is most ticks, and a needless
        full repaint is 38 ms of SPI on the loop that also has to hit a
        scheduled minute.
        """
        self._health = health
        self._decide()

    def _signal(self, kind: str, **detail) -> None:
        """Tell the policy something happened, and act on it now.

        Events do not wait for the next tick. Fifteen seconds is nothing for a
        rotating status card and far too long for the screen that says a dose is
        waiting — the chirp and the picture have to arrive together or the
        person who comes to look finds the machine silent about why it called
        them.
        """
        self.presence.event(kind, **detail)
        self._decide()

    def _decide(self) -> None:
        plan = self.presence.tick(self._health)
        if plan is None:
            return
        screen_fn = getattr(screens, plan.screen, None)
        if screen_fn is None:
            log.error("the display policy asked for a screen that does not "
                      "exist: %r", plan.screen)
            return
        self._brightness(plan.brightness)
        self._paint(screen_fn, *plan.args, offset=plan.offset)

    def _brightness(self, level: int) -> None:
        """Map the policy's 0..255 onto whatever this panel can actually do.

        The OLED dims properly. The LCD's backlight is a bare GPIO on this
        build, so it has two settings and the threshold is deliberately low: at
        3 a.m. the question is whether somebody can see there is a dose waiting,
        not whether the panel is comfortable to read a paragraph from.
        """
        panel = self.display
        if not panel or level == self._level:
            return
        self._level = level
        try:
            if hasattr(panel, "contrast"):
                panel.contrast(level)
            elif hasattr(panel, "backlight"):
                panel.backlight(level > 0)
        except Exception:  # noqa: BLE001 - a dim panel is not worth a traceback
            log.debug("could not set the panel brightness")

    def _paint(self, screen_fn, *args, offset: tuple[int, int] = (0, 0)) -> None:
        """Draw one screen onto a fresh canvas and push it to the panel.

        Every state goes through here, and the whole frame is redrawn each time
        rather than patched. That is the cheap option on both panels — a full
        repaint is about 12 ms of drawing against a transfer that dominates it —
        and it removes the failure where a screen keeps a stale corner of the
        previous state, which on this device would be last night's tray number
        under this morning's colour.

        A panel that fails is dropped, not retried. Whatever went wrong with an
        SPI write or an I2C address is not going to be different in twenty
        seconds, and a repaint that raises on every scheduler tick would turn a
        cosmetic fault into a device that stops dispensing. The pills still come
        out; the machine just goes quiet in the room, and says so on its status
        page.
        """
        with self._panel:
            if not self.display:
                return
            try:
                canvas = self.display.new_canvas()
                screen_fn(_Shifted(canvas, *offset) if any(offset) else canvas,
                          *args)
                self.display.show(canvas)
            except Exception:  # noqa: BLE001
                log.exception("the screen failed; carrying on without it")
                self.display = None

    def dose_due(self, tray: int, when=None) -> None:
        log.info("indicator: green + chirp — tray %d is due, waiting for a release", tray)
        # `when` is the minute the dose was scheduled for, which a caller that
        # has the dose in its hand should pass — in any shape `hhmm` knows.
        self._showing = Tone.DUE
        self._signal("due", tray=tray, at=hhmm(when))
        self._alerting.set()

    def dose_released(self, tray: int) -> None:
        log.info("indicator: blue — tray %d released", tray)
        self._alerting.clear()
        self._showing = Tone.RELEASED
        self._signal("released", tray=tray)

    def dose_missed(self, tray: int, when=None) -> None:
        log.info("indicator: amber — tray %d was missed", tray)
        self._alerting.clear()
        # The hour is the point of showing it. Amber alone cannot distinguish
        # "you have just missed breakfast" from "you missed last night's and
        # nobody has been in since", and those want different responses.
        self._showing = Tone.MISSED
        self._signal("missed", tray=tray, at=hhmm(when))

    def schedule_accepted(self, trays: int | None = None) -> None:
        log.info("indicator: violet — new schedule accepted")
        self._showing = Tone.SCHEDULE
        # How many hoppers the new plan covers, which is the one number that
        # makes this screen worth more than a flash of colour: a schedule that
        # arrives naming three trays on a two-tray machine is visible here and
        # nowhere else in the room. A caller without the schedule to hand gets
        # the machine's own count, which is at least never a lie about the
        # machine.
        self._signal("schedule", count=trays if trays is not None else config.INSTALLED_TRAYS)

    def network_needs_setup(self, ssid: str = "") -> None:
        log.info("indicator: cyan — waiting to be put on a network")
        self._needs_network = True
        # No buzzer, ever, and never over a dose that is still waiting to be
        # taken. Both rules are in the module docstring, and both are about not
        # spending the alert vocabulary on something that is not medication.
        if not self._alerting.is_set():
            self._showing = Tone.NETWORK
            self._signal("network", ssid=ssid or self._ssid())

    def network_online(self) -> None:
        if not self._needs_network:
            return
        log.info("indicator: cyan off — on a network")
        self._needs_network = False
        # Only if the setup screen is what is actually up. Anything else is a
        # dose being reported, or a machine explaining why it cannot dispense,
        # and both of those outrank this. Painted here rather than through
        # `clear`, which would also stop a chirp this has no business stopping.
        if self._showing is Tone.NETWORK:
            self._showing = Tone.IDLE
            # `settled`, not another `network`: the job that screen was asking
            # for has just been done. Telling the policy the radio changed would
            # put the setup card back up to celebrate the join, which is a
            # machine sending somebody to do a task that has finished.
            self._signal("settled")

    def blocked(self, kind: str) -> None:
        """Say in the room that this machine will not open a tray.

        The two reasons — no GPIO library, and a clock nothing has vouched for —
        are both states in which the device looks perfectly healthy and silently
        gives nobody their medication. `kind` is which one, so the picture can
        differ: they send somebody to opposite ends of the problem.

        Nothing calls this yet; the daemon is where it belongs, next to
        `Dispenser.blocked_reason()`.
        """
        log.warning("indicator: blocked — %s", kind)
        # Amber, in effect: something is wrong and nothing is coming out. It
        # also stops `network_online` painting this away, which matters — a
        # machine that cannot dispense has more to say than a machine that has
        # just joined a WiFi network.
        self._showing = Tone.MISSED
        self._signal("blocked")


    def boot(self) -> None:
        """The machine has just come up. Say so, before anything slow starts.

        The three things that follow this in the daemon — the web server, the
        radio, the cloud link — take tens of seconds between them, and a person
        who has just plugged the device in and is looking at a black panel
        concludes it is dead and pulls the plug out again.
        """
        log.info("indicator: starting up")
        self._signal("boot")
    def silence(self) -> None:
        """Stop the chirp; leave the screen showing whatever it was showing.

        Somebody who silences a chime has asked for quiet, not withdrawn their
        medication — the dose is still owed and still releasable. Taking the
        picture down too would leave a device with a dose waiting and nothing at
        all to say so, which is the device lying.
        """
        log.info("indicator: chirp silenced; the screen stands")
        self._alerting.clear()

    def clear(self, tray: int | None = None, at=None) -> None:
        """Nothing is happening: the idle screen, or the setup one.

        `tray` and `at` are the next dose, if the caller knows it. That is the
        best thing this screen can show when there is nothing to report — a
        person who wants to know whether the machine is still working gets an
        answer without having to press anything — and a caller that does not
        know passes neither, which is an idle screen with just the clock on it.
        """
        self._alerting.clear()
        # Back to the setup screen rather than idle if the network is still not
        # configured: the hint has to outlive the dose that borrowed the screen,
        # or a device that was never set up goes quiet after its first dose.
        if self._needs_network:
            self._showing = Tone.NETWORK
            self._signal("network", ssid=self._ssid())
            return
        self._showing = Tone.IDLE
        self._signal("settled")

    def close(self) -> None:
        """Shut both parts down, independently.

        Each step is guarded on its own. A panel whose file descriptor was
        reaped underneath it raises from `close()`, and an unguarded sequence
        then skipped the buzzer — leaving a piezo under DC bias for as long as
        the device stayed powered. In the self-test it was worse: `close()` is
        the first statement of the teardown, so the servo pins and the gpiochip
        handle were left claimed too.
        """
        self._stop.set()
        self._alerting.clear()
        if self._thread:
            self._thread.join(timeout=2)
        for name, part in (("display", self.display), ("buzzer", self.buzzer)):
            if not part:
                continue
            try:
                part.close()
            except Exception:  # noqa: BLE001 - shutdown must reach the next part
                log.exception("could not close the %s cleanly", name)


def make_indicator(want_display: bool = True, want_buzzer: bool = True) -> Indicator:
    """Fit whatever is actually present, and log what is not.

    A part that fails to initialise is reported and skipped rather than being
    fatal. A dispenser that will not start because its screen is unplugged is
    strictly worse than a blind one: the pills are what matter.
    """
    display = buzzer = None

    if want_display:
        try:
            display = make_display()
        except Exception as exc:  # noqa: BLE001
            # `make_display` undertakes never to raise — a screen is not
            # load-bearing and a panel that will not come up must not stop a
            # dispenser starting. Caught anyway, because that promise is one
            # import away from being broken by a card with a half-installed
            # library, and the failure would land in the daemon's constructor.
            log.warning("NO SCREEN (%s) — nothing in the room will show that a "
                        "dose is due, or which tray it is in", exc)
            display = None

        # A panel that did not come up is a `NoDisplay`, not a None: it answers
        # every call and draws nothing, and it has already said so at WARNING
        # with the reason. What it must not do is count as fitted — a status
        # page that lists a screen on a machine whose screen is dark sends
        # somebody looking for a loose wire that is not there.
        if display is not None and getattr(display, "backend", "none") == "none":
            display = None

    if want_buzzer:
        try:
            buzzer = Buzzer()
        except Exception as exc:  # noqa: BLE001
            log.info("no buzzer (%s)", exc)

    if not display and not buzzer:
        log.warning(
            "neither a screen nor a buzzer is available — a dose due here is "
            "announced by the app alone, so a phone that misses the notification "
            "is a dose nobody is told about"
        )
        return LogIndicator()

    if want_buzzer and not buzzer:
        # At WARNING, not INFO, and said in terms of the consequence rather
        # than the missing library. A screen with no chirp only works if somebody
        # happens to be looking at it, and on this build the chirp is the prompt
        # to go and release the dose — not an announcement that it has already
        # been delivered.
        log.warning(
            "NO BUZZER — a due dose will paint the screen but nothing will sound. "
            "Nobody releases a dose they were never told about, so expect the "
            "log to fill with doses that expired untaken. "
            "sudo apt install python3-lgpio"
        )

    log.info("indicators fitted: %s", ", ".join(
        name for name, part in (("display", display), ("buzzer", buzzer)) if part))
    return FittedIndicator(display=display, buzzer=buzzer)

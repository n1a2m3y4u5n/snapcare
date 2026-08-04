"""What is on the panel, and which palette it is wearing.

Why this file exists
--------------------
Until it did, the screen showed whatever the last event painted, and it showed
it for ever. A dose released at eight in the morning was still lit at midnight,
because nothing ever decided otherwise. That is not a policy, it is the absence
of one, and it costs two things: a panel whose contents stopped being true hours
ago, and a bedside lamp at three in the morning showing a fact from breakfast.

So the decision lives here, in one object with no wires attached to it. This
file answers a single question, once per scheduler tick: *given what just
happened and what the machine currently is, what should be on the screen.* It
draws nothing, opens nothing and sleeps nothing. `tick` is a pure function of the
clock, the events it has been told about, and the `Health` it is handed, which is
what makes the whole policy drivable from a fake clock through a simulated day —
and a policy about time that cannot be tested against time is a policy nobody
will ever change again.

It imports nothing that draws, on purpose. `Plan.screen` is the *name* of a
function in `screens.py`, not the function, so this module has no font, no
glyphs and no panel in its import graph; a test asserts on a string.

The ranking, which is the whole design
--------------------------------------
Six layers, and the top one wins outright:

    0  nothing has told us anything yet   `boot`      a held frame, then it goes
    1  the machine will not dispense      `blocked`   stands until fixed
    2  a dose is waiting on a press       `due`       stands, and stays bright
    3  something just happened            a dwell, then it falls back
    4  it needs putting on a network      `network`   stands until somebody does
    5  nothing is happening               `idle`      the resting screen

Layer 2 above layer 3 is what the brief calls the standing dose alert, and it is
the important one: a dose waiting on a press is not a notification that has been
delivered, it is the entire prompt, and it has to still be there when somebody
walks back in with a glass of water four minutes later. Nothing transient may
paint over it and quiet hours may not quieten it.

Layer 1 above layer 2 is a deliberate departure from that rule and the one
judgement in this file worth arguing with. When the tray will not open, a screen
telling somebody to press a button is a lie — they press it, nothing happens,
and the machine has spent the one instruction it is capable of giving on an
action that cannot succeed. `blocked` says the true thing instead: no pills are
coming, fetch somebody. The two states should not co-occur — the scheduler ought
not to offer a dose it cannot release — and if they ever do, that contradiction
is itself the fault worth showing.

Layer 0 is new and is the cheapest of the six. Before the first snapshot lands
every field on `Health` is its honest empty, and a bar drawn from those is seven
grey chips and `--:--`: true, but indistinguishable from a machine that has
answered and had nothing to say. `known` tells those apart, and a machine that
has just been plugged in owes the person standing over it a frame that says
*starting* rather than a black panel that reads as dead. It is also held for
`boot_dwell_s` after the daemon says so, because a frame that flickers past in
80 ms is not a frame anybody read.

Layer 2 reads `waiting_tray` and `waiting_at` and never `next_tray`. That is a
fixed bug rather than a preference: with two doses waiting, releasing one used to
leave a green screen naming a tray twelve hours away, because the screen took its
tray from the *next* dose when the latch had been dropped. The due screen now
takes no scalar arguments at all — everything it draws comes off the snapshot —
so there is no argument left to be about the wrong dose.

What dwells and what stands
---------------------------
A transient is something that *happened*: a dose went into the cup, a schedule
arrived. It is news, it is true for a moment, and afterwards the resting screen
is more use than the news is. It gets `dwell_s` and falls back.

A standing state is something that *is*: the tray will not open, there is no
network configured. Those do not dwell, because they are still true in ten
minutes and a person who walks in then needs to see them exactly as much as the
person who walked in when they started. Falling back to a cheerful idle screen
would be the machine forgetting.

A missed dose sits between the two and is treated as a long transient. It is
history rather than a condition — nothing about it can be fixed — but it is the
one piece of history nobody has seen yet, so it holds for `missed_dwell_s`,
which is long enough that somebody who heard the buzzer from another room and
came to look still finds out *which* dose it was. It no longer has to hold any
longer than that: the schedule band keeps the amber triangle for the rest of the
day, so the memory outlives the frame without the frame outstaying its welcome.

Dwells are quantised by the caller, not by this file
----------------------------------------------------
`tick` is the only thing that produces a `Plan`, and the scheduler calls it every
`config.TICK_SECONDS` — 15 s. So every dwell here is a *lower* bound: a screen
falls back at the first tick after its dwell expires, not at the moment it
expires. Anything shorter than one tick therefore buys nothing at all, which is
why `dwell_s` defaults to 20 s rather than to the 5 s that would feel right on a
desk.

That bound also does real work in one race. When a dose is released, the
`released` event arrives immediately but the `Health` that says `waiting` has
dropped to zero may be one snapshot behind, and while it is behind, layer 2
correctly keeps the due screen up. A dwell longer than a tick means the released
screen still gets its turn once the snapshot catches up. (With two doses waiting,
releasing one goes straight back to the due screen and skips the cup entirely.
That is right: there is another dose on the table.)

Quiet hours are a palette, not a brightness
-------------------------------------------
This device sits on a bedside table, and the obvious answer — turn the backlight
down at night — is one this board cannot perform. The LED pin is tied to 3V3,
the factory passes no backlight pin, and `Ili9341.backlight()` returns False
without doing anything. The brightness axis this file used to carry (`FULL`,
`_DAY`, `_NIGHT`, `Plan.brightness`) was therefore inert: a number computed every
tick, threaded through two files, and dropped on the floor by the driver.

It is deleted rather than made to work, because making it work needs a free PWM
pin on the board and a line in `config.txt`, not code. What replaces it moves the
*pixels* instead: between `quiet` hours the panel wears the night palette, where
the three surfaces darken and the two text greys each step down one rank. It
never blanks — the person waking at three wondering whether they have a dose due
must be able to answer that by looking, not by finding a button in the dark.

`Level` survives all of this and gains a real job: it is what says a waiting dose
is never night-substituted. A dose at 3 a.m. is the single event this machine
exists for, and it gets the full palette at any hour.

Quiet hours are read off `health.now` — the device's own clock, the same one the
doses are scheduled against — and not off `time.localtime`, so that a test can
drive midnight without touching the system clock, and so that a device with a
clock nobody has vouched for cannot decide it is night. An unparseable `now` is
treated as daytime: brighter than it needs to be beats a machine that dims itself
permanently because its clock returned a blank string.

Burn-in drift, deleted
----------------------
The resting layout used to step around a 3x3 ring every ten minutes, because an
OLED ages where it is lit. There is no OLED any more. An ILI9341 does not burn
in, so what the drift bought on this build was a forced full-frame repaint six
times an hour, a 2 px vertical twitch against the bar's hard bottom edge every
ten minutes, and a silent breakage waiting for the next drawing primitive that
did not go through the proxy. All three costs, no benefit; it is gone, along with
`Plan.offset`, `burn_in` and `drift_period_s`.

The rest rotation, deleted
--------------------------
`REST_CARDS` used to be three screens taking turns, so that `status` and `wifi`
were reachable without a button. The status bar now shows everything `status`
showed, permanently and in fixed positions, and the hero's secondary line shows
the address that was the only reason to look at `wifi`. There is nothing left to
rotate.

It was also broken. `rest_rotate_s` was 8 s and `tick` is called every 15 s, so
the turn advanced 1.875 per sample and the real sequence with two cards was
`idle, status x8, idle x3` — the screen that answers "when is my next dose" on
the glass about 11 % of the resting day. Deleting the rotation is strictly better
than fixing the period, and it takes the whole aliasing class of bug with it.

Returning None is load-bearing, and so is what equality ignores
---------------------------------------------------------------
A full 320x240 repaint is 38 ms of SPI and this runs on the scheduler tick every
15 s. `tick` returns `None` — meaning "change nothing" — whenever the plan it
would produce is the same as the one it last returned, which for a device sitting
idle is almost always. Callers must treat `None` as *leave the panel alone*, not
as *blank it*.

That only works because `Plan.args` is excluded from the comparison. `args`
always starts with the whole `Health`, so that every screen can draw the status
bar and the schedule band without the policy having to know what they contain —
and `Health` has twenty-two fields, any one of which moving would otherwise force
a frame. What is compared instead is `key`: the handful of facts the *hero* is
actually showing. A relay that flaps from `connected` to `retrying` changes the
status bar and not the hero, and the painter repaints the bar alone for 5.76 ms
rather than the panel for 38.4 ms. Getting this backwards does not break a test;
it quietly spends a quarter of the tick budget forever.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING, Any, Callable

from .. import config

if TYPE_CHECKING:  # pragma: no cover - typing only; see below
    from .health import Health

# `Health` is imported for the annotation and never at runtime. This file is a
# policy over a value object, and it reads that object's fields — it has no use
# for `shape_for`, and no business pulling in a module whose `snapshot()` reaches
# for the dispenser, the network and the cloud. The practical payoff is that a
# fake with the right handful of fields drives every test in this module, and the
# policy can be exercised long before there is a machine to snapshot.
#
# `shape_for` is deliberately not consulted anywhere below, which is worth
# stating because it looks like an omission. The three-level grammar is about
# how bad a state is; this file is about whether a state is *still true*. Those
# are different axes and they cross: `missed` is a triangle and dwells, `network`
# is the same triangle and stands. Ranking screens by shape would happen to work
# on today's states and would be a coincidence, not a rule.
#
# `config` is imported for two default values and is never read at decision time.
# A duration that is a constructor argument can be driven from a test; one read
# out of a global on every tick can only be tested one way. Naming the constant
# once beats a second spelling of 2.5 that somebody will change in one place.

log = logging.getLogger(__name__)

__all__ = ["Level", "Plan", "Presence", "boot_stage", "earlier_day"]


class Level(Enum):
    """How much of the person's attention a screen is entitled to.

    This is not the three-level SAFE/CAUTION/AVOID grammar from `shapes.py` and
    must not be confused with it. That one grades how bad the machine's state is,
    for the person reading the panel. This one grades how long the screen may
    stand and whether the night palette may quieten it, for the panel itself.

    It survived the deletion of the brightness axis because it is still the right
    vocabulary: the day a board frees a PWM pin, the change is `theme.pack` plus
    one constructor argument and these four names are unchanged.
    """

    ALERT = "alert"        # a dose is waiting on a press — the reason for the device
    STANDING = "standing"  # still true, and will be until somebody acts
    NOTICE = "notice"      # it just happened; it will stop mattering shortly
    REST = "rest"          # nothing is happening


#: Events that mean a person is standing in front of the machine right now.
#: Everything else in the vocabulary is the machine talking to itself.
_ATTENTION = frozenset({"boot", "button", "touch"})

#: The events that put a screen up for a dwell, and the screen each one names.
#:
#: `network` is in here as well as at layer 4, and that is not a duplicate. Layer
#: 4 reads the snapshot, which can be a tick behind the radio; this arm is the
#: supervisor saying "I have just raised the hotspot" and is the difference
#: between the setup card appearing now and appearing fifteen seconds after
#: somebody has walked away.
_TRANSIENT = {
    "released": "released",
    "missed": "missed",
    "schedule": "schedule",
    "network": "network",
}

#: The `wifi` values that mean somebody has to do something in the room.
#:
#: `failed` joins `hotspot` because they are the same situation with one extra
#: fact: we are back on our own setup network *because a join did not work*, so
#: the passphrase is probably wrong and that screen is the only place anybody
#: will ever be told so. A device that is merely `offline` is not here — nobody
#: standing in the room can fix a router by reading a screen, and the cyan card
#: would hide the clock and the next dose, which are what that person came to
#: find out.
_NEEDS_SETUP = ("hotspot", "failed")


@dataclass(frozen=True)
class Plan:
    """What should be on the panel now.

    `screen` is the name of a function in `screens.py` and `args` is everything
    after its `canvas`, so a caller is exactly:

        fn = getattr(screens, plan.screen)
        fn(canvas, *plan.args)

    The seven names and their arguments, which match `screens.py`:

        boot    (health,)            blocked  (health,)
        due     (health,)            network  (health,)
        missed  (health, tray, at)   idle     (health,)
        schedule(health, trays)

    `screens.released` is not among them. A release takes no screen — see
    `_transient` — and that frame now exists only for the commissioning colour
    walk.

    **`args` always starts with `health` and is never compared.** Both halves of
    that are load-bearing. Passing the whole snapshot is what lets every screen
    draw the status bar and the schedule band without this file knowing a thing
    about either; excluding it from equality is what stops a twenty-two-field
    object forcing a 38 ms repaint every time the relay reconnects.

    `key` is what is compared instead: the facts the *hero band* is showing, and
    nothing else. If a fact is in `key` it must be drawn in the hero, and if it
    is drawn in the hero it must be in `key` — the first mistake repaints for
    nothing, the second leaves a stale number on the glass.

    `night` is part of the comparison because the palette flipping at 22:00 is a
    frame the panel has to be told about; `level` is not, because it is a
    function of `screen` and comparing it would only be a second spelling of the
    same fact.
    """

    screen: str
    args: tuple[Any, ...] = field(compare=False)
    key: tuple[Any, ...] = ()
    level: Level = field(default=Level.REST, compare=False)
    night: bool = False


def _hour_of(when: object) -> int | None:
    """The hour out of an `HH:MM`, or None when that is not what it is.

    Total, because it is fed `health.now`, and a device whose clock is in the
    state this screen exists to report is exactly the device most likely to hand
    over an empty string.
    """
    parts = str(when).strip().split(":")
    if len(parts) != 2 or not parts[0].strip().isdigit():
        return None
    hour = int(parts[0])
    return hour if 0 <= hour <= 23 else None


def _minutes_of(when: object) -> int | None:
    """An `HH:MM` as minutes since midnight, or None if it is not one."""
    parts = str(when).strip().split(":")
    if len(parts) != 2:
        return None
    hour, minute = (part.strip() for part in parts)
    if not hour.isdigit() or not minute.isdigit():
        return None
    total = int(hour) * 60 + int(minute)
    return total if 0 <= total < 24 * 60 else None


def _is_quiet(hour: int | None, window: tuple[int, int]) -> bool:
    """Whether `hour` is inside a window that usually wraps midnight.

    Whole hours only. A dispenser's night is 22:00 to 07:00, nobody has ever
    wanted it to start at 22:30, and a half-hour boundary is one more thing to
    get wrong in a comparison that has to be right at the wrap.
    """
    if hour is None:
        return False
    start, end = window
    if start == end:
        return False  # an empty window; the caller has asked for no quiet hours
    if start < end:
        return start <= hour < end
    return hour >= start or hour < end


def earlier_day(at: object, now: object) -> bool:
    """Does an `HH:MM` that has just gone belong to a day before today?

    The missed screen prints a `DD-MM` only for a dose from an earlier day, and
    this is the one fact that decides it. Both strings are wall-clock times with
    no date on them, so the inference is the only one available: a dose owed at
    20:00, being reported at 09:00, cannot be today's.

    It is a claim about the past, so it fails towards saying nothing. An
    unparseable time on either side returns False and the screen prints no date,
    which is the cheaper of the two errors — a missing stamp costs somebody a
    guess, and a wrong one sends them to the log looking for a dose that was
    never scheduled.

    It is deliberately not exact. A dose missed more than a day ago reads as
    today's, and that is survivable: the ledger and the app hold the history, and
    this screen is up for five minutes.
    """
    owed, clock = _minutes_of(at), _minutes_of(now)
    if owed is None or clock is None:
        return False
    return owed > clock


def boot_stage(health: Health) -> int:
    """How much of the machine has reported in, 0..3, for the boot frame.

    Three squares fill in as the three slow things finish: the GPIO claim, the
    first clock reading, the radio starting. It lives here rather than in
    `screens.py` because the boot frame's `key` has to be exactly what the boot
    frame draws — two derivations of one number is how a panel ends up not
    repainting when the picture changed.

    Every stage needs *positive* evidence and none of them may be inferred from
    an empty field. `problem != "gpio"` on a snapshot that has not happened is
    not a GPIO claim, it is silence, and a boot screen that lit all three squares
    before anything had answered would be the panel congratulating itself.

    The radio's signal is the setup identity rather than the `wifi` value,
    because `wifi` reads `"offline"` both when the radio is genuinely off a
    network and when nobody is managing it at all. `ssid` is a constant of the
    board held by the supervisor, so it appears the moment there is a supervisor
    to ask — which is precisely the event this square is about.

    This is cosmetic and says so: the frame is up for two and a half seconds and
    a square that never lights costs nobody a dose.
    """
    return sum((
        bool(_field(health, "known", False)) and _field(health, "problem", "") != "gpio",
        bool(_field(health, "now", "")),
        bool(_field(health, "ssid", "") or _field(health, "address", "")),
    ))


def _field(health: object, name: str, default: Any) -> Any:
    """Read one field off the health snapshot, tolerating its absence.

    Not defensiveness for its own sake. This runs on the scheduler's thread and
    the rule in this package is that nothing on that thread may raise, so a
    `Health` that gains or loses a field in a refactor has to produce a slightly
    wrong screen rather than a device that stops dispensing. `dispensing`
    defaults to True for the same reason it is safe to: the failure this guards
    against is a rename, not a jammed tray, and painting a permanent "will not
    dispense" over a machine that is working sends somebody to fix nothing.
    """
    value = getattr(health, name, default)
    return default if value is None and default is not None else value


class Presence:
    """The panel's attention policy. Feed it events, call `tick`, draw what it says.

    Every duration is a constructor argument rather than a value read out of
    `config` at decision time, because this object is meant to be instantiated
    with a fake clock and a two-second dwell in a test and with the real numbers
    in the daemon. The two that have a `config` name take it as their default, so
    the number is written down once and is still overridable.
    """

    def __init__(self, *, dwell_s: float = 20.0, dim_after_s: float = 30.0,
                 missed_dwell_s: float = 300.0,
                 boot_dwell_s: float = config.DISPLAY_BOOT_DWELL_S,
                 quiet: tuple[int, int] = config.DISPLAY_QUIET_HOURS,
                 monotonic: Callable[[], float] = time.monotonic):
        self.dwell_s = max(0.0, float(dwell_s))
        #: How long the panel keeps the day palette after somebody has touched
        #: it. Long enough to read a screen and think about it, short enough that
        #: a press at 3 a.m. does not leave the room lit for the rest of the
        #: night.
        self.dim_after_s = max(0.0, float(dim_after_s))
        self.missed_dwell_s = max(0.0, float(missed_dwell_s))
        #: How long the boot frame is held after the daemon says it has started,
        #: even once every subsystem has already answered. Below about a second
        #: it is a flicker on the way to another screen rather than a machine
        #: starting deliberately.
        self.boot_dwell_s = max(0.0, float(boot_dwell_s))
        self.quiet = (int(quiet[0]), int(quiet[1]))
        self._monotonic = monotonic

        # Everything starts already expired. A `Presence` that is constructed
        # and then simply ticked settles onto the resting screen instead of
        # serving out a dwell for an event that never happened.
        self._event = ""
        self._event_at = float("-inf")
        self._ev_tray: int | None = None
        self._ev_at = ""
        self._ev_trays: tuple[int, ...] = ()
        self._ev_ssid = ""
        self._due_seen = float("-inf")
        self._due_tray: int | None = None
        self._due_at = ""
        self._boot_at = float("-inf")
        self._attention_at = float("-inf")
        self._last: Plan | None = None

    #: The resting screens. One, now — see the module docstring on the rotation.
    #: Kept as a name rather than inlined because "is this a screen that may
    #: stand for a month" is a question the painter and the tests both ask, and
    #: it should have one answer.
    REST_CARDS = ("idle",)

    # ── being told things ───────────────────────────────────────────────────

    def event(self, kind: str, *, tray: int | None = None, at: str = "",
              trays: tuple[int, ...] = (), ssid: str = "") -> None:
        """Something happened. Marks it; does not decide anything.

        Nothing is painted here — `tick` is the only thing that produces a
        `Plan`. A caller that wants an event on the panel within the second
        calls `tick` straight after `event` rather than waiting for the
        scheduler, and that is cheap because `tick` is pure.

        The keyword facts are optional and are now only ever used to decide
        *which* screen, never to draw one: every number a screen prints comes off
        the snapshot in `args`. `released` and `missed` still carry a tray
        because the event reaches this file before the snapshot that will confirm
        it, and `schedule` still carries its trays because the accepted plan is not
        on the machine's own health at all.

        An unrecognised `kind` is ignored rather than raised on. This is called
        from the scheduler, from the button's callback thread and from the web
        handlers, and none of those may die over a typo in a string.
        """
        now = self._monotonic()

        if kind in _ATTENTION:
            # Somebody is here. Wake the panel to the day palette but leave what
            # it is showing alone: pressing the button while a dose is due must
            # not replace the prompt with anything, and pressing it when nothing
            # is due is somebody asking "are you alive, when is my next one" —
            # which the resting screen already answers for free. The button is
            # inert for dispensing outside a window; the panel need not be.
            self._attention_at = now
            if kind == "boot":
                # A fresh start inherits nothing. Whatever was on the panel
                # before the power cut is not evidence about now.
                self._boot_at = now
                self._event = ""
                self._event_at = float("-inf")
                self._forget_due()
            return

        if kind == "due":
            # Latched rather than shown from here: `health.waiting` is the
            # authority on whether a dose is still outstanding, and this only
            # records that one was announced. The latch covers the gap where the
            # event has arrived and the snapshot has not caught up — trusting
            # only the snapshot would leave the panel silent for up to a tick
            # after a dose becomes due, and fifteen seconds of nothing is worse
            # than fifteen seconds of a prompt that is about to be confirmed.
            self._due_seen = now
            self._due_tray = tray
            self._due_at = at
            self._event = ""
            self._event_at = float("-inf")
            return

        if kind == "settled":
            # The caller has finished with whatever was on the panel: a dose
            # released and acknowledged, an alert withdrawn, a schedule
            # replaced. Drop both latches so the next decision falls through to
            # the resting screen.
            #
            # Without this, `dwell_s` kept the due prompt up for twenty seconds
            # after the dose it was about to announce had been cancelled — which
            # is a machine asking somebody to come and press a button for pills
            # that are not coming.
            self._event = ""
            self._event_at = float("-inf")
            self._forget_due()
            return

        if kind in _TRANSIENT:
            self._event = kind
            self._event_at = now
            self._ev_tray = tray
            self._ev_at = at
            self._ev_trays = trays
            self._ev_ssid = ssid
            if kind in ("released", "missed"):
                # That dose is finished with, one way or the other. Keeping the
                # latch would let a stale prompt reappear if a snapshot ever
                # arrived late.
                self._forget_due()
            return

        log.debug("presence: ignoring unknown event %r", kind)

    def _forget_due(self) -> None:
        self._due_seen = float("-inf")
        self._due_tray = None
        self._due_at = ""

    # ── deciding ────────────────────────────────────────────────────────────

    def tick(self, health: Health) -> Plan | None:
        """What should be on screen now, or None if it is already there.

        `None` means *leave the panel alone*. It is not "blank it" and it is not
        an error: for a machine sitting idle it is the answer nine ticks out of
        ten, and it is what keeps a 38 ms full-panel SPI transfer off a loop that
        also has to hit a scheduled minute.

        The plan is stored even when it is a repeat, so that `_last.args` always
        carries the freshest snapshot. Nothing here reads it, but the painter
        does: it is the object it redraws from when the status bar and the
        schedule band have both changed under a screen that is otherwise still
        correct.
        """
        try:
            plan = self._decide(health)
        except Exception:  # noqa: BLE001
            # A policy that cannot make up its mind must not take the scheduler
            # down with it, and it must not blank the panel either — whatever is
            # up there is at worst stale, which beats a dark screen that reads
            # as a dead machine. Logged loudly because it is unreachable.
            log.exception("presence: the display policy failed; leaving the screen as it is")
            return None

        repeat = plan == self._last
        self._last = plan
        return None if repeat else plan

    def _decide(self, health: Health) -> Plan:
        now = self._monotonic()
        attended = now - self._attention_at < self.dim_after_s
        quiet = _is_quiet(_hour_of(_field(health, "now", "")), self.quiet)

        def plan(screen: str, args: tuple[Any, ...], key: tuple[Any, ...],
                 level: Level) -> Plan:
            # The night substitution is decided once, here, so that no layer can
            # forget the two exceptions: a waiting dose is never quietened, and
            # neither is a panel somebody has just pressed a button on. Both are
            # somebody standing in front of the machine at 3 a.m., which is the
            # one time the screen has to be at its most readable rather than its
            # least.
            return Plan(screen=screen, args=args, key=key, level=level,
                        night=quiet and not attended and level is not Level.ALERT)

        # 0. The machine has just started and is still finding its feet.
        #
        #    Only for the dwell after `event("boot")`, and deliberately NOT for
        #    "no snapshot has arrived yet". Those two look the same and are not:
        #    a machine that has genuinely just been plugged in should say so,
        #    but a machine that has something to *report* — a dose due, a tray
        #    that will not open — must say that instead, whether or not a
        #    snapshot has caught up with it yet.
        #
        #    Conflating them cost exactly that. `dose_due` firing before the
        #    first snapshot was swallowed by the boot frame, so a dose that came
        #    due in the seconds after a restart was announced by the chirp and
        #    by nothing on the panel. The "nothing has told us anything" case
        #    still has a frame; it sits at the bottom, where it belongs, as the
        #    resting state of a machine with nothing yet to say.
        if now - self._boot_at < self.boot_dwell_s:
            return plan("boot", (health,), (boot_stage(health),), Level.REST)

        # 1. Will not dispense. Above the dose prompt, for the reason in the
        #    module docstring: never tell somebody to press a button that has
        #    been disconnected from the thing it is supposed to do.
        if not _field(health, "dispensing", True):
            return plan("blocked", (health,),
                        (_field(health, "problem", ""),
                         _field(health, "address", ""),
                         _field(health, "ssid", "")),
                        Level.STANDING)

        # 2. A dose is waiting. Stands for as long as it is true, in the day
        #    palette, at any hour. Every fact it draws is read from the one
        #    reading of `awaiting_release` the snapshot took, so the tray, the
        #    time and the window bar cannot describe three different doses.
        waiting = _field(health, "waiting", 0)
        announced = now - self._due_seen < self.dwell_s
        if (isinstance(waiting, int) and waiting > 0) or announced:
            health = self._with_latched_dose(health)
            return plan("due", (health,),
                        (_field(health, "waiting_tray", None),
                         _field(health, "waiting_at", ""),
                         _field(health, "waiting_frac", 0),
                         _field(health, "waiting", 0)),
                        Level.ALERT)

        # 3. Something happened recently.
        wifi = str(_field(health, "wifi", ""))
        if self._event and now - self._event_at < self._dwell_for(self._event):
            transient = self._transient(self._event, health, wifi)
            if transient is not None:
                return plan(_TRANSIENT[self._event], *transient, Level.NOTICE)

        # 4. Not on a network and somebody in the room has to do something.
        if wifi in _NEEDS_SETUP:
            return plan("network", (health,),
                        (wifi, _field(health, "ssid", ""),
                         _field(health, "passphrase", "")),
                        Level.STANDING)

        # 5a. Nothing is happening and nothing has been read yet. The resting
        #     frame would be drawn entirely from empty fields — a status bar of
        #     confident nothings and a hero with no dose and no clock — so the
        #     boot frame stands in, which is the honest picture of a machine
        #     that is up and has not yet taken a reading of itself.
        if not _field(health, "known", False):
            return plan("boot", (health,), (boot_stage(health),), Level.REST)

        # 4b. On a network, and nobody has sent it a prescription yet.
        #
        #     This is the second half of setup and it used to have no screen at
        #     all. The machine sat on the resting frame saying "no doses today",
        #     which is true and useless: it is also what a fully configured
        #     dispenser says on a Sunday, so the one state where somebody has to
        #     go and *do* something looked exactly like the state where nobody
        #     does. The step that was missing is the phone, and the phone is
        #     reached by photographing the code — so the code goes on the panel.
        #
        #     Below the network frame because the order is forced: a phone
        #     cannot reach a dispenser that is not on a network yet. Below
        #     `known` because a frame drawn before the first reading would print
        #     an empty code, and a QR of nothing is a code that scans as garbage.
        #
        #     Above the resting frame and nowhere near the dose frames — every
        #     rung above this one is the machine doing its job, and a setup card
        #     must never cover a dose that is waiting to be pressed.
        if not _field(health, "prescribed", False) and _field(health, "pair_payload", ""):
            return plan("pair", (health,),
                        (_field(health, "claim", ""),
                         _field(health, "pair_payload", "")),
                        Level.STANDING)

        # 5. Nothing is happening, which is still worth a screen: the next dose,
        #    the day so far, and where to find this machine on the network.
        next_at = _field(health, "next_at", "")
        return plan("idle", (health,),
                    (_field(health, "next_tray", None), next_at,
                     # The hero shows the wall clock only when there is no dose
                     # left to show instead. Including `now` unconditionally
                     # would repaint the whole panel every minute for a number
                     # that is in the status bar, where a minute costs 5.76 ms
                     # rather than 38.4.
                     "" if next_at else _field(health, "now", ""),
                     _field(health, "address", ""),
                     _field(health, "trays_loaded", 0)),
                    Level.REST)


    def _with_latched_dose(self, health):
        """Fill in the dose the event named, when the snapshot has not caught up.

        `dose_due` arrives the instant the scheduler offers a dose; the `Health`
        that knows about it is taken on the *next* tick, up to fifteen seconds
        later. Between those two the screen used to draw `health.waiting_tray`,
        which was still None — so the loudest frame this device has said tray
        `?` at `--:--` for a quarter of a minute, while the chirp was already
        calling somebody to come and read it.

        The latch has held the right answer the whole time; this is what lets it
        reach the glass. The snapshot still wins wherever it has an opinion,
        because it is the reading that saw `awaiting_release` and this is only a
        record of what was announced.
        """
        if self._due_tray is None:
            return health
        if _field(health, "waiting_tray", None) is not None:
            return health
        try:
            from dataclasses import replace  # noqa: PLC0415

            return replace(
                health,
                waiting_tray=self._due_tray,
                waiting_at=self._due_at or _field(health, "waiting_at", ""),
                waiting=max(1, _field(health, "waiting", 0) or 0),
            )
        except Exception:  # noqa: BLE001 - a stub Health in a test or selftest
            # Never onto the scheduler thread, and never worth losing the frame
            # over: the unfilled snapshot still draws, it just says `?`.
            return health


    def _with_latched_ssid(self, health):
        """Put the SSID the supervisor just announced onto the snapshot."""
        if not self._ev_ssid or _field(health, "ssid", ""):
            return health
        try:
            from dataclasses import replace  # noqa: PLC0415

            return replace(health, ssid=self._ev_ssid)
        except Exception:  # noqa: BLE001 - a stub Health in a test or selftest
            return health

    def _dwell_for(self, kind: str) -> float:
        return self.missed_dwell_s if kind == "missed" else self.dwell_s

    def _transient(self, kind: str, health: Health,
                   wifi: str) -> tuple[tuple[Any, ...], tuple[Any, ...]] | None:
        """`(args, key)` for a dwelling screen, or None to skip it entirely.

        The skip exists for one case. A `network` event fires whenever the radio
        changes state, including on the way *back* to online, and
        `screens.network` says one thing only: put me on a network. Showing it to
        celebrate a successful join would tell somebody to go and do a job that
        has just finished, so that transition gets no screen of its own and falls
        through to whatever is underneath — which, since the join succeeded, is
        the resting screen.
        """
        if kind == "released":
            # 화면을 주지 않는다. 아래로 떨어져 쉬는 화면이 나온다.
            #
            # 배출은 **눈앞에서 일어난다.** 서보가 돌고 약이 컵에 떨어지는 것이
            # 확인이고, 거기에 화면을 하나 더 얹는 것은 이미 끝난 일을 다시
            # 알리는 일이다. 벤치에서 그대로 나온 말: "어차피 모터가 돌아가니까
            # 확인음 정도만 해주면 되고, 차라리 빨리 메인 화면으로 돌아가주는 게
            # 더 중요할 듯. 약간 혼란스러움."
            #
            # 확인이 아예 없어지는 것은 아니다. 누르는 순간 알람이 그치고 짧은
            # 확인음이 나며(`Indicator.acknowledge`), 같은 프레임 아래 띠에서 그
            # 복용의 표시가 파랑으로 바뀐다 — 내일 "먹었나" 를 되짚을 때 사람이
            # 실제로 보는 것이 그 띠다.
            #
            # 파랑이 색 어휘에서 사라지는 것도 아니다. 그 띠의 표시가 계속 쓴다.
            return None
        if kind == "missed":
            return ((health, self._ev_tray, self._ev_at),
                    (self._ev_tray, self._ev_at,
                     earlier_day(self._ev_at, _field(health, "now", ""))))
        if kind == "schedule":
            return (health, self._ev_trays), (self._ev_trays,)
        if kind == "network":
            # An SSID on the event is the supervisor saying it has just raised
            # the hotspot, and that is better evidence than the snapshot, which
            # can be a tick behind. Without it the setup card was skipped at
            # exactly the moment it was needed — the radio had changed, the
            # cached health had not, and the one screen somebody has to read to
            # get the machine onto WiFi never appeared.
            if not self._ev_ssid and wifi not in ("hotspot", "failed", "joining"):
                return None
            # The event's SSID wins over the snapshot's, for the reason above —
            # and it has to reach the *screen*, not just this decision. The
            # setup frame prints the name somebody is about to type into a
            # phone, so a frame drawn from a snapshot that has not caught up is
            # a frame with a blank where the network should be, which sends
            # them hunting through a WiFi list for something that is not there.
            health = self._with_latched_ssid(health)
            return (health,), (wifi, _field(health, "ssid", ""),
                               _field(health, "passphrase", ""))
        return None

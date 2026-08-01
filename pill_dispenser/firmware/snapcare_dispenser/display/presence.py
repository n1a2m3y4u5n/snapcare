"""When the panel is on, how bright it is, and what it is showing.

Why this file exists
--------------------
Until now the screen showed whatever the last event painted, and it showed it
for ever. A dose released at eight in the morning was still lit at midnight,
because nothing ever decided otherwise. That is not a policy, it is the absence
of one, and it costs three separate things: an OLED that ages under a picture
nobody is looking at, a 2.8-inch backlight burning in a bedroom at three in the
morning, and — worst — a panel whose contents stopped being true hours ago.

So the decision moves here, into one object with no wires attached to it. This
file answers a single question, once per scheduler tick: *given what just
happened and what the machine currently is, what should be on the screen and how
bright.* It draws nothing, opens nothing and sleeps nothing. `tick` is a pure
function of the clock, the events it has been told about, and the `Health` it is
handed, which is what makes the whole policy drivable from a fake clock through
a simulated day — and a policy about time that cannot be tested against time is
a policy nobody will ever change again.

It imports nothing that draws, on purpose. `Plan.screen` is the *name* of a
function in `screens.py`, not the function, so this module has no font, no
glyphs and no panel in its import graph; a test asserts on a string.

The ranking, which is the whole design
--------------------------------------
Five layers, and the top one wins outright:

    1  the machine will not dispense      `blocked`   stands until fixed
    2  a dose is waiting on a press       `due`       stands, and stays bright
    3  something just happened            a dwell, then it falls back
    4  it needs putting on a network      `network`   stands until somebody does
    5  nothing is happening               `idle`      the resting screen

Layer 2 above layer 3 is what the brief calls the standing dose alert, and it is
the important one: a dose waiting on a press is not a notification that has been
delivered, it is the entire prompt, and it has to still be there when somebody
walks back in with a glass of water four minutes later. Nothing transient may
paint over it and quiet hours may not dim it.

Layer 1 above layer 2 is a deliberate departure from that rule and the one
judgement in this file worth arguing with. When the tray will not open, a screen
telling somebody to press a button is a lie — they press it, nothing happens,
and the machine has spent the one instruction it is capable of giving on an
action that cannot succeed. `blocked` says the true thing instead: no pills are
coming, fetch somebody. The two states should not co-occur — the scheduler ought
not to offer a dose it cannot release — and if they ever do, that contradiction
is itself the fault worth showing.

What dwells and what stands
---------------------------
A transient is something that *happened*: a dose went into the cup, a schedule
arrived. It is news, it is true for a moment, and afterwards the resting screen
is more use than the news is. It gets `dwell_s` and falls back.

A standing state is something that *is*: the clock cannot be trusted, there is
no network configured. Those do not dwell, because they are still true in ten
minutes and a person who walks in then needs to see them exactly as much as the
person who walked in when they started. Falling back to a cheerful idle screen
would be the machine forgetting.

A missed dose sits between the two and is treated as a long transient. It is
history rather than a condition — nothing about it can be fixed — but it is the
one piece of history nobody has seen yet, so it holds for `missed_dwell_s`,
which is long enough that somebody who heard the buzzer from another room and
came to look still finds out *which* dose it was. It costs a lit panel for five
minutes, at night as well; quiet hours dim it rather than taking it away.

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

Quiet hours
-----------
This device sits on a bedside table. A 2.8-inch backlight at full brightness at
3 a.m. is a real complaint and one that gets a machine unplugged, which is the
worst outcome this project has.

So between `quiet` hours the panel drops to a level that is legible in a dark
room and invisible from a bed. It **dims and never blanks**, because the person
waking at three wondering whether they have a dose due must be able to answer
that by looking, not by finding a button in the dark. And the dimming has one
exception, which is layer 2: a dose waiting at 3 a.m. is the single event this
machine exists for, and it gets full brightness at any hour.

Quiet hours are read off `health.now` — the device's own clock, the same one the
doses are scheduled against — and not off `time.localtime`, so that a test can
drive midnight without touching the system clock, and so that a device with a
clock nobody has vouched for cannot decide it is night. An unparseable `now` is
treated as daytime: brighter than it needs to be beats a machine that dims
itself permanently because its clock returned a blank string.

Burn-in, which is this file's problem and nobody else's
-------------------------------------------------------
An OLED ages where it is lit. The resting screen is up for something like
twenty-three hours a day for years, and a static one leaves a permanent ghost of
a clock face and a colon in the middle of every screen that follows it. Two
defences, both here, because neither is enough alone:

**Reduced drive.** The resting screen never runs at full brightness — 128 in the
day and 24 at night against 255 — and on the SSD1306 that maps straight onto
`contrast`, which is drive current rather than gamma. Less current is
proportionally less ageing, and it is free: 128 is perfectly legible indoors.

**Drift.** Every `drift_period_s` the resting layout moves one step around an
eight-position ring inside a 3x3 pixel box, so no edge sits over the same pixels
for more than ten minutes at a time. Be honest about what this buys: it softens
*edges*, and does nothing at all for the interior of a large lit glyph, which
ages exactly as fast wherever it is. It is a mitigation, not a fix. What it
costs is a repaint every ten minutes that `tick` would otherwise have suppressed
— 38 ms of SPI, four times an hour, which is nothing.

Drift applies to every screen that can stand for hours and not to the transients,
which cannot be up long enough to matter. The one screen it cannot help is the
due screen on the OLED, which is a fully inverted panel: every pixel is lit and
moving it moves nothing. That one is bounded by the grace window instead — an
hour, once or twice a day, and the alternative is a dose prompt somebody misses.

`burn_in` defaults to True even though the ILI9341 does not burn in, because the
cost of drifting a panel that does not need it is two pixels of offset nobody
will ever see, and the cost of not drifting one that does is a permanent mark.
Asymmetric, so take the safe side by default.

Brightness is a request, not a promise
--------------------------------------
`Plan.brightness` is 0..255 and what happens to it depends on the panel. On the
SSD1306 it is `contrast` and behaves exactly as written. On the ILI9341 the
backlight is on/off — `ili9341.backlight` explains why it is not PWM, and on this
build the LED pin is tied to 3V3 and there is nothing to switch at all — so any
non-zero value is simply "lit". Which means the 3 a.m. complaint is solved today
on the OLED and not on the LCD, and solving it there needs a hardware PWM pin,
not code.

The invariant that falls out of this, and it must hold: **no screen may depend on
being dimmed to be correct.** Every `Plan` this file emits has to be the right
thing to show at full brightness, because on half the builds that is what it
will get. Dimming is comfort, never meaning.

Returning None is load-bearing
------------------------------
A full 240x320 repaint is 38 ms of SPI and this runs on the scheduler tick every
15 s. `tick` returns `None` — meaning "change nothing" — whenever the plan it
would produce is identical to the one it last returned, which for a device
sitting idle is almost always. Only the minute rolling over on the clock, the
drift stepping, the brightness changing, or something actually happening
produces a frame. Callers must treat `None` as *leave the panel alone*, not as
*blank it*.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING, Any, Callable

if TYPE_CHECKING:  # pragma: no cover - typing only; see below
    from .health import Health

# `Health` is imported for the annotation and never at runtime. This file is a
# policy over a value object, and it reads that object's fields — it has no use
# for `shape_for`, and no business pulling in a module whose `snapshot()` reaches
# for the dispenser, the network and the cloud. The practical payoff is that a
# fake with the same seven fields drives every test in this module, and the
# policy can be exercised long before there is a machine to snapshot.
#
# `shape_for` is deliberately not consulted anywhere below, which is worth
# stating because it looks like an omission. The three-level grammar is about
# how bad a state is; this file is about whether a state is *still true*. Those
# are different axes and they cross: `missed` is a triangle and dwells, `network`
# is the same triangle and stands. Ranking screens by shape would happen to work
# on today's states and would be a coincidence, not a rule.

log = logging.getLogger(__name__)

__all__ = ["Level", "Plan", "Presence"]


class Level(Enum):
    """How much of the person's attention a screen is entitled to.

    This is not the three-level SAFE/CAUTION/AVOID grammar from `shapes.py` and
    must not be confused with it. That one grades how bad the machine's state is,
    for the person reading the panel. This one grades how long the screen may
    stand and how much light it may use, for the panel itself.
    """

    ALERT = "alert"        # a dose is waiting on a press — the reason for the device
    STANDING = "standing"  # still true, and will be until somebody acts
    NOTICE = "notice"      # it just happened; it will stop mattering shortly
    REST = "rest"          # nothing is happening


#: Full drive. On the OLED this is a sunlit-kitchen setting and the fastest way
#: to age the panel, which is why almost nothing here asks for it.
FULL = 255

#: What each level gets by day. `STANDING` sits below `NOTICE` even though it is
#: the more serious of the two, and that is not a mistake: a notice is up for
#: twenty seconds and a standing screen can be up for weeks. The setup screen on
#: a dispenser that never got configured is the worst burn-in case this device
#: has, and 192 is still comfortably readable across a room.
_DAY = {Level.ALERT: FULL, Level.STANDING: 192, Level.NOTICE: FULL, Level.REST: 128}

#: And by night. 24 on the OLED is legible in a dark room from arm's length and
#: does not light the room; 72 is enough to notice from the doorway without
#: being a lamp. Neither is ever 0 — see the module docstring on blanking.
_NIGHT = {Level.ALERT: FULL, Level.STANDING: 72, Level.NOTICE: 72, Level.REST: 24}

#: The drift ring: eight positions around the edge of a 3x3 box, all
#: non-negative so that a caller which clamps at the origin loses nothing. Two
#: pixels is within the margin `screens.py` already keeps clear on every panel
#: (4 px on the 128x64 OLED), so nothing is ever pushed off the edge, and it is
#: far below the point where a person would notice the layout had moved.
_DRIFT: tuple[tuple[int, int], ...] = (
    (0, 0), (1, 0), (2, 0), (2, 1), (2, 2), (1, 2), (0, 2), (0, 1),
)

#: Events that mean a person is standing in front of the machine right now.
#: Everything else in the vocabulary is the machine talking to itself.
_ATTENTION = frozenset({"boot", "button", "touch"})

#: The events that put a screen up for a dwell, and the screen each one names.
_TRANSIENT = {
    "released": "released",
    "missed": "missed",
    "schedule": "schedule",
    "network": "network",
}


@dataclass(frozen=True)
class Plan:
    """What should be on the panel now. Compared for equality, so it is frozen.

    `screen` is the name of a function in `screens.py` and `args` is everything
    after its `canvas`, so a caller is exactly:

        fn = getattr(screens, plan.screen)
        fn(canvas, *plan.args)

    The seven names and their arguments, which match `screens.py` as it stands:

        due       (tray, when)          released  (tray,)
        missed    (tray, when)          schedule  (tray_count,)
        network   (ssid,)               blocked   (reason_kind,)
        idle      (now, next_tray, next_at)

    `offset` is the burn-in drift, in pixels, and it is a request the caller may
    ignore — a caller that ignores it gets a correct screen that never moves.
    Honouring it means translating the whole frame by `(dx, dy)`, which is a
    dozen lines: wrap the canvas in a proxy whose `pixel` adds the offset before
    it delegates. It is expressed here rather than inside `screens.py` because
    the screens are a layout problem and this is an ageing problem, and mixing
    the two would put a `dx` parameter on seven functions that have no reason to
    know what an OLED is.

    `level` is why the brightness is what it is. Nothing needs it to draw; it is
    for the log line, and for a test to assert on the policy rather than on a
    number.
    """

    screen: str
    args: tuple[Any, ...]
    brightness: int
    offset: tuple[int, int] = (0, 0)
    level: Level = Level.REST


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

    Every duration is a constructor argument rather than a `config` import,
    because this object is meant to be instantiated with a fake clock and a
    two-second dwell in a test and with the real numbers in the daemon, and
    because a policy file that reads global configuration is a policy file that
    can only be tested one way.
    """

    def __init__(self, *, dwell_s: float = 20.0, dim_after_s: float = 30.0,
                 missed_dwell_s: float = 300.0, quiet: tuple[int, int] = (22, 7),
                 drift_period_s: float = 600.0, rest_rotate_s: float = 8.0,
                 burn_in: bool = True,
                 monotonic: Callable[[], float] = time.monotonic):
        self.dwell_s = max(0.0, float(dwell_s))
        #: How long the panel stays at full brightness after somebody has
        #: touched it. Long enough to read a screen and think about it, short
        #: enough that a press at 3 a.m. does not leave the room lit.
        self.dim_after_s = max(0.0, float(dim_after_s))
        self.missed_dwell_s = max(0.0, float(missed_dwell_s))
        self.quiet = (int(quiet[0]), int(quiet[1]))
        self.drift_period_s = max(0.0, float(drift_period_s))
        #: Seconds each resting screen holds before the next takes its turn.
        #:
        #: Eight is long enough to read a clock and a next-dose line without
        #: hurrying, and short enough that somebody who walked over to check one
        #: particular thing does not stand there waiting for it to come round.
        #: Below about five it reads as flickering; above about fifteen the
        #: second screen might as well not be there.
        self.rest_rotate_s = max(1.0, float(rest_rotate_s))
        self.burn_in = bool(burn_in)
        self._monotonic = monotonic

        # Everything starts already expired. A `Presence` that is constructed
        # and then simply ticked settles onto the resting screen instead of
        # serving out a dwell for an event that never happened.
        self._event = ""
        self._event_at = float("-inf")
        self._ev_tray: int | None = None
        self._ev_at = ""
        self._ev_count: int | None = None
        self._due_seen = float("-inf")
        self._due_tray: int | None = None
        self._due_at = ""
        self._ev_ssid = ""
        self._rest_since: float | None = None
        self._attention_at = float("-inf")
        self._last: Plan | None = None

    # ── being told things ───────────────────────────────────────────────────

    def event(self, kind: str, *, tray: int | None = None, at: str = "",
              count: int | None = None, ssid: str = "") -> None:
        """Something happened. Marks it; does not decide anything.

        Nothing is painted here — `tick` is the only thing that produces a
        `Plan`. A caller that wants an event on the panel within the second
        calls `tick` straight after `event` rather than waiting for the
        scheduler, and that is cheap because `tick` is pure.

        The keyword facts are optional and exist because a screen without them
        is a screen missing the point. `released` with no tray is a picture of a
        cup that will not say which drawer to look in, and `screens.py` renders
        the gap as `?` — honest, and much less use than a number. Pass them when
        you have them; the policy degrades quietly when you do not.

        An unrecognised `kind` is ignored rather than raised on. This is called
        from the scheduler, from the button's callback thread and from the web
        handlers, and none of those may die over a typo in a string.
        """
        now = self._monotonic()

        if kind in _ATTENTION:
            # Somebody is here. Wake the panel but leave what it is showing
            # alone: pressing the button while a dose is due must not replace
            # the prompt with anything, and pressing it when nothing is due is
            # somebody asking "are you alive, when is my next one" — which the
            # resting screen already answers, brightly, for free. The button is
            # inert for dispensing outside a window; the panel need not be.
            self._attention_at = now
            if kind == "boot":
                # A fresh start inherits nothing. Whatever was on the panel
                # before the power cut is not evidence about now.
                self._event = ""
                self._event_at = float("-inf")
                self._forget_due()
            return

        if kind == "due":
            # Latched rather than shown from here: `health.waiting` is the
            # authority on whether a dose is still outstanding, and this only
            # records *which* dose, plus the fact that it was announced. The
            # latch covers the gap where the event has arrived and the snapshot
            # has not caught up — trusting only the snapshot would leave the
            # panel silent for up to a tick after a dose becomes due, and
            # fifteen seconds of nothing is worse than fifteen seconds of a
            # prompt that is about to be confirmed anyway.
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
            # the resting screens.
            #
            # Without this, `dwell_s` kept the due prompt up for twenty seconds
            # after the dose it was about to announce had been cancelled — which
            # is a machine asking somebody to come and press a button for pills
            # that are not coming.
            self._event = ""
            self._event_at = float("-inf")
            self._forget_due()
            return

        if kind == "blocked":
            # Deliberately close to inert, and the reason matters: a screen that
            # says "this machine will not open a tray" has to be backed by the
            # field that decides whether it will, not by a message that arrived
            # once and might since have been resolved. `health.dispensing` is
            # that field. What this does do is take down any dwell that would
            # otherwise hide the fault for the next twenty seconds.
            self._event = ""
            self._event_at = float("-inf")
            self._forget_due()
            return

        if kind in _TRANSIENT:
            self._event = kind
            self._event_at = now
            self._ev_tray = tray
            self._ev_at = at
            self._ev_count = count
            self._ev_ssid = ssid
            if kind in ("released", "missed"):
                # That dose is finished with, one way or the other. Keeping the
                # latch would let a stale tray number reappear on tomorrow's due
                # screen if a snapshot ever arrived late.
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
        ten, and it is what keeps a 38 ms full-panel SPI transfer off a loop
        that also has to hit a scheduled minute.
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

        if plan == self._last:
            return None
        self._last = plan
        return plan

    #: The screens the resting rotation cycles through. Named here so that
    #: `_decide` can tell resting from everything else without guessing.
    REST_CARDS = ("idle", "status", "wifi")

    def _decide(self, health: Health) -> Plan:
        plan = self._decide_inner(health, self._monotonic())
        if plan.screen not in self.REST_CARDS:
            # Anything that takes the panel restarts the rotation, so the first
            # frame after it always lands on `idle`.
            self._rest_since = None
        return plan

    def _decide_inner(self, health: Health, now: float) -> Plan:
        attended = now - self._attention_at < self.dim_after_s
        quiet = _is_quiet(_hour_of(_field(health, "now", "")), self.quiet)

        # 1. Will not dispense. Above the dose prompt, for the reason in the
        #    module docstring: never tell somebody to press a button that has
        #    been disconnected from the thing it is supposed to do.
        if not _field(health, "dispensing", True):
            return self._plan("blocked", (_field(health, "problem", ""),),
                              Level.STANDING, quiet, attended, now)

        # 2. A dose is waiting. Stands for as long as it is true, at full
        #    brightness, at any hour.
        waiting = _field(health, "waiting", 0)
        announced = now - self._due_seen < self.dwell_s
        if (isinstance(waiting, int) and waiting > 0) or announced:
            tray = self._due_tray if self._due_tray is not None else _field(health, "next_tray", None)
            when = self._due_at or _field(health, "next_at", "")
            return self._plan("due", (tray, when), Level.ALERT, quiet, attended, now)

        # 3. Something happened recently.
        wifi = str(_field(health, "wifi", ""))
        if self._event and now - self._event_at < self._dwell_for(self._event):
            args = self._transient_args(self._event, health, wifi)
            if args is not None:
                return self._plan(_TRANSIENT[self._event], args,
                                  Level.NOTICE, quiet, attended, now)

        # 4. Not on a network and somebody has to do something about it.
        #
        #    Only `hotspot`. A device that is merely `offline` has a router
        #    problem, and nobody standing in the room can fix a router by
        #    reading a screen — putting the cyan setup card up permanently for
        #    that would spend the one persistent screen on something unactionable
        #    and, worse, would name a setup network that is not being broadcast.
        #    It would also hide the clock and the next dose, which are what that
        #    person actually came to find out. Offline gets a dwell at layer 3
        #    when it changes, and then the resting screen.
        if wifi == "hotspot":
            return self._plan("network", (_field(health, "ssid", ""),),
                              Level.STANDING, quiet, attended, now)

        # 5. Nothing is happening, which is still worth a screen: alive, the
        #    time, and when the next dose is. `screens.idle` argues that one.
        screen, args = self._resting(health, now)
        return self._plan(screen, args, Level.REST, quiet, attended, now)

    def _resting(self, health: Health, now: float) -> tuple[str, tuple[Any, ...]]:
        """Which resting screen it is this turn, and its arguments.

        The resting state used to be `idle` for ever, which answered "is it
        alive, what time is it, when is my next dose" and nothing else. The
        questions somebody actually walks over to ask are wider than that: is it
        on the network, has the relay heard from me, what is that thing it has
        been quietly unhappy about. Those have screens now — and a screen
        nothing ever shows is a screen that does not exist.

        So the resting state **rotates**. No button, no gesture, nothing to
        learn: the panel takes its turn through what it has to say, slowly
        enough to read. That is the accessible answer. Putting the second screen
        behind an interaction would put it behind a skill this device may not
        assume, and the person who most needs to know the machine is off the
        network is the least likely to go looking for a way to ask.

        `wifi` earns a turn only when the radio has something to say. On a
        device that has been happily online for a month it reads "yes, still
        fine" — true, and a waste of one of the few turns anybody will look at.

        It is also the best thing available for the OLED: a rotating panel is
        one that is not burning a single static frame into the glass for months.
        """
        cards = ["idle", "status"]
        if _field(health, "wifi", "") != "online":
            cards.append("wifi")

        # Anchored to when resting began, not to the process's uptime.
        #
        # Against absolute monotonic time the turn is whatever the clock happens
        # to be on, so the first frame a person sees after walking up is an
        # arbitrary card — and `idle`, the one that answers "is it alive and
        # when is my next dose", is the one they most often wanted. Anchoring
        # also makes the sequence reproducible, which is the difference between
        # a testable policy and one nobody can pin down.
        if self._rest_since is None:
            self._rest_since = now
        turn = int((now - self._rest_since) // self.rest_rotate_s)
        return cards[turn % len(cards)], (health,)

    def _dwell_for(self, kind: str) -> float:
        return self.missed_dwell_s if kind == "missed" else self.dwell_s

    def _transient_args(self, kind: str, health: Health,
                        wifi: str) -> tuple[Any, ...] | None:
        """Arguments for a dwelling screen, or None to skip it entirely.

        The skip exists for one case. A `network` event fires whenever the radio
        changes state, including on the way *back* to online, and
        `screens.network` says one thing only: put me on a network. Showing it
        to celebrate a successful join would tell somebody to go and do a job
        that has just finished, so that transition gets no screen of its own and
        falls through to whatever is underneath — which, since the join
        succeeded, is the resting screen.
        """
        if kind == "released":
            return (self._ev_tray,)
        if kind == "missed":
            return (self._ev_tray, self._ev_at)
        if kind == "schedule":
            return (self._ev_count,)
        if kind == "network":
            # An SSID on the event is the supervisor saying it has just raised
            # the hotspot, and that is better evidence than the snapshot, which
            # can be a tick behind. Without it the setup card was skipped at
            # exactly the moment it was needed — the radio had changed, the
            # cached health had not, and the one screen somebody has to read to
            # get the machine onto WiFi never appeared.
            if self._ev_ssid:
                return (self._ev_ssid,)
            if wifi not in ("hotspot", "joining"):
                return None
            return (_field(health, "ssid", ""),)
        return None

    def _plan(self, screen: str, args: tuple[Any, ...], level: Level,
              quiet: bool, attended: bool, now: float) -> Plan:
        return Plan(screen=screen, args=args,
                    brightness=self._brightness(level, quiet, attended),
                    offset=self._offset(level, now), level=level)

    def _brightness(self, level: Level, quiet: bool, attended: bool) -> int:
        """0..255, and see the module docstring on what a panel does with it."""
        if level is Level.ALERT:
            # The one exception to quiet hours, and the reason the device exists.
            return FULL
        if attended:
            # Somebody has just pressed something, so somebody is standing there
            # reading it — at three in the morning as much as at noon. Dimming
            # the screen of a person who has explicitly asked for it is the
            # wrong side of the trade.
            return FULL
        return (_NIGHT if quiet else _DAY)[level]

    def _offset(self, level: Level, now: float) -> tuple[int, int]:
        """Where the layout sits this minute, for burn-in.

        Only for screens that can stand for hours. A transient is up for twenty
        seconds and moving it would be a visible twitch bought for no protection
        at all.
        """
        if not self.burn_in or self.drift_period_s <= 0 or level is Level.NOTICE:
            return (0, 0)
        return _DRIFT[int(now // self.drift_period_s) % len(_DRIFT)]

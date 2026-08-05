"""What the machine would say about itself, in one reading.

Why this file exists
--------------------
"Is this machine all right" is a question no single object in this firmware can
answer. The dispenser knows whether a tray will open. The scheduler knows what
is owed. The network supervisor knows which mode the one radio is in. The relay
client knows whether the carer's phone is still hearing about doses. The clock
chip knows whether any of that survives the next power cut.

Left to themselves, every screen would go and ask those five directly, and
within a release the machine would be disagreeing with itself in front of the
person it exists to inform — the idle screen calling the device healthy while
the status bar showed a warning, because the two had picked different questions
off different objects. On a device whose whole interface is one panel that is
not a cosmetic bug: as far as anybody in the room is concerned, the panel *is*
the machine.

So there is one snapshot, taken once per tick, and every screen and the presence
policy read it and nothing else. `Health` is deliberately flat — strings, ints,
a bool, and one tuple of small frozen records. A screen handed a `Dispenser`
could ask it anything, and eventually would; a screen handed twenty-two fields
can only draw them.

One problem at a time
---------------------
`problem` is a single slug and never a list. The `blocked` frame has room for one
cause, and a person handed three faults acts on none of them. So the choice of
which one to show is made here, once, rather than by whichever screen is up.

The order is by what it costs to act on the wrong one:

    gpio   no tray can open at all, and no amount of clock changes that
    clock  the tray will not open, because nothing has vouched for the time
    card   doses are being given and no record of them reaches the card
    trays  a schedule names a tray that is not fitted
    power  the supply is sagging, silently, under everything else here
    wifi   the device is not on a network
    relay  it is on a network, and the carer's phone still is not hearing
    cell   everything works today, and the next power cut stops it

Two of those edges are causal rather than a matter of taste, and those are the
ones worth defending. **gpio before clock** because a device with no GPIO
library does not care what time it is — and because that is the order
`Dispenser.blocked_reason` itself applies, and two spellings of one precedence
is a bug waiting for somebody to fix only one of them. **wifi before relay**
because the relay cannot work without the network, so naming the relay would
send somebody to debug the cloud when the fault is a router in the hall.

`card` is third, above the fault that stops a single tray, because it is the
quietest failure this firmware has. A device whose card has gone read-only —
which is exactly how ext4's `errors=remount-ro` presents a dying SD card — keeps
dispensing perfectly, and no record of any of it survives. After the next power
cut `_restore` reads stale state, this morning's dose looks un-dispensed inside
its grace window, and it is dispensed again. Nothing else anywhere in the
firmware notices.

`trays` sits above `wifi` because it is the other silent one. A schedule naming
a tray with no servo is accepted at restore, offered to the person, and fails at
the moment they tap release — after which the dose ages out of its window and is
reported to the carer as `not-released`, a refusal nobody made. Being off the
WiFi, by contrast, is loud: the app says so from the other end within minutes.
This firmware's standing rule is that the quiet failure outranks the noisy one.

`power` sits above `wifi` for the same reason and one more. Under-voltage has no
symptom a person can see: it corrupts the card, browns out a servo in the middle
of a sweep, and produces nothing on the panel that would otherwise change. It is
also the most trivially actionable thing on this list — it means the supply is
the wrong one — so the cost of naming it when something else was the real fault
is one glance at a plug.

`cell` is last because it is a forecast rather than a fault. It is still worth a
triangle: the coin cell is the entire answer to "the power went out and the
router has not come back yet", and a chip that has never been vouched for
announces nothing at all until the morning it matters.

What this is allowed to cost
----------------------------
`snapshot` runs on the scheduler tick, four times a minute, so nothing here may
be slow. The "about 9 µs" this section used to claim was a microbenchmark
artefact, and the real cost is dominated by something that is not in this file:
`blocked_reason()` reaches `Clock.trusted` → `Clock.source` → `ntp_synchronised()`,
which forks `timedatectl`, measured at 5.8 ms. Against a 15 s tick and a 10 s
NTP cache that fork happened on *every* tick; the cache is now 60 s, so most
ticks pay nothing and a tight-loop benchmark — which always hit the cache — was
never going to show it. `clock_source` is free on top of that: the same call
already computed it.

The rest, with eight trays and three doses a day loaded, is microseconds:
`soc.undervoltage()` is a cached kernel integer behind a 2 s cache, `soc.storage()`
one `statvfs` behind a 60 s cache, `cloud.status()` a lock and a dict, and `day`
one pass over the doses the day actually has.

`wifi.status()` is three nmcli processes and is never called from this module;
the supervisor's own cached reading of the radio is used instead, which is a
value it already has in hand. `rtc.read_status()` is cached behind its own
thirty-second timer, and one thing is genuinely added rather than shared:
`Clock.source` stops at NTP on a networked device and never reaches the chip, so
on those builds this module is what keeps the RTC being probed — at most twice a
minute, which on a DS1302 is three GPIO lines being driven. That is the price of
`cell` being reported at all, and it is worth it.

One call here can block: `Dispenser.awaiting_release` takes the device's lock,
which is held for the four seconds of a servo sweep. A repaint that lands in
that window waits for it. That is the right way round — the frame it is waiting
to draw is the one describing the dose being delivered — but it is a wait, and
anything that must not wait should not call this. It is read **once** per
snapshot and the four fields that describe the waiting dose are all derived from
that one reading, because four reads would be four chances to catch that lock
and, worse, four readings that could disagree with each other mid-release.

Nothing here raises
-------------------
Every field is read behind its own guard, so one component having a bad day
costs its own field and not the other twenty-one. Anything that cannot be worked
out becomes the honest empty value — never a guess, and never an exception,
because an exception on this path would be a screen that took the dispenser down
with it.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, replace
from datetime import timedelta

from .. import config, rtc, soc
from .shapes import Shape

log = logging.getLogger(__name__)

#: The slugs `problem` can hold, most severe first. `snapshot` reports whichever
#: of these is standing first, so this tuple *is* the precedence — see the
#: module docstring for why it is in this order. A slug that is not here can
#: never be reported, which is the intended failure: the vocabulary a screen has
#: to understand is fixed, and one that grows quietly is one screens stop
#: covering.
#:
#: Every slug here must also name a status-bar slot in `bar.PROBLEM_SLOT`, which
#: is what draws the red octagon that says *which* subsystem the hero is
#: refusing about. A commit that adds a slug here adds it there in the same
#: commit; a test asserts the two agree.
PRECEDENCE: tuple[str, ...] = ("gpio", "clock", "card", "trays", "power",
                               "wifi", "relay", "cell")

#: Relay states that mean the carer's phone is not hearing about doses. `off`
#: and `unpaired` are deliberately absent — they are somebody's decision, not a
#: fault. `incompatible` is not a state `CloudLink._state` emits today; it is in
#: the vocabulary the status bar covers, and listing it here means that if the
#: relay client ever does emit it, the slug and the chip cannot disagree about
#: what it means.
_RELAY_FAULTS = ("offline", "retrying", "unsupported", "incompatible")


@dataclass(frozen=True)
class Dose:
    """One dose on one day, as the calendar draws it.

    Small, frozen and made of nothing but a nullable int, an int and two short
    strings, because a tuple of these rides inside `Health` and is compared for
    equality on every tick — see the rule on `Health`.
    """

    #: The tray, or `None` when the schedule names one this machine cannot
    #: resolve — a plan saved when eight trays were wired, read back on a
    #: machine that now has four. Never the number from the schedule in that
    #: case: this panel's standing rule is that a plausible wrong number is
    #: worse than a question mark.
    tray: int | None
    #: Minutes since midnight. What the band orders and windows by; the printed
    #: string is for reading, not for arithmetic.
    minutes: int
    #: "08:00" — the same instant as `minutes`, spelt for the panel.
    at: str
    #: waiting | taken | missed | upcoming | unknown.
    #:
    #: `unknown` is a past dose the ledger has no entry for, and it is the
    #: reason this field has five values instead of four. It must never render
    #: as `taken` and never as `upcoming`: a confident false claim about the
    #: past is the worst class of error this codebase recognises, and an empty
    #: ledger is a reachable state — `store.read_events` returns `[]`
    #: permanently after one bad UTF-8 byte.
    state: str
    #: 이 복용을 기계가 **내밀기는 했나.**
    #:
    #: `state` 로는 안 갈리는 것이 있다. 거른 복용에는 두 가지가 있는데 — 기계가
    #: 불을 켜고 울렸는데 아무도 안 눌렀다(`not-released`), 기계가 아예 안 내밀었다
    #: (`window-closed`, 그 한 시간 내내 꺼져 있었거나 시계를 못 믿었다) — 띠는 둘 다
    #: 삼각형으로 그린다. 그건 맞다: 어느 쪽이든 약이 안 나갔고 누군가는 알아야 한다.
    #:
    #: 그런데 "오늘 다 먹었다" 를 판단할 때는 갈려야 한다. 기계가 안 내민 것을 사람의
    #: 실패로 세면, 상자를 하루 꺼 뒀다는 이유로 웃는 얼굴이 사라진다.
    offered: bool = True


#: The month names the calendar's date line is drawn with, January first.
#:
#: Written out here rather than taken from `strftime`, and that is not
#: reinvention. `%b` is locale-dependent — a Pi whose LANG is not English gives
#: back a name the 5x7 face has no glyphs for, and the panel would draw a row of
#: question marks on a device that is otherwise perfectly configured. The face
#: has capitals and digits and nothing else, so the vocabulary a date can use is
#: fixed at build time and belongs where it can be read.
MONTHS: tuple[str, ...] = ("JAN", "FEB", "MAR", "APR", "MAY", "JUN",
                           "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")


@dataclass(frozen=True)
class Day:
    """One column of the calendar: a date, and what that day's doses did.

    Three of these ride in `Health` and they are compared for equality on every
    tick, which is why this is frozen and made of two short strings, a bool and
    a tuple of `Dose` — the same discipline `Dose` itself keeps and for the same
    reason.

    Yesterday and tomorrow are as real as today here. That is the point of the
    calendar: "did the evening dose go in last night" is the question a person
    actually asks a pill box, and until now the panel could not answer it at all
    — it drew today, and yesterday existed only in the app.
    """

    #: `AUG 05`, ready to draw. Assembled here rather than in the drawing code
    #: because it is a fact about the day and because `MONTHS` is here.
    label: str
    #: `26-08-04`, the same spelling the status bar uses. Not drawn — it is what
    #: a test names a column by, and what makes two `Day`s comparable without
    #: reading their doses.
    date: str
    #: Exactly one of the three is true, and it is the middle one. A column that
    #: does not know whether it is today cannot know whether to draw the
    #: highlight, and working it out by position is how the highlight ends up on
    #: the wrong column the day somebody changes the window.
    today: bool
    #: That day's doses, ascending by time. Empty for a day with nothing
    #: scheduled, which is a real answer and not an absence.
    doses: tuple[Dose, ...] = ()


@dataclass(frozen=True)
class Health:
    """One reading of the whole machine.

    **Every field must be a bucketed enum, a bool, or an integer that changes at
    most a few times a day.** This is a rule, not a preference. `Health` rides
    inside the display plan and is compared for equality to decide whether to
    repaint, so one unbucketed field — a temperature in degrees, an uptime in
    seconds, a percentage, a `lastContactSecondsAgo`, a countdown in seconds —
    turns "nine ticks out of ten the panel is left alone" into a 38 ms SPI
    transfer four times a minute for the rest of the device's life. Anything
    that genuinely changes per tick belongs on `/api/status` and in `--selftest`,
    where somebody is reading it on purpose.

    Every default is the honest empty value, which means **the defaults do not
    describe a healthy device — they describe one that has told you nothing.**
    `dispensing` defaults False and so a bare `Health()` reads as `Shape.AVOID`.
    That is deliberate and it is the cheaper of the two lies available: a false
    octagon sends somebody to look at a machine that turns out to be fine, and a
    false circle leaves a machine that is not dispensing looking perfectly well
    until somebody counts the pills. The same rule runs through every new field:
    `""` must render as an absent chip on the status bar, never as a green tick.

    A test that wants a specific state should say so — `Health(dispensing=True,
    now="12:34", next_tray=2, next_at="20:00")` — rather than starting from
    `blank()` and hoping.
    """

    #: False means the tray will not open. `Shape.AVOID`, on every panel.
    dispensing: bool = False
    #: The most severe standing problem, as one slug from `PRECEDENCE`, or "".
    #: Names the bar chip that is forced to a red octagon beside the blocked
    #: hero: the hero says how bad, the bar says which.
    problem: str = ""
    #: "online" | "hotspot" | "joining" | "failed" | "offline". Also "offline"
    #: when nobody is managing the radio — see `_network_fields`, which explains
    #: why that does not raise a `wifi` problem. "failed" is "we are back on our
    #: own setup network *because* a join did not work", which is the one case
    #: where the setup screen can say something specific about the passphrase.
    wifi: str = "offline"
    #: The device's **own setup network**, for the hotspot screen. Never the
    #: house network's name: a screen that printed the house SSID over a join
    #: instruction would be telling somebody to connect to the network they are
    #: already on.
    ssid: str = ""
    #: The setup network's passphrase, for the same screen. Without it that
    #: screen names a network the person cannot join — the QR carries it, and
    #: until now a camera that would not scan left them with nothing.
    passphrase: str = ""
    #: Where the device answers on the house network, or "". Empty on the setup
    #: hotspot on purpose — the AP's own 10.42.0.1 is not an address anybody can
    #: reach from the sofa, and a screen showing it sends them to a dead page.
    address: str = ""
    #: The ten characters printed on the label, for the pairing screen. Derived
    #: from the board's serial and therefore a constant of this machine.
    claim: str = ""
    #: What the pairing QR carries — a URL when a relay is configured, the bare
    #: `SNAPCARE-PAIR:` form when not. Both are read by the app's main camera.
    #: Empty means there is no code to draw and the pairing screen must not run.
    pair_payload: str = ""
    #: True once a schedule has arrived through the relay.
    #:
    #: This is the closest thing the device has to "a phone has claimed me". It
    #: is not the same question — pairing happens entirely inside the app, which
    #: derives its keys from the printed code and never announces itself — so
    #: the device cannot observe pairing at all. What it can observe is a
    #: schedule, and that is the thing that actually matters: a dispenser with
    #: no schedule has nothing to do, whoever has paired with it.
    #:
    #: So the pairing screen means "nobody has sent me a prescription yet", it
    #: is true whenever it is shown, and it clears exactly when the machine
    #: becomes useful.
    prescribed: bool = False
    #: The next dose still to come *today*, ignoring anything already owed. A
    #: dose waiting right now shows up in `waiting`, not here.
    next_tray: int | None = None
    next_at: str = ""      # "20:00", or "" when nothing is scheduled
    now: str = ""          # "12:34"
    #: Today, as `YY-MM-DD`. "" when no clock could be read.
    #:
    #: The panel had a time and no date. That is fine for the minute you are
    #: standing in front of it and wrong for every other question a person asks
    #: this machine — "did it give the Tuesday dose", "how long has it been
    #: sitting like this", "is this thing even running today". A clock alone
    #: cannot answer any of them, and the strip's day of doses silently means
    #: *some* day.
    #:
    #: Big end first — year, then month, then day. Two digits each.
    #:
    #: `DD-MM` first, and it was ambiguous in exactly the way dates always are:
    #: `04-08` is the fourth of August in most of the world and April the eighth
    #: in some of it, and a panel cannot tell you which convention it meant. The
    #: descending order has no such reading — nothing puts the year in the middle
    #: — so `26-08-04` is one date rather than two.
    #:
    #: The year is two digits. Four would cost the width of a whole chip to say
    #: something nobody in a kitchen is unsure about; two is enough to tell this
    #: year from the one a stopped machine is still showing.
    today: str = ""        # "26-08-04"
    #: How many doses have been offered and are waiting on a press. Not a
    #: problem and not a caution — see `shape_for`.
    waiting: int = 0

    # ── the machine's own health, one bucket each ───────────────────────────

    #: True once a snapshot has actually been taken. Everything above and below
    #: is an honest empty until then, and the panel needs to tell "nothing has
    #: told us anything yet" apart from "we asked and the answer was nothing" —
    #: the first is the boot screen, the second is a row of absent chips.
    known: bool = False
    #: Today's doses, ascending by `minutes`. Kept beside `days` rather than
    #: derived from it at every call site: "is today finished", "what is next"
    #: and the presence policy all ask about today and only today, and
    #: `days[1].doses` spelt out eleven times is eleven chances to write
    #: `days[0]`. It is the same tuple object as the middle column's.
    day: tuple[Dose, ...] = ()
    #: Yesterday, today, tomorrow — the calendar's whole input, in that order.
    #: Today is always the middle one, which is what the highlight is drawn on.
    days: tuple[Day, ...] = ()
    #: The tray of the *earliest* waiting dose, and its scheduled time. Read
    #: together from one reading of `awaiting_release`, so the due screen cannot
    #: name one dose's tray beside another dose's time — which is exactly what
    #: happened when the screen took its tray from `next_tray` instead.
    waiting_tray: int | None = None
    waiting_at: str = ""
    #: Tenths of that dose's release window still left, 0..10. Quantised to
    #: tenths on purpose and it is load-bearing: in minutes it would repaint the
    #: panel sixty times an hour, and as a float it would repaint it on every
    #: tick forever.
    waiting_frac: int = 0
    #: `Clock.source` verbatim: "ntp" | "rtc" | "api" | "cloud" | "untrusted",
    #: or "" if it could not be read. Free — `blocked_reason` already computed
    #: it on this same tick.
    clock_source: str = ""
    #: "ok" | "low" | "" — the supply, from the hwmon under-voltage flag.
    power: str = ""
    #: "ok" | "flat" | "" — the RTC's coin cell, from the same cached
    #: `rtc.read_status()` the `cell` slug is derived from.
    cell: str = ""
    #: "ok" | "low" | "readonly" | "" — whether this device can still write down
    #: what it did.
    storage: str = ""
    #: `CloudLink.status()["state"]` verbatim: off | unsupported | unpaired |
    #: connecting | connected | offline | retrying. Kept whole rather than
    #: reduced to a bool, because "paired and connected", "paired and not
    #: reaching the relay" and "never paired" are three things a person acts on
    #: differently and the bar has room to say which.
    relay: str = ""
    #: How many trays have a schedule loaded. 0 is a real state — a device with
    #: no prescription — and not the same as a device that has told us nothing.
    trays_loaded: int = 0
    #: The panel driver's last error, for `/api/status`. Never drawn: a panel
    #: that cannot be written to cannot report it on itself.
    panel_error: str = ""

    @classmethod
    def blank(cls) -> Health:
        """A machine that has said nothing, for rendering a screen with no device.

        Used by the self-test and by any test that only wants to prove a screen
        lays out. It reads as `Shape.AVOID`, for the reason in the class
        docstring: nothing here is allowed to claim a device is fine on no
        evidence, including this.
        """
        return cls()


def shape_for(health: Health) -> Shape:
    """The one place this product decides how bad something is.

    One function rather than a rule each screen applies, so the panel cannot
    show a circle in one band and a triangle in another for the same machine —
    which is exactly what happens when two files each hold half of "severe".

    Note what is *not* a caution: a dose waiting on a press. That is the machine
    doing its job, and `shapes.FOR_TONE` already made this call for `Tone.DUE`
    — spending the caution level on the most ordinary event in the device's life
    teaches people to stop reading cautions, three times a day, forever.
    """
    if not health.dispensing:
        # The octagon means "no pills are coming out of this until it is fixed",
        # and that is precisely what `blocked_reason` being set means.
        return Shape.AVOID
    if health.problem:
        return Shape.CAUTION
    return Shape.SAFE


def snapshot(dispenser, network=None, cloud=None, display=None) -> Health:
    """Read the machine. Cheap, total, and safe to call from the tick.

    `network` is a `network.Supervisor` and `cloud` a `cloud.CloudLink`; both are
    optional because both are optional on a real build — a dispenser with no
    relay and no managed radio is a supported machine, not a degraded one, and
    it must not be shown a warning about parts it does not have. `display` is
    the panel driver, for its error string alone.
    """
    try:
        return _read(dispenser, network, cloud, display)
    except Exception:  # noqa: BLE001
        # The guards below mean reaching this is a bug in *this* file rather
        # than a component misbehaving, so it is logged loudly and repeatedly:
        # the panel is about to say nothing at all, and the journal is the only
        # place the reason can be.
        #
        # `known` stays False, which is what the person in the room sees — the
        # boot frame, "this device is starting", rather than a row of confident
        # falsehoods about a machine nobody could read. It is also the honest
        # description of what just happened: we have learnt nothing this tick.
        log.exception("could not read the machine's health — the panel will "
                      "fall back to the frame it starts on")
        return Health()


def _read(dispenser, network, cloud, display=None) -> Health:
    # One reading of the clock rather than four. `day_number`, `weekday` and
    # `minutes` each call `now()` again, and a tick that lands on a minute
    # boundary would otherwise print 07:59 beside a next dose worked out at
    # 08:00 — or, at midnight, a day and a weekday that disagree about which day
    # it is and a "next dose" from yesterday's mask.
    at = _try("the clock", lambda: dispenser.clock.now(), None)

    # `blocked_reason` is the authority on whether a tray opens, rather than the
    # two gates being re-derived here. If it ever grows a third gate, this stays
    # correct about `dispensing` and merely has no slug for it — the panel says
    # "stopped" without saying why, which is survivable. Re-deriving instead
    # would have the panel say "dispensing" about a device that is not.
    blocked = _try("the dispenser", lambda: dispenser.blocked_reason(), "unreadable")
    dispensing = not blocked

    # Only asked when something is already wrong, so a healthy machine does not
    # pay for `/proc/device-tree/model` or a second trip through `Clock.source`
    # on every tick. Both are checked in the order `blocked_reason` checks them.
    no_gpio = bool(blocked) and _try(
        "the servos", lambda: not dispenser.servos_usable, False)
    no_clock = bool(blocked) and _try(
        "the clock's authority", lambda: not dispenser.clock.trusted, False)

    wifi, ssid, passphrase, address, wifi_standing = _try(
        "the network", lambda: _network_fields(network),
        ("offline", "", "", "", False))

    # One `status()` for both the field and the slug. Two calls would be two
    # dicts built under the relay's lock, and — the part that matters — two
    # readings that a reconnect landing between them could make disagree.
    relay_status = _try("the relay",
                        lambda: dict(cloud.status() or {}) if cloud else {}, {})

    # One reading of the doses waiting, for the four fields that describe them
    # and for the schedule band. See the module docstring: this is the one call
    # here that can block on the device's lock.
    owed = _try("the doses waiting", lambda: list(dispenser.awaiting_release), [])
    soonest = owed[0] if owed else None

    # The pairing code and its QR payload. A pure derivation from the board's
    # serial behind a file cache — no lock and no call into the device — but it
    # touches the filesystem on the first call, so it goes through `_try` like
    # everything else here.
    claim, pair_payload = _try("the pairing code",
                               lambda: _pair_fields(relay_status), ("", ""))

    # Has anybody taken this machine yet — and the answer moved.
    #
    # It used to be "has a prescription arrived", because pairing happens wholly
    # inside the app and the device could not observe it. That is the moment the
    # machine becomes *useful*, and it is not the moment somebody pairs: between
    # the two, a box that had just been paired went on showing a "pair with me"
    # code to the phone that had already done it. Reported from the bench in
    # exactly those words — "연결 됐는데도 기기 화면은 QR코드임".
    #
    # So the app now says so (`claimedAt`, from a `hello` command sealed under
    # the box key — only the holder of the printed code can produce one).
    #
    # The other two still count, and both are older than the relay:
    # `appliedAt` is set the first time a cloud schedule is applied and never
    # cleared, so it survives a reboot in a way a bare `desiredRev` would not.
    # And a schedule that came over the LAN or off a paper sheet never touches
    # the relay at all — a machine that is dispensing correctly must not be
    # asking to be set up.
    #
    # And one thing outranks all three: somebody unpairing in the app. `_claim`
    # clears `claimedAt` for exactly that reason and says so in its docstring —
    # "새 보호자, 새 폰, 다음에 그 앞에 서는 누구든 할 수 있는 일이 없어진다" — but
    # clearing it achieved nothing on its own, because `appliedAt` is never
    # cleared and the schedule stays on the card. So a box that had ever taken a
    # cloud schedule went on calling itself prescribed after it had been let go,
    # and the pairing code never came back to the panel. Seen on the bench: the
    # app unpaired, the relay agreed (`claimedAt: ""`), and the screen carried on
    # as though nothing had happened.
    #
    # `releasedAt` is set only by a `goodbye` and cleared by the next `hello`, so
    # this leaves the LAN-only and paper-sheet builds exactly as they were: they
    # never send one, and a machine that is dispensing correctly still must not
    # be asking to be set up.
    released = (bool(relay_status.get("releasedAt"))
                and not relay_status.get("claimedAt"))
    prescribed = (not released) and (
        bool(relay_status.get("claimedAt"))
        or bool(relay_status.get("appliedAt"))
        or _try("the loaded trays",
                lambda: bool(dispenser.scheduler.slots), False))

    next_tray, next_at = _next_dose(dispenser, at)

    # Read once and used twice: it is `Health.day` on its own, and it is the
    # middle column of `Health.days`. Two readings would be two chances for the
    # calendar's today and the policy's today to disagree about a dose that
    # settled between them, which is a panel arguing with itself.
    today_doses = _try("today's doses", lambda: _day(dispenser, at, owed), ())

    health = Health(
        dispensing=dispensing,
        wifi=wifi,
        ssid=ssid,
        passphrase=passphrase,
        address=address,
        claim=claim,
        pair_payload=pair_payload,
        prescribed=prescribed,
        next_tray=next_tray,
        next_at=next_at,
        now=f"{at.hour:02d}:{at.minute:02d}" if at is not None else "",
        today=f"{at.year % 100:02d}-{at.month:02d}-{at.day:02d}" if at is not None else "",
        waiting=len(owed),
        known=True,
        day=today_doses,
        days=_try("the three days", lambda: _days(dispenser, at, owed, today_doses), ()),
        waiting_tray=soonest.tray if soonest is not None else None,
        waiting_at=_hhmm(soonest.minutes) if soonest is not None else "",
        waiting_frac=_try("the release window",
                          lambda: _waiting_frac(soonest, at), 0),
        clock_source=_try("what is vouching for the time",
                          lambda: str(dispenser.clock.source or ""), ""),
        power=_try("the supply", soc.undervoltage, ""),
        cell=_try("the clock chip", _cell, ""),
        storage=_try("the card", soc.storage, ""),
        relay=str(relay_status.get("state") or ""),
        trays_loaded=_try("the loaded trays",
                          lambda: len(dispenser.scheduler.slots), 0),
        panel_error=_try("the panel", lambda: _panel_error(dispenser, display), ""),
    )

    # Derived from the fields the panel is about to draw rather than from a
    # second reading of the same components. That is what stops the bar's green
    # relay chip sitting beside a hero blaming the relay: there is exactly one
    # reading, and the slug is a function of it.
    standing = {
        "gpio": no_gpio,
        "clock": no_clock,
        # `low` stands as well as `readonly`, because a card with no room left
        # reports as `low` and is the same silent failure — doses given, nothing
        # written down. The cost is that the bar's amber CARD chip is only
        # reachable when something worse is the named problem, which is the
        # right way round for the quietest fault on the list.
        "card": health.storage in ("low", "readonly"),
        "trays": _try("the trays", lambda: _unfitted_tray(dispenser), False),
        "power": health.power == "low",
        "wifi": wifi_standing,
        "relay": _relay_standing(health, bool(relay_status.get("lastError"))),
        "cell": _cell_standing(health),
    }
    return replace(health,
                   problem=next((slug for slug in PRECEDENCE if standing.get(slug)), ""))


def _try(what: str, call, default):
    """Ask one component, and let it fail without taking the panel with it.

    At DEBUG, not WARNING. This runs four times a minute, so a component that is
    reliably broken would fill the journal with the same line every fifteen
    seconds and bury the one that matters — and the consequence is already on
    the panel, where an empty field and a shape that does not claim health say
    more to the person in the room than a log line ever will.
    """
    try:
        return call()
    except Exception:  # noqa: BLE001
        log.debug("could not read %s for the health snapshot", what, exc_info=True)
        return default


def _hhmm(minutes: int) -> str:
    """Minutes since midnight as `20:00`.

    Not `sc1.format_hhmm`, which spells the same instant `2000` for the wire.
    Screens want the colon, and putting the wire format on a panel is how a
    clock ends up reading as a year.
    """
    return f"{(minutes // 60) % 24:02d}:{minutes % 60:02d}"


def _next_dose(dispenser, at) -> tuple[int | None, str]:
    """The next dose still to come today, or `(None, "")`.

    Deliberately `Scheduler.upcoming`, which ignores what is owed. A dose that is
    waiting right now is in `waiting` and on the due screen; repeating it here
    would put the same dose in two places on one panel, and the resting screen
    would then be showing a time that has already passed.
    """
    if at is None:
        return None, ""
    upcoming = _try("the schedule", lambda: dispenser.scheduler.upcoming(
        at.date().toordinal(), at.weekday(), at.hour * 60 + at.minute), None)
    if not upcoming:
        return None, ""
    return upcoming[0], _hhmm(upcoming[1])


#: How far either side of today the calendar reaches. One, and the panel is laid
#: out for exactly three columns — this exists so the arithmetic below says why
#: it is 3 rather than hiding a literal in a range().
CALENDAR_REACH = 1


def _days(dispenser, at, owed, today_doses) -> tuple[Day, ...]:
    """Yesterday, today and tomorrow, as the calendar draws them.

    Today is handed in rather than rebuilt, because it has already been computed
    with the doses that are *owed right now* folded into it — and those cannot
    be recovered from the schedule or the ledger. A second pass over today would
    quietly drop the dose somebody is standing in front of.

    The other two are the schedule joined against their own day's ledger.
    Tomorrow has no ledger and needs none: nothing has happened to a dose that
    has not come round yet, and `_dose_state` calls the whole of tomorrow
    `upcoming` because that is what it is.

    Never raises, like everything else here. A day that cannot be worked out is
    an empty column with its date still on it — a calendar missing a day's doses
    is worth far more than no calendar.
    """
    if at is None:
        return ()

    days = []
    for offset in range(-CALENDAR_REACH, CALENDAR_REACH + 1):
        when = at.date() + timedelta(days=offset)
        if offset == 0:
            doses = today_doses
        else:
            doses = _try(f"the doses {offset:+d} days from today",
                         lambda w=when, o=offset: _plan_of(dispenser, w, o), ())
        days.append(Day(label=f"{MONTHS[when.month - 1]} {when.day:02d}",
                        date=f"{when.year % 100:02d}-{when.month:02d}-{when.day:02d}",
                        today=offset == 0, doses=doses))
    return tuple(days)


def _plan_of(dispenser, when, offset: int) -> tuple[Dose, ...]:
    """One day that is not today: its plan, and the ledger's word on it."""
    ordinal = when.toordinal()
    plan = list(dispenser.scheduler.day_plan(ordinal, when.weekday()))
    outcomes = ({} if offset > 0
                else _try("that day's ledger",
                          lambda: dict(dispenser.outcomes_on(ordinal)), {}))
    fitted = _try("the fitted trays", lambda: set(dispenser.servos.pins), set())

    doses = []
    for slot, minutes in plan:
        recorded = str(outcomes.get((slot, minutes), ""))
        if recorded in ("taken", "missed", "unoffered"):
            state = "missed" if recorded == "unoffered" else recorded
            offered = recorded != "unoffered"
        elif offset > 0:
            # Tomorrow. Nothing has happened to it and nothing can have.
            state, offered = "upcoming", True
        else:
            # A past day the ledger says nothing about. `unknown`, never
            # `missed`: the log is bounded, so an old day falling off the end of
            # it is the machine forgetting rather than the person failing, and
            # the two must not draw the same.
            state, offered = "unknown", True
        doses.append(Dose(tray=slot if slot in fitted else None,
                          minutes=minutes, at=_hhmm(minutes), state=state,
                          offered=offered))
    doses.sort(key=lambda dose: (dose.minutes, dose.tray if dose.tray is not None else -1))
    return tuple(doses)


def _day(dispenser, at, owed) -> tuple[Dose, ...]:
    """Today's doses and what became of each, ascending by time.

    Three sources, and the join is where the honesty lives. The scheduler says
    what today *was meant to be*; `awaiting_release` says what is owed right
    now; the ledger says what happened to the rest. Where all three are silent
    about a dose whose time has passed, the answer is `unknown` — not `taken`,
    which would be a fabrication, and not `upcoming`, which would put a past
    dose in the future.

    That case is reachable and not rare: the ledger is `events.jsonl`, and
    `store.read_events` returns `[]` permanently after a single bad UTF-8 byte,
    so a device that lost power mid-append renders its whole day as outlined
    squares. That is the correct picture. "We do not know" is a fact, and the
    outlined shape is the one part of the panel's vocabulary that says it.

    A dose whose minute is the current minute is left `upcoming` rather than
    `unknown`. Within one minute the scheduler has not necessarily run yet, and
    a mark that flickered to "we do not know" for the fifteen seconds before a
    dose was offered would be the panel doubting itself in front of somebody
    standing there waiting for it.

    The ledger is read behind its own guard: a build whose device has no ledger
    yet loses the `taken`/`missed` distinction and draws the day in outlined
    squares, rather than losing the whole band.
    """
    if at is None:
        return ()

    plan = list(dispenser.scheduler.day_plan(at.date().toordinal(), at.weekday()))
    outcomes = _try("today's ledger", lambda: dict(dispenser.today_outcomes()), {})
    fitted = _try("the fitted trays", lambda: set(dispenser.servos.pins), set())
    waiting_keys = {(dose.tray, dose.minutes) for dose in owed}
    now_minutes = at.hour * 60 + at.minute

    # A dose owed right now whose scheduled time is not in today's plan — one
    # that crossed midnight inside its grace window, or one whose course expired
    # while it waited. It is still owed, so it is still drawn; leaving it out
    # would be the calendar contradicting the alarm about a dose somebody can
    # act on.
    planned = set(plan)
    keys = plan + [key for key in sorted(waiting_keys) if key not in planned]

    doses = []
    for slot, minutes in keys:
        offered = True
        if (slot, minutes) in waiting_keys:
            state = "waiting"
        else:
            recorded = str(outcomes.get((slot, minutes), ""))
            if recorded in ("taken", "missed", "unoffered"):
                # 띠에는 둘 다 놓친 것으로 그린다 — 어느 쪽이든 약이 안 나갔다.
                # 갈리는 것은 `offered` 이고, 그것을 보는 것은 웃는 얼굴뿐이다.
                state = "missed" if recorded == "unoffered" else recorded
                offered = recorded != "unoffered"
            elif minutes >= now_minutes:
                state = "upcoming"
            else:
                # The ledger has nothing, and the time has gone. Say so.
                state = "unknown"
        doses.append(Dose(tray=slot if slot in fitted else None,
                          minutes=minutes, at=_hhmm(minutes), state=state,
                          offered=offered))

    doses.sort(key=lambda dose: (dose.minutes, dose.tray if dose.tray is not None else -1))
    return tuple(doses)


def _waiting_frac(dose, at) -> int:
    """How much of a waiting dose's release window is left, in tenths, 0..10.

    Tenths rather than minutes or a percentage, and that is the entire point of
    the field. The window is an hour by default, so minutes would repaint the
    panel sixty times an hour to move a bar by three pixels, and a fraction
    would repaint it on every tick forever. Ten steps is as much as a 212 px
    track can show and it is the coarsest quantisation that still visibly moves.

    Measured from the dose's own scheduled instant, matching `DueDose.deadline`:
    a dose picked up late after a power cut has less of its window left, and a
    bar that reset to full for it would be promising time the tray will not give.
    """
    if dose is None or at is None:
        return 0
    window = (dose.deadline - dose.due_at).total_seconds()
    if window <= 0:
        return 0
    left = (dose.deadline - at).total_seconds()
    return max(0, min(10, int(left * 10 // window)))


def _panel_error(dispenser, display) -> str:
    """The panel driver's last error, for `/api/status`.

    `display` is passed by anything that holds the driver. Nothing does on the
    tick path — the daemon has the dispenser and hands its indicator the
    snapshot afterwards — so the fallback reaches the panel through the
    indicator that owns it. Both hops are public attributes and both are
    guarded, because this is the one field on the whole snapshot whose absence
    costs nothing at all.
    """
    panel = display if display is not None else getattr(
        getattr(dispenser, "indicator", None), "display", None)
    return str(getattr(panel, "error", "") or "")


def _unfitted_tray(dispenser) -> bool:
    """Does the loaded schedule name a tray this machine does not have?

    `set_schedule` refuses one outright, so this can only arrive through
    `_restore` — a schedule saved when eight trays were wired and read back on a
    machine that now has four, or one whose tray pins were reconfigured under it.
    Nothing else in the firmware notices, and the way it surfaces is the worst
    available: the scheduler offers the dose, the screen lights, the person taps
    release, `TrayServos.gpio_for` raises where nobody is watching, and an hour
    later the dose ages out and is reported to the carer as `not-released` — a
    refusal that person never made.
    """
    fitted = set(dispenser.servos.pins)
    return any(slot.slot not in fitted for slot in dispenser.scheduler.slots)


def _cell() -> str:
    """`"ok"` | `"flat"` | `""` — is the clock chip carrying its own time?

    A chip that is fitted and says it is not vouching for itself is `flat`: the
    DS1302 with no token in its RAM, the DS3231 whose oscillator has stopped,
    either of them with a flat cell or none fitted. `Clock.source` will not
    answer `rtc` for any of those, so the tray opens today on NTP's word or a
    phone's — and the next time the power and the router go together there is
    nothing left to vouch for the time and the tray stays shut, which is the
    exact failure the coin cell was fitted to prevent, arriving anyway.

    Two things deliberately read as `""` rather than `flat`, and both are the
    same judgement.

    `running is None` is `rtc.py` saying it could not tell — a DS3231 on a build
    with no smbus2, a chip that would not answer. That is not a statement about
    the hardware, and reporting a flat cell on no reading is the fabrication
    `rtc.py` is careful never to make. The cost is real and worth naming: on a
    DS3231 build missing smbus2 the next power cut will block the tray and this
    field will not have warned about it. The `detail` on the status page says so,
    and that failure is an apt-get rather than a person at the machine.

    A chip that is not there at all is a build without an RTC rather than a
    broken one. It is also the one caution nobody could ever clear, and a
    permanent triangle is a triangle everybody learns to read past.

    There is no third value for "how full is the cell", because there is no such
    reading anywhere: the DS1302 has no ADC, no kernel driver and no voltage to
    report. Three states is the whole truth available.
    """
    if not config.USE_RTC:
        return ""
    state = rtc.read_status()
    if not state.present or state.running is None:
        return ""
    return "ok" if state.running else "flat"


def _cell_standing(health: Health) -> bool:
    """Will the clock chip carry this device through the next power cut?

    A pure function of the field the battery chip draws, so the slug and the
    chip cannot disagree — which they could when each made its own call on the
    same `RtcState`.
    """
    return health.cell == "flat"


def _relay_standing(health: Health, last_error: bool) -> bool:
    """Is the carer's phone failing to hear about doses?

    A pure function of `health.relay` and one fact that is not a field, for the
    same reason as `_cell_standing`. `off` and `unpaired` are not faults: both
    are somebody's decision — a device that has never been paired is running
    perfectly well on the LAN alone — and a triangle nobody can clear is a
    triangle everybody stops seeing.

    `connecting` is the few seconds before first contact at boot. It is also
    where a device with a wrong relay URL sits *forever*: `lastContact` never
    starts, so the age never grows and the state never ripens into `offline`.
    The recorded error is the only thing that tells those two apart, and it is
    not a field because an error string is unbounded and this snapshot is
    compared for equality.
    """
    return health.relay in _RELAY_FAULTS or (health.relay == "connecting" and last_error)


def _pair_fields(_relay_status: dict) -> tuple[str, str]:
    """`(claim, pair_payload)` — the code and what the **panel's** QR carries.

    Deliberately the short `SNAPCARE-PAIR:CODE` form, and never the URL, which
    is the opposite of what the printed label does.

    Why the label and the screen want different payloads
    ----------------------------------------------------
    The label prints `https://relay/pair#CODE` when a relay is configured,
    because a label is scanned by whatever is to hand — including a phone's own
    camera, which offers to open a URL and nothing else.

    The panel is not that. It is 2.8 inches of glass that this firmware tells
    somebody to photograph **with the SnapCare app**, and that app reads both
    forms (`lib/dispenser/qrIntent.ts`). So the URL buys nothing here and costs
    the one thing that decides whether the photograph works at all:

        https://…/pair#DDBQE-KEJ78   47 chars →  41 modules → 5 px a module
        SNAPCARE-PAIR:DDBQE-KEJ78    25 chars →  33 modules → 6 px a module

    Twenty percent more module for free, on a code somebody is photographing at
    arm's length in a room with whatever light it has.

    …and then it went the other way, because of what was actually failing
    ---------------------------------------------------------------------
    The short form was not enough. On a real photograph of this panel the app's
    own decoder still came back empty, and the vision model looking at the same
    picture answered **"QR code"** — the code was plainly in the frame and the
    pixels reaching the decoder were not.

    The fault was never the payload length. It was that a **single still
    photograph** is a poor instrument for reading a QR: one chance at focus, no
    chance to move, and you learn how many pixels a module got only after the
    shutter. A phone's own camera does the same job with tens of frames a second
    and a focus loop, and it is very good at it — but it will only act on a code
    it can *open*.

    So the panel carries an address into this app (`app/pair/page.tsx`), which
    pairs from the fragment the moment it loads. Somebody points their ordinary
    camera at the box, taps the notification that appears, and it is done. The
    app's own camera still reads this code too, and still reads the short form
    and the relay form, so nothing that worked before stops working.

    The code stays in the **fragment**, which browsers never send to a server —
    ten characters are the whole authority over this device, and they must not
    land in an access log on the way past.
    """
    from .. import config, provisioning  # noqa: PLC0415 - reads a file on first call

    identity = provisioning.load_identity()
    claim = provisioning.format_claim(identity.claim)
    if not claim:
        return "", ""
    app = config.APP_URL.rstrip("/")
    return claim, (f"{app}/pair#{claim}" if app else f"SNAPCARE-PAIR:{claim}")


def _network_fields(network) -> tuple[str, str, str, str, bool]:
    """`(wifi, ssid, passphrase, address, standing)` — the radio, without touching nmcli.

    `standing` is kept separate from the `wifi` value on purpose. The value is
    what the firmware *knows*, and with no supervisor, or one started with
    management off, what it knows is nothing — so it says "offline", which is
    the honest "I have no network to tell you about". The problem slug is a
    *claim*, and a claim needs evidence: putting a caution triangle on a
    development laptop, or on a build wired to Ethernet and told to leave the
    radio alone, would be this file inventing a fault out of its own ignorance.
    """
    if network is None:
        return "offline", "", "", "", False

    # The device's own setup credentials, not whatever it is joining or joined
    # to. They are constants of the board held on an object the supervisor
    # already has, so they are free here; reading them from `provisioning` would
    # be a file read or a `/proc/cpuinfo` parse on every tick for a value that
    # cannot change while the process is running.
    identity = _try("the setup identity", lambda: network.identity, None)
    ssid = str(getattr(identity, "ssid", "") or "")
    passphrase = str(getattr(identity, "passphrase", "") or "")

    snap = _try("the network supervisor", lambda: network.snapshot(), None) or {}
    if not snap.get("managed", True):
        return "offline", ssid, passphrase, "", False

    state = str(snap.get("state") or "")
    if state in ("joining", "recovering"):
        # Mid-action. The radio is between two networks, so the reading below is
        # either stale or about to be wrong, and there is no address to give.
        # Not a problem either: it settles within a minute either way, and a
        # caution that clears itself is how a person is taught to ignore them.
        return "joining", ssid, passphrase, "", False

    radio = _radio(network)
    mode = str(getattr(radio, "mode", "") or "")
    address = (str(getattr(radio, "address", "") or "")
               or str(snap.get("address") or ""))

    # The radio reading is the present tense and outranks the attempt state,
    # which is a record of the last thing somebody asked for.
    if mode == "connected":
        return "online", ssid, passphrase, address, False
    if mode == "hotspot":
        # No address: `wifi.status()` fills in the AP's own 10.42.0.1 here, and
        # that is not the house address this field promises.
        #
        # The attempt state is what separates the two setup screens. Sitting on
        # our own AP having never been configured is the ordinary first-run
        # card; sitting on it *because a join failed* is a device whose
        # passphrase is probably wrong, and that screen gets to say so. Both
        # draw the same QR — the difference is one word and the colour of the
        # field, and without it the second person to try the same wrong password
        # gets no more help than the first.
        return ("failed" if state == "failed" else "hotspot"), ssid, passphrase, "", True
    if mode in ("disconnected", "unavailable"):
        return "offline", ssid, passphrase, "", True

    # No reading in hand — the first tick has not run yet, or a worker has just
    # invalidated the cache. Fall back to the last attempt, which is at least
    # something somebody did.
    if state == "joined":
        return "online", ssid, passphrase, address, False
    if state == "failed":
        # `hotspotBack` is the difference between "try again here" and "this
        # device has vanished", which is the one thing the setup page acts on.
        # With the hotspot back, the setup screen is reachable and the join
        # failure is the news; without it there is no network to point anybody
        # at and the honest word is "offline".
        return (("failed" if snap.get("hotspotBack") else "offline"),
                ssid, passphrase, "", True)
    return "offline", ssid, passphrase, "", False


def _radio(network):
    """The supervisor's last reading of the radio, if it already holds one.

    `Supervisor.snapshot()` describes the last *attempt*, and both of its
    settled states are sticky. A device that was already on the house network
    when the firmware started never made an attempt at all and reports `idle`
    for the rest of its uptime; one that joined an hour ago still reports
    `joined` after the router has been unplugged. Neither answers the question a
    screen is asking, which is whether it is on a network *now*.

    The supervisor does know — `tick` reads the radio every `NET_POLL_S` and
    keeps the answer — and reading what it kept is free. Asking for a fresh one
    is `wifi.status()`, three nmcli processes, on a path that runs four times a
    minute behind a panel repaint.

    Reaching past the public surface for it is deliberate and is the narrowest
    thing that works. It degrades to `None` the moment `Supervisor` is
    rearranged, which costs the `wifi` field some precision and cannot cost a
    dose. The day the supervisor grows a public reading of the radio, this
    should use that instead.
    """
    try:
        radio = getattr(network, "_cached", None)
        return radio if isinstance(getattr(radio, "mode", None), str) else None
    except Exception:  # noqa: BLE001
        # `getattr` on a foreign object is not a safe operation — a supervisor
        # with a `__getattr__` raises straight through the default. Caught here
        # rather than at the call site so that a radio nobody can read still
        # leaves the setup SSID and the last attempt on the screen.
        return None

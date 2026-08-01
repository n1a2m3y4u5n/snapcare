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
the status screen showed a warning, because the two had picked different
questions off different objects. On a device whose whole interface is one panel
that is not a cosmetic bug: as far as anybody in the room is concerned, the
panel *is* the machine.

So there is one snapshot, taken once per tick, and every screen and the presence
policy read it and nothing else. `Health` is deliberately flat — strings, ints
and a bool. A screen handed a `Dispenser` could ask it anything, and eventually
would; a screen handed nine fields can only draw them.

One problem at a time
---------------------
`problem` is a single slug and never a list. A 128-pixel panel has room for one
cause, and a person handed three faults acts on none of them. So the choice of
which one to show is made here, once, rather than by whichever screen is up.

The order is by what it costs to act on the wrong one:

    gpio   no tray can open at all, and no amount of clock changes that
    clock  the tray will not open, because nothing has vouched for the time
    trays  a schedule names a tray that is not fitted
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

`trays` sits above `wifi` because it is the silent one. A schedule naming a tray
with no servo is accepted at restore, offered to the person, and fails at the
moment they tap release — after which the dose ages out of its window and is
reported to the carer as `not-released`, a refusal nobody made. Being off the
WiFi, by contrast, is loud: the app says so from the other end within minutes.
This firmware's standing rule is that the quiet failure outranks the noisy one.

`cell` is last because it is a forecast rather than a fault. It is still worth a
triangle: the coin cell is the entire answer to "the power went out and the
router has not come back yet", and a chip that has never been vouched for
announces nothing at all until the morning it matters.

What this is allowed to cost
----------------------------
`snapshot` runs on the scheduler tick, four times a minute, so nothing here may
be slow. Measured at about 9 µs on a laptop with eight trays and three doses a
day loaded, which is the shape of the largest real machine.

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
anything that must not wait should not call this.

Nothing here raises
-------------------
Every field is read behind its own guard, so one component having a bad day
costs its own field and not the other eight. Anything that cannot be worked out
becomes the honest empty value — never a guess, and never an exception, because
an exception on this path would be a screen that took the dispenser down with it.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from .. import config, rtc
from .shapes import Shape

log = logging.getLogger(__name__)

#: The slugs `problem` can hold, most severe first. `snapshot` reports whichever
#: of these is standing first, so this tuple *is* the precedence — see the
#: module docstring for why it is in this order. A slug that is not here can
#: never be reported, which is the intended failure: the vocabulary a screen has
#: to understand is fixed, and one that grows quietly is one screens stop
#: covering.
PRECEDENCE: tuple[str, ...] = ("gpio", "clock", "trays", "wifi", "relay", "cell")


@dataclass(frozen=True)
class Health:
    """One reading of the whole machine.

    Every default is the honest empty value, which means **the defaults do not
    describe a healthy device — they describe one that has told you nothing.**
    `dispensing` defaults False and so a bare `Health()` reads as `Shape.AVOID`.
    That is deliberate and it is the cheaper of the two lies available: a false
    octagon sends somebody to look at a machine that turns out to be fine, and a
    false circle leaves a machine that is not dispensing looking perfectly well
    until somebody counts the pills.

    A test that wants a specific state should say so — `Health(dispensing=True,
    now="12:34", next_tray=2, next_at="20:00")` — rather than starting from
    `blank()` and hoping.
    """

    #: False means the tray will not open. `Shape.AVOID`, on every panel.
    dispensing: bool = False
    #: The most severe standing problem, as one slug from `PRECEDENCE`, or "".
    #: Fed straight to `screens.blocked`, which substring-matches it.
    problem: str = ""
    #: "online" | "hotspot" | "joining" | "offline". Also "offline" when nobody
    #: is managing the radio — see `_network_fields`, which explains why that
    #: does not raise a `wifi` problem.
    wifi: str = "offline"
    #: The device's **own setup network**, for the hotspot screen. Never the
    #: house network's name: a screen that printed the house SSID over a join
    #: instruction would be telling somebody to connect to the network they are
    #: already on.
    ssid: str = ""
    #: Where the device answers on the house network, or "". Empty on the setup
    #: hotspot on purpose — the AP's own 10.42.0.1 is not an address anybody can
    #: reach from the sofa, and a screen showing it sends them to a dead page.
    address: str = ""
    #: The next dose still to come *today*, ignoring anything already owed. A
    #: dose waiting right now shows up in `waiting`, not here.
    next_tray: int | None = None
    next_at: str = ""      # "20:00", or "" when nothing is scheduled
    now: str = ""          # "12:34"
    #: How many doses have been offered and are waiting on a press. Not a
    #: problem and not a caution — see `shape_for`.
    waiting: int = 0

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
    show a circle on the idle screen and a triangle on the status screen for the
    same machine — which is exactly what happens when two files each hold half
    of "severe".

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


def snapshot(dispenser, network=None, cloud=None) -> Health:
    """Read the machine. Cheap, total, and safe to call from the tick.

    `network` is a `network.Supervisor` and `cloud` a `cloud.CloudLink`; both are
    optional because both are optional on a real build — a dispenser with no
    relay and no managed radio is a supported machine, not a degraded one, and
    it must not be shown a warning about parts it does not have.
    """
    try:
        return _read(dispenser, network, cloud)
    except Exception:  # noqa: BLE001
        # The guards below mean reaching this is a bug in *this* file rather
        # than a component misbehaving. Logged loudly and repeatedly on purpose:
        # the panel has just gone to an octagon with no cause on it, and the
        # journal is the only place the reason can be.
        log.exception("could not read the machine's health — the panel will "
                      "show a refusal it cannot name")
        return Health()


def _read(dispenser, network, cloud) -> Health:
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

    wifi, ssid, address, wifi_standing = _try(
        "the network", lambda: _network_fields(network), ("offline", "", "", False))

    standing = {
        "gpio": no_gpio,
        "clock": no_clock,
        "trays": _try("the trays", lambda: _unfitted_tray(dispenser), False),
        "wifi": wifi_standing,
        "relay": _try("the relay", lambda: _relay_standing(cloud), False),
        "cell": _try("the clock chip", lambda: _cell_standing(), False),
    }

    next_tray, next_at = _next_dose(dispenser, at)

    return Health(
        dispensing=dispensing,
        problem=next((slug for slug in PRECEDENCE if standing.get(slug)), ""),
        wifi=wifi,
        ssid=ssid,
        address=address,
        next_tray=next_tray,
        next_at=next_at,
        now=f"{at.hour:02d}:{at.minute:02d}" if at is not None else "",
        waiting=_try("the doses waiting", lambda: len(dispenser.awaiting_release), 0),
    )


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


def _cell_standing() -> bool:
    """Will the clock chip carry this device through the next power cut?

    A chip that is fitted and says it is not vouching for itself: the DS1302
    with no token in its RAM, the DS3231 whose oscillator has stopped, either of
    them with a flat cell or none fitted. `Clock.source` will not answer `rtc`
    for any of those, so the tray opens today on NTP's word or a phone's — and
    the next time the power and the router go together there is nothing left to
    vouch for the time and the tray stays shut, which is the exact failure the
    coin cell was fitted to prevent, arriving anyway.

    Two things deliberately do *not* count, and both are the same judgement.

    `running is None` is `rtc.py` saying it could not tell — a DS3231 on a build
    with no smbus2, a chip that would not answer. That is not a statement about
    the hardware, and reporting a flat cell on no reading is the fabrication
    `rtc.py` is careful never to make. The cost is real and worth naming: on a
    DS3231 build missing smbus2 the next power cut will block the tray and this
    slug will not have warned about it. The `detail` on the status page says so,
    and that failure is an apt-get rather than a person at the machine.

    A chip that is not there at all is a build without an RTC rather than a
    broken one. It is also the one caution nobody could ever clear, and a
    permanent triangle is a triangle everybody learns to read past.
    """
    if not config.USE_RTC:
        return False
    state = rtc.read_status()
    return state.present and state.running is False


def _relay_standing(cloud) -> bool:
    """Is the carer's phone failing to hear about doses?"""
    if cloud is None:
        return False
    status = cloud.status() or {}
    if not status.get("enabled") or not status.get("configured"):
        # Switched off, or never paired. Both are somebody's decision rather
        # than a fault — a device that has never been paired is running
        # perfectly well on the LAN alone — and a triangle nobody can clear is a
        # triangle everybody stops seeing.
        return False
    state = str(status.get("state") or "")
    if state in ("offline", "retrying", "unsupported"):
        return True
    # `connecting` is the few seconds before first contact at boot. It is also
    # where a device with a wrong relay URL sits *forever*: `lastContact` never
    # starts, so the age never grows and the state never ripens into `offline`.
    # The recorded error is the only thing that tells those two apart.
    return state == "connecting" and bool(status.get("lastError"))


def _network_fields(network) -> tuple[str, str, str, bool]:
    """`(wifi, ssid, address, standing)` — the radio, without touching nmcli.

    `standing` is kept separate from the `wifi` value on purpose. The value is
    what the firmware *knows*, and with no supervisor, or one started with
    management off, what it knows is nothing — so it says "offline", which is
    the honest "I have no network to tell you about". The problem slug is a
    *claim*, and a claim needs evidence: putting a caution triangle on a
    development laptop, or on a build wired to Ethernet and told to leave the
    radio alone, would be this file inventing a fault out of its own ignorance.
    """
    if network is None:
        return "offline", "", "", False

    # The device's own setup SSID, not whatever it is joining or joined to. It
    # is a constant of the board, so it is free, and the hotspot screen is the
    # one place it is read.
    ssid = _try("the setup network name", lambda: network.identity.ssid, "")

    snap = _try("the network supervisor", lambda: network.snapshot(), None) or {}
    if not snap.get("managed", True):
        return "offline", ssid, "", False

    state = str(snap.get("state") or "")
    if state in ("joining", "recovering"):
        # Mid-action. The radio is between two networks, so the reading below is
        # either stale or about to be wrong, and there is no address to give.
        # Not a problem either: it settles within a minute either way, and a
        # caution that clears itself is how a person is taught to ignore them.
        return "joining", ssid, "", False

    radio = _radio(network)
    mode = str(getattr(radio, "mode", "") or "")
    address = (str(getattr(radio, "address", "") or "")
               or str(snap.get("address") or ""))

    # The radio reading is the present tense and outranks the attempt state,
    # which is a record of the last thing somebody asked for.
    if mode == "connected":
        return "online", ssid, address, False
    if mode == "hotspot":
        # No address: `wifi.status()` fills in the AP's own 10.42.0.1 here, and
        # that is not the house address this field promises.
        return "hotspot", ssid, "", True
    if mode in ("disconnected", "unavailable"):
        return "offline", ssid, "", True

    # No reading in hand — the first tick has not run yet, or a worker has just
    # invalidated the cache. Fall back to the last attempt, which is at least
    # something somebody did.
    if state == "joined":
        return "online", ssid, address, False
    if state == "failed":
        # `hotspotBack` is the difference between "try again here" and "this
        # device has vanished", which is the one thing the setup page acts on.
        return ("hotspot" if snap.get("hotspotBack") else "offline"), ssid, "", True
    return "offline", ssid, "", False


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

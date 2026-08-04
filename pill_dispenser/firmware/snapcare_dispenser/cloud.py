"""The connection the device keeps open to the relay.

What this is for
----------------
Before this, a schedule reached the dispenser only from something on the same
WiFi — a phone tapping a link, a curl on the LAN, a photographed paper sheet.
That is fine when the person editing the prescription is in the house and
useless when they are not, which is most of the time: the carer is at work, the
clinic is across town, and the dispenser is in somebody's bedroom.

So the device holds one outbound connection to a relay and a schedule edited in
the web app arrives on it. Outbound because a home router will not forward a
port to a dispenser and nobody should be asked to make it.

What this is not
----------------
**It is not a dependency.** Everything below runs on its own thread, catches
everything, and touches the dispenser through exactly one method that the LAN
API already calls. A relay that is down, unreachable, misconfigured or never
set up costs nobody a dose: the schedule is already on the SD card and the
DS3231 already knows what time it is. That is the entire reason the local cache
and the RTC exist, and cloud sync is not allowed to quietly become the thing
they were protecting against.

If you change one thing in this file, keep that. The failure this project is
written against is a dispenser that silently stops dispensing, and "the relay
was down" is a spectacularly bad reason for it to happen.

The three slots
---------------
    desired    the app writes, this reads   — what the schedule should be
    reported   this writes, the app reads   — what the device is actually doing
    command    the app writes, this reads   — release the dose, now

They are separate slots rather than one document because they have different
writers and different truths. Merging `desired` and `reported` is how a device's
own report of what it did gets played back to it as an instruction.

`command` is the tap
--------------------
A dose does not leave the hopper until somebody asks for it. When the phone is
on the house WiFi it asks the device directly — `POST /api/release`, no internet
involved — and this slot is how the same tap arrives when it is not: from a push
notification on a train, from a carer in another city.

**A command is an act, not a state, and that is the whole danger of it.** A
schedule in `desired` stays true and a device that has been offline for a week
should adopt the newest one it finds. A release is true for one hour on one
morning, and a device that finds one on reconnecting must *not* treat it that
way — a pill dropped into an empty room at 3 p.m. because a poll finally
succeeded is precisely the failure the release model exists to prevent.

So there are three guards, and they fail in the same direction:

  the revision, as with `desired`, against a number on the SD card, so a command
  cannot be replayed across a reboot or handed back a second time by a broken
  relay;

  the naming — a release says *which* dose it means, tray and scheduled minute;

  and the only one that really matters: the device releases nothing unless that
  exact dose is one it is offering right now. `Dispenser.release` answers an
  empty list otherwise. A command that arrives late is not refused, logged as an
  error, or retried. It simply finds nothing waiting and moves no horn.

That last guard is what makes the other two belt and braces rather than the
argument. The authority on whether a pill may fall is the device's own sense of
what is due, and it always was.

Replay, and why the revision is checked twice
---------------------------------------------
Once by the relay, which refuses a revision that does not increase — that is
concurrency control between two phones. And once here, against a number on the
SD card, which is a different question: after a power cut the device must not
re-apply a schedule it has already applied, and must not accept an *older* one
that a broken or hostile relay hands back. The number is also sealed into the
envelope's authenticated data, so it cannot be edited into a higher one.
"""
from __future__ import annotations

import json
import logging
import random
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime

from . import config, envelope, provisioning
from .store import write_atomic

log = logging.getLogger(__name__)

#: How many dose events ride along with each report. Enough for the app to draw
#: a day without asking for more, small enough that a device coming back after
#: a week offline does not publish a megabyte.
REPORT_EVENTS = 25

#: Added to the relay's hold before the socket itself gives up. If the two were
#: equal, every single normal poll would be a race between the relay answering
#: 204 and the client calling it a timeout — and the client's timeout path is
#: the one with the backoff in it, so the device would spend its life backing
#: off from a relay that is working perfectly.
_HOLD_MARGIN_S = 10

#: The floor under one poll-and-reconnect cycle.
#:
#: Normally irrelevant: a poll blocks for the full hold, so this never fires.
#: It exists for every case where the answer comes back *immediately* and
#: nothing has changed — a mailbox that does not exist yet, a proxy that
#: terminates long polls on sight, a relay configured with a hold of zero.
#: Without it, "reconnect at once" is a loop with no delay in it at all, and a
#: dispenser turns into several hundred requests a second aimed at the relay
#: that is already having a bad day.
_MIN_CYCLE_S = 2.0


class _Ctl:
    """One generation of loop threads, and the events only they may look at.

    Bundled rather than kept as attributes on `CloudLink` because the loops used
    to re-read `self._stop` on every pass. `reconfigure` rebound that attribute
    to a fresh, unset Event — so a thread parked on a fifty-second long poll woke
    up, read the *new* generation's event, saw it clear, and ran forever
    alongside its replacement. A thread that is handed its own bundle at birth
    cannot see a later one.
    """

    __slots__ = ("stop", "wake_poller", "wake_publisher", "wake_commander")

    def __init__(self):
        self.stop = threading.Event()
        self.wake_poller = threading.Event()
        self.wake_publisher = threading.Event()
        self.wake_commander = threading.Event()

    def halt(self) -> None:
        """Stop this generation, and wake anything sleeping so it notices now."""
        self.stop.set()
        self.wake_poller.set()
        self.wake_publisher.set()
        self.wake_commander.set()


class CloudLink:
    """One relay connection, on two threads that outlive their own failures."""

    def __init__(self, dispenser, identity: provisioning.Identity,
                 relay_url: str | None = None, enabled: bool | None = None,
                 session=None):
        self.dispenser = dispenser
        self.identity = identity
        # `session` is the seam the tests use. Everything that reaches the
        # network goes through it, so the suite can exercise reconnects,
        # rollbacks and a relay that answers nonsense without a relay.
        self._session = session or _UrllibSession()

        stored = self._load_state()
        self.relay_url = (relay_url
                          or stored.get("relayUrl")
                          or config.CLOUD_RELAY_URL).rstrip("/")
        self.enabled = config.CLOUD_ENABLED if enabled is None else enabled

        self._desired_rev = int(stored.get("desiredRev") or 0)
        self._reported_rev = int(stored.get("reportedRev") or 0)
        #: The last command revision seen, on the SD card for the same reason
        #: `desiredRev` is: it has to survive the power cut. Without it a device
        #: rebooting would collect the last release command again and, if the
        #: dose happened to still be inside its window, drop a second one.
        self._command_rev = int(stored.get("commandRev") or 0)
        #: 폰이 이 상자를 자기 것이라고 말한 시각, 또는 "". 짝짓기 화면을 내리는
        #: 유일한 증거다 — `display/health` 가 읽는다.
        self._claimed_at = str(stored.get("claimedAt") or "")
        self._applied_at = str(stored.get("appliedAt") or "")

        #: The current generation's control events. See `_Ctl`.
        self._ctl = _Ctl()
        self._threads: list[threading.Thread] = []
        self._lock = threading.RLock()

        self._last_contact = 0.0
        self._last_error = ""
        self._attempts = 0
        self._last_published = ""
        #: Bumped every time the device comes back onto a network. Each loop
        #: remembers the value it last saw, which is how a backoff gets reset
        #: without two threads racing to clear one flag — see `network_changed`.
        self._network_epoch = 0
        #: Where the device can be reached, as last reported by the supervisor.
        #: Cached rather than asked for, because `_report` runs on the publish
        #: path and `wifi.status()` is three subprocesses.
        self._network = {"ssid": "", "address": ""}

    # ── what the rest of the firmware sees ──────────────────────────────────

    @property
    def configured(self) -> bool:
        return bool(self.relay_url) and bool(self.identity.claim)

    @property
    def running(self) -> bool:
        return any(t.is_alive() for t in self._threads)

    def status(self) -> dict:
        """For `/api/status` and the device's own console.

        The claim code and the access token are deliberately absent. The claim
        code *is* the pairing, and this object is handed to anything that asks.
        """
        with self._lock:
            age = time.monotonic() - self._last_contact if self._last_contact else None
            return {
                "enabled": self.enabled,
                "configured": self.configured,
                "supported": envelope.available(),
                "state": self._state(age),
                "relayUrl": self.relay_url,
                "deviceId": self.identity.device_id if self.identity.claim else "",
                "desiredRev": self._desired_rev,
                "reportedRev": self._reported_rev,
                "commandRev": self._command_rev,
                "appliedAt": self._applied_at,
                "claimedAt": self._claimed_at,
                "lastContactSecondsAgo": round(age) if age is not None else None,
                "lastError": self._last_error,
                "attempts": self._attempts,
                "hint": "" if envelope.available() else envelope.UNAVAILABLE_HINT,
            }

    def _state(self, age: float | None) -> str:
        if not self.enabled:
            return "off"
        if not envelope.available():
            return "unsupported"
        if not self.configured:
            return "unpaired"
        if age is None:
            return "connecting"
        if age > config.CLOUD_STALE_S:
            return "offline"
        return "connected" if not self._last_error else "retrying"

    # ── lifecycle ───────────────────────────────────────────────────────────

    def start(self) -> None:
        """Begin, or explain in one line why not."""
        if not self.enabled:
            log.info("cloud sync is switched off")
            return
        if not self.configured:
            log.info("no relay configured — the dispenser is LAN-only. "
                     "Set SNAPCARE_RELAY_URL to enable cloud sync.")
            return
        if not envelope.available():
            # Loud, because this is the whole feature failing, and quiet at
            # startup is how somebody spends an afternoon on a device that is
            # working exactly as it was told to.
            log.error("cloud sync is configured but cannot run: %s",
                      envelope.UNAVAILABLE_HINT)
            return

        log.info("cloud sync to %s as device %s",
                 self.relay_url, self.identity.device_id)
        ctl = self._ctl
        self._threads = [
            threading.Thread(target=self._poll_loop, args=(ctl,),
                             name="cloud-poll", daemon=True),
            threading.Thread(target=self._publish_loop, args=(ctl,),
                             name="cloud-publish", daemon=True),
            # Its own thread, and its own parked request. A release tapped on a
            # phone has somebody standing in front of the machine waiting for a
            # noise, so it cannot queue behind a schedule poll that is halfway
            # through a fifty-second hold.
            threading.Thread(target=self._command_loop, args=(ctl,),
                             name="cloud-command", daemon=True),
        ]
        for thread in self._threads:
            thread.start()

    def stop(self) -> None:
        self._ctl.halt()

    def reconfigure(self, relay_url: str | None = None,
                    enabled: bool | None = None) -> dict:
        """Point at a different relay, or switch the link off, while running.

        Stops and restarts rather than mutating under the threads. A poll that
        is already parked on the old relay would otherwise stay parked for its
        full hold and then write a report to whichever URL it read next, which
        is a request sent to one relay carrying a revision counted against
        another.

        The threads are given a moment to notice, but not waited for: this is
        called from an HTTP handler with somebody looking at the page, and the
        parked poll can take the best part of a minute to come back.

        **Each generation of threads owns its own events**, which is the whole
        reason `_Ctl` exists. The events used to be attributes rebound here, and
        every loop re-read `self._stop` on each pass — so a thread still parked
        on a fifty-second hold woke up, read the *new* generation's unset event,
        and carried on forever. Reproduced: `reconfigure(enabled=False)`
        reported `off` and `running: False` while three live threads went on
        talking to the relay, and a URL change left two pollers, two command
        loops — either of which could pass the `rev <= self._command_rev` check
        and release the same dose twice — and two publishers in a permanent 409
        fight. Every call to `POST /api/cloud` added three more, on a 1 GB Pi.
        """
        self.stop()
        for thread in self._threads:
            thread.join(timeout=1.0)
        self._threads = []
        self._ctl = _Ctl()

        with self._lock:
            if relay_url is not None:
                new_url = relay_url.strip().rstrip("/")
                if new_url != self.relay_url:
                    # The revisions counted against the old relay mean nothing
                    # to a new one, and carrying them over is how a device
                    # arrives at a fresh mailbox announcing revision 400 and
                    # then ignores the schedule waiting there at revision 1.
                    self._desired_rev = 0
                    self._reported_rev = 0
                    self._command_rev = 0
                    self._last_published = ""
                self.relay_url = new_url
            if enabled is not None:
                self.enabled = bool(enabled)
            self._last_error = ""
            self._last_contact = 0.0
            self._attempts = 0
        self._save_state()

        self.start()
        return self.status()

    def nudge(self) -> None:
        """Something happened worth telling the app about, now rather than later."""
        self._ctl.wake_publisher.set()

    def network_changed(self, state=None) -> None:
        """The device is back on a network. Stop waiting out the backoff.

        Both loops back off exponentially to `CLOUD_BACKOFF_MAX_S` — five
        minutes — and after a WiFi outage every one of those failures had the
        same single cause, which has just gone away. Sitting out the rest of the
        wait means the app goes on showing a dispenser as offline for minutes
        after it came back, and "offline" is the one word in that app a carer
        acts on. A device that is back must look back.

        `Supervisor.on_online` calls this, and passes where the device now is so
        that the next report carries an address the app can actually open.
        """
        with self._lock:
            self._network_epoch += 1
            if state is not None:
                self._network = {"ssid": state.ssid or "",
                                 "address": state.address or ""}
        ctl = self._ctl
        ctl.wake_poller.set()
        ctl.wake_publisher.set()
        ctl.wake_commander.set()

    # ── receiving: the long poll ────────────────────────────────────────────

    def _poll_loop(self, ctl: _Ctl) -> None:
        backoff = config.CLOUD_BACKOFF_MIN_S
        epoch = self._network_epoch
        while not ctl.stop.is_set():
            try:
                started = time.monotonic()
                changed = self._poll_once()
                self._note_success()
                backoff = config.CLOUD_BACKOFF_MIN_S

                if not changed:
                    if config.CLOUD_IDLE_POLL_S > 0:
                        # The cheap mode. See CLOUD_IDLE_POLL_S — the relay
                        # gets to be idle, and an edit can wait that long.
                        self._wait_to_poll(ctl, config.CLOUD_IDLE_POLL_S)
                    else:
                        # See `_MIN_CYCLE_S`. A poll the relay actually held is
                        # already well past this and waits for nothing.
                        remaining = _MIN_CYCLE_S - (time.monotonic() - started)
                        if remaining > 0:
                            self._wait_to_poll(ctl, remaining)
            except Exception as exc:  # noqa: BLE001
                # Everything. A dispenser is not allowed to stop dispensing
                # because a name did not resolve.
                self._note_failure(exc)
                self._wait_to_poll(ctl, _jittered(backoff))
                if self._network_epoch != epoch:
                    # The WiFi came back underneath us. Every failure counted
                    # into that backoff was this, so start the climb again from
                    # the bottom rather than punishing the device for an outage
                    # that is over. See `network_changed`.
                    epoch = self._network_epoch
                    backoff = config.CLOUD_BACKOFF_MIN_S
                else:
                    backoff = min(backoff * config.CLOUD_BACKOFF_FACTOR,
                                  config.CLOUD_BACKOFF_MAX_S)

    def _wait_to_poll(self, ctl: _Ctl, seconds: float) -> None:
        """Sleep between polls, unless the network comes back first."""
        ctl.wake_poller.wait(seconds)
        ctl.wake_poller.clear()

    def _poll_once(self) -> bool:
        """One long poll. True if a schedule arrived and was applied."""
        hold = config.CLOUD_HOLD_S
        found = self._request(
            "GET", f"/desired?since={self._desired_rev}&wait={hold}",
            timeout=hold + _HOLD_MARGIN_S)
        if found is None:
            return False   # 204: nothing newer, which is the usual answer

        opened = envelope.unseal(self.identity.box_key, self.identity.device_id,
                                 "desired", found["envelope"])
        rev = int(found["envelope"]["rev"])

        # The check the relay cannot make for us. Its own refusal is about two
        # phones racing; this one is about *this* device's memory of what it
        # has already done, which is the thing that survives a power cut.
        if rev <= self._desired_rev:
            log.warning("relay offered revision %d, which is not newer than %d — ignoring",
                        rev, self._desired_rev)
            return False

        self._apply(opened, rev)
        return True

    def _apply(self, opened: dict, rev: int) -> None:
        payload = str(opened.get("payload") or "").strip()
        slots = opened.get("slots")

        try:
            if payload:
                kind = _schedule_kind(payload)
                if kind is None:
                    raise ValueError(
                        "the cloud carries schedules only; "
                        "the clock comes from NTP on a device that can reach a relay")
                ok, message = self.dispenser.apply_payload(payload, source="cloud")
                if not ok:
                    raise ValueError(message)
            elif slots is not None:
                from . import sc1
                parsed = sc1.slots_from_json(slots)
                if parsed is None:
                    raise ValueError("the slots array did not parse")
                self.dispenser.set_schedule(parsed, source="cloud")
            else:
                raise ValueError("no payload and no slots")
        except Exception as exc:  # noqa: BLE001
            # Recorded against the revision and *not* retried. A schedule the
            # firmware refuses — a tray that is not fitted, most likely — will
            # be refused identically forever, and a device that re-fetches it
            # every fifty seconds is a device hammering the relay about a
            # problem only a person can fix. The refusal goes up in the next
            # report, which is where somebody will see it.
            log.error("cloud schedule at revision %d was refused: %s", rev, exc)
            # The prefix is load-bearing: `_note_success`, which runs one
            # statement later in `_poll_loop`, clears any error that does not
            # carry it. Without it `lastError` was blank while `desiredRev` had
            # already moved past the refused revision — so the app showed a
            # healthy device running a schedule it had silently rejected, and
            # the revision was never re-fetched.
            self._remember(rev, applied=False, error=f"refused: {exc}")
            self.nudge()
            return

        log.info("applied a schedule from the cloud (revision %d)", rev)
        self._remember(rev, applied=True, error="")
        self.nudge()

    # ── receiving: the tap ──────────────────────────────────────────────────

    def _command_loop(self, ctl: _Ctl) -> None:
        """The same long poll as `_poll_loop`, on the slot that carries taps.

        A duplicate of the shape rather than a shared helper on purpose: the two
        differ in what a failure costs. A schedule that arrives a minute late is
        a schedule that arrives; a release that arrives a minute late may find
        its window closed. If these ever need different backoffs — and the
        argument for a shorter ceiling here is a good one — this is where that
        goes, and merging them now would have to be undone to get it.
        """
        backoff = config.CLOUD_BACKOFF_MIN_S
        epoch = self._network_epoch
        while not ctl.stop.is_set():
            try:
                started = time.monotonic()
                self._command_once()
                self._note_success()
                backoff = config.CLOUD_BACKOFF_MIN_S

                remaining = _MIN_CYCLE_S - (time.monotonic() - started)
                if remaining > 0:
                    self._wait_to_command(ctl, remaining)
            except Exception as exc:  # noqa: BLE001
                self._note_failure(exc)
                self._wait_to_command(ctl, _jittered(backoff))
                if self._network_epoch != epoch:
                    epoch = self._network_epoch
                    backoff = config.CLOUD_BACKOFF_MIN_S
                else:
                    backoff = min(backoff * config.CLOUD_BACKOFF_FACTOR,
                                  config.CLOUD_BACKOFF_MAX_S)

    def _wait_to_command(self, ctl: _Ctl, seconds: float) -> None:
        ctl.wake_commander.wait(seconds)
        ctl.wake_commander.clear()

    def _command_once(self) -> None:
        """Collect one command, if there is a newer one, and carry it out.

        Note what this deliberately does *not* honour: `CLOUD_IDLE_POLL_S`. The
        cheap mode lets a schedule wait fifteen minutes, which is a reasonable
        trade for somebody's hosting bill. A release cannot wait fifteen minutes
        — its whole window is an hour and the person is standing there — so this
        slot is polled continuously whatever that setting says. A device on a
        metered relay should turn the *cloud* off, not keep it on in a mode where
        the release button silently does nothing for a quarter of an hour.
        """
        hold = config.CLOUD_HOLD_S
        found = self._request(
            "GET", f"/command?since={self._command_rev}&wait={hold}",
            timeout=hold + _HOLD_MARGIN_S)
        if found is None:
            return

        opened = envelope.unseal(self.identity.box_key, self.identity.device_id,
                                 "command", found["envelope"])
        rev = int(found["envelope"]["rev"])

        if rev <= self._command_rev:
            log.warning("relay offered command revision %d, which is not newer than %d "
                        "— ignoring", rev, self._command_rev)
            return

        # Recorded *before* acting, and persisted. If the drop below throws, or
        # the power goes at the wrong instant, the command must not be collected
        # a second time and turned into a second pill. The dose is still owed
        # and still releasable — from the app again, or from the LAN — which is
        # the recoverable direction.
        with self._lock:
            self._command_rev = rev
        self._save_state()

        self._carry_out(opened, rev)

    def _claim(self, held: bool) -> None:
        """주인이 생겼거나(`hello`), 없어졌다(`goodbye`). SD 카드에 남긴다.

        카드에 쓰는 이유: 메모리에만 두면 재부팅 뒤에 상자가 다시 짝을 맺자고 한다 —
        짝은 폰 안에 그대로 있는데.

        되돌릴 수 있어야 하는 이유: 처음에는 한 번 찍히면 안 지웠다. 그러면 폰에서
        짝을 푼 뒤에도 상자는 자기가 누군가의 것이라고 믿고 짝짓기 코드를 영영 안
        띄운다. 새 보호자, 새 폰, 다음에 그 앞에 서는 누구든 할 수 있는 일이 없어진다.
        """
        with self._lock:
            now = datetime.now().isoformat(timespec="seconds") if held else ""
            if bool(self._claimed_at) == held:
                return
            self._claimed_at = now
        self._save_state()
        self.nudge()

    def _bench(self, action: str, opened: dict, rev: int) -> None:
        """Move a tray, or sound the buzzer, because somebody asked from the app.

        Why these are separate from `release`
        ------------------------------------
        `release` answers "give me the dose that is owed", and the device's own
        sense of what is due is the authority — a release naming a dose that is
        not currently offered does nothing, which is what stops a notification
        tapped four hours late from dropping a second pill.

        These two answer a different question: **does this machine work.** They
        are what somebody standing in front of an assembled dispenser needs, and
        what a demonstration needs, and neither is answerable through `release`
        because a bench with no prescription loaded has nothing due. `drop`
        therefore goes to `drop_now`, which is the same call the device's own
        page makes and which deliberately does not touch the scheduler: checking
        the machine must not cancel a real dose.
        `beep` moves nothing at all.

        Who can ask
        -----------
        Only whoever holds the printed code. The command arrives sealed under
        the box key, and the relay cannot make one — it carries ciphertext it
        has never been able to read. So "operate this dispenser from anywhere"
        is exactly as strong as "hold the sticker", which is the security model
        this device already has.

        A drop is still recorded as a dose (`reason: "manual"`), because
        something did leave the hopper and a record that omits it is a record
        that undercounts what the person actually has. It is marked manual so
        the adherence figures can tell it from a scheduled dose.
        """
        if action == "beep":
            # `Indicator` 프로토콜에는 소리를 내는 메서드가 없다. 화면만 달린 빌드,
            # 부저만 달린 빌드, 둘 다 없는 빌드가 전부 유효하기 때문이다. 그래서
            # 부저가 실제로 있을 때만 울린다 — 없으면 조용히 아무 일도 안 한다.
            buzzer = getattr(self.dispenser.indicator, "buzzer", None)
            if buzzer is None:
                log.info("a beep arrived (revision %d) but this build has no "
                         "buzzer — nothing to sound", rev)
                return
            # 울리는 동안 이 스레드를 붙잡지 않는다.
            #
            # 3초는 소리로는 짧고 커맨드 루프에서는 길다. 실제로 부저와 트레이를
            # 잇달아 보냈더니 트레이가 그만큼 늦게 돌았다 — 실패가 아니라 지연이고,
            # 누른 사람에게는 구별이 안 된다. 소리는 아무것도 기다리지 않으므로
            # 따로 내보내고 루프는 다음 명령을 보러 간다.
            #
            # daemon=True: 이것 때문에 종료가 3초 늦어질 이유가 없다.
            threading.Thread(target=run, name="snapcare-beep", daemon=True).start()
            log.info("beeped from the cloud (revision %d)", rev)
            return

        tray = _optional_int(opened.get("tray"))
        if tray is None:
            log.warning("a %s from the cloud (revision %d) named no tray", action, rev)
            return

        if action == "due":
            # 발표용. 이 칸의 복용을 지금 밀린 것으로 만든다 — 그 뒤는 전부 평소
            # 경로다. `device.offer_now` 에 왜 가짜 화면을 안 그리는지 적어 뒀다.
            try:
                self.dispenser.offer_now(tray)
            except (KeyError, RuntimeError) as exc:
                log.error("a demo alarm from the cloud could not be raised: %s", exc)
                self._remember(self._desired_rev, applied=False, error=f"refused: {exc}")
                self.nudge()
                return
            log.info("tray %d is due now, from the cloud (revision %d)", tray, rev)
            self.nudge()
            return

        try:
            self.dispenser.drop_now(tray)
        except (KeyError, RuntimeError) as exc:
            # A tray that is not wired, or no GPIO library. Reported up the same
            # channel the tap came down — the person who tapped needs to hear it,
            # and on this path they are not in the room.
            log.error("a drop from the cloud could not be carried out: %s", exc)
            self._remember(self._desired_rev, applied=False, error=f"refused: {exc}")
            self.nudge()
            return

        log.info("dropped tray %d from the cloud (revision %d)", tray, rev)
        self.nudge()

    def _carry_out(self, opened: dict, rev: int) -> None:
        action = str(opened.get("action") or "").strip().lower()

        if action == "hello":
            # 앱이 짝을 맺자마자 보내는 한마디. 아무것도 움직이지 않는다.
            #
            # 기기는 짝짓기를 볼 수 없다 — 앱은 인쇄된 코드에서 열쇠를 스스로 만들
            # 뿐 아무에게도 알리지 않는다. 그래서 이 한마디가 오기 전까지 상자는 이미
            # 짝이 맺힌 폰을 앞에 두고 "짝을 맺자" 는 QR 을 계속 띄웠다.
            #
            # 이것이 증거가 되는 이유: 상자 열쇠로 봉해져 오므로 만들 수 있는 것은
            # 코드를 쥔 쪽뿐이다. 릴레이는 이 봉투를 열지 못하고 지어내지도 못한다.
            self._claim(True)
            log.info("a phone claimed this box (revision %d)", rev)
            return

        if action == "goodbye":
            # 짝을 푼 폰의 마지막 한마디. `hello` 의 짝이고, 없으면 비대칭이 남는다 —
            # 폰은 열쇠를 버렸는데 상자는 그것을 볼 수 없어서, 아무도 가지지 않은
            # 상자가 짝짓기 코드를 영영 안 띄운다. 다음 사람이 그 앞에서 할 수 있는
            # 일이 없어진다.
            self._claim(False)
            log.info("the phone let go of this box (revision %d)", rev)
            return

        if action in ("drop", "beep", "due"):
            self._bench(action, opened, rev)
            return

        if action != "release":
            log.warning("command revision %d asks for %r, which this firmware "
                        "does not do", rev, action or "nothing")
            return

        tray = _optional_int(opened.get("tray"))
        minutes = _optional_int(opened.get("minutes"))

        try:
            released = self.dispenser.release(tray=tray, minutes=minutes)
        except RuntimeError as exc:
            # No GPIO library. Reported up the same channel the tap came down,
            # because the person who tapped is the one who needs to hear it.
            log.error("a release from the cloud could not be carried out: %s", exc)
            self._remember(self._desired_rev, applied=False, error=f"refused: {exc}")
            self.nudge()
            return

        if not released:
            # The ordinary case for a stale notification, and not an error. See
            # the module docstring: the device's own sense of what is due is the
            # authority, and it has just said nothing is.
            log.info("a release arrived (revision %d) with no matching dose "
                     "waiting — nothing moved", rev)
            return

        log.info("released tray %s from the cloud (revision %d)",
                 ", ".join(str(r["tray"]) for r in released), rev)
        # `_record` already nudged the publisher for each dose. This is belt and
        # braces for the app, which is showing a spinner on somebody's phone.
        self.nudge()

    # ── sending: what the device says about itself ──────────────────────────

    def _publish_loop(self, ctl: _Ctl) -> None:
        backoff = config.CLOUD_BACKOFF_MIN_S
        epoch = self._network_epoch
        while not ctl.stop.is_set():
            try:
                self._publish_once()
                backoff = config.CLOUD_BACKOFF_MIN_S
                # Woken early by `nudge` when a dose is dispensed or a schedule
                # changes; otherwise this is the heartbeat, which is what lets
                # the app distinguish a quiet dispenser from an unplugged one.
                self._wait_to_publish(ctl, config.CLOUD_HEARTBEAT_S)
            except Exception as exc:  # noqa: BLE001
                self._note_failure(exc)
                # The *same* wait, so a dose that happens during a backoff is
                # published as soon as the relay is reachable rather than at
                # the end of a retry interval that may by then be five minutes
                # long. After an outage that is precisely when there is
                # something worth sending: the doses given while it was down.
                self._wait_to_publish(ctl, _jittered(backoff))
                if self._network_epoch != epoch:
                    epoch = self._network_epoch
                    backoff = config.CLOUD_BACKOFF_MIN_S
                else:
                    backoff = min(backoff * config.CLOUD_BACKOFF_FACTOR,
                                  config.CLOUD_BACKOFF_MAX_S)

    def _wait_to_publish(self, ctl: _Ctl, seconds: float) -> None:
        """Sleep, unless something asks to be published sooner."""
        ctl.wake_publisher.wait(seconds)
        ctl.wake_publisher.clear()

    def _publish_once(self) -> None:
        report = self._report()
        body = json.dumps(report, sort_keys=True)
        # A heartbeat still goes up when nothing has changed — that is its
        # whole job — but an unchanged report between heartbeats is not worth a
        # revision, an fsync on the relay and a wake-up for every app watching.
        if body == self._last_published and not self._heartbeat_due():
            return

        with self._lock:
            rev = self._reported_rev + 1

        sealed = envelope.seal(self.identity.box_key, self.identity.device_id,
                               "reported", rev, report)
        try:
            self._request("PUT", "/reported", body={"envelope": sealed})
        except _Conflict:
            # Another process of ours, or a restart that lost count. Ask the
            # relay what revision it is actually on and carry on from there,
            # rather than climbing one at a time against a number we cannot see.
            self._resync_reported_rev()
            raise

        with self._lock:
            self._reported_rev = rev
            self._last_published = body
        self._save_state()
        self._note_success()

    def _report(self) -> dict:
        status = self.dispenser.status()
        with self._lock:
            network = dict(self._network)
        # Where the device is, so the app can offer the LAN as a shortcut.
        # Relay round-trips are quick but not instant, and somebody standing in
        # the room next to the dispenser should not be talking to a data centre
        # to open a tray. This is inside the sealed envelope: only whoever holds
        # the pairing code can read which WiFi the device is on.
        network["deviceUrl"] = provisioning.device_url()
        return {
            "at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "firmware": _firmware_version(),
            "desiredRev": self._desired_rev,
            "lastError": self._last_error,
            "network": network,
            "status": status,
            "events": self.dispenser.events(limit=REPORT_EVENTS),
        }

    def _heartbeat_due(self) -> bool:
        with self._lock:
            if not self._last_contact:
                return True
            return time.monotonic() - self._last_contact >= config.CLOUD_HEARTBEAT_S

    def _resync_reported_rev(self) -> None:
        meta = self._request("GET", "", timeout=15)
        if isinstance(meta, dict):
            with self._lock:
                self._reported_rev = max(
                    self._reported_rev, int(meta.get("reported", {}).get("rev") or 0))
            self._save_state()

    # ── talking to the relay ────────────────────────────────────────────────

    def _request(self, method: str, suffix: str, body: dict | None = None,
                 timeout: int = 30) -> dict | None:
        url = f"{self.relay_url}/v1/devices/{self.identity.device_id}{suffix}"
        status, data = self._session.request(
            method, url, body=body, timeout=timeout,
            headers={"Authorization": f"Bearer {self.identity.access_token}",
                     "Content-Type": "application/json"})

        if status == 204:
            return None
        if status == 409:
            raise _Conflict(str((data or {}).get("error", "revision conflict")))
        if status == 404 and method == "GET":
            # The mailbox does not exist yet, because nothing has ever written
            # to it. Not an error: the publisher creates it on its first
            # report, and this poll simply has nothing to collect.
            return None
        if status >= 400:
            raise _RelayError(f"{status}: {(data or {}).get('error', 'no detail')}")
        if not isinstance(data, dict):
            raise _RelayError(f"{status}: the relay did not answer with an object")
        return data

    # ── memory ──────────────────────────────────────────────────────────────

    def _state_path(self):
        return self.dispenser.store.dir / config.CLOUD_STATE_FILE.name

    def _load_state(self) -> dict:
        try:
            return json.loads(self._state_path().read_text(encoding="utf-8"))
        except FileNotFoundError:
            return {}
        except (json.JSONDecodeError, OSError, UnicodeDecodeError) as exc:
            # Starting from zero means the next schedule the relay offers is
            # applied even though it may already be running. That is the safe
            # direction: re-applying the current schedule is a no-op, where
            # refusing everything would leave the device stuck on whatever it
            # had when the file was damaged.
            log.error("cloud state is unreadable (%s) — starting from zero", exc)
            return {}

    def _save_state(self) -> None:
        with self._lock:
            data = {
                "version": 1,
                "relayUrl": self.relay_url,
                "desiredRev": self._desired_rev,
                "reportedRev": self._reported_rev,
                "commandRev": self._command_rev,
                "appliedAt": self._applied_at,
                "claimedAt": self._claimed_at,
            }
        try:
            write_atomic(self._state_path(), json.dumps(data, indent=2))
        except OSError as exc:
            log.error("could not record the cloud revision (%s) — "
                      "a restart may re-apply the current schedule", exc)

    def _remember(self, rev: int, applied: bool, error: str) -> None:
        with self._lock:
            self._desired_rev = rev
            self._last_error = error
            if applied:
                self._applied_at = datetime.now().isoformat(timespec="seconds")
        self._save_state()

    def _note_success(self) -> None:
        with self._lock:
            self._last_contact = time.monotonic()
            self._attempts = 0
            if self._last_error and not self._last_error.startswith("refused:"):
                log.info("cloud link is back")
                self._last_error = ""

    def _note_failure(self, exc: Exception) -> None:
        with self._lock:
            self._attempts += 1
            self._last_error = f"{type(exc).__name__}: {exc}"
            first = self._attempts == 1
        # Once at warning, then quietly. A relay that is down for a day should
        # not be the only thing in the journal — the dose log has to stay
        # readable, and it is on the same SD card.
        (log.warning if first else log.debug)("cloud: %s", exc)


class _RelayError(Exception):
    """The relay answered, and the answer was not usable."""


class _Conflict(_RelayError):
    """Our revision was not newer than the relay's."""


class _UrllibSession:
    """The real network. One class so the tests can replace exactly this."""

    def request(self, method: str, url: str, body: dict | None,
                timeout: int, headers: dict) -> tuple[int, dict | None]:
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(url, data=data, method=method)
        for key, value in headers.items():
            request.add_header(key, value)

        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.status, _read_json(response)
        except urllib.error.HTTPError as exc:
            # A 4xx is an answer, not a transport failure, and the caller needs
            # to tell 409 from 500 to decide whether to resync or to back off.
            return exc.code, _read_json(exc)


def _read_json(response) -> dict | None:
    raw = response.read(config.CLOUD_MAX_BODY + 1)
    if len(raw) > config.CLOUD_MAX_BODY:
        raise _RelayError("the relay sent more than this device will read")
    if not raw:
        return None
    try:
        parsed = json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _schedule_kind(payload: str) -> str | None:
    from . import sc1
    kind = sc1.message_kind(payload)
    return kind if kind in ("schedule", "weekly") else None


def _optional_int(value) -> int | None:
    """An int, or None for anything a command left out or got wrong.

    None means "do not narrow on this field", which for a release means every
    dose currently due. That is the safe reading: the set of doses due is the
    device's own, and the worst a malformed command achieves is releasing what
    the person would have got by tapping the main-screen button anyway.
    """
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _jittered(seconds: float) -> float:
    """Spread reconnections out.

    Every dispenser in the field notices the same deploy at the same second.
    Without this they all come back on the same second too, which is a relay
    that is knocked over by its own clients the moment it recovers.
    """
    spread = seconds * config.CLOUD_BACKOFF_JITTER
    return max(1.0, seconds + random.uniform(-spread, spread))


def _firmware_version() -> str:
    from . import __version__
    return __version__

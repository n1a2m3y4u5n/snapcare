"""Deciding when to be an access point and when to be a client.

[`wifi.py`](wifi.py) is the mechanism: one function per nmcli call, no memory of
what it did last. This is the policy, and all of it falls out of one physical
fact — **a Pi 3B has a single radio.** It can be the setup hotspot or it can be
on the house network, never both. So every attempt to join is also the act of
hanging up on the phone that asked for it.

Two things follow, and between them they are most of this file.

The join cannot be answered synchronously
-----------------------------------------
The request arrives over the setup hotspot. Taking that hotspot down to join the
house network destroys the socket the answer would have travelled on, so the
reply never lands — not on success, and, more importantly, **not on failure
either.** A mistyped password used to be indistinguishable from a successful
setup: the phone saw its request die, the page said "the device left its setup
network, which usually means it joined yours", and the person went looking for a
dispenser that was not on their WiFi and no longer had a hotspot to go back to.

So the answer is sent *first*, while the radio is still an access point, and the
join happens on a worker thread afterwards. The page then watches the outcome
through whichever address becomes reachable.

A failed join must put the hotspot back
---------------------------------------
Within seconds, not eventually. The old code left the device with no access
point and no network until a ten-minute grace timer expired, which is ten
minutes of a device that has vanished — and the only cue was a phone quietly
dropping back to the house WiFi. Now a join that fails restores the hotspot with
the reason recorded against it, so the phone rejoins the same network it came in
on and the page it re-opens says *"the password was not accepted"*.

The same reflex covers the unattended case. A router that takes longer to come
back after a power cut than the device is willing to wait used to strand the
dispenser on its own hotspot permanently: nothing ever tried the house network
again, and a dispenser in a spare room can sit there for weeks with nobody
noticing that the app has stopped hearing from it. `tick` now retries, on a
timer, whenever the hotspot is up and nobody is using it.

Nothing in here is allowed to block
-----------------------------------
`tick` is called from the same loop that decides whether a dose is owed. Joining
a network takes tens of seconds, so every operation that touches the radio runs
on a worker thread and `tick` only ever *decides*. One worker at a time, because
there is one radio: a retry that fires while somebody is typing a password would
otherwise fight it.
"""
from __future__ import annotations

import logging
import sys
import threading
import time

from . import config, provisioning, qr, wifi
from .indicators import Indicator
from .provisioning import Identity

log = logging.getLogger(__name__)

#: The states an attempt can be in, as the setup page sees them.
#:
#:   idle        nothing has been tried since this firmware started
#:   joining     the radio has left the hotspot and is joining a named network
#:   joined      it is on that network, with an address
#:   failed      it is not, the reason is recorded, and the hotspot is back
#:   recovering  no one asked; the device is retrying a network it already knows
IDLE, JOINING, JOINED, FAILED, RECOVERING = (
    "idle", "joining", "joined", "failed", "recovering")


class Supervisor:
    """One radio, one worker, and the decision about which mode to be in.

    Constructed with `manage=False` on a development machine, where it reports
    honestly that it is not touching the network rather than pretending to.
    """

    def __init__(self, identity: Identity, indicator: Indicator | None = None,
                 manage: bool = True, on_online=None, announce: bool = True):
        self.identity = identity
        self.indicator = indicator
        self.manage = manage
        #: Called with the `wifi.Status` each time the device *becomes* reachable
        #: on a real network. The cloud link hangs off this: after an outage its
        #: retry backoff can be minutes long, and a device that is back on the
        #: WiFi but missing from the app for another four minutes reads, to
        #: whoever is watching, exactly like a device that is still down.
        self.on_online = on_online
        self._announce = announce

        self._lock = threading.RLock()
        self._state = IDLE
        self._ssid = ""
        self._detail = ""
        self._address = ""
        self._hotspot_back = False
        self._changed_at = 0.0

        self._worker: threading.Thread | None = None
        self._stop = threading.Event()

        self._online = False
        self._offline_since: float | None = None
        self._hotspot_since: float | None = None
        self._last_recovery = 0.0
        self._portal_seen = 0.0
        self._cached: wifi.Status | None = None
        self._cached_at = 0.0

    # ── what the API and the pages see ──────────────────────────────────────

    def snapshot(self) -> dict:
        """The attempt, for `/api/wifi/attempt` and the setup page.

        `hotspotBack` is the field the page acts on: it is the difference
        between "try again here" and "you will have to find this device on your
        own network", and getting it wrong is the difference between a person
        finishing setup and a person unplugging the device.
        """
        with self._lock:
            return {
                "state": self._state,
                "ssid": self._ssid,
                "detail": self._detail,
                "address": self._address,
                "hotspotBack": self._hotspot_back,
                "secondsAgo": (round(time.monotonic() - self._changed_at)
                               if self._changed_at else None),
                "busy": self._busy(),
                "managed": self.manage,
            }

    def note_portal_activity(self) -> None:
        """Somebody is looking at the setup page. Do not pull the rug.

        Called from the web server on every request served while the hotspot is
        up. Without it the unattended retry below is free to take the access
        point down in the middle of somebody typing their WiFi password.
        """
        self._portal_seen = time.monotonic()

    # ── the join, as asked for from the setup page ──────────────────────────

    def begin_join(self, ssid: str, password: str | None,
                   hidden: bool = False) -> tuple[bool, str]:
        """Accept a join and get out of the way. (accepted, sentence).

        Returns before anything touches the radio, so the answer reaches the
        phone that is still connected to the hotspot. Everything after this is
        watched through `snapshot`.
        """
        if not self.manage:
            return False, "this firmware was started with WiFi management off"
        if not wifi.available():
            return False, "NetworkManager is not available on this device"

        with self._lock:
            if self._busy():
                # Two joins at once is two nmcli calls fighting over one radio,
                # and the loser's error is about the driver.
                return False, f"already {self._state}; give it a few seconds"
            self._set(JOINING, ssid=ssid, detail=f"Joining {ssid}…", address="",
                      hotspot_back=False)
            self._spawn("join", self._join_worker, ssid, password, hidden)
        return True, f"Joining {ssid}."

    def _join_worker(self, ssid: str, password: str | None, hidden: bool) -> None:
        # Read *before* the attempt, and by profile name rather than by SSID.
        #
        # A network the device was already using must keep its profile even if
        # somebody mistypes the password now. Testing `ssid in saved_ssids()`
        # was not enough on its own: nmcli can hold several profiles for one
        # SSID, so "the device knew this network" and "this exact profile
        # existed before" are different questions, and only the second one can
        # decide what is safe to delete. See `wifi.forget_profiles_for`.
        kept = wifi.profile_names_for(ssid)

        ok, detail = wifi.connect(ssid, password, hidden=hidden)
        if ok:
            state = wifi.status()
            with self._lock:
                self._set(JOINED, ssid=state.ssid or ssid, detail=detail,
                          address=state.address or "", hotspot_back=False)
            self._went_online(state)
            return

        # Only what this attempt created. A profile that was there beforehand is
        # the device's way back onto the house network and is never touched.
        wifi.forget_profiles_for(ssid, keep=kept)

        # The rollback. This is the whole reason the join runs out here.
        back, message = wifi.start_hotspot(self.identity)
        if back:
            self._note_hotspot()
            log.warning("could not join %s (%s) — the setup network is back up", ssid, detail)
        else:
            log.error("could not join %s (%s) and could not restore the setup "
                      "network either (%s) — this device is now only reachable "
                      "over a cable", ssid, detail, message)
        with self._lock:
            self._set(FAILED, ssid=ssid, detail=detail, address="", hotspot_back=back)

    # ── being an access point on purpose ────────────────────────────────────

    def raise_hotspot(self) -> tuple[bool, str]:
        """Put the setup network up now, whatever the radio is doing.

        Exposed because there is one case a person needs it for: the device is on
        a network they no longer control — a moved house, a changed password, an
        old office — and the only way back in is the hotspot, from a phone that
        is standing next to it.
        """
        if not self.manage:
            return False, "this firmware was started with WiFi management off"
        ok, message = wifi.start_hotspot(self.identity)
        if ok:
            self._note_hotspot()
            self.announce()
        return ok, message

    def announce(self) -> None:
        """Print the join details, so an SSH session is enough to set up a board."""
        log.info("setup network: %s   password: %s",
                 self.identity.ssid, self.identity.passphrase)
        log.info("setup page:    %s", provisioning.setup_url())
        if not self._announce:
            return
        try:
            print("\n" + qr.to_text(self.identity.wifi_qr) + "\n", file=sys.stderr)
        except qr.QREncoderUnavailable:
            log.info("(install segno to print the join code here: pip install segno)")

    # ── the loop ────────────────────────────────────────────────────────────

    def start(self) -> None:
        """At boot: get onto something, without holding the dispenser up.

        Dispatched rather than waited for. The old code blocked here for up to
        `WIFI_JOIN_TIMEOUT_S` before the first scheduler tick, which on a
        morning where the power came back at 07:58 is a dose held up by a
        router. Nothing about dispensing needs the network.
        """
        if not self.manage:
            log.info("WiFi management disabled; leaving the network alone")
            return
        if not wifi.available():
            log.warning("NetworkManager is not available — not managing WiFi")
            self.manage = False
            return
        with self._lock:
            self._spawn("bring-up", self._bring_up_worker)

    def _bring_up_worker(self) -> None:
        state = wifi.status()
        if state.mode == "connected":
            log.info("already on %s", state.ssid)
            self._went_online(state)
            return

        if wifi.has_known_network():
            log.info("waiting up to %ds for a known network", config.WIFI_JOIN_TIMEOUT_S)
            state = wifi.wait_until_connected(config.WIFI_JOIN_TIMEOUT_S,
                                              should_stop=self._stop.is_set)
            if state.mode == "connected":
                log.info("joined %s", state.ssid)
                self._went_online(state)
                return
            if self._stop.is_set():
                return

        log.info("no network — raising the setup hotspot %s", self.identity.ssid)
        ok, message = wifi.start_hotspot(self.identity)
        if ok:
            self._note_hotspot()
            self.announce()
        else:
            # Worth shouting about: the device is now unreachable by the
            # intended route, and the only remaining way in is a cable.
            log.error("could not raise the setup hotspot: %s", message)

    def tick(self) -> None:
        """Watch the network. Decide only; the radio is somebody else's thread."""
        if not self.manage or self._busy():
            return
        if not wifi.available():
            return

        state = self._status(max_age=config.NET_POLL_S)
        if state.mode == "connected":
            self._offline_since = None
            self._hotspot_since = None
            if not self._online:
                self._went_online(state)
            return

        if self._online:
            self._online = False
            log.info("off the network (%s)", state.detail or state.mode)

        if state.mode == "hotspot":
            self._offline_since = None
            if self._hotspot_since is None:
                self._hotspot_since = time.monotonic()
            if self._recovery_due():
                with self._lock:
                    self._set(RECOVERING, ssid="",
                              detail="Trying the network this device already knows…",
                              address="", hotspot_back=False)
                    self._spawn("recover", self._recover_worker)
            return

        if state.mode == "unavailable":
            return

        # Disconnected, and NetworkManager is the one retrying. A router
        # rebooting is not our business: it comes back on its own in seconds,
        # and raising a hotspot every time the WiFi blinks would take the device
        # off the network far more often than it rescued it.
        self._offline_since = self._offline_since or time.monotonic()
        if time.monotonic() - self._offline_since > config.OFFLINE_GRACE_S:
            log.warning("off the network for %d minutes — raising the setup hotspot",
                        config.OFFLINE_GRACE_S // 60)
            self._offline_since = None
            with self._lock:
                self._spawn("fallback", self._fallback_worker)

    def _fallback_worker(self) -> None:
        ok, message = wifi.start_hotspot(self.identity)
        if ok:
            self._note_hotspot()
            self.announce()
        else:
            log.error("could not raise the setup hotspot: %s", message)

    # ── getting back onto a network nobody is standing next to ──────────────

    def _recovery_due(self) -> bool:
        """Is it worth taking the hotspot down to try the house network again?

        Three conditions, and each one is a way of not making things worse:

        * there has to be something saved to go back to, or this is a hotspot
          being dropped for nothing;
        * the portal has to have been quiet for a while, because the alternative
          is pulling the network out from under somebody who is mid-setup;
        * and it must not have been tried a moment ago, because the failure mode
          of a router that is still booting is a device that spends its life
          cycling its own radio.
        """
        now = time.monotonic()
        if not wifi.has_known_network():
            return False
        if now - self._portal_seen < config.PORTAL_QUIET_S:
            return False
        since = max(self._hotspot_since or 0.0, self._last_recovery)
        return now - since >= config.HOTSPOT_RETRY_S

    def _recover_worker(self) -> None:
        """Drop the hotspot, let NetworkManager autoconnect, put it back if not.

        Every saved profile autoconnects, so the correct move is to stand back
        for a few seconds rather than to pick a network and drive it — which
        would also mean deciding *which* saved network, and NetworkManager
        already ranks them better than this firmware can.
        """
        self._last_recovery = time.monotonic()
        log.info("hotspot has been up and idle — trying the known network again")
        wifi.stop_hotspot()

        state = wifi.wait_until_connected(config.WIFI_JOIN_TIMEOUT_S,
                                         should_stop=self._stop.is_set)
        if state.mode == "connected":
            log.info("back on %s by itself", state.ssid)
            with self._lock:
                self._set(JOINED, ssid=state.ssid or "", detail="Reconnected.",
                          address=state.address or "", hotspot_back=False)
            self._went_online(state)
            return

        if self._stop.is_set():
            return

        ok, message = wifi.start_hotspot(self.identity)
        if ok:
            self._note_hotspot()
        else:
            log.error("could not restore the setup hotspot after a retry: %s", message)
        with self._lock:
            # Back to where we were. Deliberately *not* recorded as a failure:
            # nobody asked for this and nobody is watching, and a failure banner
            # on the setup page about an attempt the person never made would
            # send them looking for a problem that is a router being slow.
            self._set(IDLE if self._state == RECOVERING else self._state,
                      ssid="", detail="", address="", hotspot_back=ok)

    # ── plumbing ────────────────────────────────────────────────────────────

    def _status(self, max_age: float = 0.0) -> wifi.Status:
        """`wifi.status()`, at most this often.

        Each call is up to three nmcli processes. The tick loop asks every
        fifteen seconds and does not need a fresher answer than this; the API
        asks for a fresh one, because somebody is looking at it.
        """
        now = time.monotonic()
        if self._cached is not None and now - self._cached_at < max_age:
            return self._cached
        self._cached = wifi.status()
        self._cached_at = now
        return self._cached

    def _busy(self) -> bool:
        return self._worker is not None and self._worker.is_alive()

    def _spawn(self, name: str, target, *args) -> None:
        """One worker at a time. Callers hold `_lock` and have checked `_busy`."""
        self._cached = None
        self._worker = threading.Thread(target=self._guarded, args=(target, args),
                                        name=f"wifi-{name}", daemon=True)
        self._worker.start()

    def _guarded(self, target, args) -> None:
        try:
            target(*args)
        except Exception:  # noqa: BLE001
            # A network worker that raises must not be a dispenser that stops.
            # The state it leaves behind is whatever it had reached, which the
            # setup page will show as stuck rather than as finished — and the
            # next tick is free to try again.
            log.exception("a network operation failed")
        finally:
            self._cached = None

    def _set(self, state: str, ssid: str, detail: str, address: str,
             hotspot_back: bool) -> None:
        self._state = state
        self._ssid = ssid
        self._detail = detail
        self._address = address
        self._hotspot_back = hotspot_back
        self._changed_at = time.monotonic()

    def _note_hotspot(self) -> None:
        self._hotspot_since = time.monotonic()
        self._online = False
        self._cached = None
        if self.indicator:
            self.indicator.network_needs_setup()

    def _went_online(self, state: wifi.Status) -> None:
        self._online = True
        self._offline_since = None
        self._hotspot_since = None
        self._cached = None
        log.info("on %s at %s — the dispenser answers at %s",
                 state.ssid, state.address, provisioning.device_url())
        if self.indicator:
            self.indicator.network_online()
        if self.on_online:
            try:
                self.on_online(state)
            except Exception:  # noqa: BLE001
                log.exception("a network listener failed; the network is up regardless")

    def stop(self) -> None:
        """Tell the worker to give up, without waiting for it.

        Called first in the shutdown, so a worker parked in
        `wait_until_connected` — which can be forty-five seconds long — has the
        whole of the shutdown to notice rather than being joined out of a signal
        handler.
        """
        self._stop.set()

    def close(self) -> None:
        self.stop()
        worker = self._worker
        if worker is not None and worker.is_alive():
            # Not waited out. A join can be half a minute in and these are
            # daemon threads that hold nothing the next boot needs.
            worker.join(timeout=1.0)

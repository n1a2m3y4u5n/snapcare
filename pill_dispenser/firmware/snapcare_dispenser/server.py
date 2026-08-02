"""The device's web server: a JSON API, a compatibility API, and three pages.

Standard library only. `http.server` is not glamorous, but a dispenser should
install onto a fresh Raspberry Pi OS image with `apt install python3` and
nothing else — a device that needs a working package index to be set up is one
that cannot be set up on the network it is being set up *for*.

Two APIs, on purpose
--------------------
**`/api/...`** is the native one. It speaks JSON and SC1 payloads, so days of
the week and course durations survive, and the paper form sheet path reaches
the same firmware the phone does.

**`/save`, `/schedule`, `/release`, `/dropout`, `/dismiss`** are GET requests
that return an HTML page. Three of them are the Shaztech/Pilldispenser shapes
that `lib/hardware/dispenser.ts` in the web app already builds URLs for;
`/schedule` and `/release` are ours and have the same shape for the same reason.
An HTTPS page cannot `fetch()` an HTTP device (mixed content), but it *can* link
to one — so the app builds a link the person taps and the device answers with a
confirmation page.

`/schedule?payload=SC1*W*…` is the one that closes the paper-sheet path. `/save`
has no field for days of the week or course length, so a Mon/Wed/Fri
prescription read off a form sheet used to arrive as an every-day one — or, in
the app as shipped, not arrive at all, because the only other way in is a POST
the deployed HTTPS page cannot make. This carries the whole `SC1*W*` payload,
which is exactly what the sheet reader produces.

That constraint is why `/release` exists in this form at all. The release button
on the app's main screen is the one control the whole device now depends on, and
a control that only works from an HTTP origin would work in development and fail
on the deployed app.

The compatibility layer is lossy — `/save` has no field for days of the week —
so it records what it dropped and the response page says so.

Captive portal
--------------
When the setup hotspot is up, the probe URLs every mobile OS fetches to test
for internet are answered with a redirect. That is what makes the setup page
appear by itself instead of the person having to know an address.

Who is allowed to change things
-------------------------------
Reads are open: anything on the LAN can already reach this device, and the
captive probes arrive addressed to `connectivitycheck.gstatic.com` and friends,
so a name check on a GET would break the one flow that has to work.

Writes are not. A request that opens a tray or replaces the schedule is refused
unless it was addressed to a name this device answers to. Without that, any web
page open on a phone on the same WiFi can point a hostname it controls at the
dispenser's address and drive it — no CORS involved, because it never needs to
read the reply. See `_is_ours`.
"""
from __future__ import annotations

import ipaddress
import json
import logging
import re
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from . import config, envelope, gpiochip, provisioning, qr, sc1, wifi
from .device import Dispenser
from .network import Supervisor

log = logging.getLogger(__name__)

WEB_DIR = Path(__file__).parent / "web"

#: The URLs mobile operating systems fetch to decide whether they have
#: internet. Answering any of them with a redirect is the signal that pops the
#: "Sign in to network" sheet on the phone.
CAPTIVE_PROBES = {
    "/generate_204", "/gen_204",                       # Android
    "/hotspot-detect.html", "/library/test/success.html",  # iOS, macOS
    "/success.txt", "/canonical.html",                 # Firefox
    "/ncsi.txt", "/connecttest.txt", "/redirect",      # Windows
}

#: Bodies over this are refused unread. Nothing this API accepts is large, and
#: an unbounded read on a device with 1 GB of RAM is a way to stop a dispenser
#: from dispensing with a single request.
MAX_BODY = 64 * 1024

#: GET requests that change something. They exist because the web app navigates
#: to them as links — see the module docstring — and they are checked for a
#: plausible Host for the same reason the POSTs are.
MUTATING_GETS = {"/save", "/schedule", "/release", "/dropout", "/dismiss"}


class Router:
    """Everything the handler needs, so the handler stays a thin adapter."""

    def __init__(self, dispenser: Dispenser, identity: provisioning.Identity | None = None,
                 cloud=None, network: Supervisor | None = None, button=None):
        self.dispenser = dispenser
        self.identity = identity or provisioning.load_identity(dispenser.store)
        self.cloud = cloud
        #: The take-dose button, or None in a process that has no GPIO at all —
        #: the tests, and `make run` on a laptop. Only ever read, for the status
        #: page: the button drives the dispenser directly from the daemon, not
        #: through here.
        self.button = button
        #: The radio-mode policy. A server built without one — the tests, and
        #: `make run` on a laptop — gets a supervisor that manages nothing, so
        #: that every endpoint has something coherent to answer with instead of
        #: each one growing its own `if network is None` branch.
        self.network = network or Supervisor(self.identity, manage=False, announce=False)
        self._pages: dict[str, str] = {}

    def cloud_status(self) -> dict:
        """What the cloud link is doing, or a stand-in when there is none.

        A `None` here is a firmware started without one — `make run` does it,
        and so does anything constructing a server directly. Reporting a shape
        the caller can read either way keeps the branch out of the page.
        """
        if self.cloud is None:
            return {"enabled": False, "configured": False, "state": "off",
                    "relayUrl": "", "deviceId": "", "supported": envelope.available()}
        return self.cloud.status()

    def gpio_status(self) -> dict:
        """Which GPIO drivers this build actually got, and what is missing.

        This did not exist, and its absence was the real cost of pigpio leaving
        Raspberry Pi OS. A device whose buzzer failed to come up said so in one
        INFO line at startup and then nothing, anywhere, ever again — the screen
        was fitted, so `indicators` was non-empty and the status page looked
        healthy. A dispenser can sit in a bedroom like that for weeks, lighting
        up for doses nobody is in the room to see.

        `missing` is the part to put on a screen. Every entry is a sentence
        about a consequence rather than a library.
        """
        indicator = self.dispenser.indicator
        buzzer = getattr(indicator, "buzzer", None)
        display = getattr(indicator, "display", None)
        button = self.button
        backend = self.dispenser.servos.backend

        missing = []
        if not self.dispenser.servos_usable:
            missing.append("no GPIO library at all — no tray can be opened")
        elif backend.quality == "python":
            missing.append("servos are on Python-timed PWM and will hum between doses")
        if not buzzer:
            # Worse on this build than it reads. The chirp is the prompt to go
            # and release the dose, so a silent device is one whose doses expire
            # untaken unless the phone's own notification lands.
            missing.append("no buzzer — a due dose paints the screen but makes no sound")
        if not display:
            missing.append("no screen — nothing in the room shows a dose is due, "
                           "or which tray it is in")
        if button is not None and button.backend == "none":
            # Not fatal: the app's release button does the same job. Reported
            # because a build that has the button fitted and not working looks
            # identical, from the room, to one where nobody pressed it.
            missing.append("no take-dose button — a dose can only be released "
                           "from the app")

        return {
            "board": gpiochip.board_model() or "not a Raspberry Pi",
            "lgpioChip": gpiochip.chip_label(),
            "servo": {"backend": backend.name, "timing": backend.quality,
                      "movesHardware": backend.moves_hardware},
            "buzzer": {"backend": buzzer.backend if buzzer else "none",
                       "gpio": buzzer.gpio if buzzer else config.BUZZER_GPIO},
            #: `fitted` is weaker evidence than it looks and this is the only
            #: place that can say so. The ILI9341 is write-only — four-line SPI
            #: has no MISO — so the driver comes up, accepts every frame and
            #: reports a healthy 320x240 panel with nothing on the end of the
            #: ribbon. `fitted: true` therefore means "a driver is loaded and
            #: has not been dropped", never "there is a screen".
            #:
            #: `error` and `failures` are what turn that into something
            #: actionable. Neither driver *raises* on a write failure — it logs
            #: once and returns False — so a ribbon that works loose used to
            #: leave this block reporting a perfectly healthy screen for ever.
            #: A non-zero `failures` is a panel that is refusing frames right
            #: now; three in a row and the indicator drops it and `fitted`
            #: finally goes false.
            #:
            #: The geometry comes from the panel rather than from config, so a
            #: driver that does not answer reports nothing instead of inventing
            #: a size.
            "display": {"fitted": bool(display),
                        "backend": getattr(display, "backend", "none"),
                        "width": getattr(display, "width", 0),
                        "height": getattr(display, "height", 0),
                        "error": getattr(display, "error", ""),
                        "failures": getattr(indicator, "_panel_strikes", 0)},
            "button": {"fitted": bool(button and button.backend != "none"),
                       "backend": button.backend if button else "none",
                       "gpio": button.gpio if button else config.BUTTON_GPIO,
                       "presses": button.presses if button else 0},
            "missing": missing,
        }

    def page(self, name: str, **values: str) -> str:
        """Load a page from `web/`, substituting `{{name}}` placeholders."""
        if name not in self._pages:
            self._pages[name] = (WEB_DIR / name).read_text(encoding="utf-8")
        html = self._pages[name]
        for key, value in values.items():
            html = html.replace("{{" + key + "}}", value)
        return html


class Handler(BaseHTTPRequestHandler):
    router: Router  # set by make_server

    server_version = "SnapCareDispenser/1.0"
    protocol_version = "HTTP/1.1"

    # ── plumbing ────────────────────────────────────────────────────────────

    def log_message(self, fmt: str, *args) -> None:
        log.debug("%s %s", self.address_string(), fmt % args)

    def _send(self, status: int, body: bytes, content_type: str,
              headers: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        # The device has no internet and its pages must never wait on one.
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    #: CORS, so the web app can be developed against a real device from
    #: http://localhost:3000. It changes nothing about who can *reach* the
    #: device — anything on the LAN already could — but it does let a browser
    #: page read the answer. See the note in NOTES-FOR-WEBAPP.md.
    _CORS = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    }

    def _json(self, payload, status: int = HTTPStatus.OK, cors: bool = True) -> None:
        self._send(status, json.dumps(payload).encode(),
                   "application/json; charset=utf-8", self._CORS if cors else {})

    def _json_private(self, payload, status: int = HTTPStatus.OK) -> None:
        """JSON with no CORS header — for anything carrying a credential."""
        self._json(payload, status, cors=False)

    def _html(self, html: str, status: int = HTTPStatus.OK) -> None:
        self._send(status, html.encode(), "text/html; charset=utf-8")

    def _redirect(self, location: str) -> None:
        self._send(HTTPStatus.FOUND, b"", "text/plain", {"Location": location})

    def _too_large(self) -> bool:
        """Refuse an oversized body without reading it, and close the connection.

        Closing matters. This is HTTP/1.1 with keep-alive, so a body left unread
        in the socket is not discarded — it stays there and is parsed as the
        start of the next request on that connection. The result is a client
        that gets nonsense answers to correct requests, which is a far more
        confusing symptom than the refusal it came from.
        """
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= MAX_BODY:
            return False

        self.close_connection = True
        self._json({"ok": False, "error": "request too large"},
                   HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
        return True

    def _misdirected(self, path: str) -> bool:
        """Refuse a mutating request that arrived under somebody else's name.

        The attack this closes needs nothing but a domain and a page: point
        `dispenser.example.com` at the device's address, and any browser on the
        same WiFi that loads that page will happily POST a new schedule or a
        `/api/drop` to it. The reply is unreadable to the attacker, which stops
        nothing — dropping eight trays into a cup does not require reading the
        answer.

        The Host header is the one thing the attacker cannot forge, because it
        is the name their own page was fetched under.
        """
        host = _host_name(self.headers.get("Host"))
        if _is_ours(host):
            return False
        log.warning("refused %s %s addressed to %r — this device answers to %s, "
                    "%s.local, or its IP address", self.command, path, host,
                    config.MDNS_HOSTNAME, config.MDNS_HOSTNAME)
        # The body is being refused unread, and on a keep-alive connection an
        # unread body is parsed as the start of the next request. Same reasoning
        # as `_too_large`.
        self.close_connection = True
        self._json({"ok": False,
                    "error": f"this device does not answer to the name {host!r}"},
                   HTTPStatus.MISDIRECTED_REQUEST)
        return True

    def _note_activity(self, path: str) -> None:
        """Count this request as somebody actively using the setup page.

        It is what stops the unattended retry in `network.py` from taking the
        hotspot down mid-password.

        The captive probes are deliberately excluded. A phone that stays joined
        to the setup network re-fetches one every half minute for as long as it
        is connected, so counting those would mean a device whose hotspot
        somebody once joined and then forgot about never tries the house network
        again — which is the exact stranding this all exists to fix.
        """
        if path in CAPTIVE_PROBES:
            return
        self.router.network.note_portal_activity()

    def _body(self) -> dict:
        """Parse a request body as JSON, or as a form. {} if there is neither."""
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return {}
        if length <= 0:
            return {}

        raw = self.rfile.read(length).decode("utf-8", errors="replace")
        content_type = (self.headers.get("Content-Type") or "").split(";")[0].strip()
        if content_type == "application/x-www-form-urlencoded":
            return {k: v[0] for k, v in parse_qs(raw).items()}
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}

    # ── methods ─────────────────────────────────────────────────────────────

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._json({"ok": True})

    def do_HEAD(self) -> None:  # noqa: N802
        self.do_GET()

    def do_GET(self) -> None:  # noqa: N802
        url = urlparse(self.path)
        query = {k: v[0] for k, v in parse_qs(url.query).items()}
        path = url.path.rstrip("/") or "/"
        try:
            self._note_activity(path)
            if path in MUTATING_GETS and self._misdirected(path):
                return
            self._route_get(path, query, url.query)
        except Exception:  # noqa: BLE001
            log.exception("GET %s failed", self.path)
            self._json({"ok": False, "error": "internal error"},
                       HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_POST(self) -> None:  # noqa: N802
        url = urlparse(self.path)
        path = url.path.rstrip("/") or "/"
        try:
            self._note_activity(path)
            if self._too_large():
                return
            if self._misdirected(path):
                return
            self._route_post(path, self._body())
        except Exception:  # noqa: BLE001
            log.exception("POST %s failed", self.path)
            self._json({"ok": False, "error": "internal error"},
                       HTTPStatus.INTERNAL_SERVER_ERROR)

    # ── GET ─────────────────────────────────────────────────────────────────

    def _route_get(self, path: str, query: dict, raw_query: str) -> None:
        router = self.router
        device = router.dispenser

        # Captive portal probes first: on the setup network these arrive before
        # anything else and must not fall through to a 404, which some phones
        # read as "this network works" and never show the portal for.
        if path in CAPTIVE_PROBES:
            host = _host_name(self.headers.get("Host"))
            # A probe is fetched under the *probe's* hostname —
            # `connectivitycheck.gstatic.com` — and a relative redirect leaves the
            # portal sheet sitting on that origin. Every POST the page then makes
            # arrives under a name `_is_ours` refuses, so the Join button would
            # simply stop working in the one flow that matters most. Sending it to
            # the device's own address pins the portal to an origin that works.
            self._redirect("/setup" if _is_ours(host)
                           else provisioning.setup_url() + "setup")
            return

        if path == "/":
            state = wifi.status()
            # A device that is not on a network yet has exactly one useful
            # page. Sending the tray console instead would be technically
            # correct and useless: whoever is looking at it joined the setup
            # hotspot to set up WiFi.
            if state.mode in ("hotspot", "disconnected"):
                self._route_get("/setup", query, raw_query)
                return
            self._html(router.page("app.html", device_url=provisioning.device_url()))
            return

        if path == "/style.css":
            # The only sub-resource any page loads. Served from disk rather
            # than inlined into four templates so that changing a colour is one
            # edit — and it is a same-host request, which a captive portal
            # browser allows even when it blocks everything else.
            self._send(HTTPStatus.OK, (WEB_DIR / "style.css").read_bytes(),
                       "text/css; charset=utf-8")
            return

        if path == "/setup":
            state = wifi.status()
            cloud = router.cloud_status()
            self._html(router.page(
                "setup.html",
                ssid=_escape(router.identity.ssid),
                identity_source=_escape(router.identity.source),
                mode=_escape(state.mode),
                current=_escape(state.ssid or ""),
                device_url=provisioning.device_url(),
                setup_url=provisioning.setup_url(),
                # Both addresses, because the page has to probe both to find
                # out how the join went — see the comment on `readAttempt`.
                ap_address=config.AP_ADDRESS,
                claim=_escape(router.identity.claim),
                cloud_state=_escape(cloud.get("state", "off")),
                relay_url=_escape(cloud.get("relayUrl", "")),
            ))
            return

        if path == "/label":
            cloud = router.cloud_status()
            relay = cloud.get("relayUrl", "")
            pair_payload = provisioning.pair_qr_payload(router.identity.claim, relay)
            self._html(router.page(
                "label.html",
                ssid=_escape(router.identity.ssid),
                passphrase=_escape(router.identity.passphrase),
                identity_source=_escape(router.identity.source),
                setup_url=provisioning.setup_url(),
                device_url=provisioning.device_url(),
                wifi_qr=_svg(router.identity.wifi_qr),
                setup_qr=_svg(provisioning.setup_url()),
                device_qr=_svg(provisioning.device_url()),
                claim=_escape(router.identity.claim),
                pair_qr=_svg(pair_payload) if pair_payload else "",
                # The one part of the label that is not permanent: it names the
                # relay, and a relay can move. Said on the page rather than
                # left for somebody to discover from a code that stopped
                # working — the code itself is still printed as text below it.
                pair_note=(
                    f"Scanning it opens <code>{_escape(relay)}</code>."
                    if relay else
                    "No relay is configured on this device yet, so this code carries "
                    "the pairing code alone rather than a web address. Set a relay "
                    "and reprint if you want a code a phone camera can open."),
            ))
            return

        if path == "/qr/wifi.svg":
            self._svg_response(router.identity.wifi_qr)
            return
        if path == "/qr/setup.svg":
            self._svg_response(provisioning.setup_url())
            return
        if path == "/qr/device.svg":
            self._svg_response(provisioning.device_url())
            return

        # ── native API ──────────────────────────────────────────────────────

        if path == "/api/status":
            state = wifi.status()
            self._json({
                "ok": True,
                "device": device.status(),
                # What is actually fitted, and which drivers came up. The
                # dispenser cannot answer this on its own — the buzzer belongs
                # to the indicator — so before this key existed a device with no
                # chirp reported nothing wrong anywhere.
                "gpio": router.gpio_status(),
                "wifi": state.to_json(),
                "attempt": router.network.snapshot(),
                "cloud": router.cloud_status(),
                "identity": {"ssid": router.identity.ssid, "source": router.identity.source},
                "urls": {"device": provisioning.device_url(),
                         "setup": provisioning.setup_url()},
            })
            return

        if path == "/api/cloud":
            self._json({"ok": True, "cloud": router.cloud_status()})
            return

        if path == "/api/schedule":
            status = device.status()
            self._json({
                "ok": True,
                "payload": status["payload"],
                "slots": status["slots"],
                "notes": status["notes"],
                "source": status["scheduleSource"],
            })
            return

        if path == "/api/events":
            self._json({"ok": True, "events": device.events(_limit(query, 50))})
            return

        if path == "/api/identity":
            # The one endpoint that hands out a credential, and therefore the
            # one that does NOT carry `Access-Control-Allow-Origin: *`.
            #
            # `claim` is the pairing code; the device id, the relay access token
            # and the box key all derive from it, permanently. Reads are not
            # Host-checked — `_misdirected` covers only `MUTATING_GETS`, because
            # the captive probes arrive under names like
            # `connectivitycheck.gstatic.com` and a name check on a GET would
            # break the one flow that has to work. So with a wildcard CORS
            # header, any `http://` page a phone on the same WiFi happened to
            # load could read this and pair itself to the dispenser forever.
            #
            # Without the header a browser still *sends* the request and the
            # device still answers; the browser simply refuses to hand the body
            # to a cross-origin script. Same-origin readers — the device's own
            # pages, curl, the app once it is talking to the device directly —
            # are unaffected.
            cloud = router.cloud_status()
            self._json_private({
                "ok": True,
                "ssid": router.identity.ssid,
                "source": router.identity.source,
                "wifiQr": router.identity.wifi_qr,
                "setupUrl": provisioning.setup_url(),
                "deviceUrl": provisioning.device_url(),
                # The pairing code, so an app already on the home WiFi can pair
                # without anybody reading a sticker. It is a credential, and it
                # is served here without authentication — which is the same
                # decision this firmware already makes about the WiFi
                # passphrase on /label, and is recorded in NOTES-FOR-WEBAPP.md
                # rather than being quietly different for this one value.
                "claim": router.identity.claim,
                "deviceId": router.identity.device_id if router.identity.claim else "",
                "pairQr": provisioning.pair_qr_payload(
                    router.identity.claim, cloud.get("relayUrl", "")),
            })
            return

        if path == "/api/wifi/status":
            self._json({"ok": True, "wifi": wifi.status().to_json()})
            return

        if path == "/api/wifi/attempt":
            # How the setup page follows a join it can no longer get an answer
            # to any other way: the request that started it was answered while
            # the radio was still an access point, and everything after that is
            # watched from here. Reachable over both addresses — the hotspot's
            # and the one the device gets on the house network — because which
            # of the two the phone can see *is* the outcome.
            self._json({"ok": True,
                        "attempt": router.network.snapshot(),
                        "wifi": wifi.status().to_json(),
                        "deviceUrl": provisioning.device_url()})
            return

        if path == "/api/wifi/scan":
            self._json({"ok": True, "networks": [n.to_json() for n in wifi.scan()]})
            return

        # ── Shaztech-compatible API (see the module docstring) ──────────────

        if path == "/save":
            self._compat_save(query)
            return

        if path == "/schedule":
            self._link_schedule(query)
            return

        if path == "/release":
            self._compat_release(query)
            return

        if path == "/dropout":
            self._compat_dropout(query)
            return

        if path == "/dismiss":
            had_alert = device.dismiss()
            self._confirmation(
                "Chime silenced" if had_alert else "Nothing was alerting",
                "The dose is still waiting and can still be released — the "
                "device is just quiet about it."
                if had_alert else "The device is quiet.")
            return

        self._json({"ok": False, "error": "no such endpoint"}, HTTPStatus.NOT_FOUND)

    # ── POST ────────────────────────────────────────────────────────────────

    def _route_post(self, path: str, body: dict) -> None:
        device = self.router.dispenser

        if path == "/api/schedule":
            payload = str(body.get("payload", "")).strip()
            if payload:
                ok, message = device.apply_payload(payload, source="api")
                self._json({"ok": ok, "message": message},
                           HTTPStatus.OK if ok else HTTPStatus.BAD_REQUEST)
                return

            slots = sc1.slots_from_json(body.get("slots"))
            if slots is None:
                self._json({"ok": False, "error": "send either a payload or a slots array"},
                           HTTPStatus.BAD_REQUEST)
                return
            try:
                device.set_schedule(slots, source="api")
            except ValueError as exc:
                self._json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)
                return
            self._json({"ok": True, "payload": sc1.encode_weekly(slots)})
            return

        if path == "/api/clock":
            payload = str(body.get("payload", "")).strip()
            if not payload and body.get("iso"):
                # The browser knows the time and the device may not. This is
                # the path the test page uses, and it is why a dispenser with
                # no internet can still be given a trustworthy clock.
                from datetime import datetime
                try:
                    payload = sc1.encode_clock(datetime.fromisoformat(str(body["iso"])))
                except ValueError:
                    self._json({"ok": False, "error": "unparseable time"},
                               HTTPStatus.BAD_REQUEST)
                    return
            ok, message = device.apply_payload(payload, source="api")
            self._json({"ok": ok, "message": message},
                       HTTPStatus.OK if ok else HTTPStatus.BAD_REQUEST)
            return

        if path == "/api/drop":
            try:
                tray = int(body.get("tray", 0))
            except (TypeError, ValueError):
                self._json({"ok": False, "error": "tray must be a number"},
                           HTTPStatus.BAD_REQUEST)
                return
            try:
                record = device.drop_now(tray)
            except KeyError as exc:
                self._json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)
                return
            self._json({"ok": True, "event": record})
            return

        if path == "/api/release":
            # The tap. This is the endpoint the app's main-screen button and its
            # push notification both hit when the phone is on the house WiFi,
            # and it is the same `Dispenser.release` the relay's command channel
            # reaches when it is not.
            #
            # An empty body releases everything currently due, which is what the
            # main-screen button sends: two trays owed at 08:00 are two
            # medications for 08:00, and making somebody tap twice is how the
            # second gets forgotten. `tray` and `minutes` narrow it to one dose,
            # which is what a notification about a specific dose sends.
            try:
                tray = int(body["tray"]) if body.get("tray") is not None else None
                minutes = (sc1.parse_hhmm(str(body["at"])) if body.get("at")
                           else int(body["minutes"]) if body.get("minutes") is not None
                           else None)
            except (TypeError, ValueError):
                self._json({"ok": False, "error": "tray must be a number and at must be HHMM"},
                           HTTPStatus.BAD_REQUEST)
                return
            if minutes is None and body.get("at"):
                self._json({"ok": False, "error": "at must be HHMM"},
                           HTTPStatus.BAD_REQUEST)
                return

            try:
                records = device.release(tray=tray, minutes=minutes)
            except RuntimeError as exc:
                # No GPIO library. Said plainly rather than answered with an
                # empty list, because this is somebody standing in front of the
                # machine having just asked for their medication.
                self._json({"ok": False, "error": str(exc)},
                           HTTPStatus.SERVICE_UNAVAILABLE)
                return

            # `released: []` is not an error. A notification tapped an hour late
            # and a curious tap at lunchtime both land here, and neither is
            # worth a red screen — but the app needs to be able to tell them
            # from a successful release, which is what the list is for.
            self._json({"ok": True, "released": records,
                        "awaitingRelease": [d.to_json() for d in device.awaiting_release]})
            return

        if path == "/api/dismiss":
            # Quiet, not cancelled. The dose stays owed and stays releasable for
            # the rest of its window — see `Dispenser.dismiss`.
            self._json({"ok": True, "hadAlert": device.dismiss(),
                        "awaitingRelease": [d.to_json() for d in device.awaiting_release]})
            return

        if path == "/api/wifi/connect":
            ssid = str(body.get("ssid", "")).strip()
            if not ssid:
                self._json({"ok": False, "error": "no network chosen"},
                           HTTPStatus.BAD_REQUEST)
                return
            password = str(body.get("password", ""))
            # Set by the "my network is not listed" path. A hidden SSID does not
            # appear in a scan, and without this nmcli reports that no such
            # network exists — which is true of the scan and not of the house.
            hidden = _truthy(body.get("hidden"))

            # Answered *now*, while the radio is still the access point this
            # request arrived over. Joining the house network takes the hotspot
            # down and with it the socket this reply would have travelled on, so
            # the work happens on a worker thread and the outcome is read back
            # from /api/wifi/attempt. Before this, a mistyped password was
            # indistinguishable from a successful setup.
            accepted, message = self.router.network.begin_join(
                ssid, password or None, hidden=hidden)
            self._json({"ok": accepted, "message": message,
                        "attempt": self.router.network.snapshot(),
                        "deviceUrl": provisioning.device_url(),
                        "setupUrl": provisioning.setup_url()},
                       HTTPStatus.ACCEPTED if accepted else HTTPStatus.CONFLICT)
            return

        if path == "/api/wifi/hotspot":
            # The way back in when the network the device is on is one nobody
            # controls any more — a changed password, a moved house.
            ok, message = self.router.network.raise_hotspot()
            self._json({"ok": ok, "message": message,
                        "ssid": self.router.identity.ssid,
                        "setupUrl": provisioning.setup_url()},
                       HTTPStatus.OK if ok else HTTPStatus.CONFLICT)
            return

        if path == "/api/cloud":
            if self.router.cloud is None:
                self._json({"ok": False,
                            "error": "this firmware was started without a cloud link"},
                           HTTPStatus.CONFLICT)
                return

            relay_url = body.get("relayUrl")
            if relay_url is not None:
                relay_url = str(relay_url).strip()
                # An empty string is how the page says "forget the relay", and
                # it has to stay distinguishable from the key being absent —
                # which means "change only what I sent".
                if relay_url and not relay_url.startswith(("http://", "https://")):
                    self._json({"ok": False,
                                "error": "the relay URL must start with http:// or https://"},
                               HTTPStatus.BAD_REQUEST)
                    return

            enabled = body.get("enabled")
            status = self.router.cloud.reconfigure(
                relay_url=relay_url,
                enabled=None if enabled is None else bool(enabled))
            self._json({"ok": True, "cloud": status})
            return

        self._json({"ok": False, "error": "no such endpoint"}, HTTPStatus.NOT_FOUND)

    # ── the compatibility layer ─────────────────────────────────────────────

    def _compat_save(self, query: dict) -> None:
        """`/save?trayNames1=..&time1=08:00&color1=2&trayAlertEna1=on&trayinst=2`

        The parameter names come from the Shaztech firmware's `Web_Stuff.ino`
        and are reproduced exactly, because `lib/hardware/dispenser.ts` builds
        them and that file is not ours to change.

        What this shape cannot say is which days of the week, or for how long.
        Every tray it defines therefore becomes an every-day, ongoing course.
        That is a real loss of information, so the page it returns says so
        rather than showing a tick and letting a Mon/Wed/Fri prescription
        quietly dispense seven days a week.
        """
        device = self.router.dispenser
        slots = []
        names = []

        for tray in range(1, sc1.MAX_SLOTS + 1):
            time_text = (query.get(f"time{tray}") or "").strip()
            if not time_text:
                continue
            # `trayAlertEnaN` is present when the tray is enabled and absent
            # when it is not — an HTML checkbox, faithfully.
            if f"trayAlertEna{tray}" not in query:
                continue

            minutes = sc1.parse_hhmm(re.sub(r"\D", "", time_text))
            if minutes is None:
                self._confirmation(
                    "Not saved",
                    f"Tray {tray} was given a time of '{time_text}', which is not a "
                    f"time of day. Nothing was changed.",
                    ok=False)
                return

            slots.append(sc1.SlotSchedule(slot=tray, times=[minutes],
                                          days=sc1.EVERY_DAY, duration_days=0))
            names.append(f"tray {tray}: {sc1.format_hhmm(minutes)[:2]}:"
                         f"{sc1.format_hhmm(minutes)[2:]} "
                         f"{(query.get(f'trayNames{tray}') or '').strip()}".strip())

        if not slots:
            self._confirmation(
                "Not saved",
                "That link named no trays with both a time and an enabled alert, "
                "so nothing was changed.",
                ok=False)
            return

        try:
            device.set_schedule(slots, source="app-compat")
        except ValueError as exc:
            self._confirmation("Not saved", str(exc), ok=False)
            return

        self._confirmation(
            "Schedule saved",
            "<ul><li>" + "</li><li>".join(_escape(n) for n in names) + "</li></ul>"
            "<p class=\"warn\">This link format carries no days of the week and no "
            "course length, so every tray above will drop <strong>every day, "
            "indefinitely</strong>. To send a Mon/Wed/Fri or a 30-day course, "
            "post an <code>SC1*W*</code> payload to <code>/api/schedule</code>.</p>",
            raw=True)

    def _link_schedule(self, query: dict) -> None:
        """`/schedule?payload=SC1*W*1:0800.2000-127-030` as a link.

        The lossless twin of `/save`, and the reason the paper form sheet can
        reach a device from a page served over HTTPS at all. `POST
        /api/schedule` takes the same payload and is what anything able to make
        a cross-origin request should use; this exists solely because a
        top-level navigation is the one thing mixed-content blocking allows.

        Nothing is different about what is accepted — it is the same
        `apply_payload` the POST and the relay both go through, so a payload
        that works here works everywhere and a bad one is refused identically.
        """
        payload = (query.get("payload") or "").strip()
        if not payload:
            self._confirmation("Nothing saved", "That link carried no schedule.",
                               ok=False)
            return

        ok, message = self.router.dispenser.apply_payload(payload, source="app-link")
        if not ok:
            self._confirmation("Not saved", message, ok=False)
            return

        # Read back out of the device rather than out of the payload, so the
        # page describes what was actually stored. A day mask is printed as day
        # names: `21` is not something anybody can check against a prescription.
        status = self.router.dispenser.status()
        lines = [
            f"tray {s['tray']}: "
            + ", ".join(f"{time[:2]}:{time[2:]}" for time in s["times"])
            + f" · {_days_text(int(s.get('days', sc1.EVERY_DAY)))}"
            + (f" · for {s['durationDays']} days" if s.get("durationDays")
               else " · ongoing")
            for s in status["slots"]
        ]
        self._confirmation(
            message,
            "<ul><li>" + "</li><li>".join(_escape(line) for line in lines) + "</li></ul>",
            raw=True)

    def _compat_release(self, query: dict) -> None:
        """`/release` as a link, for an app served over HTTPS.

        The same mixed-content problem as `/dropout`, and it matters more here:
        a page on `https://` cannot `fetch()` this device over plain HTTP, so
        the app's release button on the main screen is a *link* the person taps
        and this is the page they land on. `POST /api/release` is the same
        action for anything that can reach the device directly — the phone app,
        the relay, curl.

        `?tray=` and `?at=` narrow it to one dose. With neither, everything due
        is released, which is what the main-screen button means.
        """
        device = self.router.dispenser
        tray = minutes = None
        if query.get("tray"):
            try:
                tray = int(query["tray"])
            except ValueError:
                self._confirmation("Nothing released", "That link did not name a tray.",
                                   ok=False)
                return
        if query.get("at"):
            minutes = sc1.parse_hhmm(str(query["at"]))
            if minutes is None:
                self._confirmation("Nothing released",
                                   "That link did not carry a readable time.", ok=False)
                return

        try:
            records = device.release(tray=tray, minutes=minutes)
        except RuntimeError as exc:
            self._confirmation("Nothing released", str(exc), ok=False)
            return

        if not records:
            # Not an error page. The overwhelmingly common way to get here is a
            # notification tapped after the window closed, and telling somebody
            # their dispenser is broken when it is behaving correctly is how
            # they stop trusting the one screen that matters.
            self._confirmation(
                "Nothing was waiting",
                "No dose is due right now, so nothing was released. If you were "
                "expecting one, its window may have closed — check the log.")
            return

        trays = ", ".join(str(r["tray"]) for r in records)
        self._confirmation(f"Released tray {trays}", "Check the cup.")

    def _compat_dropout(self, query: dict) -> None:
        try:
            tray = int(query.get("tray", ""))
        except ValueError:
            self._confirmation("Nothing dropped", "That link did not name a tray.", ok=False)
            return
        try:
            self.router.dispenser.drop_now(tray)
        except KeyError as exc:
            self._confirmation("Nothing dropped", str(exc), ok=False)
            return
        self._confirmation(f"Tray {tray} dropped", "Check the cup.")

    def _confirmation(self, heading: str, message: str, ok: bool = True,
                      raw: bool = False) -> None:
        """The page a person lands on after tapping a link from the app.

        They arrived by top-level navigation from another site, so this has to
        be a complete, readable page that says what happened — not a JSON blob,
        which is what they would otherwise be staring at.
        """
        self._html(self.router.page(
            "confirm.html",
            heading=_escape(heading),
            message=message if raw else f"<p>{_escape(message)}</p>",
            state="ok" if ok else "bad",
            device_url=provisioning.device_url(),
        ), HTTPStatus.OK if ok else HTTPStatus.BAD_REQUEST)

    # ── helpers ─────────────────────────────────────────────────────────────

    def _svg_response(self, text: str) -> None:
        try:
            body = qr.to_svg(text).encode()
        except qr.QREncoderUnavailable as exc:
            self._json({"ok": False, "error": str(exc), "text": text},
                       HTTPStatus.SERVICE_UNAVAILABLE)
            return
        self._send(HTTPStatus.OK, body, "image/svg+xml; charset=utf-8")


#: Monday first, matching `datetime.weekday()` and the day mask on the wire.
_DAY_NAMES = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def _days_text(mask: int) -> str:
    """A day mask as something somebody can check against a prescription."""
    if mask == sc1.EVERY_DAY:
        return "every day"
    days = [name for index, name in enumerate(_DAY_NAMES) if mask & (1 << index)]
    return ", ".join(days) if days else "no days"


def _svg(text: str) -> str:
    """Inline a QR, or a readable apology if no encoder is installed."""
    try:
        return qr.to_svg(text)
    except qr.QREncoderUnavailable:
        return (f'<p class="warn">No QR encoder installed '
                f'(<code>pip install segno</code>). The value is: '
                f'<code>{_escape(text)}</code></p>')


def _escape(text: str) -> str:
    return (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;").replace("'", "&#39;"))


def _limit(query: dict, default: int) -> int:
    try:
        return max(1, min(500, int(query.get("limit", default))))
    except (TypeError, ValueError):
        return default


def _truthy(value) -> bool:
    """A checkbox, whether it arrived as JSON or as a form field.

    `"false"` and `"0"` are strings, and a string is true. A form-encoded body
    can only send strings, so without this a hidden-network checkbox is on the
    moment the field exists.
    """
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return bool(value)


# ── which names this device answers to ──────────────────────────────────────

def _host_name(header: str | None) -> str:
    """The host out of a Host header: lowercased, no port, no brackets."""
    host = (header or "").strip().lower()
    if host.startswith("["):                      # [::1]:80
        return host.partition("]")[0][1:]
    # Only strip a port when there is exactly one colon; a bare IPv6 literal has
    # several and none of them is a port.
    return host.rpartition(":")[0] if host.count(":") == 1 else host


def _is_ours(host: str) -> bool:
    """Is this a name the dispenser is actually reached by?

    Allowed:

    * any bare IP address — DNS rebinding needs a *name*, so there is nothing to
      rebind here, and the setup hotspot is reached at 10.42.0.1 by number;
    * `localhost`;
    * `pilldispenser` and `pilldispenser.local`, which is what the web app uses;
    * two-label names starting with the device hostname, so that a router which
      publishes its DHCP clients under a local domain — `pilldispenser.lan`,
      `pilldispenser.home` — keeps working. Two labels is the limit because
      `pilldispenser.evil.com` has three, and getting under that bar would mean
      the attacker owning a top-level domain;
    * anything in `SNAPCARE_EXTRA_HOSTS`, for the routers that use a longer
      domain of their own.

    An absent Host is allowed. HTTP/1.1 requires one and every browser sends
    one, so a request without it is a hand-written client or a probe — and a
    request with no name in it is not the request this check is about.
    """
    if not host:
        return True
    hostname = config.MDNS_HOSTNAME.lower()
    if host in ("localhost", hostname, f"{hostname}.local"):
        return True
    if host in config.EXTRA_HTTP_HOSTS:
        return True
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        pass
    labels = host.split(".")
    return len(labels) == 2 and labels[0] == hostname


def make_server(dispenser: Dispenser, port: int | None = None,
                identity: provisioning.Identity | None = None,
                cloud=None, network: Supervisor | None = None,
                button=None) -> ThreadingHTTPServer:
    router = Router(dispenser, identity, cloud, network, button)

    handler = type("BoundHandler", (Handler,), {"router": router})
    # 0.0.0.0 because the device is reached from the home network and from the
    # setup hotspot, which are different interfaces and, during setup, the only
    # one that exists is the one that does not exist yet.
    server = ThreadingHTTPServer(("0.0.0.0", port if port is not None else config.HTTP_PORT),
                                 handler)
    server.daemon_threads = True
    return server


def serve_forever(dispenser: Dispenser, port: int | None = None,
                   identity: provisioning.Identity | None = None,
                   cloud=None, network: Supervisor | None = None,
                   button=None) -> ThreadingHTTPServer:
    """Start the server on a background thread and return it."""
    server = make_server(dispenser, port, identity, cloud, network, button)
    thread = threading.Thread(target=server.serve_forever, name="http", daemon=True)
    thread.start()
    log.info("web server listening on port %d", server.server_address[1])
    return server

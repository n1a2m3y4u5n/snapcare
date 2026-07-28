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

**`/save`, `/dropout`, `/dismiss`** are the Shaztech/Pilldispenser shapes that
`lib/hardware/dispenser.ts` in the web app already builds URLs for. They are
GET requests returning an HTML page because that is how that file uses them: an
HTTPS page cannot `fetch()` an HTTP device (mixed content), but it *can* link
to one, so the app builds a link the person taps and the device answers with a
confirmation page. Keeping these means the existing app works against this
firmware with no changes to code that is not ours to edit.

The compatibility layer is lossy — it has no field for days of the week — so it
records what it dropped and the response page says so.

Captive portal
--------------
When the setup hotspot is up, the probe URLs every mobile OS fetches to test
for internet are answered with a redirect. That is what makes the setup page
appear by itself instead of the person having to know an address.
"""
from __future__ import annotations

import json
import logging
import re
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from . import config, provisioning, qr, sc1, wifi
from .device import Dispenser

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


class Router:
    """Everything the handler needs, so the handler stays a thin adapter."""

    def __init__(self, dispenser: Dispenser, identity: provisioning.Identity | None = None):
        self.dispenser = dispenser
        self.identity = identity or provisioning.load_identity(dispenser.store)
        self._pages: dict[str, str] = {}

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

    def _json(self, payload, status: int = HTTPStatus.OK) -> None:
        self._send(status, json.dumps(payload).encode(), "application/json; charset=utf-8", {
            # So the web app can be developed against a real device from
            # http://localhost:3000. It changes nothing about who can reach the
            # device — anything on the LAN already could — but it does let a
            # browser page read the answer. See the note in NOTES-FOR-WEBAPP.md.
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        })

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
        try:
            self._route_get(url.path.rstrip("/") or "/", query, url.query)
        except Exception:  # noqa: BLE001
            log.exception("GET %s failed", self.path)
            self._json({"ok": False, "error": "internal error"},
                       HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_POST(self) -> None:  # noqa: N802
        url = urlparse(self.path)
        try:
            if self._too_large():
                return
            self._route_post(url.path.rstrip("/") or "/", self._body())
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
            self._redirect("/setup")
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
            self._html(router.page(
                "setup.html",
                ssid=_escape(router.identity.ssid),
                identity_source=_escape(router.identity.source),
                mode=_escape(state.mode),
                current=_escape(state.ssid or ""),
                device_url=provisioning.device_url(),
                setup_url=provisioning.setup_url(),
            ))
            return

        if path == "/label":
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
                "wifi": state.to_json(),
                "identity": {"ssid": router.identity.ssid, "source": router.identity.source},
                "urls": {"device": provisioning.device_url(),
                         "setup": provisioning.setup_url()},
            })
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
            self._json({
                "ok": True,
                "ssid": router.identity.ssid,
                "source": router.identity.source,
                "wifiQr": router.identity.wifi_qr,
                "setupUrl": provisioning.setup_url(),
                "deviceUrl": provisioning.device_url(),
            })
            return

        if path == "/api/wifi/status":
            self._json({"ok": True, "wifi": wifi.status().to_json()})
            return

        if path == "/api/wifi/scan":
            self._json({"ok": True, "networks": [n.to_json() for n in wifi.scan()]})
            return

        # ── Shaztech-compatible API (see the module docstring) ──────────────

        if path == "/save":
            self._compat_save(query)
            return

        if path == "/dropout":
            self._compat_dropout(query)
            return

        if path == "/dismiss":
            had_alert = device.dismiss()
            self._confirmation("Alarm dismissed" if had_alert else "Nothing was alerting",
                               "The device is quiet.")
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

        if path == "/api/confirm":
            record = device.confirm_taken()
            self._json({"ok": record is not None, "event": record})
            return

        if path == "/api/dismiss":
            self._json({"ok": True, "hadAlert": device.dismiss()})
            return

        if path == "/api/wifi/connect":
            ssid = str(body.get("ssid", "")).strip()
            if not ssid:
                self._json({"ok": False, "error": "no network chosen"},
                           HTTPStatus.BAD_REQUEST)
                return
            password = str(body.get("password", ""))

            # This request usually dies before its answer arrives, and that is
            # success, not failure: joining the home network tears down the
            # hotspot the phone is talking over. The reply is attempted anyway
            # because it does get through when the join *fails* — which is the
            # case where the person needs to be told something. `setup.html`
            # treats a dropped connection as the good outcome.
            ok, message = wifi.connect(ssid, password or None)
            self._json({"ok": ok, "message": message,
                        "deviceUrl": provisioning.device_url()},
                       HTTPStatus.OK if ok else HTTPStatus.BAD_REQUEST)
            return

        if path == "/api/wifi/hotspot":
            ok, message = wifi.start_hotspot(self.router.identity)
            self._json({"ok": ok, "message": message})
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


def make_server(dispenser: Dispenser, port: int | None = None,
                identity: provisioning.Identity | None = None) -> ThreadingHTTPServer:
    router = Router(dispenser, identity)

    handler = type("BoundHandler", (Handler,), {"router": router})
    # 0.0.0.0 because the device is reached from the home network and from the
    # setup hotspot, which are different interfaces and, during setup, the only
    # one that exists is the one that does not exist yet.
    server = ThreadingHTTPServer(("0.0.0.0", port if port is not None else config.HTTP_PORT),
                                 handler)
    server.daemon_threads = True
    return server


def serve_forever(dispenser: Dispenser, port: int | None = None,
                  identity: provisioning.Identity | None = None) -> ThreadingHTTPServer:
    """Start the server on a background thread and return it."""
    server = make_server(dispenser, port, identity)
    thread = threading.Thread(target=server.serve_forever, name="http", daemon=True)
    thread.start()
    log.info("web server listening on port %d", server.server_address[1])
    return server

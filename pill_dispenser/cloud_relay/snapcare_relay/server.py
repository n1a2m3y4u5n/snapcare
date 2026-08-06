"""The relay's HTTP surface. A handful of endpoints and two pages.

Standard library only, like the firmware, and for a related reason: this is a
service that has to be deployable by whoever inherits the project, from a
container that builds in one line and has nothing in it to keep up to date.

What the relay is
-----------------
A mailbox with a long poll. It stores one envelope per slot per device and
hands it back to whoever presents the right token. It cannot read any of them —
see `mailbox.py` and `snapcare_dispenser/envelope.py`.

Three slots: `desired`, `reported` and `command`. Nothing here treats them
differently — the same read, the same write, the same revision rule — which is
the point. `mailbox.py` explains why they are separate, and it is a distinction
the *ends* need to make, not this one.

That is a deliberately small job. Everything that could be done here and is
done at the ends instead — parsing SC1, deciding whether a schedule is valid,
knowing which tray exists — is a thing the relay would have to be trusted with,
and the whole design is about not having to trust it with a prescription.

Authentication
--------------
`Authorization: Bearer <access token>`, where the token is HKDF of the claim
code printed on the device. First use of a device id binds the token's digest;
after that it must match. There is no account, no password and no registration
screen, because there is nothing for one to check that holding the sticker does
not already establish.

Why long poll and not WebSockets or SSE
---------------------------------------
The device is behind a home router, so the connection has to be outbound; that
rules nothing out on its own. What decides it is the failure mode. A long poll
is an ordinary request that either returns a body or returns 204, so every
proxy, load balancer and captive network between the dispenser and here already
knows what to do with it, and a connection cut at any point is one lost request
that the next one supersedes. The device's reconnect logic is then the same
code as its retry logic, which is the part that has to work unattended for
months in a house nobody will debug it from.
"""
from __future__ import annotations

import json
import logging
import re
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import config
from .mailbox import SLOTS, Device, MailboxError, Mailboxes

log = logging.getLogger("relay")

WEB_DIR = Path(__file__).parent / "web"

_DEVICE_PATH = re.compile(
    r"^/v1/devices/([A-Za-z0-9_-]{1,64})(?:/(desired|reported|command))?$")


class Handler(BaseHTTPRequestHandler):
    mailboxes: Mailboxes  # set by make_server

    server_version = "SnapCareRelay/1.0"
    protocol_version = "HTTP/1.1"

    # ── plumbing ────────────────────────────────────────────────────────────

    def log_message(self, fmt: str, *args) -> None:
        # The default writes to stderr unconditionally. Routing it through
        # logging means one place decides the level, and — more to the point —
        # the request line contains a device id, which belongs at debug rather
        # than in the output of a production container by default.
        log.debug("%s %s", self.address_string(), fmt % args)

    def _send(self, status: int, body: bytes, content_type: str,
              headers: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, payload, status: int = HTTPStatus.OK) -> None:
        self._send(status, json.dumps(payload).encode(),
                   "application/json; charset=utf-8", _CORS)

    def _error(self, status: int, message: str) -> None:
        self._json({"ok": False, "error": message}, status)

    def _token(self) -> str:
        raw = self.headers.get("Authorization") or ""
        scheme, _, value = raw.partition(" ")
        return value.strip() if scheme.lower() == "bearer" else ""

    def _body(self) -> dict | None:
        """The request body as a JSON object, or None if it is not one."""
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return None
        if length <= 0:
            return None
        if length > config.MAX_BODY:
            # Left unread, so the connection has to go: this is HTTP/1.1 with
            # keep-alive and an unread body is parsed as the next request.
            self.close_connection = True
            raise MailboxError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "body too large")
        try:
            parsed = json.loads(self.rfile.read(length).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None
        return parsed if isinstance(parsed, dict) else None

    # ── methods ─────────────────────────────────────────────────────────────

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send(HTTPStatus.NO_CONTENT, b"", "text/plain", _CORS)

    def do_HEAD(self) -> None:  # noqa: N802
        self.do_GET()

    def do_GET(self) -> None:  # noqa: N802
        self._dispatch("GET")

    def do_PUT(self) -> None:  # noqa: N802
        self._dispatch("PUT")

    def do_DELETE(self) -> None:  # noqa: N802
        self._dispatch("DELETE")

    def _dispatch(self, method: str) -> None:
        try:
            self._route(method)
        except MailboxError as exc:
            self._error(exc.status, exc.message)
        except (BrokenPipeError, ConnectionResetError):
            # A long poll whose client walked away. Entirely normal — a phone
            # locking its screen does this — and not worth a stack trace.
            log.debug("client disconnected during %s %s", method, self.path)
        except Exception:  # noqa: BLE001
            log.exception("%s %s failed", method, self.path)
            self._error(HTTPStatus.INTERNAL_SERVER_ERROR, "internal error")

    # ── routing ─────────────────────────────────────────────────────────────

    def _route(self, method: str) -> None:
        path, _, raw_query = self.path.partition("?")
        path = path.rstrip("/") or "/"
        query = _parse_query(raw_query)

        if method == "GET" and path in ("/healthz", "/v1/health"):
            self._json({
                "ok": True,
                "service": "snapcare-relay",
                "devices": self.mailboxes.count(),
                "heldPolls": self.mailboxes.held_polls(),
            })
            return

        match = _DEVICE_PATH.match(path)
        if match:
            self._device(method, match.group(1), match.group(2), query)
            return

        if method == "GET":
            self._page(path)
            return

        self._error(HTTPStatus.NOT_FOUND, "no such endpoint")

    def _device(self, method: str, device_id: str, slot: str | None, query: dict) -> None:
        # Only a write may bring a mailbox into existence. See `Mailboxes.open`.
        device = self.mailboxes.open(device_id, self._token(), create=(method == "PUT"))

        if slot is None:
            if method == "GET":
                self._json({"ok": True, **device.meta()})
                return
            if method == "DELETE":
                self.mailboxes.forget(device)
                self._json({"ok": True, "forgotten": True})
                return
            self._error(HTTPStatus.METHOD_NOT_ALLOWED, "GET or DELETE here")
            return

        if method == "GET":
            self._read_slot(device, slot, query)
            return
        if method == "PUT":
            self._write_slot(device, slot)
            return
        self._error(HTTPStatus.METHOD_NOT_ALLOWED, "GET or PUT here")

    def _read_slot(self, device: Device, slot_name: str, query: dict) -> None:
        since = _positive_int(query.get("since"), 0)
        hold = min(_positive_int(query.get("wait"), 0), config.MAX_HOLD_S)

        found = self.mailboxes.get(device, slot_name, since, hold)
        if found is None:
            # 204, not 200-with-null and not 404. It is the one answer that
            # means "you are up to date" without a body to parse, and the
            # client's handling of it is a single branch.
            self._send(HTTPStatus.NO_CONTENT, b"", "application/json", _CORS)
            return

        self._json({"ok": True, "rev": found.rev, "envelope": found.envelope,
                    "updatedAt": found.updated_at})

    def _write_slot(self, device: Device, slot_name: str) -> None:
        body = self._body()
        if body is None:
            self._error(HTTPStatus.BAD_REQUEST, "send a JSON object")
            return

        envelope = body.get("envelope") if isinstance(body.get("envelope"), dict) else body
        # `wake` is outside the envelope on purpose: the relay cannot read the
        # envelope, and this is the one thing it has to decide — whether a
        # phone should be buzzed. It is a single bit, and the notification it
        # gates already reveals the same fact.
        wake = body.get("wake") is True
        rev = self.mailboxes.put(device, slot_name, envelope, wake=wake)
        self._json({"ok": True, "rev": rev})

    # ── the pages ───────────────────────────────────────────────────────────

    def _page(self, path: str) -> None:
        if not config.SERVE_LAB:
            self._error(HTTPStatus.NOT_FOUND, "no such endpoint")
            return

        # `/pair` is where the label's QR points. It is the same page as the
        # lab: the claim code arrives in the fragment, which the browser does
        # not send here, so this handler could not read it even if it wanted to
        # — the page's own JavaScript is the first thing to see it.
        pages = {"/": "lab.html", "/lab": "lab.html", "/pair": "lab.html"}
        if path in pages:
            self._send(HTTPStatus.OK, (WEB_DIR / pages[path]).read_bytes(),
                       "text/html; charset=utf-8")
            return
        if path == "/style.css":
            self._send(HTTPStatus.OK, (WEB_DIR / "style.css").read_bytes(),
                       "text/css; charset=utf-8")
            return
        self._error(HTTPStatus.NOT_FOUND, "no such endpoint")


#: Sent on every answer so the production web app — which is on a different
#: origin — can talk to the relay from a page. It widens nothing: the mailbox
#: is opened by a bearer token, never by a cookie, so a browser being allowed
#: to *read* the reply does not let one site act as another's user.
_CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
}


def _parse_query(raw: str) -> dict:
    out: dict[str, str] = {}
    for part in raw.split("&"):
        if not part:
            continue
        key, _, value = part.partition("=")
        out[key] = value
    return out


def _positive_int(value, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed >= 0 else default


def make_server(mailboxes: Mailboxes | None = None,
                port: int | None = None) -> ThreadingHTTPServer:
    store = mailboxes or Mailboxes()
    handler = type("BoundHandler", (Handler,), {"mailboxes": store})
    server = ThreadingHTTPServer(
        (config.HOST, config.PORT if port is None else port), handler)
    server.daemon_threads = True
    return server

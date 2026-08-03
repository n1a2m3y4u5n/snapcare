"""Telling the web app that a mailbox changed, so a closed phone can be woken.

Why the relay does not send the notification itself
--------------------------------------------------
Web Push needs an ES256 signature, and the standard library has no ECDSA. The
relay is standard library only on purpose — it is the piece that has to still
build in two years for whoever inherits it — and hand-rolling curve arithmetic
to keep that true would be the wrong trade by a wide margin. Node has ES256
built in, so the web app signs and sends; this file only says "something
happened", in one POST with no body worth reading.

What leaves here
----------------
A device id and a slot name. Not the envelope — the relay cannot read it, and
that is the whole design. So the notification that eventually reaches the phone
carries no medicine name either: there is nothing here to put in it. The phone
opens the envelope itself once the app is running, which is where it has always
been opened.

Failure is not an error
-----------------------
If the web app is down, or the token is wrong, or DNS is having a day, the
write that triggered this has already succeeded and the dispenser has already
been answered. A push that does not arrive costs a notification; a write that
fails costs a dose. So this runs on its own thread, with a short timeout, and
swallows everything.
"""
from __future__ import annotations

import json
import logging
import threading
import urllib.error
import urllib.request

from . import config

log = logging.getLogger("relay.hook")


def _post(url: str, token: str, payload: dict, timeout: float) -> None:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "SnapCareRelay/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status >= 400:
                log.warning("push hook answered %s", response.status)
            else:
                # Logged on success too, and deliberately. Everything else about
                # this path is silent by design, so without a line here the only
                # way to tell "the hook worked" from "the hook never ran" is to
                # own a phone that did or did not buzz.
                log.info("push hook ok: %s %s", payload.get("deviceId", "")[:8], response.status)
    except urllib.error.HTTPError as exc:
        # Worth a line at warning: a 401 here means the two halves have
        # different tokens, and the only symptom anybody would otherwise see is
        # "notifications stopped working" with nothing in either log.
        log.warning("push hook refused: %s", exc.code)
    except (urllib.error.URLError, OSError, ValueError) as exc:
        log.info("push hook unreachable: %s", exc)


def notify(device_id: str, slot: str, rev: int) -> None:
    """Fire and forget. Returns immediately; never raises.

    Only `reported` is worth sending. The other two slots are written *by the
    phone*, so waking the phone for them means a carer who saves a schedule
    gets a notification from their own tap.
    """
    if slot != "reported":
        return
    if not config.HOOK_URL or not config.HOOK_TOKEN:
        return

    payload = {"deviceId": device_id, "slot": slot, "rev": rev}
    thread = threading.Thread(
        target=_post,
        args=(config.HOOK_URL, config.HOOK_TOKEN, payload, config.HOOK_TIMEOUT_S),
        # Daemon so a hook that is hanging on a dead host cannot hold up a
        # shutdown. A deploy that takes ten extra seconds per parked thread is
        # a deploy people stop doing.
        daemon=True,
        name=f"push-hook-{device_id[:8]}",
    )
    thread.start()

"""Every knob the relay has, in one file.

All of them are settable from the environment, because the relay is deployed
as a container and a container's configuration is its environment. The defaults
are the ones a contest demo should run with.
"""
from __future__ import annotations

import os
from pathlib import Path


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, "").strip() or default)
    except ValueError:
        return default


#: Where the mailboxes live. On fly.io this is a mounted volume; anywhere else
#: it is a directory. The relay is useless without durability — a restart that
#: forgets every pairing means every dispenser in the field goes quiet until
#: somebody re-scans a label.
DATA_DIR = Path(os.environ.get("SNAPCARE_RELAY_DATA", "./relay-data"))

PORT = _int("PORT", 8088)
HOST = os.environ.get("SNAPCARE_RELAY_HOST", "0.0.0.0")

#: Longest a client may ask the relay to hold a poll open.
#:
#: The device asks for 50 s (`CLOUD_HOLD_S` in the firmware). The ceiling is
#: here because the parameter arrives from the network: without it, one client
#: asking for a hold of a million seconds is a thread parked forever, and
#: enough of those is a relay that has stopped answering anybody.
MAX_HOLD_S = _int("SNAPCARE_RELAY_MAX_HOLD", 55)

#: Largest envelope accepted. A sealed schedule is a few hundred bytes; a
#: reported status with a page of dose events is a few thousand.
MAX_BODY = _int("SNAPCARE_RELAY_MAX_BODY", 64 * 1024)

#: How many mailboxes may exist. The relay creates one on first sight of a new
#: device id, which is what makes pairing need no registration step — and also
#: means anybody who can reach it can create mailboxes until the disk is full.
#: This is the bound on that. Raise it for a real deployment.
MAX_DEVICES = _int("SNAPCARE_RELAY_MAX_DEVICES", 1000)

#: How many polls may be held open at once, across all devices. Each one is a
#: parked thread; this is the difference between a slow relay and a dead one.
MAX_WAITERS = _int("SNAPCARE_RELAY_MAX_WAITERS", 200)

#: How many polls one device id may hold open. A device holds one and the app
#: holds one; a handful more is a page left open in several tabs. Well past
#: that is a client in a reconnect loop, and it should not be able to consume
#: the whole allowance above on its own.
MAX_WAITERS_PER_DEVICE = _int("SNAPCARE_RELAY_MAX_WAITERS_PER_DEVICE", 8)

#: Mailboxes untouched for this long are removed on startup. A device that is
#: unplugged for good otherwise occupies a slot forever.
EXPIRE_DAYS = _int("SNAPCARE_RELAY_EXPIRE_DAYS", 180)

#: Serve the demo app at /lab and the pairing hand-off at /pair.
#:
#: On by default because the relay is a contest deliverable and the demo is how
#: it gets shown. Turn it off for anything long-lived: it is a debugging tool
#: that is deliberately generous about what it will let you do.
SERVE_LAB = os.environ.get("SNAPCARE_RELAY_LAB", "1").strip().lower() not in (
    "0", "false", "no", "off",
)

#: Where to say "device X wrote its reported slot", so a phone that is closed
#: can be woken. Empty means the relay says nothing to anybody, which is the
#: right default: a relay somebody else deploys should not be calling out to
#: our web app.
#:
#: The relay does not send the push itself — see hook.py for why (ES256 is not
#: in the standard library, and the standard-library-only rule is worth more
#: than hand-rolled curve arithmetic).
HOOK_URL = os.environ.get("SNAPCARE_RELAY_HOOK_URL", "").strip()

#: Shared secret for the line above. Without it the web app would accept
#: "device X just dispensed" from anybody who can reach the endpoint, which is
#: a way to make somebody's phone buzz at three in the morning.
HOOK_TOKEN = os.environ.get("SNAPCARE_RELAY_HOOK_TOKEN", "").strip()

#: Long enough for a web app that was asleep.
#:
#: This was 5 s, which sounds generous until you notice *when* the hook fires.
#: The web app runs with `min_machines_running = 0`, so it is stopped whenever
#: nobody is using it — and "nobody is using it" is the exact situation this
#: feature exists for. The first request wakes the machine, and the wake plus a
#: Next.js cold start took longer than five seconds on the first real try:
#:
#:     relay.hook: push hook unreachable: The read operation timed out
#:
#: A timeout here is a notification nobody gets. Nothing is waiting on this
#: thread — the write it follows has already been answered — so the cost of
#: waiting longer is one daemon thread parked for a few extra seconds.
HOOK_TIMEOUT_S = _int("SNAPCARE_RELAY_HOOK_TIMEOUT", 20)

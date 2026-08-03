"""Run the relay.

    python3 -m snapcare_relay --port 8088 --data ./relay-data

There is no daemonising, no pidfile and no config file. It is one process that
logs to stdout and exits on a signal, because it is deployed as a container and
that is exactly what a container wants.
"""
from __future__ import annotations

import argparse
import logging
import signal
import sys

from . import __version__, config, hook
from .mailbox import Mailboxes
from .server import make_server

log = logging.getLogger("relay")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="snapcare-relay",
        description="The mailbox between a SnapCare dispenser and the web app.",
    )
    parser.add_argument("--port", type=int, default=None,
                        help=f"port to listen on (default {config.PORT})")
    parser.add_argument("--data", default=None,
                        help=f"where the mailboxes live (default {config.DATA_DIR})")
    parser.add_argument("--no-lab", action="store_true",
                        help="do not serve the demo app at /lab")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    if args.no_lab:
        config.SERVE_LAB = False
    if args.data:
        config.DATA_DIR = type(config.DATA_DIR)(args.data)

    server = make_server(Mailboxes(config.DATA_DIR, on_write=hook.notify), args.port)
    host, port = server.server_address[0], server.server_address[1]

    log.info("snapcare relay %s listening on %s:%d", __version__, host, port)
    log.info("mailboxes in %s", config.DATA_DIR.resolve())
    if config.SERVE_LAB:
        log.info("demo app at http://localhost:%d/lab", port)
    log.info("point a dispenser at it with SNAPCARE_RELAY_URL=http://<this host>:%d", port)

    def stop(*_args):
        log.info("shutting down")
        # From a signal handler, on the main thread, while serve_forever is
        # running on that same thread — so this cannot block waiting for it.
        import threading
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    try:
        server.serve_forever(poll_interval=0.2)
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())

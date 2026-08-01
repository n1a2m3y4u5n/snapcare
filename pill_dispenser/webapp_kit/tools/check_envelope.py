#!/usr/bin/env python3
"""Open a browser-sealed envelope with the firmware's own code.

`vectors.json` proves one direction — Python seals, TypeScript opens. This
proves the other, which is the direction a real schedule travels:

    node -e '...' | python3 tools/check_envelope.py --claim 6V9F59QK67 --slot desired

Or paste an envelope from the browser console:

    python3 tools/check_envelope.py --claim 6V9F59QK67 --slot desired <<'JSON'
    {"v":1,"rev":7,"alg":"A256GCM","iv":"...","ct":"..."}
    JSON

Exit 0 and the plaintext on stdout means the two implementations agree. Exit 1
means they do not, and the failure would otherwise have shown up as a dispenser
that silently ignores every schedule you send it.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "rpi_firmware"))

from snapcare_dispenser import envelope, provisioning  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--claim", required=True, help="the ten-character pairing code")
    parser.add_argument("--slot", default="desired", choices=["desired", "reported"],
                        help="which direction this envelope travels (default desired)")
    parser.add_argument("--device-id", default=None,
                        help="override the derived device id, to test a mismatch")
    args = parser.parse_args()

    if not envelope.available():
        print(envelope.UNAVAILABLE_HINT, file=sys.stderr)
        return 1

    if not provisioning.normalise_claim(args.claim):
        print("that is not a valid pairing code — ten characters of 23456789ABCDEFGHJKMNPQRSTUVWXYZ",
              file=sys.stderr)
        return 1

    try:
        candidate = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        print(f"stdin is not JSON: {exc}", file=sys.stderr)
        return 1

    # A browser might hand over `{"envelope": {...}}` — what the relay's PUT
    # body looks like — as easily as the envelope itself. Take either.
    if isinstance(candidate, dict) and isinstance(candidate.get("envelope"), dict):
        candidate = candidate["envelope"]

    device_id = args.device_id or provisioning.device_id(args.claim)

    try:
        opened = envelope.unseal(provisioning.box_key(args.claim), device_id,
                                 args.slot, candidate)
    except envelope.SealError as exc:
        print(f"did not open ({exc})", file=sys.stderr)
        print("\nThings that produce exactly this, in the order they happen:\n"
              "  the claim code differs by one character between the two sides\n"
              f"  the slot is wrong — this was opened as {args.slot!r}\n"
              "  the device id was derived from a different code\n"
              "  base64url padding was left on, or standard base64 was used\n"
              "  the revision in the envelope was edited after sealing",
              file=sys.stderr)
        return 1

    print(f"opened as {args.slot}, revision {candidate.get('rev')}, device {device_id}",
          file=sys.stderr)
    json.dump(opened, sys.stdout, indent=2)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

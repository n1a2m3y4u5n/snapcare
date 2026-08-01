# webapp_kit — the app's side of the dispenser sync

A zero-dependency TypeScript module for pairing with a SnapCare pill dispenser,
sending it a schedule, and reading back what it is doing. Copy `src/` into the
web app and import from it.

**Start with [INTEGRATION.md](INTEGRATION.md).** This file is the map; that one
is the manual.

```
src/
  claim.ts      the printed pairing code — normalise, format, read from a QR
  derive.ts     HKDF: code → device id, access token, box key
  envelope.ts   AES-256-GCM seal/unseal, and what the ciphertext is bound to
  schedule.ts   SC1*W* — the schedule form that carries days and course length
  relay.ts      DispenserClient: publish, long poll, revision conflicts
  types.ts      what the device actually sends, transcribed from the firmware
  index.ts      import from here

tests/
  kit.test.ts   node --test, in the same style as lib/hardware/*.test.ts
  vectors.json  generated from the firmware — do not hand-edit

tools/
  make_vectors.py    regenerate the vectors from the firmware's own modules
  check_envelope.py  open a browser-sealed envelope with the device's own code

examples/
  useDispenser.ts     the long poll as a React hook, with backoff and cleanup
  DispenserPanel.tsx  what to show, and the two things a naive screen gets wrong
```

## Why it lives here rather than in `lib/`

`pill_dispenser/` is the hardware's directory, and this is the hardware's
contract with the app. Keeping it here means the firmware and the client it
implies move together — in particular `tests/vectors.json` is generated from
`rpi_firmware/snapcare_dispenser/`, so a change to the derivation on the device
breaks these tests rather than becoming a pairing that silently never works.

Copy `src/` wherever it belongs in the app. Nothing in it imports anything from
outside itself.

## Running things

```bash
make check     # are the vectors current? Python only
make vectors   # regenerate them from the firmware
make test      # the TypeScript tests — needs node 22+
make demo      # a relay and a mock dispenser on localhost, no Raspberry Pi
```

> **The TypeScript tests have not been run on the machine this was written on** —
> it has no JavaScript runtime installed (`node`, `deno` and `bun` are all
> absent, and there is no `node_modules/`). The Python halves are exercised:
> `make check` passes, and `tools/check_envelope.py` opens a sealed envelope and
> refuses a tampered one. The crypto contract itself is independently confirmed
> by the Kotlin implementation in `../android_demo/`, whose JVM tests read the
> same `vectors.json` and pass. Run `make test` once on a machine with node.

## The four implementations

This pairing crypto now exists four times, sharing no code:

| | where |
|---|---|
| Python | `rpi_firmware/snapcare_dispenser/{provisioning,envelope}.py` — the device |
| JavaScript | `cloud_relay/snapcare_relay/web/lab.html` — the reference page |
| TypeScript | here |
| Kotlin | `../android_demo/` — the demo app |

A disagreement between any two of them is a pairing that never works, with no
error at either end and nothing in any log. `tests/vectors.json` — generated
from the Python — is the only thing that catches it. Regenerate it whenever the
derivation changes, and let the other three fail.

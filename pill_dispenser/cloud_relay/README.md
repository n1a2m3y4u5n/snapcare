# The cloud relay

A mailbox the dispenser and the app can both reach, so a schedule edited in the
web app arrives at a device in somebody's bedroom without anyone being on the
same WiFi.

```
   web app / the lab                                       dispenser
        │                                                      │
        │  PUT  /desired    (sealed)          GET /desired ─────┤ held open,
        ▼                                     ◄────────────     │ answered the
   ┌─────────────────────────────────────────────────────┐      │ instant the
   │  relay — stores two envelopes per device            │      │ app writes
   │  and cannot open either of them                     │      │
   └─────────────────────────────────────────────────────┘      │
        ▲  GET  /reported                     PUT /reported ────┘
        │     (sealed)                        ◄────────────
```

The dispenser is behind a home router, so nothing can connect *to* it. It holds
one outbound HTTPS connection here instead, and whatever the app has left in
the mailbox is waiting on the other end of it.

---

## It cannot read what it carries

This is the part worth being precise about, because the thing being moved is a
list of what medication a named person takes and when they are alone in the
house with it.

Everything crossing the relay is AES-256-GCM under a key both ends derive from
the ten-character code printed on the device, and neither end ever transmits.
The relay is given a different branch of the same derivation — enough to tell
one mailbox from another, and useless for opening one:

```
 claim code   ──HKDF──►  device id       the relay's address for it   (it sees this)
  (printed     ──HKDF──►  access token    proves the right to it       (it sees this)
   on the      ──HKDF──►  box key         opens the schedule           (it never does)
   device)
```

So a copy of this service's disk — taken by us, by the host, or by somebody who
got in — yields ciphertext, timestamps and sizes. `test_the_relay_never_sees_a_schedule`
asserts exactly that, by reading the files back off the volume.

It follows that **holding the printed code is equivalent to holding the
device.** That is the security model a sticker can actually support, and it is
stated rather than implied. There is no account and no password because there
is nothing either could check that the sticker does not already establish.

---

## Running it

```bash
make            # 63 tests, no container, no network beyond localhost
make run        # http://localhost:8088 — API, and the demo app at /lab
make demo       # a relay *and* a dispenser on this machine, wired together
```

`make demo` is the one to reach for. It starts the relay, starts the firmware
with mock servos pointed at it, and prints the pairing code — open
`http://localhost:8088/lab`, pair with that code, and edit the schedule. The
dispenser applies it while you watch.

Deploying it is a container and a volume:

```bash
cp fly.toml.example fly.toml
fly launch --no-deploy --copy-config
fly volumes create snapcare_relay_data --size 1
fly deploy
```

Its own fly app, deliberately — the repository root has a `fly.toml` for the
web app, and folding a second service into it would mean the two share a
deploy, a restart and a bad afternoon.

Then point a dispenser at it:

```bash
curl -X POST http://pilldispenser.local/api/cloud \
     -H 'Content-Type: application/json' \
     -d '{"relayUrl":"https://snapcare-relay.fly.dev"}'
```

or set `SNAPCARE_RELAY_URL` in the systemd unit, or type it into the device's
own console. With no relay configured the dispenser is LAN-only, exactly as it
was before this existed.

---

## What it costs

No subscription and no broker account: it is one Python process with no
dependencies, on infrastructure the project already has.

The honest cost is uptime. A dispenser holding a long poll is by design a
connection that is always open, so the machine never goes idle and never
stops — one `shared-cpu-1x`, continuously, which on fly's pay-as-you-go is a
couple of US dollars a month. There is no arrangement where a device gets a
schedule in one second without something being awake to hand it over.

If that matters more than the latency, the cheap mode is on the **device**, not
here:

```bash
SNAPCARE_CLOUD_IDLE_S=900        # check every fifteen minutes instead of holding
```

Then set `auto_stop_machines = "stop"` and `min_machines_running = 0` in
`fly.toml` and the machine sleeps between checks. The cost is exactly what it
looks like: an edit made in the app can sit for a quarter of an hour before the
dispenser hears about it.

---

## The API

Six endpoints. `Authorization: Bearer <access token>` on all but the first.

| | |
|---|---|
| `GET /v1/health` | is it up, how many mailboxes, how many polls held |
| `GET /v1/devices/<id>` | revisions and timestamps — no ciphertext |
| `GET /v1/devices/<id>/desired?since=N&wait=S` | the schedule, held open until there is one |
| `PUT /v1/devices/<id>/desired` | the app writes a sealed schedule |
| `GET /v1/devices/<id>/reported?since=N&wait=S` | what the device says about itself |
| `PUT /v1/devices/<id>/reported` | the device writes a sealed report |
| `DELETE /v1/devices/<id>` | unpair — drops the mailbox |

`204` means "you are up to date"; it is the answer to most polls and has no
body to parse. `409` means the revision was not newer than the stored one, and
carries the current one so the writer can re-read and retry.

**A read cannot create a mailbox.** Only a write can. Otherwise a few thousand
`GET`s with invented ids exhaust the device limit and the next real dispenser to
be plugged in is told the relay is full. Both ends write before they need to
read, so nothing legitimate notices.

### Revisions

The writer proposes; the relay only ever accepts an increase. It cannot assign
one itself — the revision is sealed into the envelope's authenticated data, so
assigning one would mean re-sealing, which it cannot do.

That gives optimistic concurrency, which is the right shape here. Two phones
editing the same prescription both write revision 8; one is told 409 and
re-reads. Last-write-wins would instead make one of them watch their change
disappear from a screen that said it had saved.

The device checks the revision a *second* time, against a number on its own SD
card. That is a different question — not "who won a race" but "have I already
applied this, and is this actually newer than what I am running" — and it is
what stops a rolled-back relay replaying last month's prescription after a
power cut.

---

## The demo app

`/lab` is the app's half of the link with everything it does shown as it does
it: pair from a code, seal a schedule, publish it, and long-poll for what the
device reports — with a traffic log beside it carrying the plaintext.

It also contains a **simulated device**, so the whole path can be exercised with
no Raspberry Pi anywhere. And a fault-injection panel for the cases that are
hard to reach on purpose: a replayed revision, a payload sealed under the wrong
key, an unparseable schedule, a tray that is not fitted.

It runs a **self-check at load**: it derives keys from a fixed code and opens an
envelope that Python sealed, both committed. If this browser disagrees with the
firmware about HKDF, AES-GCM, the additional authenticated data or the base64
flavour, it says so and refuses to pair — because the alternative symptom is a
pairing that addresses a mailbox nobody is listening to, which looks exactly
like a dispenser that has been unplugged.

Turn it off for anything long-lived (`SNAPCARE_RELAY_LAB=0`). It is a debugging
tool and it is deliberately generous about what it will let you do.

---

## Layout

```
cloud_relay/
  snapcare_relay/
    config.py      every knob                            ← start here
    mailbox.py     the storage, the revisions, the waiting
    server.py      six endpoints and two pages
    web/lab.html   the demo app — no build step, nothing external
  tests/           63 tests; none of them import the firmware
  Dockerfile       one layer, no dependencies to install
  fly.toml.example its own app, not the web app's
```

The suite importing nothing from `rpi_firmware/` is load-bearing: this is
deployed to a container that has no dispenser code in it. The envelopes in the
tests are therefore plain dictionaries with nothing sealed inside them, which
is the point being demonstrated — the relay carries whatever it is given and
has never been able to read any of it.

The one test that spans both ends lives on the firmware side
(`rpi_firmware/tests/test_cloud_endtoend.py`), starts a real relay on a real
port, and skips if this directory is not checked out.

# Wiring the dispenser into the web app

Everything the app needs to pair with a pill dispenser, send it a schedule, and
show what it is doing — as a drop-in TypeScript module with no dependencies.

This is written for whoever owns `app/` and `lib/`. Nothing here edits anything
outside `pill_dispenser/`: copy `src/` where you want it and import from it.

```
pill_dispenser/webapp_kit/
  src/            the module — copy this into lib/
  tests/          node --test, against vectors generated from the firmware
  tools/          regenerate the vectors; open a browser envelope with Python
  examples/       a React hook and a pairing screen, to copy or to read
```

---

## 1. Which path, and why there are two

There are two ways to reach a dispenser, and they are not alternatives — one is
the fallback for the other.

| | **LAN** (`lib/hardware/dispenser.ts`, already written) | **cloud** (this kit) |
|---|---|---|
| Where the phone must be | on the same WiFi | anywhere |
| Mixed content | blocks `fetch`; you navigate to a link instead | not an issue, the relay is HTTPS |
| Days of the week, course length | only via `/api/schedule`, which you cannot `fetch` | carried, always |
| Needs internet | no | yes, at both ends |
| Latency | instant | about a second |

**Build the cloud path for anything new.** It is the one that works when the
carer is at work and the dispenser is in somebody's bedroom, which is the normal
case. Keep the LAN path for the case the cloud path cannot serve: no internet,
or somebody standing next to the machine who should not be round-tripping
through a data centre to open a tray.

The device tells you when the LAN is an option — `report.network.deviceUrl`,
inside the sealed envelope. That is the only reason it is allowed to name
somebody's WiFi at all.

---

## 2. Ten minutes to a working screen

You need a relay. `pill_dispenser/cloud_relay/` is one container; deploy it once
and every dispenser uses it. For development you do not need one, or a
Raspberry Pi:

```bash
make -C pill_dispenser demo     # a relay on :8088 and a mock dispenser on :8099
```

It prints a pairing code. That code is a real dispenser as far as this kit is
concerned — it holds the same long poll, applies the same schedules, and logs
the same dose events, with the servo driver swapped for one that records what it
was told.

```ts
import { DispenserClient, EVERY_DAY } from '@/lib/snapcare/dispenser';

const client = await DispenserClient.pair({
  relayUrl: 'http://localhost:8088',
  claim: '6V9F5-9QK67',              // off the label, or from the demo output
});

await client.setSchedule([
  { tray: 1, times: ['0800', '2000'], days: EVERY_DAY, durationDays: 30 },
  { tray: 3, times: ['1900'], days: 0b0010101, durationDays: 0 },   // Mon/Wed/Fri, ongoing
]);

const found = await client.getReport();
console.log(found?.report.status.nextDose);      // { tray: 1, time: '2000' }
console.log(found?.report.events);               // the dose log, newest first
```

That is the whole API for the common case. The rest of this document is the
parts that are not obvious.

---

## 3. Getting the pairing code

Three ways, in order of how little the person has to do:

1. **Scan the label.** Its fourth QR is `https://<relay>/pair#CODE`.
   `claimFromPairUrl()` reads it.
2. **Ask the device**, when the phone is on the same WiFi:
   `GET http://pilldispenser.local/api/identity` → `{ claim, deviceId, pairQr }`.
   No typing at all. (Mixed content still applies — this is the HTTP device.)
3. **Type it.** Ten characters, `6V9F5-9QK67`. The alphabet has no O, I, L, 0
   or 1 in it for exactly this reason.

> **The code is in the URL *fragment*, and it has to stay there.** Browsers never
> send a fragment to the server, so the code reaches the page's JavaScript and
> reaches neither the relay, its access log, nor any proxy in between. Moving it
> to a query parameter would put a medical device's write key into somebody's
> HTTP logs. `claimFromPairUrl` deliberately refuses to read it from a query
> string, so this is hard to get wrong by accident.

### Validate it before you derive from it

```ts
import { isValidClaim, formatClaim } from '@/lib/snapcare/dispenser';
```

`normaliseClaim` **never pads and never truncates.** A code with one character
missing would otherwise derive a perfectly valid key for a mailbox that does not
exist, and the only symptom is a dispenser that appears to have been unplugged —
no error, at either end, ever. Refuse it in the field while the person is still
looking at it.

### Where to keep it

`claim` is a credential that grants schedule-writing access to a medical device.
The relay's own lab page puts it in `localStorage`, which is right for a
debugging tool on a laptop and probably not right for the production app —
unlike the ECDSA key in `deviceKey.ts`, it is extractable by anything that can
run script on your origin. This deserves the same decision you already made for
`deviceKey.ts`, not a default.

---

## 4. What crosses the relay, and what the relay can see

```
 claim code ──HKDF──► device id      the relay's address for it   (it sees this)
            ──HKDF──► access token   proves the right to it       (it sees this)
            ──HKDF──► box key        opens the schedule           (it never does)
```

The relay stores ciphertext, revisions, sizes and timestamps. It is given two of
the three branches and never the third, so it can route without ever being in a
position to decrypt. **The server is not trusted with health data** — the same
posture as `/api/store`.

`src/derive.ts` does this; you should not need to touch it. If you do, note that
it must agree byte for byte with `provisioning.py` on the device, and that
`tests/vectors.json` is generated from the Python side precisely so a
disagreement fails a test rather than becoming a pairing that never works.

---

## 5. Revisions: the one thing to get right

**Revisions must increase, and you do not own the counter.**

`setSchedule()` reads the current revision and writes the next one, so the
common case needs nothing from you. What you must handle is the conflict:

```ts
try {
  await client.setSchedule(slots);
} catch (error) {
  if (error instanceof RevisionConflictError) {
    // Somebody else — a second phone, another carer — saved while this screen
    // was open. Re-read and show them the newer schedule.
    const current = await client.getSchedule();
    showConflict(current);
    return;
  }
  throw error;
}
```

Do **not** retry with a bumped revision. Two phones editing the same
prescription is the case this exists for, and the writer that lost is the one
holding a stale copy. Letting it retry is how an edit made on the other phone
silently disappears.

---

## 6. Showing what the device is doing

```ts
const { rev, report } = (await client.getReport())!;
```

`report.status` is the device's full `/api/status`. The fields worth putting on
a screen:

| field | show it as |
|---|---|
| `status.clock.trusted` | **false means nothing will be dispensed.** This is the most important boolean on the object |
| `status.clock.source` | `ntp` / `rtc` / `phone` — what vouched for the time |
| `status.nextDose` | `{ tray, time }` or null |
| `status.awaitingRelease` | **doses due right now, still in the hopper.** Non-empty means show the release button and push a notification; stop offering it at each entry's `expiresAt` |
| `status.trays`, `status.trayCount` | ask rather than assume. `MAX_TRAYS` is 8 everywhere — `dispenser.ts`, this kit and `sc1.MAX_SLOTS` — but the machine in front of you usually has fewer fitted |
| `status.notes` | what the loaded schedule *lost* in transit. Show these verbatim |
| `status.servoSteady` | false means the servos twitch and hum — a real complaint if it is in a bedroom |
| `status.indicators` | which of the ring and buzzer are actually fitted |
| `report.lastError` | empty when the last cloud operation succeeded |

### The long poll

```ts
const controller = new AbortController();
let rev = 0;

while (!controller.signal.aborted) {
  try {
    const found = await client.waitForReport(rev, 50, controller.signal);
    if (found) { rev = found.rev; render(found.report); }
  } catch {
    await sleep(backoff());     // a dropped connection is normal
  }
}
```

`waitForReport` resolves to **null** when the hold expires with nothing new.
That is the normal case, not an error — reconnect. A dropped connection is also
normal: it happens every time a phone locks its screen. `examples/useDispenser.ts`
is this loop written properly, with backoff and cleanup.

### "Is it still there?"

```ts
if (DispenserClient.isStale(report)) showUnplugged(report.at);
```

Use the report's own timestamp, **not** the word "connected". A dispenser whose
power has been pulled sends nothing and otherwise looks identical to a healthy
one — and *"the dispenser has been unplugged since Tuesday"* is the single most
useful thing a carer can be told.

Be generous with the threshold. After a WiFi outage the device resets its
backoff the instant the network returns and republishes immediately, so a
recovered dispenser reappears within a second or two rather than at the end of a
retry interval. If it is quiet for longer than the heartbeat plus a margin, it
is genuinely down.

---

## 7. Schedules

`encodeWeekly` produces `SC1*W*`, the lossless form:

```
SC1*W*1:0800.2000-127-030/3:1900-021-000
       └tray └times      └days └course length (0 = ongoing)
```

`days` is the same Monday-first bitmask as `EVERY_DAY` in
`lib/hardware/protocol.ts`. `daysToMask([0, 2, 4])` → `21` (Mon, Wed, Fri);
`describeDays(21)` → `'Mon, Wed, Fri'`.

`normaliseSlots` applies exactly the rules the device applies, so a schedule the
device would refuse throws here first — while somebody is still looking at the
form rather than after they have walked away.

**This also closes the paper-form gap.** A caregiver photographs a form sheet,
`form_sheet_parser` produces `SC1*W*…`, and it reaches the device through the
same slot the app writes. There is no second path to maintain.

### Why not `SC1*S*` / `/save`

`/save` has no field for days of the week and none for course length, so every
tray it defines runs *every day, indefinitely*. A Mon/Wed/Fri prescription sent
that way dispenses on four days nobody asked for. The firmware will not hide
this — the confirmation page says so in as many words, and `status.notes`
carries it — but the app is the only place that can actually fix it.

---

## 8. The LAN path, unchanged

Nothing in `lib/hardware/` has to change. `dispenser.ts` works against this
firmware as-is: `DEFAULT_HOST = 'pilldispenser.local'` resolves, and `/save`,
`/dropout` and `/dismiss` answer with real HTML pages so the person lands on
something readable.

Two things did change on the device and are worth knowing if you write new LAN
code:

- **Mutating requests are name-checked.** A `POST /api/*` or one of the three
  mutating GETs is refused with **421** unless its `Host` is a name the device
  answers to — `pilldispenser`, `pilldispenser.local`, a two-label name starting
  with the hostname, or a bare IP. This costs a normal caller nothing, because
  the browser sets `Host` from the URL you fetched. It exists because otherwise
  any page open on a phone on the same WiFi can point a hostname *it* owns at
  the dispenser and drive it, and CORS does not help: dropping eight trays into
  a cup does not require reading the answer.
- **`POST /api/wifi/connect` answers 202,** not the outcome. See §9.

**The LAN API has no authentication.** Anything on the home network can post a
schedule or drop a tray. That matches the Shaztech firmware and what
`dispenser.ts` expects, so it was not something to change unilaterally — but it
is a real gap for a device that dispenses medication and it deserves a decision.
The cheapest fix that does not break compatibility is a device-specific token
from the same derivation, printed on the same label, sent as a query parameter.

---

## 9. If you show the WiFi setup in the app

You do not have to. The device's setup is self-contained: a printed QR joins its
hotspot and a captive portal does the rest. But if you want to walk somebody
through it, `GET /api/identity` gives you what to draw.

**A Pi 3B has one radio.** It can be the setup hotspot or on the house network,
never both — so *joining is also the act of hanging up on whoever asked for it.*
That shapes the API and it will shape your UI:

```
GET /api/wifi/attempt
  → { attempt: { state: 'joining',   // idle | joining | joined | failed | recovering
                 detail: 'The password was not accepted.',
                 hotspotBack: true, ... },
      wifi: { mode: 'hotspot', ssid: 'SnapCare-V5XH', address: '10.42.0.1' } }
```

Four things, each of which is a bug if you skip it:

1. **Expect 10–20 seconds where nothing is reachable at all**, between the
   hotspot going down and the phone falling back to the house WiFi. Say so on
   screen. An unlabelled spinner at that exact moment is when people unplug the
   device.
2. **Probe both `10.42.0.1` and `pilldispenser.local`, and decide from
   `wifi.mode` in the body** — not from which address answered. While the
   hotspot is up, its own DNS resolves *every* name to the device, so a
   successful `pilldispenser.local` probe there proves nothing.
3. **`hotspotBack` is the field to branch on** when `state` is `failed`. `true`
   means "the setup network is back — try a different password right here".
   `false` means the rollback failed too and the device needs a power cycle.
   Getting this wrong is the difference between finishing setup and giving up.
4. **`state: 'recovering'`** is the device retrying a network it already knows,
   unprompted. Nobody asked for it — do not show it as a failure if it comes to
   nothing.

---

## 10. Testing

```bash
make -C pill_dispenser/webapp_kit check    # are the vectors current? (Python only)
make -C pill_dispenser/webapp_kit test     # the TypeScript tests (needs node 22+)
make -C pill_dispenser demo                # a relay + a mock dispenser to develop against
```

`tests/vectors.json` is generated by `tools/make_vectors.py`, which imports the
**actual firmware modules**. That is what makes the tests meaningful: they are
not this code agreeing with itself, they are this code agreeing with the Python
running on the Raspberry Pi. Regenerate with `make vectors` after any change to
the derivation and never hand-edit the JSON.

To prove the other direction — the browser seals, the device opens — paste an
envelope out of the console:

```bash
python3 tools/check_envelope.py --claim 6V9F59QK67 --slot desired <<'JSON'
{"v":1,"rev":7,"alg":"A256GCM","iv":"...","ct":"..."}
JSON
```

There are now four implementations of this pairing crypto sharing no code: the
Python firmware, this TypeScript, the Kotlin in `../android_demo/`, and the
reference JavaScript in `cloud_relay/snapcare_relay/web/lab.html`. A
disagreement between any two of them is a pairing that simply never works, with
nothing in any log. The vectors are the only thing that catches it.

---

## 11. Reference implementations to read

- **`cloud_relay/snapcare_relay/web/lab.html`** — about four hundred readable
  lines doing all of this in a single page with no framework. Served at `/lab` on
  any running relay. Read this before writing the screen.
- **`android_demo/`** — the same flows as a native app, if you want to see the
  long poll driven from something that is not a browser.
- **`firmware/snapcare_dispenser/web/app.html`** — the device's own console,
  which is a working implementation of every LAN endpoint in about 300 lines.

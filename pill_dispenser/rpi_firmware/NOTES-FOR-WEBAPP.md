# Notes for whoever builds the web app

The hardware moved to a Raspberry Pi 3B. This is what that changes for the app,
what it does not, and the handful of things worth knowing before you write
against it.

> ## Start here instead
>
> **Since 2026-08-01 there is a drop-in TypeScript module that does all of this:
> [`pill_dispenser/webapp_kit/`](../webapp_kit/).** Zero dependencies, no
> framework API, tests in this repo's own `node --test` style, and golden
> vectors generated from the firmware so a change to the derivation on the
> device fails a test rather than becoming a pairing that silently never works.
>
> Copy `webapp_kit/src/` into `lib/` and read
> [`webapp_kit/INTEGRATION.md`](../webapp_kit/INTEGRATION.md). It covers the
> flows, the UI states, and the three mistakes worth reading about before
> writing the screen. There is also a React hook and an example panel in
> `webapp_kit/examples/`, and a native reference implementation of the same
> protocol in [`pill_dispenser/android_demo/`](../android_demo/).
>
> The document below is the underlying protocol reference and is still accurate.
> Two things have changed in the firmware since it was written, both worth
> knowing:
>
> - **`/api/status` gained a `gpio` object** — which servo, buzzer and button
>   drivers actually came up, and a `missing` array of plain sentences about
>   what is absent. `device.blockedReason` says, in words, why a device is not
>   dispensing; `device.servoUsable` is false when no GPIO library is installed
>   at all. A device in that state now **refuses to dispense** rather than
>   logging doses that never left the hopper, so do not treat an empty event log
>   as a healthy quiet device without checking that field.
> - **The clock chip is a DS1302**, not a DS3231. `clock.rtc.kind` says which,
>   and `clock.rtc.warnings` carries things worth surfacing that are not
>   failures. The trust model differs per chip — see `ds1302.py`.

**The short version: nothing in `lib/hardware/` has to change today.**
`dispenser.ts` works against the new firmware as-is. Everything below is about
what you *gain* if you want it.

> **Since 2026-07-29 there is a second, better path: cloud sync.** The
> dispenser now holds an outbound connection to a relay, so a schedule edited
> in the app reaches it in about a second — from anywhere, with no mixed-content
> problem, no `pilldispenser.local`, and no requirement that the phone be in the
> house. That is [section 7](#7-cloud-sync-the-path-that-does-not-need-the-same-wifi),
> and it is the one to read if you are choosing where to put new work. Sections
> 1 to 6 describe the LAN path, which is unchanged and still the fallback when
> there is no internet.
>
> **Two things changed on 2026-07-30 that touch code you may already have
> written.** Mutating requests are now name-checked and answer **421** if the
> `Host` is not one the device goes by — [§3](#one-header-your-requests-must-get-right);
> and `POST /api/wifi/connect` now answers **202** and is followed through
> `GET /api/wifi/attempt` rather than answering the outcome
> — [§5](#if-you-drive-the-join-yourself). Neither affects `dispenser.ts`.

---

## 1. What already works, unchanged

`lib/hardware/dispenser.ts` builds these URLs, and the firmware answers all
three with the same parameter names, from the Shaztech `Web_Stuff.ino`:

```
GET /save?trayinst=N&trayNames1=…&time1=HH:MM&color1=N&trayAlertEna1=on
GET /dropout?tray=N
GET /dismiss
```

`DEFAULT_HOST = 'pilldispenser.local'` resolves — the installer sets the
hostname and enables avahi so mDNS publishes exactly that name.

The top-level-navigation trick still works and is still necessary: an HTTPS page
cannot `fetch()` an HTTP device, but it can link to one. The firmware answers
these with a real HTML page, so the person lands on something readable rather
than a JSON blob.

**One difference in behaviour, and it is deliberate.** `MAX_TRAYS` in
`dispenser.ts` is 10. The firmware handles **8**, and the contest unit is built
with **3 hoppers fitted**. A `/save` naming a tray that is not fitted is refused
with a page saying which trays exist, rather than accepted and silently
half-applied — an absent servo cannot jam, so the alternative is a dose that is
scheduled, never dispensed, and reported by nothing.

`GET /api/status` reports `device.trays` and `device.trayCount`, so the app can
ask rather than assume:

```ts
const { device } = await (await fetch(`http://${host}/api/status`)).json();
const { plan, dropped } = planTrays(reminders, device.trayCount);
```

`planTrays` already returns `dropped` for what did not fit, so the app can tell
the user which doses were left out. That path just starts being used — and with
three trays it will be used often, so it is worth making that message good.

---

## 2. What the compatibility URLs cannot say

`/save` has no field for **days of the week** and none for **course length**.

Every tray it defines therefore becomes *every day, indefinitely*. A Mon/Wed/Fri
prescription sent through `/save` dispenses on four days nobody asked for, and
a 30-day course runs until the tray is empty.

The firmware will not hide this — the confirmation page says so in as many
words. But the app is the only place that can actually fix it, and the fix is
one request:

```ts
await fetch(`http://${host}/api/schedule`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    slots: [
      { tray: 1, times: ['0800', '2000'], days: 127, durationDays: 30 },
      { tray: 3, times: ['1900'],         days: 21,  durationDays: 0  },
    ],
  }),
});
```

`days` is the same Monday-first bitmask as `EVERY_DAY` in
`lib/hardware/protocol.ts`. `durationDays: 0` is ongoing. This is exactly the
`WeeklySlot` interface that `pill_dispenser/README.md` already proposed adding
to `protocol.ts` — you can send `encodeWeekly(slots)` as `{"payload": "..."}`
instead, and the firmware takes either.

**This also closes the paper-form gap.** A caregiver photographs a form sheet,
`form_sheet_parser` produces `SC1*W*…`, and it reaches the device through the
same endpoint the app uses. There is no second path to maintain.

---

## 3. The native API

`GET /api/status` is the one to build a device screen on. It answers with the
clock, the WiFi, the pin map, which servo driver is in use, the loaded plan, the
next dose, and whether a dose is currently waiting to be confirmed.

| | |
|---|---|
| `GET /api/status` | everything, in one request |
| `GET`/`POST /api/schedule` | the plan, as SC1 or as JSON |
| `POST /api/drop` | `{"tray": n}` |
| `POST /api/confirm` · `/api/dismiss` | taken / silence |
| `POST /api/clock` | `{"iso": "..."}` or `{"payload": "SC1*C*..."}` |
| `GET /api/events?limit=n` | the dose log, newest first |
| `GET /api/wifi/scan` · `GET /api/wifi/status` | what is nearby, and where we are |
| `POST /api/wifi/connect` | `{"ssid","password","hidden"}` → **202**, see §5 |
| `GET /api/wifi/attempt` | how that join is going — the state machine |
| `POST /api/wifi/hotspot` | raise the setup network now |
| `GET /api/identity` | SSID and the QR payloads, for a setup screen |

Errors are `{"ok": false, "error": "..."}` with a 4xx. Nothing throws; a
malformed payload is a 400, never a 500.

`Access-Control-Allow-Origin: *` is set on `/api/*`, so you can develop against
a real device from `http://localhost:3000`. It does not widen access — anything
on the LAN could already reach it — it only lets a browser page read the answer.

### One header your requests must get right

Since 2026-07-30 a request that **changes** something is refused with **421
Misdirected Request** unless its `Host` is a name the device answers to:
`pilldispenser`, `pilldispenser.local`, a two-label name starting with the
hostname (`pilldispenser.lan`), or any bare IP address. That covers `POST
/api/*` and the three mutating GETs `/save`, `/dropout` and `/dismiss`.

This costs a normal caller nothing — the browser sets `Host` from the URL you
fetched, and `http://pilldispenser.local/...` is exactly what `dispenser.ts`
builds. It exists because without it any page open on a phone on the same WiFi
can point a hostname *it* owns at the dispenser's address and drive it. CORS does
not help there: dropping eight trays into a cup does not require reading the
answer.

Reads are deliberately exempt, so nothing about §1–§3 changes and the captive
portal — whose probes arrive addressed to `connectivitycheck.gstatic.com` — keeps
working. If a router publishes DHCP clients under a domain of its own,
`SNAPCARE_EXTRA_HOSTS=pilldispenser.fritz.box` on the device allows it.

### Mixed content still applies

CORS does not rescue you from the browser blocking an HTTP request from an
HTTPS page. From `snapcare.fly.dev` the `/api/…` calls above **will be blocked**.
Your options, in the order I would try them:

1. **Keep using top-level navigation** for anything that must work from the
   deployed HTTPS app — the `/save` link approach, which is why it exists.
2. **Serve the control UI from the device itself.** It is already there at
   `http://pilldispenser.local/`, offline, no build step. Link to it.
3. **Use `/api/…` from a local dev server or a native wrapper**, where the
   origin is HTTP or the platform does not enforce mixed content.

The device's own console is a working reference implementation of every endpoint
above, in about 300 lines of plain JavaScript:
[`snapcare_dispenser/web/app.html`](snapcare_dispenser/web/app.html).

---

## 4. Two protocol facts worth having

### The clock vector in the docs was wrong

`SC1*C*202607251930*4` appears in several places and is described as a Friday.
**2026-07-25 is a Saturday**, so the correct payload is `…*5`. I have corrected
it in `pill_dispenser/` — the C++ header, its test, both READMEs and the Arduino
sketch. `form_sheet_parser` already had it right.

It went unnoticed because the C++ decoder does not check the weekday against the
date; the Python ones do, and this firmware refuses a payload where they
disagree. That is not pedantry: the weekday is what every day-of-week mask is
matched against, so accepting a wrong one shifts the entire week and a
Mon/Wed/Fri course starts dispensing on Sunday, Tuesday and Thursday — with
nothing anywhere reporting a fault.

`lib/hardware/protocol.test.ts:111` uses the same string, but only to assert
`messageKind` returns `null` for a kind it does not know, so the weekday is
irrelevant there and **that test needs no change.** If you ever implement
`decodeClock` in TypeScript, cross-check the weekday.

### The device has no screen, but events are still 20 characters

`MAX_DEVICE_PAYLOAD = 20` came from a 128×64 OLED that this build does not have.
It is kept anyway: every event carries its `SC1*E*` string alongside the JSON, so
the log stays replayable through any implementation, and `encodeEvent` in
`protocol.ts` still throws above 20. If you ever relax it, relax it on all four
sides at once.

---

## 5. The setup flow, if you want to show it in the app

The device's WiFi setup is entirely self-contained and needs nothing from the
app — a printed QR joins its hotspot and a captive portal does the rest. But if
you want to walk someone through it in-app, `GET /api/identity` gives you what
to draw:

```json
{
  "ssid": "SnapCare-V5XH",
  "wifiQr": "WIFI:T:WPA;S:SnapCare-V5XH;P:3k8krnp8pv8s;;",
  "setupUrl": "http://10.42.0.1/",
  "deviceUrl": "http://pilldispenser.local/"
}
```

Render `wifiQr` as a QR and the phone joins the hotspot from it — the same code
that is on the label. It is derived from the board's serial number and never
changes, so you can cache it against a device forever.

(Obvious but worth stating: that endpoint is only reachable *once you are on the
same network as the device*, so it is for a re-setup or a diagnostics screen,
not for first contact.)

### If you drive the join yourself

A Pi 3B has one radio. It can be the setup hotspot or it can be on the house
network, never both — so **joining is also the act of hanging up on whoever asked
for it.** That shapes the API, and it will shape your UI the same way it shaped
the device's own setup page.

`POST /api/wifi/connect` answers **202 Accepted** while the radio is still an
access point. It is not telling you the join worked; it is telling you the join
has started. Then poll:

```
GET /api/wifi/attempt
  → { "ok": true,
      "attempt": { "state": "joining",     // idle | joining | joined | failed | recovering
                   "ssid": "Home",
                   "detail": "The password was not accepted.",
                   "address": "192.168.1.42",
                   "hotspotBack": true,
                   "secondsAgo": 4, "busy": false, "managed": true },
      "wifi": { "mode": "hotspot", "ssid": "SnapCare-V5XH", "address": "10.42.0.1" },
      "deviceUrl": "http://pilldispenser.local/" }
```

Four things about that poll, each of which is a bug if you skip it:

1. **Expect a stretch where nothing is reachable at all.** Between the hotspot
   going down and the phone falling back to the house WiFi, neither address
   answers. That is normal and lasts 10–20 s. Say so on screen — an unlabelled
   spinner at that exact moment is when people unplug the device.
2. **Probe both `10.42.0.1` and `pilldispenser.local`,** and decide from
   `wifi.mode` in the body, not from which address answered. While the hotspot is
   up its own DNS resolves *every* name to the device, so a successful
   `pilldispenser.local` probe there proves nothing.
3. **`hotspotBack` is the field to branch on** when `state` is `failed`. `true`
   means "the setup network is back — try a different password right here".
   `false` means the rollback failed too and the device needs a power cycle.
   Getting this wrong is the difference between finishing setup and giving up.
4. **`state: "recovering"`** is the device retrying a network it already knows,
   unprompted, because it was sitting on its own hotspot. Nobody asked for it —
   do not show it as a failure if it comes to nothing.

`{"hidden": true}` on the connect call is for a network that does not broadcast
its name; without it NetworkManager scans, does not find the name, and reports
that no such network exists. `POST /api/wifi/hotspot` raises the setup network on
demand, which is the only way back into a device whose network nobody controls any
more.

---

## 6. The LAN API has no authentication

**Anything on the home network can post a schedule or drop a tray.** That
matches the Shaztech firmware and what `dispenser.ts` expects, and adding a
token would have broken the compatibility the rest of this document is about —
so it was the wrong call to make unilaterally.

It is a real gap for a device that dispenses medication, and it is worth a
decision rather than a default.

The `Host` check in §3 narrows it but does not close it: it stops a *remote* page
from reaching in through a name it controls, which was the worse half of the
problem. It does nothing about something already on the WiFi that addresses the
device by its real name — which is the half that needs the token below.

Note that this now also means **`GET /api/identity` serves the cloud pairing
code to anything on the LAN**, and that code is enough to pair with the device
(see below). That is deliberate and consistent — `/label` has always served the
WiFi passphrase the same way, and it is what lets the app pair a device
automatically when it happens to be on the same WiFi, with nobody reading a
sticker. But it is the same gap, now with a slightly longer reach: previously
somebody on your WiFi could change your schedule while they were on it, and now
they could keep doing so afterwards.

If we close it, the cheapest version that does not break the app is a
device-specific token from the same derivation, printed on the same label, sent
as a query parameter — which the `/save` link approach carries as easily as
anything else. Half a day, plus a decision about devices already deployed.

---

## 7. Cloud sync — the path that does not need the same WiFi

Since 2026-07-29 the dispenser holds one outbound connection to a **relay**
(`pill_dispenser/cloud_relay/`), so the app can reach it from anywhere. This
solves the three things sections 1–3 have to work around:

| | LAN path | cloud path |
|---|---|---|
| Mixed content | blocks `fetch`; you use a link | not an issue — the relay is HTTPS |
| Where the phone must be | on the same WiFi | anywhere |
| Days of the week, course length | only via `/api/schedule`, which you cannot call | carried, always |

The device is still LAN-only until a relay is configured, and everything in
sections 1–6 keeps working either way.

### What the app does

Three things, once you have the pairing code:

```ts
// 1. derive — the same three values the device derives, from the printed code
const salt = new TextEncoder().encode('snapcare/pill-dispenser/cloud/v1');
async function hkdf(claim: string, info: string, bytes: number) {
  const ikm = await crypto.subtle.importKey('raw', new TextEncoder().encode(claim),
                                            'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode(info) },
    ikm, bytes * 8));
}
const deviceId = b64url(await hkdf(claim, 'device-id', 16));   // the address
const token    = b64url(await hkdf(claim, 'access', 32));      // the bearer token
const boxKey   = await crypto.subtle.importKey('raw',
  await hkdf(claim, 'box', 32), 'AES-GCM', false, ['encrypt', 'decrypt']);

// 2. seal — AAD binds it to this device, this direction and this revision
const aad = new TextEncoder().encode(`snapcare/relay/v1|${deviceId}|desired|${rev}`);
const iv = crypto.getRandomValues(new Uint8Array(12));
const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad },
  boxKey, new TextEncoder().encode(JSON.stringify({ payload: encodeWeekly(slots) })));

// 3. publish
await fetch(`${RELAY}/v1/devices/${deviceId}/desired`, {
  method: 'PUT',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ envelope: { v: 1, rev, alg: 'A256GCM',
                                     iv: b64url(iv), ct: b64url(new Uint8Array(ct)) } }),
});
```

`claim` is normalised first: upper-cased, with anything outside
`23456789ABCDEFGHJKMNPQRSTUVWXYZ` discarded, and it must be exactly ten
characters — **not** padded or truncated to fit. A code with a character missing
derives a perfectly valid key for a mailbox that does not exist, and the only
symptom is a dispenser that appears to have been unplugged.

`b64url` is base64url with the padding stripped, on both fields. Python is
strict about padding where `atob` is not, so getting this wrong fails at the
device end on about one message in four.

**There is a working reference implementation of all of this**, about four
hundred readable lines, at `cloud_relay/snapcare_relay/web/lab.html`. It is
served at `/lab` on any running relay. Copy from it rather than from the sketch
above.

### Reading what the device says

```ts
const res = await fetch(
  `${RELAY}/v1/devices/${deviceId}/reported?since=${rev}&wait=50`,
  { headers: { 'Authorization': `Bearer ${token}` } });
```

`204` means nothing new — reconnect. `200` carries an envelope you open with
`slot = 'reported'`, giving the device's full `/api/status`, its recent dose
events, and when it last said anything. **Use that timestamp rather than the
word "connected"**: a dispenser whose power has been pulled sends nothing and
otherwise looks identical to a healthy one, and "the dispenser has been
unplugged since Tuesday" is the single most useful thing a carer can be told.

The report also carries where the device is, inside the same sealed envelope —
which is the only reason it is allowed to name somebody's WiFi at all:

```json
"network": { "ssid": "Home", "address": "192.168.1.42",
             "deviceUrl": "http://pilldispenser.local/" }
```

Worth using as a shortcut. Somebody standing in the room next to the dispenser
should not be round-tripping through a data centre to open a tray, and this is
how the app knows the LAN is an option without scanning for it. Mixed content
still applies to reaching it — §3 — so it is a link, not a `fetch`.

**Do not treat a gap in the reports as an offline device without checking the
clock.** After a WiFi outage the device resets its retry backoff the instant the
network returns and republishes immediately, so a recovered dispenser reappears
within a second or two rather than at the end of a five-minute retry interval. If
it is genuinely quiet for longer than `CLOUD_HEARTBEAT_S` plus a margin, it is
actually down.

The `wait=50` is a long poll, which is what makes an edit arrive in about a
second. Treat a dropped connection as normal and reconnect with backoff — it
happens whenever a phone locks its screen.

### Getting the pairing code

Three ways, in order of how little the person has to do:

1. **Scan the label.** Its fourth QR is `https://<relay>/pair#CODE`. The code is
   in the **fragment**, which browsers never send to the server — so it reaches
   the page's JavaScript and neither the relay, its access log, nor any proxy.
   Keep that property if you build your own pairing page.
2. **Ask the device**, when the phone is on the same WiFi:
   `GET http://pilldispenser.local/api/identity` → `{ claim, deviceId, pairQr }`.
   No typing at all. (Same-origin/mixed-content rules still apply — this is the
   HTTP device, so it needs the link trick or a local origin.)
3. **Type it.** Ten characters, `6V9F5-9QK67`, printed on the label. The
   alphabet has no O, I, L, 0 or 1 in it for exactly this reason.

### What the relay can and cannot see

It stores ciphertext, revisions, sizes and timestamps. It is given the device id
and the access token — different HKDF branches — and never the box key, so it
cannot read a schedule or a dose log. This is the same posture as
`/api/store`: **the server is not trusted with health data.**

Storing the claim code on the phone is therefore the same decision you already
made for the device key in `deviceKey.ts`, and it deserves the same care. The
lab puts it in `localStorage`, which is right for a debugging tool on a laptop
and probably not what the production app should do — it is a credential that
grants schedule-writing access to a medical device, and unlike an ECDSA key in
IndexedDB it is extractable by anything that can run script on your origin.

### One thing to get right

**Revisions must increase, and you do not own the counter.** Read the current
one from `GET /v1/devices/<id>` before writing, and handle `409` by re-reading
rather than retrying blind. Two phones editing the same prescription is the
case this exists for; the loser is holding a stale copy and should be shown the
newer one, not allowed to overwrite it.

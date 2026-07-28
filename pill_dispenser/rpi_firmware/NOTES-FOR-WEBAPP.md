# Notes for whoever builds the web app

The hardware moved to a Raspberry Pi 3B. This is what that changes for the app,
what it does not, and the handful of things worth knowing before you write
against it.

**The short version: nothing in `lib/hardware/` has to change today.**
`dispenser.ts` works against the new firmware as-is. Everything below is about
what you *gain* if you want it.

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
| `GET /api/wifi/scan` · `POST /api/wifi/connect` | provisioning |
| `GET /api/identity` | SSID and the QR payloads, for a setup screen |

Errors are `{"ok": false, "error": "..."}` with a 4xx. Nothing throws; a
malformed payload is a 400, never a 500.

`Access-Control-Allow-Origin: *` is set on `/api/*`, so you can develop against
a real device from `http://localhost:3000`. It does not widen access — anything
on the LAN could already reach it — it only lets a browser page read the answer.

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

---

## 6. One thing I did not do

**There is no authentication.** Anything on the home network can post a schedule
or drop a tray. That matches the Shaztech firmware and what `dispenser.ts`
expects, and adding a token would have broken the compatibility the rest of this
document is about — so it was the wrong call to make unilaterally.

It is a real gap for a device that dispenses medication, and it is worth a
decision rather than a default. If we want it, the cheapest version that does not
break the app is a device-specific token baked into the same derivation as the
WiFi identity, printed on the same label, sent as a query parameter — which the
`/save` link approach can carry as easily as anything else. Happy to build it;
it needs about half a day and a decision about what happens to a device that is
already deployed.

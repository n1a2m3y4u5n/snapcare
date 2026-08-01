# SnapCare pill dispenser

The hardware companion. A tray with eight compartments that opens the right one
at the right time, tells the person with a colour and a sound, and reports back
to the phone — without a network, an account, or a word of text.

```
  paper sheet ──photograph──► form_sheet_parser ──┐
                                                  ├──► SC1 payload ──┐
  the app ────────────────────────────────────────┘                  │
      │                                                              │
      │  cloud relay ── one connection the device holds open ────────┤
      │                                                              ▼
      │                                                          dispenser
      │                                                              │
  phone camera ◄──────────────── QR on a 128x64 OLED ◄───────────────┘
                                   "dose taken" / "dose missed"
```

Three ways in, and the same protocol on every arrow.

## Three paths in, because not everyone has the app — or the same WiFi

A caregiver filling trays for someone else may not be the person the app is set
up for. So the schedule can arrive either from the app or from a **paper form**:
mark the compartment, the days, the duration and the hour, photograph the sheet,
and the reader turns it into the same payload the app would have sent.

Nothing about that path requires reading — the marks are boxes — and nothing
about it requires the network.

The third path is for the situation the first two quietly assume away: the
person managing the prescription is often **not in the house.** The carer is at
work, the clinic is across town, and a dose time changes on a Tuesday
afternoon. So the Pi build holds one outbound connection to a small relay
(`cloud_relay/`), and a schedule edited in the app arrives in about a second
from anywhere. The relay is a mailbox that cannot read its own post — everything
crossing it is sealed with a key derived from the code printed on the device —
and it is an extra way in rather than a dependency: with no relay configured,
or with the internet down, the dispenser runs the schedule cached on its SD
card against a battery-backed clock, exactly as before.

## Layout

```
pill_dispenser/
  form_sheet_parser/       photograph of a paper sheet -> schedule
    form_sheet_parser.py     the optical mark reader
    schedule.py              sheets -> SC1 payloads
    synth.py                 manufactures test photographs
    cli.py                   command line
    form_sheet/              the printable sheet, its ArUco markers, the bubble map
    tests/                   75 tests, no printer required
  firmware/                the device itself — see firmware/README.md
    snapcare_dispenser/      SC1, scheduler, servos, WiFi, cloud link, web server
    service/                 systemd unit + install.sh
    tests/                   `make` — no board required
    docs/assembly-guide.pdf  building the machine, stage by stage
  cloud_relay/             the mailbox between the app and the device
    snapcare_relay/          six endpoints, a long poll, and no ability to read
    snapcare_relay/web/      the demo app — pair, publish, watch, inject faults
    tests/                   `make` — 63 tests, no container, no account
    Dockerfile               one layer, nothing to install
```

## One machine, three ways in

`firmware/` is a Raspberry Pi 3B+ driving eight servos, an LED ring, a piezo and
a DS1302 clock chip. There is no camera and no display: the link to the phone is
the Pi's own WiFi. It raises a setup hotspot with a captive portal, joins the
house network, and answers on `pilldispenser.local`. Getting a dispenser onto
WiFi is one QR scan from a printed label — and that label never changes, because
the hotspot's name and password are derived from the SoC serial number rather
than generated.

A schedule can arrive three ways, and all three land on the same SC1 grammar:
from the app over the LAN, from the app through `cloud_relay/` when nobody is
standing next to the device, or off a photographed paper form sheet when there
is no network at all.

A Pi has no clock of its own — `fake-hwclock` restores a stale time confidently,
which is worse than none — so this build fits a DS1302 with a coin cell. Three
things can vouch for the time: the RTC, NTP, or a `SC1*C*` code from the phone.
Until one of them does, nothing is dispensed.

[`firmware/docs/assembly-guide.pdf`](firmware/docs/assembly-guide.pdf) builds the
machine from a bare Pi, one subsystem per stage, with the command that proves
each one.

### Trying the whole thing without hardware

```bash
make demo        # a relay and a dispenser on this machine, wired together
```

Then open `http://localhost:8088/lab`, pair with the code it prints, and edit
the schedule — the firmware applies it while you watch, with every request and
its plaintext in the traffic log. The servos are mocked; everything else is the
real firmware, the real relay and the real protocol.

## Reading a sheet

```bash
python -m form_sheet_parser.cli sheet1.jpg sheet2.jpg
python -m form_sheet_parser.cli sheets/*.jpg --json
python -m form_sheet_parser.cli sheet.jpg --debug annotated.png
python -m form_sheet_parser.cli sheets/*.jpg --qr schedule.png   # show this to the device
```

One photograph is one compartment; give it the stack and it merges them. When a
sheet reads wrongly the question is always "did the page rectify badly, or did
the pen miss the box" — `--debug` answers it in one picture, drawing the bubble
map over the rectified page with the score measured at each position.

### How it reads

Four ArUco markers pin the page corners, so the photograph can be taken by hand
at an angle and still rectify to a fixed 1000×1000 grid where every bubble has a
known coordinate. Then each bubble's ink is measured.

Two things about that measurement are worth knowing, because both were bugs.

**An empty bubble was not empty.** The sampling window was 16×32 canonical
pixels — wider than the printed box is tall — so it straddled the outline, and
that outline is ink. An untouched bubble measured 0.257 against a threshold of
0.35. The cutoff was not really asking "is this filled"; it was asking "is this
darker than the printed outline was on the day we calibrated", with 0.09 of
headroom for a change of printer, paper or light.

Two fixes, and the order matters. The window now sits *inside* the outline
(12×18, about 5 px of margin all round, against a worst-case 3.5 px error in
the hand-clicked coordinates), so it measures the mark rather than the print.
And each sheet still takes a low percentile of its own 44 bubbles as its own
idea of unmarked, which costs nothing and absorbs a heavier print or a greyer
scan. An untouched bubble now reads 0.04 and a solid mark 0.81.

That is not a cosmetic margin. It is the difference between needing 85% of the
box filled and needing 40% — see the table below.

**A covered corner must not be guessed at.** A hand steadying the page hides a
marker constantly. Inferring the fourth corner by assuming a parallelogram is
wrong under perspective — and wrong silently: it slid the whole bubble map by
about 10 px, more than a bubble's half-width, so marks landed in neighbouring
boxes and the sheet read as a different, entirely plausible schedule. Every
corner of every marker now feeds a single homography, so three markers give
twelve correspondences under the right projective model. The map moves 0.5 px,
and a covered corner costs nothing.

Marker geometry is derived from the millimetres in `.form_sheet.tex`, not
measured off an image, and a test re-derives it from the PDF at 600 dpi so that
editing the LaTeX cannot silently shift every coordinate.

### Where it stops working

Measured, not assumed. `python -m form_sheet_parser.synth --sweep` degrades one
thing at a time until reading breaks:

| condition | last setting that read every sheet correctly |
|---|---|
| defocus | σ = 2.0 px |
| perspective | 0.18 of the page |
| sensor noise | σ = 32 |
| shadow across the page | 90% falloff |
| underexposure | 0.25× |
| JPEG quality | 8 |
| mark coverage | 0.4 of the box |

Lighting, noise and compression are essentially non-issues — the sheet reads in
conditions where a person would struggle to see it. The one real limit is
camera shake.

Mark coverage used to be the other one, at 0.85, and sizing the sampling window
to fit inside the printed outline moved it to 0.4. That is the difference
between a sheet that has to be filled in properly and one that tolerates the
way people actually fill in forms.

Past those limits the reader **refuses rather than guesses**. Blur first stops
the markers being detectable, so the failure is "could not locate the sheet",
not a confident misreading; a faint mark is reported as borderline; two boxes
filled in a pick-one group is "two boxes filled", never whichever the pen
covered more of. A named problem sends the caregiver back to the sheet, which
is recoverable. A wrong schedule reaching a tray of medication is not.

### Testing without a printer

`synth.py` renders the real sheet PDF, marks it the way a pen does — off-centre,
oval, not quite reaching the outline, gone over twice — and then puts it through
what a handheld phone does: perspective, a lighting gradient, defocus, sensor
noise and JPEG. The correct answer is known exactly, so the 75 tests assert on
the reading itself.

```bash
make            # both suites: the firmware's and the reader's
make python     # just this half
make sweep      # re-measure the table above
```

It renders from the **PDF** rather than the preview PNG for a reason: at 420 px
each marker is 18 pixels across, and anti-aliasing pulls its detected corners
inward enough to model a marker 2% smaller than the printed one. That is
invisible while all four markers are present and becomes a 10 px shift the
moment one is covered. Testing against the preview would have measured the
preview.

## What the sheet cannot say to the app

The sheet captures four things: compartment, days of the week, duration, hour.
The app's `SC1*S*` message carries only compartments and times — there is no
field for which days, and none for how long. A sheet marked Mon/Wed/Fri for 30
days encodes to the same `S` payload as one marked every day forever.

Flattening that silently would be the worst kind of bug: the schedule would look
right and dispense on four days nobody asked for. So both are produced and the
caller is told which is which.

```
SC1*S*1:0800/3:1900                    app-compatible, exact only if all seven days
SC1*W*1:0800-127-030/3:1900-021-000    lossless: day mask and course length kept
SC1*C*202607251930*5                   wall-clock time, to set the device's RTC
```

`SC1*W*` is safe to show to an app build that predates it: `messageKind` returns
null for a kind letter it does not know and `decodeSchedule` refuses anything
whose second field is not `S`, so neither throws — an older build simply does
not recognise the code. The firmware here understands both.

Capacity is not the constraint in this direction. The 20-character ceiling in
the protocol is the *device's* screen; going the other way the phone's display
is large and the limit is the device camera, which reads 395 characters at
640×480. A full eight-compartment weekly plan is about 205.

### If the app wants to speak it

`lib/hardware/protocol.ts` is not ours to edit, so this is the shape the change
would take. Two additions, no modifications — nothing existing has to move, and
`SC1*S*` keeps behaving exactly as it does today.

```ts
// messageKind gains one case:
return p[1] === 'S' ? 'schedule'
     : p[1] === 'W' ? 'weekly'
     : p[1] === 'E' ? 'event'
     : p[1] === 'C' ? 'clock' : null;

export interface WeeklySlot extends SlotSchedule {
  days: number;          // bitmask, bit 0 = Monday
  durationDays: number;  // 0 = ongoing
}

// SC1*W*1:0800.2000-127-030/3:1900-021-000
//   per slot: times, then a 3-digit day mask, then 3-digit duration in days
export function encodeWeekly(slots: WeeklySlot[]): string
export function decodeWeekly(payload: string): WeeklySlot[] | null
```

Fixed field widths so 8-bit firmware can read them with pointer arithmetic
instead of a tokenizer, and every character stays inside the QR alphanumeric
set — straying out of it doubles the code's size and is what stops it fitting.

The reference implementations to match are `schedule.py` here and `sc1.py` in
the firmware, and the vectors all three suites assert on are the contract.
`decodeWeekly` should return `null` rather than throwing on anything malformed,
for the same reason `decodeSchedule` does: the camera reads whatever QR happens
to be in frame, and a parser that throws stops the scan loop on a stranger's
code.

## The firmware

See [`firmware/README.md`](firmware/README.md) for wiring, the install, and the
details that cost boards rather than time.

```bash
make -C firmware                # the whole suite, no board
```

The protocol and the scheduler import nothing from the hardware modules and run
on any machine with Python. That matters most for the scheduler, because
scheduling is the part that fails invisibly: a servo that does not move is
obvious, a compartment that opens twice is not.

## The whole chain, end to end

```bash
python -m form_sheet_parser.cli sheet.jpg --emit weekly \
  | grep SC1 \
  | xargs -I{} curl -fsS -X POST http://pilldispenser.local/api/schedule \
      -H 'Content-Type: application/json' -d '{"payload":"{}"}'
```

A photograph goes through the Python reader and straight into the running
device, over the same endpoint the app uses. Three implementations of SC1 — TypeScript in the
app, Python here, and Python again in `firmware/` — share no code, so the common
vectors in their test suites are the only thing keeping them speaking the same
language. A mismatch has no symptom on hardware except a device that stops
listening.

The cloud path has the same problem in a second place, and the same answer: the
crypto behind pairing exists twice, in Python and in the browser's JavaScript.
The firmware's suite checks its half against RFC 5869's own vectors, and the
demo app checks the other half in the browser at load, by opening an envelope
Python sealed. A disagreement there is a pairing that never works, with no error
at either end — so neither side is left to assume.

And onto real hardware without the app at all:

```bash
python -m form_sheet_parser.cli --clock-qr clock.png        # set the device's clock
python -m form_sheet_parser.cli sheets/*.jpg --qr schedule.png
```

Print them or put them on a screen, and post them to the device's `/api/schedule`
— or hand the file to whoever is standing at the machine.

The clock code is not optional the first time. The DS1302 keeps time across a
power cut on a coin cell, but that cell dies eventually — and a clock that has
lost power does not report *no* time, it reports a wrong one, confidently. A
tray acting on a wrong clock opens compartments at the wrong hours and looks
perfectly healthy doing it. So the firmware treats an unvouched-for clock as no
clock and dispenses nothing until a `SC1*C*` code sets it. A tray that stays
shut is a problem someone notices. Without this, bringing up the device needs the phone app, the app needs
a schedule, and the schedule is the thing being brought up. The code is decoded
again before the file is written, because an unreadable QR written without
complaint is the failure that costs an afternoon at the bench. A full
eight-compartment thrice-daily plan comes to 205 characters — version 10 holds
395 at the camera's 640×480.

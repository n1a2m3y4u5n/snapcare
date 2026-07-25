# SnapCare pill dispenser

The hardware companion. A tray with eight compartments that opens the right one
at the right time, tells the person with a colour and a sound, and reports back
to the phone — without a network, an account, or a word of text.

```
  paper sheet ──photograph──► form_sheet_parser ──┐
                                                  ├──► SC1 payload ──QR──► dispenser
  the app ────────────────────────────────────────┘                          │
                                                                             │
  phone camera ◄──────────────── QR on a 128x64 OLED ◄───────────────────────┘
                                   "dose taken" / "dose missed"
```

Two ways in, one way out, and the same protocol on every arrow.

## Two paths in, because not everyone has the app

A caregiver filling trays for someone else may not be the person the app is set
up for. So the schedule can arrive either from the app or from a **paper form**:
mark the compartment, the days, the duration and the hour, photograph the sheet,
and the reader turns it into the same payload the app would have sent.

Nothing about that path requires reading — the marks are boxes — and nothing
about it requires the network.

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
  firmware/                see firmware/README.md
    libraries/SC1/           protocol + scheduler, host-testable
    arduino/snapcare_tray/         Uno/Nano: servos, clock, button, ring
    esp32/snapcare_optical_head/   ESP32-CAM: camera in, OLED out
    test/                    `make` — ~24,000 assertions, no board
```

## Reading a sheet

```bash
python -m form_sheet_parser.cli sheet1.jpg sheet2.jpg
python -m form_sheet_parser.cli sheets/*.jpg --json
python -m form_sheet_parser.cli sheet.jpg --debug annotated.png
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
```

`SC1*W*` is safe to show to an app build that predates it: `messageKind` returns
null for a kind letter it does not know and `decodeSchedule` refuses anything
whose second field is not `S`, so neither throws — an older build simply does
not recognise the code. The firmware here understands both.

Capacity is not the constraint in this direction. The 20-character ceiling in
the protocol is the *device's* screen; going the other way the phone's display
is large and the limit is the device camera, which reads 395 characters at
640×480. A full eight-compartment weekly plan is about 190.

## The firmware

See [`firmware/README.md`](firmware/README.md) for wiring, flashing, and the two
details that cost boards rather than time.

```bash
make -C firmware/test          # ~24,000 assertions and both sketches, no board
```

The protocol and the scheduler are free of `<Arduino.h>` and build with a
desktop compiler. That matters most for the scheduler, because scheduling is the
part that fails invisibly: a servo that does not move is obvious, a compartment
that opens twice is not.

The sketches are compiled too, against a stand-in Arduino API — a type check,
not a simulation, but enough that nobody has to own the hardware to find out
whether the code is valid.

## The whole chain, end to end

```bash
python -m form_sheet_parser.cli sheet.jpg --emit weekly \
  | grep SC1 | firmware/test/build/sc1_decode
```

A photograph goes through the Python reader and out through the exact C++ that
runs on the dispenser. Three implementations of SC1 — TypeScript in the app,
Python here, C++ on the device — share no code, so the common vectors in their
three test suites are the only thing keeping them speaking the same language.
A mismatch has no symptom on hardware except a device that stops listening.

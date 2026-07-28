# Dispenser firmware

Two boards, two sketches, and one protocol shared with the phone app and the
paper-sheet reader.

```
   phone screen                                        the person
        │  QR                                               ▲
        ▼                                                   │ one colour,
┌──────────────────┐   SC1 text over serial   ┌──────────────┴───┐ one sound
│  ESP32-CAM       │ ───────────────────────► │  Arduino Uno/Nano│
│  optical head    │ ◄─────────────────────── │  tray controller │
│  camera + OLED   │                          │  8 servos, RTC   │
└──────────────────┘                          └──────────────────┘
        ▲  QR                                          │
        │                                              ▼
   phone camera                                   eight compartments
```

The serial link between the boards carries **exactly the bytes the QR codes
carry**. There is no second protocol to keep in step, and the tray behaves the
same whether a schedule arrived from a phone through the camera or was pasted
into a serial monitor from a laptop.

That split is deliberate. The ESP32-CAM holds no schedule, keeps no clock and
decides nothing; it is a modem. Everything that can hurt someone — when a
compartment opens, whether a dose was already given, what happens after a power
cut — lives on one board, in code that runs on a laptop under test.

## Layout

```
firmware/
  libraries/SC1/          protocol + scheduler, no Arduino.h, host-testable
    src/SC1.h .cpp        the wire format, shared with protocol.ts and schedule.py
    src/Scheduler.h .cpp  when a compartment is due
  arduino/snapcare_tray/            Uno/Nano: servos, RTC, button, ring
  esp32/snapcare_optical_head/      ESP32-CAM: camera in, OLED out
  test/                   host tests: `make`
```

## Test it before you wire anything

```bash
make -C pill_dispenser/firmware/test
```

No board, no cable, about a second. Three things happen.

**The protocol**, against ~23,000 assertions including every vector that
`lib/hardware/protocol.test.ts` and `form_sheet_parser/tests/test_schedule.py`
assert on. The three implementations share no code, so those common vectors are
the only thing keeping them speaking the same language — and a mismatch has no
symptom on hardware except a device that stops listening.

**The scheduler**, which is the part worth reading. Its failures are invisible
in a demo and expensive in a house: a dose given twice, a course that never
ends, doses coming back out of order after a gap, a servo that jammed leaving
the dose owed rather than silently delivered, and a device unplugged all day
that must not dispense breakfast, lunch and dinner into one hand when it is
plugged back in.

**Both sketches compile**, against a stand-in Arduino API in
`test/arduino_shim/`. This is a syntax and type check and nothing more — no
timing, no interrupts, no servo, and `millis()` never advances. It is still
most of what goes wrong in code that cannot be compiled without the board in
front of you, and on this project the board is usually in a different country
from whoever is editing. It caught a signed/unsigned comparison in each sketch
the first time it ran.

`make sc1`, `make scheduler` and `make sketches` run the three separately.

## Building

Copy or symlink `firmware/libraries/SC1` into your Arduino `libraries/` folder:

```bash
ln -s "$PWD/pill_dispenser/firmware/libraries/SC1" ~/Arduino/libraries/SC1
```

| | tray controller | optical head |
|---|---|---|
| Board | Arduino Uno or Nano (ATmega328P) | AI Thinker ESP32-CAM |
| Sketch | `arduino/snapcare_tray` | `esp32/snapcare_optical_head` |
| Libraries | Servo, RTClib, Adafruit_NeoPixel | ESP32QRCodeReader, QRCode (ricmoo), Adafruit_SSD1306, Adafruit_GFX |
| Notes | — | Partition scheme **Huge APP**; PSRAM enabled |

The ESP32-CAM has no USB. Flash it with an FTDI adapter at 3.3V logic, GPIO0
tied to GND to enter the bootloader, and remove that jumper before running.

## Wiring — tray controller

Servos are on consecutive pins so the compartment number and the pin number
stay easy to hold in your head: compartment *n* is D(*n*+1).

| Signal | Pin | Notes |
|---|---|---|
| Servo 1..8 | D2 … D9 | signal wire only — **not** power |
| Confirm button | D10 | other side to GND; internal pull-up, no resistor |
| Piezo buzzer | D11 | through 100 Ω |
| WS2812 ring data | D12 | through 330 Ω, close to the ring |
| DS3231 SDA / SCL | A4 / A5 | the module's own pull-ups are enough |
| Link RX ← ESP32 | A0 | from ESP32 GPIO12 |
| Link TX → ESP32 | A1 | **through a divider — see below** |

### Powering the servos

**Do not run the servos from the Arduino's 5V pin.** One SG90 stalls at around
700 mA; the on-board regulator is good for a few hundred milliamps total, and
the failure mode is not a blown regulator but a brown-out that resets the board
*while a compartment is open*.

Use a separate 5V supply rated 2 A or better:

```
   5V supply ──┬── servo V+  (all eight)
               └── 1000µF across the rail, close to the servos
   supply GND ─┬── servo GND (all eight)
               └── Arduino GND      ← the grounds must be common
   Arduino D2..D9 ── servo signal
```

The common ground is what makes the signal mean anything; without it the servos
twitch or ignore commands. The bulk capacitor absorbs the current step when a
servo starts moving, which is what otherwise dips the rail far enough to reset
the microcontroller.

Only one servo is ever driven at a time, and the sketch attaches it only for
the moment it moves — so the tray draws a fraction of what eight continuously
held servos would, runs silent between doses, and does not fight a knock.

### The level shift on A1

The ATmega runs at 5 V, the ESP32 at 3.3 V, and the ESP32's pins are **not**
5 V tolerant. The Arduino's transmit line needs dividing:

```
  Arduino A1 ──[ 1kΩ ]──┬── ESP32 GPIO13
                        │
                     [ 2kΩ ]
                        │
                       GND
```

The other direction needs nothing: the ESP32's 3.3 V output clears the
ATmega's 3.0 V input threshold.

## Wiring — optical head

| Signal | ESP32-CAM pin | Notes |
|---|---|---|
| OLED SDA / SCL | GPIO14 / GPIO15 | SSD1306 at 0x3C |
| Link TX → Arduino | GPIO12 | to Arduino A0 |
| Link RX ← Arduino | GPIO13 | from Arduino A1, through the divider |
| 5V, GND | 5V, GND | 500 mA while the camera streams |

**GPIO12 must be this board's output, never its input.** It is a strapping pin
(MTDI): held high at reset it selects a 1.8 V flash voltage and the module does
not boot. An idle UART line sits high, so wiring the Arduino's transmitter to
GPIO12 would brick the boot every time both boards powered up together — an
intermittent-looking fault with a completely deterministic cause. GPIO13 has no
such constraint, which is why the directions are assigned this way round.

GPIO14/15 are free because the SD card is unused. GPIO15 is also a strapping
pin, but pulling it high only silences the boot log, which is harmless.

## Using it without the optical head

The tray controller is a complete device on its own. Open the serial monitor at
9600 baud and paste a schedule:

```
SC1*W*1:0800.2000-127-030/3:1900-021-000
```

Compartment 1 opens at 08:00 and 20:00 every day for 30 days; compartment 3
opens at 19:00 on Monday, Wednesday and Friday, indefinitely. The board echoes
what it parsed, stores it in EEPROM so it survives a power cut, and prints each
dose event in the same form the OLED would have drawn:

```
SC1*E*1*0800*T*07
```

If the clock has lost power the board says so and dispenses nothing until it is
set. Paste the time in the same way, or show it as a code:

```
SC1*C*202607251930*5          2026-07-25 19:30, Saturday (0 = Monday)
```

`python -m form_sheet_parser.cli --clock-qr clock.png` prints one from the
computer's own clock.

`python -m form_sheet_parser.cli sheet.jpg --emit weekly` produces that first
line from a photograph of a paper sheet, so a schedule can go from paper to
hardware without the app in between.

## What the person sees

Nothing to read — that is the point of the whole project.

| | |
|---|---|
| **green ring, repeating chirp** | a dose is in the cup; press the button |
| **blue ring** | button pressed, recorded as taken |
| **amber ring** | the dose went untaken, or its window closed |
| **violet ring** | a new schedule was accepted |

The OLED on the other board faces the phone, never the person, and shows only a
machine-readable square.

## Two decisions worth knowing before changing anything

**A dose event must fit in 20 characters.** A 0.96" OLED is 128×64. A QR is
square, so 64 px is the wall: with the required four-module quiet zone at two
pixels per module, only version 1 fits (21 modules → 58 px; three pixels per
module would need 87). Version 1 at ECC-M holds about 20 alphanumeric
characters. `sc1::encodeEvent` returns 0 rather than producing anything longer,
because a truncated QR is not a shorter message — it is an unreadable one, or
worse, a scannable prefix.

The other direction has room: the phone's screen is large and the limit is this
camera, which reads version 10 (395 characters) at 640×480. A full eight-
compartment weekly plan is about 205.

**A dose past its window is reported, never given.** The scheduler dispenses
only within an hour of the scheduled time. Outside it the dose is reported to
the phone as missed and the compartment stays shut. Both halves matter: firing
everything that accumulated during a power cut would be an overdose, and
dropping it silently would hide from a carer that medication was not taken.

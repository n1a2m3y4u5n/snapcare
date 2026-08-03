# Dispenser firmware — Raspberry Pi 3B

One scan to get on the WiFi, one to pair it with the app, a colour and a chirp
when a dose is due, and a schedule that survives both a power cut and the
internet going away.

**Nothing drops until somebody asks for it.** At the scheduled minute the screen
goes green and names the tray, and the buzzer starts; the tray opens when the
screen is touched or a release is tapped in the app. No press inside the grace
window and the tray stays shut, recorded missed.

(One exception, and it is on by default: with `SNAPCARE_TOUCH_DEMO=1` a tap with
no dose due drops a pill anyway, so the machine can be demonstrated. It is
recorded as a manual drop and cannot consume a scheduled dose — see
[demonstration mode](#demonstration-mode-which-is-on-by-default).)

```
   the web app, anywhere                                the person
        │        ▲                                           ▲
        │  https │ a release                   green screen  │  chirp
        ▼        │                               ▲           │  every 20s
   ┌─────────────┴─┐  one outbound connection,   │           │
   │  cloud relay  │◄───── held open ─────┐      │           │
   └───────────────┘                      │      │           │
                                          │      │           │
   phone on the same WiFi                 │      │           │
        │  http://pilldispenser.local     │      │           │
        │  POST /api/release              │      │           │
        ▼                                 ▼      │           │
   ┌─────────────────────────────────────────────┼───────────┼──────┐
   │  Raspberry Pi 3B                            │           │      │
   │    onboard WiFi ── setup hotspot + captive portal       │      │
   │    web server ──── native JSON API + the app's own URLs │      │
   │    cloud link ──── sealed; the relay cannot read it     │      │
   │    scheduler ───── SC1, day masks, course lengths       │      │
   │    store ───────── the schedule, cached on the card     │      │
   │    DS1302 ──────── knows the time after a power cut     │      │
   │    lgpio ───────── GPIO 17 27 22   screen   buzzer 23   │      │
   └───────────────────────┬─────────────────────────────────┴──────┘
                           ▼
            the fitted servos, one stroke each
```

The cloud link is an extra way *in*, never a dependency for the schedule: it is
on the SD card and the RTC knows the time, so a relay that is down, unreachable
or never configured costs nobody a dose *provided the phone can still reach the
device over the LAN*. That is the one thing to keep true — see
[the release paths](#releasing-a-dose) below.

The unit on the bench has **two trays**, but nothing in the firmware says two:
all eight are accepted by default and the pin map already lists them, so adding
a hopper is a plug.

This replaced an earlier two-board Arduino + ESP32-CAM build, which is gone. The
protocol survived it unchanged — the same `SC1` grammar, the same test vectors —
so a schedule from the phone app or from a photographed paper form sheet reaches
this firmware without anything in between being rewritten.

---

## The three things it had to do

### 1. Get onto the WiFi with one scan

The setup code is **printed once and never changes.** That is the constraint the
whole design falls out of.

```
 ┌─ printed on the device ────────────┐
 │  [QR]  join   SnapCare-V5XH        │   1. camera → joins the hotspot
 │  [QR]  open   http://10.42.0.1/    │   2. the setup page opens by itself
 │  [QR]  pair   6V9F5-9QK67          │   3. tap your network, type its password
 └────────────────────────────────────┘   4. scan the third code, once, from anywhere
```

Nobody types an SSID, an IP address or a URL. Nobody installs an app — iOS
Camera and Android both join a network from a `WIFI:` QR natively.

**Why the code can be permanent.** The hotspot's name and password are not
generated at boot, they are *derived* — HMAC-SHA256 over the SoC serial number
in `/proc/cpuinfo`, which is burned into the chip:

```
Serial : 00000000a1b2c3d4   →   SnapCare-V5XH / 3k8krnp8pv8s
```

Same board, same code, byte for byte — across reboots, firmware upgrades, and a
complete reimage of the SD card. Nothing is stored that could be lost. It is
also different on every board, so two dispensers in one house do not collide and
the password is not a number printed in a manual.

`identity.json` in the state directory overrides the derivation, for the one
case it cannot serve: a board dies, is replaced, and the customer still has the
old sticker.

**Why the page opens by itself.** A phone that joins a network immediately
fetches a known URL to check for internet — `captive.apple.com`, a
`generate_204`. One line of dnsmasq config resolves every name to the device:

```
/etc/NetworkManager/dnsmasq-shared.d/snapcare-portal.conf
    address=/#/10.42.0.1
```

so those probes land here, get a redirect instead of what they expected, and the
phone concludes it is behind a captive portal. Without it the phone joins,
reports "no internet", and gives the person no sign of what to do next — which
is why the label carries the setup URL as a second QR.

The redirect is **absolute** — `http://10.42.0.1/setup`, not `/setup` — whenever
the probe arrived under its own hostname. Some phones open the portal sheet at
the probe's origin, and a relative redirect would leave the setup page sitting on
`connectivitycheck.gstatic.com`. Every write it then made would be refused by the
`Host` check below, which is the Join button dead in the flow that matters most.

**What happens after they tap Join.** This is the part a single radio makes
awkward, and it is where the flow used to lose people. A Pi 3B can be the setup
hotspot or it can be on the house network, never both — so *joining is also the
act of hanging up on the phone that asked for it.*

```
  phone ──► POST /api/wifi/connect          hotspot still up
        ◄── 202 Accepted, "Joining Home."   answered first, on purpose
                                    │
        the radio leaves the hotspot ▼      the phone drops off; 10-20 s
                                    │
        ┌───────────────────────────┴───────────────────────────┐
     joined                                                  failed
        │                                                       │
  it is on Home with a lease              the profile is deleted, the setup
  the screen stops saying "cyan"          hotspot is back within seconds, and
  the cloud link is poked                 the reason is recorded against it
        │                                                       │
  phone falls back to home WiFi           phone rejoins SnapCare-V5XH
  → pilldispenser.local                   → the page it re-opens says
                                            "The password was not accepted."
```

Three things fall out of that, and together they are
[`network.py`](snapcare_dispenser/network.py):

- **The answer is sent before the radio moves.** Answering afterwards means
  never answering. The old firmware sent the reply after `nmcli` returned, so it
  never arrived — and the page treated the dropped connection as success. A
  mistyped password was indistinguishable from a finished setup, and the device
  then had no access point for ten minutes.
- **A failed join restores the hotspot immediately,** deletes the poisoned
  profile that would otherwise autoconnect forever with a password already known
  to be wrong, and records why. The page follows the outcome through
  `GET /api/wifi/attempt`, probing both `10.42.0.1` and `pilldispenser.local` and
  reading `wifi.mode` out of the body — while the hotspot is up its own DNS
  resolves *every* name to the device, so the address a probe succeeds on proves
  nothing.
- **"Joined" means a DHCP lease, not an association.** `nmcli` exits 0 for a
  profile with `ipv4.may-fail`, and for a router that completes the handshake and
  then never answers DHCP. A device with no address is not on the network in any
  sense the app can use.

**Nothing gets stranded.** Once the hotspot is up, the device retries the network
it already knows every `HOTSPOT_RETRY_S` — dropping the AP, standing back while
NetworkManager autoconnects, and putting the AP back if that fails. Without it, a
router that took longer to come back after a power cut than the device was
willing to wait left the dispenser on its own hotspot permanently, and a
dispenser in a spare room can sit like that for weeks with nobody noticing that
the app has stopped hearing from it. The retry holds off for `PORTAL_QUIET_S`
after any request to the setup page, so it cannot pull the network out from under
somebody who is halfway through typing a password — and captive-portal probes
deliberately do not count as activity, or a phone that stays joined to the
hotspot would suppress the retry forever.

If a network is one nobody controls any more — a changed password, a moved
house — `POST /api/wifi/hotspot` raises the setup network on demand.

Print it from `http://<device>/label`, or:

```bash
sudo snapcare-dispenser --show-qr      # scannable, in the terminal
sudo snapcare-dispenser --show-label   # the same values as JSON
```

### 2. Manage the pill drop schedule

Eight trays maximum, and **all eight are accepted by default** so that fitting a
fourth hopper needs no config edit. Set `INSTALLED_TRAYS` (or `SNAPCARE_TRAYS`)
to the number really fitted and a schedule naming a tray this machine does not
have is instead refused by name, while somebody
is still looking at the screen that sent it — accepting it would mean a dose
that is scheduled, never dispensed, and reported by nothing, because an absent
servo cannot jam and has no error to raise.

**The pin for each is one dict at the top of
[`config.py`](snapcare_dispenser/config.py), and nothing else in the firmware
names a pin:**

```python
TRAY_GPIO = {
    1: 17,  2: 27,  3: 22,  4: 5,
    5: 6,   6: 13,  7: 19,  8: 26,
}
```

BCM numbering. Change a line and the schedule, the API, the web page and the
paper form sheet all follow. It can also be patched without editing the file,
which is what a bench setup should do:

```bash
SNAPCARE_TRAY_GPIO="3=21" python3 -m snapcare_dispenser   # move one servo
SNAPCARE_TRAYS=3         python3 -m snapcare_dispenser   # refuse trays 4-8

# On a commissioned device the installer puts a wrapper on PATH, because
# /opt/snapcare is not on Python's default path and `python3 -m` there answers
# "No module named snapcare_dispenser":
sudo snapcare-dispenser --show-qr
```

Two trays on one pin, a tray outside 1–8, or a GPIO that does not exist on a 3B
are all refused at startup. Sharing a pin would dispense the right number of
pills from the wrong compartment, and nobody notices that until the wrong
medication has been taken for a week.

**One drop** is out and back. The tray rests at 0°, goes to 180°, waits a second
with the gate open, and comes back — about two seconds in total. The wait is the
part that matters: it gives a pill time to fall through under its own weight
rather than being swept past the opening by a horn already on its way back.

```python
SERVO_MIN_US   = 500    # 0°, the resting position
SERVO_MAX_US   = 2500   # 180°, the far end of the stroke
SERVO_STEP_S   = 1.0    # between one command in the stroke and the next
SERVO_TRAVEL_S = 0.5    # one traverse; the floor for SERVO_STEP_S
SERVO_TRIM     = {}     # {3: (520, 2450)} to trim one tray
```

After the stroke the signal to that pin is **cut**, not held at 0°. A servo still
being told to hold draws current, hums and fights a nudge for the twenty-three
hours until the next dose, to hold a position it is already resting in
mechanically.

Only one servo is ever driven at a time. A stalled SG90 pulls about 700 mA, and
eight starting together is not a blown regulator — it is a brown-out that reboots
the Pi *while a compartment is open*.

#### Releasing a dose

**The schedule decides when a dose *may* be taken. It does not open anything.**
At the scheduled minute the screen goes green and names the tray, the buzzer
starts, and the dose lands on `awaitingRelease` — and stays there until somebody
presses the button or taps release in the app, which is what actually drives the
servo.

```
08:00        due      screen green, "TRAY 2  08:00" + chirp
             │        nothing has left the hopper
             │        the app shows a release button, and pushes a notification
08:00-09:00  │
             ├─ press ─► the tray sweeps, screen blue, logged taken
             │
09:00        └─ no press ► the tray stays shut, screen amber, logged missed
```

The earlier build dropped the pills at 08:00 and asked for a button press
afterwards to say they had been taken. The two facts that produced were "the
servo swept" and "somebody pressed a button", and neither is the fact anybody
wanted: pills fell into a cup whether or not the person was in the house, and
the button could be pressed by a visitor, a cat, or nobody at all while the log
filled with `dispensed, unconfirmed`.

Asking first collapses that into one fact. A dose that came out is a dose
somebody asked for, and a dose nobody asked for is still in the machine where
the next person to look can count it.

**Two paths carry the tap**, and at least one has to work:

| | |
|---|---|
| **LAN** | `POST /api/release` to `pilldispenser.local`. No internet involved, ~50 ms |
| **relay** | the `command` slot, for a phone on cellular or a carer elsewhere |

`--selftest` fails a build that has neither. A machine that cannot be reached
will chirp for an hour and then record a missed dose — safe, and useless.

**A release names the dose it means**, and the device carries it out only if that
exact dose is one it is offering right now. That is what stops a release tapped
at 08:05 and delivered at 3 p.m. — by a relay that was down in between, or a
notification left on a lock screen — from dropping a pill into an empty room.
`Dispenser.release` answers with an empty list instead, which is not an error.

### 3. Keep the schedule in step without anyone being in the house

The first two are enough for a device sitting next to the person who manages
it. They are not enough for the actual situation: the carer is at work, the
clinic is across town, and a prescription changes on a Tuesday afternoon.

So the device holds one **outbound** connection to a relay
([`../cloud_relay/`](../cloud_relay/)) and a schedule edited in the app is
waiting on the other end of it. Outbound because a home router will not forward
a port to a dispenser and should not be asked to.

```
   app ──PUT sealed schedule──►  relay  ◄──GET, held open 50 s── dispenser
                                        ──answered the instant it lands──►
```

**The relay cannot read any of it.** Everything crossing it is AES-256-GCM under
a key both ends derive from the printed pairing code and neither transmits. The
relay is given a different branch of the same derivation — enough to tell one
mailbox from another, useless for opening one:

```
 claim code ──HKDF──► device id      the relay's address for it   (it sees this)
            ──HKDF──► access token   proves the right to it       (it sees this)
            ──HKDF──► box key        opens the schedule           (it never does)
```

The code itself is derived exactly like the WiFi credentials — HMAC over the
SoC serial — so it is printable on the same label that gets glued on once, and
survives a reimage.

**Nothing about this is allowed to reach the trays.** The cloud link runs on its
own threads, catches everything, and applies a schedule through the same method
the LAN API calls. Pull the network out and the device keeps its schedule, keeps
its clock, and keeps dispensing; that is what `store.py` and the RTC were for
in the first place, and cloud sync is not permitted to quietly become the thing
they were protecting against.

Off by default. With no relay configured the firmware behaves exactly as it did
before:

```bash
python3 -m snapcare_dispenser --relay-url https://snapcare-relay.fly.dev
SNAPCARE_RELAY_URL=https://snapcare-relay.fly.dev python3 -m snapcare_dispenser
curl -X POST http://pilldispenser.local/api/cloud -d '{"relayUrl":"https://…"}'
```

Two knobs decide how responsive it is, and they are the same trade-off seen
from either end:

```python
CLOUD_HOLD_S      = 50   # how long the relay holds a poll open
CLOUD_IDLE_POLL_S = 0    # 0 = reconnect at once; 900 = check every 15 minutes
```

At the default an edit arrives in about a second and the relay is never idle,
which on a host that stops idle machines means it never stops — a couple of US
dollars a month. Set `SNAPCARE_CLOUD_IDLE_S=900` and the machine gets to sleep,
at the cost of an edit sitting for up to a quarter of an hour.

This is the one part of the firmware that needs a package: Python has no AES.
If `python3-cryptography` is missing, cloud sync is reported as unavailable at
startup and on the status page, and **the dispenser goes on dispensing** —
handled exactly like a missing panel.

---

## Wiring

The unit on the bench is **two trays**, a screen, a buzzer and an RTC — but
nothing in the firmware says two. All eight trays are accepted by default and
the pin map lists all eight, so fitting another hopper is a plug and nothing
else. `SNAPCARE_TRAYS` narrows it when you would rather a schedule for a tray
this machine lacks be refused than silently never dispensed.

To *build* one rather than look up a pin,
[`docs/assembly-guide.pdf`](docs/assembly-guide.pdf) goes from a bare Pi to a
commissioned machine one subsystem at a time, each stage ending with the command
that proves it. The table below is the reference; that is the procedure. Rebuild
it with `make guide`.


| Signal | Pin | Notes |
|---|---|---|
| Servo 1..3 signal | GPIO **17, 27, 22** | signal wire only — **not** power |
| *(servo 4..8, unfitted)* | *GPIO 5, 6, 13, 19, 26* | reserved in the map |
| Servo V+ / GND | separate 5 V 2 A+ supply | see below |
| Pi GND ↔ supply GND | — | **required**, see below |
| LCD SCK / SDI(MOSI) / LCD_CS | GPIO **11 / 10 / 8** (pins 23, 19, 24) | SPI0 with CE0; fixed by the peripheral |
| LCD_RS / LCD_RST | GPIO **25 / 18** (pins 22, 12) | ordinary outputs; `LCD_RS` is the DC line |
| LCD VCC / LED / GND | see below, 3.3 V, GND | backlight straight to 3V3 |
| SDO(MISO), SD_CS | *nothing* | the panel is written and never read; the card slot is unused |
| Touch CTP_SDA / CTP_SCL | GPIO **2 / 3** (pins 3, 5) | I²C bus 1 — a separate chip on a separate bus |
| Touch CTP_INT | GPIO **4** (pin 7) | finger-down; the kernel driver owns it |
| Touch CTP_RST | GPIO **12** (pin 32) | driven by the driver, or held high by the bootloader |
| Piezo buzzer | GPIO **23** | through 100 Ω |
| Take-dose button | GPIO **24** (pin 18) | optional — the screen is the button on this build |
| DS1302 SCLK / I/O / CE | GPIO **16 / 20 / 21** | bit-banged; pins 36, 38, 40 |
| DS1302 VCC / GND | 3.3 V (pin 17), GND (pin 39) | **not 5 V** — the I/O line drives back |

That is every free pin gone: GPIO 2 and 3 carry the touch controller, and 4 and
12 are its two out-of-band lines. GPIO 7 and 9 stay unused — the panel needs no
second chip select and is never read back.

**GPIO 2 and 3 are not 5 V tolerant.** On a module whose VCC is 5 V the touch
pull-ups can sit on the 5 V rail. Power the module from VCC and GND alone, leave
the other twelve pins in the air, and meter `CTP_SCL` to ground before those two
wires go on the header. Above 3.6 V, they do not.

### Powering the panel, which is where these modules bite

**Check which board you have before you wire VCC.** The 2.8-inch modules come in
two families that look identical and are not:

* a **3.3 V board** — VCC to the Pi's 3V3, logic straight to the controller;
* a **5 V board** — VCC to 5 V, an on-board regulator makes the 3.3 V the
  controller wants, and the logic pins go through a level shifter.

A 5 V board driven from the Pi's 3.3 V logic is the awkward case, and it fails
in the most confusing way available. If the shifter is a 74HC**T**245 it is
fine — those switch at about 2 V. If it is a plain 74HC245 running off 5 V it
needs about 3.5 V to read a logic high, and the Pi puts out 3.3 V: every line
reads low, the panel is never addressed, and **it stays black while the
backlight glows**. Nothing in the firmware can tell that from a working screen,
because there is no MISO to ask with.

The experiment that settles it in thirty seconds: power VCC from 3V3 instead. A
3.3 V board simply works. A 5 V board goes properly dark, because its regulator
is not getting enough to drop — and that is your answer.

If the backlight is dark rather than the picture, the LED pin is the suspect. On
the reference build it is tied to 3V3 and is always on; if yours is wired to a
GPIO, the firmware has to be told or it never drives it:

```bash
SNAPCARE_DISPLAY_BACKLIGHT=12      # BCM pin, in the systemd unit
```

**`--display-test` is the tool for all of this**, and it exists because a
write-only panel cannot be diagnosed by asking the firmware:

```bash
sudo snapcare-dispenser --display-test          # walk it one stage at a time
sudo snapcare-dispenser --display-test --display-hz 8000000    # a slower bus
```

It lights the backlight, floods red then green then blue, draws a windowed
rectangle and finally a real frame, asking after each one what you can actually
see — then says what the first failure means.

### The screen is the button

There is no physical switch on this build. The touch panel on the LCD module is
the control, and **a tap anywhere on the glass** releases whatever dose is
waiting — the same `Dispenser.release()` a button press or an app tap reaches,
so there is one path by which a tray opens and one set of rules around it.

No on-screen buttons, no regions, no calibration. A target somebody has to find
and hit is a target that can be missed, and it would put the one action this
machine performs behind knowing where to aim — on a device built for hands that
shake. Only "the glass was touched" ever reaches the firmware.

The touch controller is a second chip that shares nothing with the panel but the
connector: the LCD is on SPI, the controller is on I²C. It is one of a small
family — FT6206/FT6236 at 0x38, GT911 at 0x5d or 0x14 — and Raspberry Pi OS has
a driver for each, so this is one device-tree line rather than a register map
per part in the firmware.

Which line is right depends on which chip answers, and the bus cannot be asked
until the panel is wired — which is several stages after `install.sh` runs. So
the installer does not guess. With the panel wired:

```bash
sudo snapcare-dispenser --touch-setup
```

It probes the bus, names what it found, writes the matching line, and keeps the
previous `config.txt` beside itself. Run it again after the reboot and it says
whether a driver actually bound.

```
dtoverlay=edt-ft5406                      # FT6206 / FT6236 at 0x38
gpio=12=op,dh                             # ...which has no reset parameter
dtoverlay=goodix,interrupt=4,reset=12     # GT911 at 0x5d or 0x14
```

Until the line is in place the firmware says so at startup and the screen still
shows everything — a tap just does nothing.

**A `dtoverlay=ads7846` line must not be there.** That is the driver for a
resistive controller on SPI, and this module has none. It is not inert: nothing
on an SPI chip select has to acknowledge, so the driver can bind against an
empty bus and publish an *ADS7846 Touchscreen* input device that never reports a
press. `install.sh` removes the line if it finds one, and `find_touch_device`
refuses that name outright rather than ranking it below the real panel — a
phantom that is merely second choice still wins whenever the real one is
missing, which is exactly when somebody is debugging.

If the panel is listed and taps still do nothing, the firmware did not recognise
its name. Point it straight at the node with `SNAPCARE_TOUCH_DEVICE`.

#### Demonstration mode, which is on by default

A tap with **no dose due** drops a pill anyway, cycling through the fitted
trays. That is what makes the machine demonstrable: a device that does nothing
visible when you press it demonstrates badly, and this build is shown far more
often than it is deployed.

**It inverts the rule the rest of this firmware is built on.** The release model
exists because pills nobody asked for are how a double dose happens — nothing
leaves a hopper until a person has been offered it, so a dose that came out is a
dose somebody asked for. With this on, anybody who touches the glass gets a
pill: a visitor, a cleaner, or the person themselves twice because they were not
sure the first press registered.

```bash
SNAPCARE_TOUCH_DEMO=0        # turn it off before the machine goes to anybody
SNAPCARE_TOUCH_DEMO_TRAY=2   # pin one hopper instead of cycling
```

What it does not do is lie. A demonstration drop goes through the same
`drop_now` the bench check uses, so:

* **the scheduler is untouched** — a real dose still comes due at its proper
  minute, and a demonstration at 07:50 cannot swallow the 08:00 dose;
* **it is recorded as `reason: "manual"`**, never as a scheduled dose, so the
  dose log and the carer's app cannot read it as medication taken;
* **it refuses rather than claiming** when no GPIO library is present.

A tap that *does* release a real dose releases that and nothing else — the press
that matters never gives out two pills. All of that is pinned in
`tests/test_demo_drop.py`.

The servo pins avoid every pin that costs hardware on a 3B: GPIO 0/1 are the HAT
ID EEPROM, 2/3 have permanent 1.8 kΩ pull-ups (a servo signal idling high before
the software starts slams the horn to one end at power-on, with a loaded tray on
it), and 14/15 are the serial console — the one way back into a Pi whose network
you have just broken. A test asserts all of that, and that no peripheral shares a
pin with a servo.

Those same pull-ups on 2/3 are what makes them the I²C pair: an open-drain bus
does nothing without a resistor to 3.3 V and the Pi has two soldered on. A
DS3231 build hangs its clock chip there with no resistors of its own. Nothing
else on this machine uses them any more.

**The RTC is on 16/20/21 and deliberately not on 2/3.** Those two pull-ups are
wrong for a bit-banged three-wire chip in both directions: on the bidirectional
I/O line a floating wire reads as a 1, so a lead that has fallen off looks like
valid data, and on the clock line the pull-up holds SCLK high before the pin is
configured — which breaks the chip's requirement that SCLK be low when CE rises.

### The screen needs no package, and no Pillow

One panel: the **ILI9341**, 2.8", 240x320 native and mounted landscape as
320x240. It is written through the kernel's own device nodes with `os.write` and
`fcntl.ioctl`, so `dtparam=spi=on` in config.txt is the entire dependency.
Nothing is pip-installable on Trixie anyway (PEP 668), which is the lesson the
LED ring taught this build the hard way — the installer asked apt for a package
that has never existed, swallowed the failure, and shipped every device dark.

There used to be a second panel, a 128x64 SSD1306 on I²C, and everything that
existed to keep the two in step has gone with it: `Mono1`, the one-bit
treatments that stood in for colour, the probe order, the small-panel layout
machinery. What that bought was a device that could be built two ways; what it
cost was every screen being written for the worse of the two. **The colour is
the message** on a device whose user cannot be assumed to read, and a panel with
one ink could only ever approximate that.

Pillow is absent too, and that is a size decision rather than a principle:
everything drawn here is rectangles, scanline-filled shapes, integer-scaled
1-bit glyphs and two typefaces, which is a few hundred lines of `bytearray`
work. A full frame is about 5 ms of drawing on a laptop against a 38 ms SPI
transfer; the drawing has never been what costs anything.

**The one thing this driver cannot tell you** is whether a screen is there. Four-
line SPI has no MISO, so nothing is ever read back: opening `/dev/spidev0.0`,
claiming DC and RESET and writing the whole initialisation sequence succeeds
exactly as well with nothing on the end of the ribbon. `/api/status` therefore
reports `fitted: true` for "a driver is loaded and has not been dropped", never
for "there is a screen" — and it now carries the panel's error string and a
count of consecutive refused frames beside it, because neither driver *raises*
on a write failure and a ribbon that works loose used to report perfect health
for ever. `--display-test` is the way to settle it with your eyes.

### The frame is three bands

```
┌──────────────────────────────────────────────┐
│ ▮▮ ▮▮ ▮▮ ▮▮ ▮▮ ▮▮ ▮▮              09:41      │  bar    36 px
├──────────────────────────────────────────────┤
│   ███                                        │
│   ███        13:00                           │  hero  148 px
│    3         192.168.1.42                    │
├──────────────────────────────────────────────┤
│   ●      ●      ■      ■                     │  strip  56 px
│ 08:00  13:00  20:00  22:30                   │
└──────────────────────────────────────────────┘
```

**The bar** is seven fixed slots — wifi, relay, clock, tray, power, cell, card —
each an icon with a solid severity shape under it, and the wall clock on the
right. It never reorders, reflows, shrinks or truncates. That is the rule, not
an observation: the status *screen* it replaced sorted faults to the front and
dropped healthy subsystems off the end, so the same machine showed the same
subsystem in three different places on three different days. A row you cannot
learn is a row you have to read.

An empty field draws a dim icon and **no** severity mark. Absence is not a fault
and emphatically not a tick — a machine with no relay configured and no RTC
fitted is a valid build, and three green circles on it would be the bar
inventing health it has not verified.

**The hero** is the one dose that matters, and its large numerals are always a
time. There is no frame where the biggest thing on the panel is not a clock. The
wall clock lives in the bar and the dose lives in the hero, told apart by
position, permanently.

**The strip** is the whole day: one solid colour-coded mark per dose with its
time printed under it, and a white divider showing where you are in it. Taken is
a blue circle, waiting a green circle, missed an amber triangle, still to come a
steel square. A past dose the ledger has no entry for is an *outlined* square and
prints no time — solid means "we know", outline means "we do not", and a
confident false claim about whether a dose was taken is the worst error this
codebase recognises.

**No pictograms inside the shapes.** The old frames drew a hand inside a circle
and a cup inside another; on the actual glass they were read as a face and a
skull. A 16x16 glyph scaled to fit inside a triangle's usable area is a smudge at
any distance worth designing for. The shape is solid now and the numbers beside
it carry what the picture was failing to.

**Colour is never the only channel.** Every severity is a shape as well —
circle safe, triangle caution, octagon will-not-dispense, square not-yet — at
13 px on the bar and 59 px on the hero. Roughly one man in twelve cannot use the
red-green difference, and filled shapes are told apart by mass, which survives
both that and being across the room.

Two things here were measured rather than judged, and both had shipped wrong:

* white on the old due green was **2.25:1**, below even the large-text contrast
  floor, on the single most important frame the product has. The ink is black
  now, at 10.79:1.
* due and missed sat **1.12x** apart in lightness — all but identical in
  greyscale, separated only by a 2 px outline that is below the eye's resolving
  limit at three metres. They are 2.16x apart now, plus solid circle against
  solid triangle. `blocked` no longer shares amber with `missed` either; it has
  its own red.

**Numbers are drawn, not scaled.** `display/numerals.py` builds each digit from
strokes in a unit box and stamps a filled disc along them, the way a marker pen
works — round terminals, round joins, and correct at every size because nothing
is ever scaled. The 5x7 font in `display/font.py` stays for the small text an
SSID and an IP address need. A 65 px clock costs 1.4 ms.

### What the person sees and hears

The colour vocabulary, carried over from the ring unchanged so that somebody who
has used one of these devices understands the other:

| | |
|---|---|
| **green, repeating chirp** | a dose is due; touch the screen, or release it in the app |
| **blue** | released — the pills are in the cup |
| **amber** | the dose went untaken, or its window closed |
| **violet** | a new schedule was accepted |
| **cyan, silent** | waiting to be put on a WiFi network |
| **red** | the machine will not open a tray until somebody fixes something |

Green means "there is a dose you can have"; blue is what follows once somebody
has released it. The distinction is load-bearing on this build, because nothing
leaves the hopper until a person asks — green is an offer, not an announcement.

Red is the newest of them and it exists because amber was doing two jobs. "A
dose was missed" and "this machine has stopped" are the two states the severity
grammar exists to keep apart, and the only thing separating them was a 2 px
outline nobody can resolve across a room. Red for stopped is the road-sign
convention, and the octagon says it again for anybody who cannot use the hue.

**What the screen adds is which tray, what time, and what else today.** A ring on
an eight-hopper machine says "a dose" and leaves the person to work out which
one, and an amber ring says nothing about whether the dose it is mourning was
this morning's or last night's. The hero carries the tray and the hour; the strip
along the bottom carries the whole day, so "did I take the eight o'clock one" is
answered by looking rather than by asking somebody.

**What it must not become is a text display.** The whole device's word inventory
is `SNAPCARE`, `PASSWORD`, an SSID, a passphrase, an IPv4 address and a `DD-MM` —
and every one of those is something a person is about to type or dial, never a
sentence explaining the machine to them. Everything else is a shape, a colour or
a number. A test spies on `font.draw` and fails on any run over sixteen
characters or any alphabetic run over nine, so the rule is enforced rather than
remembered. Anything that wants a sentence belongs in the app, where there is a
reader.

The chirp repeats every `BUZZER_REPEAT_S` (20 s) until the dose is released, the
chime is silenced, or the grace window closes. That pairing is the point rather
than redundancy: a screen alone only works if somebody is looking at it, and on
this build the sound is the *prompt* rather than an announcement — a device that
cannot chirp waits out the hour in silence and records a miss.

Cyan is the one colour that is new in this build, and it is deliberately outside
that vocabulary and deliberately silent. A chirp means "there are pills to be
had"; spending it on a network problem teaches the one person this project is
built around to walk over and find nothing there. It
earns its place because without it a dispenser sitting on its own hotspot waiting
to be configured is indistinguishable from one that is switched off, and the only
cue anybody gets is the app staying empty. A waiting dose always wins the screen
and hands it back afterwards — medication is the job.

Any of these parts can be absent. A missing one is logged at startup and
skipped; the status page reports what is actually fitted rather than pretending.
A dispenser that will not start because its buzzer is unplugged is strictly
worse than a quiet one — the pills are what matter.

**Quiet hours are a palette, not a brightness.** Between 22:00 and 07:00 the
resting frame wears a darker set of colours; it never blanks, because a person
waking at three wondering whether they have a dose due must be able to answer
that by looking rather than by finding something to press. A waiting dose is
never dimmed at any hour, and touching the screen brings the day palette back
for thirty seconds. It is a palette because this build's backlight is tied to
3V3 and there is no pin to dim — the old brightness numbers were being computed
and then thrown away.

### Powering the servos

**Do not run the servos from the Pi's 5 V pin.** A stalled SG90 pulls most of an
amp, and the consequences here are worse than a reset: a Pi that browns out
mid-write corrupts an SD card,
and the file being written is the one that says whether a dose has already been
given.

```
   5V supply 2A+ ──┬── servo V+  (all eight)
                   └── 1000µF across the rail, close to the servos
   supply GND ─────┬── servo GND (all eight)
                   └── Raspberry Pi GND      ← the grounds must be common
   GPIO 17,27,22,5,6,13,19,26 ── servo signal
```

The common ground is what makes the signal mean anything; without it the servos
twitch or ignore commands entirely. The bulk capacitor absorbs the current step
when a servo starts, which is what otherwise dips the rail.

### Which GPIO library, and why pigpio is not the answer any more

There are three, and where the pulse timing comes from is the whole difference:

| | timing | |
|---|---|---|
| `pigpio` | DMA | best — a busy CPU cannot stretch a pulse. **Gone from current Raspberry Pi OS** |
| `lgpio` | a C thread | good, and what you will actually get |
| `RPi.GPIO` | a *Python* thread | last resort; every preemption is a twitch and an audible buzz |

**pigpio was preinstalled up to Bookworm and disappeared at the Trixie rebase.**
Debian has never packaged the daemon — only the client, which installs happily
and then cannot connect to anything — and the 64-bit Pi OS images bootstrap from
Debian. So on a 64-bit Trixie card there is no `apt` path to it at all.

```bash
sudo apt install python3-lgpio    # preinstalled since 2023; this is normally a no-op
```

Do **not** install `python3-rpi.gpio`. Raspberry Pi OS now ships
`python3-rpi-lgpio`, a shim providing a module named `RPi.GPIO` over lgpio, and
the real package conflicts with it — asking for it removes a working shim and
replaces it with the legacy sysfs implementation.

The firmware walks pigpio → lgpio → RPi.GPIO → mock, says which one it got at
startup and in `gpio.servo.timing`, and **refuses to dispense if it landed on
the mock while running on a Pi.** That last part is not cosmetic: without it a
device with no GPIO library runs the scheduler, writes "dispensed" into the dose
log and publishes it to the carer's phone, while every pill stays in the hopper.

---

## Installing

```bash
git clone <this repo> && cd h1-SnapCare/pill_dispenser/firmware
sudo ./service/install.sh
```

Packages, hostname, avahi, pigpiod, the captive-DNS rule and the systemd unit.
It prints every change first and is safe to run again. Needs Raspberry Pi OS
**Bookworm or newer** (NetworkManager); on an older image, `sudo raspi-config` →
Advanced → Network Config → NetworkManager.

```bash
systemctl status snapcare-dispenser
journalctl -u snapcare-dispenser -f
```

---

## The clock, and why the tray stays shut

A Raspberry Pi has no real-time clock of its own, which was this build's worst
regression from the DS3231 on the Arduino board. **Fitting a coin-cell clock
chip fixes it** — but only if the firmware asks the right question about it, and
the two chips answer very differently.

A Pi that boots with no network does not report *no* time. `fake-hwclock`
restores whatever was last written to disk, so a device unplugged on Friday
evening comes back on Tuesday believing it is Friday — confidently, with a
plausible clock and the wrong day of the week. A tray acting on that opens the
Mon/Wed/Fri compartment on a Tuesday and looks perfectly healthy doing it. The
installer disables `fake-hwclock`, because with a real RTC present it does
nothing but overwrite a good time with a stale one during boot.

Three things can vouch for the time, in this order of authority:

- **NTP**, once the WiFi is up. Continuously corrected, so it beats everything.
- **The clock chip**, whether or not there is ever a network — but only when it vouches for itself.
- **The phone**, by `SC1*C*` code or `POST /api/clock` — right once, at the
  moment somebody held up a code.

Until one of them does, nothing is dispensed.

### "Is there an RTC" is the wrong question

A dead coin cell does not make the chip disappear from the I²C bus. It makes the
chip answer, promptly and confidently, with a time that is nonsense — which is
precisely the failure this whole section exists to refuse.

On a **DS3231** the right question is answered by one bit: an **oscillator stop
flag** the hardware latches whenever the oscillator has stopped since it was last
set — exactly "this chip lost both supply and battery at some point, and
everything it has said since is invented". Only a clear flag counts as vouching,
and a flag that cannot be read is reported as *unknown* rather than as a failure.
Unknown falls towards the tray staying shut.

**A DS1302 has no such bit, and this build fits a DS1302.** Its clock-halt flag
is a control rather than a status — nothing in the hardware ever sets it, and its
power-on state is documented as undefined — so a clear flag means only "running
right now", which is equally true of a chip that sat unpowered for a month and
resumed counting from whatever was in its registers.

So the evidence is reconstructed. The DS1302 has 31 bytes of RAM in the *same
battery-backed domain as the oscillator*: the coin cell holds both or neither.
Setting the clock writes a token there, and on boot that token is present if and
only if the cell has held continuously since. It is firmware convention rather
than a hardware guarantee, and both of its failure modes fall towards not
trusting the clock. `ds1302.py` is the whole argument.

The DS1302 also has no kernel driver on a Pi, so there is no `/dev/rtc0` and
`hwclock` does nothing: the firmware reads the chip and sets the system clock
itself at startup. That is later than the kernel would have, and it is the cost
of the part.

The time itself reaches the system clock through the kernel, not through this
firmware — `dtoverlay=i2c-rtc,ds3231`, applied by the installer. That happens
before systemd timestamps anything, and it is a path other people have
maintained for a decade.

After a reboot, check it and seed it once:

```bash
ls -l /dev/rtc0 && sudo hwclock -r    # is the chip there, and what does it think
sudo hwclock --systohc                # once the Pi's time is right, write it in
```

Setting the clock through the API does all of this for you: system clock,
`hwclock --systohc`, then the oscillator flag is cleared — in that order,
because clearing the flag first would leave the hardware asserting across every
future boot that a time nobody corrected is trustworthy.

A tray that stays shut is a problem someone notices within hours; a tray that
opens at the wrong times is one that nobody notices at all.

---

## The API

### Native — `/api/...`, JSON, speaks SC1

```bash
curl http://pilldispenser.local/api/status
curl http://pilldispenser.local/api/schedule
curl http://pilldispenser.local/api/events?limit=20

# tray 1 at 08:00 and 20:00 for 30 days; tray 3 at 19:00 on Mon/Wed/Fri, ongoing
curl -X POST http://pilldispenser.local/api/schedule \
     -H 'Content-Type: application/json' \
     -d '{"payload":"SC1*W*1:0800.2000-127-030/3:1900-021-000"}'

# or as JSON, if you would rather not build the string
curl -X POST http://pilldispenser.local/api/schedule \
     -H 'Content-Type: application/json' \
     -d '{"slots":[{"tray":1,"times":["0800","2000"],"days":127,"durationDays":30}]}'

curl -X POST http://pilldispenser.local/api/drop -d '{"tray":3}'
curl -X POST http://pilldispenser.local/api/clock -d '{"iso":"2026-07-29T09:15:00"}'
```

| | |
|---|---|
| `GET /api/status` | everything: clock, WiFi, pins, driver, next dose |
| `GET`/`POST /api/schedule` | the plan, as SC1 or as JSON |
| `POST /api/release` | open what is due — `{}` for everything, `{"tray":n,"at":"0800"}` for one |
| `POST /api/drop` | `{"tray": n}` — sweep one tray now, ignoring the schedule |
| `POST /api/dismiss` | silence the chime; the dose stays owed and releasable |
| `POST /api/clock` | `{"payload": "SC1*C*..."}` or `{"iso": "..."}` |
| `GET /api/events` | the dose log, each line carrying its `SC1*E*` form |
| `GET /api/wifi/scan` · `GET /api/wifi/status` | what is nearby, and where we are |
| `POST /api/wifi/connect` | `{"ssid","password","hidden"}` → **202**, then watch below |
| `GET /api/wifi/attempt` | how that join is going: `idle`/`joining`/`joined`/`failed` |
| `POST /api/wifi/hotspot` | raise the setup network now, whatever the radio is doing |
| `GET /api/identity` | SSID, passphrase, pairing code, the QR payloads |
| `GET`/`POST /api/cloud` | the relay link: state, revisions, last contact |

**Reads are open; writes are checked.** A request that opens a tray or replaces
the schedule is refused with **421** unless its `Host` is a name this device
answers to — `pilldispenser`, `pilldispenser.local`, a two-label name starting
with the hostname, or any bare IP. Otherwise a web page open on a phone on the
same WiFi can point a hostname it owns at the dispenser and drive it; no CORS is
involved, because dropping eight trays into a cup does not require reading the
answer. GETs are deliberately exempt: the captive probes arrive addressed to
`connectivitycheck.gstatic.com` and friends, and a name check there would break
the one flow that has to work. If a router publishes its DHCP clients under a
domain of its own, `SNAPCARE_EXTRA_HOSTS=pilldispenser.fritz.box` allows it.

### Link-shaped — `/save`, `/release`, `/dropout`, `/dismiss`

Three of these are the exact URLs `lib/hardware/dispenser.ts` in the web app
already builds, so the app works against this firmware unchanged; `/release` is
ours and has the same shape for the same reason. They are GETs returning HTML
because that is how that file uses them — an HTTPS page cannot `fetch()` an HTTP
device, but it can *link* to one.

That constraint is why `/release` exists in this form at all. The release button
is the one control the device now depends on, and a control that only works from
an HTTP origin would work in development and fail on the deployed app.

They are lossy: no days of the week, no course length, so every tray they define
runs daily and indefinitely. The confirmation page says so rather than showing a
tick and letting a Mon/Wed/Fri prescription dispense seven days a week.

### Pages

`/` console · `/setup` WiFi · `/label` printable · `/qr/wifi.svg`

Every page is self-contained: no CDN, no web font, no external script. The
device is routinely on a network with no internet — during setup it *is* the
network — and a page that waits on `fonts.googleapis.com` renders blank on the
one screen that matters.

---

## Testing it without a Pi

```bash
make            # 668 tests, no board, no servos, no network
make run        # the whole firmware on a laptop, mock servos, port 8099
make label      # this machine's setup QR and pairing code, in the terminal
make cloud      # the same, wired to a relay on this machine — see ../cloud_relay
```

`make run` is the real firmware with the servo driver swapped for one that
records what it was told. The API, the scheduler, the web console and the
persistence all work; nothing physically moves.

What the suite covers, and why each part is worth the lines:

**The protocol** cross-checks against `../form_sheet_parser/schedule.py` and the
TypeScript in `../../lib/hardware/protocol.ts`. There are three implementations
of SC1 sharing no code, and the common vectors are the only
thing keeping them speaking the same language — a drift has no symptom on
hardware except a device that silently stops accepting schedules.

**The scheduler**, whose bugs are the invisible ones: a dose given twice, a
course that never ends, doses arriving out of order after a gap, a jammed servo
logged as a delivery, and a device unplugged all day that must not drop
breakfast, lunch and dinner into one hand when it is plugged back in.

**A restart mid-course** — the one that matters most. A power cut at 08:30,
after the 08:00 dose. Without persisted state the device comes back inside the
grace window, finds the dose owed, and dispenses it again.

**The servos**: the shape of the sweep, the trailing signal-cut, and eight
threads proving only one pin is ever driven at once.

**The fitted hardware**: that the chirp repeats until the dose is released and
stops the instant it is, that a broken panel is dropped rather than repainted on
every tick forever, that a device with neither part still dispenses, and — the
one worth the most lines —
that a device with **no GPIO library at all** refuses to dispense rather than
filling a carer's app with doses that never left the hopper.

**The DS1302**, against a simulated chip that implements the actual wire
protocol rather than a stub. A bit-banged driver's failures are an off-by-one in
the bit order, a turnaround one edge too late, or a register map read in the
DS3231's order — none of which raise anything. They produce a plausible time
that is wrong, which is the single failure this firmware exists to refuse.

**The identity** is pinned to an exact value, because a change to the salt or
the alphabet would leave the derivation perfectly deterministic and perfectly
different — every device already in the world would stop matching its label,
and nothing else in the suite would notice.

**The cloud link**, whose failures are all of the invisible kind: a schedule
applied twice after a power cut, an older one replayed over a newer one, a
relay that is down reaching the trays, a poll that spins because the answer
came back instantly, and a report that carries the pairing code up to a server
that must never see it.

**The crypto, against RFC 5869's own test vectors and a golden envelope.** There
are two implementations of it sharing no code — this one and the JavaScript the
app side uses — and a disagreement between them is a pairing that simply never
works, with no error at either end. The vectors establish that this side is the
standard construction WebCrypto implements; the demo app checks the other
direction in the browser, at load, by opening an envelope Python sealed.

---

## How a dose actually happens

| | |
|---|---|
| Trays | **two fitted**, eight accepted and in the pin map |
| Phone → device | HTTP over the home WiFi, or the relay, or a paper sheet |
| Device → phone | JSON, and the `SC1*E*` string in it |
| Clock | DS1302 on a coin cell, NTP, or a phone |
| Servo timing | lgpio, or pigpio DMA on the older cards that still have it |
| Schedule storage | JSON, atomically replaced |
| Setup | scan a QR |
| Opening a tray | when a release is asked for — a tap on the screen, or in the app |

Nothing is dropped at the scheduled minute. At its minute a dose is *offered*:
the screen goes green and names the tray, the chirp starts, and the dose sits on
`awaitingRelease` until somebody asks for it — by touching the screen, or by
tapping release in the app. Both land on the same `Dispenser.release`, so there
is one fact rather than two, and a dose that came out is a dose somebody asked
for.

The 20-character device→phone ceiling is kept even though nothing here is short
of room for it. Events are still emitted as `SC1*E*` and still fit, so the log
stays replayable through any implementation — and this build does now have a
screen, which could draw any line of it if a line of text were ever the right
thing to put in front of this person. It is not.

The rule that survives everything: a dose past its window is reported and never
given.

---

## Layout

```
firmware/
  snapcare_dispenser/
    config.py         the pin map and every other knob        ← start here
    sc1.py            the wire format, shared with three other implementations
    scheduler.py      when a tray is due — pure logic, no I/O
    device.py         the only thing allowed to open a tray
    gpiochip.py       the one lgpio handle, and which board this is
    servo.py          pigpio / lgpio / RPi.GPIO / mock
    selftest.py       commissioning an assembled machine
    store.py          what survives a power cut, and how
    clock.py          whether the time can be believed at all
    wifi.py           nmcli — the mechanism, one function per call
    network.py        one radio: when to be an access point, and the rollback
    provisioning.py   the identity behind the permanent QR, and the three keys
    cloud.py          the connection held open to the relay, and its retries
    envelope.py       what crosses it, sealed so the relay cannot read it
    qr.py             segno, or OpenCV, or an honest apology
    server.py         both APIs, the captive portal, the pages
    daemon.py         the process
    indicators.py     the screen and the buzzer: what the person sees and hears
    soc.py            what the board can tell you about itself: power, storage
    display/          the panel, the three bands, and the two typefaces
    button.py         an optional physical switch: take this dose now
    touch.py          the screen as the button — a tap anywhere releases a dose
    rtc.py            whether the clock chip can be believed, whichever is fitted
    ds1302.py         three bit-banged wires, and the trust model they force
    web/              four pages, no build step, nothing external
  service/            systemd unit + install.sh
  tests/              668 tests; only the end-to-end one opens a socket
```

`NOTES-FOR-WEBAPP.md` is for whoever is building the production web app.

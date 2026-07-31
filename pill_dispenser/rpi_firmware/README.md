# Dispenser firmware — Raspberry Pi 3B

One scan to get on the WiFi, one to pair it with the app, a light and a chirp
when a dose is due, and a schedule that survives both a power cut and the
internet going away.

```
   the web app, anywhere                                the person
        │                                                    ▲
        │  https                                 green ring  │  chirp
        ▼                                        ▲           │  every 20s
   ┌─────────────┐   one outbound connection,    │           │
   │ cloud relay │◄───── held open ──────┐       │           │
   └─────────────┘                       │       │           │
                                         │       │           │
   phone on the same WiFi                │       │           │
        │  http://pilldispenser.local    │       │           │
        ▼                                ▼       │           │
   ┌─────────────────────────────────────────────┼───────────┼──────┐
   │  Raspberry Pi 3B                            │           │      │
   │    onboard WiFi ── setup hotspot + captive portal       │      │
   │    web server ──── native JSON API + the app's own URLs │      │
   │    cloud link ──── sealed; the relay cannot read it     │      │
   │    scheduler ───── SC1, day masks, course lengths       │      │
   │    store ───────── the schedule, cached on the card     │      │
   │    DS3231 ──────── knows the time after a power cut     │      │
   │    pigpio ──────── GPIO 17 27 22   ring 18   buzzer 23  │      │
   └───────────────────────┬─────────────────────────────────┴──────┘
                           │                          confirm button 24
                           ▼
                 three servos, two round trips each
```

The cloud link is an extra way *in*, never a dependency. The schedule is on the
SD card and the DS3231 knows the time, so a relay that is down, unreachable or
never configured costs nobody a dose.

The contest unit is built with **three trays**; the firmware accepts eight by
default and the pin map already lists them, so adding one is a plug.

This replaces the two-board Arduino + ESP32-CAM build in [`../firmware/`](../firmware/).
The protocol is unchanged — the same `SC1` grammar, the same test vectors — so a
schedule from the phone app or from a photographed paper form sheet reaches this
firmware without anything in between being rewritten.

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
  the ring stops saying "cyan"            hotspot is back within seconds, and
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
sudo python3 -m snapcare_dispenser --show-qr      # scannable, in the terminal
sudo python3 -m snapcare_dispenser --show-label   # the same values as JSON
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
```

Two trays on one pin, a tray outside 1–8, or a GPIO that does not exist on a 3B
are all refused at startup. Sharing a pin would dispense the right number of
pills from the wrong compartment, and nobody notices that until the wrong
medication has been taken for a week.

**One drop** is the motion from the hardware spec. The tray rests at 0°, and a
drop is four commands from there — 180°, 0°, 180°, 0° — one second apart, about
four seconds in total. It runs twice because one tip can leave a pill on the lip
of the gate to ride back with the horn.

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
its clock, and keeps dispensing; that is what `store.py` and the DS3231 were for
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
handled exactly like a missing LED ring.

---

## Wiring

The contest unit is **three trays**, an LED ring, a buzzer, a confirm button and
a DS3231. `INSTALLED_TRAYS = 3` in `config.py` is the only thing that says
three; the pin map lists all eight so scaling up is one number and some servos.

To *build* one rather than look up a pin,
[`docs/assembly-guide.pdf`](docs/assembly-guide.pdf) goes from a bare Pi to a
commissioned machine one subsystem at a time, each stage ending with the command
that proves it. The table below is the reference; that is the procedure. Rebuild
it with `make guide`.

> **The guide now specifies a DS1302** on GPIO 2/3/4, replacing the DS3231
> described in this section. The firmware's clock layer (`rtc.py`,
> `config.py`, `service/install.sh`) has not been migrated yet and still speaks
> I²C to a DS3231, so this table and the pin map below remain the DS3231 wiring
> until it is.

| Signal | Pin | Notes |
|---|---|---|
| Servo 1..3 signal | GPIO **17, 27, 22** | signal wire only — **not** power |
| *(servo 4..8, unfitted)* | *GPIO 5, 6, 13, 19, 26* | reserved in the map |
| Servo V+ / GND | separate 5 V 2 A+ supply | see below |
| Pi GND ↔ supply GND | — | **required**, see below |
| WS2812 ring data | GPIO **18** | through 330 Ω, close to the ring |
| WS2812 5 V / GND | the servo supply | ~700 mA at full white; see brightness |
| Piezo buzzer | GPIO **23** | through 100 Ω |
| Confirm button | GPIO **24** | other side to GND; internal pull-up, no resistor |
| DS3231 SDA / SCL | GPIO **2 / 3** | the module's own pull-ups are enough |
| DS3231 VCC / GND | 3.3 V, GND | with its coin cell fitted |

The servo pins avoid every pin that costs hardware on a 3B: GPIO 0/1 are the HAT
ID EEPROM, 2/3 have permanent I²C pull-ups (a servo signal idling high before
the software starts slams the horn to one end at power-on, with a loaded tray on
it) — and are where the DS3231 now lives — and 14/15 are the serial console, the
one way back into a Pi whose network you have just broken. A test asserts all of
that, and that no peripheral shares a pin with a servo.

### The ring must be on GPIO 18, 12, 21 or 10

`rpi_ws281x` generates the WS2812's 800 kHz waveform with the PWM or PCM
peripheral and the DMA controller. Those four pins are the only ones wired to
them; any other choice is a ring that never lights and an error message about
DMA. GPIO 18 is PWM0 and is not in the servo map.

The 330 Ω series resistor is not folklore — it damps the reflection on the first
data edge, which is what makes the first pixel latch a wrong colour on a long
lead. Put it at the ring end, not the Pi end.

`RING_BRIGHTNESS` is 60 of 255. Full brightness on a 12-pixel ring is both
dazzling in a dark bedroom at 3 a.m. and roughly another servo's worth of
current on the same rail.

**On pigpio and the ring coexisting**: both want DMA, and both can want PWM.
pigpio times itself from PCM by default, which leaves PWM0 free, so the two
default configurations happen to be compatible. If the ring ever flickers when a
servo moves, that is the first thing to look at — start `pigpiod` with `-t 0` to
pin it to PCM explicitly.

### What the person sees and hears

Carried over from the Arduino build unchanged, so somebody who has used one
device understands the other:

| | |
|---|---|
| **green ring, repeating chirp** | a dose is in the cup; press the button |
| **blue ring** | button pressed, recorded as taken |
| **amber ring** | the dose went untaken, or its window closed |
| **violet ring** | a new schedule was accepted |
| **cyan ring, silent** | waiting to be put on a WiFi network |

The chirp repeats every `BUZZER_REPEAT_S` (20 s) until the button is pressed or
the alert is dismissed. That pairing is the point rather than redundancy: a ring
alone only works if somebody is looking at it, and without a sound the confirm
button is close to useless — nobody acknowledges what they never noticed, and
the log fills with doses marked dispensed-but-unconfirmed.

Cyan is the one colour that is new in this build, and it is deliberately outside
that vocabulary and deliberately silent. A chirp has meant "there are pills in
the cup" since the Arduino build; spending it on a network problem teaches the
one person this project is built around to walk over and find nothing there. It
earns its place because without it a dispenser sitting on its own hotspot waiting
to be configured is indistinguishable from one that is switched off, and the only
cue anybody gets is the app staying empty. A waiting dose always wins the ring
and hands it back afterwards — medication is the job.

Any of these three parts can be absent. A missing one is logged at startup and
skipped; the status page reports what is actually fitted rather than pretending.
A dispenser that will not start because its buzzer is unplugged is strictly
worse than a quiet one — the pills are what matter.

### Powering the servos

**Do not run the servos from the Pi's 5 V pin.** Same failure as on the Arduino
build, worse consequences: a Pi that browns out mid-write corrupts an SD card,
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

### Why pigpio

`pigpio` times pulses with the Pi's DMA controller, so a busy CPU cannot stretch
one. The `RPi.GPIO` fallback times them from a Python thread, and every kernel
preemption is a visible twitch and an audible buzz — which matters on a device
that sits in a bedroom overnight. The firmware falls back automatically, logs a
warning, and the status page says `jittery fallback` rather than pretending.

```bash
sudo apt install pigpio
sudo systemctl enable --now pigpiod     # it is a daemon, not just a library
```

---

## Installing

```bash
git clone <this repo> && cd h1-SnapCare/pill_dispenser/rpi_firmware
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
regression from the DS3231 on the Arduino board. **Fitting a DS3231 fixes it
properly** — but only if the firmware asks the right question about it.

A Pi that boots with no network does not report *no* time. `fake-hwclock`
restores whatever was last written to disk, so a device unplugged on Friday
evening comes back on Tuesday believing it is Friday — confidently, with a
plausible clock and the wrong day of the week. A tray acting on that opens the
Mon/Wed/Fri compartment on a Tuesday and looks perfectly healthy doing it. The
installer disables `fake-hwclock`, because with a real RTC present it does
nothing but overwrite a good time with a stale one during boot.

Three things can vouch for the time, in this order of authority:

- **NTP**, once the WiFi is up. Continuously corrected, so it beats everything.
- **The DS3231**, whether or not there is ever a network.
- **The phone**, by `SC1*C*` code or `POST /api/clock` — right once, at the
  moment somebody held up a code.

Until one of them does, nothing is dispensed.

### "Is there an RTC" is the wrong question

A dead coin cell does not make the chip disappear from the I²C bus. It makes the
chip answer, promptly and confidently, with a time that is nonsense — which is
precisely the failure this whole section exists to refuse.

The right question is answered by one bit. The DS3231 latches an **oscillator
stop flag** (bit 7 of the status register at `0x0F`) whenever its oscillator has
stopped since it was last set — exactly "this chip lost both supply and battery
at some point, and everything it has said since is invented". The firmware reads
it, and only a clear flag counts as vouching. If the flag cannot be read at all,
that is reported as *unknown* rather than as a failure, and unknown falls
towards the tray staying shut.

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
| `POST /api/drop` | `{"tray": n}` — sweep one tray now |
| `POST /api/confirm` · `/api/dismiss` | the person took it / silence the alert |
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

### App-compatible — `/save`, `/dropout`, `/dismiss`

The exact URLs `lib/hardware/dispenser.ts` in the web app already builds, so the
app works against this firmware unchanged. They are GETs returning HTML because
that is how that file uses them — an HTTPS page cannot `fetch()` an HTTP device,
but it can *link* to one.

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
make            # 434 tests, no board, no servos, no network
make run        # the whole firmware on a laptop, mock servos, port 8099
make label      # this machine's setup QR and pairing code, in the terminal
make cloud      # the same, wired to a relay on this machine — see ../cloud_relay
```

`make run` is the real firmware with the servo driver swapped for one that
records what it was told. The API, the scheduler, the web console and the
persistence all work; nothing physically moves.

What the suite covers, and why each part is worth the lines:

**The protocol** replays the vectors from `../firmware/test/test_sc1.cpp`
verbatim, and cross-checks against `../form_sheet_parser/schedule.py`. There are
now four implementations of SC1 sharing no code, and those vectors are the only
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

**The fitted hardware**: that the chirp repeats until confirmed and stops the
instant it is, that a broken ring is dropped rather than retried forever, that a
device with neither part still dispenses, and that a stopped DS3231 oscillator
leaves the tray shut while an unreadable flag is reported as unknown rather than
as failure.

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

## What changed from the Arduino build

| | Arduino + ESP32-CAM | Raspberry Pi 3B |
|---|---|---|
| Boards | two, plus a level shifter on A1 | one |
| Trays | eight | **three fitted**, eight in the map |
| Phone → device | QR into a camera | HTTP over the home WiFi |
| Device → phone | QR on a 128×64 OLED | JSON, and the `SC1*E*` string in it |
| Clock | DS3231 on a coin cell | DS3231, NTP, or a phone |
| Servo timing | hardware `Servo` library | pigpio DMA |
| Schedule storage | EEPROM | JSON, atomically replaced |
| Setup | flash it | scan a QR |

The 20-character device→phone ceiling is kept even though this hardware has no
screen. Events are still emitted as `SC1*E*` and still fit, so the log stays
replayable through any of the four implementations — and a build that later
gains a screen can draw any line of it.

Two things did **not** change, and are the reason the rest could: the SC1
grammar, and the rule that a dose past its window is reported and never given.

---

## Layout

```
rpi_firmware/
  snapcare_dispenser/
    config.py         the pin map and every other knob        ← start here
    sc1.py            the wire format, shared with three other implementations
    scheduler.py      when a tray is due — pure logic, no I/O
    device.py         the only thing allowed to open a tray
    servo.py          pigpio / RPi.GPIO / mock
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
    indicators.py     the LED ring and the buzzer
    button.py         the confirm button, debounced in the GPIO daemon
    rtc.py            the DS3231, and the one bit that says whether to believe it
    web/              four pages, no build step, nothing external
  service/            systemd unit + install.sh
  tests/              434 tests; only the end-to-end one opens a socket
```

`NOTES-FOR-WEBAPP.md` is for whoever is building the production web app.

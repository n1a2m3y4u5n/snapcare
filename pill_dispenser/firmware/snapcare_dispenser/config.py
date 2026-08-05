"""Everything you are likely to want to change, in one file.

If you are wiring a tray and need to move a servo to a different pin, the map
at the top of this file is the only thing you have to edit. Nothing else in the
firmware names a pin number.

Values can also be overridden at runtime without editing this file, which is
what the systemd unit does:

    SNAPCARE_TRAY_GPIO="1=17,2=27,3=22"   # partial or complete map
    SNAPCARE_STATE_DIR=/var/lib/snapcare
    SNAPCARE_HTTP_PORT=8080
    SNAPCARE_SERVO_BACKEND=mock           # pigpio | lgpio | rpigpio | mock | auto

The environment wins, because a bench setup should not need a patched file that
somebody later commits by accident.
"""
from __future__ import annotations

import os
from pathlib import Path

# ═══════════════════════════════════════════════════════════════════════════
#  THE PIN MAP  —  edit this
# ═══════════════════════════════════════════════════════════════════════════
#
# Tray number (what the schedule and the app call a "slot") -> Raspberry Pi
# GPIO number, **BCM numbering**, which is what pigpio and RPi.GPIO both use.
# BCM 17 is physical header pin 11; run `pinout` on the Pi for the full map.
#
# The tray is the unit the whole system talks in: `SC1*W*3:1900-021-000` means
# tray 3, and tray 3 is whatever pin this dict says it is. Change a line here
# and the schedule, the API, the web page and the paper form sheet all follow.
#
# Why these eight pins, on a Pi 3B:
#
#   - GPIO 0/1  are reserved for the HAT ID EEPROM. Driving them is how you
#     make a Pi fail to detect a HAT you plug in later.
#   - GPIO 2/3  have permanent 1.8 kΩ pull-ups to 3.3 V that cannot be switched
#     off. A servo signal line that idles high before the software starts is a
#     servo that slams to one end at power-on, with a tray full of pills on it.
#     **Those same two resistors are why they are the I²C pair**: an open-drain
#     bus is pulled up by the master or it does not work at all, and the Pi has
#     already done it. SDA is GPIO 2 (pin 3), SCL GPIO 3 (pin 5), and a DS3231
#     build hangs its clock chip there with no resistors of its own.
#   - GPIO 14/15 are the serial console. Fine if you disable it, but then you
#     lose the one way to log into a Pi whose network setup you just broke.
#   - GPIO 7/8/9/10/11 are SPI, and no longer spare: the ILI9341 is a four-line
#     SPI panel, so 11 clocks it, 10 carries the pixels and 8 (CE0) selects it.
#
# The eight below avoid all of that, are contiguous enough to keep the ribbon
# tidy, and none of them is a boot-strapping pin.
#
# GPIO 24 carries the take-dose button and is deliberately not in this map, and
# nor are 23 (the buzzer), 16/20/21 (the DS1302), 2/3 (I²C), 8/10/11 (the LCD's
# SPI) or 18/25 — the LCD's RESET and DC. GPIO 18 is free for that only because
# the LED ring that used to want it is gone. See the sections below.

TRAY_GPIO: dict[int, int] = {
    1: 17,
    2: 27,
    3: 22,
    4: 5,
    5: 6,
    6: 13,
    7: 19,
    8: 26,
}

# The firmware ceiling. The protocol allows slot numbers up to 99 and the paper
# form sheet up to 8; accepting a tray the machine does not have is a way to
# take a dose off a prescription and never dispense it, so both this and the
# parser refuse rather than ignore.
MAX_TRAYS = 8

#: How many hoppers this machine will accept schedules for.
#:
#: Defaults to the full map, so plugging a fourth servo into the pin already
#: reserved for it is the whole job — no config edit, no restart with a
#: different number, nothing for the person adding a tray to know.
#:
#: **The trade-off, because it is a real one.** An SG90 reports nothing: there
#: is no way to detect whether a hopper is fitted. Accepting all eight therefore
#: means a schedule naming a tray that does not physically exist is *accepted*,
#: and that dose is then never dispensed and reported by nothing — no jam, no
#: error, a device that looks perfectly healthy. Setting this to the number
#: actually fitted restores the refusal, by name, while somebody is still
#: looking at the screen that sent the schedule:
#:
#:     SNAPCARE_TRAYS=3 python3 -m snapcare_dispenser
#:
#: Pin clashes are still checked across the whole map either way.
INSTALLED_TRAYS = int(os.environ.get("SNAPCARE_TRAYS", str(MAX_TRAYS)))


# ═══════════════════════════════════════════════════════════════════════════
#  SERVO MOTION
# ═══════════════════════════════════════════════════════════════════════════
#
# The tray sits at 0°. A pill drop is two commands from there, a second apart:
#
#     (resting at 0°)  ->  180°  ->  0°, then the signal is cut
#
# The second between them is the part that does the work. The gate is open for
# a full `SERVO_STEP_S`, which is long enough for a pill to fall through under
# its own weight rather than being swept past the opening by a horn that is
# already on its way back.
#
# A drop therefore takes about two seconds, and holds the servo lock for all of
# it — no other tray moves meanwhile.

#: Pulse width in microseconds at 0° — where the tray rests between doses.
SERVO_MIN_US = 500
#: Pulse width in microseconds at 180° — the far end of the drop stroke.
SERVO_MAX_US = 2500

#: Seconds between one command in the drop stroke and the next.
#:
#: This is the whole timing model: the servo is not told when it has arrived —
#: nothing on an SG90 reports position — so the interval is an open-loop wait
#: that has to cover the *slowest* traverse (a cold servo under the weight of a
#: full tray, about 0.5 s) and then leave the gate open long enough for a pill
#: to fall through it. One second is both, with room to spare.
#:
#: Raising it lengthens every drop by twice whatever is added, and a tray that
#: is dropping nothing is the first thing to try it on: a sticky hopper or a
#: large capsule may want longer at the far end than a cold servo needs to get
#: there.
SERVO_STEP_S = 1.0

#: Seconds to allow for a single traverse, used by `TrayServos.park` — which
#: only has to reach 0° before releasing the pin. The floor for `SERVO_STEP_S`.
SERVO_TRAVEL_S = 0.5

#: Quiet between one tray closing and the next one opening, when a release owes
#: more than one dose.
#:
#: **The trays are stacked, so a pill from an upper one falls past the ones
#: below it.** If the next gate opens while that pill is still in the column it
#: can enter the wrong tray — a dose that the log says was given, sitting in a
#: hopper nobody will open until next week.
#:
#: A gap of about this length already existed, and that was the problem: it was
#: the *return sweep* of the previous drop, an accident of `SERVO_STEP_S` rather
#: than anything anybody had decided. Tuning that value down — which its own
#: comment invites, for a fast servo — would have removed the protection
#: silently, and the symptom would have been pills in the wrong tray weeks later.
#:
#: One second against a fall of a few tens of centimetres is generous, and it is
#: meant to be: a pill can bounce off a wall on the way down rather than falling
#: freely, and the cost of being wrong here is not paid by the person who tuned it.
SERVO_BETWEEN_S = 1.0

#: Per-tray trim, for a servo whose mechanical zero is not the electrical one.
#: `{3: (520, 2450)}` overrides only tray 3. Leave empty unless a tray is
#: visibly not reaching its stop, or is buzzing because it is being driven past
#: it — the second is what burns out a servo over a few weeks.
SERVO_TRIM: dict[int, tuple[int, int]] = {}

#: Which driver to use. "auto" tries pigpio, then lgpio, then RPi.GPIO,
#: then the mock.
#:
#: pigpio is strongly preferred: it times pulses with the DMA controller, so
#: Linux scheduling jitter cannot reach them. RPi.GPIO's software PWM is timed
#: by a Python thread, and every time the kernel preempts that thread the servo
#: twitches and hums. On a device that sits in a bedroom overnight, that is not
#: a cosmetic difference.
SERVO_BACKEND = os.environ.get("SNAPCARE_SERVO_BACKEND", "auto")


# ═══════════════════════════════════════════════════════════════════════════
#  WHAT THE PERSON SEES AND HEARS
# ═══════════════════════════════════════════════════════════════════════════
#
# A picture and a sound, never a sentence. That is the founding constraint of
# the whole project: the person cannot be assumed to read.
#
# Both are fitted on this build, and the pairing is the point. A screen alone
# only works if somebody happens to be looking at it — so the chirp is what
# fetches a person from another room, and what they see when they arrive is what
# tells them what is going on.
#
# On this build the chirp is the *prompt*, not an announcement: nothing has left
# the hopper yet, and it will not until somebody releases the dose. A silent
# device waits out the hour and records a miss.
#
# The screen replaced an LED ring and kept the ring's colour vocabulary — green
# due, blue released, amber missed, violet a new schedule, cyan put me on a
# network — plus the one distinction a ring could not draw: red for a tray that
# will not open, which used to have to share amber with a missed dose. What the
# screen adds on top is what a ring could never do: it says *which tray*, *at
# what time*, and what else is owed today. What it must not become is a text
# display, which would put the whole interface behind a skill the person it is
# built for may not have.

#: Which panel is fitted.
#:
#:     ili9341  the 2.8" 320x240 LCD on SPI0 — the panel this build ships
#:     none     no panel; the chirp and the app are the whole interface
#:     auto     the LCD
#:
#: `auto` and `ili9341` are now the same instruction, and saying so is more
#: honest than keeping a choice that was never made. The monochrome OLED that
#: used to be the alternative is gone, and it took the only real presence test
#: with it: an I2C address either acknowledges or it does not, while the LCD is
#: write-only — no MISO, nothing ever read back — so it initialises exactly as
#: well with nothing on the end of the ribbon. `auto` therefore opens the LCD
#: and logs that the panel is *assumed*, which is the first time that has
#: actually been what happens rather than what this comment claimed.
#:
#: `none` is a working build, not a broken one. The dose still comes out, the
#: chirp still fetches somebody and the app still shows the tray; what is lost
#: is the person in the room being told which one without a phone.
DISPLAY_BACKEND = os.environ.get("SNAPCARE_DISPLAY", "auto").strip().lower()

#: The LCD's SPI character device. `dtparam=spi=on` in /boot/firmware/config.txt
#: creates it; install.sh adds that line, and it takes effect on the next boot.
#: CE0 is the chip select, which is what makes this `0.0` rather than `0.1`.
DISPLAY_SPI_DEVICE = os.environ.get("SNAPCARE_DISPLAY_SPI", "/dev/spidev0.0")

#: The LCD's two out-of-band lines, BCM numbering.
#:
#: DC (data/command) is not optional and not a convention: the panel has no
#: other way to tell a command byte from a pixel byte, so a DC line stuck at one
#: level is a screen that either ignores everything or paints its own
#: initialisation sequence as pixels.
#:
#: RESET is GPIO 18 — free only because the LED ring that used to want it is
#: gone. Tying it to 3V3 instead does work until the day the panel powers up
#: mid-brownout and latches garbage, which is then unrecoverable without pulling
#: the plug. One wire is cheaper than that.
DISPLAY_DC_GPIO = 25
DISPLAY_RESET_GPIO = 18

#: Degrees, clockwise. The ILI9341 is a portrait part — 240 wide by 320 tall —
#: and both 90 and 270 turn it on its side, so a screen is 320x240 landscape.
#:
#: That is the orientation a dose screen wants: a tray number and a time sit
#: beside each other rather than stacked, which leaves both big enough to read
#: from the doorway. It costs nothing but a MADCTL byte at initialisation.
#:
#: 270 rather than 90 is which way up: the two differ by half a turn, and which
#: one is right is decided by where the ribbon leaves the module once it is in a
#: case. 0 and 180 are the same choice for a panel mounted on end.
DISPLAY_ROTATION = 270

#: SPI clock for the LCD.
#:
#: A full 320x240 frame is 153,600 bytes, so this rate is about 38 ms on the
#: wire — which is what makes a whole-screen repaint per state change acceptable
#: on a Pi 3B rather than a visible wipe. The datasheet's own write cycle is
#: 100 ns (10 MHz) and every one of these panels runs far past it.
#:
#: **It cuts both ways.** Faster is not free: at 64 MHz the bottom of a frame
#: starts tearing on dupont leads, and that looks exactly like a loose wire — so
#: the first thing to try on a speckled panel is halving this, not rewiring it.
#: The real rate is whatever the SPI divider can make of the core clock, so
#: nothing here depends on the exact figure.
DISPLAY_SPI_HZ = 32_000_000

#: The GPIO driving the panel's backlight, or None when it is not switchable.
#:
#: The reference build ties the module's LED pin to 3V3, so the backlight is
#: simply always on and there is nothing for the firmware to do. Plenty of
#: modules are wired the other way, and that case used to fail in the most
#: confusing way this driver has: LED on a GPIO nobody drives sits low, the
#: panel initialises perfectly, every frame is accepted, and the glass stays
#: black. Everything the firmware can check says the screen is fine, because
#: from its side it is.
#:
#: So the pin is configurable, and when it is set the driver claims it and
#: raises it once the first frame is in RAM — never before, or the first thing
#: the person sees is the noise the panel powered up holding.
#:
#: On/off only. `Ili9341.backlight` explains why this is not PWM: lgpio times
#: its PWM from an ordinary thread, and it is the same thread that times every
#: servo pulse, so dimming the screen would put a few thousand extra edges a
#: second through the loop that has to keep a tray steady.
#: Unset or empty means "not switchable", which is the reference build. A
#: value that is not a number is treated the same way rather than raising: this
#: is read at import, and a typo in a systemd unit must not stop the dispenser
#: starting over a backlight.
DISPLAY_BACKLIGHT_GPIO: int | None
try:
    DISPLAY_BACKLIGHT_GPIO = int(os.environ["SNAPCARE_DISPLAY_BACKLIGHT"])
except (KeyError, ValueError):
    DISPLAY_BACKLIGHT_GPIO = None

# ── the screen as the button ────────────────────────────────────────────────
#
# This build fits no physical button: the panel is the control, and a tap
# anywhere on it releases whatever dose is waiting. `touch.py` argues why there
# are no on-screen targets and why the kernel's own driver reads the controller
# rather than this firmware talking to it over SPI.

#: The event node to read, or "" to find the touch panel by name. Naming one is
#: for a board with two input devices where the wrong one is being picked; the
#: search covers every module anyone has shipped with these panels.
TOUCH_DEVICE = os.environ.get("SNAPCARE_TOUCH_DEVICE", "").strip()

#: The touch controller's own bus. It is a separate chip from the panel and
#: shares nothing with it: the LCD is on SPI, this is on I2C, and the four pins
#: are the ones the module marks `CTP_`. GPIO 2 and 3 are bus 1 on every Pi with
#: a 40-pin header, and they are the pair with the board's fixed 1.8k pull-ups —
#: which is what I2C wants and what makes them useless for anything else.
TOUCH_I2C_BUS = os.environ.get("SNAPCARE_TOUCH_I2C", "/dev/i2c-1").strip()
TOUCH_SDA_GPIO = 2
TOUCH_SCL_GPIO = 3

#: The controller's two out-of-band lines. Neither is driven by this firmware —
#: the kernel driver owns both — but they are what goes in the `dtoverlay` line,
#: so they live here with the rest of the pin map and `--touch-setup` builds the
#: line out of them.
#:
#: INT is 4 and that is not a free choice: the `edt-ft5406` overlay hardwires
#: its interrupt there, and moving the wire means the FT6236 gets no driver.
#: RESET is 12, the last pin on the header that is neither a servo, the buzzer,
#: the button, the clock chip nor one of the panel's own lines.
TOUCH_INT_GPIO = 4
TOUCH_RESET_GPIO = 12

#: A tap with no dose waiting opens nothing, and there is no setting for it.
#:
#: There was one, and it defaulted to on: any tap dropped a pill, so the machine
#: had something visible to do when somebody pressed it. It inverted the rule the
#: rest of this firmware is built on. The release model exists because pills
#: nobody asked for are how a double dose happens — nothing leaves a hopper until
#: a person has been offered it, so a dose that came out is a dose somebody
#: asked for, and a dose nobody asked for is still in the machine where the next
#: person can count it.
#:
#: A hopper walkable one tap at a time by a visitor, a cleaner, a grandchild, or
#: the person themselves pressing twice because they were not sure the first one
#: registered, is a hopper that runs out mid-week. Every one of those pills is
#: missing from a later dose, and nothing anywhere records why. To open a tray
#: with nothing due, `POST /api/drop` still does it from the device's own page,
#: where it is logged as a manual drop and nobody mistakes it for a dose.

#: How long after a touch a second one is ignored.
#:
#: Not cosmetic debouncing. A finger that rolls, or rests light enough to sit on
#: the contact threshold, drops and remakes the contact — and the controller
#: reports each remake as a new press. Every one of those reaching `release()`
#: is another tray sweep, so this is what stops one touch becoming two doses.
#: Half a second is longer than any bounce and far shorter than the gap between
#: two doses somebody genuinely means to take.
TOUCH_SETTLE_S = float(os.environ.get("SNAPCARE_TOUCH_SETTLE_S", "0.5"))

#: The hours the panel wears its night palette — start inclusive, end exclusive,
#: whole hours, wrapping midnight.
#:
#: This is a *palette* substitution and not a brightness, because there is no
#: brightness to set: the LED pin is tied to 3V3 on this build, so nothing in
#: this firmware can dim the backlight and a policy that pretended otherwise was
#: inert. At night the text and the three band surfaces darken; the state
#: colours never do — a dose waiting at 3 a.m. is exactly the dose that must not
#: be made quiet, and neither the panel nor the room ever goes blank.
#:
#: Set the two equal for no quiet hours at all.
DISPLAY_QUIET_HOURS = (22, 7)

#: Seconds the boot screen is held after the daemon starts, even once every
#: subsystem has already answered.
#:
#: A machine whose power was pulled comes back with somebody standing in front
#: of it, and until the first snapshot lands there is nothing true to draw. The
#: honest frame is "starting", and it has to stay up long enough to be read as a
#: deliberate start rather than a flicker on the way to a screen. 2.5 s is
#: roughly a glance; longer starts to feel like a device that is stuck, and it
#: delays nothing else — the tray, the button and the schedule are all live
#: underneath it.
DISPLAY_BOOT_DWELL_S = 2.5

#: Piezo buzzer, through 100 Ω. Any free GPIO — the tone is software-timed PWM,
#: so this does not compete for a hardware PWM channel with anything.
BUZZER_GPIO = 23

#: The chirp: frequency in Hz, and how long each beep lasts.
#:
#: 2 kHz, and it was 2700 until somebody listened to the actual part.
#:
#: 2.7 kHz is the number the datasheets suggest — "where a small piezo element
#: is loudest" — and it was written here on that authority rather than on any
#: measurement. Swept on the bench, this element disagrees: from 2000 Hz upward
#: it gets steadily quieter all the way to 4.1 kHz, and sweeping *down* from
#: 2000 to 600 it gets quieter in that direction too. The peak is 2 kHz.
#:
#: The move is a gain on both counts that mattered, which is why it is worth the
#: paragraph. Louder on this hardware, and **lower** — age-related hearing loss
#: takes the high end first, and this device's user is exactly the person it has
#: taken it from. The old value was worse for them twice over.
#:
#: The lesson generalises: piezo volume cannot be raised in software (the duty
#: cycle is already at the loudest a square wave has), so the resonant frequency
#: is the only real control, and it belongs to the part rather than to the
#: family. Sweep it again if the element is ever changed.
BUZZER_HZ = 2000

#: 한 번의 삑. 아래 `PULSE_LIT_S` 동안 이것이 반복된다.
BUZZER_BEEP_S = 0.25

#: 삑과 삑 사이.
BUZZER_GAP_S = 0.18

#: 복용 알람 한 박자의 **밝은 쪽** — 화면이 초록이고 부저가 우는 동안.
#:
#: 소리와 그림이 한 값을 나눠 쓴다. `indicators._chirp_loop` 에서 부저가 우는 것은
#: 화면이 초록인 바로 그 동안이라, 이 값을 소리의 길이로만 읽으면 화면의 절반이
#: 딸려 온다 — 실제로 그렇게 읽어서 화면이 깨졌다. 아래 `PULSE_DARK_S` 참고.
#:
#: 0.12초 **한 번**이었다. 그것은 알람이 아니라 딸깍 소리이고, 난청이 있는 사람은
#: 통째로 놓친다 — 이 기기의 사용자가 정확히 그 사람이다. 벤치에서 그대로 나온 말:
#: "복약 알람이 너무 짧음."
#: 밝은 쪽과 어두운 쪽이 **같다.** 아래 `PULSE_DARK_S` 가 이 값을 그대로 받는다.
PULSE_LIT_S = 0.84

#: "이게 그 상자인가" 를 답하는 소리 — 앱의 시험 칸에서 부르는 것.
#:
#: 복용 알림 칩(`BUZZER_BEEP_S`, 0.12초)과 **다른 값이어야 한다.** 저쪽은 20초마다
#: 반복되므로 짧아야 하고, 이쪽은 한 번 울리고 끝이므로 사람이 방 건너에서 듣고
#: 어느 상자인지 고개를 돌릴 시간이 있어야 한다. 0.12초는 시끄러운 방에서 놓친다.
#:
#: 이어진 한 음이 아니라 끊어서 낸다. 같은 3초라도 삑—— 하나보다 삑·삑·삑 이
#: 훨씬 잘 잡히고, 그것이 세상의 모든 경보가 그렇게 하는 이유다.
BUZZER_FIND_S = 3.0
BUZZER_FIND_ON_S = 0.30
BUZZER_FIND_OFF_S = 0.18

#: 한 박자의 **어두운 쪽** — 화면이 검정이고 부저가 조용한 동안.
#:
#: 이 값은 소리의 쉼이면서 동시에 화면의 어두운 프레임이다. 한 값이 두 채널을
#: 정하는 것이 이 상수의 전부이고, 그것을 이름에 담아 두는 이유는 **그걸 잊어서
#: 화면이 깨졌기 때문**이다.
#:
#: 무슨 일이 있었나
#: ----------------
#: 0 이었다. 소리 쪽 논리만 보고 정한 값이다 — 20초였다가 8초였다가 5초였는데
#: 벤치에서 계속 같은 말이 나왔다. "부저 울리는 시간 사이에 텀이 너무 길다."
#: 옆 방에 있는 사람에게는 쉼이 곧 놓칠 구간이고, 이 소리는 알림이 아니라
#: **프롬프트**라서 놓치면 복용이 걸린다. 그래서 0 으로 내렸다.
#:
#: 그런데 화면도 이 값을 쓴다. 0 이면 검정 프레임의 길이가 **정해지지 않는다** —
#: 남는 것은 패널을 두 번 칠하는 데 걸리는 시간(한 장에 38ms)뿐이고, 그건 프레임마다
#: 다르다. 그래서 어떤 박자에는 검정이 보이고 어떤 박자에는 안 보였다. 벤치에서
#: 그대로 나온 말: "알람 울릴 때 화면 깜빡이는게 좀 불안정함."
#:
#: 깜빡임이 불안정한 것은 미관 문제가 아니다. 이 화면이 움직이는 유일한 이유는
#: **눌러야 할 것처럼 보이게** 하는 것이고, 불규칙한 깜빡임은 신호가 아니라 고장으로
#: 읽힌다.
#:
#: 반반이고, 그것이 요구사항이다
#: ----------------------------
#: `PULSE_LIT_S` 를 그대로 받는다. 두 값을 따로 적어 두면 언젠가 한쪽만 고쳐지고,
#: 그 순간 "반반" 이라는 성질은 아무도 모르게 사라진다. 시험이 둘이 같은지 본다.
#:
#: 이 파일은 오랫동안 그 반대를 주장했다 — 초록 1.4초에 검정 0.28초, 한 주기
#: 1.68초에 초록이 83%. 논지는 초록이 **상태**(복용이 기다린다)이고 검정은 박자일
#: 뿐이므로 초록이 길어야 한다는 것이었고, 반반이면 초록이 뛰는 것이 아니라 두 색이
#: 번갈아 드는 것으로 읽힌다는 것이었다.
#:
#: 그 논지는 화면 전체가 아니라 **히어로 밴드만** 초록이던 때의 것이다. 지금은 상태
#: 막대 아래가 통째로 초록이 되므로 "무슨 상태인지" 는 초록이 차지하는 시간이 아니라
#: 초록이 덮는 **면적**이 말한다 — 그리고 반반은 이제 뛰는 것을 가장 뚜렷하게 만드는
#: 배분이다. 83% 짜리 초록은 이 크기에서는 뛰는 화면이 아니라 이따금 깜빡이는 초록
#: 화면이 된다.
#:
#: 한 주기는 1.68초로 그대로 두고 반으로 갈랐다. 0.60Hz — 눈에 보이는 박자는 예전과
#: 같은 속도다.
#:
#: 소리가 치르는 값은 적어 둘 만하다. 부저는 밝은 쪽 동안 운다(`_chirp_loop`), 그래서
#: 우는 시간이 1.4초에서 0.84초로 줄고 침묵이 0.28초에서 0.84초로 늘었다. 삑 사이가
#: 0.18초이므로 한 묶음은 여전히 두 번의 삑이고, 0.84초의 침묵은 "알람이 멈췄다" 가
#: 아니라 묶음과 묶음 사이로 들린다 — 화재경보기가 쓰는 바로 그 리듬이다. 이 값이
#: 20초였을 때의 7% 와는 견줄 것이 아니다.
#:
#: 3Hz 아래여야 한다. 광과민성 발작 지침(WCAG 2.3.1)이 그 선이고 0.60Hz 는 한참
#: 아래다. 이 값들을 만질 때 그 선을 넘기지 말 것 — 이제 깜빡이는 것이 도형 하나가
#: 아니라 화면의 85% 이므로 그 선은 전보다 더 가깝다.
PULSE_DARK_S = PULSE_LIT_S

#: 안 가져가면 더 심해진다. 여기서부터 아래의 급한 값으로 바꾼다.
#:
#: 한 가지 세기로 한 시간을 우는 알람은 두 가지를 동시에 못 한다. 처음부터 최대로
#: 울면 방금 지나가다 볼 사람에게 과하고, 처음 세기를 한 시간 유지하면 딴 방에 있는
#: 사람에게 모자란다. 그래서 시간이 답하게 둔다 — 1분을 안 가져간 복용은 방금 뜬
#: 복용과 다른 상황이고, 그 차이를 소리가 알고 있어야 한다.
#:
#: 벤치에서 그대로 나온 말: "아직도 복약 부저 알림이 좀 약해."
BUZZER_URGENT_AFTER_S = 60

#: 급해진 뒤의 값. 더 길게 울고, 덜 쉬고, 삑 사이도 좁는다.
#:
#: 이 부품에서 소리 크기를 올리는 손잡이는 이제 없다. 주파수는 2000Hz 봉우리에
#: 맞춰져 있고 사각파의 듀티는 이미 최대이며, 남은 것은 배선의 100Ω 저항이라
#: 하드웨어다. 그러니 여기서 늘릴 수 있는 것은 **크기가 아니라 집요함**이고,
#: 사람이 알람을 알아채는 데는 그쪽이 실제로 더 크게 작동한다.
#: 급해진다는 것은 두 채널 다에서 **더 촘촘해진다**는 뜻이다.
#:
#: 귀로는 삑 사이가 좁아진다 — 순한 쪽 0.25/0.18 로 듀티 58%, 급한 쪽 0.30/0.10 으로
#: 75%.
#:
#: 눈으로는 박자가 빨라진다. 한 주기가 1.68 초(0.60Hz)에서 1.40 초(0.71Hz)가 된다.
#: 순한 쪽과 마찬가지로 반반이고, 같은 이유다 — 재는 것은 한 박자의 길이가 아니라
#: **박자의 빈도**이며, 급한 쪽이 더 자주 뛴다.
#:
#: 급한 쪽 밝은 시간이 3.5초였다. 쉼이 0 이던 시절에는 그 값이 귀에도 눈에도 안
#: 보였다 — 소리는 끊기지 않았고 화면의 검정은 길이가 없었으니 묶음의 경계 자체가
#: 없었다. 쉼이 생기자 그 3.5초는 급한 쪽을 순한 쪽보다 **느리게 뛰게** 만들었다.
BUZZER_URGENT_BEEP_S = 0.30
BUZZER_URGENT_GAP_S = 0.10
PULSE_URGENT_LIT_S = 0.70
PULSE_URGENT_DARK_S = PULSE_URGENT_LIT_S

#: 눌린 것을 손이 아니라 귀로도 알 수 있게 하는 짧은 확인음.
#:
#: 유리를 눌러도 서보가 다 돌 때까지 2초쯤 아무 일도 안 일어난다. 그 2초 동안
#: 사람은 자기가 제대로 눌렀는지 알 방법이 없어서 다시 누른다. 알람과 헷갈리면
#: 안 되므로 알람의 어느 값과도 다르게, 짧고 촘촘하게.
BUZZER_ACK_ON_S = 0.05
BUZZER_ACK_OFF_S = 0.04
BUZZER_ACK_S = 0.22


# ═══════════════════════════════════════════════════════════════════════════
#  THE TAKE-DOSE BUTTON
# ═══════════════════════════════════════════════════════════════════════════
#
# The one input the machine has, and the physical twin of the release button on
# the app's main screen. Pressing it while a dose is due releases that dose;
# pressing it at any other time does nothing at all. See button.py — the second
# half of that sentence is the safety model, not an omission.

#: Button to ground, with the chip's internal pull-up. Two wires, no resistor.
#:
#: 24 is physical pin 18, next to a ground at pin 20, and is not a
#: boot-strapping pin, not I2C, not SPI and not in the tray map.
BUTTON_GPIO = 24

#: How long the level has to hold before an edge counts, in microseconds.
#:
#: Applied below Python by both GPIO libraries — pigpio's `set_glitch_filter`
#: and lgpio's `gpio_set_debounce_micros` — so the chatter never reaches a
#: callback at all. 20 ms is far longer than any switch bounces and far shorter
#: than anybody can press twice on purpose.
#:
#: Nothing unsafe happens if it is wrong: a second call finds nothing left
#: waiting and releases nothing. What a bad value costs is a log full of
#: duplicate presses and a `--selftest` that cannot tell a good button from a
#: chattering one.
BUTTON_DEBOUNCE_US = 20_000


# ═══════════════════════════════════════════════════════════════════════════
#  SCHEDULING
# ═══════════════════════════════════════════════════════════════════════════

#: How long after its scheduled time a dose may still be released.
#:
#: This is the whole window, and it does two jobs at once now. It is how late a
#: dose may still be taken, and it is how long the device will go on offering
#: one: at its scheduled minute the screen goes green and the chirp starts, and if
#: nobody has tapped release in the app by the end of this window the tray stays
#: shut and the dose is recorded missed.
#:
#: Both halves matter. A device unplugged all day must not, on being plugged
#: back in, offer breakfast, lunch and dinner at once — that is an overdose one
#: tap away. And a dose that goes untaken must be *said*, because "no pills came
#: out today" is exactly what the person's carer needs to be told.
#:
#: Nothing is ever dispensed at the end of this window. That is the point of
#: asking first: pills that nobody asked for stay in the machine, where the next
#: person to look can still count them, rather than in a cup that may or may not
#: have been emptied by somebody who then takes the next dose as well.
GRACE_MINUTES = 60

#: Seconds between scheduler ticks. Doses are specified to the minute, so this
#: only needs to be comfortably under 60; smaller just wastes wakeups.
#:
#: It is also how long a due dose can sit before the app is told about it, since
#: the report that carries `awaitingRelease` goes up when the dose is offered.
TICK_SECONDS = 15


# ═══════════════════════════════════════════════════════════════════════════
#  CLOCK
# ═══════════════════════════════════════════════════════════════════════════

#: Refuse to dispense until the wall clock has been vouched for.
#:
#: A Raspberry Pi has no real-time clock of its own. A Pi that boots without a
#: network does not report *no* time — `fake-hwclock` restores whatever was last
#: written to disk, confidently, so a device unplugged on Friday evening comes
#: back on Tuesday believing it is Friday. A tray acting on that opens the
#: Mon/Wed/Fri compartment on a Tuesday and looks perfectly healthy doing it.
#:
#: This build fits a battery-backed clock, which fixes it properly: it keeps
#: time through a power cut with no network at all. Three things can vouch for
#: the time — the RTC, NTP, or an `SC1*C*` code from the phone — and until one
#: of them does, the tray stays shut. A tray that does not open is a problem
#: someone notices.
REQUIRE_TRUSTED_CLOCK = True

#: Trust the system clock when a healthy RTC is present.
#:
#: "Healthy" is a real check, not a presence check. A dead coin cell does not
#: make a clock chip disappear from its bus; it makes the chip answer promptly
#: and confidently with nonsense, which is the failure this whole section
#: exists to refuse. What "healthy" *means* differs per chip — see rtc.py.
USE_RTC = True

#: Which chip is fitted.
#:
#:     ds1302   three bit-banged wires. No bus, no kernel driver, no /dev/rtc0
#:     ds3231   I2C at 0x68, read by the kernel through the i2c-rtc overlay
#:     none     no RTC — NTP or a phone has to vouch for the time
#:     auto     try the DS1302, then the DS3231
#:
#: The two chips are not equivalent and the difference is not cosmetic. The
#: DS3231 latches an oscillator-stop flag in hardware, which answers "did this
#: chip lose time at some point?" directly. The DS1302 has no such bit — its
#: clock-halt flag is a control with an explicitly undefined power-on state —
#: so the firmware reconstructs the same fact from a token it keeps in the
#: chip's battery-backed RAM. See ds1302.py, which is worth reading before
#: trusting either.
RTC_KIND = os.environ.get("SNAPCARE_RTC", "auto").lower()

#: The DS1302's three wires. BCM numbering.
#:
#: **Deliberately not GPIO 2 and 3.** Those carry fixed 1.8 kΩ pull-ups to
#: 3.3 V that cannot be switched off, and they are wrong here in two separate
#: ways. On the bidirectional I/O line the pull-up sources current the chip has
#: to sink to show a zero, and a *floating* line then reads as one — so a
#: disconnected wire looks exactly like valid data. On the clock line it holds
#: SCLK high before the pin is configured, breaking the chip's rule that SCLK
#: must be low when CE rises.
#:
#: 16, 20 and 21 are physical pins 36, 38 and 40 — three in a row at the end of
#: the header, with a ground at pin 39 right beside them.
RTC_SCLK_GPIO = 16
RTC_IO_GPIO = 20
RTC_CE_GPIO = 21

#: I2C bus and address, for a build fitted with a DS3231 instead. Bus 1 is
#: GPIO 2 (SDA) and GPIO 3 (SCL) — which is why those two are kept out of the
#: servo map either way.
RTC_I2C_BUS = 1
RTC_I2C_ADDRESS = 0x68

#: A clock earlier than this is certainly wrong — it is before this firmware
#: was written, so no correct clock can read it.
CLOCK_SANITY_EPOCH = "2026-01-01T00:00:00"

#: How often to write the current good time back into the clock chip.
#:
#: The chip is only ever *read* after a power cut, which is exactly when nothing
#: is left to correct it — so whatever it was last told has to be right. Two
#: things make that not automatic:
#:
#:   **Drift.** The DS1302's crystal is uncompensated: a few minutes a month,
#:   and more as the room warms and cools. A chip seeded once at commissioning
#:   and consulted a year later is a chip that is minutes out, silently.
#:
#:   **A chip that was never seeded.** A cell fitted after the fact, a module
#:   wired up while the device was already running, a single failed write. The
#:   periodic pass is what rescues those without anybody noticing they happened.
#:
#: Six hours: often enough that drift never accumulates past a few seconds,
#: rare enough to be nothing on a device that runs for years. Set to 0 to write
#: the chip only when the clock is first vouched for.
RTC_RESEED_S = int(os.environ.get("SNAPCARE_RTC_RESEED_S", str(6 * 60 * 60)))


# ═══════════════════════════════════════════════════════════════════════════
#  NETWORK
# ═══════════════════════════════════════════════════════════════════════════

#: mDNS name the device answers to. `lib/hardware/dispenser.ts` in the web app
#: has this exact string as its DEFAULT_HOST, so changing it means changing the
#: app too.
MDNS_HOSTNAME = os.environ.get("SNAPCARE_MDNS_HOSTNAME", "pilldispenser")

#: Extra host names the device will accept a *mutating* request under.
#:
#: The web server refuses anything that changes the schedule, or opens a tray,
#: if it arrives addressed to a name this device does not answer to. That is
#: what stops a web page you are reading from quietly driving the dispenser on
#: your own network — see `_is_ours` in server.py.
#:
#: It knows about `pilldispenser`, `pilldispenser.local`, `localhost` and any
#: plain IP address. What it cannot know is that some home routers publish a
#: DHCP hostname under a domain of their own — `pilldispenser.fritz.box`,
#: `pilldispenser.home.arpa`. If yours does, name it here:
#:
#:     SNAPCARE_EXTRA_HOSTS=pilldispenser.fritz.box
EXTRA_HTTP_HOSTS = frozenset(
    host.strip().lower()
    for host in os.environ.get("SNAPCARE_EXTRA_HOSTS", "").split(",")
    if host.strip()
)

#: Port the device's own web server listens on. 80 needs root or a capability;
#: the systemd unit grants CAP_NET_BIND_SERVICE rather than running as root.
HTTP_PORT = int(os.environ.get("SNAPCARE_HTTP_PORT", "80"))

#: SSID prefix for the setup hotspot. The suffix is derived from the board, so
#: the full name — and therefore the printed QR code — is the same on every
#: boot for the life of the device. See provisioning.py.
AP_SSID_PREFIX = "SnapCare"

#: Address the Pi gives itself in hotspot mode. NetworkManager's shared mode
#: uses 10.42.0.1 by default; the captive portal has to know it to answer DNS
#: with it.
AP_ADDRESS = "10.42.0.1"

#: WiFi interface. `wlan0` on every Pi 3B; here so a USB adapter can be used.
WIFI_INTERFACE = os.environ.get("SNAPCARE_WIFI_IFACE", "wlan0")

#: How long to wait for a known network at boot before giving up and raising
#: the setup hotspot. A Pi 3B associates in 5-10 s on a healthy network; 45 s
#: covers a router that is itself still booting after a power cut, which is the
#: common case, since the two are usually on the same failed socket.
WIFI_JOIN_TIMEOUT_S = 45

#: How stale an answer about the radio the scheduler tick will accept.
#:
#: Asking NetworkManager where we are costs up to three `nmcli` processes, and
#: the tick loop runs every `TICK_SECONDS` for reasons that have nothing to do
#: with WiFi. Nothing in the network policy reacts faster than tens of seconds,
#: so a cached answer this old is as good as a fresh one — and the API asks for
#: a fresh one anyway, because somebody is looking at that.
NET_POLL_S = 20

#: How long the device may be off the network before it raises the setup
#: hotspot on its own.
#:
#: The delay is the point. A router rebooting takes the WiFi away for thirty
#: seconds and NetworkManager rejoins by itself; a device that answered every
#: such blink by becoming an access point would take itself off the network far
#: more often than it ever rescued itself. Ten minutes means the hotspot appears
#: for the cases it can actually fix — a changed password, a replaced router —
#: and not for the ones that fix themselves.
OFFLINE_GRACE_S = 10 * 60

#: How long the setup page has to have been quiet before the device is allowed
#: to take its own hotspot down to retry the house network.
#:
#: Without this the unattended retry is free to fire while somebody is halfway
#: through typing their WiFi password, which looks exactly like the device
#: crashing. Two minutes is longer than any gap in a setup somebody is actually
#: doing, and short enough that walking away ends it.
PORTAL_QUIET_S = 120

#: How often the device retries a network it already knows while sitting on its
#: own hotspot.
#:
#: This is the difference between a dispenser that recovers from a slow router
#: and one that has to be unplugged. If the power comes back and the router
#: takes four minutes to serve DHCP, the device will have given up and raised
#: its hotspot — and before this timer existed, nothing ever tried the house
#: network again. A dispenser in a spare room can sit like that for weeks with
#: nobody noticing that the app has stopped hearing from it.
#:
#: Five minutes: long enough that a genuinely dead network is not being retried
#: constantly (each attempt costs the hotspot for as long as the join takes),
#: short enough that a router which comes back at 08:03 is found before the
#: 08:00 dose has finished waiting to be confirmed.
HOTSPOT_RETRY_S = 5 * 60


# ═══════════════════════════════════════════════════════════════════════════
#  CLOUD SYNC
# ═══════════════════════════════════════════════════════════════════════════
#
# The device holds one outbound connection to a relay so that a schedule edited
# in the web app arrives without anybody being on the same WiFi. Outbound and
# HTTPS on purpose: a home router will not forward a port to a dispenser, and
# should not be asked to.
#
# Everything here is optional. With no relay configured the firmware behaves
# exactly as it did before — the schedule arrives over the LAN or off a paper
# sheet, and the local cache and the DS3231 keep the alarms running. Cloud sync
# is an extra way *in*, never a dependency: a relay that is down, unreachable
# or never configured must not cost anybody a dose.

#: Where the SnapCare web app lives, for the QR the pairing screen draws.
#:
#: A phone's own camera reads a QR far better than a still photograph does, but
#: it will only act on a code it can **open**. Pointing that code at the app
#: turns pairing into "hold the phone up, tap the notification" and takes our
#: decoder out of the path entirely. See `display/health._pair_fields`.
#:
#: Empty falls back to the bare `SNAPCARE-PAIR:` form, which only the app can
#: act on. That is the right default for a device with no app deployment to
#: point at — a code promising a page that does not exist is worse than a code
#: an ordinary camera declines to open.
APP_URL = os.environ.get("SNAPCARE_APP_URL", "https://snapcare.fly.dev").strip()

#: Base URL of the relay, e.g. https://snapcare-relay.fly.dev. Empty is off.
CLOUD_RELAY_URL = os.environ.get("SNAPCARE_RELAY_URL", "").strip().rstrip("/")

#: Master switch, separate from the URL so a device can be taken off the cloud
#: for a demo without losing the address it goes back to.
CLOUD_ENABLED = os.environ.get("SNAPCARE_CLOUD", "1").strip().lower() not in (
    "0", "false", "no", "off",
)

#: How long the relay holds a poll open before answering "nothing new".
#:
#: This is the whole responsiveness/cost trade-off in one number, and it is
#: worth being honest about which way it cuts. At 50 s the device is
#: effectively always connected and an edit in the app reaches it in about a
#: second — and the relay is therefore never idle, which on a host that stops
#: idle machines means it never stops. Raise CLOUD_IDLE_POLL_S instead if the
#: bill matters more than the latency.
#:
#: The ceiling is not ours: proxies and load balancers cut idle connections,
#: commonly at 60 s. Answering at 50 leaves the relay closing its own
#: connections tidily rather than having them cut underneath it, which is the
#: difference between a clean reconnect and a stack trace every minute.
CLOUD_HOLD_S = int(os.environ.get("SNAPCARE_CLOUD_HOLD_S", "50"))

#: Seconds to wait between polls once the device decides nothing is happening.
#:
#: Zero — the default — means "reconnect immediately", which is what makes sync
#: feel instant. Set it to 900 and the device checks every fifteen minutes
#: instead: the relay is then idle almost all the time and a machine that stops
#: when idle actually gets to stop. The cost is exactly what it looks like — an
#: edit made in the app can sit for fifteen minutes before the device hears it.
CLOUD_IDLE_POLL_S = int(os.environ.get("SNAPCARE_CLOUD_IDLE_S", "0"))

#: Backoff after a failed poll: first wait, ceiling, and the multiplier.
#:
#: A relay that is down is the normal case during a deploy, and every dispenser
#: in the world reconnecting on the same second afterwards is a thundering herd
#: that keeps it down. The jitter below is what spreads them out.
CLOUD_BACKOFF_MIN_S = 5
CLOUD_BACKOFF_MAX_S = 300
CLOUD_BACKOFF_FACTOR = 2.0

#: How much of the wait to randomise, 0..1. At 0.5 a computed 60 s wait becomes
#: a random 30-90 s.
CLOUD_BACKOFF_JITTER = 0.5

#: How often the device republishes its state even when nothing has changed.
#:
#: This is what makes the app able to say "last heard from, four minutes ago"
#: rather than "connected" forever. A device whose power has been pulled sends
#: nothing and looks identical to a healthy one otherwise — and "the dispenser
#: has been unplugged since Tuesday" is the single most useful thing a carer
#: can be told.
CLOUD_HEARTBEAT_S = 300

#: Seconds without a successful exchange before the status page calls the cloud
#: link down. Comfortably more than one heartbeat plus one backoff, so a single
#: missed poll is not reported as an outage.
CLOUD_STALE_S = 900

#: Largest response the device will read from the relay.
#:
#: The device trusts the relay to be a mailbox, not to be well-behaved. Without
#: a ceiling a compromised or simply broken relay could hand a Pi 3B a body
#: large enough to exhaust its memory, and a dispenser that has been OOM-killed
#: does not dispense. A schedule is a few hundred bytes.
CLOUD_MAX_BODY = 256 * 1024


# ═══════════════════════════════════════════════════════════════════════════
#  STORAGE
# ═══════════════════════════════════════════════════════════════════════════

#: Where the schedule, the scheduler's memory of what has already been
#: dispensed, and the event log live. Must survive a power cut: that memory is
#: the only thing standing between a reboot and a second breakfast dose.
STATE_DIR = Path(os.environ.get("SNAPCARE_STATE_DIR", "/var/lib/snapcare"))

SCHEDULE_FILE = STATE_DIR / "schedule.json"
SCHEDULER_STATE_FILE = STATE_DIR / "scheduler.json"
EVENT_LOG_FILE = STATE_DIR / "events.jsonl"
IDENTITY_FILE = STATE_DIR / "identity.json"

#: The cloud client's memory: the last revision applied, and when the relay was
#: last reached. Its job is to stop a schedule being applied twice, and to stop
#: an *older* one being replayed over a newer one after a reboot.
CLOUD_STATE_FILE = STATE_DIR / "cloud.json"

#: Events kept in the log. One dose is one line; eight trays three times a day
#: is 24 a day, so this is about four months of history in a file small enough
#: to read whole into a 1 GB Pi.
EVENT_LOG_LIMIT = 3000


def tray_gpio(installed: int | None = None) -> dict[int, int]:
    """The pin map for the trays that are actually fitted.

    `SNAPCARE_TRAY_GPIO` patches it — `"1=17,2=27"` — rather than replacing it,
    so moving one servo on the bench does not silently unconfigure the rest.
    `SNAPCARE_TRAYS` decides how many of them exist.
    """
    pins = dict(TRAY_GPIO)
    raw = os.environ.get("SNAPCARE_TRAY_GPIO", "").strip()
    if raw:
        for pair in raw.split(","):
            tray_text, _, gpio_text = pair.partition("=")
            pins[int(tray_text.strip())] = int(gpio_text.strip())

    for tray, gpio in pins.items():
        if not 1 <= tray <= MAX_TRAYS:
            raise ValueError(f"tray {tray} is outside the {MAX_TRAYS}-tray firmware")
        if not 0 <= gpio <= 27:
            raise ValueError(f"GPIO {gpio} for tray {tray} is not a Pi 3B BCM pin")

    # Checked across the whole map, not just the fitted part. A clash on tray 6
    # is worth hearing about now, while somebody is editing this file — not in
    # six months when the sixth hopper is plugged in and the wrong one moves.
    #
    # Two trays on one pin gives the right number of pills from the wrong
    # compartment, and nobody notices that until the wrong medication has been
    # taken for a week.
    seen: dict[int, int] = {}
    for tray, gpio in sorted(pins.items()):
        if gpio in seen:
            raise ValueError(
                f"GPIO {gpio} is assigned to both tray {seen[gpio]} and tray {tray}"
            )
        seen[gpio] = tray

    count = INSTALLED_TRAYS if installed is None else installed
    if not 1 <= count <= MAX_TRAYS:
        raise ValueError(f"INSTALLED_TRAYS must be 1..{MAX_TRAYS}, not {count}")

    return {tray: gpio for tray, gpio in pins.items() if tray <= count}


def servo_range(tray: int) -> tuple[int, int]:
    """Pulse widths for this tray's 0° and 180°, with any trim applied."""
    return SERVO_TRIM.get(tray, (SERVO_MIN_US, SERVO_MAX_US))

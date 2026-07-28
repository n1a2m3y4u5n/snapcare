/*
 * SnapCare pill dispenser — tray controller (Arduino Uno / Nano, ATmega328P)
 *
 * This board owns the physical tray: eight compartments, eight servos, a
 * real-time clock, the button the patient presses, and the light and sound
 * that tell them a dose is waiting. It holds the schedule and decides when to
 * open something.
 *
 * It does not know what a QR code is. The ESP32-CAM beside it is a transparent
 * optical modem: it reads a code off the phone's screen and forwards the SC1
 * text over a serial line, and it takes SC1 text back and draws it as a code
 * for the phone to photograph. The link between the two boards carries exactly
 * the same bytes as the air gap does, so there is no third protocol to keep in
 * sync, and this board behaves identically whether the text arrived from a
 * camera or from a laptop on the USB port.
 *
 * That also means this sketch is useful on its own. With no ESP32 attached at
 * all, paste a schedule into the serial monitor at 9600 baud:
 *
 *     SC1*W*1:0800.2000-127-030/3:1900-021-000
 *
 * and the tray runs it.
 *
 * WIRING — see firmware/README.md for the full table and, in particular, for
 * why the servos must not be powered from the Arduino's own 5V pin.
 *
 *   D2..D9   servo signal, compartments 1..8
 *   D10      confirm button to GND (uses the internal pull-up)
 *   D11      piezo buzzer
 *   D12      WS2812 LED ring data
 *   A4/A5    DS3231 real-time clock (I2C)
 *   A0/A1    serial to the ESP32-CAM (RX/TX)  <- A1 needs a divider, see README
 *
 * LIBRARIES  Servo (bundled) · RTClib · Adafruit_NeoPixel · SoftwareSerial
 *            (bundled), plus the SC1 library in firmware/libraries/SC1.
 */

#include <Adafruit_NeoPixel.h>
#include <EEPROM.h>
#include <RTClib.h>
#include <Servo.h>
#include <SoftwareSerial.h>
#include <Wire.h>

#include "SC1.h"
#include "Scheduler.h"

/* ── pins ─────────────────────────────────────────────────────────────── */

static const uint8_t SERVO_PIN[sc1::MAX_SLOTS] = {2, 3, 4, 5, 6, 7, 8, 9};
static const uint8_t PIN_BUTTON = 10;
static const uint8_t PIN_BUZZER = 11;
static const uint8_t PIN_PIXELS = 12;
static const uint8_t PIN_LINK_RX = A0;
static const uint8_t PIN_LINK_TX = A1;

static const uint8_t PIXEL_COUNT = 12;

/* ── servo geometry ───────────────────────────────────────────────────── */

// A compartment is a hatch: the horn sits at REST holding it shut, swings to
// OPEN to tip the pills out, and comes back. Angles are conservative — a servo
// driven into its mechanical stop stalls, and a stalled hobby servo draws over
// an amp until something gives.
static const uint8_t SERVO_REST = 20;
static const uint8_t SERVO_OPEN = 110;
static const uint16_t SERVO_TRAVEL_MS = 600;   // time to reach the far end
static const uint16_t SERVO_DWELL_MS = 400;    // held open, so the pills clear

/* ── behaviour ────────────────────────────────────────────────────────── */

// How long the ring stays lit and the buzzer chirps waiting for the button.
static const uint32_t WAIT_FOR_BUTTON_MS = 15UL * 60UL * 1000UL;
static const uint32_t CHIRP_EVERY_MS = 30UL * 1000UL;
// The tick only needs to be fast enough that a dose is never more than this
// late; a minute of granularity is what the schedule itself is expressed in.
static const uint16_t TICK_MS = 500;

static const uint32_t EEPROM_MAGIC = 0x53433102UL;   // "SC1", layout version 2
static const int EEPROM_ADDR = 0;

/* ── colours ──────────────────────────────────────────────────────────── */
//
// The ring is the only channel aimed at the person, and the whole product
// premise is that they may not read. So it shows one colour and nothing else:
// no text, no icons, no counts.

struct Colour { uint8_t r, g, b; };
static const Colour COLOUR_IDLE    = {0, 0, 0};
static const Colour COLOUR_WAITING = {0, 180, 60};    // green: a dose is ready
static const Colour COLOUR_TAKEN   = {0, 90, 200};    // blue: acknowledged
static const Colour COLOUR_MISSED  = {200, 60, 0};    // amber: went untaken
static const Colour COLOUR_LOADED  = {120, 0, 180};   // violet: new schedule

/* ── state ────────────────────────────────────────────────────────────── */

Adafruit_NeoPixel pixels(PIXEL_COUNT, PIN_PIXELS, NEO_GRB + NEO_KHZ800);
SoftwareSerial link(PIN_LINK_RX, PIN_LINK_TX);
RTC_DS3231 rtc;
sc1::Scheduler scheduler;

static bool rtcPresent = false;
// A DS3231 whose backup cell has died does not report "no time" — it reports a
// wrong one, confidently. A tray acting on a wrong clock opens compartments at
// the wrong hours, and nothing about it looks broken. So the clock is treated
// as untrusted until something sets it, and an untrusted clock dispenses
// nothing. `SC1*C*` clears this; see handleLine.
static bool clockTrusted = false;
// Whether the loaded schedule's start date was set from a clock we believed.
// A "for 30 days" course counts from the day it was loaded, so a schedule
// accepted while the clock was wrong has a wrong start — and once the clock is
// corrected the day number leaps, which would make the course look finished
// before it began. See reanchorSchedule().
static bool scheduleAnchored = false;
static uint8_t eventSeq = 0;
static uint32_t lastTick = 0;

// Set while a compartment is open and the patient has not yet pressed the
// button. Only one dose is ever outstanding: the tray does not open a second
// compartment while pills from the first are still sitting in the cup.
static bool awaitingButton = false;
static sc1::Decision pending;
static uint32_t pendingSince = 0;
static uint32_t lastChirp = 0;

static char lineBuf[sc1::MAX_SCHEDULE_PAYLOAD];
static uint16_t lineLen = 0;

/* ── little helpers ───────────────────────────────────────────────────── */

static void setRing(const Colour& c) {
    for (uint8_t i = 0; i < PIXEL_COUNT; ++i) pixels.setPixelColor(i, c.r, c.g, c.b);
    pixels.show();
}

static void chirp(uint16_t freq, uint16_t ms) {
    tone(PIN_BUZZER, freq, ms);
}

/** Days since 2000-01-01, the monotonic day number the scheduler wants. */
static uint32_t dayNumber(const DateTime& t) {
    return uint32_t(t.unixtime() / 86400UL);
}

/** 0 = Monday .. 6 = Sunday. RTClib counts 0 = Sunday, which is not our order. */
static uint8_t weekdayMondayFirst(const DateTime& t) {
    return uint8_t((t.dayOfTheWeek() + 6) % 7);
}

/**
 * Fall back to a free-running clock when no DS3231 answers.
 *
 * Without a real clock the schedule is meaningless, and the honest thing is to
 * refuse rather than dispense at invented times — a tray that opens at the
 * wrong hour is worse than one that does not open. This keeps the device
 * responsive and complaining instead of silently wrong.
 */
static DateTime now() {
    return rtcPresent ? rtc.now() : DateTime(uint32_t(0));
}

/* ── persistence ──────────────────────────────────────────────────────── */
//
// The schedule survives a power cut, because the alternative is a device that
// forgets its prescription whenever the mains flickers and has to be re-shown
// a QR by someone who may not be there.

struct StoredSchedule {
    uint32_t magic;
    uint32_t loadedOnDay;
    sc1::Schedule schedule;
};

static void saveSchedule(const sc1::Schedule& s, uint32_t today) {
    StoredSchedule blob;
    blob.magic = EEPROM_MAGIC;
    blob.loadedOnDay = today;
    blob.schedule = s;
    EEPROM.put(EEPROM_ADDR, blob);
}

static bool restoreSchedule() {
    StoredSchedule blob;
    EEPROM.get(EEPROM_ADDR, blob);
    if (blob.magic != EEPROM_MAGIC) return false;
    if (blob.schedule.count > sc1::MAX_SLOTS) return false;   // corrupt
    scheduler.load(blob.schedule, blob.loadedOnDay);
    return true;
}

/* ── the tray ─────────────────────────────────────────────────────────── */

/** Forward declaration: the servo waits have to keep draining the serial port. */
static void collectWithoutDispatching(uint32_t ms);

/**
 * Open one compartment and shut it again.
 *
 * The servo is attached only for the move. Leaving eight servos attached costs
 * a continuous PWM stream and holding current for each, which on a hobby servo
 * is audible hum, avoidable heat, and — with everything else this board is
 * doing — the difference between a supply that copes and one that browns out
 * mid-dose. It also means a knocked tray does not fight back.
 *
 * The waits are not `delay`. A dose takes about 1.6 seconds, and SoftwareSerial
 * buffers 64 bytes; a weekly schedule for a full tray is around 190. Blocking
 * here would silently drop most of a schedule that happened to arrive while a
 * compartment was open, and what reaches the parser afterwards is a fragment —
 * which either fails to parse or, far worse, parses as a shorter valid
 * schedule. So the bytes keep being collected throughout; only their
 * *interpretation* waits.
 */
static void dispense(uint8_t slot) {
    if (slot < 1 || slot > sc1::MAX_SLOTS) return;
    Servo servo;
    servo.attach(SERVO_PIN[slot - 1]);
    servo.write(SERVO_REST);
    collectWithoutDispatching(60);
    servo.write(SERVO_OPEN);
    collectWithoutDispatching(SERVO_TRAVEL_MS + SERVO_DWELL_MS);
    servo.write(SERVO_REST);
    collectWithoutDispatching(SERVO_TRAVEL_MS);
    servo.detach();
}

/* ── talking to the phone ─────────────────────────────────────────────── */

/**
 * Hand an event to the optical head, which will draw it as a QR.
 *
 * Also echoed to USB serial, so the same message is visible when the sketch is
 * being used standalone with no ESP32 attached.
 */
static void reportEvent(uint8_t slot, uint16_t minutes, bool taken) {
    sc1::DoseEvent e;
    e.slot = slot;
    e.minutes = minutes;
    e.taken = taken;
    e.seq = eventSeq;

    char payload[sc1::MAX_DEVICE_PAYLOAD + 1];
    if (sc1::encodeEvent(e, payload, sizeof payload) == 0) {
        // encodeEvent refuses rather than truncating: a shortened QR is not a
        // shorter message, it is an unreadable one.
        Serial.println(F("! event would not fit the device screen; not sent"));
        return;
    }
    eventSeq = uint8_t((eventSeq + 1) % 100);

    link.println(payload);
    Serial.println(payload);
}

/* ── inbound lines ────────────────────────────────────────────────────── */

/**
 * Restart the loaded courses from today, once the clock can be believed.
 *
 * A schedule shown to the device before its clock was set has its "for 30 days"
 * counted from whatever day the wrong clock claimed — usually 2000-01-01. When
 * the clock is then corrected the day number jumps forward by decades and every
 * fixed-length course reads as long finished, so the tray would go quiet and
 * give no reason. Re-anchoring costs the days already elapsed, which is the
 * right trade: those days were dispensed against a clock nobody trusted.
 */
static void reanchorSchedule() {
    if (scheduleAnchored || scheduler.schedule().count == 0) return;
    const sc1::Schedule current = scheduler.schedule();   // copy before reloading
    const uint32_t today = dayNumber(now());
    scheduler.load(current, today);
    saveSchedule(current, today);
    scheduleAnchored = true;
    Serial.println(F("courses restarted from today (they were loaded on an unset clock)"));
}


static void handleLine(char* text) {
    if (text[0] == '\0') return;

    // Setting the clock comes first: without a trusted one nothing else can
    // happen, and this is the only way to set it on a device with no keyboard,
    // no readable screen and no network.
    sc1::ClockSet clk;
    if (sc1::decodeClock(text, clk)) {
        if (!rtcPresent) {
            Serial.println(F("! no DS3231 to set"));
            return;
        }
        rtc.adjust(DateTime(clk.year, clk.month, clk.day, clk.hour, clk.minute, 0));
        clockTrusted = true;
        reanchorSchedule();
        Serial.print(F("clock set: "));
        Serial.print(clk.year);
        Serial.print('-');
        Serial.print(clk.month);
        Serial.print('-');
        Serial.print(clk.day);
        Serial.print(' ');
        Serial.print(clk.hour);
        Serial.print(':');
        Serial.println(clk.minute);
        setRing(COLOUR_LOADED);
        chirp(2093, 100);
        delay(300);
        setRing(awaitingButton ? COLOUR_WAITING : COLOUR_IDLE);
        return;
    }

    sc1::Schedule incoming;
    if (sc1::decodeAnySchedule(text, incoming)) {
        const uint32_t today = dayNumber(now());
        scheduler.load(incoming, today);
        saveSchedule(incoming, today);
        // Only meaningful if the clock was believable when we read it.
        scheduleAnchored = clockTrusted;

        Serial.print(F("loaded "));
        Serial.print(incoming.count);
        Serial.println(F(" compartment(s)"));
        for (uint8_t i = 0; i < incoming.count; ++i) {
            const sc1::SlotSchedule& s = incoming.slots[i];
            Serial.print(F("  slot "));
            Serial.print(s.slot);
            Serial.print(F(":"));
            for (uint8_t t = 0; t < s.count; ++t) {
                char hhmm[5];
                sc1::formatHHMM(s.times[t], hhmm);
                Serial.print(' ');
                Serial.print(hhmm);
            }
            Serial.print(F("  days=0b"));
            Serial.print(s.days, BIN);
            Serial.print(F("  for="));
            if (s.durationDays) Serial.println(s.durationDays);
            else Serial.println(F("ongoing"));
        }
        setRing(COLOUR_LOADED);
        chirp(1760, 120);
        // A plain delay, unlike the others: `text` points into lineBuf, and
        // collecting here would append incoming bytes to the string this
        // function is still reading. 400ms is safe because the only sender is
        // the optical head, which suppresses a repeat scan for four seconds.
        delay(400);
        setRing(awaitingButton ? COLOUR_WAITING : COLOUR_IDLE);
        return;
    }

    // Not a schedule. Say so rather than failing silently — when someone is
    // holding a phone up to a camera wondering why nothing happened, the
    // serial log is the only thing that can tell them.
    Serial.print(F("? ignored: "));
    Serial.println(text);
}

// Set when a complete line arrived while the tray was busy. It stays in
// lineBuf and is acted on as soon as the servo is back at rest.
static bool linePending = false;

/**
 * Collect bytes from a stream into `lineBuf`.
 *
 * With `dispatch` false the line is held rather than acted on. That matters
 * during a dose: loading a new schedule between `beginDose` and the matching
 * `confirm` would leave the scheduler unable to find the compartment it just
 * opened, so the dose would never be marked done and would be delivered again
 * on the next tick.
 */
static void pump(Stream& in, bool dispatch = true) {
    while (in.available()) {
        const char c = char(in.read());
        if (c == '\r') continue;
        if (c == '\n') {
            lineBuf[lineLen] = '\0';
            if (lineLen == 0) continue;
            if (dispatch) {
                handleLine(lineBuf);
                lineLen = 0;
            } else {
                linePending = true;
                return;   // stop reading: the next line would overwrite this one
            }
            continue;
        }
        if (size_t(lineLen) + 1 < sizeof lineBuf) {
            lineBuf[lineLen++] = c;
        } else {
            // Overlong input is discarded whole. Parsing a truncated schedule
            // would be worse than parsing none.
            lineLen = 0;
            Serial.println(F("! line too long, discarded"));
        }
    }
}

/** Keep the serial buffers drained for `ms`, without acting on what arrives. */
static void collectWithoutDispatching(uint32_t ms) {
    const uint32_t until = millis() + ms;
    while (int32_t(until - millis()) > 0) {
        if (!linePending) {
            pump(Serial, false);
            pump(link, false);
        }
        delay(1);
    }
}

/** Act on a line that arrived while the tray was busy. */
static void flushPendingLine() {
    if (!linePending) return;
    linePending = false;
    handleLine(lineBuf);
    lineLen = 0;
}

/* ── the dose cycle ───────────────────────────────────────────────────── */

static void beginDose(const sc1::Decision& d) {
    Serial.print(F("dispensing slot "));
    Serial.println(d.slot);

    dispense(d.slot);

    awaitingButton = true;
    pending = d;
    pendingSince = millis();
    lastChirp = 0;
    setRing(COLOUR_WAITING);
}

static void finishDose(bool taken) {
    reportEvent(pending.slot, pending.minutes, taken);
    setRing(taken ? COLOUR_TAKEN : COLOUR_MISSED);
    chirp(taken ? 1320 : 440, 200);
    collectWithoutDispatching(1200);   // the colour is held, the port stays drained
    setRing(COLOUR_IDLE);
    awaitingButton = false;
}

static bool buttonPressed() {
    if (digitalRead(PIN_BUTTON) != LOW) return false;
    delay(30);                                   // debounce
    if (digitalRead(PIN_BUTTON) != LOW) return false;

    // Wait for release, so one press is one acknowledgement. Someone resting a
    // thumb on the button holds this for as long as they like, which is exactly
    // when the port must not be left to overflow.
    while (digitalRead(PIN_BUTTON) == LOW) {
        collectWithoutDispatching(10);
    }
    return true;
}

/* ── setup / loop ─────────────────────────────────────────────────────── */

void setup() {
    Serial.begin(9600);
    link.begin(9600);

    pinMode(PIN_BUTTON, INPUT_PULLUP);
    pinMode(PIN_BUZZER, OUTPUT);
    for (uint8_t i = 0; i < sc1::MAX_SLOTS; ++i) pinMode(SERVO_PIN[i], OUTPUT);

    pixels.begin();
    pixels.setBrightness(80);
    setRing(COLOUR_IDLE);

    Serial.println(F("SnapCare tray controller"));

    rtcPresent = rtc.begin();
    if (!rtcPresent) {
        Serial.println(F("! no DS3231 — the tray will not dispense without a clock"));
    } else if (rtc.lostPower()) {
        // The dangerous case, and the reason clockTrusted exists: a clock that
        // has lost power still answers, with a plausible wrong time. Dispensing
        // on it would open compartments at the wrong hours while everything
        // looked fine.
        Serial.println(F("! RTC lost power — not dispensing until the clock is set."));
        Serial.println(F("  Show the device an SC1*C* code, or paste one here:"));
        Serial.println(F("  SC1*C*202607251930*5   (2026-07-25 19:30, Saturday; 0=Mon)"));
    } else {
        clockTrusted = true;
    }

    scheduleAnchored = clockTrusted;
    if (restoreSchedule()) {
        Serial.print(F("restored schedule for "));
        Serial.print(scheduler.schedule().count);
        Serial.println(F(" compartment(s)"));
    } else {
        Serial.println(F("no schedule stored; show the device a code or paste SC1 text"));
    }
}

void loop() {
    // Anything received while a servo was moving is acted on first, before new
    // input can overwrite it.
    flushPendingLine();
    pump(Serial);
    pump(link);

    if (awaitingButton) {
        if (buttonPressed()) {
            finishDose(true);
        } else if (millis() - pendingSince > WAIT_FOR_BUTTON_MS) {
            // Nobody came. That is a fact the carer needs, so it is reported
            // as a miss rather than forgotten.
            finishDose(false);
        } else if (millis() - lastChirp > CHIRP_EVERY_MS) {
            lastChirp = millis();
            chirp(880, 80);
        }
        return;   // one dose at a time; do not open another cup on top of it
    }

    if (millis() - lastTick < TICK_MS) return;
    lastTick = millis();
    // No clock, or one nobody has vouched for since it lost power: do nothing.
    // A tray that stays shut is a problem someone notices; a tray that opens at
    // the wrong hour is one they do not.
    if (!rtcPresent || !clockTrusted) return;

    const DateTime t = now();
    const uint32_t day = dayNumber(t);
    const uint8_t weekday = weekdayMondayFirst(t);
    const uint16_t minutes = uint16_t(t.hour()) * 60 + t.minute();

    sc1::Decision d = scheduler.next(day, weekday, minutes);
    if (d.what == sc1::Due::Nothing) return;

    if (d.what == sc1::Due::Missed) {
        // Past its window. Report it, never open it — this is what stops a
        // device that was unplugged all day from emptying three compartments
        // into one hand the moment it is plugged back in.
        Serial.print(F("missed slot "));
        Serial.println(d.slot);
        scheduler.confirm(d, day);
        reportEvent(d.slot, d.minutes, false);
        setRing(COLOUR_MISSED);
        collectWithoutDispatching(800);
        setRing(COLOUR_IDLE);
        return;
    }

    // Mark it done only after the servo has actually run: a jam or a
    // brown-out mid-move must leave the dose owed, not silently delivered.
    beginDose(d);
    scheduler.confirm(d, day);
}

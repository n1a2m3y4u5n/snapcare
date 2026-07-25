/*
 * SC1 — the optical protocol between the SnapCare phone app and the dispenser.
 *
 * This is the device-side half of a contract that exists in three languages:
 *   lib/hardware/protocol.ts                  the phone app
 *   pill_dispenser/form_sheet_parser/schedule.py   the paper sheet reader
 *   this file                                 the firmware
 *
 * All three encode the same bytes, and all three have tests over the same
 * vectors, because a grammar change on one side would otherwise show up as a
 * device that has silently stopped listening. There is no error message for
 * that; it just stops dispensing.
 *
 * Deliberately free of <Arduino.h>. It builds with a plain host compiler, so
 * `make -C firmware/test` runs the contract tests on a laptop instead of
 * requiring a board, a cable and a person to watch the serial monitor.
 *
 * Constraints this is written against
 * -----------------------------------
 * An Uno has 2KB of RAM, so there is no dynamic allocation, no String, no
 * exceptions and no recursion here. Every buffer is a fixed-size caller-owned
 * array, and a whole eight-layer schedule occupies about 140 bytes.
 *
 * The messages
 * ------------
 *   phone -> device   SC1*S*1:0800.2000/2:1800
 *                     slots and times only; whatever is loaded drops daily
 *
 *   phone -> device   SC1*W*1:0800.2000-127-030/3:1900-021-000
 *                     the same, plus a day-of-week mask and a course length,
 *                     which the paper sheet can express and `S` cannot
 *
 *   phone -> device   SC1*C*202607251930*4
 *                     wall-clock time. The device refuses to dispense until it
 *                     has one it can trust; see ClockSet.
 *
 *   device -> phone   SC1*E*1*0800*T*07
 *                     one dose, taken or missed
 *
 * The event message must never exceed MAX_DEVICE_PAYLOAD characters. That is
 * not a style rule: a 128x64 OLED is 64 pixels tall, a QR is square, and with
 * the mandatory four-module quiet zone at two pixels per module only version 1
 * fits — which holds about twenty alphanumeric characters. A longer message
 * cannot be drawn at all, so encodeEvent refuses to produce one.
 */
#ifndef SNAPCARE_SC1_H
#define SNAPCARE_SC1_H

#include <stddef.h>
#include <stdint.h>

namespace sc1 {

/** Physical compartments in the tray. The sheet's LAYER field is 1..8. */
static const uint8_t MAX_SLOTS = 8;
/** Drop times per compartment. Three a day is the practical ceiling; six is slack. */
static const uint8_t MAX_TIMES = 6;
/** Longest device->phone payload the OLED can actually draw. See the header note. */
static const size_t MAX_DEVICE_PAYLOAD = 20;
/** Enough for a full eight-layer weekly plan (205 chars, measured) plus room. */
static const size_t MAX_SCHEDULE_PAYLOAD = 256;

/** Day-of-week bits, Monday first — the order the paper sheet prints them in. */
enum Day : uint8_t {
    MON = 1 << 0, TUE = 1 << 1, WED = 1 << 2, THU = 1 << 3,
    FRI = 1 << 4, SAT = 1 << 5, SUN = 1 << 6,
    EVERY_DAY = 0x7F
};

enum class Kind : uint8_t { Unknown, Schedule, Weekly, Event, Clock };

/**
 * Wall-clock time, sent to the device so it can set its RTC.
 *
 * Why this exists: the dispenser has no keyboard, no screen a person reads,
 * and no network. Its DS3231 keeps time across a power cut on a coin cell, but
 * that cell eventually dies, and a clock that has lost power does not report
 * *no* time — it reports a wrong one, confidently. A tray acting on a wrong
 * clock opens compartments at the wrong hours, which is worse than one that
 * does not open at all.
 *
 * So there has to be a way to set it, and the only channel this device has is
 * the one it already uses: something held in front of the camera. The phone
 * knows the time; a printed or displayed code carries it across the air gap.
 *
 * `SC1*C*202607251930*4`  — 2026-07-25 19:30, a Friday.
 *
 * The weekday is carried rather than computed. Working it out from the date
 * needs calendar arithmetic that costs flash on an AVR and is a classic source
 * of off-by-one bugs, and the sender already knows it.
 */
struct ClockSet {
    uint16_t year;      // 2000..2099
    uint8_t  month;     // 1..12
    uint8_t  day;       // 1..31
    uint8_t  hour;      // 0..23
    uint8_t  minute;    // 0..59
    uint8_t  weekday;   // 0 = Monday .. 6 = Sunday, matching the day mask
};

/**
 * One compartment's plan.
 *
 * Times are minutes since midnight rather than the HHMM of the wire format.
 * HHMM is not a number you can do arithmetic on — 0800 + 30 is not 0830, and
 * "is it time yet" against a wall clock is the single most common operation
 * this struct exists for. Converting once at the parser boundary means the
 * scheduling code cannot get it wrong later.
 */
struct SlotSchedule {
    uint8_t  slot;              // 1..MAX_SLOTS
    uint8_t  count;             // how many of `times` are in use
    uint16_t times[MAX_TIMES];  // minutes since midnight, ascending
    uint8_t  days;              // bitmask of Day; EVERY_DAY for an `S` message
    uint16_t durationDays;      // 0 = ongoing
};

struct Schedule {
    uint8_t count;
    SlotSchedule slots[MAX_SLOTS];

    /** Pointer to the plan for a compartment, or nullptr if it has none. */
    const SlotSchedule* find(uint8_t slot) const;
};

struct DoseEvent {
    uint8_t  slot;      // 1..MAX_SLOTS
    uint16_t minutes;   // the scheduled time this reports on
    bool     taken;     // true = taken, false = missed
    uint8_t  seq;       // 0..99, wraps; lets the phone drop a re-read QR
};

/**
 * Which direction a scanned code belongs to, or Unknown.
 *
 * Always call this first. A camera reads whatever QR is in front of it — a
 * product barcode, a poster, someone's wifi — so "what is this" has to be
 * answerable before "parse this", and every decoder below returns false rather
 * than misinterpreting a stranger's data.
 */
Kind messageKind(const char* payload);

/** Parse `SC1*S*...`. Returns false and leaves `out` untouched on anything malformed. */
bool decodeSchedule(const char* payload, Schedule& out);

/** Parse `SC1*W*...`, which additionally carries the day mask and duration. */
bool decodeWeekly(const char* payload, Schedule& out);

/**
 * Parse either schedule form. This is what the scan loop should call: the
 * phone decides which it sends, and the device has no reason to care.
 */
bool decodeAnySchedule(const char* payload, Schedule& out);

/**
 * Write `SC1*E*...` into `out`.
 *
 * Returns the length written, or 0 if it would not fit in `cap` or would
 * exceed MAX_DEVICE_PAYLOAD. Zero means "do not try to display this" — a
 * truncated QR is not a shorter message, it is an unreadable one, and the
 * phone would either fail to scan or, worse, scan a valid-looking prefix.
 */
size_t encodeEvent(const DoseEvent& e, char* out, size_t cap);

/** Parse `SC1*E*...`. Present so the host tests can prove the round trip. */
bool decodeEvent(const char* payload, DoseEvent& out);

/** Parse `SC1*C*YYYYMMDDHHMM*W`. Returns false on anything that is not a real date. */
bool decodeClock(const char* payload, ClockSet& out);

/** Write `SC1*C*...` into `out` (needs 20 bytes). Returns the length, or 0. */
size_t encodeClock(const ClockSet& c, char* out, size_t cap);

/* ── time helpers ─────────────────────────────────────────────────────── */

/** "0800" -> 480. Returns false unless the field is four digits and a real time. */
bool parseHHMM(const char* text, uint16_t& minutes);

/** 480 -> "0800". `out` needs 5 bytes. */
void formatHHMM(uint16_t minutes, char* out);

/** Is this compartment due on this weekday? `weekday` is 0=Monday..6=Sunday. */
bool dueOnDay(const SlotSchedule& s, uint8_t weekday);

}  // namespace sc1

#endif  // SNAPCARE_SC1_H

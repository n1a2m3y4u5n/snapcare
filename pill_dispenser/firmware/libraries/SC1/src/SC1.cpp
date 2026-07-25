#include "SC1.h"

namespace sc1 {
namespace {

const char PROTOCOL[] = "SC1";
const char SEP = '*';
const char SLOT_SEP = '/';
const char TIME_SEP = '.';
const char ATTR_SEP = '-';

inline bool isDigit(char c) { return c >= '0' && c <= '9'; }

/**
 * Uppercase one character.
 *
 * QR alphanumeric mode only carries capitals, so a code produced by the phone
 * is already uppercase — but not every reader hands the payload back that way,
 * and the app's own TypeScript decoder upper-cases before parsing. Matching
 * that is the difference between the two implementations agreeing and the
 * device rejecting messages a phone considers perfectly valid.
 */
inline char up(char c) { return (c >= 'a' && c <= 'z') ? char(c - 'a' + 'A') : c; }

/** Compare against a literal, case-insensitively, for exactly `n` characters. */
bool matches(const char* s, const char* lit, size_t n) {
    for (size_t i = 0; i < n; ++i) {
        if (s[i] == '\0' || up(s[i]) != lit[i]) return false;
    }
    return true;
}

/**
 * Read digits up to `maxDigits`, advancing `p`.
 *
 * Returns false on no digits, too many, or overflow. Overflow matters: a
 * corrupted scan reading "999999" as a slot number must not wrap into a
 * plausible 1..8 and dispense from the wrong compartment.
 */
bool readUint(const char*& p, uint16_t& value, uint8_t maxDigits) {
    uint32_t acc = 0;
    uint8_t n = 0;
    while (isDigit(*p) && n < maxDigits) {
        acc = acc * 10 + uint32_t(*p - '0');
        if (acc > 0xFFFF) return false;
        ++p;
        ++n;
    }
    if (n == 0 || isDigit(*p)) return false;   // empty, or more digits than allowed
    value = uint16_t(acc);
    return true;
}

/** Insert a time into a slot, keeping the list sorted and rejecting duplicates. */
bool insertTime(SlotSchedule& s, uint16_t minutes) {
    if (s.count >= MAX_TIMES) return false;
    uint8_t i = 0;
    while (i < s.count && s.times[i] < minutes) ++i;
    if (i < s.count && s.times[i] == minutes) return false;   // the same drop twice
    for (uint8_t j = s.count; j > i; --j) s.times[j] = s.times[j - 1];
    s.times[i] = minutes;
    ++s.count;
    return true;
}

/**
 * Parse "<slot>:<HHMM>[.<HHMM>...]", stopping at `stop` or the end.
 *
 * `stop` lets the weekly form reuse this for the part before its first '-'.
 */
bool parseSlotTimes(const char*& p, SlotSchedule& out, char stop) {
    uint16_t slot;
    if (!readUint(p, slot, 2)) return false;
    if (slot < 1 || slot > MAX_SLOTS) return false;   // a compartment we do not have
    if (*p != ':') return false;
    ++p;

    out.slot = uint8_t(slot);
    out.count = 0;
    out.days = EVERY_DAY;
    out.durationDays = 0;

    for (;;) {
        uint16_t minutes;
        if (!parseHHMM(p, minutes)) return false;
        p += 4;
        if (!insertTime(out, minutes)) return false;
        if (*p == TIME_SEP) { ++p; continue; }
        break;
    }
    return *p == '\0' || *p == SLOT_SEP || (stop != '\0' && *p == stop);
}

/** Append a slot to a schedule, refusing a second plan for the same compartment. */
bool addSlot(Schedule& out, const SlotSchedule& s) {
    if (out.count >= MAX_SLOTS) return false;
    for (uint8_t i = 0; i < out.count; ++i) {
        if (out.slots[i].slot == s.slot) return false;
    }
    out.slots[out.count++] = s;
    return true;
}

/** Skip the "SC1*" prefix and the kind letter; returns the body or nullptr. */
const char* body(const char* payload, char kind) {
    if (!payload) return nullptr;
    while (*payload == ' ') ++payload;
    if (!matches(payload, PROTOCOL, 3)) return nullptr;
    if (payload[3] != SEP) return nullptr;
    if (up(payload[4]) != kind) return nullptr;
    if (payload[5] != SEP) return nullptr;
    return payload + 6;
}

}  // namespace

const SlotSchedule* Schedule::find(uint8_t slot) const {
    for (uint8_t i = 0; i < count; ++i) {
        if (slots[i].slot == slot) return &slots[i];
    }
    return nullptr;
}

/* ── time ─────────────────────────────────────────────────────────────── */

bool parseHHMM(const char* text, uint16_t& minutes) {
    if (!text) return false;
    for (uint8_t i = 0; i < 4; ++i) {
        if (!isDigit(text[i])) return false;
    }
    uint8_t h = uint8_t((text[0] - '0') * 10 + (text[1] - '0'));
    uint8_t m = uint8_t((text[2] - '0') * 10 + (text[3] - '0'));
    if (h > 23 || m > 59) return false;
    minutes = uint16_t(h) * 60 + m;
    return true;
}

void formatHHMM(uint16_t minutes, char* out) {
    uint16_t h = (minutes / 60) % 24;
    uint16_t m = minutes % 60;
    out[0] = char('0' + h / 10);
    out[1] = char('0' + h % 10);
    out[2] = char('0' + m / 10);
    out[3] = char('0' + m % 10);
    out[4] = '\0';
}

bool dueOnDay(const SlotSchedule& s, uint8_t weekday) {
    if (weekday > 6) return false;
    return (s.days & uint8_t(1 << weekday)) != 0;
}

/* ── inbound ──────────────────────────────────────────────────────────── */

Kind messageKind(const char* payload) {
    if (!payload) return Kind::Unknown;
    while (*payload == ' ') ++payload;
    if (!matches(payload, PROTOCOL, 3) || payload[3] != SEP) return Kind::Unknown;
    switch (up(payload[4])) {
        case 'S': return Kind::Schedule;
        case 'W': return Kind::Weekly;
        case 'E': return Kind::Event;
        case 'C': return Kind::Clock;
        default:  return Kind::Unknown;
    }
}

namespace {

/** Days in a month, with the leap rule the DS3231 also uses (2000-2099). */
uint8_t daysInMonth(uint16_t year, uint8_t month) {
    static const uint8_t LENGTH[12] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
    if (month < 1 || month > 12) return 0;
    if (month == 2 && (year % 4) == 0 && ((year % 100) != 0 || (year % 400) == 0)) return 29;
    return LENGTH[month - 1];
}

/** Read exactly `n` digits into `value`, advancing `p`. */
bool readFixed(const char*& p, uint16_t& value, uint8_t n) {
    uint16_t acc = 0;
    for (uint8_t i = 0; i < n; ++i) {
        if (!isDigit(p[i])) return false;
        acc = uint16_t(acc * 10 + uint16_t(p[i] - '0'));
    }
    p += n;
    value = acc;
    return true;
}

}  // namespace

bool decodeClock(const char* payload, ClockSet& out) {
    const char* p = body(payload, 'C');
    if (!p) return false;

    uint16_t year, month, day, hour, minute, weekday;
    if (!readFixed(p, year, 4)) return false;
    if (!readFixed(p, month, 2)) return false;
    if (!readFixed(p, day, 2)) return false;
    if (!readFixed(p, hour, 2)) return false;
    if (!readFixed(p, minute, 2)) return false;
    if (*p != SEP) return false;
    ++p;
    if (!readFixed(p, weekday, 1)) return false;
    if (*p != '\0') return false;

    // The DS3231 stores a two-digit year against a century bit; outside this
    // range the value it reads back would not be the one that was written.
    if (year < 2000 || year > 2099) return false;
    if (day < 1 || day > daysInMonth(year, uint8_t(month))) return false;
    if (hour > 23 || minute > 59 || weekday > 6) return false;

    out.year = year;
    out.month = uint8_t(month);
    out.day = uint8_t(day);
    out.hour = uint8_t(hour);
    out.minute = uint8_t(minute);
    out.weekday = uint8_t(weekday);
    return true;
}

size_t encodeClock(const ClockSet& c, char* out, size_t cap) {
    if (!out || cap < 20) return 0;
    if (c.year < 2000 || c.year > 2099) return 0;
    if (c.month < 1 || c.month > 12) return 0;
    if (c.day < 1 || c.day > daysInMonth(c.year, c.month)) return 0;
    if (c.hour > 23 || c.minute > 59 || c.weekday > 6) return 0;

    size_t n = 0;
    auto put = [&](char ch) { out[n++] = ch; };
    put('S'); put('C'); put('1'); put(SEP); put('C'); put(SEP);
    put(char('0' + c.year / 1000));
    put(char('0' + (c.year / 100) % 10));
    put(char('0' + (c.year / 10) % 10));
    put(char('0' + c.year % 10));
    put(char('0' + c.month / 10));  put(char('0' + c.month % 10));
    put(char('0' + c.day / 10));    put(char('0' + c.day % 10));
    put(char('0' + c.hour / 10));   put(char('0' + c.hour % 10));
    put(char('0' + c.minute / 10)); put(char('0' + c.minute % 10));
    put(SEP);
    put(char('0' + c.weekday));
    out[n] = '\0';
    return n;
}

bool decodeSchedule(const char* payload, Schedule& out) {
    const char* p = body(payload, 'S');
    if (!p) return false;

    Schedule parsed;
    parsed.count = 0;
    if (*p == '\0') { out = parsed; return true; }   // an empty schedule clears the tray

    for (;;) {
        SlotSchedule s;
        if (!parseSlotTimes(p, s, '\0')) return false;
        if (!addSlot(parsed, s)) return false;
        if (*p == SLOT_SEP) { ++p; continue; }
        break;
    }
    if (*p != '\0') return false;

    out = parsed;
    return true;
}

bool decodeWeekly(const char* payload, Schedule& out) {
    const char* p = body(payload, 'W');
    if (!p) return false;

    Schedule parsed;
    parsed.count = 0;
    if (*p == '\0') { out = parsed; return true; }

    for (;;) {
        SlotSchedule s;
        if (!parseSlotTimes(p, s, ATTR_SEP)) return false;
        if (*p != ATTR_SEP) return false;
        ++p;

        uint16_t mask;
        if (!readUint(p, mask, 3)) return false;
        // A mask of zero would be a compartment that is loaded but never opens.
        // That is not a schedule, it is a way to lose a course of medication.
        if (mask == 0 || mask > EVERY_DAY) return false;
        s.days = uint8_t(mask);

        if (*p != ATTR_SEP) return false;
        ++p;
        if (!readUint(p, s.durationDays, 3)) return false;

        if (!addSlot(parsed, s)) return false;
        if (*p == SLOT_SEP) { ++p; continue; }
        break;
    }
    if (*p != '\0') return false;

    out = parsed;
    return true;
}

bool decodeAnySchedule(const char* payload, Schedule& out) {
    switch (messageKind(payload)) {
        case Kind::Schedule: return decodeSchedule(payload, out);
        case Kind::Weekly:   return decodeWeekly(payload, out);
        default:             return false;
    }
}

/* ── outbound ─────────────────────────────────────────────────────────── */

size_t encodeEvent(const DoseEvent& e, char* out, size_t cap) {
    if (!out || cap == 0) return 0;
    if (e.slot < 1 || e.slot > 99) return 0;
    if (e.minutes >= 24 * 60) return 0;

    char hhmm[5];
    formatHHMM(e.minutes, hhmm);
    const uint8_t seq = e.seq % 100;

    char buf[MAX_DEVICE_PAYLOAD + 1];
    size_t n = 0;
    auto put = [&](char c) { if (n < MAX_DEVICE_PAYLOAD) buf[n++] = c; else n = MAX_DEVICE_PAYLOAD + 1; };

    put('S'); put('C'); put('1'); put(SEP);
    put('E'); put(SEP);
    if (e.slot >= 10) put(char('0' + e.slot / 10));
    put(char('0' + e.slot % 10));
    put(SEP);
    for (uint8_t i = 0; i < 4; ++i) put(hhmm[i]);
    put(SEP);
    put(e.taken ? 'T' : 'M');
    put(SEP);
    put(char('0' + seq / 10));
    put(char('0' + seq % 10));

    // n only exceeds the limit if `put` overflowed, which means this message
    // cannot be drawn on the screen. Say so by writing nothing at all — a
    // truncated QR is not a shorter message, it is an unreadable one.
    if (n > MAX_DEVICE_PAYLOAD || n + 1 > cap) return 0;

    for (size_t i = 0; i < n; ++i) out[i] = buf[i];
    out[n] = '\0';
    return n;
}

bool decodeEvent(const char* payload, DoseEvent& out) {
    const char* p = body(payload, 'E');
    if (!p) return false;

    uint16_t slot;
    if (!readUint(p, slot, 2)) return false;
    if (slot < 1 || slot > 99) return false;
    if (*p != SEP) return false;
    ++p;

    uint16_t minutes;
    if (!parseHHMM(p, minutes)) return false;
    p += 4;
    if (*p != SEP) return false;
    ++p;

    const char flag = up(*p);
    if (flag != 'T' && flag != 'M') return false;
    ++p;
    if (*p != SEP) return false;
    ++p;

    uint16_t seq;
    if (!readUint(p, seq, 2)) return false;
    if (seq > 99 || *p != '\0') return false;

    out.slot = uint8_t(slot);
    out.minutes = minutes;
    out.taken = (flag == 'T');
    out.seq = uint8_t(seq);
    return true;
}

}  // namespace sc1

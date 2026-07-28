/*
 * The firmware's half of the SC1 contract, tested on the host.
 *
 * Every vector here also appears in lib/hardware/protocol.test.ts or in
 * form_sheet_parser/tests/test_schedule.py. That duplication is the point: the
 * three implementations do not share code, so the only thing keeping them
 * speaking the same language is that all three assert on the same literal
 * bytes. If someone changes the grammar in one place, a suite fails here
 * instead of a dispenser quietly ignoring every code the phone shows it.
 *
 *   make -C pill_dispenser/firmware/test
 *
 * No framework, no dependencies, no board — just a compiler.
 */
#include <cstdio>
#include <cstring>

#include "SC1.h"

static int failures = 0;
static int checks = 0;

#define CHECK(cond)                                                            \
    do {                                                                       \
        ++checks;                                                              \
        if (!(cond)) {                                                         \
            ++failures;                                                        \
            std::printf("  FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond);      \
        }                                                                      \
    } while (0)

#define CHECK_STR(got, want)                                                   \
    do {                                                                       \
        ++checks;                                                              \
        if (std::strcmp((got), (want)) != 0) {                                 \
            ++failures;                                                        \
            std::printf("  FAIL %s:%d  got \"%s\", want \"%s\"\n",             \
                        __FILE__, __LINE__, (got), (want));                    \
        }                                                                      \
    } while (0)

static void section(const char* name) { std::printf("%s\n", name); }

/* ── sorting out what was scanned ─────────────────────────────────────── */

static void test_message_kind() {
    section("tells the three message kinds apart, and refuses everything else");
    CHECK(sc1::messageKind("SC1*S*1:0800") == sc1::Kind::Schedule);
    CHECK(sc1::messageKind("SC1*W*1:0800-127-030") == sc1::Kind::Weekly);
    CHECK(sc1::messageKind("SC1*E*1*0800*T*01") == sc1::Kind::Event);

    // The camera sees whatever is in front of it. None of this may parse.
    CHECK(sc1::messageKind("https://example.com") == sc1::Kind::Unknown);
    CHECK(sc1::messageKind("WIFI:S:home;T:WPA;P:hunter2;;") == sc1::Kind::Unknown);
    CHECK(sc1::messageKind("SC1*X*1:0800") == sc1::Kind::Unknown);
    CHECK(sc1::messageKind("SC2*S*1:0800") == sc1::Kind::Unknown);
    CHECK(sc1::messageKind("") == sc1::Kind::Unknown);
    CHECK(sc1::messageKind(nullptr) == sc1::Kind::Unknown);
}

/* ── phone -> device ──────────────────────────────────────────────────── */

static void test_schedule_vector_from_the_app() {
    section("parses the exact payload protocol.test.ts asserts on");
    // From lib/hardware/protocol.test.ts.
    sc1::Schedule s;
    CHECK(sc1::decodeSchedule("SC1*S*1:0800.2000/2:1800", s));
    CHECK(s.count == 2);

    const sc1::SlotSchedule* one = s.find(1);
    CHECK(one != nullptr);
    CHECK(one->count == 2);
    CHECK(one->times[0] == 8 * 60);
    CHECK(one->times[1] == 20 * 60);
    // An `S` message carries no day mask, so every day is the only reading of it.
    CHECK(one->days == sc1::EVERY_DAY);
    CHECK(one->durationDays == 0);

    const sc1::SlotSchedule* two = s.find(2);
    CHECK(two != nullptr);
    CHECK(two->count == 1);
    CHECK(two->times[0] == 18 * 60);

    CHECK(s.find(3) == nullptr);
}

static void test_weekly_vector_from_the_sheet_reader() {
    section("parses the weekly form the paper sheet produces");
    // From form_sheet_parser/tests/test_schedule.py.
    sc1::Schedule s;
    CHECK(sc1::decodeWeekly("SC1*W*1:0800.2000-127-030/3:1900-021-000", s));
    CHECK(s.count == 2);

    const sc1::SlotSchedule* a = s.find(1);
    CHECK(a != nullptr);
    CHECK(a->count == 2);
    CHECK(a->days == sc1::EVERY_DAY);
    CHECK(a->durationDays == 30);

    const sc1::SlotSchedule* b = s.find(3);
    CHECK(b != nullptr);
    CHECK(b->days == (sc1::MON | sc1::WED | sc1::FRI));   // 21 = 0b0010101
    CHECK(b->durationDays == 0);                          // ongoing
    CHECK(b->times[0] == 19 * 60);

    // A Monday/Wednesday/Friday course opens on those days and no others.
    CHECK(sc1::dueOnDay(*b, 0));    // Monday
    CHECK(!sc1::dueOnDay(*b, 1));   // Tuesday
    CHECK(sc1::dueOnDay(*b, 2));
    CHECK(!sc1::dueOnDay(*b, 3));
    CHECK(sc1::dueOnDay(*b, 4));
    CHECK(!sc1::dueOnDay(*b, 5));
    CHECK(!sc1::dueOnDay(*b, 6));
    CHECK(!sc1::dueOnDay(*b, 7));   // not a weekday at all
}

static void test_either_schedule_form_is_accepted() {
    section("the scan loop does not have to care which form arrived");
    sc1::Schedule s;
    CHECK(sc1::decodeAnySchedule("SC1*S*4:0730", s) && s.count == 1);
    CHECK(sc1::decodeAnySchedule("SC1*W*4:0730-127-007", s) && s.count == 1);
    CHECK(!sc1::decodeAnySchedule("SC1*E*1*0800*T*01", s));
}

static void test_a_full_tray_fits() {
    section("an eight-layer, thrice-daily plan fits in the fixed buffers");
    sc1::Schedule s;
    CHECK(sc1::decodeWeekly(
        "SC1*W*1:0800.1300.2000-127-030/2:0800.1300.2000-127-030"
        "/3:0800.1300.2000-127-030/4:0800.1300.2000-127-030"
        "/5:0800.1300.2000-127-030/6:0800.1300.2000-127-030"
        "/7:0800.1300.2000-127-030/8:0800.1300.2000-127-030", s));
    CHECK(s.count == 8);
    for (uint8_t i = 0; i < s.count; ++i) CHECK(s.slots[i].count == 3);
}

static void test_times_come_back_sorted_and_deduplicated() {
    section("times are ordered, however the phone listed them");
    sc1::Schedule s;
    CHECK(sc1::decodeSchedule("SC1*S*1:2000.0800.1300", s));
    CHECK(s.slots[0].count == 3);
    CHECK(s.slots[0].times[0] == 8 * 60);
    CHECK(s.slots[0].times[1] == 13 * 60);
    CHECK(s.slots[0].times[2] == 20 * 60);

    // The same drop listed twice is a corrupted message, not a double dose.
    CHECK(!sc1::decodeSchedule("SC1*S*1:0800.0800", s));
}

static void test_an_empty_schedule_clears_the_tray() {
    section("an empty body is a valid instruction, not a parse failure");
    sc1::Schedule s;
    s.count = 5;
    CHECK(sc1::decodeSchedule("SC1*S*", s));
    CHECK(s.count == 0);
}

static void test_malformed_schedules_are_rejected() {
    section("nothing malformed becomes a schedule");
    const char* bad[] = {
        "",
        "SC1*S",
        "SC1*S*1",                    // no times
        "SC1*S*1:",                   // still no times
        "SC1*S*1:080",                // three digits
        "SC1*S*1:2599",               // 25:99
        "SC1*S*1:2400",               // 24:00 is tomorrow's 00:00
        "SC1*S*0:0800",               // compartments start at 1
        "SC1*S*9:0800",               // ...and this tray has eight
        "SC1*S*99999:0800",           // must not wrap into a valid slot
        "SC1*S*1:0800/1:1200",        // one compartment, two plans
        "SC1*S*1:0800/",              // trailing separator
        "SC1*S*1:0800.",              // trailing time separator
        "SC1*S*1:0800.1200.1300.1400.1500.1600.1700",   // more times than MAX_TIMES
        "SC1*W*1:0800",               // weekly form missing its attributes
        "SC1*W*1:0800-127",           // ...and missing one of them
        "SC1*W*1:0800-000-030",       // a mask that never fires
        "SC1*W*1:0800-128-030",       // a day that does not exist
        "SC1*W*1:0800-127-030-9",     // an attribute too many
        "https://example.com",
    };
    for (const char* p : bad) {
        sc1::Schedule out;
        out.count = 0xEE;
        const bool okS = sc1::decodeSchedule(p, out);
        const bool okW = sc1::decodeWeekly(p, out);
        if (okS || okW) {
            ++failures;
            std::printf("  FAIL accepted malformed payload \"%s\"\n", p);
        }
        ++checks;
        // A rejected parse must not have half-written the caller's schedule.
        CHECK(out.count == 0xEE);
    }
}

/* ── device -> phone ──────────────────────────────────────────────────── */

static void test_event_vector_from_the_app() {
    section("emits the exact event payload protocol.test.ts asserts on");
    char buf[64];
    sc1::DoseEvent e{1, 8 * 60, true, 7};
    const size_t n = sc1::encodeEvent(e, buf, sizeof buf);
    CHECK(n == 17);
    CHECK_STR(buf, "SC1*E*1*0800*T*07");

    sc1::DoseEvent back;
    CHECK(sc1::decodeEvent(buf, back));
    CHECK(back.slot == 1 && back.minutes == 8 * 60 && back.taken && back.seq == 7);

    sc1::DoseEvent missed{3, 19 * 60 + 30, false, 12};
    CHECK(sc1::encodeEvent(missed, buf, sizeof buf) > 0);
    CHECK_STR(buf, "SC1*E*3*1930*M*12");
    CHECK(sc1::decodeEvent(buf, back) && !back.taken);
}

static void test_every_event_fits_the_oled() {
    section("no event the device can generate exceeds the screen's 20 characters");
    // The wall is physical: 64px of OLED height, a square QR, a four-module
    // quiet zone, two pixels per module -> version 1 -> about 20 characters.
    char buf[64];
    for (uint8_t slot = 1; slot <= sc1::MAX_SLOTS; ++slot) {
        for (uint16_t m = 0; m < 24 * 60; m += 7) {
            for (uint8_t seq = 0; seq < 100; seq += 9) {
                sc1::DoseEvent e{slot, m, (seq % 2) == 0, seq};
                const size_t n = sc1::encodeEvent(e, buf, sizeof buf);
                if (n == 0 || n > sc1::MAX_DEVICE_PAYLOAD) {
                    ++failures;
                    std::printf("  FAIL slot=%u min=%u seq=%u -> %zu chars\n",
                                slot, m, seq, n);
                    return;
                }
                ++checks;
            }
        }
    }
}

static void test_an_unencodable_event_writes_nothing() {
    section("refuses rather than truncating");
    char buf[64];
    std::memset(buf, 'x', sizeof buf);
    sc1::DoseEvent bad{200, 8 * 60, true, 1};        // no such compartment
    CHECK(sc1::encodeEvent(bad, buf, sizeof buf) == 0);
    CHECK(buf[0] == 'x');                             // caller's buffer untouched

    sc1::DoseEvent late{1, 24 * 60, true, 1};         // not a time of day
    CHECK(sc1::encodeEvent(late, buf, sizeof buf) == 0);

    // A caller's buffer too small to hold the message gets nothing, not a
    // prefix that would encode to a scannable but wrong QR.
    sc1::DoseEvent fine{1, 8 * 60, true, 7};
    CHECK(sc1::encodeEvent(fine, buf, 10) == 0);
    CHECK(sc1::encodeEvent(fine, buf, 18) == 17);
}

static void test_malformed_events_are_rejected() {
    section("nothing malformed becomes a dose record");
    const char* bad[] = {
        "SC1*E*1*0800",             // fields missing
        "SC1*E*1*0800*X*01",        // neither taken nor missed
        "SC1*E*1*0800*T",           // no sequence number
        "SC1*E*1*0800*T*011",       // sequence out of range
        "SC1*E*0*0800*T*01",        // compartments start at 1
        "SC1*E*1*2500*T*01",        // not a time
        "SC1*E*1*0800*T*01*9",      // trailing rubbish
        "SC1*S*1:0800",             // the other direction
        "",
    };
    for (const char* p : bad) {
        sc1::DoseEvent out;
        if (sc1::decodeEvent(p, out)) {
            ++failures;
            std::printf("  FAIL accepted malformed event \"%s\"\n", p);
        }
        ++checks;
    }
}

/* ── shared conventions ───────────────────────────────────────────────── */

static void test_case_is_ignored_on_the_way_in() {
    section("lower case is accepted, as the app's decoder also does");
    // QR alphanumeric mode only carries capitals, but not every reader hands
    // the payload back that way. protocol.test.ts asserts the same tolerance.
    sc1::Schedule s;
    CHECK(sc1::decodeSchedule("sc1*s*1:0800", s) && s.count == 1);
    sc1::DoseEvent e;
    CHECK(sc1::decodeEvent("sc1*e*1*0800*t*01", e) && e.slot == 1 && e.taken);
}

static void test_time_helpers_round_trip() {
    section("HHMM and minutes-since-midnight agree in both directions");
    char buf[5];
    for (uint16_t m = 0; m < 24 * 60; ++m) {
        sc1::formatHHMM(m, buf);
        uint16_t back = 0xFFFF;
        CHECK(sc1::parseHHMM(buf, back));
        CHECK(back == m);
    }
    uint16_t ignored;
    CHECK(!sc1::parseHHMM("2400", ignored));
    CHECK(!sc1::parseHHMM("0060", ignored));
    CHECK(!sc1::parseHHMM("08:0", ignored));
    CHECK(!sc1::parseHHMM("abcd", ignored));
}

static void test_the_structs_stay_small_enough_for_an_uno() {
    section("a whole schedule still fits an ATmega328P's 2KB of RAM");
    // If this ever fails, the Arduino build has quietly stopped fitting and
    // the symptom on hardware would be stack corruption, not a compile error.
    CHECK(sizeof(sc1::Schedule) <= 256);
    CHECK(sizeof(sc1::DoseEvent) <= 8);
}


/* ── setting the clock ────────────────────────────────────────────────── */

static void test_a_clock_message_round_trips() {
    section("wall-clock time survives the trip to the device");
    char buf[32];
    sc1::ClockSet set{2026, 7, 25, 19, 30, 5};   // a Saturday
    const size_t n = sc1::encodeClock(set, buf, sizeof buf);
    // Exactly 20 characters — the same wall the dose event lives under, so a
    // clock code can be shown on the device's own screen as well as read by it.
    CHECK(n == sc1::MAX_DEVICE_PAYLOAD);
    CHECK_STR(buf, "SC1*C*202607251930*5");

    sc1::ClockSet back;
    CHECK(sc1::decodeClock(buf, back));
    CHECK(back.year == 2026 && back.month == 7 && back.day == 25);
    CHECK(back.hour == 19 && back.minute == 30 && back.weekday == 5);

    CHECK(sc1::messageKind(buf) == sc1::Kind::Clock);
    // It is not a schedule, whatever else it is.
    sc1::Schedule ignored;
    CHECK(!sc1::decodeAnySchedule(buf, ignored));
}

static void test_a_clock_message_fits_the_device_screen() {
    section("a clock code is small enough to display too");
    char buf[32];
    sc1::ClockSet latest{2099, 12, 31, 23, 59, 6};
    const size_t n = sc1::encodeClock(latest, buf, sizeof buf);
    CHECK(n > 0 && n <= sc1::MAX_DEVICE_PAYLOAD);
}

static void test_impossible_dates_are_refused() {
    section("nothing that is not a real moment sets the clock");
    // A wrong clock is worse than no clock: the tray opens at wrong hours and
    // nothing about it looks broken.
    const char* bad[] = {
        "SC1*C*202602301200*4",   // 30 February
        "SC1*C*202513321200*4",   // month 13, day 32
        "SC1*C*202607252500*4",   // 25 o'clock
        "SC1*C*202607251960*4",   // 60 minutes
        "SC1*C*202607251930*7",   // eight days in the week
        "SC1*C*199912311200*4",   // before the DS3231's century
        "SC1*C*210001011200*4",   // after it
        "SC1*C*2026072519304",    // separator missing
        "SC1*C*20260725193*4",    // a digit short
        "SC1*C*202607251930*44",  // a digit too many
        "SC1*C**4",
        "SC1*S*1:0800",
    };
    for (const char* p : bad) {
        sc1::ClockSet out;
        if (sc1::decodeClock(p, out)) {
            ++failures;
            std::printf("  FAIL accepted impossible clock \"%s\"\n", p);
        }
        ++checks;
    }
}

static void test_leap_days_are_handled_the_way_the_rtc_does() {
    section("29 February exists in 2028 and not in 2027");
    sc1::ClockSet out;
    CHECK(sc1::decodeClock("SC1*C*202802291200*1", out));
    CHECK(!sc1::decodeClock("SC1*C*202702291200*0", out));
    // 2000 is a leap year (divisible by 400); the DS3231 agrees.
    CHECK(sc1::decodeClock("SC1*C*200002291200*1", out));
    // 2100 would not be, but it is outside the supported century anyway.
    CHECK(!sc1::decodeClock("SC1*C*210002281200*1", out));
}

int main() {
    test_message_kind();
    test_a_clock_message_round_trips();
    test_a_clock_message_fits_the_device_screen();
    test_impossible_dates_are_refused();
    test_leap_days_are_handled_the_way_the_rtc_does();
    test_schedule_vector_from_the_app();
    test_weekly_vector_from_the_sheet_reader();
    test_either_schedule_form_is_accepted();
    test_a_full_tray_fits();
    test_times_come_back_sorted_and_deduplicated();
    test_an_empty_schedule_clears_the_tray();
    test_malformed_schedules_are_rejected();
    test_event_vector_from_the_app();
    test_every_event_fits_the_oled();
    test_an_unencodable_event_writes_nothing();
    test_malformed_events_are_rejected();
    test_case_is_ignored_on_the_way_in();
    test_time_helpers_round_trip();
    test_the_structs_stay_small_enough_for_an_uno();

    std::printf("\n%d checks, %d failures\n", checks, failures);
    if (failures == 0) std::printf("SC1 firmware matches the protocol contract.\n");
    return failures == 0 ? 0 : 1;
}

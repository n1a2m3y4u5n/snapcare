/*
 * The scheduler, driven against a simulated clock.
 *
 * These are the tests that would otherwise cost a week of watching a tray.
 * Every case here is a way a real dispenser goes wrong: firing a dose twice,
 * skipping a day, emptying itself after a power cut, dispensing on the wrong
 * weekday, or running a 30-day course forever.
 *
 *   make -C pill_dispenser/firmware/test
 */
#include <cstdio>
#include <cstring>

#include "Scheduler.h"

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

static void section(const char* name) { std::printf("%s\n", name); }

static sc1::Schedule parse(const char* payload) {
    sc1::Schedule s;
    s.count = 0;
    if (!sc1::decodeAnySchedule(payload, s)) {
        std::printf("  FAIL could not parse test schedule \"%s\"\n", payload);
        ++failures;
    }
    return s;
}

/**
 * Run a whole day minute by minute, carrying out whatever is owed.
 * Returns how many compartments were opened, and records the order.
 */
struct DayLog {
    int dispensed = 0;
    int missed = 0;
    char trace[256] = {0};

    void note(const sc1::Decision& d) {
        char buf[32];
        std::snprintf(buf, sizeof buf, "%s%u@%02u%02u ",
                      d.what == sc1::Due::Dispense ? "" : "!",
                      d.slot, d.minutes / 60, d.minutes % 60);
        std::strncat(trace, buf, sizeof(trace) - std::strlen(trace) - 1);
    }
};

static DayLog runDay(sc1::Scheduler& s, uint32_t day, uint8_t weekday,
                     uint16_t from = 0, uint16_t to = 24 * 60 - 1) {
    DayLog log;
    for (uint16_t m = from; m <= to; ++m) {
        for (;;) {
            sc1::Decision d = s.next(day, weekday, m);
            if (d.what == sc1::Due::Nothing) break;
            if (d.what == sc1::Due::Dispense) ++log.dispensed; else ++log.missed;
            log.note(d);
            s.confirm(d, day);
        }
    }
    return log;
}

/* ── the everyday case ────────────────────────────────────────────────── */

static void test_a_daily_dose_fires_once_a_day() {
    section("a daily dose opens once, on the minute, and not again");
    sc1::Scheduler s;
    s.load(parse("SC1*S*1:0800"), 0);

    // Nothing before its time.
    CHECK(s.next(0, 0, 7 * 60 + 59).what == sc1::Due::Nothing);

    sc1::Decision d = s.next(0, 0, 8 * 60);
    CHECK(d.what == sc1::Due::Dispense);
    CHECK(d.slot == 1);
    CHECK(d.minutes == 8 * 60);
    s.confirm(d, 0);

    // The rest of the day owes nothing — this is the double-dose guard.
    for (uint16_t m = 8 * 60; m < 24 * 60; ++m) {
        CHECK(s.next(0, 0, m).what == sc1::Due::Nothing);
    }

    // Tomorrow it is due again.
    CHECK(s.next(1, 1, 8 * 60).what == sc1::Due::Dispense);
}

static void test_polling_repeatedly_does_not_multiply_doses() {
    section("asking many times before acting still yields one dose");
    // A real loop calls next() thousands of times a minute. Only confirm()
    // may retire a dose, so an unconfirmed one must stay exactly one dose.
    sc1::Scheduler s;
    s.load(parse("SC1*S*2:0900"), 0);
    for (int i = 0; i < 500; ++i) {
        sc1::Decision d = s.next(0, 0, 9 * 60 + 5);
        CHECK(d.what == sc1::Due::Dispense && d.slot == 2);
    }
    sc1::Decision d = s.next(0, 0, 9 * 60 + 5);
    s.confirm(d, 0);
    CHECK(s.next(0, 0, 9 * 60 + 5).what == sc1::Due::Nothing);
}

static void test_a_full_day_of_a_full_tray() {
    section("eight compartments, three doses each, over one day");
    sc1::Scheduler s;
    s.load(parse("SC1*W*1:0800.1300.2000-127-000/2:0800.1300.2000-127-000"
                 "/3:0800.1300.2000-127-000/4:0800.1300.2000-127-000"
                 "/5:0800.1300.2000-127-000/6:0800.1300.2000-127-000"
                 "/7:0800.1300.2000-127-000/8:0800.1300.2000-127-000"), 0);
    DayLog log = runDay(s, 0, 0);
    CHECK(log.dispensed == 24);
    CHECK(log.missed == 0);

    // And the next day repeats exactly, rather than drifting or doubling.
    DayLog second = runDay(s, 1, 1);
    CHECK(second.dispensed == 24);
    CHECK(second.missed == 0);
}

/* ── days of the week ─────────────────────────────────────────────────── */

static void test_a_weekday_course_skips_the_days_it_should() {
    section("a Mon/Wed/Fri course opens on exactly those days");
    sc1::Scheduler s;
    s.load(parse("SC1*W*3:0800-021-000"), 0);      // 21 = MON|WED|FRI

    const bool expected[7] = {true, false, true, false, true, false, false};
    for (uint8_t wd = 0; wd < 7; ++wd) {
        DayLog log = runDay(s, wd, wd);
        CHECK(log.dispensed == (expected[wd] ? 1 : 0));
        CHECK(log.missed == 0);
    }
}

static void test_an_s_message_means_every_day() {
    section("a schedule with no day mask runs all seven days");
    sc1::Scheduler s;
    s.load(parse("SC1*S*1:0800"), 0);
    for (uint8_t wd = 0; wd < 7; ++wd) {
        CHECK(runDay(s, wd, wd).dispensed == 1);
    }
}

/* ── the dangerous case ───────────────────────────────────────────────── */

static void test_a_power_cut_does_not_empty_the_tray() {
    section("coming back after hours off does not deliver every missed dose");
    // The failure this guards against is a device that was unplugged all day,
    // is plugged back in at 22:00, and immediately dispenses breakfast, lunch
    // and dinner into one hand.
    sc1::Scheduler s;
    s.load(parse("SC1*S*1:0800.1300.2000"), 0);

    DayLog log = runDay(s, 0, 0, 22 * 60);          // first tick of the day is 22:00
    CHECK(log.dispensed == 0);
    CHECK(log.missed == 3);
}

static void test_a_late_dose_inside_the_grace_window_is_still_given() {
    section("a dose noticed twenty minutes late is late, not lost");
    sc1::Scheduler s(60);
    s.load(parse("SC1*S*1:0800"), 0);
    sc1::Decision d = s.next(0, 0, 8 * 60 + 20);
    CHECK(d.what == sc1::Due::Dispense);
    CHECK(d.minutes == 8 * 60);
}

static void test_a_dose_past_the_grace_window_is_reported_missed() {
    section("past the window it is reported, never quietly dropped");
    sc1::Scheduler s(60);
    s.load(parse("SC1*S*1:0800"), 0);
    sc1::Decision d = s.next(0, 0, 9 * 60 + 1);
    CHECK(d.what == sc1::Due::Missed);
    CHECK(d.slot == 1);
    CHECK(d.minutes == 8 * 60);

    // Once reported it is settled — otherwise it would be re-reported forever.
    s.confirm(d, 0);
    CHECK(s.next(0, 0, 9 * 60 + 1).what == sc1::Due::Nothing);
}

static void test_pending_doses_come_out_in_time_order() {
    section("after a gap, the earliest outstanding dose is handled first");
    // A carer reading the log needs the 08:00 dose to appear before the 13:00
    // one, whatever order the compartments happen to sit in.
    sc1::Scheduler s(24 * 60);                       // generous window: all dispensable
    s.load(parse("SC1*S*3:2000/1:0800/2:1300"), 0);

    sc1::Decision first = s.next(0, 0, 21 * 60);
    CHECK(first.minutes == 8 * 60 && first.slot == 1);
    s.confirm(first, 0);

    sc1::Decision second = s.next(0, 0, 21 * 60);
    CHECK(second.minutes == 13 * 60 && second.slot == 2);
    s.confirm(second, 0);

    sc1::Decision third = s.next(0, 0, 21 * 60);
    CHECK(third.minutes == 20 * 60 && third.slot == 3);
    s.confirm(third, 0);

    CHECK(s.next(0, 0, 21 * 60).what == sc1::Due::Nothing);
}

static void test_an_unconfirmed_dose_is_not_lost_when_the_clock_moves_on() {
    section("a servo that failed leaves the dose owed, not silently dropped");
    sc1::Scheduler s(60);
    s.load(parse("SC1*S*1:0800"), 0);
    // Caller asks, then fails to act (no confirm) — a jam, a brown-out.
    CHECK(s.next(0, 0, 8 * 60).what == sc1::Due::Dispense);
    // Still owed a minute later.
    CHECK(s.next(0, 0, 8 * 60 + 1).what == sc1::Due::Dispense);
    // And once the window closes it becomes a reportable miss rather than
    // vanishing.
    CHECK(s.next(0, 0, 10 * 60).what == sc1::Due::Missed);
}

/* ── course length ────────────────────────────────────────────────────── */

static void test_a_thirty_day_course_stops_on_day_thirty() {
    section("a course with an end date actually ends");
    sc1::Scheduler s;
    s.load(parse("SC1*W*1:0800-127-030"), 0);
    CHECK(runDay(s, 0, 0).dispensed == 1);
    CHECK(runDay(s, 29, 1).dispensed == 1);
    CHECK(!s.courseComplete(1, 29));

    CHECK(runDay(s, 30, 2).dispensed == 0);
    CHECK(s.courseComplete(1, 30));
    CHECK(runDay(s, 400, 3).dispensed == 0);
}

static void test_an_ongoing_course_never_stops() {
    section("duration 000 means keep going");
    sc1::Scheduler s;
    s.load(parse("SC1*W*1:0800-127-000"), 0);
    CHECK(runDay(s, 0, 0).dispensed == 1);
    CHECK(runDay(s, 5000, 3).dispensed == 1);
    CHECK(!s.courseComplete(1, 5000));
}

static void test_courses_start_when_the_schedule_is_loaded() {
    section("a course loaded on day 100 runs to day 130, not day 30");
    sc1::Scheduler s;
    s.load(parse("SC1*W*1:0800-127-030"), 100);
    CHECK(runDay(s, 100, 0).dispensed == 1);
    CHECK(runDay(s, 129, 1).dispensed == 1);
    CHECK(runDay(s, 130, 2).dispensed == 0);
}

/* ── nothing loaded ───────────────────────────────────────────────────── */

static void test_an_empty_scheduler_does_nothing() {
    section("a tray with no schedule stays shut");
    sc1::Scheduler s;
    CHECK(s.next(0, 0, 8 * 60).what == sc1::Due::Nothing);

    sc1::Schedule empty;
    empty.count = 0;
    s.load(empty, 0);
    CHECK(runDay(s, 0, 0).dispensed == 0);
    CHECK(s.courseComplete(1, 0));
}

static void test_reloading_a_schedule_forgets_the_old_one() {
    section("a new schedule replaces the old one outright");
    sc1::Scheduler s;
    s.load(parse("SC1*S*1:0800"), 0);
    CHECK(runDay(s, 0, 0).dispensed == 1);

    s.load(parse("SC1*S*5:0900"), 0);
    CHECK(s.schedule().find(1) == nullptr);
    DayLog log = runDay(s, 0, 0);
    CHECK(log.dispensed == 1);
    // Same day, but the reloaded compartment 5 has not fired yet, so it does.
    CHECK(s.schedule().find(5) != nullptr);
}

int main() {
    test_a_daily_dose_fires_once_a_day();
    test_polling_repeatedly_does_not_multiply_doses();
    test_a_full_day_of_a_full_tray();
    test_a_weekday_course_skips_the_days_it_should();
    test_an_s_message_means_every_day();
    test_a_power_cut_does_not_empty_the_tray();
    test_a_late_dose_inside_the_grace_window_is_still_given();
    test_a_dose_past_the_grace_window_is_reported_missed();
    test_pending_doses_come_out_in_time_order();
    test_an_unconfirmed_dose_is_not_lost_when_the_clock_moves_on();
    test_a_thirty_day_course_stops_on_day_thirty();
    test_an_ongoing_course_never_stops();
    test_courses_start_when_the_schedule_is_loaded();
    test_an_empty_scheduler_does_nothing();
    test_reloading_a_schedule_forgets_the_old_one();

    std::printf("\n%d checks, %d failures\n", checks, failures);
    if (failures == 0) std::printf("Scheduler behaves.\n");
    return failures == 0 ? 0 : 1;
}

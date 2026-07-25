/*
 * Deciding when a compartment should open.
 *
 * This is separated from the sketch on purpose. Everything else in the
 * firmware fails visibly — a servo does not move, a screen stays blank, a code
 * does not scan. Scheduling fails *invisibly*: it opens a compartment twice,
 * or skips a day, or fires every dose at once after a power cut, and nobody
 * finds out until the pills are gone. Those are exactly the bugs that need a
 * test suite rather than a person watching a tray for a week, so the logic
 * lives here, free of <Arduino.h>, and `make -C firmware/test` exercises it
 * against a simulated clock.
 *
 * The model
 * ---------
 * Wall-clock time arrives as (day-number, minutes-since-midnight). The day
 * number is any monotonic count of days — days since the schedule was loaded,
 * or since 1970; only its differences are used, so the caller can supply
 * whatever its RTC makes cheap.
 *
 * A dose is due when its minute has arrived and it has not already fired
 * today. "Already fired" is remembered per compartment as the last day and
 * time it opened, which survives a reset if the caller persists it.
 *
 * Late doses
 * ----------
 * A device that has been unplugged for six hours comes back to find several
 * doses in the past. Firing them all is dangerous — that is a double or triple
 * dose delivered at once. Ignoring them silently is also wrong, because the
 * 08:00 dose noticed at 08:20 is simply late, and refusing it makes a reliable
 * device look broken.
 *
 * So a dose is dispensed only inside `graceMinutes` of its scheduled time.
 * Past that it is reported as missed and never opened. The phone learns about
 * it either way, because a missed dose is a fact the person's carer needs, and
 * a schedule that quietly drops doses is worse than one that admits to it.
 */
#ifndef SNAPCARE_SCHEDULER_H
#define SNAPCARE_SCHEDULER_H

#include "SC1.h"

namespace sc1 {

/** How long after its time a dose may still be dispensed. */
static const uint16_t DEFAULT_GRACE_MINUTES = 60;

enum class Due : uint8_t {
    Nothing,   // nothing to do
    Dispense,  // open this compartment now
    Missed,    // this dose's window closed unopened; report it, do not open
};

struct Decision {
    Due      what = Due::Nothing;
    uint8_t  slot = 0;         // which compartment
    uint16_t minutes = 0;      // the scheduled time it refers to
};

/**
 * Tracks what has already happened, so the same dose is never delivered twice.
 *
 * One entry per compartment. `lastDay`/`lastMinutes` identify the most recent
 * dose acted on; `startDay` is when the course began, which is what makes a
 * "30 days" duration meaningful.
 */
class Scheduler {
public:
    explicit Scheduler(uint16_t graceMinutes = DEFAULT_GRACE_MINUTES);

    /** Adopt a schedule and start its courses from `today`. */
    void load(const Schedule& schedule, uint32_t today);

    /**
     * What should happen at this instant.
     *
     * Call repeatedly until it returns Nothing: a single tick can owe more
     * than one action, and each call reports at most one so the caller can
     * drive a single servo, show a single code, and come back for the rest.
     *
     * `weekday` is 0=Monday..6=Sunday, matching the day mask on the wire and
     * the left-to-right order the paper sheet prints.
     */
    Decision next(uint32_t day, uint8_t weekday, uint16_t minutes);

    /**
     * Record that a decision was carried out.
     *
     * Separate from `next` so a caller that fails to act — a servo that jams,
     * a power brown-out mid-move — does not mark the dose done. Nothing is
     * considered delivered until the code that delivers it says so.
     */
    void confirm(const Decision& d, uint32_t day);

    /** Has this compartment's course finished? */
    bool courseComplete(uint8_t slot, uint32_t day) const;

    const Schedule& schedule() const { return schedule_; }

private:
    struct State {
        uint32_t startDay = 0;
        uint32_t lastDay = 0;
        uint16_t lastMinutes = 0;
        bool     everFired = false;
    };

    const State* stateFor(uint8_t slot) const;
    State* stateFor(uint8_t slot);

    Schedule schedule_;
    State    state_[MAX_SLOTS];
    uint16_t grace_;
};

}  // namespace sc1

#endif  // SNAPCARE_SCHEDULER_H

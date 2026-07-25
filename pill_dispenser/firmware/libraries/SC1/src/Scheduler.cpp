#include "Scheduler.h"

namespace sc1 {

Scheduler::Scheduler(uint16_t graceMinutes) : grace_(graceMinutes) {
    schedule_.count = 0;
}

void Scheduler::load(const Schedule& schedule, uint32_t today) {
    schedule_ = schedule;
    for (uint8_t i = 0; i < MAX_SLOTS; ++i) {
        state_[i] = State{};
        state_[i].startDay = today;
    }
}

const Scheduler::State* Scheduler::stateFor(uint8_t slot) const {
    for (uint8_t i = 0; i < schedule_.count; ++i) {
        if (schedule_.slots[i].slot == slot) return &state_[i];
    }
    return nullptr;
}

Scheduler::State* Scheduler::stateFor(uint8_t slot) {
    for (uint8_t i = 0; i < schedule_.count; ++i) {
        if (schedule_.slots[i].slot == slot) return &state_[i];
    }
    return nullptr;
}

bool Scheduler::courseComplete(uint8_t slot, uint32_t day) const {
    for (uint8_t i = 0; i < schedule_.count; ++i) {
        if (schedule_.slots[i].slot != slot) continue;
        const uint16_t duration = schedule_.slots[i].durationDays;
        if (duration == 0) return false;                 // ongoing
        return day >= state_[i].startDay + duration;
    }
    return true;   // nothing loaded for this compartment: nothing left to do
}

Decision Scheduler::next(uint32_t day, uint8_t weekday, uint16_t minutes) {
    Decision best;
    // Among everything owed right now, act on the *earliest* scheduled dose
    // first. After a power cut several may be pending at once, and delivering
    // them out of order would report a 20:00 dose before the 08:00 one it
    // followed — which is the log a carer reads to decide whether a dose was
    // taken.
    uint16_t bestMinutes = 0;

    for (uint8_t i = 0; i < schedule_.count; ++i) {
        const SlotSchedule& s = schedule_.slots[i];
        const State& st = state_[i];

        if (s.durationDays != 0 && day >= st.startDay + s.durationDays) continue;
        if (!dueOnDay(s, weekday)) continue;

        for (uint8_t t = 0; t < s.count; ++t) {
            const uint16_t due = s.times[t];
            if (minutes < due) continue;                 // not yet

            // Already handled? Same day, and at or past this dose's time.
            if (st.everFired && st.lastDay == day && st.lastMinutes >= due) continue;

            const Due what = (minutes - due <= grace_) ? Due::Dispense : Due::Missed;
            if (best.what == Due::Nothing || due < bestMinutes) {
                best.what = what;
                best.slot = s.slot;
                best.minutes = due;
                bestMinutes = due;
            }
        }
    }
    return best;
}

void Scheduler::confirm(const Decision& d, uint32_t day) {
    if (d.what == Due::Nothing) return;
    State* st = stateFor(d.slot);
    if (!st) return;
    // A missed dose is marked exactly like a delivered one. It has been dealt
    // with — reported to the phone — and leaving it unmarked would make the
    // device rediscover and re-report it on every tick forever.
    st->lastDay = day;
    st->lastMinutes = d.minutes;
    st->everFired = true;
}

}  // namespace sc1

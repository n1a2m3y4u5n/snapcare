/*
 * Decode SC1 payloads on stdin using the firmware's own parser.
 *
 *     make -C firmware/test tools
 *     python -m form_sheet_parser.cli sheet.jpg --emit weekly | \
 *         grep SC1 | firmware/test/build/sc1_decode
 *
 * The point is to close the loop across all three languages with real data
 * rather than with copied constants. The Python reader turns a photograph of a
 * paper sheet into a payload; this runs the *exact* C++ that will run on the
 * dispenser over it and prints what the device would understand. If the two
 * ever disagree, it shows up here as a wrong compartment or a refused line,
 * on a laptop, instead of as a tray that does not open.
 *
 * One payload per line; anything unparseable is reported and the exit status
 * is non-zero, so this works in a pipeline.
 */
#include <cstdio>
#include <cstring>
#include <iostream>
#include <string>

#include "Scheduler.h"

static const char* DAY_NAME[7] = {"MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"};

static void printSchedule(const sc1::Schedule& s) {
    for (uint8_t i = 0; i < s.count; ++i) {
        const sc1::SlotSchedule& slot = s.slots[i];
        std::printf("  compartment %u at", slot.slot);
        for (uint8_t t = 0; t < slot.count; ++t) {
            char hhmm[5];
            sc1::formatHHMM(slot.times[t], hhmm);
            std::printf(" %c%c:%c%c", hhmm[0], hhmm[1], hhmm[2], hhmm[3]);
        }
        std::printf("  on");
        if (slot.days == sc1::EVERY_DAY) {
            std::printf(" every day");
        } else {
            for (uint8_t d = 0; d < 7; ++d) {
                if (slot.days & (1 << d)) std::printf(" %s", DAY_NAME[d]);
            }
        }
        if (slot.durationDays) std::printf("  for %u days\n", slot.durationDays);
        else std::printf("  ongoing\n");
    }
}

int main() {
    std::string line;
    int bad = 0, seen = 0;

    while (std::getline(std::cin, line)) {
        // Tolerate the surrounding whitespace of a human-readable report.
        size_t a = line.find_first_not_of(" \t");
        if (a == std::string::npos) continue;
        size_t b = line.find_last_not_of(" \t\r");
        const std::string payload = line.substr(a, b - a + 1);
        if (payload.empty()) continue;

        ++seen;
        std::printf("%s\n", payload.c_str());

        sc1::Schedule schedule;
        sc1::DoseEvent event;
        sc1::ClockSet clock;
        switch (sc1::messageKind(payload.c_str())) {
            case sc1::Kind::Clock:
                if (sc1::decodeClock(payload.c_str(), clock)) {
                    static const char* FULL_DAY[7] = {
                        "Monday", "Tuesday", "Wednesday", "Thursday",
                        "Friday", "Saturday", "Sunday"};
                    std::printf("  -> clock: %04u-%02u-%02u %02u:%02u, %s\n",
                                clock.year, clock.month, clock.day,
                                clock.hour, clock.minute, FULL_DAY[clock.weekday]);
                } else {
                    std::printf("  -> REJECTED: not a real moment\n");
                    ++bad;
                }
                break;
            case sc1::Kind::Schedule:
            case sc1::Kind::Weekly:
                if (sc1::decodeAnySchedule(payload.c_str(), schedule)) {
                    std::printf("  -> schedule, %u compartment(s)\n", schedule.count);
                    printSchedule(schedule);
                } else {
                    std::printf("  -> REJECTED: malformed schedule\n");
                    ++bad;
                }
                break;
            case sc1::Kind::Event:
                if (sc1::decodeEvent(payload.c_str(), event)) {
                    char hhmm[5];
                    sc1::formatHHMM(event.minutes, hhmm);
                    std::printf("  -> dose: compartment %u at %s, %s (seq %u)\n",
                                event.slot, hhmm,
                                event.taken ? "taken" : "missed", event.seq);
                } else {
                    std::printf("  -> REJECTED: malformed event\n");
                    ++bad;
                }
                break;
            default:
                std::printf("  -> not an SC1 message, ignored\n");
                break;
        }
    }

    if (seen == 0) {
        std::fprintf(stderr, "no input\n");
        return 2;
    }
    return bad == 0 ? 0 : 1;
}

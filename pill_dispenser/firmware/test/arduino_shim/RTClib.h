#ifndef RTCLIB_SHIM_H
#define RTCLIB_SHIM_H
#include <Arduino.h>
class DateTime {
public:
    DateTime() {}
    explicit DateTime(uint32_t t) : t_(t) {}
    uint32_t unixtime() const { return t_; }
    uint8_t hour() const { return 0; }
    uint8_t minute() const { return 0; }
    uint8_t second() const { return 0; }
    uint8_t day() const { return 1; }
    uint8_t month() const { return 1; }
    uint16_t year() const { return 2026; }
    uint8_t dayOfTheWeek() const { return 0; }   // 0 = Sunday, as RTClib counts
private:
    uint32_t t_ = 0;
};
class RTC_DS3231 {
public:
    bool begin() { return true; }
    bool lostPower() { return false; }
    DateTime now() { return DateTime(uint32_t(0)); }
    void adjust(const DateTime&) {}
};
#endif

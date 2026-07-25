#ifndef EEPROM_SHIM_H
#define EEPROM_SHIM_H
#include <Arduino.h>
class EEPROMClass {
public:
    uint8_t read(int) { return 0; }
    void write(int, uint8_t) {}
    void update(int, uint8_t) {}
    // The real ones are templates too; a schedule struct goes through here.
    template <typename T> T& put(int, T& value) { return value; }
    template <typename T> T& put(int, const T& value) { return const_cast<T&>(value); }
    template <typename T> T& get(int, T& value) { std::memset(&value, 0, sizeof value); return value; }
};
extern EEPROMClass EEPROM;
#endif

#ifndef WIRE_SHIM_H
#define WIRE_SHIM_H
#include <Arduino.h>
class TwoWire : public Stream {
public:
    void begin() {}
    void begin(int, int) {}          // the ESP32 overload takes explicit pins
    void beginTransmission(uint8_t) {}
    uint8_t endTransmission() { return 0; }
    void setClock(uint32_t) {}
};
extern TwoWire Wire;
#endif

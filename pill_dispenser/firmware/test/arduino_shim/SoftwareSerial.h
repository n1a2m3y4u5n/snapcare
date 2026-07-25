#ifndef SOFTWARESERIAL_SHIM_H
#define SOFTWARESERIAL_SHIM_H
#include <Arduino.h>
class SoftwareSerial : public Stream {
public:
    SoftwareSerial(uint8_t, uint8_t) {}
    void begin(long) {}
    void end() {}
    bool isListening() { return true; }
    bool listen() { return true; }
};
#endif

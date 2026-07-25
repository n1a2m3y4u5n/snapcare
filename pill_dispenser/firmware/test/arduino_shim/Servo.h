#ifndef SERVO_SHIM_H
#define SERVO_SHIM_H
#include <Arduino.h>
class Servo {
public:
    uint8_t attach(int) { return 0; }
    uint8_t attach(int, int, int) { return 0; }
    void write(int) {}
    void writeMicroseconds(int) {}
    int read() { return 0; }
    bool attached() { return false; }
    void detach() {}
};
#endif

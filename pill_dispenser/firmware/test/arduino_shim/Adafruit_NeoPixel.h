#ifndef NEOPIXEL_SHIM_H
#define NEOPIXEL_SHIM_H
#include <Arduino.h>
#define NEO_GRB 0x52
#define NEO_KHZ800 0x0000
class Adafruit_NeoPixel {
public:
    Adafruit_NeoPixel(uint16_t, int16_t, uint8_t) {}
    void begin() {}
    void show() {}
    void setBrightness(uint8_t) {}
    void clear() {}
    void setPixelColor(uint16_t, uint8_t, uint8_t, uint8_t) {}
    void setPixelColor(uint16_t, uint32_t) {}
    static uint32_t Color(uint8_t, uint8_t, uint8_t) { return 0; }
};
#endif

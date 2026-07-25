#ifndef GFX_SHIM_H
#define GFX_SHIM_H
#include <Arduino.h>
class Adafruit_GFX : public Stream {
public:
    Adafruit_GFX(int16_t, int16_t) {}
    void drawPixel(int16_t, int16_t, uint16_t) {}
    void fillRect(int16_t, int16_t, int16_t, int16_t, uint16_t) {}
    void drawRect(int16_t, int16_t, int16_t, int16_t, uint16_t) {}
    void setCursor(int16_t, int16_t) {}
    void setTextSize(uint8_t) {}
    void setTextColor(uint16_t) {}
};
#endif

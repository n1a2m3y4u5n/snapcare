#ifndef SSD1306_SHIM_H
#define SSD1306_SHIM_H
#include <Adafruit_GFX.h>
#include <Wire.h>
#define SSD1306_BLACK 0
#define SSD1306_WHITE 1
#define SSD1306_SWITCHCAPVCC 0x02
class Adafruit_SSD1306 : public Adafruit_GFX {
public:
    Adafruit_SSD1306(int16_t w, int16_t h, TwoWire*, int8_t) : Adafruit_GFX(w, h) {}
    bool begin(uint8_t, uint8_t) { return true; }
    void clearDisplay() {}
    void display() {}
};
#endif

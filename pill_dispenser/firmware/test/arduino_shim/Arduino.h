/*
 * A stand-in Arduino API, just complete enough to compile the sketches.
 *
 * Why bother
 * ----------
 * The protocol and the scheduler are already tested on the host, but the
 * sketches that use them were only ever checked by reading. A typo, a wrong
 * argument order, a function that moved out of scope — none of that shows up
 * until someone has a board, a cable and a USB port, and on this project the
 * board is in a different country from most of the people touching the code.
 *
 * Compiling against these headers catches all of it in a second. It proves the
 * sketch is *valid C++ that uses these libraries correctly*. It proves nothing
 * about what happens on real hardware — no timing, no interrupts, no servo,
 * and `millis()` here never advances. That is a deliberate line: this is a
 * syntax and type check, not a simulator, and pretending otherwise would be
 * worse than not having it.
 *
 * Nothing here is ever flashed. The real headers come from the Arduino core.
 */
#ifndef ARDUINO_SHIM_H
#define ARDUINO_SHIM_H

#include <stddef.h>
#include <stdint.h>

#include <cstdio>
#include <cstring>

#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define DEC 10
#define BIN 2
#define HEX 16

// Analog pin numbers as an Uno/Nano defines them: the analog header continues
// the digital numbering, which is what lets A0 and A1 be used as plain I/O.
#define A0 14
#define A1 15
#define A2 16
#define A3 17
#define A4 18
#define A5 19
#define A6 20
#define A7 21

// The real F() puts a literal in flash and hands back a tagged pointer. Here it
// is the identity, which is all the type checker needs.
class __FlashStringHelper;
#define F(str) (str)

inline void pinMode(uint8_t, uint8_t) {}
inline int digitalRead(uint8_t) { return HIGH; }
inline void digitalWrite(uint8_t, uint8_t) {}
inline int analogRead(uint8_t) { return 0; }
inline void tone(uint8_t, unsigned int, unsigned long = 0) {}
inline void noTone(uint8_t) {}
inline void delay(unsigned long) {}
inline void delayMicroseconds(unsigned int) {}
inline unsigned long millis() { return 0; }
inline unsigned long micros() { return 0; }

/** Just enough of Print/Stream that the sketches' logging type-checks. */
class Stream {
public:
    virtual ~Stream() {}
    virtual int available() { return 0; }
    virtual int read() { return -1; }
    virtual int peek() { return -1; }

    void print(const char*) {}
    void print(char) {}
    void print(int, int = DEC) {}
    void print(unsigned int, int = DEC) {}
    void print(long, int = DEC) {}
    void print(unsigned long, int = DEC) {}
    void print(double, int = 2) {}

    void println() {}
    void println(const char*) {}
    void println(char) {}
    void println(int, int = DEC) {}
    void println(unsigned int, int = DEC) {}
    void println(unsigned long, int = DEC) {}
    void println(long, int = DEC) {}
    void println(double, int = 2) {}

    size_t write(uint8_t) { return 1; }
    void flush() {}
};

class HardwareSerial : public Stream {
public:
    HardwareSerial() {}
    // The ESP32 core constructs extra UARTs by number: HardwareSerial link(2).
    explicit HardwareSerial(int) {}
    void begin(unsigned long) {}
    void begin(unsigned long, uint32_t, int8_t, int8_t) {}   // the ESP32 overload
    void end() {}
    operator bool() const { return true; }
};

extern HardwareSerial Serial;

#endif  // ARDUINO_SHIM_H

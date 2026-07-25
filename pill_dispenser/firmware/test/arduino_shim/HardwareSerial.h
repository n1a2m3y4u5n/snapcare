/* The ESP32 core exposes HardwareSerial as its own header; on AVR it comes in
 * via Arduino.h. Both spellings resolve to the same shim class. */
#ifndef HARDWARESERIAL_SHIM_H
#define HARDWARESERIAL_SHIM_H
#include <Arduino.h>
#define SERIAL_8N1 0x800001c
#endif

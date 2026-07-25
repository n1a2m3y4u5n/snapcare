/* The singletons the Arduino core provides. Only ever linked into the host
 * compile check; the real ones come from the core when a sketch is flashed. */
#include <Arduino.h>
#include <EEPROM.h>
#include <Wire.h>

HardwareSerial Serial;
TwoWire Wire;
EEPROMClass EEPROM;

/* Shim for alvarowolfx's ESP32QRCodeReader. */
#ifndef ESP32QRREADER_SHIM_H
#define ESP32QRREADER_SHIM_H
#include <Arduino.h>
enum CameraPins { CAMERA_MODEL_AI_THINKER = 0, CAMERA_MODEL_WROVER_KIT = 1 };
struct QRCodeData { bool valid; uint8_t* payload; int payloadLen; };
class ESP32QRCodeReader {
public:
    explicit ESP32QRCodeReader(CameraPins) {}
    void setup() {}
    void begin() {}
    void beginOnCore(uint8_t) {}
    bool receiveQrCode(struct QRCodeData*, int) { return false; }
};
#endif

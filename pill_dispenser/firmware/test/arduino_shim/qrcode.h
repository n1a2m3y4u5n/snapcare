/* Shim for ricmoo's QRCode library. */
#ifndef QRCODE_SHIM_H
#define QRCODE_SHIM_H
#include <Arduino.h>
#define ECC_LOW 0
#define ECC_MEDIUM 1
#define ECC_QUARTILE 2
#define ECC_HIGH 3
#define qrcode_getBufferSize(version) (((((version) * 4 + 17) * ((version) * 4 + 17)) + 7) / 8 + 8)
typedef struct QRCode {
    uint8_t version;
    uint8_t size;
    uint8_t ecc;
    uint8_t mode;
    uint8_t mask;
    uint8_t* modules;
} QRCode;
inline int8_t qrcode_initText(QRCode* qr, uint8_t*, uint8_t v, uint8_t, const char*) {
    qr->version = v; qr->size = uint8_t(v * 4 + 17); return 0;
}
inline bool qrcode_getModule(QRCode*, uint8_t, uint8_t) { return false; }
#endif

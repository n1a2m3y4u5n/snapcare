/*
 * SnapCare pill dispenser — optical head (AI-Thinker ESP32-CAM)
 *
 * A transparent modem between the phone and the tray controller. It reads a QR
 * code off the phone's screen and forwards the SC1 text over a serial line; it
 * takes SC1 text back from the tray and draws it as a QR for the phone to
 * photograph. It holds no schedule, keeps no clock, and decides nothing.
 *
 * Why light rather than radio
 * ---------------------------
 * Every network route to this device was closed. Web Bluetooth does not exist
 * in iOS WebKit. A local HTTP server means mixed content in a browser served
 * over TLS, and asks the user to switch access points. MQTT over wss needs
 * working internet at both ends, which contradicts the premise that this has
 * to work where infrastructure does not.
 *
 * An optical link needs no pairing, no shared network and no internet. And
 * because the app's whole interaction model is already "take a photograph",
 * the dispenser becomes one more thing you point the camera at rather than a
 * feature bolted on beside it.
 *
 * Why this device still has no user interface
 * -------------------------------------------
 * The screen here faces the *phone*, never the person. SnapCare exists for
 * people who cannot read, so the channels aimed at a human are the LED ring
 * and the buzzer on the tray board — one colour, one sound, nothing to read.
 * This OLED shows a machine-readable square and never a word of text.
 *
 * The 64-pixel wall
 * -----------------
 * The two directions are not symmetric, and the asymmetry is physical.
 *
 * Device to phone: a 0.96" OLED is 128x64, but a QR is square, so the 64px
 * height is the wall. With the mandatory four-module quiet zone at two pixels
 * per module, only version 1 fits — 21 modules plus quiet zone is 58px, while
 * three pixels per module would need 87px and does not fit at all. Version 1
 * at ECC-M holds about 20 alphanumeric characters, which is why a dose event
 * is six short fields and why sc1::encodeEvent refuses to produce anything
 * longer instead of quietly truncating.
 *
 * Phone to device: the phone's screen is large, so the limit is this camera.
 * At 640x480 a version 10 code (57 modules, 395 alphanumeric characters) reads
 * comfortably, and a full eight-compartment weekly plan is around 190.
 *
 * WIRING — see firmware/README.md. Two things that will cost you a board:
 *   - the Arduino's TX is 5V and this chip's inputs are not 5V tolerant; the
 *     divider on that line is not optional
 *   - GPIO12 is a strapping pin and must be low at boot, which is why it is
 *     this board's *output* and never the line the Arduino drives
 *
 *   GPIO14   OLED SDA          GPIO15  OLED SCL
 *   GPIO12   link TX -> Arduino A0
 *   GPIO13   link RX <- Arduino A1 (through the divider)
 *
 * LIBRARIES  ESP32QRCodeReader (alvarowolfx) · QRCode (ricmoo) ·
 *            Adafruit_SSD1306 · Adafruit_GFX, plus firmware/libraries/SC1.
 * BOARD      AI Thinker ESP32-CAM, Partition Scheme "Huge APP".
 */

#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32QRCodeReader.h>
#include <HardwareSerial.h>
#include <Wire.h>
#include <qrcode.h>
#include <string.h>

#include "SC1.h"

/* ── pins ─────────────────────────────────────────────────────────────── */

static const int PIN_OLED_SDA = 14;
static const int PIN_OLED_SCL = 15;
static const int PIN_LINK_TX = 12;   // must be an output: strapping pin, low at boot
static const int PIN_LINK_RX = 13;

static const uint8_t OLED_ADDR = 0x3C;
static const int16_t OLED_W = 128;
static const int16_t OLED_H = 64;

/* ── QR rendering ─────────────────────────────────────────────────────── */

// Version 1 is the only size that fits the 64px height; see the header note.
static const uint8_t QR_VERSION = 1;
static const uint8_t QR_ECC = ECC_MEDIUM;
static const uint8_t QR_MODULE_PX = 2;
static const uint8_t QR_QUIET_MODULES = 4;

// How long a dose event stays on screen waiting to be photographed. The tray
// re-sends nothing, so this is the window the carer has; it is deliberately
// long, because the person may be fetching the phone from another room.
static const uint32_t EVENT_DISPLAY_MS = 5UL * 60UL * 1000UL;

/* ── state ────────────────────────────────────────────────────────────── */

Adafruit_SSD1306 oled(OLED_W, OLED_H, &Wire, -1);
ESP32QRCodeReader reader(CAMERA_MODEL_AI_THINKER);
HardwareSerial link(2);

static bool oledPresent = false;
static uint32_t showingSince = 0;
static bool showingEvent = false;

// The last code accepted, so holding the phone still for three seconds does
// not forward the same schedule twenty times.
static char lastPayload[sc1::MAX_SCHEDULE_PAYLOAD] = {0};
static uint32_t lastPayloadAt = 0;
static const uint32_t REPEAT_SUPPRESS_MS = 4000;

static char lineBuf[sc1::MAX_SCHEDULE_PAYLOAD];
static uint16_t lineLen = 0;

/* ── screen ───────────────────────────────────────────────────────────── */

/**
 * Draw a payload as a QR code, centred, black on white.
 *
 * White background rather than the OLED's natural black-on-dark: a QR reader
 * expects dark modules on a light field, and although the app's decoder does
 * try both polarities, an inverted code costs it attempts and costs the user
 * seconds of holding a phone steady.
 */
static bool showQr(const char* payload) {
    if (!oledPresent) return false;

    QRCode qr;
    static uint8_t qrBytes[qrcode_getBufferSize(QR_VERSION)];
    if (qrcode_initText(&qr, qrBytes, QR_VERSION, QR_ECC, payload) != 0) {
        // Too long for version 1. Nothing sensible can be drawn, and drawing
        // a partial code would be worse than drawing none.
        return false;
    }

    const int16_t side = (qr.size + 2 * QR_QUIET_MODULES) * QR_MODULE_PX;
    const int16_t x0 = (OLED_W - side) / 2;
    const int16_t y0 = (OLED_H - side) / 2;

    oled.clearDisplay();
    oled.fillRect(x0, y0, side, side, SSD1306_WHITE);
    for (uint8_t y = 0; y < qr.size; ++y) {
        for (uint8_t x = 0; x < qr.size; ++x) {
            if (!qrcode_getModule(&qr, x, y)) continue;
            oled.fillRect(x0 + (x + QR_QUIET_MODULES) * QR_MODULE_PX,
                          y0 + (y + QR_QUIET_MODULES) * QR_MODULE_PX,
                          QR_MODULE_PX, QR_MODULE_PX, SSD1306_BLACK);
        }
    }
    oled.display();
    return true;
}

/**
 * A small square while nothing is being reported.
 *
 * Not decoration: a blank OLED is indistinguishable from a dead one, and the
 * person setting the device up needs to know it is alive without being asked
 * to read anything.
 */
static void showIdle() {
    if (!oledPresent) return;
    oled.clearDisplay();
    oled.drawRect(OLED_W / 2 - 6, OLED_H / 2 - 6, 12, 12, SSD1306_WHITE);
    oled.display();
    showingEvent = false;
}

/* ── the two directions ───────────────────────────────────────────────── */

/** Phone -> tray. Anything that is not a schedule for us is ignored. */
static void onCodeScanned(const char* payload) {
    const sc1::Kind kind = sc1::messageKind(payload);
    if (kind != sc1::Kind::Schedule && kind != sc1::Kind::Weekly) {
        // The camera sees whatever is in front of it — a product barcode, a
        // poster, someone's wifi credentials. None of it is ours.
        return;
    }

    // Validate here as well as on the tray board. Forwarding a malformed
    // schedule would waste the only feedback channel the user has: they would
    // hold the phone up, see nothing happen, and have no way to tell whether
    // the code was wrong or the link was.
    sc1::Schedule parsed;
    if (!sc1::decodeAnySchedule(payload, parsed)) {
        Serial.print("rejected malformed schedule: ");
        Serial.println(payload);
        return;
    }

    const uint32_t now = millis();
    if (strcmp(payload, lastPayload) == 0 && now - lastPayloadAt < REPEAT_SUPPRESS_MS) {
        return;   // same code still in frame
    }
    strncpy(lastPayload, payload, sizeof lastPayload - 1);
    lastPayload[sizeof lastPayload - 1] = '\0';
    lastPayloadAt = now;

    link.println(payload);
    Serial.print("-> tray: ");
    Serial.println(payload);
}

/** Tray -> phone. An event line becomes a code on the screen. */
static void onLineFromTray(char* text) {
    if (text[0] == '\0') return;

    sc1::DoseEvent e;
    if (!sc1::decodeEvent(text, e)) {
        Serial.print("tray said something we do not draw: ");
        Serial.println(text);
        return;
    }

    if (showQr(text)) {
        showingEvent = true;
        showingSince = millis();
        Serial.print("showing: ");
        Serial.println(text);
    } else {
        // encodeEvent on the tray should have prevented this, so reaching here
        // means the two boards disagree about the screen's capacity.
        Serial.print("! could not draw (too long for version 1): ");
        Serial.println(text);
    }
}

static void pumpLink() {
    while (link.available()) {
        const char c = char(link.read());
        if (c == '\r') continue;
        if (c == '\n') {
            lineBuf[lineLen] = '\0';
            onLineFromTray(lineBuf);
            lineLen = 0;
            continue;
        }
        if (size_t(lineLen) + 1 < sizeof lineBuf) lineBuf[lineLen++] = c;
        else lineLen = 0;   // overlong: drop the whole line rather than half of it
    }
}

/* ── setup / loop ─────────────────────────────────────────────────────── */

void setup() {
    Serial.begin(115200);
    link.begin(9600, SERIAL_8N1, PIN_LINK_RX, PIN_LINK_TX);

    Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL);
    oledPresent = oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
    if (!oledPresent) {
        // Worth continuing: without a screen the device can still *receive*
        // schedules, which is the half that matters most.
        Serial.println("! no SSD1306 found; dose events cannot be shown");
    } else {
        showIdle();
    }

    reader.setup();
    reader.beginOnCore(1);   // decoding is heavy; keep it off the Arduino core
    Serial.println("SnapCare optical head ready");
}

void loop() {
    struct QRCodeData qrData;
    if (reader.receiveQrCode(&qrData, 100) && qrData.valid) {
        onCodeScanned(reinterpret_cast<const char*>(qrData.payload));
    }

    pumpLink();

    if (showingEvent && millis() - showingSince > EVENT_DISPLAY_MS) {
        showIdle();
    }
}

"""SnapCare pill dispenser firmware for the Raspberry Pi 3B.

    python -m snapcare_dispenser --help

Layered so that the parts which can hurt someone are the parts that can be
tested without hardware:

    sc1.py           the wire format, shared with the app and the sheet reader
    scheduler.py     when a tray is due — pure logic, no I/O, no clock of its own
    device.py        the only thing allowed to open a tray
    servo.py         pigpio / RPi.GPIO / mock
    store.py         what survives a power cut, and how
    clock.py         whether the time can be believed at all
    wifi.py          nmcli
    provisioning.py  the identity behind the QR that never changes
    server.py        the JSON API, the app-compatible API, and the pages
    daemon.py        the process
    config.py        the pin map and every other knob
"""

__version__ = "1.0.0"

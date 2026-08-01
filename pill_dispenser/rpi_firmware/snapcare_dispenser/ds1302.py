"""The DS1302, bit-banged on three wires, and the trust question it cannot answer.

Read the last section before changing anything here.

The protocol
------------
Not a bus. Three plain GPIOs shifted by hand: CE, SCLK and a bidirectional I/O
line. There is no kernel driver for it on a Raspberry Pi — the mainline
`rtc-ds1302` is an SPI client needing LSB-first, 3-wire and active-high chip
select simultaneously, and the BCM2835 SPI controller cannot do LSB-first at
all — so this firmware is the only thing that can read this chip, and
`/dev/rtc0`, `hwclock` and `i2cdetect` all have nothing to say about it.

    CE      active HIGH for the whole transfer, despite the overbar in the
            original Dallas datasheet. Low terminates and tri-states I/O.
    write   data must be valid on the RISING edge of SCLK
    read    the chip drives on the FALLING edge, and tri-states again on the
            rising one — so sample only while SCLK is LOW
    order   LSB first, for both the command byte and the data

The command byte is `1 | RAM/CK | A4..A0 | RD/W`, with the address in bits 1-5
rather than 0-4. Bit 7 must be 1 or the write is discarded.

Three bugs that are easy to write and hard to see
-------------------------------------------------
**The turnaround.** Command bit 7 is always 1, so the Pi is actively driving
the line high at the exact moment the chip starts driving bit 0 low. The I/O
line must be released after the 8th rising edge and *before* the following
falling edge, or the two drivers fight. Most reference code on the internet
switches direction inside the read loop, which is one edge too late.

**Write protect.** WP (bit 7 of 0x8E) has an undefined power-on state, and
while it is set every other write silently does nothing — including the write
that clears the clock-halt bit. "My DS1302 will not start" is almost always
this. It also cannot be cleared by a burst write, because the burst's own
control byte is blocked by the WP it is trying to clear.

**Rollover.** Reading the seven clock registers one at a time from Python takes
milliseconds, so a read can straddle a tick: 10:59:59 for the seconds, then
11:00 for the minutes, giving 11:59:59. Once an hour, silently, an hour wrong.
The clock burst (0xBF) latches all eight registers into a shadow set at the
start of the transfer and is the only correct way to read the time.

Why the trust model is different from the DS3231's
--------------------------------------------------
This is the part that matters, and it is a genuine downgrade.

The DS3231 has an oscillator stop flag: hardware sets it whenever the
oscillator has stopped, it latches until software clears it, and it therefore
answers the exact question this firmware is built around — *did this chip lose
time at some point, so that everything it has said since is invented?*

**The DS1302 has no such bit.** Its clock-halt bit is a control, not a status:
nothing in the hardware ever sets it, and its power-on state is documented as
undefined. So CH=0 means only "the oscillator is running right now" — which is
also true of a chip that sat unpowered for a month and resumed counting from
whatever was left in its registers. That is precisely the failure the whole
clock design exists to refuse, and this chip cannot report it.

So the evidence is reconstructed instead. The DS1302 has 31 bytes of RAM in the
**same battery-backed domain as the oscillator**: the coin cell holds both or
neither. Setting the clock writes a token there — a magic string and the time
it was set. On boot, the token is present if and only if the cell has held
continuously since somebody last set the time, which is the same fact the
DS3231's flag reports, arrived at from the other side.

It is firmware convention rather than a hardware guarantee, and it is weaker in
one direction and stronger in another:

  - weaker: a chip programmed by different firmware, or a brownout that
    corrupts RAM without stopping the crystal, changes what the token means
  - stronger: it also catches somebody re-seating the cell, which the DS3231's
    flag does not

Both of its failure modes fall towards *not* trusting the clock, which is the
safe direction: a tray that stays shut is noticed within hours, and a tray that
opens on the wrong day is not noticed at all.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from datetime import datetime

from . import config, gpiochip

log = logging.getLogger(__name__)

# ── the register map ────────────────────────────────────────────────────────
#
# Note the order: DATE (day of month) comes before MONTH, and DAY (day of week)
# comes after it. That is not the DS3231's order, and reading it as though it
# were is a silent misread rather than a crash.

_SEC, _MIN, _HOUR, _DATE, _MONTH, _DOW, _YEAR, _CONTROL = range(8)

#: Burst address. Reading it latches all eight clock registers at once.
_BURST = 0x1F

#: Bit 7 of the seconds register. A control bit, not a status flag — see above.
_CH_BIT = 0b1000_0000

#: Bit 7 of the control register at 0x8E. Blocks every other write while set.
_WP_BIT = 0b1000_0000

#: Top nibble of the trickle-charge register. Only this pattern enables it, and
#: on a board with a non-rechargeable CR2032 in the holder that would be
#: charging a primary lithium cell.
_TRICKLE_ENABLED = 0xA0
_TRICKLE_ADDRESS = 0x08

#: What is written into battery-backed RAM when the time is set. Short, because
#: there are only 31 bytes and the timestamp goes in beside it.
_TOKEN = b"SC1"

#: RAM layout: the token, then the set time as a 4-byte little-endian Unix
#: timestamp. Nine bytes of thirty-one.
_TOKEN_AT = 0
_STAMP_AT = len(_TOKEN)
_STAMP_BYTES = 5  # good past the year 2500, unlike four

#: Every AC constraint on the master is a minimum — the datasheet's own maximum
#: clock rate is "DC to 2 MHz", so a bit-bang can only be too fast. Five
#: microseconds clears every minimum by an order of magnitude, and Python
#: cannot go much faster than this anyway.
_SETTLE_S = 5e-6


class Ds1302Error(Exception):
    """The chip did not answer the way a DS1302 answers."""


def _bcd_to_int(value: int) -> int:
    return (value >> 4) * 10 + (value & 0x0F)


def _int_to_bcd(value: int) -> int:
    return ((value // 10) << 4) | (value % 10)


class PinDriver:
    """The four operations a bit-bang needs. Swapped out in the tests."""

    def write(self, gpio: int, level: int) -> None:
        raise NotImplementedError

    def read(self, gpio: int) -> int:
        raise NotImplementedError

    def as_output(self, gpio: int) -> None:
        raise NotImplementedError

    def as_input(self, gpio: int) -> None:
        raise NotImplementedError

    def close(self) -> None:
        pass


class LgpioPins(PinDriver):
    """The real one. Claims and reclaims lines on the gpiochip character device.

    Direction changes go through `gpio_free` then a fresh claim, because a line
    is claimed as one direction or the other and the I/O wire genuinely
    reverses mid-transfer.
    """

    def __init__(self):
        import lgpio  # noqa: PLC0415

        handle = gpiochip.open_chip()
        if handle is None:
            raise Ds1302Error(gpiochip.unavailable_reason())
        self._lgpio = lgpio
        self._handle = handle
        self._mode: dict[int, str] = {}

    def _free(self, gpio: int) -> None:
        try:
            self._lgpio.gpio_free(self._handle, gpio)
        except Exception:  # noqa: BLE001 - it may not have been claimed
            pass

    def as_output(self, gpio: int) -> None:
        if self._mode.get(gpio) == "out":
            return
        self._free(gpio)
        self._lgpio.gpio_claim_output(self._handle, gpio, 0)
        self._mode[gpio] = "out"

    def as_input(self, gpio: int) -> None:
        if self._mode.get(gpio) == "in":
            return
        self._free(gpio)
        # No pull. The DS1302 drives this line push-pull whenever CE is high,
        # and its own 40 kΩ pull-down holds it while it is not.
        self._lgpio.gpio_claim_input(self._handle, gpio)
        self._mode[gpio] = "in"

    def write(self, gpio: int, level: int) -> None:
        self._lgpio.gpio_write(self._handle, gpio, level)

    def read(self, gpio: int) -> int:
        return int(self._lgpio.gpio_read(self._handle, gpio))

    def close(self) -> None:
        for gpio in list(self._mode):
            self._free(gpio)
        self._mode.clear()


class Ds1302:
    """One chip on three pins."""

    def __init__(self, pins: PinDriver | None = None, sclk: int | None = None,
                 io: int | None = None, ce: int | None = None,
                 settle: float = _SETTLE_S):
        self.sclk = config.RTC_SCLK_GPIO if sclk is None else sclk
        self.io = config.RTC_IO_GPIO if io is None else io
        self.ce = config.RTC_CE_GPIO if ce is None else ce
        self._settle = settle
        self._pins = pins if pins is not None else LgpioPins()
        # Transfers are not reentrant and the status page, the scheduler tick
        # and a clock-set request all arrive on different threads.
        self._lock = threading.RLock()

        self._pins.as_output(self.ce)
        self._pins.write(self.ce, 0)
        self._pins.as_output(self.sclk)
        self._pins.write(self.sclk, 0)
        self._pins.as_output(self.io)

    # ── the wire ────────────────────────────────────────────────────────────

    def _pause(self) -> None:
        if self._settle:
            time.sleep(self._settle)

    def _begin(self) -> None:
        # SCLK must already be low when CE goes high. The datasheet states it
        # as a power-up rule and it applies to every transfer: raising CE with
        # the clock high shifts a phantom bit.
        self._pins.write(self.sclk, 0)
        self._pins.write(self.ce, 0)
        self._pins.as_output(self.io)
        self._pause()
        self._pins.write(self.ce, 1)
        self._pause()

    def _end(self) -> None:
        self._pause()
        self._pins.write(self.ce, 0)
        self._pins.as_output(self.io)
        self._pins.write(self.sclk, 0)
        self._pause()

    def _clock_out(self, bit: int) -> None:
        self._pins.write(self.io, bit)
        self._pause()
        self._pins.write(self.sclk, 1)  # rising edge latches it
        self._pause()
        self._pins.write(self.sclk, 0)
        self._pause()

    def _send(self, byte: int) -> None:
        for index in range(8):
            self._clock_out((byte >> index) & 1)  # LSB first

    def _send_command_then_release(self, command: int) -> None:
        """Send a command byte and hand the I/O line over for the reply.

        The last two lines are the whole reason this is a separate method. Bit
        7 of a command is always 1, so the Pi is driving the line high at the
        moment the chip starts driving bit 0 — release has to happen after the
        8th rising edge and before the falling one, or two push-pull drivers
        fight each other across a wire.
        """
        for index in range(7):
            self._clock_out((command >> index) & 1)

        self._pins.write(self.io, (command >> 7) & 1)
        self._pause()
        self._pins.write(self.sclk, 1)  # 8th rising edge: the byte is in
        self._pause()
        self._pins.as_input(self.io)  # release now, not in the loop below
        self._pause()
        self._pins.write(self.sclk, 0)  # the chip starts driving bit 0
        self._pause()

    def _recv(self, count: int) -> list[int]:
        out = []
        for byte_index in range(count):
            value = 0
            for bit in range(8):
                # Sampled while SCLK is low: the chip tri-states the line on
                # every rising edge, so anything read there is a floating pin.
                if self._pins.read(self.io):
                    value |= 1 << bit
                self._pins.write(self.sclk, 1)
                self._pause()
                self._pins.write(self.sclk, 0)
                self._pause()
            out.append(value)
            del byte_index
        return out

    @staticmethod
    def _command(address: int, ram: bool = False, read: bool = False) -> int:
        # The address sits in bits 1-5, not 0-4. Bit 7 must be 1 or the chip
        # discards the whole transfer.
        return 0x80 | (0x40 if ram else 0) | ((address & 0x1F) << 1) | (1 if read else 0)

    # ── registers ───────────────────────────────────────────────────────────

    def read_register(self, address: int, ram: bool = False) -> int:
        with self._lock:
            self._begin()
            try:
                self._send_command_then_release(self._command(address, ram, read=True))
                return self._recv(1)[0]
            finally:
                self._end()

    def write_register(self, address: int, value: int, ram: bool = False) -> None:
        with self._lock:
            self._begin()
            try:
                self._send(self._command(address, ram, read=False))
                self._send(value & 0xFF)
            finally:
                self._end()

    def read_burst(self, ram: bool = False, count: int = 8) -> list[int]:
        with self._lock:
            self._begin()
            try:
                self._send_command_then_release(self._command(_BURST, ram, read=True))
                return self._recv(count)
            finally:
                self._end()

    # ── write protect ───────────────────────────────────────────────────────

    def unprotect(self) -> None:
        """Clear WP, which every other write is gated on.

        Must be a single-byte write. A burst cannot do it: the burst's own
        control byte is blocked by the very bit it is trying to clear.
        """
        self.write_register(_CONTROL, 0x00)

    def is_protected(self) -> bool:
        return bool(self.read_register(_CONTROL, ram=False) & _WP_BIT)

    # ── presence ────────────────────────────────────────────────────────────

    def present(self) -> bool:
        """Is there really a DS1302 on these three wires?

        The control register reads back as either 0x00 or 0x80 and nothing
        else — bits 0-6 are hardwired to zero. A floating I/O line reads as
        0xFF or 0x00 depending on which way it drifts, and the 0xFF half is
        caught here. The write-then-read below catches the other half: a
        disconnected line cannot remember anything.
        """
        with self._lock:
            try:
                if self.read_register(_CONTROL) & ~_WP_BIT:
                    return False  # junk in a register that has only one bit

                # Round-trip a byte through RAM. Nothing else on these three
                # pins will store and return an arbitrary value.
                probe = 0x5A
                keep = self.read_register(30, ram=True)
                self.unprotect()
                self.write_register(30, probe, ram=True)
                echoed = self.read_register(30, ram=True)
                self.write_register(30, keep, ram=True)
                return echoed == probe
            except Exception:  # noqa: BLE001
                return False

    def trickle_charging(self) -> bool:
        """Is the chip trying to charge the coin cell?

        Powers up disabled, and stays however it was last written for as long
        as the cell lives — so "default" means never-been-written, not
        power-cycled. It matters because the holder on a cheap module is wired
        straight to VCC1 and usually ships with a *non-rechargeable* CR2032.
        """
        return (self.read_register(_TRICKLE_ADDRESS) & 0xF0) == _TRICKLE_ENABLED

    # ── the time ────────────────────────────────────────────────────────────

    def halted(self) -> bool:
        """Is the oscillator stopped right now?

        Note "right now". This is not evidence about the past — see the module
        docstring. It is worth reporting and it is not worth trusting.
        """
        return bool(self.read_register(_SEC) & _CH_BIT)

    def read_time(self) -> datetime:
        """The time, read as a burst so it cannot straddle a tick."""
        raw = self.read_burst(count=8)
        if len(raw) < 7:
            raise Ds1302Error("short burst read")

        if raw[_HOUR] & 0x80:
            # 12-hour mode: bit 5 is then AM/PM rather than the tens-of-hours
            # bit, so reading it as BCD is silently twelve hours wrong for half
            # of every day. `set_time` always writes 24-hour mode, so this
            # means somebody else programmed the chip.
            raise Ds1302Error("the chip is in 12-hour mode; its time cannot be read as written")

        year = 2000 + _bcd_to_int(raw[_YEAR])
        month = _bcd_to_int(raw[_MONTH] & 0x1F)
        day = _bcd_to_int(raw[_DATE] & 0x3F)
        hour = _bcd_to_int(raw[_HOUR] & 0x3F)
        minute = _bcd_to_int(raw[_MIN] & 0x7F)
        second = _bcd_to_int(raw[_SEC] & 0x7F)

        try:
            return datetime(year, month, day, hour, minute, second)
        except ValueError as exc:
            # BCD registers can hold values that are not decimal at all — 0x1F
            # in the month, say — and a chip that has never been set is full of
            # them. That is a chip to distrust, not a crash.
            raise Ds1302Error(f"the chip's registers are not a real time: {exc}") from exc

    def set_time(self, when: datetime) -> None:
        """Write the time, start the oscillator, and vouch for it in RAM.

        Order is load-bearing. WP first, or nothing below takes. The token
        last, so that a failure part-way through leaves the chip untrusted
        rather than leaving a token vouching for a time that was never written.
        """
        with self._lock:
            self.unprotect()

            # Written with CH set, so the oscillator is not counting while the
            # registers are half-updated, then started by the final write.
            self.write_register(_SEC, _int_to_bcd(when.second) | _CH_BIT)
            self.write_register(_MIN, _int_to_bcd(when.minute))
            self.write_register(_HOUR, _int_to_bcd(when.hour))  # bit 7 clear = 24-hour
            self.write_register(_DATE, _int_to_bcd(when.day))
            self.write_register(_MONTH, _int_to_bcd(when.month))
            self.write_register(_DOW, _int_to_bcd(when.isoweekday()))
            self.write_register(_YEAR, _int_to_bcd(when.year % 100))
            self.write_register(_SEC, _int_to_bcd(when.second))  # CH clear: run

            self._write_token(when)

    # ── the token, which is this chip's substitute for an OSF ────────────────

    def _write_token(self, when: datetime) -> None:
        stamp = int(when.timestamp())
        for offset, byte in enumerate(_TOKEN):
            self.write_register(_TOKEN_AT + offset, byte, ram=True)
        for index in range(_STAMP_BYTES):
            self.write_register(_STAMP_AT + index, (stamp >> (8 * index)) & 0xFF, ram=True)

    def read_token(self) -> datetime | None:
        """When the clock was last set, if the cell has held ever since.

        None means the token is gone, and the RAM holding it shares the coin
        cell with the oscillator — so the cell has been flat, absent or
        re-seated, and nothing the chip says about the time can be believed.
        """
        with self._lock:
            raw = self.read_burst(ram=True, count=_STAMP_AT + _STAMP_BYTES)
            if bytes(raw[_TOKEN_AT:_STAMP_AT]) != _TOKEN:
                return None
            stamp = 0
            for index in range(_STAMP_BYTES):
                stamp |= raw[_STAMP_AT + index] << (8 * index)
            try:
                return datetime.fromtimestamp(stamp)
            except (OSError, OverflowError, ValueError):
                return None

    def forget(self) -> None:
        """Wipe the token. For a test, and for handing a board on."""
        with self._lock:
            self.unprotect()
            for offset in range(_STAMP_AT + _STAMP_BYTES):
                self.write_register(offset, 0, ram=True)

    def close(self) -> None:
        self._pins.close()


@dataclass(frozen=True)
class Reading:
    """Everything one probe of the chip established."""

    present: bool
    #: True only when the token vouches. None when it could not be determined —
    #: which is not the same as False and must not be reported as though the
    #: hardware had failed.
    vouched: bool | None
    halted: bool | None
    when: datetime | None
    set_at: datetime | None
    trickle: bool | None
    detail: str


def probe(chip: Ds1302 | None = None) -> Reading:
    """One full look at the chip, in the shape `rtc.py` reports."""
    own = chip is None
    try:
        chip = chip or Ds1302()
    except Exception as exc:  # noqa: BLE001
        return Reading(False, None, None, None, None, None,
                       f"the DS1302 could not be opened: {exc}")

    try:
        if not chip.present():
            return Reading(False, None, None, None, None, None,
                           "nothing on the three RTC pins answers like a DS1302 — "
                           "check the wiring and that VCC is 3.3 V, not 5 V")

        halted = chip.halted()
        set_at = chip.read_token()
        trickle = chip.trickle_charging()

        when = None
        when_error = ""
        try:
            when = chip.read_time()
        except Ds1302Error as exc:
            when_error = str(exc)

        if set_at is None:
            return Reading(
                True, False, halted, when, None, trickle,
                "the DS1302 has no record of ever having been set, or its backup "
                "cell has been flat, absent or re-seated since it was — either "
                "way its time is invented",
            )
        if halted:
            return Reading(True, False, halted, when, set_at, trickle,
                           "the DS1302's oscillator is stopped, so its time is "
                           "frozen at whenever it stopped")
        if when is None:
            return Reading(True, None, halted, None, set_at, trickle,
                           when_error or "the DS1302's time could not be read")
        if when < set_at:
            # A clock cannot run backwards. Either the token or the registers
            # are wrong, and there is no way to tell which — so neither is
            # believed.
            return Reading(True, False, halted, when, set_at, trickle,
                           "the DS1302 reads earlier than the last time it was "
                           "set, so its registers or its RAM have been corrupted")

        return Reading(True, True, halted, when, set_at, trickle,
                       "the DS1302 has kept time continuously since it was set")
    except Exception as exc:  # noqa: BLE001
        return Reading(True, None, None, None, None, None,
                       f"the DS1302 could not be read: {exc}")
    finally:
        if own:
            try:
                chip.close()
            except Exception:  # noqa: BLE001
                pass

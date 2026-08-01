"""The DS1302, driven against a simulated chip.

A bit-banged protocol is exactly the kind of code that looks right and is not:
the failure modes are an off-by-one in the bit order, a turnaround one edge too
late, or a register map read in the wrong order — none of which raise anything.
They produce a plausible time that is wrong, which is the single failure this
whole firmware is written against.

So the fake below is not a stub. It is a state machine that implements the
chip's actual wire protocol — CE gating, LSB-first shifting, latch on the
rising edge, drive on the falling one, write protect, burst mode — and it
refuses anything the real part would refuse. A driver bug shows up here as a
wrong byte rather than as a passing test.
"""
from __future__ import annotations

from datetime import datetime

import pytest

from snapcare_dispenser import ds1302
from snapcare_dispenser.ds1302 import Ds1302, PinDriver

SCLK, IO, CE = 16, 20, 21


class FakeDs1302(PinDriver):
    """A DS1302 that lives in a dict, wired to three imaginary pins.

    Deliberately strict. It asserts the things the datasheet requires rather
    than tolerating them, because a driver that only works against a forgiving
    fake is a driver that does not work.
    """

    def __init__(self, *, protected: bool = True, halted: bool = True):
        #: Clock/calendar registers 0..8. Address 7 is control (WP), 8 trickle.
        self.clock = [0x00] * 9
        self.clock[0] = 0x80 if halted else 0x00      # CH
        self.clock[7] = 0x80 if protected else 0x00   # WP
        self.ram = [0x00] * 31

        self.levels = {SCLK: 0, IO: 0, CE: 0}
        self.io_is_input = False

        self._bits: list[int] = []
        self._command: int | None = None
        self._out: list[int] = []
        self._out_bit = 0
        self._writes: list[tuple[int, int]] = []
        #: Every rejected write, so a test can assert that WP really bit.
        self.blocked_writes: list[tuple[int, int]] = []
        #: Set if the driver ever drives the line while the chip is driving it.
        self.contention = False

    # ── the pin driver interface ────────────────────────────────────────────

    def as_output(self, gpio):
        if gpio == IO:
            # The chip drives the line from the falling edge after the command
            # byte. If the master claims it as an output during that window,
            # two push-pull drivers are fighting across a wire.
            if self._command is not None and self._is_read():
                self.contention = True
            self.io_is_input = False

    def as_input(self, gpio):
        if gpio == IO:
            self.io_is_input = True

    def read(self, gpio):
        if gpio == IO and self._command is not None and self._is_read():
            if self.levels[SCLK]:
                # Tri-stated on every rising edge. Sampling here reads a
                # floating pin, so return something that is obviously not data.
                return 1
            return self._out_bit
        return self.levels[gpio]

    def write(self, gpio, level):
        level = 1 if level else 0
        if gpio == IO:
            if self.io_is_input:
                raise AssertionError("wrote to the I/O line while it was an input")
            self.levels[IO] = level
            return

        if gpio == CE:
            was = self.levels[CE]
            self.levels[CE] = level
            if level and not was:
                if self.levels[SCLK]:
                    raise AssertionError("CE was raised while SCLK was high")
                self._start()
            elif was and not level:
                self._finish()
            return

        if gpio == SCLK:
            was = self.levels[SCLK]
            self.levels[SCLK] = level
            if not self.levels[CE]:
                return
            if level and not was:
                self._rising()
            elif was and not level:
                self._falling()

    # ── the chip ────────────────────────────────────────────────────────────

    def _start(self):
        self._bits = []
        self._command = None
        self._out = []
        self._out_bit = 0
        self._writes = []

    def _finish(self):
        self._command = None
        self._bits = []

    def _is_read(self) -> bool:
        return self._command is not None and bool(self._command & 1)

    def _rising(self):
        """Data is latched on the rising edge."""
        if self._command is None:
            self._bits.append(self.levels[IO])
            if len(self._bits) == 8:
                value = 0
                for index, bit in enumerate(self._bits):  # LSB first
                    value |= bit << index
                self._bits = []
                self._accept_command(value)
            return

        if not self._is_read():
            self._bits.append(self.levels[IO])
            if len(self._bits) == 8:
                value = 0
                for index, bit in enumerate(self._bits):
                    value |= bit << index
                self._bits = []
                self._store(value)

    def _falling(self):
        """The chip drives the next output bit on the falling edge."""
        if self._is_read() and self._out:
            self._out_bit = self._out.pop(0)

    def _accept_command(self, command: int):
        if not command & 0x80:
            raise AssertionError("command byte without bit 7 set — the chip would discard it")
        self._command = command

        address = (command >> 1) & 0x1F
        ram = bool(command & 0x40)
        if command & 1:
            # Queued, not presented. "The first data bit to be transmitted
            # occurs on the first falling edge after the last bit of the
            # command byte is written" — so bit 0 appears in `_falling`, one
            # edge from now. Presenting it here instead would shift the whole
            # reply by one bit, which is exactly the kind of thing this fake
            # exists to catch.
            self._out = self._bitstream(self._collect(address, ram))
            self._out_bit = 0

    def _collect(self, address: int, ram: bool) -> list[int]:
        store = self.ram if ram else self.clock
        if address == 0x1F:  # burst
            return list(store)
        return [store[address]] if address < len(store) else [0]

    @staticmethod
    def _bitstream(values: list[int]) -> list[int]:
        bits = []
        for value in values:
            for index in range(8):
                bits.append((value >> index) & 1)
        return bits

    def _store(self, value: int):
        address = (self._command >> 1) & 0x1F
        ram = bool(self._command & 0x40)
        store = self.ram if ram else self.clock

        if address == 0x1F:  # burst write
            self._writes.append((len(self._writes), value))
            target = len(self._writes) - 1
            if target < len(store):
                self._apply(store, target, value, ram)
            return
        self._apply(store, address, value, ram)

    def _apply(self, store, address, value, ram):
        protected = bool(self.clock[7] & 0x80)
        # WP gates everything except a write to the control register itself.
        if protected and not (not ram and address == 7):
            self.blocked_writes.append((address, value))
            return
        if address < len(store):
            store[address] = value


def _int_to_bcd(value: int) -> int:
    return ((value // 10) << 4) | (value % 10)


def _chip(**kwargs) -> tuple[Ds1302, FakeDs1302]:
    fake = FakeDs1302(**kwargs)
    return Ds1302(pins=fake, sclk=SCLK, io=IO, ce=CE, settle=0), fake


# ── the wire ────────────────────────────────────────────────────────────────

def test_a_register_round_trips_through_the_real_protocol():
    chip, fake = _chip(protected=False)
    chip.write_register(4, 0x12)  # month
    assert fake.clock[4] == 0x12
    assert chip.read_register(4) == 0x12


def test_the_io_line_is_released_before_the_chip_starts_driving():
    # The turnaround. Command bit 7 is always 1, so the master is driving the
    # line high at the moment the chip drives bit 0 — releasing one edge late
    # is two push-pull drivers fighting, and it is what most reference code on
    # the internet gets wrong.
    chip, fake = _chip(protected=False)
    chip.read_register(0)
    assert fake.contention is False


def test_ce_is_never_raised_with_the_clock_high():
    # The fake asserts this itself; the test is here so the requirement is
    # written down somewhere a person will read.
    chip, _fake = _chip(protected=False)
    chip.read_register(0)
    chip.write_register(1, 0x00)


def test_a_read_never_samples_while_the_clock_is_high():
    # The chip tri-states its I/O on every rising edge, so anything sampled
    # there is a floating pin. The fake returns 1 in that window, so a driver
    # that sampled at the wrong time would read 0xFF.
    chip, fake = _chip(protected=False)
    fake.clock[2] = 0x00
    assert chip.read_register(2) == 0x00


# ── write protect ───────────────────────────────────────────────────────────

def test_nothing_is_written_while_write_protect_is_set():
    # "My DS1302 will not start" is almost always this: WP has an undefined
    # power-on state, and while it is set every other write silently no-ops —
    # including the one that clears the clock-halt bit.
    chip, fake = _chip(protected=True)
    chip.write_register(4, 0x12)
    assert fake.clock[4] == 0x00
    assert fake.blocked_writes == [(4, 0x12)]


def test_setting_the_time_clears_write_protect_first():
    chip, fake = _chip(protected=True, halted=True)
    chip.set_time(datetime(2026, 8, 1, 9, 15, 30))
    assert fake.blocked_writes == [], "a write was swallowed by WP"
    assert fake.clock[0] & 0x80 == 0, "the oscillator was left halted"


# ── the time ────────────────────────────────────────────────────────────────

def test_the_time_round_trips():
    chip, _fake = _chip(protected=False, halted=True)
    when = datetime(2026, 8, 1, 9, 15, 30)
    chip.set_time(when)
    assert chip.read_time() == when


def test_the_register_order_is_the_ds1302s_and_not_the_ds3231s():
    # DATE comes before MONTH, and day-of-week after it. Reading it in the
    # DS3231's order is a silent misread, not a crash — and on the 1st of a
    # month it even looks plausible.
    chip, fake = _chip(protected=False, halted=False)
    chip.set_time(datetime(2026, 8, 1, 9, 15, 30))
    assert fake.clock[3] == _int_to_bcd(1), "register 3 must be the day of the month"
    assert fake.clock[4] == _int_to_bcd(8), "register 4 must be the month"
    assert fake.clock[5] == _int_to_bcd(6), "register 5 must be the ISO weekday"


def test_the_time_is_read_as_a_burst_so_it_cannot_straddle_a_tick():
    # Reading seven registers one at a time from Python takes milliseconds, and
    # a tick in the middle gives 10:59:59 for the seconds and 11:00 for the
    # minutes — an hour wrong, once an hour, silently.
    chip, fake = _chip(protected=False, halted=False)
    chip.set_time(datetime(2026, 8, 1, 9, 15, 30))

    reads: list[int] = []
    original = fake._collect

    def watch(address, ram):
        reads.append(address)
        return original(address, ram)

    fake._collect = watch
    chip.read_time()
    assert reads == [0x1F], "the time was read register by register"


def test_a_chip_left_in_12_hour_mode_is_refused_rather_than_misread():
    # Bit 5 is then AM/PM instead of the tens-of-hours bit, so reading it as
    # BCD is twelve hours wrong for half of every day.
    chip, fake = _chip(protected=False, halted=False)
    chip.set_time(datetime(2026, 8, 1, 9, 15, 30))
    fake.clock[2] |= 0x80
    with pytest.raises(ds1302.Ds1302Error, match="12-hour"):
        chip.read_time()


def test_registers_that_are_not_a_real_time_are_refused():
    chip, fake = _chip(protected=False, halted=False)
    fake.clock[4] = 0x19  # month 19
    with pytest.raises(ds1302.Ds1302Error):
        chip.read_time()


# ── the trust token ─────────────────────────────────────────────────────────

def test_setting_the_time_leaves_a_token_in_battery_backed_ram():
    chip, _fake = _chip(protected=False, halted=True)
    when = datetime(2026, 8, 1, 9, 15, 30)
    chip.set_time(when)
    assert chip.read_token() == when.replace(microsecond=0)


def test_a_flat_cell_takes_the_token_with_the_time():
    # The whole basis of the trust model: RAM and the oscillator share the coin
    # cell, so the token is gone in exactly the cases where the time is
    # invented. This is what the DS3231's oscillator-stop flag does in
    # hardware and the DS1302 cannot.
    chip, fake = _chip(protected=False, halted=False)
    chip.set_time(datetime(2026, 8, 1, 9, 15, 30))
    fake.ram = [0x00] * 31  # the cell died
    assert chip.read_token() is None


def test_a_chip_that_has_never_been_set_does_not_vouch():
    chip, _fake = _chip(protected=True, halted=True)
    reading = ds1302.probe(chip)
    assert reading.present is True
    assert reading.vouched is False
    assert "no record of ever having been set" in reading.detail


def test_a_vouched_chip_reports_its_time():
    chip, _fake = _chip(protected=False, halted=True)
    when = datetime(2026, 8, 1, 9, 15, 30)
    chip.set_time(when)
    reading = ds1302.probe(chip)
    assert reading.vouched is True
    assert reading.when == when
    assert reading.set_at == when


def test_a_halted_oscillator_is_reported_and_not_trusted():
    chip, fake = _chip(protected=False, halted=False)
    chip.set_time(datetime(2026, 8, 1, 9, 15, 30))
    fake.clock[0] |= 0x80  # somebody stopped it
    reading = ds1302.probe(chip)
    assert reading.halted is True
    assert reading.vouched is False


def test_a_clock_reading_earlier_than_it_was_set_is_not_trusted():
    # A clock cannot run backwards. Either the registers or the RAM are
    # corrupt and there is no way to tell which, so neither is believed.
    chip, fake = _chip(protected=False, halted=False)
    chip.set_time(datetime(2026, 8, 1, 9, 15, 30))
    fake.clock[6] = _int_to_bcd(25)  # year 2025
    reading = ds1302.probe(chip)
    assert reading.vouched is False
    assert "earlier than the last time it was set" in reading.detail


# ── the hardware around it ──────────────────────────────────────────────────

def test_nothing_on_the_pins_is_not_mistaken_for_a_chip():
    class Dead(PinDriver):
        def write(self, gpio, level): pass
        def read(self, gpio): return 1      # a floating line pulled high
        def as_output(self, gpio): pass
        def as_input(self, gpio): pass

    chip = Ds1302(pins=Dead(), sclk=SCLK, io=IO, ce=CE, settle=0)
    assert chip.present() is False
    reading = ds1302.probe(chip)
    assert reading.present is False
    assert reading.vouched is None


def test_the_presence_probe_leaves_ram_as_it_found_it():
    chip, fake = _chip(protected=False, halted=False)
    chip.set_time(datetime(2026, 8, 1, 9, 15, 30))
    before = list(fake.ram)
    assert chip.present() is True
    assert fake.ram == before, "the probe scribbled on a byte it did not restore"


def test_a_trickle_charger_left_enabled_is_noticed():
    # The holder on a cheap module is wired straight to the cell and usually
    # ships with a non-rechargeable CR2032 in it.
    chip, fake = _chip(protected=False, halted=False)
    assert chip.trickle_charging() is False
    fake.clock[8] = 0xA5
    assert chip.trickle_charging() is True
    assert ds1302.probe(chip).trickle is True

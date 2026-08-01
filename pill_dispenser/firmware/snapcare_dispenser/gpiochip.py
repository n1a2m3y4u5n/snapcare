"""One `lgpio` handle, shared by the servos, the buzzer and the button.

Why this module exists at all
-----------------------------
`pigpio` is gone. It was preinstalled on Raspberry Pi OS Lite up to and
including Bookworm and disappeared at the Trixie rebase; Debian has never
packaged the daemon in any release, and the 64-bit Pi OS images bootstrap from
Debian. So on a 64-bit Trixie card there is no `apt` path to `pigpiod` at all,
and `sudo apt install pigpio` fails with nothing to say for itself.

`lgpio` is what replaced it. `python3-lgpio` is preinstalled on every Raspberry
Pi OS Lite image since 2023, on Bookworm and Trixie, on both architectures, and
it is what `gpiozero` has been choosing by default the whole time. It is the
right first fallback, and on a Trixie card it is in practice the only one.

Three things about it that are not obvious and all three cost something
--------------------------------------------------------------------
**The handle is not just a number.** `gpiochip_open` packs the chip number into
bits 16 and up, and `callback()` recovers it by shifting the handle right. Mask
it, rebuild it, or store the low half and edge callbacks silently never fire —
no error, no log line, just a confirm button that does nothing for the rest of
the device's life. So the value this module hands out is the exact value
`gpiochip_open` returned, and nothing is allowed to normalise it.

**Which chip is the header changes between boards and kernels.** A Pi 3B has
always been `gpiochip0`. A Pi 5 was `gpiochip4` until a mid-2024 kernel put it
back at 0. Hard-coding either number is a device that works on one board and
not the next, so this probes and matches on the chip *label* — every header
controller is called `pinctrl-something`, and the decoys next to it
(`raspberrypi-exp-gpio`, `gpio-brcmstb@...`) are not.

**Stopping a transmission does not drive the line.** `tx_servo(h, g, 0)` and
`tx_pwm(h, g, 0, 0)` deactivate the transmit record and leave the pin at
whatever level the timing thread last wrote. If the stop lands mid-pulse the
line stays *high* — which on a servo signal is a pulse that never ends, and on
a piezo is DC bias across the element for as long as the device is on. Every
stop in this firmware is therefore followed by an explicit write of 0, and
`stop_pin` below is the only correct way to do it.

One more, which is a design constraint rather than a bug: **every PWM, servo and
wave transmission in the process shares one timing thread.** Driving a 2.7 kHz
tone is 5400 edges a second going through the same loop that is timing a servo
pulse. The two do overlap here — the chirp repeats every twenty seconds while a
dose waits, and a drop takes four — so a servo moving during a chirp is a little
less steady than one moving in silence. That is worth knowing and is not worth
serialising: the alternative is a chirp that pauses for four seconds exactly
when somebody is walking towards the machine.

And the honest summary: lgpio's servo timing is a real regression from pigpio's.
pigpio timed pulses with the DMA controller and could not be stretched by a busy
CPU. lgpio times them from an ordinary thread calling `clock_nanosleep`, with no
realtime priority — so scheduler jitter reaches the servo. It is much better
than RPi.GPIO's Python-timed software PWM and much worse than DMA. The firmware
says which one it got, at startup and on the status page, and `--selftest`
refuses to sign off a build that quietly landed on the worst one.
"""
from __future__ import annotations

import logging
import threading

log = logging.getLogger(__name__)

#: Every Raspberry Pi header controller is called this, whatever the SoC:
#: `pinctrl-bcm2835` on a 3B, `pinctrl-bcm2711` on a 4, `pinctrl-rp1` on a 5.
#: The chips that are not the header are called other things entirely.
_HEADER_LABEL_PREFIX = "pinctrl-"

#: Where the header has been seen to live. Tried in order, and only accepted if
#: the label matches — so the order is a hint, not a decision.
_CANDIDATE_CHIPS = (0, 4)

_lock = threading.Lock()
_handle: int | None = None
_chip_label: str = ""
_unavailable: str = ""


def available() -> bool:
    """Can this machine drive a pin through lgpio?"""
    return open_chip() is not None


#: Where the kernel writes the board name. A null-terminated string, so the
#: trailing NUL has to come off before anything compares it.
_MODEL_PATH = "/proc/device-tree/model"


def board_model(path: str = _MODEL_PATH) -> str:
    """`Raspberry Pi 3 Model B Rev 1.2`, or `''` on anything that is not a Pi."""
    try:
        with open(path, "rb") as handle:
            return handle.read().decode("utf-8", "replace").rstrip("\x00").strip()
    except OSError:
        return ""


def on_raspberry_pi(path: str = _MODEL_PATH) -> bool:
    """Is this an actual dispenser, or somebody's laptop?

    The distinction is not cosmetic and it is not about logging. On a laptop
    the mock servo backend is the point — `make run` is the whole firmware with
    the horns swapped for a recorder, and doses *should* be simulated end to
    end. On a Raspberry Pi the same backend means every GPIO library is missing
    and nothing can move, and simulating a dose there writes medication into a
    carer's app that is still sitting in the hopper.

    Same code, opposite meanings, and this is the only thing that tells them
    apart.
    """
    return board_model(path).startswith("Raspberry Pi")


def chip_label() -> str:
    """`pinctrl-bcm2835`, or `''` if no chip was opened. For the status page."""
    open_chip()
    return _chip_label


def unavailable_reason() -> str:
    """Why there is no handle, in a sentence somebody can act on."""
    open_chip()
    return _unavailable


def open_chip() -> int | None:
    """The one handle, opened on first use. None if lgpio cannot be used.

    Never returns a handle that has been masked or reassembled — see the module
    docstring; `callback()` reads the chip number back out of the high bits.
    """
    global _handle, _chip_label, _unavailable

    with _lock:
        if _handle is not None or _unavailable:
            return _handle

        try:
            import lgpio  # noqa: PLC0415
        except ImportError as exc:
            _unavailable = (f"lgpio is not installed ({exc}) — "
                            "sudo apt install python3-lgpio")
            return None

        tried = []
        for chip in _CANDIDATE_CHIPS:
            try:
                handle = lgpio.gpiochip_open(chip)
            except Exception as exc:  # noqa: BLE001 - any failure means try the next
                tried.append(f"chip {chip}: {exc}")
                continue

            label = _label_of(lgpio, handle)
            if label.startswith(_HEADER_LABEL_PREFIX):
                _handle = handle
                _chip_label = label
                log.info("lgpio: using /dev/gpiochip%d (%s)", chip, label)
                return _handle

            # Not the header — an expander, or the SoC's other controller.
            # Closing it matters: leaving it open holds a file descriptor for
            # the life of the process and can hold the chip against something
            # else that wants it.
            tried.append(f"chip {chip}: label {label!r} is not the header")
            try:
                lgpio.gpiochip_close(handle)
            except Exception:  # noqa: BLE001
                pass

        _unavailable = "no gpiochip looked like the Pi header (" + "; ".join(tried) + ")"
        log.info("lgpio unusable: %s", _unavailable)
        return None


def _label_of(lgpio, handle: int) -> str:
    """The chip's label, or `''` if it cannot be read."""
    try:
        info = lgpio.gpio_get_chip_info(handle)
    except Exception:  # noqa: BLE001
        return ""
    # [status, lines, name, label]. A negative status means the rest is junk.
    if not isinstance(info, (list, tuple)) or len(info) < 4 or info[0] < 0:
        return ""
    label = info[3]
    return label.decode() if isinstance(label, bytes) else str(label)


def stop_pin(handle: int, gpio: int) -> None:
    """Stop transmitting on a pin **and** drive it low.

    The second half is the part that is easy to leave out and expensive to
    leave out. Cancelling a transmission only marks the record inactive; the
    line keeps whatever level the timing thread last wrote it to, so a stop
    that lands mid-pulse leaves the pin high — a servo pulse that never ends,
    or a piezo sitting under DC bias drawing current until the power is pulled.
    """
    import lgpio  # noqa: PLC0415

    try:
        lgpio.tx_pwm(handle, gpio, 0, 0)
    except Exception:  # noqa: BLE001 - nothing may have been transmitting
        pass
    try:
        lgpio.gpio_write(handle, gpio, 0)
    except Exception:  # noqa: BLE001 - the pin may not be claimed as an output
        pass


def close() -> None:
    """Release the handle. Only the daemon's shutdown path calls this."""
    global _handle, _chip_label, _unavailable

    with _lock:
        if _handle is None:
            return
        try:
            import lgpio  # noqa: PLC0415

            lgpio.gpiochip_close(_handle)
        except Exception:  # noqa: BLE001 - shutdown must not raise
            pass
        _handle = None
        _chip_label = ""
        _unavailable = ""


def _reset_for_tests() -> None:
    """Forget everything, so a test can drive the probe again."""
    global _handle, _chip_label, _unavailable
    with _lock:
        _handle = None
        _chip_label = ""
        _unavailable = ""

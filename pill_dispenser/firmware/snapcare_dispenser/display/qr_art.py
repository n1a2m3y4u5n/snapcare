"""The setup QR, as pixels, built once and never again.

Why this is not just a call to `qr.qr_matrix`
---------------------------------------------
Two reasons, and both are about the frame budget.

**It is the same code forever.** The setup network's name and passphrase are
derived from the board's serial and never change for the life of the device, so
the matrix is a constant. Encoding it per repaint would put a QR encoder on a
path that runs whenever the panel changes, to produce a value that is
bit-for-bit what it produced last time.

**It must never raise.** `segno` is an optional apt package on this build, so
`qr.qr_matrix` can fail on a perfectly good machine — and the frame that needs
it is the *setup* frame, which is the one a person is standing in front of with
a phone. A missing encoder has to degrade to "here are the names, type them"
rather than to a traceback on the scheduler's thread.

Sizing is derived, never typed
------------------------------
The module count depends on the payload, and the payload depends on how long
this device's SSID and passphrase happen to be — measured at 37x37 for the
44-character `WIFI:` string this firmware generates, which is not the number
anybody would guess. So the caller divides the space it has by `len(matrix)`
and gets whatever module size that allows.

`MIN_MODULE` is the floor, and it exists to be tripped over. A QR is either
scannable or it is decoration, and the failure mode of shrinking it to make room
for something else is a code that reads fine on the bench under a desk lamp and
not at all in a dim hallway at arm's length.
"""
from __future__ import annotations

import logging

log = logging.getLogger(__name__)

__all__ = ["wifi_matrix", "blit", "MIN_MODULE"]

#: Below three pixels a module is smaller than the blur of a phone camera
#: hand-held at 25 cm, and the code stops being reliably scannable.
MIN_MODULE = 3

#: `(ssid, passphrase) -> matrix or None`. Tiny and permanently valid — the
#: identity is a constant of the board — so it is never evicted.
_CACHE: dict[tuple[str, str], list[list[bool]] | None] = {}


def wifi_matrix(ssid: object, passphrase: object) -> list[list[bool]] | None:
    """The join code as a matrix of booleans, or None if it cannot be built.

    None is a real answer and the caller has a real frame for it. It means this
    card has no QR encoder installed, which is a supported build.
    """
    key = (str(ssid or ""), str(passphrase or ""))
    if key in _CACHE:
        return _CACHE[key]

    matrix: list[list[bool]] | None = None
    try:
        from .. import provisioning, qr  # noqa: PLC0415 - optional, and slow

        payload = provisioning.wifi_qr_payload(key[0], key[1])
        matrix = qr.qr_matrix(payload, quiet=4)
        if not matrix or not matrix[0]:
            matrix = None
    except Exception as exc:  # noqa: BLE001 - never onto the scheduler thread
        # At INFO rather than WARNING: a build without `segno` is a decision
        # somebody made with apt, not a fault, and the setup frame says so by
        # printing the names instead.
        log.info("no setup QR on the panel (%s) — the frame will show the "
                 "network name and passphrase to be typed instead", exc)
        matrix = None

    _CACHE[key] = matrix
    return matrix


def blit(canvas, x: int, y: int, matrix: list[list[bool]], scale: int,
         dark: int, light: int) -> None:
    """Draw the matrix at `scale` pixels per module.

    Dark on light, always, whatever colour the frame behind it is. A code drawn
    in the field's own ink is a code no camera will decode, and the quiet zone
    comes from `qr_matrix` itself so nothing extra has to be reserved around it.
    """
    for row_index, row in enumerate(matrix):
        top = y + row_index * scale
        run_start: int | None = None
        for col_index, module in enumerate(row + [False]):
            if module and run_start is None:
                run_start = col_index
            elif not module and run_start is not None:
                # Runs rather than modules: a 37x37 code is 1369 rects one way
                # and a few hundred the other, and `Rgb565.rect` slice-assigns a
                # row in one step.
                canvas.rect(x + run_start * scale, top,
                            (col_index - run_start) * scale, scale, dark)
                run_start = None


def paint(canvas, x: int, y: int, matrix: list[list[bool]], scale: int,
          dark: int, light: int) -> int:
    """Light backing, then the dark modules. Returns the side in pixels."""
    side = len(matrix) * scale
    canvas.rect(x, y, side, side, light)
    blit(canvas, x, y, matrix, scale, dark, light)
    return side

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

__all__ = ["matrix_for", "wifi_matrix", "blit", "paint", "MIN_MODULE"]

#: Below three pixels a module is smaller than the blur of a phone camera
#: hand-held at 25 cm, and the code stops being reliably scannable.
MIN_MODULE = 3

#: `payload -> matrix or None`. Tiny and permanently valid — every payload this
#: is asked for is derived from the board's serial — so it is never evicted.
_CACHE: dict[str, list[list[bool]] | None] = {}


def matrix_for(payload: object) -> list[list[bool]] | None:
    """Any payload as a matrix of booleans, or None if it cannot be built.

    None is a real answer and every caller has a real frame for it. It means
    this card has no QR encoder installed, which is a supported build.

    Payload rather than "the setup network" because there is now a second code
    on the panel. The pairing code is drawn by the same three lines of geometry
    and fails the same way, and duplicating them was the shorter road to a
    pairing frame that scans on the bench and not in a hallway — the sizing
    rules below are the part that is easy to get subtly wrong.
    """
    key = str(payload or "")
    if not key:
        return None
    if key in _CACHE:
        return _CACHE[key]

    matrix: list[list[bool]] | None = None
    try:
        from .. import qr  # noqa: PLC0415 - optional, and slow

        matrix = qr.qr_matrix(key, quiet=4)
        if not matrix or not matrix[0]:
            matrix = None
    except Exception as exc:  # noqa: BLE001 - never onto the scheduler thread
        # At INFO rather than WARNING: a build without `segno` is a decision
        # somebody made with apt, not a fault, and the frames that need a code
        # say so by printing the characters to be typed instead.
        log.info("no QR on the panel (%s) — the frame will show the "
                 "characters to be typed instead", exc)
        matrix = None

    _CACHE[key] = matrix
    return matrix


def wifi_matrix(ssid: object, passphrase: object) -> list[list[bool]] | None:
    """The setup network's join code. See `matrix_for`."""
    try:
        from .. import provisioning  # noqa: PLC0415 - optional, and slow

        return matrix_for(provisioning.wifi_qr_payload(str(ssid or ""),
                                                       str(passphrase or "")))
    except Exception as exc:  # noqa: BLE001 - never onto the scheduler thread
        log.info("no setup QR on the panel (%s)", exc)
        return None


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

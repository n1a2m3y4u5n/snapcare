"""Drawing QR codes, with whatever encoder the machine happens to have.

The device needs exactly two codes, both for setup and both scanned by a phone:

    WIFI:T:WPA;S:SnapCare-7QK4;P:...;;    join the setup hotspot
    http://10.42.0.1/                     open the setup page

Neither is on a critical path at run time, so this deliberately does not insist
on a particular library. It tries `segno` (pure Python, ~50 KB, the right thing
to install on a Pi), then OpenCV (already a dependency of the form sheet
reader, so it is present on a development machine), and if neither is there it
says so and the caller falls back to printing the text — which a person can
still type. A missing QR library must not be the reason a dispenser cannot be
set up.

Output is SVG. It scales to whatever a phone or a printer wants without any
resampling, it inlines straight into the setup page with no second request, and
it needs no image library on the device to produce.

Every code is decoded again before it is handed out, whenever an encoder that
can decode is available. This is the practice `form_sheet_parser/cli.py`
already follows here, for the reason it gives: an unreadable QR produced
without complaint is the failure that costs an afternoon at the bench, and this
particular one would be printed onto a sticker and glued to a device.
"""
from __future__ import annotations

import logging

log = logging.getLogger(__name__)


class QREncoderUnavailable(RuntimeError):
    """No QR encoder is installed. Callers fall back to showing the text."""


def qr_matrix(text: str, quiet: int = 4) -> list[list[bool]]:
    """The code as rows of booleans, True meaning a dark module.

    The four-module quiet zone is included, because it is part of the code
    rather than a margin: a QR pressed against the edge of an image does not
    scan, and this one is going onto a label where somebody will crop it.
    """
    try:
        import segno
    except ImportError:
        pass
    else:
        code = segno.make(text, error="m")
        return [[bool(module) for module in row]
                for row in code.matrix_iter(scale=1, border=quiet)]

    try:
        import cv2
        import numpy as np
    except ImportError:
        raise QREncoderUnavailable(
            "no QR encoder available — pip install segno"
        ) from None

    encoder = cv2.QRCodeEncoder.create()
    image = encoder.encode(text)
    if image is None or image.size == 0:
        raise QREncoderUnavailable(f"could not encode {len(text)} characters as a QR code")

    # OpenCV returns one pixel per module, 0 for dark, with a border of its own
    # choosing — measured at **two** modules, not the four the specification
    # requires. Trusting that border would ship a label that scans on a clean
    # screen and fails once it is printed next to anything else.
    #
    # So the border is not assumed at all: the symbol's bounding box is
    # measured and our own quiet zone applied around it. A QR always has finder
    # patterns in three corners and a dark module near the fourth, so the
    # bounding box of the dark pixels is exactly the symbol.
    dark = np.asarray(image) == 0
    rows = np.flatnonzero(np.any(dark, axis=1))
    cols = np.flatnonzero(np.any(dark, axis=0))
    if rows.size == 0 or cols.size == 0:
        raise QREncoderUnavailable("the encoder produced an empty code")

    core = dark[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
    padded = np.pad(core, quiet, constant_values=False)
    return [[bool(v) for v in row] for row in padded]


def verify(text: str) -> bool:
    """Read the code back. True if it decoded to `text`, False if it did not.

    Returns True when there is no decoder available: this is a check, not a
    gate, and refusing to show a QR because we cannot double-check it would
    trade a possible problem for a certain one.
    """
    try:
        import cv2
        import numpy as np
    except ImportError:
        return True

    try:
        matrix = qr_matrix(text)
    except QREncoderUnavailable:
        return False

    # Blown up before decoding, because the detector needs several pixels per
    # module to find the finder patterns at all — at one pixel per module it
    # fails on codes that are perfectly valid.
    pixels = np.array([[0 if cell else 255 for cell in row] for row in matrix], dtype=np.uint8)
    big = np.kron(pixels, np.ones((8, 8), dtype=np.uint8))
    decoded, _, _ = cv2.QRCodeDetector().detectAndDecode(big)
    return decoded == text


def to_svg(text: str, module_px: int = 8, quiet: int = 4,
           dark: str = "#000000", light: str = "#ffffff") -> str:
    """One self-contained `<svg>` element, ready to inline into a page.

    Drawn as one `<path>` rather than a rectangle per module. A version-4 code
    is 33x33 with the quiet zone, which is over a thousand elements — as a path
    it is a few kilobytes instead of tens, and it renders without the hairline
    seams that abutting `<rect>`s show at some zoom levels on some browsers.
    """
    matrix = qr_matrix(text, quiet=quiet)
    size = len(matrix)

    segments = []
    for y, row in enumerate(matrix):
        x = 0
        while x < size:
            if not row[x]:
                x += 1
                continue
            run = x
            while run < size and row[run]:
                run += 1
            segments.append(f"M{x} {y}h{run - x}v1h-{run - x}z")
            x = run

    path = "".join(segments)
    span = size * module_px
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
        f'width="{span}" height="{span}" shape-rendering="crispEdges" '
        f'role="img" aria-label="QR code">'
        f'<rect width="{size}" height="{size}" fill="{light}"/>'
        f'<path d="{path}" fill="{dark}"/>'
        f"</svg>"
    )


def to_text(text: str, quiet: int = 4) -> str:
    """The code as terminal half-blocks, scannable straight off the screen.

    `snapcare-dispenser --show-qr` prints this, so somebody with nothing but an
    SSH session can hold a phone up to the terminal and join the hotspot.

    Two details make the difference between this working and being a decoration.

    Colours are set explicitly instead of relying on the block character's
    shape. Printing '█' for a dark module gives the terminal's *foreground*
    colour, so on the usual light-on-dark terminal the code comes out inverted
    — and phone scanners will not read an inverted QR. Naming both colours on
    every cell makes the output identical under any theme.

    Two matrix rows are packed into each line with '▀', whose top half is drawn
    in the foreground colour and bottom half in the background. Terminal cells
    are about twice as tall as they are wide, so this is also what makes the
    code square; one row per line is a QR stretched 2:1, which does not scan.
    """
    matrix = qr_matrix(text, quiet=quiet)
    if len(matrix) % 2:
        matrix.append([False] * len(matrix[0]))

    black_fg, white_fg = "\033[30m", "\033[97m"
    black_bg, white_bg = "\033[40m", "\033[107m"
    reset = "\033[0m"

    lines = []
    for top, bottom in zip(matrix[0::2], matrix[1::2]):
        line = []
        for upper, lower in zip(top, bottom):
            line.append((black_fg if upper else white_fg)
                        + (black_bg if lower else white_bg)
                        + "▀")
        lines.append("".join(line) + reset)
    return "\n".join(lines)

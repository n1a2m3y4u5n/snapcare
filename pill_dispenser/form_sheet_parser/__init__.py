"""Paper schedule sheets -> a dispenser schedule.

    from form_sheet_parser import parse_form_sheet_file, sheets_to_schedule

    sheet = parse_form_sheet_file("photo.jpg")     # one sheet, one tray layer
    plan  = sheets_to_schedule([sheet])            # -> SC1 payload for the device

`form_sheet_parser` reads the marks; `schedule` turns them into the optical
protocol the dispenser speaks; `synth` manufactures test photographs so the
reader can be exercised without a printer and a camera.
"""
from .form_sheet_parser import (  # noqa: F401
    DEFAULT_CONFIG,
    SIDE,
    SheetResult,
    assess_quality,
    crop_field,
    detect_aruco_corners,
    generate_aruco_corners,
    load_config,
    parse_form_sheet,
    parse_form_sheet_file,
    preprocess_form_sheet,
    read_form_sheet,
    warp_form_sheet,
)
from .schedule import (  # noqa: F401
    ALL_DAYS,
    DURATION_DAYS,
    LayerPlan,
    SchedulePlan,
    encode_schedule,
    encode_weekly,
    sheet_to_layer_plan,
    sheets_to_schedule,
)

__all__ = [
    "parse_form_sheet", "parse_form_sheet_file", "SheetResult",
    "sheets_to_schedule", "sheet_to_layer_plan", "SchedulePlan", "LayerPlan",
    "encode_schedule", "encode_weekly", "ALL_DAYS", "DURATION_DAYS",
]

"""폼시트 사진 한 장 → JSON (웹앱이 호출하는 진입점).

form_sheet_parser 의 함수들을 순서대로 엮기만 한다. 파싱 로직은 그쪽에 있고
여기는 표준입출력 계약만 담당한다 — Next 의 API 라우트가 이 스크립트를 실행한다.

Usage:  python parse_cli.py <image>
Out  :  {"ok": true, "values": {...}, "problems": [...]}
        {"ok": false, "error": "..."}
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "image path required"}))
        return 2

    try:
        import cv2  # noqa: PLC0415 — 없을 때 아래에서 잡아 JSON 으로 알린다
        from form_sheet_parser import (  # noqa: PLC0415
            detect_aruco_corners, warp_form_sheet, preprocess_form_sheet, read_form_sheet,
        )
    except ImportError as e:
        print(json.dumps({"ok": False, "error": f"opencv unavailable: {e}"}))
        return 1

    img = cv2.imread(sys.argv[1])
    if img is None:
        print(json.dumps({"ok": False, "error": "could not read image"}))
        return 1

    try:
        quad = detect_aruco_corners(img)
    except ValueError as e:
        # 네 귀퉁이 마커를 못 찾으면 종이 전체가 프레임에 안 들어온 것이다.
        print(json.dumps({"ok": False, "error": f"markers not found: {e}"}))
        return 1

    warped = warp_form_sheet(img, quad)
    result = read_form_sheet(preprocess_form_sheet(warped), str(HERE / "form_sheet" / "form_sheet_config.json"))
    # read_form_sheet 는 dict 가 아니라 SheetResult 를 준다. 예전에는 `**result` 로
    # 펼치려다 매번 TypeError 로 죽었고, 라우트는 그 실패를 "parser_unavailable"(501)
    # 로 옮겨 적었다 — 코드가 틀린 것을 환경이 없는 것처럼 보이게 하는 실패였다.
    # ok 도 넘겨받은 값이 아니라 결과에서 읽는다. 읽다 만 장을 성공이라 부르지 않는다.
    print(json.dumps({"ok": result.ok, **result.to_json()}, ensure_ascii=False))
    return 0 if result.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

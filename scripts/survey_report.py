#!/usr/bin/env python3
"""전문가 설문 응답을 엑셀로 뽑는다.

    python3 scripts/survey_report.py [응답폴더] [출력.xlsx]

응답폴더 기본값은 $SNAPCARE_DATA_DIR/survey 이고, 없으면 ./.data/survey 다.
운영 서버에서는 fly 볼륨의 /data/survey 이므로 먼저 내려받아야 한다.

    fly ssh sftp get /data/survey ./survey-dump   # 또는 fly ssh console 로 tar

openpyxl 이 필요하다.  python3 -m pip install --user openpyxl

────────────────────────────────────────────────────────────────────────
이 스크립트의 요점은 **채점을 시트 안에서 하게 만드는 것**이다.

픽토그램 이해도는 자유응답으로 받으므로 정답 여부를 사람이 판정해야 한다.
응답자에게 자기 판정을 맡기지 않는 이유는 자기 판정이 관대해지기 때문이고,
그래서 원문을 그대로 저장해 두었다.

'픽토그램' 시트의 판정 칸에 통과·부분·실패·치명적 혼동을 채우면 '집계' 시트의
ISO 67% 와 ANSI 85% 판정이 수식으로 따라온다. ANSI 는 정답률 85% 와 **치명적
혼동 5% 이하**를 함께 요구하므로 정답률만으로는 기준을 말할 수 없다. 그 두 조건을
한 칸에서 계산한다.
"""
import json
import os
import pathlib
import re
import sys
from collections import Counter

try:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation
except ImportError:
    sys.exit('openpyxl 이 없다:  python3 -m pip install --user openpyxl')

ROOT = pathlib.Path(__file__).resolve().parent.parent
GLYPHS_TS = ROOT / 'lib' / 'survey' / 'glyphs.ts'

VERDICTS = ['통과', '부분', '실패', '치명적 혼동']
ROSTER: dict[str, tuple[str, str]] = {}

HDR = Font(bold=True, color='FFFFFF', size=11)
HDR_FILL = PatternFill('solid', fgColor='2F5597')
WARN_FILL = PatternFill('solid', fgColor='FCE4D6')
OK_FILL = PatternFill('solid', fgColor='C6E0B4')
THIN = Side(style='thin', color='BFBFBF')
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
TOP = Alignment(vertical='top', wrap_text=True)


def intended_meanings() -> dict[str, str]:
    """glyphs.ts 에서 형태소 이름과 의도한 뜻을 읽는다.

    한 곳에만 적어 두고 여기서 읽는다. 이 파일에 뜻을 다시 적으면 둘이 어긋나고,
    어긋난 채로 채점하면 통과·실패가 뒤집힌다.
    """
    src = GLYPHS_TS.read_text(encoding='utf-8')
    pairs = re.findall(
        r"name:\s*'([^']+)'\s*,\s*intended:\s*\{\s*ko:\s*'([^']*)'", src)
    if not pairs:
        sys.exit(f'{GLYPHS_TS} 에서 형태소를 읽지 못했다. 파일 형식이 바뀌었는지 확인할 것.')
    return dict(pairs)


def load(dirpath: pathlib.Path) -> list[dict]:
    out = []
    for f in sorted(dirpath.glob('*.json')):
        try:
            out.append(json.loads(f.read_text(encoding='utf-8')))
        except Exception as e:                       # noqa: BLE001
            print(f'  건너뜀 {f.name}: {e}', file=sys.stderr)
    return out


def minutes(r) -> str:
    """시작한 때와 낸 때의 차이. 문항이 너무 길었는지 판단하는 근거가 된다."""
    a, b = r.get('startedAt'), r.get('clientTime')
    if not (a and b):
        return ''
    try:
        from datetime import datetime
        f = lambda x: datetime.fromisoformat(x.replace('Z', '+00:00'))
        return round((f(b) - f(a)).total_seconds() / 60, 1)
    except Exception:                                # noqa: BLE001
        return ''


def roster() -> dict[str, tuple[str, str]]:
    """수신자 토큰 → (이름, 소속). 명단 엑셀에서 읽는다.

    서버는 토큰만 알고 있고 사람은 모른다. 여기서만 이어 붙인다 — 그래서
    이 스크립트를 우리 손에서 돌려야 응답자가 누구인지 나온다.
    """
    try:
        from openpyxl import load_workbook
        wb = load_workbook(ROOT / 'scratchpad' / 'contacts' / 'SnapCare_전문가_명단.xlsx',
                           read_only=True, data_only=True)
        ws = wb['발송대상']
        out = {}
        for row in ws.iter_rows(min_row=2, values_only=True):
            if row[8]:
                out[str(row[8])] = (str(row[4] or ''), str(row[5] or ''))
        return out
    except Exception as e:                           # noqa: BLE001
        print(f'  명단을 읽지 못해 이름 조인을 건너뛴다: {e}', file=sys.stderr)
        return {}


def head(ws, cols, widths):
    ws.append(cols)
    for c in ws[1]:
        c.font, c.fill, c.border = HDR, HDR_FILL, BOX
        c.alignment = Alignment(vertical='center', wrap_text=True)
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = 'A2'
    ws.row_dimensions[1].height = 30


def main() -> None:
    src = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(
        os.environ.get('SNAPCARE_DATA_DIR', ROOT / '.data')) / 'survey'
    out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'scratchpad' / 'survey-responses.xlsx'

    if not src.is_dir():
        sys.exit(f'응답 폴더가 없다: {src}')
    rows = load(src)
    if not rows:
        sys.exit(f'{src} 에 응답이 없다')
    print(f'응답 {len(rows)}건 읽음')

    INTENDED = intended_meanings()
    global ROSTER
    ROSTER = roster()
    print(f'명단 {len(ROSTER)}명과 토큰으로 이어 붙인다')
    wb = Workbook()

    # ── 1) 응답 ─────────────────────────────────────────────
    keys: list[str] = []
    for r in rows:
        for k in (r.get('answers') or {}):
            if k not in keys:
                keys.append(k)
    ws = wb.active
    ws.title = '응답'
    head(ws,
         ['수신자 토큰', '명단의 이름', '명단의 소속', '응답ID', '접수시각', '소요(분)',
          '언어', '지목 구획', '인용 범위', '표준시간대', '화면', '링크 경유'] + keys,
         [13, 24, 30, 26, 18, 9, 6, 8, 16, 22, 9, 9] + [30] * len(keys))
    for r in rows:
        a = r.get('answers') or {}
        env = r.get('env') or {}
        tok = r.get('recipient') or ''
        who = ROSTER.get(tok, ('', ''))
        ws.append([
            tok, who[0], who[1], r.get('id', ''), r.get('receivedAt', ''), minutes(r),
            r.get('lang', ''), r.get('pinnedSection') or '', r.get('citeScope') or '',
            env.get('tz') or '', env.get('screen') or '', 'Y' if env.get('fromLink') else 'N',
        ] + [a.get(k, '') for k in keys])
        for c in ws[ws.max_row]:
            c.alignment, c.border = TOP, BOX
    ws.auto_filter.ref = f'A1:{get_column_letter(12 + len(keys))}{ws.max_row}'

    # ── 2) 픽토그램 — 판정을 여기서 채운다 ──────────────────
    wp = wb.create_sheet('픽토그램')
    head(wp,
         ['응답ID', '형태소', '의도한 뜻', '응답자가 적은 것', '모르겠다', '확신도(1-5)', '판정', '응답시간(ms)'],
         [26, 20, 26, 46, 9, 11, 14, 12])
    n_glyph = 0
    for r in rows:
        for g in (r.get('glyphTest') or []):
            wp.append([
                r.get('id', ''), g.get('name', ''), INTENDED.get(g.get('name', ''), '(미확인)'),
                g.get('guess', ''), 'Y' if g.get('dontKnow') else '',
                g.get('confidence', ''), '', g.get('ms', ''),
            ])
            for c in wp[wp.max_row]:
                c.alignment, c.border = TOP, BOX
            n_glyph += 1
    if n_glyph:
        dv = DataValidation(type='list', formula1='"' + ','.join(VERDICTS) + '"', allow_blank=True)
        dv.error = '통과 · 부분 · 실패 · 치명적 혼동 중에서 고를 것'
        wp.add_data_validation(dv)
        dv.add(f'G2:G{wp.max_row}')
        wp.auto_filter.ref = f'A1:H{wp.max_row}'
    print(f'픽토그램 응답 {n_glyph}건')

    # ── 3) 집계 — 판정을 채우면 기준 판정이 따라온다 ────────
    wa = wb.create_sheet('집계')
    head(wa,
         ['형태소', '의도한 뜻', '채점된 수', '통과', '부분', '실패', '치명적 혼동',
          '정답률', '치명적 혼동률', 'ISO 67%', 'ANSI 85%+치명5%', '모르겠다', '평균 확신도', '평균 응답시간(ms)'],
         [20, 26, 10, 8, 8, 8, 12, 10, 13, 10, 17, 11, 12, 16])
    seen = [g for g in INTENDED if any(
        x.get('name') == g for r in rows for x in (r.get('glyphTest') or []))]
    for g in (seen or list(INTENDED)):
        row = wa.max_row + 1
        B = f"픽토그램!$B$2:$B${max(wp.max_row, 2)}"
        G = f"픽토그램!$G$2:$G${max(wp.max_row, 2)}"
        E = f"픽토그램!$E$2:$E${max(wp.max_row, 2)}"
        F = f"픽토그램!$F$2:$F${max(wp.max_row, 2)}"
        M = f"픽토그램!$H$2:$H${max(wp.max_row, 2)}"
        wa.append([
            g, INTENDED[g],
            f'=COUNTIFS({B},$A{row},{G},"<>")',
            f'=COUNTIFS({B},$A{row},{G},"통과")',
            f'=COUNTIFS({B},$A{row},{G},"부분")',
            f'=COUNTIFS({B},$A{row},{G},"실패")',
            f'=COUNTIFS({B},$A{row},{G},"치명적 혼동")',
            f'=IF($C{row}=0,"",$D{row}/$C{row})',
            f'=IF($C{row}=0,"",$G{row}/$C{row})',
            f'=IF($C{row}=0,"",IF($H{row}>=0.67,"통과","미달"))',
            f'=IF($C{row}=0,"",IF(AND($H{row}>=0.85,$I{row}<=0.05),"통과","미달"))',
            f'=COUNTIFS({B},$A{row},{E},"Y")',
            f'=IFERROR(AVERAGEIFS({F},{B},$A{row}),"")',
            f'=IFERROR(AVERAGEIFS({M},{B},$A{row}),"")',
        ])
        for c in wa[row]:
            c.alignment, c.border = TOP, BOX
        wa.cell(row, 8).number_format = '0.0%'
        wa.cell(row, 9).number_format = '0.0%'
        wa.cell(row, 13).number_format = '0.0'
        wa.cell(row, 14).number_format = '#,##0'
        wa.cell(row, 10).fill = OK_FILL
        wa.cell(row, 11).fill = WARN_FILL

    note = wa.max_row + 2
    wa.cell(note, 1, '판정 칸을 채우면 정답률과 기준 판정이 자동으로 계산된다.').font = Font(bold=True)
    wa.cell(note + 1, 1,
            'ISO 9186-1 은 최소 67% 이해를 요구한다. ANSI Z535.3 은 85% 정답률과 '
            '치명적 혼동 5% 이하를 함께 요구하므로, 정답률만으로 통과를 말할 수 없다.')
    wa.cell(note + 2, 1,
            '치명적 혼동은 의도와 반대되거나 위험한 뜻으로 읽힌 경우다. 이것을 따로 세는 것이 요점이다.')
    wa.cell(note + 3, 1,
            '자기 판정을 응답자에게 맡기지 않았다. 자기 판정은 관대해지므로 원문을 저장해 두고 우리가 분류한다.')

    # ── 4) 자유응답 ─────────────────────────────────────────
    LONG = ['a2_harm', 'a4_onefix', 'a5_notrecommend', 'a6_evidence']
    wf = wb.create_sheet('자유응답')
    head(wf, ['문항', '응답ID', '분야', '노출 빈도', '내용'], [18, 26, 22, 16, 100])
    for k in LONG + [k for k in keys if k not in LONG and k.startswith('q')]:
        for r in rows:
            v = (r.get('answers') or {}).get(k, '').strip()
            if not v:
                continue
            a = r.get('answers') or {}
            wf.append([k, r.get('id', ''), a.get('b_field', ''), a.get('b_exposure', ''), v])
            for c in wf[wf.max_row]:
                c.alignment, c.border = TOP, BOX
    if wf.max_row > 1:
        wf.auto_filter.ref = f'A1:E{wf.max_row}'

    # ── 5) 단답 분포 ────────────────────────────────────────
    wd = wb.create_sheet('선택지 분포')
    head(wd, ['문항', '선택지', '응답 수', '비율'], [22, 52, 10, 10])
    for k in keys:
        vals = [(r.get('answers') or {}).get(k, '').strip() for r in rows]
        vals = [v for v in vals if v]
        if not vals or max(len(v) for v in vals) > 60:      # 자유 서술은 건너뛴다
            continue
        tot = len(vals)
        for v, c in Counter(vals).most_common():
            wd.append([k, v, c, c / tot])
            wd.cell(wd.max_row, 4).number_format = '0.0%'
            for cell in wd[wd.max_row]:
                cell.alignment, cell.border = TOP, BOX

    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    print(f'저장: {out}')
    for s in wb.sheetnames:
        print(f'  {s}: {wb[s].max_row - 1} 행')


if __name__ == '__main__':
    main()

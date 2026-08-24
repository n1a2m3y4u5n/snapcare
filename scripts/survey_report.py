#!/usr/bin/env python3
"""전문가 설문 응답을 엑셀로 뽑는다.

    python3 scripts/survey_report.py [응답폴더] [출력.xlsx]

응답폴더 기본값은 $SNAPCARE_DATA_DIR/survey 이고, 없으면 ./.data/survey 다.
운영 서버에서는 fly 볼륨의 /data/survey 이므로 먼저 내려받아야 한다.

    fly ssh sftp get /data/survey ./survey-dump
    python3 scripts/survey_report.py ./survey-dump

openpyxl 이 필요하다.  python3 -m pip install --user openpyxl

────────────────────────────────────────────────────────────────────────
## 시트

  응답          한 사람 한 줄. 수신자 토큰으로 명단의 이름·소속을 이어 붙인다
  직군별 집계     제안서에 그대로 들어갈 숫자. 분모가 직군별로 나뉜다
  판단 문항       데모를 보고 답한 문항. 분모는 그 문항을 받은 다섯 직군뿐이다
  자유응답        서술형과 "왜 그렇습니까" 칸을 문항별로 모은 것
  선택지 분포     선택형 전체의 단순 분포

## 왜 분모를 직군별로 나누는가

"전체 43명 중 20명" 은 여덟 직군이 섞인 숫자다. 약사와 법학 교수와 표준 담당자를 한
분모에 넣으면 그 비율은 무엇에 대한 비율도 아니다. "약사 18명 중 11명" 이라야 근거가
된다. 그래서 직군별 집계 시트가 이 파일의 중심이다.

판단 문항은 특히 조심해야 한다. 데모를 보고 답하는 두 문항은 다섯 직군에만 붙어 있다.
법·표준·산업 응답자는 그 문항을 아예 받지 않았으므로 분모에 들어가면 안 된다.

## 이해도 시험 시트를 없앤 이유

전에는 픽토그램 이해도 시험의 채점 시트와 ISO 67% / ANSI 85% 판정 수식이 있었다. 그
시험을 설문에서 뺐으므로 지운다 — 전문가에게 그림 뜻을 맞히게 하는 것은 저문해 환자를
대상으로 한 시험이 아니고, 그 숫자를 기준 통과로 적으면 사실과 다른 말이 된다.

사람을 대상으로 한 이해도 시험은 여전히 남은 일이다. 이 조사는 그것을 대신하지 않는다.
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
except ImportError:
    sys.exit('openpyxl 이 없다:  python3 -m pip install --user openpyxl')

ROOT = pathlib.Path(__file__).resolve().parent.parent
ITEMS_TS = ROOT / 'lib' / 'survey' / 'items.ts'
ROSTER: dict[str, tuple[str, str]] = {}

HDR = Font(bold=True, color='FFFFFF', size=11)
HDR_FILL = PatternFill('solid', fgColor='2F5597')
WARN_FILL = PatternFill('solid', fgColor='FCE4D6')
OK_FILL = PatternFill('solid', fgColor='C6E0B4')
THIN = Side(style='thin', color='BFBFBF')
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
TOP = Alignment(vertical='top', wrap_text=True)


def survey_shape() -> dict:
    """문항 정의를 items.ts 에서 읽는다.

    선택지 문구를 이 파일에 다시 적지 않는다. 두 곳에 적으면 어긋나고, 어긋난 채로
    세면 "응답 없음" 으로 빠지는 선택지가 생긴다 — 그런 누락은 표를 봐도 보이지 않는다.

    응답 JSON 에는 **영어 선택지 문구가 그대로** 저장되어 있다 (radio 의 값이 o.en 이다).
    그래서 셀 때는 영어로 맞추고, 사람이 읽는 표에는 한국어를 쓴다. 둘의 짝은 여기서만
    만든다.

    node 로 TS 모듈을 직접 불러 JSON 으로 받는다. 정규식으로 긁으면 문항이 늘거나 줄 때
    조용히 틀린다.
    """
    import subprocess
    script = f"""
      import('file://{ITEMS_TS}').then((m) => {{
        const opt = (i) => (i.options || []).map((o) => ({{ en: o.en, ko: o.ko }}));
        console.log(JSON.stringify({{
          fields: m.FIELDS.map((f) => ({{ id: f.id, en: f.label.en, ko: f.label.ko }})),
          judge: m.DEMO_JUDGE.map((i) => i.id),
          branches: m.BRANCHES.map((b) => ({{
            id: b.id, ko: b.title.ko,
            items: b.items.map((i) => ({{ id: i.id, ko: i.q.ko, kind: i.kind, options: opt(i) }})),
          }})),
          background: m.BACKGROUND.map((i) => ({{ id: i.id, ko: i.q.ko, kind: i.kind, options: opt(i) }})),
          close: m.CLOSE.map((i) => ({{ id: i.id, ko: i.q.ko, kind: i.kind, options: opt(i) }})),
        }}));
      }});
    """
    r = subprocess.run(['node', '--experimental-strip-types', '-e', script],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f'items.ts 를 읽지 못했다:\n{r.stderr[-800:]}')
    return json.loads(r.stdout)


def load(dirpath: pathlib.Path) -> list[dict]:
    """폴더 하나. 쉼표로 이어 붙인 여러 폴더는 load_all 이 받는다."""
    out = []
    for f in sorted(dirpath.glob('*.json')):
        try:
            out.append(json.loads(f.read_text(encoding='utf-8')))
        except Exception as e:                       # noqa: BLE001
            print(f'  건너뜀 {f.name}: {e}', file=sys.stderr)
    return out


def load_all(spec: str) -> list[dict]:
    """웹 응답 폴더와 메일 응답 폴더를 함께 읽는다.

    설문지 링크가 막히는 기관이 있어서 문항을 본문에 실어 보낸 경우가 있다. 그 답은
    서버를 거치지 않으므로 손으로 옮겨 적어 따로 둔다. 두 경로를 한 표에 합치되
    **어느 경로로 왔는지는 `경로` 열에 남긴다.** 합쳐 놓고 구분이 사라지면 나중에
    "설문 응답"과 "메일 회신"을 같은 것으로 세게 된다.
    """
    rows: list[dict] = []
    for part in str(spec).split(','):
        part = part.strip()
        if not part:
            continue
        d = pathlib.Path(part)
        if not d.is_dir():
            sys.exit(f'응답 폴더가 없다: {d}')
        got = load(d)
        print(f'  {d} 에서 {len(got)}건')
        rows += got
    rows.sort(key=lambda r: str(r.get('receivedAt') or ''))
    return rows


def route(r) -> str:
    return {'recorded': '웹', 'email': '메일'}.get(str(r.get('source') or ''), r.get('source') or '')


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

    rows = load_all(str(src))
    if not rows:
        sys.exit(f'{src} 에 응답이 없다')
    print(f'응답 {len(rows)}건 읽음')

    SHAPE = survey_shape()
    print(f"문항 정의: 직군 {len(SHAPE['branches'])}개, 판단 문항 {len(SHAPE['judge'])}개")
    global ROSTER
    ROSTER = roster()

    # 웹으로도 답하고 메일로도 내용을 준 사람이 있다. 사람 수를 두 번 세지 않으려고
    # 행을 늘리지 않고, 그 사람의 행에 열 하나로 붙인다. 붙이지 않으면 그 내용이
    # 메일 회신 시트 안에만 남아 자유응답과 집계에서 빠진다.
    SUPP: dict[str, str] = {}
    _log = ROOT / 'scratchpad' / 'contacts' / 'email-log.json'
    if _log.exists():
        for it in json.loads(_log.read_text(encoding='utf-8')):
            if '보완' in str(it.get('분류') or '') and it.get('토큰'):
                SUPP[it['토큰']] = it.get('원문', '')
        if SUPP:
            print(f'메일 보완 {len(SUPP)}건을 같은 행에 붙인다')
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
         ['경로', '수신자 토큰', '명단의 이름', '명단의 소속', '응답ID', '접수시각', '소요(분)',
          '언어', '지목 구획', '인용 범위', '표준시간대', '화면', '링크 경유', '메일 보완'] + keys,
         [7, 13, 24, 30, 26, 18, 9, 6, 8, 16, 22, 9, 9, 90] + [30] * len(keys))
    for r in rows:
        a = r.get('answers') or {}
        env = r.get('env') or {}
        tok = r.get('recipient') or ''
        who = ROSTER.get(tok, ('', ''))
        ws.append([
            route(r), tok, who[0], who[1], r.get('id', ''), r.get('receivedAt', ''), minutes(r),
            r.get('lang', ''), r.get('pinnedSection') or '', r.get('citeScope') or '',
            env.get('tz') or '', env.get('screen') or '', 'Y' if env.get('fromLink') else 'N',
            SUPP.get(tok, ''),
        ] + [a.get(k, '') for k in keys])
        for c in ws[ws.max_row]:
            c.alignment, c.border = TOP, BOX
    ws.auto_filter.ref = f'A1:{get_column_letter(14 + len(keys))}{ws.max_row}'

    # ── 2) 직군별 집계 ──────────────────────────────────────
    #
    # 이 시트가 제안서에 그대로 들어갈 숫자다. 요점은 **분모를 직군별로 나누는 것**이다.
    # "전체 43명 중 20명" 은 여덟 직군이 섞인 숫자여서 아무것도 말하지 않는다. "약사
    # 18명 중 11명" 이라야 근거가 된다.
    #
    # 응답 수가 0인 선택지도 줄로 남긴다. 아무도 고르지 않았다는 것 자체가 결과이고,
    # 빼 버리면 그 선택지가 있었다는 사실이 표에서 사라진다.
    field_of = {f['en']: f['id'] for f in SHAPE['fields']}
    field_ko = {f['id']: f['ko'] for f in SHAPE['fields']}
    by_branch: dict[str, list[dict]] = {}
    for r in rows:
        bid = field_of.get(((r.get('answers') or {}).get('b_field') or '').strip())
        if bid:
            by_branch.setdefault(bid, []).append(r)

    wb2 = wb.create_sheet('직군별 집계')
    head(wb2, ['직군', '그 직군 응답자', '문항', '선택지', '응답 수', '그 직군 안의 비율'],
         [22, 13, 52, 46, 9, 15])
    for br in SHAPE['branches']:
        mine = by_branch.get(br['id'], [])
        for it in br['items']:
            if not it['options']:
                continue                              # 서술형은 자유응답 시트에서 본다
            vals = [((r.get('answers') or {}).get(it['id']) or '').strip() for r in mine]
            answered = [v for v in vals if v]
            cnt = Counter(answered)
            for o in it['options']:
                n = cnt.get(o['en'], 0)
                wb2.append([br['ko'], len(mine), it['ko'], o['ko'], n,
                            (n / len(answered)) if answered else ''])
                wb2.cell(wb2.max_row, 6).number_format = '0.0%'
                for c in wb2[wb2.max_row]:
                    c.alignment, c.border = TOP, BOX
            # 선택지에 없는 답이 들어왔다면 그것도 보여준다 (문항을 고친 뒤 옛 응답 등)
            for v, n in cnt.items():
                if v not in {o['en'] for o in it['options']}:
                    wb2.append([br['ko'], len(mine), it['ko'], f'(선택지에 없음) {v}', n,
                                n / len(answered)])
                    wb2.cell(wb2.max_row, 6).number_format = '0.0%'
                    for c in wb2[wb2.max_row]:
                        c.alignment, c.border, c.fill = TOP, BOX, WARN_FILL
    if wb2.max_row > 1:
        wb2.auto_filter.ref = f'A1:F{wb2.max_row}'

    # ── 3) 판단 문항 ────────────────────────────────────────
    #
    # 데모를 보고 답하는 문항은 다섯 직군에만 붙어 있다 — 약국·간호·AAC·문해·HCI.
    # 법·표준·산업 응답자는 이 문항을 받지 않았으므로 **분모에 들어가면 안 된다.**
    # 전체 응답자로 나누면 받지도 않은 사람이 분모를 부풀려 비율이 낮게 나온다.
    judge_ids = set(SHAPE['judge'])
    judge_branches = [b for b in SHAPE['branches']
                      if any(i['id'] in judge_ids for i in b['items'])]
    judge_pool = [r for b in judge_branches for r in by_branch.get(b['id'], [])]

    wj = wb.create_sheet('판단 문항')
    head(wj, ['문항', '선택지', '판단 자격 직군 전체', '비율'] + [b['ko'] for b in judge_branches],
         [52, 44, 17, 9] + [15] * len(judge_branches))
    for b in judge_branches[:1]:
        for it in b['items']:
            if it['id'] not in judge_ids or not it['options']:
                continue
            answered = [v for v in (((r.get('answers') or {}).get(it['id']) or '').strip()
                                    for r in judge_pool) if v]
            cnt = Counter(answered)
            per = {jb['id']: Counter(
                v for v in (((r.get('answers') or {}).get(it['id']) or '').strip()
                            for r in by_branch.get(jb['id'], [])) if v)
                for jb in judge_branches}
            for o in it['options']:
                n = cnt.get(o['en'], 0)
                wj.append([it['ko'], o['ko'], n, (n / len(answered)) if answered else '']
                          + [per[jb['id']].get(o['en'], 0) for jb in judge_branches])
                wj.cell(wj.max_row, 4).number_format = '0.0%'
                for c in wj[wj.max_row]:
                    c.alignment, c.border = TOP, BOX

    note = wj.max_row + 2
    wj.cell(note, 1, f'분모는 판단 자격이 있는 다섯 직군의 응답자 {len(judge_pool)}명이다.').font = Font(bold=True)
    wj.cell(note + 1, 1,
            '법·표준·산업 응답자는 이 문항을 받지 않았으므로 분모에서 뺐다. 환자의 이해를 '
            '판정할 자격이 있는 직군에만 물은 문항이므로, 전체 응답자로 나누면 그 숫자는 '
            '무엇에 대한 비율도 아니게 된다.')
    wj.cell(note + 2, 1,
            '사람을 대상으로 한 픽토그램 이해도 시험은 이 조사로 대체되지 않는다. 전문가가 '
            '"환자가 읽을 수 있을 것 같다" 고 답한 것은 환자가 실제로 읽었다는 뜻이 아니다. '
            'ISO 9186 의 67% 나 ANSI Z535.3 의 85% 는 여전히 사람을 대상으로 확인해야 한다.')

    # ── 4) 자유응답 ─────────────────────────────────────────
    # 서술형 문항과, 선택형에 딸린 "왜 그렇습니까" 칸을 모은다. 목록을 손으로 적어 두면
    # 문항이 바뀔 때마다 조용히 빠진다 — 실제로 없어진 문항 네 개가 적혀 있었다.
    ITEM_KO = {i['id']: i['ko'] for grp in
               ([SHAPE['background'], SHAPE['close']] + [b['items'] for b in SHAPE['branches']])
               for i in grp}
    LONG = [i['id'] for grp in ([SHAPE['background'], SHAPE['close']]
                                + [b['items'] for b in SHAPE['branches']])
            for i in grp if i['kind'] == 'longtext']
    LONG = list(dict.fromkeys(LONG)) + [k for k in keys if k.endswith('__why')]
    wf = wb.create_sheet('자유응답')
    head(wf, ['문항', '문항 내용', '응답ID', '분야', '노출 빈도', '내용'], [18, 46, 26, 22, 16, 90])
    for k in LONG:
        for r in rows:
            v = (r.get('answers') or {}).get(k, '').strip()
            if not v:
                continue
            a = r.get('answers') or {}
            base = k[:-6] if k.endswith('__why') else k
            label = ITEM_KO.get(base, '')
            wf.append([k, label + (' → 이유' if k.endswith('__why') else ''),
                       r.get('id', ''), a.get('b_field', ''), a.get('b_exposure', ''), v])
            for c in wf[wf.max_row]:
                c.alignment, c.border = TOP, BOX
    if wf.max_row > 1:
        wf.auto_filter.ref = f'A1:F{wf.max_row}'

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
    # ── 6) 메일 회신 ────────────────────────────────────────
    #
    # 설문 링크를 열지 못했거나, 열었어도 메일로 답한 사람이 있다. 거절도 남긴다.
    # 왜 답하지 않았는지가 응답률을 읽는 유일한 단서이기 때문이다.
    #
    # 요지만 적어 두면 나중에 인용할 때 원문을 다시 찾아야 하고, 그 사이에 요약이
    # 원문을 대신하게 된다. 그래서 **본문을 그대로 싣는다.** 우리가 보낸 원문과
    # 법적 고지 문구는 뺐고, 서명은 직함·소속이 드러나므로 남겼다.
    log = ROOT / 'scratchpad' / 'contacts' / 'email-log.json'
    if log.exists():
        items = json.loads(log.read_text(encoding='utf-8'))
        ws = wb.create_sheet('메일 회신')
        cols = ['받은날짜', '보낸사람', '소속', '토큰', '분류', '요지', '원문']
        head(ws, cols, [12, 24, 34, 13, 14, 46, 110])
        for it in items:
            ws.append([it.get(c, '') for c in cols])
            for c in ws[ws.max_row]:
                c.alignment, c.border = TOP, BOX
        ws.auto_filter.ref = ws.dimensions

    wb.save(out)
    print(f'저장: {out}')
    for s in wb.sheetnames:
        print(f'  {s}: {wb[s].max_row - 1} 행')


if __name__ == '__main__':
    main()

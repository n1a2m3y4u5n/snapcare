"""두 판을 한꺼번에 검사한다.

    .venv-doc/bin/python docs/proposal/tools/check_docs.py

여기 있는 검사는 모두 실제로 한 번씩 샌 것들이다. 손으로 확인하면
다음 회전에 다시 새므로 검사로 잠근다.

  · 표·그림 번호가 1부터 연속인가          (번호를 밀다 빈자리를 남긴 적이 있다)
  · 두 판의 표·그림·절 수가 같은가          (영어판이 표 11개 뒤처져 있었다)
  · 본문 참조가 실재하는 것을 가리키는가    (Figure 10 이 다른 그림을 가리켰다)
  · 두 판의 본문 참조 집합이 같은가         (한쪽만 고치면 여기서 걸린다)
  · 그림 파일이 실제로 있는가
  · § 참조가 실재하는 절인가
  · 요약란이 서식의 2~3문장 제한을 지키는가
  · 서식으로 뽑았을 때 마크다운이 새지 않는가
  · 기계가 쓴 티가 나는 상투구가 남아 있지 않은가
  · 두 판에서 그림이 같은 자리에 있는가
  · 두 판이 절마다 비슷한 수의 상호 참조를 갖는가
  · 인용이 이름과 해만 적혀 있지 않은가
  · 서식으로 뽑은 뒤 표와 그림이 성한가
  · 화면 캡처가 지금 앱보다 낡지 않았는가
  · 소제목에 번호가 붙어 있는가
  · 도판에서 글자가 상자를 넘거나 겹치지 않는가
  · 본문 인용이 부록 원문과 글자까지 같은가
"""
import re
import sys
import sys
from pathlib import Path

DOC = Path(__file__).resolve().parent.parent
PAIR = (('proposal_ko.md', '표', '그림'), ('proposal_en.md', 'Table', 'Figure'))

fail = []


def note(msg: str) -> None:
    fail.append(msg)
    print(f'  !! {msg}')

# 응답자를 인용할 때 이름만 적고 직책을 빠뜨린 자리를 찾는다. 어느 자리에서
# 한 말인지가 빠지면 그 말의 무게를 읽을 수 없다.
QUOTED = ('Foued Maaoui', 'Atif Usman', 'Sheron Sir Loon Goh', 'Katarina Vučićević',
          'E. A. Draffan', 'Niken Nur Widyakusuma', 'Samirah Abdu-Aguye', 'Celia',
          'Aliya Naheed', 'Raisa Kravchenko', 'Rahul Malhotra', 'Maria Stefanova',
          '이교구', '이경화', '서희정', '이영미', '박경서', '박남수', '김은경',
          '이용한', '최묘정', '박철현', '윤휘열', '이소영', '하동문', '조성일',
          '유명순', '송민선')
TITLE_WORDS = {
    'proposal_ko.md': ('교수', '약사', '연구원', '선임', '대리', '팀장', '전임강사',
                       '부대표', '수석연구원', '조교수', '부교수', '치료사', '강사'),
    'proposal_en.md': ('Professor', 'professor', 'Researcher', 'researcher', 'Lecturer',
                       'Director', 'Scientist', 'Manager', 'Leader', 'therapist',
                       'pharmacist', 'PhD'),
}


def unattributed(f: str) -> list:
    s = (DOC / f).read_text()
    body = s[:s.index('### 5.11')]        # 부록은 표에 직책 열이 따로 있다
    out = []
    for ln in body.splitlines():
        if ln.startswith('|'):
            continue
        for n in QUOTED:
            for m in re.finditer(re.escape(n), ln):
                seg = ln[max(0, m.start() - 45):m.end() + 60]
                if not any(t in seg for t in TITLE_WORDS[f]):
                    out.append(f'{n}: …{seg.strip()[:70]}…')
    return out

# 기계가 쓴 티가 나는 상투구. 산문에서만 찾는다. 표·인용·코드·부록은 뺀다.
# 부록은 응답 원문이고, 인용문은 그 사람이 한 말이라 우리가 고칠 것이 아니다.
SLOP = {
    'proposal_ko.md': ((r'되어지', '이중피동'), (r'~?함에 있어', '번역투'),
                       (r'~?로 사료된다', '문어투'), (r'~?에 다름 아니다', '번역투'),
                       (r'~?라 할 수 있을 것이다', '과한 헤지')),
    'proposal_en.md': ((r'\b(crucial|pivotal|delve|showcase|testament|vibrant|tapestry'
                        r'|underscore|foster|intricate|interplay|seamless|holistic)\b',
                        'AI 어휘'),
                       (r'\bin order to\b', '군더더기'),
                       (r'\bIt is important to note\b|\bIt should be noted\b', '군더더기'),
                       (r'\b(serves|stands) as\b', 'copula 회피'),
                       (r'\bnot only\b.{0,40}\bbut\b', '부정 병렬'),
                       (r'\bthe real question\b|\bat its core\b', '권위 상투구'),
                       (r', (highlighting|underscoring|emphasizing|showcasing|fostering) ',
                        '-ing 꼬리')),
}


def slop(f: str) -> list:
    s = (DOC / f).read_text()
    s = s[:s.index('### 5.11')]
    inb, keep = False, []
    for ln in s.splitlines():
        if ln.startswith('```'):
            inb = not inb
            continue
        if inb or ln.startswith(('|', '[표', '[Table', '![', '> ', '**[', '#')):
            continue
        keep.append(ln)
    body = '\n'.join(keep)
    out = []
    for pat, tag in SLOP[f]:
        for m in re.finditer(pat, body):
            seg = body[max(0, m.start() - 40):m.end() + 40].replace('\n', ' ')
            out.append(f'{tag}: …{seg.strip()[:78]}…')
    return out


def orphan_figs(f: str, fw: str) -> set:
    """절이 그림으로 끝나는 자리를 모은다.

    그것 자체는 잘못이 아니다. 두 판에서 다르면 잘못이다. 한쪽에서만
    그림이 절 끝으로 밀려 있으면 넣을 때 앵커를 다르게 잡은 것이고,
    실제로 영어판 그림 19·20 이 그랬다."""
    s = (DOC / f).read_text()
    s = s[:s.index('### 5.11')]
    lines = s.splitlines()
    out = set()
    for i, ln in enumerate(lines):
        m = re.match(rf'^\*\*\[{fw} (\d+)\]', ln)
        if not m:
            continue
        j, tail = i + 1, 0
        while j < len(lines) and not lines[j].startswith(('### ', '## ')):
            t = lines[j].strip()
            if t and not t.startswith(('|', '[표', '[Table', '![', '**[', '```', '#')):
                tail += 1
            j += 1
        if tail == 0:
            out.add(int(m.group(1)))
    return out


def short_cites(f: str) -> list:
    """서지 정보 없이 이름과 해만 적은 인용을 찾는다.

    (UNESCO, 2025) 처럼 적으면 읽는 사람이 앞으로 되돌아가야 무엇인지
    안다. 제목이나 학술지가 함께 있으면 되돌아갈 일이 없다. 여기서는
    괄호 안에 이탤릭 제목도 따옴표 제목도 없는 것을 걸러 낸다."""
    s = (DOC / f).read_text()
    s = s[:s.index('### 5.11')]
    out = []
    for m in re.finditer(r'\(([^()]{6,58})\)', s):
        t = m.group(1)
        if not re.search(r'(19|20)\d\d', t):
            continue
        if '*' in t or '"' in t:
            continue
        # 연도만 있는 괄호와 조사 시점 표기는 인용이 아니다
        if re.fullmatch(r'[\d\-~. ]+(기준|census round)?', t.strip()):
            continue
        if re.fullmatch(r'(as of |조사 기간 )?[\d\-~ ]+(기준)?', t.strip()):
            continue
        # "as of 29 July 2026" 같은 시점 표기. 인용이 아니라 날짜다.
        if re.fullmatch(r'as of \d+ \w+ \d{4}|\d{4}-\d\d-\d\d 기준', t.strip()):
            continue
        out.append(t)
    return out


# 같은 수치가 두 곳에 다르게 적히는 일을 막는다. 실제로 5.7 이 345,
# 표 28 이 347 로 갈렸던 적이 있다.
PAIRED = (
    (r'웹 앱 \(`node --test`\) \| (\d+)', r'시험은 231개에서 (\d+)개가'),
    (r'Web app \(`node --test`\) \| (\d+)', r'went from 231 to (\d+)'),
)


def paired(f: str) -> list:
    s = (DOC / f).read_text()
    out = []
    for a, b in PAIRED:
        ma, mb = re.search(a, s), re.search(b, s)
        if ma and mb and ma.group(1) != mb.group(1):
            out.append(f'웹 앱 시험 수 {ma.group(1)} 대 {mb.group(1)}')
    return out


def sec_refs(f: str) -> dict:
    """절마다 다른 절을 몇 번 가리키는지 센다.

    두 판에서 이 수가 다르면 한쪽에만 넣은 것이다. 실제로 조사를 본문에
    엮을 때 한글판에만 들어간 자리가 두 곳 있었다."""
    s = (DOC / f).read_text()
    s = s[:s.index('### 5.11')]
    cur, out = None, {}
    for ln in s.splitlines():
        m = re.match(r'^### (\d+\.\d+)', ln)
        if m:
            cur = m.group(1)
        if cur:
            out[cur] = out.get(cur, 0) + len(re.findall(r'§\d+\.\d+', ln))
    return out


def built(path: Path) -> tuple:
    """만들어진 서식에서 문단·표·그림을 꺼낸다. 중첩 표 안까지 들어간다."""
    import docx
    d = docx.Document(str(path))
    ps, tabs = [], []

    def walk(c):
        for para in c.paragraphs:
            ps.append(para.text)
        for t in getattr(c, 'tables', []):
            tabs.append(t)
            for r in t.rows:
                for cc in r.cells:
                    walk(cc)

    walk(d)
    for t in d.tables:
        tabs.append(t)
        for r in t.rows:
            for cc in r.cells:
                walk(cc)
    return ps, tabs, d.inline_shapes


def built_faults(path: Path) -> list:
    """서식으로 뽑고 나서야 보이는 것들. 원본 마크다운으로는 알 수 없다."""
    ps, tabs, shapes = built(path)
    out = []
    txt = '\n'.join(ps)

    if '\ufffd' in txt:
        out.append(f'깨진 글자 {txt.count(chr(0xfffd))}개')

    for t in tabs:
        if len(t.rows) < 2:
            continue
        if len({len(r.cells) for r in t.rows}) > 1:
            head = ' | '.join(c.text[:12] for c in t.rows[0].cells)
            out.append(f'표의 행마다 열 수가 다르다 — {head}')
        for r in t.rows:
            if all(not c.text.strip() for c in r.cells):
                out.append(f'표에 빈 행 — {t.rows[0].cells[0].text[:20]}')
                break

    for i, sh in enumerate(shapes, 1):
        h = sh.height / 914400
        if h > 5.4:
            out.append(f'{i}번째 그림이 {h:.1f}인치로 높다')
    return out


# 화면 캡처는 앱이 바뀌면 낡는다. 낡아도 아무 표시가 나지 않는 것이 문제라,
# 마지막으로 뜬 날과 화면 코드가 마지막으로 바뀐 날을 견준다. 실제로 캡처가
# 7월 29일이고 화면 코드가 8월 3일이던 적이 있고, 그 캡처는 본문이 걷어냈다고
# 적은 스피커 원과 본문이 고쳤다고 적은 냉장 오류를 그대로 담고 있었다.
SHOT_FILES = ('fig01_home.png', 'fig04_camera.png', 'fig05_processing.png',
              'fig06_verdict_rx.png', 'fig07_verdict_label.png', 'fig08_today.png',
              'fig09_device.png', 'fig12_onboarding.png', 'fig13_profile.png')
UI_PATHS = ('app', 'components')


def _last_commit(path: str) -> str:
    import subprocess
    try:
        return subprocess.run(
            ['git', 'log', '-1', '--format=%ct', '--', path],
            cwd=DOC.parents[1], capture_output=True, text=True, timeout=20,
        ).stdout.strip()
    except Exception:
        return ''


def stale_shots() -> list:
    """캡처가 화면 코드보다 낡았는지 본다.

    파일별 커밋 시각으로만 견주면 오탐이 난다. 화면이 바뀌어도 그 화면을
    담지 않은 캡처는 픽셀이 같아 커밋에 담기지 않고, 그러면 옛 시각인
    채로 남는다. 그래서 **가장 최근에 다시 뜬 캡처** 를 기준으로 본다.
    한 장이라도 화면 코드보다 뒤라면 그때 전부 다시 떴다는 뜻이다."""
    ui = max((int(t) for t in (_last_commit(p) for p in UI_PATHS) if t), default=0)
    if not ui:
        return []
    times = [(f, _last_commit(f'docs/proposal/fig/{f}')) for f in SHOT_FILES]
    newest = max((int(t) for _, t in times if t), default=0)
    if newest >= ui:
        return []
    out = [f for f, t in times if t and int(t) < ui]
    if out:
        import datetime as dt
        d = dt.datetime.fromtimestamp(ui).date()
        return [f'화면 코드가 {d} 에 바뀐 뒤 다시 뜨지 않은 캡처 {len(out)}장: '
                + ', '.join(out[:4]) + (' …' if len(out) > 4 else '')]
    return []


def unnumbered_subs(f: str) -> list:
    """번호 없는 소제목을 찾는다.

    본문 소제목이 스물여덟 개인데 번호가 없으면 목차에서 어느 절에 딸린
    것인지 보이지 않고, 서로 참조할 방법도 없다."""
    s = (DOC / f).read_text()
    s = s[:s.index('### 5.11')]
    return re.findall(r'^#### (?!\d+\.\d+\.\d+ )(.+)$', s, re.M)


def fig_faults() -> list:
    """check_figs.py 를 불러 도판의 글자 겹침을 함께 본다.

    따로 돌리게 두면 잊는다. 이 파일 하나만 돌리면 다 보이게 한다."""
    import subprocess
    r = subprocess.run(
        [sys.executable, str(DOC / 'tools' / 'check_figs.py')],
        capture_output=True, text=True, timeout=180,
    )
    if r.returncode == 0:
        return []
    return [ln.strip() for ln in r.stdout.splitlines()
            if ln.strip() and not ln.startswith('도판에서')]


def quote_drift(f: str = 'proposal_ko.md') -> list:
    """본문의 인용 블록이 부록의 원문과 글자 단위로 같은지 본다.

    두 판 모두 응답자의 말을 조용히 다듬고 있었다. 한글판은 오타를
    바로잡았고("팩토그램" → "픽토그램"), 영어판은 응답자의 영어를 다시
    썼다("the prescription read not to use the eyedrops in pregnancy" 를
    매끄러운 문장으로). 읽기는 나아지지만 인용이 아니게 된다.

    한글판에서는 우리말 인용만 본다. 영어 응답을 옮긴 자리는 원문과 다른
    것이 맞고, 출처에 "옮김" 이 적혀 있으면 넘어간다."""
    s = (DOC / f).read_text()
    body, app = s[:s.index('### 5.11')], s[s.index('### 5.11'):]
    flat = re.sub(r'\s+', ' ', app)
    out = []
    # 인용 줄과 바로 다음 출처 줄을 함께 본다. 출처에 "옮김" 이 적혀 있으면
    # 영어로 답한 것을 우리말로 옮긴 자리이므로 원문과 다른 것이 맞다.
    lines = body.splitlines()
    for i, ln in enumerate(lines):
        m = re.match(r'^> "([^"]{24,})"$', ln)
        if not m:
            continue
        q = m.group(1)
        if f.endswith('_ko.md') and not re.search(r'[가-힣]', q):
            continue
        src = lines[i + 1] if i + 1 < len(lines) else ''
        # 출처가 사람이 아닌 인용은 부록에 없는 것이 맞다. 화면 문구나
        # 코드 주석을 옮긴 자리이며, 출처 줄이 그것을 밝힌다.
        if '옮김' in src or 'Settings screen' in src or '설정 화면' in src:
            continue
        if re.sub(r'\s+', ' ', q)[:36] not in flat:
            out.append(q[:56])
    return out


def blocks(path: Path) -> dict:
    """소제목마다 그 아래 문단 수를 센다. 한 판에만 문단이 빠지면 여기서 걸린다."""
    cur, out = None, {}
    for ln in path.read_text().splitlines():
        m = re.match(r'^(#{2,4}) .+$', ln)
        if m:
            cur = len(out)
            out[cur] = 0
        elif cur is not None and ln.strip():
            out[cur] += 1
    return out


def main() -> int:
    seen = {}
    for f, tw, fw in PAIR:
        s = (DOC / f).read_text()
        T = [int(x) for x in re.findall(rf'^\[{tw} (\d+)\]', s, re.M)]
        F = [int(x) for x in re.findall(rf'^\*\*\[{fw} (\d+)\]\*\*', s, re.M)]
        secs = re.findall(r'^### (\d+\.\d+)', s, re.M)

        for name, ns in ((tw, T), (fw, F)):
            if ns != list(range(1, len(ns) + 1)):
                note(f'{f}: {name} 번호가 1~{len(ns)} 연속이 아니다')

        # 본문 속 참조. 캡션·그림 줄·표 행을 뺀 나머지에서 찾는다.
        # 표 행을 빼는 이유: "정적 그림 81종" 같은 칸이 그림 81 로 잡힌다.
        body = re.sub(rf'^\[{tw} \d+\].*$|^\*\*\[{fw} \d+\]\*\*.*$'
                      rf'|^!\[{fw} \d+\].*$|^\|.*$',
                      '', s, flags=re.M)
        tref = {int(m.group(1)) for m in re.finditer(rf'(?<!\[){tw} (\d+)', body)}
        fref = {int(m.group(1)) for m in re.finditer(rf'(?<!\[){fw} (\d+)', body)}
        for name, ref, have in ((tw, tref, set(T)), (fw, fref, set(F))):
            bad = sorted(x for x in ref - have if x <= max(have, default=0))
            if bad:
                note(f'{f}: 본문이 없는 {name} {bad} 을 가리킨다')

        miss = sorted(set(re.findall(r'§(\d+\.\d+)', s)) - set(secs),
                      key=lambda x: [int(v) for v in x.split('.')])
        if miss:
            note(f'{f}: 없는 절 {miss} 을 가리킨다')

        for m in re.findall(r'!\[.*?\]\((fig/[^)]+)\)', s):
            if not (DOC / m).exists():
                note(f'{f}: 그림 파일이 없다 — {m}')

        i = s.index('## □ Summary of Web App')
        seg = s[i:s.index('---', i)].split('\n', 1)[1].strip()
        n = len([x for x in re.split(r'(?<=[.다])\s+', seg) if x.strip()])
        if n > 3:
            note(f'{f}: 요약이 {n}문장이다. 서식은 2~3문장을 요구한다')

        seen[f] = (len(T), len(F), len(secs), tref, fref)
        print(f'  {f}: 표 {len(T)} · 그림 {len(F)} · 절 {len(secs)} · 요약 {n}문장')

    (a, b) = (seen['proposal_ko.md'], seen['proposal_en.md'])
    if a[:3] != b[:3]:
        note(f'두 판의 표·그림·절 수가 다르다 {a[:3]} 대 {b[:3]}')
    if a[3] != b[3]:
        note(f'두 판의 본문 표 참조가 다르다 {sorted(a[3] ^ b[3])}')
    if a[4] != b[4]:
        note(f'두 판의 본문 그림 참조가 다르다 {sorted(a[4] ^ b[4])}')

    for f, _, _ in PAIR:
        for x in slop(f):
            note(f'{f}: 상투구 — {x}')
        for x in unattributed(f):
            note(f'{f}: 직책 없이 인용했다 — {x}')

    for f, _, _ in PAIR:
        for t in paired(f):
            note(f'{f}: 같은 수치가 두 곳에 다르다 — {t}')
        for t in short_cites(f):
            note(f'{f}: 서지 정보 없는 인용 — ({t})')

    for f, _, _ in PAIR:
        for t in unnumbered_subs(f):
            note(f'{f}: 번호 없는 소제목 — {t[:40]}')

    for f in ('proposal_ko.md', 'proposal_en.md'):
        for t in quote_drift(f):
            note(f'{f}: 인용이 부록 원문과 다르다 — "{t}…"')

    for t in fig_faults():
        note(t)

    for t in stale_shots():
        note(t)

    for name in ('SnapCare_H1_Final_Proposal_KO.docx',
                 'SnapCare_H1_Final_Proposal_EN.docx'):
        for t in built_faults(DOC / name):
            note(f'{name}: {t}')

    ka, ea = sec_refs('proposal_ko.md'), sec_refs('proposal_en.md')
    gap = [(k, ka.get(k, 0), ea.get(k, 0)) for k in set(ka) | set(ea)
           if abs(ka.get(k, 0) - ea.get(k, 0)) > 1]
    if gap:
        note(f'절 참조 수가 두 판에서 다르다 {sorted(gap)}')

    ko_orph = orphan_figs('proposal_ko.md', '그림')
    en_orph = orphan_figs('proposal_en.md', 'Figure')
    if ko_orph != en_orph:
        note(f'두 판에서 그림 자리가 다르다 {sorted(ko_orph ^ en_orph)}')

    # 절마다 문단 수를 견준다. 영어판 §4.4 에서 세 문단이 통째로 빠진 적이 있다.
    kb, eb = blocks(DOC / 'proposal_ko.md'), blocks(DOC / 'proposal_en.md')
    if len(kb) != len(eb):
        note(f'두 판의 소제목 수가 다르다 {len(kb)} 대 {len(eb)}')
    else:
        # 영어는 표 칸이 길어져도 문단 수는 같아야 한다. 셋 넘게 벌어지면 본다.
        gap = [(i, kb[i], eb[i]) for i in kb if abs(kb[i] - eb[i]) > 3]
        if gap:
            note(f'문단 수가 크게 벌어진 절 {gap}')

    try:
        import docx
    except ImportError:
        print('  (python-docx 가 없어 서식 검사는 건너뛴다)')
    else:
        for f in ('SnapCare_H1_Final_Proposal_KO.docx',
                  'SnapCare_H1_Final_Proposal_EN.docx'):
            path = DOC / f
            if not path.exists():
                note(f'{f} 가 없다')
                continue
            d = docx.Document(path)
            txt = []

            def walk(c):
                for p in c.paragraphs:
                    txt.append(p.text)
                for tb in getattr(c, 'tables', []):
                    for r in tb.rows:
                        for cc in r.cells:
                            walk(cc)

            walk(d)
            for tb in d.tables:
                for r in tb.rows:
                    for cc in r.cells:
                        walk(cc)
            # '#' 뒤에 빈칸이 있어야 제목이다. 표 안의 색상값(#0E7A38)이 아니다.
            leak = [x[:40] for x in txt
                    if x.strip().startswith(('<!--', '# ', '> ', '**[', '!['))
                    or re.match(r'^#{2,6} ', x.strip())]
            if leak:
                note(f'{f}: 마크다운이 샜다 — {leak[:3]}')
            print(f'  {f}: 문단 {len(txt):,} · 그림 {len(d.inline_shapes)}')

    print('\n' + ('모든 검사 통과' if not fail else f'{len(fail)}건 걸렸다'))
    return 1 if fail else 0


if __name__ == '__main__':
    sys.exit(main())

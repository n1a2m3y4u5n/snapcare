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
  · 응답자 명단의 수가 실제 응답 수와 같은가
  · 캡처 캡션의 "스크롤 없이" 주장이 파일 높이와 맞는가
  · 같은 번호의 표가 두 판에서 행 수가 같은가
  · 절마다 문단 수가 두 판에서 같은가
  · 그림 설명이 그림 바로 아래에 있는가
  · 본문의 검정 횟수와 Bonferroni 문턱이 실제와 같은가
  · 본문이 인용한 코드가 저장소 파일과 같은가
  · 본문이 든 형태소 이름이 사전에 그대로 있는가
  · 그림 33 의 채움 점수가 파서가 내는 값과 같은가
  · 같은 출처가 두 가지 모양으로 적히지 않았는가
  · 시험 표의 수가 실제로 돌린 결과와 같은가
  · 우리 산문의 표기가 한 가지로 통일되어 있는가
  · 응답자를 부를 때 직책이 표 41 과 같은가
  · 빌드된 문서에서 주소가 눌리는가
  · 표 20 의 명도 대비가 계산과 같고 그 색이 실제로 쓰이는가
"""
import re
from collections import Counter
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
        # *p* *r* *n* 같은 통계 기호는 이탤릭이지만 제목이 아니다.
        # 이것을 제목으로 세다가 (Dowse et al., 2023: *p* = 0.002) 를
        # 놓쳤다. 영어판에서 표본 수·평균·상관계수가 함께 빠져 있었다.
        bare = re.sub(r'\*[A-Za-z]{1,3}\*', '', t)
        if '*' in bare or '"' in bare:
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
              'fig09_device.png', 'fig12_textsize.png', 'fig16_picturekey.png',
              'fig13_profile.png', 'fig17_history.png')
UI_PATHS = ('app', 'components')


# 검사가 전제 조건이 없을 때 조용히 빈 목록을 돌려주면, 통과와 "재지 않음"
# 이 화면에서 구별되지 않는다. 이 문서에서 그 모양의 결함을 세 번 겪었다.
# 시험이 임포트에서 멈춘 것(§4.7), 접근성 훑기가 없어진 주소를 잰 것(§3.7),
# 그리고 도판 스크립트가 중간에 죽어 뒤의 여덟 장이 안 그려진 것이다.
# 그래서 빠져나갈 때는 왜 빠져나가는지를 남기고 끝에 모아 알린다.
SKIPPED: list = []


def skip(why: str) -> list:
    SKIPPED.append(why)
    return []


def pct_parity() -> list:
    """두 판의 백분율이 절마다 같은가.

    두 판을 나란히 고치는 일이 잦아 한쪽에만 값이 들어가거나 옮기다
    자릿수가 흐를 수 있다. 문단 수와 표 행 수는 이미 보고 있으나 값
    자체는 보지 않고 있었다.

    표기가 언어마다 다르므로 맞춰 놓고 견준다. 한글은 범위를 물결로
    적고(3~10%) 영어는 to 로 적으며(3% to 10%), 백분율 차이를 한글은
    %p 로 영어는 percentage points 로 적는다. 이 셋을 같은 모양으로
    바꾼 뒤에야 견줄 수 있다."""
    # 영어판은 문장을 숫자로 시작하지 않으려고 백분율을 글자로 푼다
    # ("Forty-three percent"). 한글판은 늘 숫자다. 풀어 쓴 것을 숫자로
    # 되돌리지 않으면 이 검사가 온통 오탐이 된다. 실제로 일곱 절이
    # 걸렸고 일곱 다 이것이었다.
    ONES = {'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
            'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
            'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14,
            'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18,
            'nineteen': 19}
    TENS = {'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60,
            'seventy': 70, 'eighty': 80, 'ninety': 90}

    def spelled(t: str) -> str:
        def one(m):
            w = m.group(1).lower().replace('\u2013', '-')
            if w in ONES:
                return f'{ONES[w]}%'
            if w in TENS:
                return f'{TENS[w]}%'
            if '-' in w:
                a_, b_ = w.split('-', 1)
                if a_ in TENS and b_ in ONES:
                    return f'{TENS[a_] + ONES[b_]}%'
            return m.group(0)
        return re.sub(r'\b([A-Za-z]+(?:-[a-z]+)?)\s+per\s?cent(?:age)?\b(?!\s+points)',
                      one, t)

    def norm(t: str) -> list:
        t = spelled(t)
        t = re.sub(r'(\d+(?:\.\d+)?)\s*(?:percentage points|퍼센트포인트)', r'\1%p', t)
        t = re.sub(r'(\d+(?:\.\d+)?)\s*[~–—]\s*(\d+(?:\.\d+)?)%', r'\1% \2%', t)
        t = re.sub(r'(\d+(?:\.\d+)?)%\s*(?:to|~)\s*(\d+(?:\.\d+)?)%', r'\1% \2%', t)
        # 영어는 범위의 앞 숫자에 기호를 붙이지 않는 일이 잦다("3 to 5%").
        # 백분율은 세 자리를 넘지 않는다. 자리를 묶지 않으면 연도 범위
        # ("from 2015 to 2024")가 걸려 2015% 라는 값이 생긴다.
        t = re.sub(r'(?<![\d.%])(\d{1,3}(?:\.\d+)?)\s+to\s+(\d{1,3}(?:\.\d+)?)%', r'\1% \2%', t)
        t = re.sub(r'doi:[^\s)]+', ' ', t)
        return [x.rstrip('p') for x in re.findall(r'\d+(?:\.\d+)?%p?', t)]

    def secs(name):
        body = (DOC / name).read_text()
        out, cur, buf = {}, None, []
        for ln in body.splitlines():
            m = re.match(r'^### (\d+\.\d+)', ln)
            if m:
                if cur:
                    out[cur] = '\n'.join(buf)
                cur, buf = m.group(1), []
            elif cur is not None:
                buf.append(ln)
        if cur:
            out[cur] = '\n'.join(buf)
        return out

    ko, en = secs('proposal_ko.md'), secs('proposal_en.md')
    out = []
    for k in sorted(set(ko) & set(en), key=lambda x: [int(v) for v in x.split('.')]):
        a, b = Counter(norm(ko[k])), Counter(norm(en[k]))
        only_ko, only_en = sorted((a - b).elements()), sorted((b - a).elements())
        if only_ko or only_en:
            out.append(f'§{k} 의 백분율이 두 판에서 다르다 — 한글만 {only_ko[:5]} · 영어만 {only_en[:5]}')
    return out


def dash_aside() -> list:
    """부연설명 자리에 줄표를 쓰지 않았는가.

    이 문서의 규칙이다. 문장을 끊거나 쉼표·괄호로 적는다. 예전에 105곳을
    고쳤고, 새 문단을 넣을 때마다 되돌아가기 쉬운 자리라 검사로 굳힌다.

    범위 표기는 대상이 아니다(14–21 쪽, 2019–2021년). 걸리는 것은 양옆에
    공백을 둔 줄표와 낱말에 붙은 줄표다. 기울임 안은 서지의 제목이므로
    빼둔다. ISO 9186-1 의 정식 제목에 줄표가 들어 있다."""
    out = []
    for f in ('proposal_ko.md', 'proposal_en.md'):
        s = (DOC / f).read_text()
        s = s[:s.index('### 5.11')]
        inb = False
        for i, ln in enumerate(s.splitlines(), 1):
            if ln.startswith('```'):
                inb = not inb
                continue
            if inb or ln.startswith(('|', '>', '![', '    ')):
                continue
            bare = re.sub(r'\*[^*]+\*', ' ', ln)          # 서지 제목을 뺀다
            bare = re.sub(r'`[^`]+`', ' ', bare)           # 코드 조각도 뺀다
            for m in re.finditer(r'.{0,36}(?:\s[\u2014\u2013]\s|\S\u2014\S).{0,26}', bare):
                out.append(f'{f}:{i} 부연설명에 줄표 — …{m.group(0).strip()}…')
    return out


def toc_drift() -> list:
    """목차가 실제 제목과 같은가.

    목차는 낡기 가장 쉬운 자리다. 절을 하나 넣거나 이름을 고치면
    본문만 바뀌고 목차는 그대로 남는데, 읽는 사람은 목차를 먼저 믿는다.
    `tools/toc.py` 로 다시 만들 수 있으므로 어긋나면 그것을 돌리면 된다."""
    out = []
    for f in ('proposal_ko.md', 'proposal_en.md'):
        s = (DOC / f).read_text()
        if '<!-- toc -->' not in s:
            out.append(f'{f}: 목차가 없다')
            continue
        i = s.index('<!-- toc -->')
        j = s.index('<!-- /toc -->', i)
        listed = re.findall(r'^  (\d+\.\d+)  (.+)$', s[i:j], re.M)
        real = [(m.group(1), m.group(2).strip())
                for m in re.finditer(r'^### (\d+\.\d+) (.+)$', s, re.M)]
        if [x[0] for x in listed] != [x[0] for x in real]:
            miss = sorted(set(x[0] for x in real) - set(x[0] for x in listed),
                          key=lambda v: [int(z) for z in v.split('.')])
            extra = sorted(set(x[0] for x in listed) - set(x[0] for x in real),
                           key=lambda v: [int(z) for z in v.split('.')])
            out.append(f'{f}: 목차와 본문의 절이 다르다 — 빠진 것 {miss[:5]} · 없는 것 {extra[:5]}')
            continue
        for (a, at), (b, bt) in zip(listed, real):
            if at != bt:
                out.append(f'{f}: §{a} 의 이름이 목차와 다르다 — 목차 "{at}" · 본문 "{bt}"')
    return out


def toc_built() -> list:
    """빌드된 문서 안에 목차가 실려 있는가.

    마크다운만 보면 놓친다. 실제로 목차를 넣고 검사를 통과시킨 뒤에도
    docx 에는 들어가 있지 않았다. 서식이 받는 칸이 여섯뿐이라 빌더가
    "템플릿에 없는 절: 목차" 로 멈췄는데, 빌드 출력을 버리고 있어서
    아무도 보지 못했고 docx 는 예전 것이 그대로 남아 있었다."""
    try:
        import docx
    except ImportError:
        return skip('빌드된 목차 검사 — python-docx 가 없다')

    def walk(doc):
        for p in doc.paragraphs:
            yield p.text
        for t in doc.tables:
            for r in t.rows:
                for c in r.cells:
                    for p in c.paragraphs:
                        yield p.text
                    for it in c.tables:
                        for rr in it.rows:
                            for cc in rr.cells:
                                for pp in cc.paragraphs:
                                    yield pp.text

    out = []
    for name, kw, src in (('SnapCare_H1_Final_Proposal_KO.docx', '목차', 'proposal_ko.md'),
                          ('SnapCare_H1_Final_Proposal_EN.docx', 'Contents', 'proposal_en.md')):
        path = DOC / name
        if not path.exists():
            out.append(f'{name}: 파일이 없다')
            continue
        txt = list(walk(docx.Document(str(path))))
        if kw not in [t.strip() for t in txt]:
            out.append(f'{name}: 목차가 실리지 않았다 — 빌드가 실패한 채로 남아 있을 수 있다')
            continue
        # 중첩 표를 두 번 훑게 되므로 줄을 세면 배수가 된다. 가짓수로 센다.
        n = len({m.group(1) for t in txt
                 for m in [re.match(r'^\s*(\d+\.\d+)\s\s', t)] if m})
        real = len(re.findall(r'^### \d+\.\d+ ', (DOC / src).read_text(), re.M))
        if n != real:
            out.append(f'{name}: 목차의 절이 {n} 인데 본문의 절은 {real} 이다')
    return out


def built_fresh() -> list:
    """제출본이 지금의 본문에서 만들어진 것인가.

    본문을 고치고 다시 만들지 않으면 검사는 마크다운만 보고 통과하는데
    제출되는 것은 옛 문서다. 실제로 그런 상태로 한 번 커밋되었다. 빌드가
    "템플릿에 없는 절" 로 멈춘 것을 출력을 버려서 못 보았고, docx 는
    예전 것이 그대로 남아 있었다.

    그래서 빌드가 원본의 sha1 앞 열두 자리를 `cp:contentStatus` 에 찍고
    여기서 대조한다. 다르면 다시 만들어야 한다는 뜻이다."""
    import hashlib
    import zipfile
    out = []
    for doc, src in (('SnapCare_H1_Final_Proposal_KO.docx', 'proposal_ko.md'),
                     ('SnapCare_H1_Final_Proposal_EN.docx', 'proposal_en.md')):
        path = DOC / doc
        if not path.exists():
            out.append(f'{doc}: 파일이 없다')
            continue
        try:
            t = zipfile.ZipFile(path).read('docProps/core.xml').decode('utf-8')
        except Exception as e:
            out.append(f'{doc}: 속성을 읽지 못했다 ({e.__class__.__name__})')
            continue
        m = re.search(r'<cp:contentStatus>src:([0-9a-f]+)</cp:contentStatus>', t)
        if not m:
            out.append(f'{doc}: 원본 지문이 찍혀 있지 않다 — 옛 빌더로 만든 문서다')
            continue
        want = hashlib.sha1((DOC / src).read_bytes()).hexdigest()[:12]
        if m.group(1) != want:
            out.append(f'{doc}: 지금 본문에서 만든 문서가 아니다 '
                       f'(찍힌 것 {m.group(1)} · 지금 {want}). 다시 만들어야 한다')
    return out


def affil_invent() -> list:
    """응답자를 부를 때 명단에 없는 소속을 붙이지 않았는가.

    `title_drift` 가 직책은 보지만 소속은 보지 않는다. 실제로 §5.7 에
    "국립공주대학교 특수교육 김은경 교수" 라고 적은 적이 있는데 명단에는
    학과가 없다. 실명으로 부르는 문서에서 없는 소속을 지어 붙이는 것은
    직책을 틀리는 것보다 무겁다.

    이름 바로 앞의 낱말만 본다. 그것이 기관이나 학과처럼 생겼는데 명단의
    소속 칸에 없으면 알린다. 지금 문서에서 오탐은 없다."""
    s = (DOC / 'proposal_ko.md').read_text()
    if '### 5.11' not in s or not table_no('전원이 실명'):
        return skip('소속 대조 — 부록 §5.11 이나 응답자 명단 표가 없다')
    roster = {}
    for ln in s[s.index(f'[표 {table_no("전원이 실명")}]'):].splitlines()[1:]:
        if not ln.startswith('|'):
            if roster:
                break
            continue
        c = [x.strip() for x in ln.strip('|').split('|')]
        if len(c) >= 4 and c[0] and c[0] != '성함' and '---' not in c[0]:
            roster[c[0]] = c[2]
    body = s[:s.index('### 5.11')]
    suf = re.compile(r'[가-힣A-Za-z·]*(대학교|대학|연구원|진흥원|개발원|공사|재단'
                     r'|병원|연구소|센터|학과|교육)$')
    out = []
    for name, aff in roster.items():
        if not re.search(r'[가-힣]', name) or not aff:
            continue
        for m in re.finditer(re.escape(name), body):
            pre = body[max(0, m.start() - 30):m.start()].strip().split()
            tok = pre[-1].strip('의,·()') if pre else ''
            if not tok or not suf.match(tok):
                continue
            if tok not in aff and aff not in tok:
                out.append(f'{name} 앞의 "{tok}" 이 명단의 소속("{aff}")에 없다')
                break
    return out


def engine_facts() -> list:
    """엔진에 대해 본문이 말하는 수가 사전과 같은가.

    형태소 수는 `morpheme_names` 가 이름으로 보지만, 갈래별 수와 연산자
    수와 홀로 설 수 있는 것의 수는 아무도 보지 않았다. 실제로 §2.2 가
    "수식어는 홀로 설 수 없다" 고 적으면서 홀로 서는 넷을 예로 들고
    있었다."""
    import json
    dic = DOC.parent.parent / 'engine/dictionary.json'
    if not dic.is_file():
        return skip('엔진 수치 대조 — engine/dictionary.json 이 없다')
    d = json.loads(dic.read_text())
    want = {
        '머리': len(d['heads']),
        '수식어': len(d['modifiers']),
        '형태소': len(d['heads']) + len(d['modifiers']),
        '연산자': len(d['composition_operators']),
        '홀로': sum(1 for m in d['modifiers'] if m.get('standalone')),
    }
    s = (DOC / 'proposal_ko.md').read_text()
    s = s[:s.index('### 5.11')]
    out = []
    for pat, key in ((r'형태소 (\d+)종', '형태소'),
                     (r'(\d+)개의 머리', '머리'), (r'(\d+)개의 수식어', '수식어'),
                     (r'머리 (\d+)종', '머리'), (r'(\d+) × (?:\d+)', '머리')):
        for m in re.finditer(pat, s):
            got = int(m.group(1))
            if got != want[key]:
                out.append(f'본문의 {key} 수 {got} 이 사전의 {want[key]} 과 다르다 '
                           f'— …{s[max(0, m.start() - 26):m.end() + 14].strip()}…')
    return out


def dsl_parses() -> list:
    """본문이 인용한 SIGIL 문자열이 실제로 파싱되는가.

    아무도 보지 않던 자리다. 실제로 §1.9 가 "문법은 이것을 막지 않는다"
    는 예로 `\\bandage{allergen_peanut}` 을 들고 있었는데, `bandage` 는
    사전에 없는 이름이고 인자에 역슬래시도 빠져 있어 문법이 막는다.
    막지 않는다는 것을 보이려고 든 예가 막히는 것이었다."""
    import sys
    root = DOC.parent.parent
    eng = root / 'engine'
    if not (eng / 'engine.py').is_file() or not (eng / 'dictionary.json').is_file():
        return skip('DSL 파싱 검사 — engine/ 이 없다')
    sys.path.insert(0, str(eng))
    try:
        import engine as E
    except Exception as e:
        return skip(f'DSL 파싱 검사 — 엔진을 부르지 못했다 ({e.__class__.__name__})')
    man = E.Manifest.load(eng / 'dictionary.json')
    out = []
    for f in ('proposal_ko.md', 'proposal_en.md'):
        body = (DOC / f).read_text()
        body = body[:body.index('### 5.11')]
        for m in re.finditer(r'`(\\[a-z_]+(?:\{[^`]*?\})*)`', body):
            src = m.group(1)
            if '{' not in src:          # 이름만 적은 것은 대상이 아니다
                continue
            # 연산자를 도식으로 적은 자리(`\no{}`·`\no{...}`)는 문장이지 DSL 이
            # 아니다. 빈 괄호나 줄임표가 들어 있으면 넘긴다.
            if re.search(r'\{\s*(\.{3}|…)?\s*\}', src):
                continue
            try:
                E.parse(src, man)
            except Exception as ex:
                out.append(f'{f}: 인용한 DSL 이 파싱되지 않는다 — `{src}` ({ex})')
    return out


def voca_verbs() -> list:
    """§2.3 의 제형별 동사·부위 표가 구현과 같은가.

    안약을 "드세요" 라고 말하는 것은 어색한 표현이 아니라 잘못된 지시다.
    그런 표를 눈으로 맞출 수는 없으므로 실제로 돌려 견준다."""
    import json
    import subprocess
    root = DOC.parent.parent
    probe = DOC / 'tools/voca_probe.mjs'
    if not probe.is_file() or not (root / 'node_modules').exists():
        return skip('VOCA 동사 대조 — probe 나 node_modules 가 없다')
    try:
        r = subprocess.run(['node', '--experimental-strip-types', str(probe)],
                           cwd=root, capture_output=True, text=True, timeout=120)
        got = json.loads(r.stdout.strip().splitlines()[-1])
    except Exception as e:
        return [f'VOCA 문장을 얻지 못했다: {e.__class__.__name__}']

    body = (DOC / 'proposal_ko.md').read_text()
    n = table_no('제형에서 유도되는')
    if not n:
        return skip('VOCA 동사 대조 — 제형 표를 찾지 못했다')
    out = []
    seen = False
    for ln in body[body.index(f'[표 {n}]'):].splitlines()[1:]:
        if not ln.startswith('|'):
            if seen:            # 표가 끝났다
                break
            continue            # 제목과 표 사이의 빈 줄
        seen = True
        c = [x.strip() for x in ln.strip('|').split('|')]
        if len(c) < 5 or '---' in c[0] or c[0] == '제형':
            continue
        form = c[0].split()[-1]              # "점안액 eyedrop" → eyedrop
        said = got.get(form)
        if said is None:
            continue
        verb, site = c[2], c[3]
        if not said.startswith(verb):
            out.append(f'표 {n}: {form} 의 동사가 "{verb}" 인데 실제로는 "{said}" 다')
        want_site = '' if site in ('없음', '-', '') else site
        if want_site and want_site not in said:
            out.append(f'표 {n}: {form} 의 부위가 "{site}" 인데 실제로는 "{said}" 다')
        if not want_site and any(k in said for k in (' in the ', ' on the ')):
            out.append(f'표 {n}: {form} 은 부위가 없다고 적혔는데 실제로는 "{said}" 다')
    return out


def reference_table() -> list:
    """표 11 이 정말 그 코드의 출력인가.

    제목에 "위 코드의 출력" 이라고 적어 두었으니 손으로 옮긴 값이 아니라
    돌려서 나온 값이어야 한다. 실제로 성인 지방 한 칸이 67 이었고 코드는
    66.7 을 준다. 다른 칸은 소수 한 자리까지 그대로였다."""
    import json
    import subprocess
    root = DOC.parent.parent
    probe = DOC / 'tools/ref_probe.mjs'
    if not probe.is_file() or not (root / 'node_modules').exists():
        return skip('기준치 표 대조 — probe 나 node_modules 가 없다')
    try:
        r = subprocess.run(['node', '--experimental-strip-types', str(probe)],
                           cwd=root, capture_output=True, text=True, timeout=120)
        got = json.loads(r.stdout.strip().splitlines()[-1])
    except Exception as e:
        return [f'기준치를 얻지 못했다: {e.__class__.__name__}']

    body = (DOC / 'proposal_ko.md').read_text()
    n = table_no('나이대별 하루 기준치')
    if not n:
        return skip('기준치 표 대조 — 표를 찾지 못했다')
    band = {'아동': 'child', '청소년': 'teen', '성인': 'adult', '고령': 'senior'}
    cols = ['energy', 'sugars', 'saturatedFat', 'fat', 'salt', 'fiber', 'protein']
    out, seen = [], False
    for ln in body[body.index(f'[표 {n}]'):].splitlines()[1:]:
        if not ln.startswith('|'):
            if seen:
                break
            continue
        seen = True
        c = [x.strip() for x in ln.strip('|').split('|')]
        key = band.get(c[0].split()[0]) if c else None
        if not key or key not in got:
            continue
        for i, col in enumerate(cols, start=1):
            said = c[i].replace(',', '').split()[0]
            try:
                a, b = float(said), float(got[key][col])
            except (ValueError, IndexError):
                continue
            if abs(a - b) > 0.05:
                out.append(f'표 {n}: {c[0]} 의 {col} 이 {said} 인데 코드는 {got[key][col]} 을 준다')
    return out


def model_table() -> list:
    """표 38 이 저장해 둔 평가 결과와 같은가.

    이 값은 다시 잴 수 없다. Nutrition5k 원본을 우리가 더는 갖고 있지
    않기 때문이고 본문도 그렇게 밝힌다. 다시 잴 수 없을수록 옮겨 적은
    값이 원본과 같은지는 기계가 봐야 한다. 표의 마지막 열(테스트 집합의
    평균)은 결과 파일에 없으므로 MAE 를 MAE% 로 나누어 검산한다."""
    import json
    res = DOC / 'tools/model_eval_result.json'
    if not res.is_file():
        return skip('모델 표 대조 — model_eval_result.json 이 없다')
    d = json.loads(res.read_text())
    body = (DOC / 'proposal_ko.md').read_text()
    n = table_no('영양 추정 모델의 항목별 오차')
    if not n:
        return skip('모델 표 대조 — 표를 찾지 못했다')
    key = {'열량': 'calories', '질량': 'mass', '지방': 'fat',
           '탄수화물': 'carb', '단백질': 'protein'}
    out, seen = [], False
    for ln in body[body.index(f'[표 {n}]'):].splitlines()[1:]:
        if not ln.startswith('|'):
            if seen:
                break
            continue
        seen = True
        c = [x.strip() for x in ln.strip('|').split('|')]
        k = key.get(c[0]) if c else None
        if not k:
            continue
        try:
            mae = float(c[1].split()[0])
            pct = float(c[2].rstrip('%'))
            mean = float(c[3].split()[0])
        except (ValueError, IndexError):
            continue
        if abs(mae - d['mae'][k]) > 0.005:
            out.append(f'표 {n}: {c[0]} 의 MAE 가 {mae} 인데 결과는 {d["mae"][k]} 다')
        if abs(pct - d['mae_pct'][k]) > 0.005:
            out.append(f'표 {n}: {c[0]} 의 MAE% 가 {pct} 인데 결과는 {d["mae_pct"][k]} 다')
        want = d['mae'][k] / (d['mae_pct'][k] / 100)
        if abs(mean - want) > 0.15:
            out.append(f'표 {n}: {c[0]} 의 테스트 평균 {mean} 이 MAE÷MAE% 인 '
                       f'{want:.2f} 와 다르다')
    if f'n = {d["n"]}' not in body:
        out.append(f'본문에 n = {d["n"]} 이 없다')
    return out


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
                + ', '.join(out[:4]) + (' …' if len(out) > 4 else '')
                + ' (커밋 시각으로 견주므로 다시 뜬 뒤 커밋해야 풀린다)']
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


def roster_count() -> list:
    """표 42 의 응답자 수가 실제 응답 수와 같은지 본다.

    이름 표기는 표 42 에서 정규화한다(Vucicevic → Vučićević, 소문자 성 →
    대문자). 그래서 문자열로 대조하면 오탐이 난다. 수만 견준다."""
    xl = (Path.home() / 'Desktop/Claude/snapcare-survey/scratchpad'
          / 'SnapCare_설문응답.xlsx')
    if xl.is_file():
        import openpyxl
        ws = openpyxl.load_workbook(xl, data_only=True)['응답']
        n_data = ws.max_row - 1
        src = '원자료'
    else:
        # 원자료가 없으면 부록으로 견준다. 부록 §5.11 은 자유 서술을
        # 응답자별로 싣고 있으므로 거기 나오는 사람 수가 하한이 된다.
        # 자유 서술을 한 줄도 적지 않은 응답자는 부록에 없으므로 이
        # 값은 실제 응답 수 이하이며, 명단이 그보다 적으면 확실히 틀렸다.
        doc = (DOC / 'proposal_ko.md').read_text()
        if '### 5.11' not in doc:
            return skip('명단 수 대조 — 원자료도 부록 §5.11 도 없다')
        seg = doc[doc.index('### 5.11'):doc.index('### 5.12')]
        who = set()
        for ln in seg.splitlines():
            if not ln.startswith('|'):
                continue
            c = [x.strip() for x in ln.strip('|').split('|')]
            if len(c) >= 4 and c[0] and c[0] != '응답자' and '---' not in c[0]:
                who.add(c[0])
        n_data = len(who)
        src = '부록에 나오는 응답자'

    s = (DOC / 'proposal_ko.md').read_text()
    i = s.index(f'[표 {table_no("전원이 실명") or 42}]')
    names = []
    for ln in s[i:].splitlines()[1:]:
        if not ln.startswith('|'):
            if names:
                break
            continue
        c = [x.strip() for x in ln.strip('|').split('|')]
        if len(c) >= 4 and c[0] and c[0] != '성함' and '---' not in c[0] \
                and not c[0].startswith('**'):
            names.append(c[0])
    if src == '원자료':
        if len(names) != n_data:
            return [f'표 42 가 {len(names)}명인데 응답은 {n_data}건이다']
        return []

    # 원자료가 없을 때. 수만 견주면 명단에서 한 명을 지워도 안 걸린다
    # (자유 서술을 적지 않은 사람이 있어 부록이 늘 더 적다). 이름을
    # 견딘다 — 부록에 답이 실린 사람은 반드시 명단에 있어야 한다.
    missing = sorted(who - set(names))
    out = []
    if missing:
        out.append(f'부록에 답이 실렸는데 표 42 에 없는 응답자 '
                   f'{len(missing)}명 — {", ".join(missing[:4])}')
    if len(names) < n_data:
        out.append(f'표 42 가 {len(names)}명인데 {src}가 {n_data}명이다')
    return out


# 촬영 뷰포트. shots.mjs 의 defaultViewport 와 같아야 한다.
SHOT_VIEWPORT_PX = 812 * 2


def fold_claims() -> list:
    """캡션이 "스크롤 없이 보이는 만큼" 이라 하는데 파일이 그보다 긴가.

    화면 캡처는 fullPage 로 찍으므로 스크롤해야 닿는 부분까지 들어온다.
    그것을 "스크롤하지 않고 보이는 만큼" 이라고 적으면 독자는 이 전부가
    한눈에 들어온다고 읽는다. 실제로 그림 15 가 그랬다. 캡션은 그렇게
    적혀 있었고 파일은 750x2180, 뷰포트는 750x1624 였다.

    지금은 접히는 자리에 붉은 선을 긋고 아래를 옅게 덮는다(shots.mjs 의
    markFold). 이 검사는 그 선 없이 주장만 되살아나는 것을 막는다."""
    from PIL import Image
    CLAIM = ('스크롤하지 않고 보이는 만큼', '스크롤 없이 보이는 만큼',
             'visible without scrolling', 'without having to scroll')
    out = []
    for f in ('proposal_ko.md', 'proposal_en.md'):
        lines = (DOC / f).read_text().splitlines()
        for i, ln in enumerate(lines):
            m = re.match(r'!\[[^\]]*\]\((fig(?:_en)?/[^)]+\.png)\)', ln.strip())
            if not m:
                continue
            img = DOC / m.group(1)
            if not img.is_file():
                continue
            h = Image.open(img).height
            if h <= SHOT_VIEWPORT_PX:
                continue
            cap = ' '.join(lines[i + 1:i + 4])
            for c in CLAIM:
                if c in cap and '붉은 선' not in cap and 'red line' not in cap:
                    out.append(f'{f}: {m.group(1)} 는 {h}px 인데(뷰포트 '
                               f'{SHOT_VIEWPORT_PX}px) 캡션이 "{c}" 라 한다')
    return out


def table_parity() -> list:
    """같은 번호의 표가 두 판에서 행 수가 같은가.

    영어판 표 22 에 "종이 서식 판독" 행이 없었다. 한글판에는 있고
    §4.4 가 그것만 다루는 절인데도 그랬다. 표를 한쪽에만 더하면
    이렇게 조용히 갈린다.

    행 수만 견준다. 셀 안의 말은 언어가 다르므로 견줄 수 없다."""
    def rows(f: str) -> dict:
        out, cur = {}, None
        for ln in (DOC / f).read_text().splitlines():
            m = re.match(r'^\[(?:표|Table) (\d+)\]', ln)
            if m:
                cur = m.group(1)
                out[cur] = 0
                continue
            if cur is None:
                continue
            t = ln.strip()
            if t.startswith('|'):
                if not set(t) <= set('|- :'):      # 구분선은 세지 않는다
                    out[cur] += 1
            elif t:
                cur = None
        return out
    a, b = rows('proposal_ko.md'), rows('proposal_en.md')
    out = [f'표 {k}: 한글에만 있다' for k in sorted(set(a) - set(b), key=int)]
    out += [f'표 {k}: 영어에만 있다' for k in sorted(set(b) - set(a), key=int)]
    out += [f'표 {k} 의 행 수가 다르다 (한글 {a[k]} · 영어 {b[k]})'
            for k in sorted(set(a) & set(b), key=int) if a[k] != b[k]]
    return out


def para_parity() -> list:
    """절마다 문단 수가 두 판에서 같은가.

    번역하며 문단이 통째로 빠지는 것을 잡는다. 실제로 §3.5.1 에서
    영어판이 훑어 듣기가 들어오기 전의 설계를 그대로 서술하고 있었고
    (표 17 의 한 행과 두 문단), §4.1 의 표 22 에서 행 하나가 없었다.

    코드 블록은 뺀다. 영어 주석이 길어 두 줄로 접히므로 언제나 어긋난다.
    말의 길이는 견주지 않는다. 언어가 다르면 길이도 다르다."""
    def secs(f: str) -> dict:
        out, cur, buf, fence = {}, None, [], False
        for ln in (DOC / f).read_text().splitlines():
            if ln.strip().startswith('```'):
                fence = not fence
                continue
            if fence:
                continue
            m = re.match(r'^#{2,4}\s*(\d+\.\d+(?:\.\d+)?)', ln)
            if m:
                if cur:
                    out[cur] = buf
                cur, buf = m.group(1), []
            elif cur is not None and ln.strip():
                buf.append(ln.strip())
        if cur:
            out[cur] = buf
        return out
    a, b = secs('proposal_ko.md'), secs('proposal_en.md')
    return [f'§{k} 의 문단 수가 다르다 (한글 {len(a[k])} · 영어 {len(b[k])})'
            for k in sorted(set(a) & set(b), key=lambda x: [int(i) for i in x.split('.')])
            if len(a[k]) != len(b[k])]


def caption_place() -> list:
    """그림 캡션이 그림 아래에 있는가, 그리고 바로 붙어 있는가.

    학술 관례는 표 설명이 표 위, 그림 설명이 그림 아래다. 두 판 모두
    섞여 있었다. 한글판은 46개 중 8개, 영어판은 21개가 그림 위에
    있었고, 그림 45 는 캡션과 그림 사이에 문단이 셋 끼어 있었다.
    빌드가 원고 순서를 그대로 옮기므로 독자는 그림보다 설명을 먼저
    읽게 된다."""
    out = []
    for f, cre, ire in (('proposal_ko.md', r'^\*\*\[그림 (\d+)\]', r'^!\[그림 (\d+)\]'),
                        ('proposal_en.md', r'^\*\*\[Figure (\d+)\]', r'^!\[Figure (\d+)\]')):
        lines = (DOC / f).read_text().splitlines()
        pos = {}
        for i, ln in enumerate(lines):
            m = re.match(cre, ln)
            if m:
                pos.setdefault(m.group(1), {})['cap'] = i
            m = re.match(ire, ln)
            if m:
                pos.setdefault(m.group(1), {})['img'] = i
        for n, v in sorted(pos.items(), key=lambda kv: int(kv[0])):
            if 'cap' not in v or 'img' not in v:
                continue
            if v['cap'] < v['img']:
                out.append(f'{f}: 그림 {n} 의 설명이 그림 위에 있다')
            elif v['cap'] - v['img'] > 2:
                out.append(f'{f}: 그림 {n} 과 그 설명 사이에 '
                           f'{v["cap"] - v["img"] - 1}줄이 끼어 있다')
    return out


def bonferroni() -> list:
    """본문이 적은 검정 횟수와 보정 문턱이 실제로 돌린 것과 같은가.

    survey_stats.py 에 TESTS = 5 가 손으로 박혀 있었는데 실제로 돌리는
    검정은 여섯이었다. 다섯으로 세면 문턱이 0.010 이 되어 실제인
    0.0083 보다 느슨해진다. 우리에게 유리한 쪽으로 틀린 셈이었다.
    결론은 바뀌지 않았으나(p = 0.0078) 여유가 0.0005 로 좁다."""
    src = (DOC / 'tools/survey_stats.py').read_text()
    n = len(re.findall(r'=\s*stats\.(?:fisher_exact|mannwhitneyu|spearmanr)\(', src))
    if n == 0:
        return ['survey_stats.py 에서 검정 호출을 찾지 못했다']
    thr = 0.05 / n
    out = []

    ko = (DOC / 'proposal_ko.md').read_text()
    m = re.search(r'검정을 (\S+) 번 돌렸으므로 Bonferroni 보정 문턱은 (\d+\.\d+)', ko)
    if not m:
        out.append('한글판에서 Bonferroni 문장을 찾지 못했다')
    else:
        WORD = {'한': 1, '두': 2, '세': 3, '네': 4, '다섯': 5, '여섯': 6,
                '일곱': 7, '여덟': 8, '아홉': 9, '열': 10}
        said = WORD.get(m.group(1), None)
        if said != n:
            out.append(f'한글판이 검정을 {m.group(1)} 번이라 하는데 실제는 {n}회다')
        if abs(float(m.group(2)) - thr) > 5e-5:
            out.append(f'한글판 문턱 {m.group(2)} 인데 0.05/{n} = {thr:.4f} 다')

    en = (DOC / 'proposal_en.md').read_text()
    m = re.search(r'(\w+) tests were run, so the Bonferroni-corrected '
                  r'threshold is (\d+\.\d+)', en)
    if not m:
        out.append('영어판에서 Bonferroni 문장을 찾지 못했다')
    else:
        WORD = {'One': 1, 'Two': 2, 'Three': 3, 'Four': 4, 'Five': 5,
                'Six': 6, 'Seven': 7, 'Eight': 8, 'Nine': 9, 'Ten': 10}
        if WORD.get(m.group(1)) != n:
            out.append(f'영어판이 검정을 {m.group(1)} 이라 하는데 실제는 {n}회다')
        if abs(float(m.group(2)) - thr) > 5e-5:
            out.append(f'영어판 문턱 {m.group(2)} 인데 0.05/{n} = {thr:.4f} 다')
    return out


def code_drift() -> list:
    """본문이 인용한 코드가 저장소의 파일과 같은가.

    세 곳이 달랐다. 서비스워커 인용에는 실물에 있는 관문 둘(GET 만,
    같은 출처만)이 없었고, 알레르기 추론 인용은 소스에 없는 주석을
    달고 줄을 합쳤으며, SIGIL 파서 인용은 `if not in_slot:` 이었는데
    실물은 `if not in_slot and not self.m.get(name).standalone:` 이다.
    마지막 것은 문서 자신과도 어긋났다 — §2.2 가 홀로 설 수 있는
    수식어가 넷이라고 적고 있는데 인용된 파서는 그럴 수 없다고 한다.

    공백을 지우고 견준다. 줄바꿈 자리는 원고 폭 때문에 다를 수 있고
    그것까지 잡으면 쓸 수 없는 검사가 된다. `...` 은 줄임 표시이므로
    건너뛰고, 주석은 줄일 수 있게 두되 코드 줄은 하나도 어긋나면
    안 된다."""
    root = DOC.parent.parent
    src = []
    for pat in ('*.ts', '*.tsx', '*.py', '*.js', '*.mjs'):
        for f in root.rglob(pat):
            sp = str(f)
            if 'node_modules' in sp or '/.venv' in sp or '/docs/proposal/' in sp:
                continue
            try:
                src.append(re.sub(r'\s+', ' ', f.read_text()))
            except OSError:
                continue
    out = []
    for f in ('proposal_ko.md', 'proposal_en.md'):
        body = (DOC / f).read_text()
        for m in re.finditer(r'```(ts|python|js|mjs)\n(.*?)```', body, re.S):
            block = False          # /* … */ 안인가
            for ln in m.group(2).splitlines():
                t = ln.strip()
                if t.startswith('/*') or t.startswith('\"\"\"'):
                    block = True
                if block:
                    if t.endswith('*/') or (t.endswith('\"\"\"') and len(t) > 3):
                        block = False
                    continue
                if (not t or t == '...' or t.startswith(('//', '#', '*'))
                        or len(t) < 14):
                    continue
                # 줄 끝에 붙인 설명 주석은 떼고 견준다. 본문이 읽는
                # 사람을 위해 덧붙이는 것이고 코드가 아니다. 코드가
                # 달라진 것만 잡는 것이 이 검사의 목적이다.
                code = re.sub(r'\s+(//|#)\s.*$', '', ln)
                n = re.sub(r'\s+', ' ', code).strip()
                if len(n) < 14:
                    continue
                if not any(n in x for x in src):
                    out.append(f'{f}: 저장소에 없는 코드 줄 — {t[:66]}')
    return out


def morpheme_names() -> list:
    """본문이 든 형태소 이름이 사전에 그대로 있는가.

    표 33 이 `tree_nut` 과 `sugar` 로 적고 있었는데 사전의 이름은
    `allergen_tree_nut` 과 `food_sugar` 다. 이름을 줄여 적으면 심사자가
    저장소에서 찾지 못한다. 78종을 만들었다는 주장의 근거가 이 이름들이다.

    플래그(`lib/snapcare/types.ts` 의 ItemFlag)는 형태소와 다른 이름
    공간이며 `peanut`, `high_salt` 처럼 짧다. 그것까지 잡으면 오탐이
    되므로 함께 읽어 예외로 둔다."""
    import json
    root = DOC.parent.parent
    dic = root / 'engine/dictionary.json'
    typ = root / 'lib/snapcare/types.ts'
    if not dic.is_file() or not typ.is_file():
        return skip('형태소 이름 검사 — engine/dictionary.json 또는 형 파일이 없다')
    d = json.loads(dic.read_text())
    names = set()
    for k in ('heads', 'modifiers', 'composition_operators', 'frame'):
        v = d.get(k, {})
        names |= (set(v) if isinstance(v, dict)
                  else {x if isinstance(x, str) else x.get('name') for x in v})
    names.discard(None)
    t = typ.read_text()
    flags = set(re.findall(r"'([a-z_]+)'", t.split('ItemFlag =')[1].split(';')[0]))

    out = []
    for f in ('proposal_ko.md', 'proposal_en.md'):
        body = re.sub(r'```.*?```', '', (DOC / f).read_text(), flags=re.S)
        seen = set()
        for m in re.finditer(r'`(\\?[a-z][a-z0-9_]*)`', body):
            n = m.group(1).lstrip('\\')
            if n in names or n in flags or n in seen:
                continue
            near = [x for x in names if x.endswith('_' + n)]
            if near:
                seen.add(n)
                out.append(f'{f}: `{n}` 은 사전에 없다 — {near[0]} 를 줄여 적었다')
    return out


def sheet_scores() -> list:
    """그림 33 의 캡션이 말하는 채움 점수가 파서가 실제로 내는 값인가.

    캡션이 "0.67~0.71 대 0.00~0.04" 라고 적고 있었는데 파서를 돌리면
    고른 칸이 0.546~0.741 이다. 가장 낮은 금요일 0.546 이 빠져서
    간격이 실제보다 깨끗해 보였다. 우리에게 유리한 쪽으로 틀린 것이다.

    파서를 실제로 돌려 견준다. 사진 한 장이라 1초가 안 걸린다."""
    import json
    import subprocess
    root = DOC.parent.parent
    photo = DOC / 'fig/parts/_sheet_photo.png'
    cli = root / 'pill_dispenser/form_sheet_parser/parse_cli.py'
    py = DOC / '.venv-doc/bin/python'
    if not (photo.is_file() and cli.is_file() and py.is_file()):
        return skip('종이 서식 점수 검사 — 합성 사진·파서·파이썬 가운데 없는 것이 있다')
    try:
        r = json.loads(subprocess.run([str(py), str(cli), str(photo)],
                                      capture_output=True, text=True,
                                      timeout=120).stdout)
    except Exception as e:                       # 파서가 없거나 못 돌면 넘어간다
        return [f'그림 33 의 파서를 돌리지 못했다: {e}']
    if not r.get('ok'):
        return ['그림 33 의 파서가 사진을 읽지 못했다']
    chosen, rest = [], []
    for field, cells in r['scores'].items():
        pick = r['values'][field]
        pick = pick if isinstance(pick, list) else [pick]
        for name, v in cells.items():
            (chosen if name in pick else rest).append(v)
    lo, hi = min(chosen), max(chosen)
    rlo, rhi = min(rest), max(rest)
    want = (f'{lo:.2f}', f'{hi:.2f}', f'{rlo:.2f}', f'{rhi:.2f}')
    out = []
    for f, sep in (('proposal_ko.md', '~'), ('proposal_en.md', '–')):
        body = (DOC / f).read_text()
        m = re.search(r'\(([\d.]+)[~–]([\d.]+) (?:대|against) ([\d.]+)[~–]([\d.]+)\)', body)
        if not m:
            out.append(f'{f}: 그림 33 의 점수 범위를 찾지 못했다')
            continue
        if m.groups() != want:
            out.append(f'{f}: 그림 33 이 {m.group(0)} 라 하는데 파서는 '
                       f'({want[0]}~{want[1]} 대 {want[2]}~{want[3]}) 다')
    return out


def cite_shape() -> list:
    """같은 출처가 두 가지 모양으로 적히지 않았는가.

    §1.11 의 요약 문장이 세 논문을 제목 없이 약칭 학술지로 적고
    있었다 — *Arch Pediatr Adolesc Med*, *Res Social Adm Pharm*,
    *J Pharm Policy Pract*. 같은 논문이 다른 자리에서는 제목과 정식
    학술지명으로 나온다. 대장이 "나오는 자리마다 전체로 적는다" 고
    적어 둔 규칙과 어긋난다.

    Murray 등 2022 는 한쪽에서 부제가 빠져 있었다."""
    out = []
    for f in ('proposal_ko.md', 'proposal_en.md'):
        s = (DOC / f).read_text()
        s = s[:s.index('### 5.11')] if '### 5.11' in s else s

        # 1) 같은 저자·연도에 제목이 둘 이상
        by = {}
        for au, ti, yr in re.findall(
                r'\(([A-Z][\w.\'\- ]+(?:,[^,"]*)*?),\s*"([^"]+),"[^)]*?((?:19|20)\d\d)', s):
            by.setdefault((au.split(',')[0].strip(), yr), set()).add(ti)
        for (au, yr), ts in sorted(by.items()):
            if len(ts) > 1:
                out.append(f'{f}: {au} {yr} 의 제목이 {len(ts)}가지다 — '
                           + ' / '.join(sorted(t[:48] for t in ts)))

        # 2) 제목 없이 저자·학술지만 적은 인용
        # 학술지 인용만 본다 — 이탤릭 뒤에 권:쪽이 따라오는 모양이다.
        # 보고서와 단행본은 이탤릭이 곧 제목이므로 걸면 안 된다
        # (Paivio 의 단행본, GSMA·FARE 의 보고서가 그렇다).
        for m in re.finditer(r'\(([A-Z][\w.\'\- ]+(?:[,&][^()"]*?)?),\s*'
                             r'\*([^*]+)\*,\s*\d+(?:\(\d+\))?:[\d–\-]+,\s*(?:19|20)\d\d', s):
            if '"' in m.group(0):
                continue
            out.append(f'{f}: 제목 없이 학술지만 적은 인용 — {m.group(0)[:76]}')
    return out


def test_counts() -> list:
    """시험 표의 수가 실제로 돌린 결과와 같은가.

    표가 웹 앱 347개(346 통과·1 실패)라고 적고 있었는데 돌려 보니
    360개(359 통과·1 실패)였다. 실패의 설명도 달랐다 — 표는 "조건
    추적 모듈의 기본값" 이라 했으나 실제로는 kit.test.ts 가 불러오는
    데서 멈춘다. 그 파일의 시험이 한 개도 돌지 않으므로 실패 한 건이
    아니라 파일 하나가 통째로 재어지지 않는 상태였다.

    SNAPCARE_SKIP_TESTS=1 이면 건너뛴다. 세 갈래를 다 돌리면 40초쯤
    걸리므로 문서만 고칠 때는 끌 수 있어야 한다."""
    import os
    import subprocess
    if os.environ.get('SNAPCARE_SKIP_TESTS'):
        return skip('시험 수 대조 — SNAPCARE_SKIP_TESTS 로 껐다')
    root = DOC.parent.parent
    py = DOC / '.venv-doc/bin/python'
    if not (root / 'package.json').is_file():
        return skip('시험 수 대조 — package.json 이 없다')
    # 의존성이 없으면 세 파일이 zustand 에서 멈춰 시험 스물다섯 개가
    # 사라진다. 그 상태로 세면 표가 틀렸다고 잘못 말한다. 표가 적어 둔
    # 조건(`npm ci`)과 같은 자리에서 재야 한다.
    if not (root / 'node_modules').exists():
        n = table_no('세 갈래의 시험') or 31
        return [f'node_modules 가 없어 시험 수를 셀 수 없다 — 표 {n} 이 '
                '`npm ci` 를 조건으로 적고 있으므로 먼저 설치해야 한다']

    got = {}
    try:
        r = subprocess.run(['node', '--test'], cwd=root, capture_output=True,
                           text=True, timeout=600).stdout
        m = {k: int(v) for k, v in re.findall(r'^\u2139 (\w+) (\d+)$', r, re.M)}
        if 'tests' in m:
            got['웹 앱'] = (m['tests'], m.get('pass', 0), m.get('fail', 0))
    except Exception as e:
        return [f'웹 앱 시험을 돌리지 못했다: {e}']

    if py.is_file():
        for name, paths in (('종이 서식·클라우드 릴레이', ['pill_dispenser/form_sheet_parser',
                                         'pill_dispenser/cloud_relay']),
                            ('기기 펌웨어', ['pill_dispenser/firmware'])):
            try:
                r = subprocess.run([str(py), '-m', 'pytest', *paths, '-q'], cwd=root,
                                   capture_output=True, text=True, timeout=900).stdout
                m = re.search(r'(?:(\d+) passed)(?:, (\d+) skipped)?', r)
                if m:
                    p_, sk = int(m.group(1)), int(m.group(2) or 0)
                    got[name] = (p_ + sk, p_, 0)
            except Exception:
                pass

    body = (DOC / 'proposal_ko.md').read_text()
    tn = table_no("세 갈래의 시험") or 31
    i = body.index(f'[표 {tn}]')
    rows = {}
    for ln in body[i:].splitlines()[1:]:
        if not ln.startswith('|'):
            if rows:
                break
            continue
        c = [x.strip() for x in ln.strip('|').split('|')]
        if len(c) >= 3 and c[1].isdigit():
            rows[c[0].split('(')[0].strip()] = int(c[1])

    out = []
    for k, (n, _p, _f) in got.items():
        said = rows.get(k)
        if said is None:
            out.append(f'표 28 에 "{k}" 행이 없다')
        elif said != n:
            way = '늘었다' if n > said else '줄었다'
            out.append(f'표 {tn} 의 {k} 이 {said} 인데 돌려 보니 {n} 이다 ({way}). '
                       '앱을 고치는 동안 이 수는 자주 움직인다. 늘어난 것이면 '
                       '값만 맞추면 되고, 줄어든 것이면 시험이 어디서 멈추었는지 먼저 본다')
    return out


# 우리 산문에서 한 가지로 써야 하는 말. 왼쪽이 틀린 표기다.
# 인용과 표, 부록은 보지 않는다 — 응답자가 쓴 말을 우리가 고르게
# 만들면 그것은 인용이 아니게 된다. 실제로 "팩토그램" 은 응답자가
# 그렇게 적은 것이고 그대로 두어야 한다.
SPELLING = {
    '건강문해력': '건강 문해력',      # 저건강문해력 은 합성어라 예외로 둔다
    '복약순응': '복약 순응',
    '서비스 워커': '서비스워커',
    '손 글씨': '손글씨',
}


def spelling() -> list:
    out = []
    for f in ('proposal_ko.md',):
        body = (DOC / f).read_text()
        cut = body.index('### 5.11') if '### 5.11' in body else len(body)
        for i, ln in enumerate(body[:cut].splitlines(), 1):
            t = ln.strip()
            if t.startswith(('>', '|', '```')):
                continue
            for bad, good in SPELLING.items():
                if bad == '건강문해력':
                    hits = re.findall(r'(?<!저)건강문해력', ln)
                else:
                    hits = re.findall(re.escape(bad), ln)
                if hits:
                    out.append(f'{f}:{i} 표기가 갈린다 — "{bad}" 는 "{good}" 로')
    return out


def title_drift() -> list:
    """본문이 응답자를 부를 때 직책이 표 41 과 같은가.

    사용자가 요구한 것은 인용에 이름·소속·직책이 다 드러나는 것이다.
    한 자리가 이소영 응답자를 "교수" 로만 적고 있었는데 표 42 는
    "교수·약사" 다. 같은 사람이 문서 안에서 두 직책을 갖게 된다.

    한글 이름만 본다. 로마자 이름은 표기가 여럿이라(Vučićević 등)
    문자열로 대조하면 오탐이 난다."""
    out = []
    s = (DOC / 'proposal_ko.md').read_text()
    # 표 번호를 박아 두면 표가 밀렸을 때 이 검사가 조용히 꺼지거나 엉뚱한
    # 표를 읽는다. 실제로 표가 두 번 밀렸다. 제목으로 찾는다.
    if '### 5.11' not in s or not table_no('전원이 실명'):
        return skip('직책 대조 — 부록 §5.11 이나 응답자 명단 표가 없다')
    body = s[:s.index('### 5.11')]
    roster = {}
    for ln in s[s.index(f'[표 {table_no("전원이 실명") or 42}]'):].splitlines()[1:]:
        if not ln.startswith('|'):
            if roster:
                break
            continue
        c = [x.strip() for x in ln.strip('|').split('|')]
        if len(c) >= 4 and c[0] and c[0] != '성함' and '---' not in c[0]:
            roster[c[0]] = c[1]
    for name, title in roster.items():
        # 직함을 적지 않은 응답자는 본문에서도 직함 없이 부른다.
        # 없는 직책을 지어내지 않으므로 이 검사의 대상이 아니다.
        if not re.search(r'[가-힣]', name) or not title or '미기재' in title:
            continue
        for m in re.finditer(re.escape(name), body):
            seg = body[max(0, m.start() - 24):m.end() + 14]
            if title not in seg:
                rn = table_no('전원이 실명') or 44
                out.append(f'{name} 을 부르는 자리의 직책이 표 {rn}("{title}")과 다르다 '
                           f'— …{seg.strip()[:44]}…')
                break
    return out


def links_live() -> list:
    """빌드된 문서의 주소가 눌리는가, 그리고 부호가 딸려 있지 않은가.

    앞 판은 하이퍼링크가 0개였다. 표지의 저장소·배포 주소가 맨 글자라
    심사자가 눌러도 아무 일이 없었다. 링크를 붙인 뒤에는 문장 끝
    마침표가 주소에 딸려 들어가 열리지 않는 것이 하나 있었다."""
    import zipfile
    out = []
    for name in ('SnapCare_H1_Final_Proposal_KO.docx', 'SnapCare_H1_Final_Proposal_EN.docx'):
        path = DOC / name
        if not path.exists():
            continue
        z = zipfile.ZipFile(path)
        rels = z.read('word/_rels/document.xml.rels').decode()
        ext = sorted(set(re.findall(r'Target="(https?://[^"]+)"', rels)))
        if not ext:
            out.append(f'{name}: 주소가 하나도 눌리지 않는다')
            continue
        for u in ext:
            if u[-1] in '.,;:':
                out.append(f'{name}: 주소 끝에 문장부호가 붙었다 — {u}')
        for must in ('github.com/16th-eicon-contest', 'snapcare.fly.dev'):
            if not any(must in u for u in ext):
                out.append(f'{name}: 표지의 {must} 가 링크가 아니다')
    return out


def contrast() -> list:
    """표 20 의 명도 대비가 계산과 같고, 그 색이 실제로 쓰이는가.

    눈으로 지킬 수 없는 값이라 표에 적어 두어도 색을 한 번 손대면
    조용히 어긋난다. 가장 낮은 것이 주의색의 4.52 이고 기준과의
    여유가 0.02 다. 한 단만 밝혀도 미달이 된다."""
    def lum(h):
        h = h.lstrip('#')
        c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

    def ratio(a, b):
        la, lb = lum(a), lum(b)
        hi, lo = max(la, lb), min(la, lb)
        return (hi + 0.05) / (lo + 0.05)

    out = []
    body = (DOC / 'proposal_ko.md').read_text()
    tno = table_no('명도 대비') or 19
    m = re.search(rf'\[표 {tno}\][^\n]*`(#[0-9A-Fa-f]{{6}})`[^\n]*?([\d.]+):1', body)
    bg = m.group(1) if m else '#F4F3EF'
    i = body.index(f'[표 {table_no("명도 대비") or 19}]')
    seen = 0
    for ln in body[i:].splitlines()[1:]:
        if not ln.startswith('|'):
            if seen:
                break
            continue
        c = [x.strip() for x in ln.strip('|').split('|')]
        if len(c) != 5 or not c[1].startswith('`#'):
            continue
        seen += 1
        for hexs, said in ((c[1], c[2]), (c[3], c[4])):
            col = hexs.strip('`')
            try:
                want = float(said.split(':')[0])
            except ValueError:
                continue
            got = ratio(col, bg)
            if abs(got - want) > 0.02:
                out.append(f'표 20 의 {c[0]} {col} 이 {said} 라는데 '
                           f'{bg} 위에서 {got:.2f}:1 이다')
        now = c[3].strip('`')
        if ratio(now, bg) < 4.5:
            out.append(f'표 20 의 {c[0]} {now} 이 기준 4.5:1 에 못 미친다 '
                       f'({ratio(now, bg):.2f})')
    if seen != 5:
        out.append(f'표 19 에서 색 행을 {seen}개만 읽었다')

    css = DOC.parent.parent / 'app/globals.css'
    if css.is_file():
        t = css.read_text()
        for name, want in (('--color-safe', 2), ('--color-caution', 3), ('--color-avoid', 4)):
            mm = re.search(rf'{name}:\s*(#[0-9A-Fa-f]{{6}})', t)
            if not mm:
                out.append(f'{name} 을 globals.css 에서 찾지 못했다')
            elif f'`{mm.group(1)}`' not in body and f'`{mm.group(1).upper()}`' not in body:
                out.append(f'{name} 이 {mm.group(1)} 인데 표 19 에 그 값이 없다')
    return out


def table_no(title_part: str, f: str = 'proposal_ko.md') -> int | None:
    """표를 번호가 아니라 제목으로 찾는다.

    표를 하나 끼워 넣으면 뒤의 번호가 전부 밀린다. 검사에 번호를 박아
    두면 그때마다 검사가 엉뚱한 표를 보게 되고, 실제로 표 21 을 넣었을
    때 응답자 명단·시험 수·직책 검사 셋이 한꺼번에 다른 표를 보았다."""
    for m in re.finditer(r'^\[표 (\d+)\](.*)$', (DOC / f).read_text(), re.M):
        if title_part in m.group(2):
            return int(m.group(1))
    return None


def affil_drift() -> list:
    """한 응답자의 소속이 문서 안에서 한 가지로 적혀 있는가.

    Foued Maaoui 의 소속이 "Pasteur Institute of Tunis" 와
    "파스퇴르연구소" 와 "Institut Pasteur de Tunis" 로 갈려 있었다.
    같은 사람이 세 기관에 있는 것처럼 보인다.

    표 42 의 소속을 정본으로 삼고, 본문이 그 사람을 부르면서 다른
    기관 이름을 붙였는지 본다. 이름 둘레 60자만 본다 — 문단 전체를
    보면 다른 응답자의 소속까지 걸린다."""
    out = []
    for f, roster_key in (('proposal_ko.md', '전원이 실명'),
                          ('proposal_en.md', 'The 39 respondents')):
        s = (DOC / f).read_text()
        mark = '### 5.11'
        if mark not in s:
            continue
        body = s[:s.index(mark)]
        i = s.find(f'[표 {table_no(roster_key) or 42}]')
        if i < 0:
            i = s.find('[Table 42]')
        if i < 0:
            continue
        roster = {}
        for ln in s[i:].splitlines()[1:]:
            if not ln.startswith('|'):
                if roster:
                    break
                continue
            c = [x.strip() for x in ln.strip('|').split('|')]
            if len(c) >= 4 and c[0] and c[0] not in ('성함', 'Name') \
                    and '---' not in c[0] and not c[0].startswith('**'):
                roster[c[0]] = c[2]
        # 소속 이름의 다른 판을 찾는다 — 같은 기관을 가리키는 낱말이
        # 본문에 있는데 표 42 의 표기와 다르면 잡는다.
        VARIANT = {
            'Pasteur Institute of Tunis': ('파스퇴르연구소', 'Institut Pasteur'),
        }
        for name, aff in roster.items():
            for canon, alts in VARIANT.items():
                if canon not in aff:
                    continue
                for alt in alts:
                    if alt in body:
                        out.append(f'{f}: {name} 의 소속이 표 42 에서는 '
                                   f'"{canon}" 인데 본문에 "{alt}" 가 있다')
    return out


# §5.9 는 항목을 "첫째" 부터 세어 나간다. 본문이 "§5.9 의 N째 항목"
# 이라고 가리킬 때 그 자리가 정말 그 내용인지 사람은 세어 보지 않는다.
ORDINAL = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째', '일곱째',
           '여덟째', '아홉째', '열째', '열한째', '열두째', '열셋째']


def item_refs() -> list:
    """"§5.9 의 N째 항목" 이 실제로 그 자리를 가리키는가.

    §1.5 가 시각장애를 "§5.9 의 여덟째 항목" 이라고 가리키고 있었는데
    여덟째는 지적장애였고 시각장애는 §5.9 에 아예 없었다. 없는 항목을
    번호로 가리키면 심사자가 그 자리를 열어 본다.

    번호가 있는지만 본다. 가리키는 문장의 낱말이 그 항목에 있는지까지
    보게 해 보았으나 정상 참조 둘이 걸리고 정작 틀린 것은 통과했다.
    낱말 겹침으로는 참조의 옳고 그름을 가릴 수 없다 — 앞서 같은 이유로
    지운 검사가 있다."""
    out = []
    s = (DOC / 'proposal_ko.md').read_text()
    if '### 5.9' not in s:
        return skip('미검증 항목 참조 검사 — §5.9 가 없다')
    nxt = re.search(r'^### 5\.1[0-9]', s[s.index('### 5.9'):], re.M)
    seg = s[s.index('### 5.9'):][:nxt.start() if nxt else None]
    have = [o for o in ORDINAL if re.search(rf'^{o},', seg, re.M)]
    for m in re.finditer(r'§5\.9 의 (\S+?)째 항목', s):
        word = m.group(1) + '째'
        if word not in have:
            out.append(f'§5.9 에 "{word}" 항목이 없다 — 지금 있는 것은 '
                       f'{have[0]}~{have[-1]} 까지 {len(have)}개다')
            continue
    # 번호가 끊기지 않았는가
    for i, o in enumerate(ORDINAL[:len(have)]):
        if o != have[i]:
            out.append(f'§5.9 의 항목 차례가 끊긴다 — {i + 1}번째가 "{have[i]}" 다')
            break
    return out


def doc_props() -> list:
    """제출 파일의 속성에 남의 이름이나 낡은 통계가 없는가.

    서식을 열어 채우는 방식이라 속성이 서식의 것을 물려받는다.
    작성자가 Admin, 마지막 수정자가 서식을 만든 분의 이름이었고
    통계는 "2쪽 249낱말" 이었다. 실제는 130쪽 42,883낱말이다.
    심사자가 파일 속성을 열면 그것을 본다."""
    import zipfile
    out = []
    for name in ('SnapCare_H1_Final_Proposal_KO.docx',
                 'SnapCare_H1_Final_Proposal_EN.docx'):
        path = DOC / name
        if not path.exists():
            continue
        z = zipfile.ZipFile(path)
        app = z.read('docProps/app.xml').decode('utf-8', 'ignore')
        core = z.read('docProps/core.xml').decode('utf-8', 'ignore')
        stale = re.findall(r'<(Pages|Words|Characters|Lines|Paragraphs)>', app)
        if stale:
            out.append(f'{name}: 속성에 낡은 통계가 남았다 — {sorted(set(stale))}')
        for who in re.findall(r'<(?:dc:creator|cp:lastModifiedBy)>([^<]*)<', core):
            if 'SnapCare' not in who:
                out.append(f'{name}: 속성의 이름이 우리 것이 아니다 — "{who}"')
    return out


def built_order() -> list:
    """빌드된 문서에서 설명이 제자리에 오는가.

    원고를 고쳐도 빌드가 차례를 바꿀 수 있으므로 결과물에서 다시 본다.
    학술 관례대로 그림 설명은 그림 바로 뒤, 표 설명은 표 바로 앞이다."""
    try:
        import docx
    except ImportError:
        return skip('빌드된 문서 검사 — python-docx 가 없다')
    from docx.oxml.ns import qn
    out = []
    for name, fw, tw in (('SnapCare_H1_Final_Proposal_KO.docx', '그림', '표'),
                         ('SnapCare_H1_Final_Proposal_EN.docx', 'Figure', 'Table')):
        path = DOC / name
        if not path.exists():
            continue
        d = docx.Document(path)
        seq = []
        for el in d.element.body.iter():
            t = el.tag.split('}')[1]
            if t == 'tbl':
                seq.append(('TBL', None))
                continue
            if t != 'p':
                continue
            if el.findall('.//' + qn('wp:extent')):
                seq.append(('IMG', None))
            txt = ''.join(n.text or '' for n in el.iter(qn('w:t'))).strip()
            m = re.match(rf'^\[{fw} (\d+)\]', txt)
            if m:
                seq.append(('FCAP', int(m.group(1))))
            m = re.match(rf'^\[{tw} (\d+)\]', txt)
            if m:
                seq.append(('TCAP', int(m.group(1))))
        for i, (k, v) in enumerate(seq):
            if k == 'FCAP':
                prev = seq[i - 1] if i else None
                if not prev or prev[0] != 'IMG':
                    out.append(f'{name}: {fw} {v} 의 설명 앞이 그림이 아니다')
            elif k == 'TCAP':
                nxt = seq[i + 1] if i + 1 < len(seq) else None
                if not nxt or nxt[0] != 'TBL':
                    out.append(f'{name}: {tw} {v} 의 설명 뒤가 표가 아니다')
    return out


def len_ratio() -> list:
    """문단마다 영어/한글 글자 수 비율이 정상 범위에 있는가.

    문단 수가 맞아도 안이 다를 수 있다. 한쪽에만 문장이 들어가거나
    빠지면 길이가 눈에 띄게 어긋난다. 지금 중앙값이 2.1 이고, 낮은
    쪽은 문단의 대부분이 서지 정보라 두 판이 같은 글자를 쓰는 경우,
    높은 쪽은 영어가 기관 이름이나 법령 이름을 풀어 쓰는 경우다.

    실제로 이 재기가 §5.8 에서 인용 둘이 그림 설명 안에 들어가 있던
    것과 §5.5 에서 한 문장이 한글판에만 없던 것을 찾아냈다."""
    import statistics
    def secs(f):
        out, cur, buf, fence = {}, None, [], False
        for ln in (DOC / f).read_text().splitlines():
            if ln.strip().startswith('```'):
                fence = not fence
                continue
            if fence:
                continue
            m = re.match(r'^#{2,4}\s*(\d+\.\d+(?:\.\d+)?)', ln)
            if m:
                if cur:
                    out[cur] = buf
                cur, buf = m.group(1), []
            elif cur is not None and ln.strip():
                buf.append(ln.strip())
        if cur:
            out[cur] = buf
        return out
    ko, en = secs('proposal_ko.md'), secs('proposal_en.md')
    rows = []
    for k in set(ko) & set(en):
        if len(ko[k]) != len(en[k]):
            continue                      # 문단 수는 para_parity 가 본다
        for i, (x, y) in enumerate(zip(ko[k], en[k])):
            if x.startswith(('|', '!', '>', '**[')) or x == y or len(x) < 70:
                continue
            rows.append((len(y) / len(x), k, i, x[:44]))
    if len(rows) < 30:
        return skip('문단 길이 비 검사 — 견줄 문단이 서른에 못 미친다')
    med = statistics.median(r[0] for r in rows)
    # 문턱은 실제로 찾았던 값에 맞춘다. §5.8 의 빠진 인용이 0.05,
    # §5.5 의 빠진 문장이 4.43 이었다. 반대로 3.2~3.4 는 정상이다 —
    # 한국어가 압축적이거나, 한국어 낱말을 영어 독자에게 풀어 준
    # 문장처럼 일부러 한쪽에만 둔 것이 있다.
    out = [f'§{k}[{i}] 의 길이 비율이 {v:.2f} 다 (중앙값 {med:.2f}) — {x}'
           for v, k, i, x in rows if v < med * 0.5 or v > med * 1.9]
    return out[:8]


def en_figures() -> list:
    """영어판 문서가 실제로 영어 도판을 담고 있는가.

    원고는 두 판 모두 `fig/` 를 가리키고, 영어 빌드가 같은 이름이
    `fig_en/` 에 있으면 그것으로 바꿔 넣는다. 바꿔치기가 조용히
    깨지면 원고만 보아서는 알 수 없고, 심사자는 한국어가 적힌
    도표를 보게 된다. 결과물의 그림을 해시로 견딘다."""
    import hashlib
    import zipfile
    path = DOC / 'SnapCare_H1_Final_Proposal_EN.docx'
    if not path.exists() or not (DOC / 'fig_en').is_dir():
        return skip('영어판 도판 대조 — 빌드된 영어 문서나 fig_en 이 없다')
    md5 = lambda b: hashlib.md5(b).hexdigest()
    ko = {q.name: md5(q.read_bytes()) for q in (DOC / 'fig').glob('*.png')}
    en = {q.name: md5(q.read_bytes()) for q in (DOC / 'fig_en').glob('*.png')}
    z = zipfile.ZipFile(path)
    inside = {md5(z.read(n)) for n in z.namelist() if n.startswith('word/media/')}
    differ = [k for k in en if k in ko and ko[k] != en[k]]
    wrong = [k for k in differ if ko[k] in inside and en[k] not in inside]
    if wrong:
        return [f'영어판 문서가 한글 도판을 담고 있다 — {len(wrong)}장 '
                f'({", ".join(sorted(wrong)[:3])} …)']
    missing = [k for k in differ if en[k] not in inside]
    if missing:
        return [f'영어판 문서에 영어 도판이 들어가지 않은 것 {len(missing)}장 '
                f'({", ".join(sorted(missing)[:3])} …)']
    return []


def blocks(path: Path) -> dict:
    """소제목마다 그 아래 문단 수를 센다. 한 판에만 문단이 빠지면 여기서 걸린다.

    코드 울타리 안은 세지 않는다. 같은 코드라도 영어 주석이 길어 두 줄로
    접히므로 언제나 벌어지고, 그것은 결함이 아니다."""
    cur, out, fence = None, {}, False
    for ln in path.read_text().splitlines():
        if ln.strip().startswith('```'):
            fence = not fence
            continue
        if fence:
            continue
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

    for t in roster_count():
        note(t)

    for t in fold_claims():
        note(t)

    for t in table_parity():
        note(t)

    for t in para_parity():
        note(t)

    for t in caption_place():
        note(t)

    for t in bonferroni():
        note(t)

    for t in code_drift():
        note(t)

    for t in morpheme_names():
        note(t)

    for t in sheet_scores():
        note(t)

    for t in cite_shape():
        note(t)

    for t in test_counts():
        note(t)

    for t in spelling():
        note(t)

    for t in title_drift():
        note(t)

    for t in affil_drift():
        note(t)

    for t in item_refs():
        note(t)

    for t in doc_props():
        note(t)

    for t in built_order():
        note(t)

    for t in len_ratio():
        note(t)

    for t in en_figures():
        note(t)

    for t in links_live():
        note(t)

    for t in contrast():
        note(t)

    for f in ('proposal_ko.md', 'proposal_en.md'):
        for t in quote_drift(f):
            note(f'{f}: 인용이 부록 원문과 다르다 — "{t}…"')

    for t in model_table():
        note(t)

    for t in reference_table():
        note(t)

    for t in voca_verbs():
        note(t)

    for t in dsl_parses():
        note(t)

    for t in engine_facts():
        note(t)

    for t in affil_invent():
        note(t)

    for t in built_fresh():
        note(t)

    for t in toc_built():
        note(t)

    for t in toc_drift():
        note(t)

    for t in dash_aside():
        note(t)

    for t in pct_parity():
        note(t)

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

    if SKIPPED:
        print()
        for why in SKIPPED:
            print(f'   건너뜀 · {why}')
    print('\n' + ('모든 검사 통과' if not fail else f'{len(fail)}건 걸렸다')
          + (f' · 건너뛴 검사 {len(SKIPPED)}개' if SKIPPED else ''))
    return 1 if fail else 0


if __name__ == '__main__':
    sys.exit(main())

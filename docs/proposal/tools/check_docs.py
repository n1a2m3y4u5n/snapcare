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
"""
import re
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

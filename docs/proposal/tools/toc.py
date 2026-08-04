"""목차를 만들어 요약 뒤에 넣는다. 두 판 모두.

본문이 139쪽, 부록까지 162쪽인데 길잡이가 없다. 장 여섯과 절 마흔여덟을
그대로 늘어놓은 문서라, 심사자가 무엇이 어디 있는지 알 방법이 표지와
본문을 훑는 것뿐이다.

쪽 번호는 넣지 않는다. 마크다운에서 쪽을 셀 수 없고, 워드의 자동 목차
필드는 심사자가 문서를 열어 갱신해야 값이 채워진다. 갱신하지 않으면
"오류! 책갈피가 정의되어 있지 않습니다" 가 인쇄된다. 없는 것보다 나쁘다.
절 번호만으로도 찾아가는 데 부족하지 않다.

제목에서 만들어 내므로 절이 늘거나 이름이 바뀌면 다시 돌리면 된다.
어긋나면 check_docs 가 잡는다.
"""
import pathlib, re

D = pathlib.Path(__file__).resolve().parent.parent

HEAD = {'proposal_ko.md': '## □ 목차', 'proposal_en.md': '## □ Contents'}
LEAD = {
    'proposal_ko.md': '쪽 번호를 적지 않았다. 절 번호로 찾는다.',
    'proposal_en.md': 'No page numbers are given; sections are found by their number.',
}


def toc(name: str) -> str:
    s = (D / name).read_text()
    out = []
    for ln in s.splitlines():
        m = re.match(r'^## □ (.+)$', ln)
        if m:
            t = m.group(1).strip()
            if t in ('Summary of Web App', '목차', 'Contents'):
                continue
            out.append(f'\n**{t}**\n')
            continue
        m = re.match(r'^### (\d+\.\d+) (.+)$', ln)
        if m:
            out.append(f'  {m.group(1)}  {m.group(2).strip()}')
    return '\n'.join(out).strip()


for f in ('proposal_ko.md', 'proposal_en.md'):
    p = D / f
    s = p.read_text()
    # 이미 있으면 갈아 끼운다
    if HEAD[f] in s:
        i = s.index(HEAD[f])
        j = s.index('\n---\n', i)
        s = re.sub(r'\n{3,}', '\n\n', s[:i] + s[j + 5:])
    body = f'{HEAD[f]}\n\n{LEAD[f]}\n\n{toc(f)}\n\n---\n'
    a = '\n---\n\n## □ Problem Statement and Background'
    assert s.count(a) == 1, f
    s = s.replace(a, '\n---\n\n' + body + '\n## □ Problem Statement and Background', 1)
    p.write_text(s)
    n = len(re.findall(r'^  \d+\.\d+ ', toc(f), re.M))
    print(f'{f} · 목차 {n}줄')

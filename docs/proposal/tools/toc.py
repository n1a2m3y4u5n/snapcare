"""목차를 제목에서 만들어 문서에 넣는다. 두 판 모두.

본문이 139쪽, 부록까지 162쪽인데 길잡이가 없었다. 장 여섯과 절 마흔여덟을
그대로 늘어놓은 문서라, 심사자가 무엇이 어디 있는지 알 방법이 표지와
본문을 훑는 것뿐이었다.

두는 자리
---------
서식이 받는 칸이 여섯뿐이라(`build_docx.py` 의 SLOTS) 목차를 따로 된
장으로 둘 수 없다. `## □ 목차` 로 넣었더니 빌더가 "템플릿에 없는 절" 로
멈췄고, 그때 빌드 출력을 버리고 있어서 아무도 보지 못한 채 docx 는 예전
것이 남아 있었다. 그래서 문제 정의 칸의 맨 앞에 넣는다. 읽는 순서로는
요약 바로 뒤가 되므로 자리는 어긋나지 않는다.

쪽 번호
-------
넣지 않는다. 마크다운에서 쪽을 셀 수 없고, 워드의 자동 목차 필드는
심사자가 문서를 열어 갱신해야 값이 채워진다. 갱신하지 않으면 "오류!
책갈피가 정의되어 있지 않습니다" 가 인쇄되므로 없는 것보다 나쁘다.

    python3 docs/proposal/tools/toc.py

절이 늘거나 이름이 바뀌면 다시 돌린다. 어긋난 채로 두면 `check_docs.py`
의 `toc_drift` 가 잡고, 빌드가 실패해 docx 에 안 들어갔으면 `toc_built`
가 잡는다.
"""
import pathlib
import re

D = pathlib.Path(__file__).resolve().parent.parent

HEAD = {'proposal_ko.md': '**목차**', 'proposal_en.md': '**Contents**'}
LEAD = {
    'proposal_ko.md': '쪽 번호를 적지 않았다. 절 번호로 찾는다.',
    'proposal_en.md': 'No page numbers are given; sections are found by their number.',
}
CHAPTER = '## □ Problem Statement and Background\n'


def toc(name: str) -> str:
    """제목만 읽어 목차 줄을 만든다."""
    out = []
    for ln in (D / name).read_text().splitlines():
        m = re.match(r'^## □ (.+)$', ln)
        if m and not m.group(1).startswith('Summary'):
            out.append(f'\n**{m.group(1).strip()}**\n')
            continue
        m = re.match(r'^### (\d+\.\d+) (.+)$', ln)
        if m:
            out.append(f'  {m.group(1)}  {m.group(2).strip()}')
    return '\n'.join(out).strip()


def main() -> None:
    for f in ('proposal_ko.md', 'proposal_en.md'):
        p = D / f
        s = p.read_text()
        # 옛 판이 장으로 두었던 것을 걷는다.
        for old in ('## □ 목차', '## □ Contents'):
            if old in s:
                i = s.index(old)
                j = s.index('\n---\n', i) + 5
                s = re.sub(r'\n{3,}', '\n\n', s[:i] + s[j:].lstrip('\n'))
        # 이미 있으면 갈아 끼운다.
        if '<!-- toc -->' in s:
            i = s.index('<!-- toc -->')
            j = s.index('<!-- /toc -->', i) + len('<!-- /toc -->')
            s = re.sub(r'\n{3,}', '\n\n', s[:i] + s[j:].lstrip('\n'))
        body = f'<!-- toc -->\n\n{HEAD[f]}\n\n{LEAD[f]}\n\n{toc(f)}\n\n<!-- /toc -->'
        assert s.count(CHAPTER) == 1, f
        p.write_text(s.replace(CHAPTER, CHAPTER + '\n' + body + '\n', 1))
        n = len(re.findall(r'^  \d+\.\d+  ', body, re.M))
        print(f'{f} · 목차 {n}줄')


if __name__ == '__main__':
    main()

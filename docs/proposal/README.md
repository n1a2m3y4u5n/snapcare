# Final proposal

`proposal_ko.md` 가 본문이고 `proposal_en.md` 가 영어판이다. 두 판은 절과 문단이
일대일로 맞아야 하며 `tools/check_docs.py` 가 그것을 본다. `refs.md` 는 수집 단계의
메모이고, 인용을 원문과 대조한 결과는 `citations.md` 에 있다. 둘이 어긋나면
`citations.md` 가 맞다.

본문의 그림 경로는 `fig/` 상대경로이므로 두 폴더를 함께 옮겨야 그림이 붙어 온다.
영어판은 `fig_en/` 을 먼저 보고 없으면 `fig/` 로 떨어진다.

지금 상태는 그림 46장, 표 47개, 절 73개다.

## 제출본

`SnapCare_H1_Final_Proposal_KO.docx` 와 `_EN.docx` 가 제출 형식이다. 마크다운을
손으로 옮긴 것이 아니라 `tools/build_docx.py` 가 만들어 낸다. 본문을 고쳤으면 다시
돌리면 되고, 두 파일이 어긋날 일이 없다.

```bash
python3 docs/proposal/tools/build_docx.py
SNAPCARE_LANG=en python3 docs/proposal/tools/build_docx.py --src proposal_en.md
```

공식 서식 `template.docx` 의 빈 칸을 채우는 방식이다. 표지·안내문·쪽 설정이 심사
서식 그 자체라 새로 그리지 않는다. 서식이 개정되면 `template.docx` 만 바꾸면 된다.

## 검사

고치고 나면 이것부터 돌린다. 이 문서에서 찾은 결함을 대부분 여기에 넣어 두었다.

```bash
python3 docs/proposal/tools/check_docs.py
```

스무 가지 남짓을 본다. 두 판의 절·문단·표 행 수가 같은가, 본문이 인용한 코드가
저장소 파일과 같은가, 인용이 부록 원문과 글자까지 같은가, 형태소 이름이 사전에
있는가, 표 28 의 시험 수가 실제로 돌린 결과와 같은가, 그림 33 의 채움 점수가 파서가
내는 값과 같은가 따위다. 마지막 둘은 실제로 시험과 파서를 돌리므로 40초쯤 걸린다.
문서만 손볼 때는 `SNAPCARE_SKIP_TESTS=1` 로 끌 수 있고, 시험을 세려면 저장소에
`node_modules` 가 있어야 한다.

도판 안에서 글자가 상자를 넘거나 겹치는지는 따로 본다.

```bash
python3 docs/proposal/tools/check_figs.py
```

§4.4 가 주장하는 접근성 값도 따로 잰다. 화면 열셋을 375픽셀에서 열어 표적 크기·
이름 없는 조작·가로 스크롤·소리에 닿는 자리를 센다. SC 2.5.8 의 간격 예외까지
따지므로 작은 표적이 나와도 충족 여부를 함께 알려 준다.

```bash
SNAPCARE_BASE=https://snapcare.fly.dev node docs/proposal/tools/check_a11y.mjs
```

## 도판

파일 이름의 숫자는 만든 순서이고 본문의 그림 번호와 다르다. 본문이 어떤 파일을
쓰는지는 `proposal_ko.md` 의 `![그림 N](fig/…)` 줄이 정본이다.

| 만드는 것 | 도구 | 무엇에서 유도되는가 |
|---|---|---|
| 상자·흐름 도판 | `tools/diagrams.py` | 손으로 배치. 학술 도판 관례를 따른다 |
| 통계 그래프 | `tools/charts.py` | 본문이 인용한 값과 측정 결과 |
| 형태소 78종 시트 | `tools/fig02.py` | `engine/assets/` 를 그대로 읽는다 |
| 디스펜서 결선도·콘솔 | `tools/fig10.py` | 펌웨어를 노트북에서 띄워 촬영 |
| 종이 서식 판독 | `tools/fig15.py` | 합성 사진을 실제 파서에 넣은 결과 |
| 앱 화면 캡처 | `tools/shots.mjs` | 돌고 있는 앱 |
| 화면 캡처 묶음 | `tools/panels.py` | 위 캡처를 (a)(b)(c) 로 묶는다 |
| 부록 §5.11·5.12 | `tools/survey_appendix.py` | 설문 원자료 xlsx |
| 설문 통계 | `tools/survey_stats.py` | 같은 xlsx. 검정 횟수도 코드가 센다 |

`fig/parts/` 는 도판 조립에 쓰는 중간 재료다. 최종 도판이 아니므로 본문에서 직접
참조하지 않는다.

## 다시 만들기

코드와 자산에서 유도되는 도판은 형태소를 바꾸거나 파서를 고치면 다시 돌려야 한다.

```bash
python3 docs/proposal/tools/diagrams.py
python3 docs/proposal/tools/charts.py
python3 docs/proposal/tools/fig02.py
python3 docs/proposal/tools/fig10.py
python3 docs/proposal/tools/fig15.py
python3 docs/proposal/tools/panels.py
```

영어판 도판은 같은 명령에 `SNAPCARE_LANG=en` 을 붙인다. 글자가 없는 도판은 만들지
않고 `fig/` 를 그대로 쓴다.

앱 화면은 배포본을 상대로 찍는다. 심사자가 여는 것과 같은 화면이 문서에 들어간다.

```bash
SNAPCARE_BASE=https://snapcare.fly.dev node docs/proposal/tools/shots.mjs
```

개발 서버를 상대로 찍으려면 `SNAPCARE_BASE` 를 빼고 3000 번에 띄워 두면 된다.
`shots.mjs` 는 시간을 기다리지 않고 **화면에 특정 문구가 나타나기를** 기다린다.
OCR 이 웹 워커에서 도는데 Chrome 의 `--virtual-time-budget` 이 그 진행을 기다려
주지 않아, 예전 방식으로는 "Reading text… 0%" 상태가 찍혔다. 없는 목소리 표시도
같은 이유로 표시 자체가 나타날 때까지 기다린다.

전폭으로 실리는 캡처에는 스크롤하면 접히는 자리를 붉은 선으로 긋고 그 아래를 옅게
덮는다. `fullPage` 로 찍으므로 그러지 않으면 독자가 이 전부를 한눈에 본다고 읽는다.

그림 10 의 콘솔 부분은 펌웨어를 노트북에서 띄워 찍은 것이다. 서보 드라이버만
기록용으로 바뀌고 API·스케줄러·저장은 기기에서 도는 것과 같은 코드다.

```bash
cd pill_dispenser/firmware && make run     # 8099 번
```

## 제출 전에 확인할 것

  · 표지의 Github 주소가 익명으로 열리는가. 2026-08-03 기준 비공개라 404 다.
    심사자가 조직 구성원으로 들어오는 것이 전제라면 그대로 두어도 되고, 아니라면
    공개로 바꾸어야 한다. 저장소를 공개하는 일이므로 사람이 정할 일이다
  · 배포본이 origin/main 과 같은가. 어긋나면 문서가 인용한 코드와 심사자가 보는
    것이 달라진다. 2026-08-03 기준 배포본의 `sw.js` 가 한 줄 앞서 있다
  · `check_docs.py`·`check_figs.py`·`check_a11y.mjs` 가 모두 통과하는가
  · 표 31 의 시험 수를 마지막으로 다시 세었는가. 앱 쪽 작업이 이어지는
    동안 이 수는 하루에도 여러 번 바뀐다. 2026-08-04 하루에만 360→569→576
    으로 움직였다. `check_docs.py` 가 세 갈래를 실제로 돌려 비교하므로
    통과했다면 맞는 것이고, 다만 `node_modules` 가 있어야 한다
  · 캡처가 배포본과 같은가. 화면이 바뀌면 `check_docs.py` 가 알리지만,
    배포가 origin/main 보다 뒤처져 있으면 알리지 못한다

## 설문 원자료

`survey_stats.py` 와 `survey_appendix.py` 는 설문 원자료 xlsx 에서 만든다. 2026-08-03
기준 그 파일이 든 폴더(`~/Desktop/Claude/snapcare-survey`)가 기기에서 사라졌고, 두 도구는
파일이 없으면 무엇이 없는지 알리고 멈춘다.

문서를 고치는 데는 지장이 없다. 부록 §5.11 과 §5.12 에 자유 서술 124건과 선택형 응답
전수가 이미 실려 있으므로 그것이 기록이다. `check_docs.py` 의 명단 검사도 원자료가 없으면
부록으로 떨어져, 부록에 답이 실린 사람이 표 42 에 다 있는지를 본다.

응답이 더 들어와 부록을 다시 만들어야 할 때만 원자료가 필요하다. 그때는 파일을 되찾아
같은 경로에 두면 된다.

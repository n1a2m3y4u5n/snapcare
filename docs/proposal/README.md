# Final proposal

`proposal_ko.md` 가 본문이고, `refs.md` 는 그 근거로 쓴 통계·선행연구 121건이다.
본문의 그림 경로는 `fig/` 상대경로이므로 두 폴더를 함께 옮겨야 그림이 붙어 온다.

## 도판

그림 1–14. 파일 이름의 숫자가 본문의 그림 번호와 같다.

| 그림 | 파일 | 만든 방법 |
|---|---|---|
| 1, 4–9, 12, 13 | `fig/fig0*.png`, `fig12`, `fig13` | 실행 중인 앱을 `tools/shots.mjs` 로 촬영 |
| 2 | `fig02_sigil_sheet.png` | `tools/fig02.py` — `engine/assets/` 를 그대로 읽는다 |
| 3 | `fig03_dsl.png` | 엔진에 DSL 네 줄을 통과시킨 결과 |
| 10 | `fig10_dispenser.png` | `tools/fig10.py` — 결선도 + 펌웨어 콘솔 캡처 |
| 11 | `fig11_userflow.png` | 흐름도 |
| 14 | `fig14_formsheet.png` | `tools/fig15.py` — 합성 사진을 실제 파서에 넣은 결과 |

`fig/parts/` 는 도판 조립에 쓰는 중간 재료다. 최종 도판이 아니므로 본문에서 직접
참조하지 않는다.

## 다시 만들기

도판 2·10·14 는 코드와 자산에서 유도되므로, 형태소를 바꾸거나 파서를 고치면
다시 돌려야 한다. Pillow 가 있는 python 이면 된다.

```bash
python3 docs/proposal/tools/fig02.py    # 형태소 78종 시트
python3 docs/proposal/tools/fig10.py    # 디스펜서 결선도 + 콘솔
python3 docs/proposal/tools/fig15.py    # 종이 서식 판독 (.venv-cv 필요)
```

앱 화면(1, 4–9, 12, 13)은 개발 서버가 3000 번에 떠 있어야 한다.

```bash
npm run dev
node docs/proposal/tools/shots.mjs
```

`shots.mjs` 는 시간을 기다리지 않고 **화면에 특정 문구가 나타나기를** 기다린다.
OCR 이 웹 워커에서 도는데 Chrome 의 `--virtual-time-budget` 이 그 진행을 기다려
주지 않아, 예전 방식으로는 "Reading text… 0%" 상태가 찍혔다.

그림 10 의 콘솔 부분은 펌웨어를 노트북에서 띄워 찍은 것이다. 서보 드라이버만
기록용으로 바뀌고 API·스케줄러·저장은 기기에서 도는 것과 같은 코드다.

```bash
cd pill_dispenser/rpi_firmware && make run     # 8099 번
```

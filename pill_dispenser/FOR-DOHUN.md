# 도훈이에게 — 기기 쪽에서 찾은 것들

웹을 기기에 붙이면서 나온 것을 모았다. 앞의 셋은 **내가 이미 고쳐서 올렸고**, 뒤의
셋은 네 판단이 필요하거나 네 영역이라 손대지 않았다.

날짜: 2026-08-03. 확인한 방법은 각 항목에 적었다.

---

## 이미 고쳐 올린 것 (확인만 해 주면 된다)

### 1. `display/glyphs.py` 상수 여덟이 사라졌다 — 시험 전체가 안 돌고 있었다

`631e92e` 에서 `BARRED CROSS CUP PRESS SLASH SLASH_MASK TICK WARN` 이 빠졌다. 이름이
바뀐 게 아니라 정의만 없어졌고, `screens.py` 는 그대로 부른다(538·611·854·1003줄).
모듈을 임포트하는 순간 `AttributeError` 라, 시험 파일이 전부 그 모듈을 타므로 —

> **펌웨어 시험 663개가 한 개도 실행되지 않았다.** 함께 올라온 `test_durability.py`
> 847줄도 포함해서다.

`1354de8` 의 정의를 글자 그대로 되돌렸다(ASCII 주석까지 — `as_art` 가 주석과 숫자를
맞춰 보기 때문). 되살리고 나서 **626 통과 / 35 실패**가 됐다. 그 35 는 아래 6번.

혹시 의도적으로 지우고 다른 것으로 갈아 끼우는 중이었다면 내 복원을 되돌리고 그쪽으로
가면 된다. 다만 그때도 `screens.py` 의 네 호출부를 같이 고쳐야 한다.

### 2. 시계가 신뢰돼도 앱에 5분 늦게 도착했다

`nudge()` 가 배출(`on_event`)과 일정 변경(`on_change`)에만 걸려 있었다. 그런데 앱
화면에서 가장 무거운 불리언이 `clock.trusted` 다 — 거짓인 동안 상태판이 "시계를 모르니
아무것도 나오지 않습니다" 라고 말한다.

폰이 시각을 넣어 준 뒤에도 그 문장이 최대 `CLOUD_HEARTBEAT_S`(300초) 남아 있었다.
그 화면을 보는 사람은 고쳐진 시계와 고장난 시계를 구별할 방법이 없고, 떠오르는 다음
수 — 다시 넣어 본다 — 는 아무것도 바꾸지 않는다.

`daemon.py` 의 신뢰 전환 지점에서 `cloud.nudge()` 를 부르게 했다. 클라우드 릴레이로
실측해서 **8.5초**. 신뢰를 **잃는** 방향도 로그에 남기게 했다 — 트레이가 갑자기 안
열리는데 로그가 조용한 상황이 되지 않도록.

### 3. `LogIndicator` 에 `refresh` 가 없어 매 초 예외가 났다

`daemon._show()` 가 부르는 `indicator.refresh(health)` 가 화면 달린 구현에만 있었다.
기본 `Indicator` 프로토콜에 없으니 노트북·시험·**링과 부저만 단 기기**는 전부 초당
`AttributeError` 다. 호출이 `try` 안에 있어 아무것도 깨지지 않았고, 그래서 잃은 것은
로그다 — 1초마다 스택 추적이 쌓이면 정작 트레이가 왜 안 열렸는지 적힌 줄이 묻힌다.

기본 클래스에 무동작 `refresh` 를 뒀다.

---

## 네가 봐야 하는 것

### 4. 웹 키트가 노드에서 임포트되지 않는다 (`webapp_kit`)

`make -C pill_dispenser/webapp_kit test` 가 **네 쪽에서도 실패한다.** 원인은 타입스크립트
파라미터 프로퍼티(`constructor(private readonly x: T)`)인데, 노드의 타입 제거
(`--experimental-strip-types`)가 이 문법을 지원하지 않는다 — `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`.

즉 **골든 벡터 시험이 한 번도 돌아본 적이 없다.** 우리 쪽 사본(`lib/dispenser/`)은
생성자 셋을 평범한 대입으로 바꿔서 돌아간다. 원본도 같은 방식이면 될 것 같다.

### 5. `vectors.json` 의 `at` 에 시간대가 없다

펌웨어는 `datetime.astimezone().isoformat()` 으로 시간대를 붙여 보내는데(`cloud.py`),
골든 벡터의 `at` 에는 없다. 그래서 그 벡터로 `isStale` 을 재면 펌웨어가 실제로 보내는
값과 다른 답이 나온다 — 네 시험 하나가 `isStale` 구현과 서로 모순된 상태였다.

우리 사본은 시험 쪽을 고치고, "시간대 없는 시각은 낡은 것으로 본다" 는 시험을 하나
더 붙였다. 벡터를 고치는 게 맞는지는 네가 정해야 할 것 같다.

### 6. `loses_detail()` 이 실린 일정과 무관하게 붙는다

`device.py:639` 가 `status.notes` 에 `sc1.loses_detail(slots)` 를 **조건 없이** 넣는다.
그런데 그 함수가 답하는 질문은 "이 일정을 `SC1*S*` 로 보냈다면 무엇을 잃었겠는가" 지
"지금 실린 일정이 무엇을 잃었는가" 가 아니다. 네 독스트링에도 보내기 전에 확인하라고
적혀 있다.

무손실 `SC1*W*` 로 보낸 월·수·금 7일 처방에 이런 경고가 붙어서 앱 화면에 떴다:

```
⚠ SC1*S* cannot carry days of the week, so these trays would drop every day: tray 2
⚠ SC1*S* cannot carry a duration, so a course with an end date would run until the tray is empty
```

**일어나지 않은 손실을 알리는 경고**이고, 글을 못 읽는 사용자는 확인할 방법도 없다.
앱 쪽은 실린 payload 가 `SC1*S*` 일 때만 보여주도록 막아 뒀다(`DispenserPanel.tsx`).
펌웨어 쪽도 같이 고치는 게 맞다고 본다.

### 7. OLED 화면 시험 32건이 실패한다 — 이건 손대지 않았다

1번을 되살려 시험이 돌기 시작하면서 드러났다. 명세 없이 네 상태 기계를 짐작해 고치면
네 다음 푸시와 부딪힐 것 같아 그대로 뒀다.

| 파일 | 실패 | 대표 증상 |
|---|---:|---|
| `test_presence.py` | 15 | `Presence` 가 `'due'`·`'network'` 자리에서 `'boot'` 를 돌려준다 |
| `test_hardware.py` | 12 | |
| `test_shapes.py` | 2 | 팔각형이 반지름 6에서 원과 구별되지 않는다 |
| `test_display.py` | 2 | `Plan` 에 `brightness` 속성이 없다 |
| `test_selftest.py` | 1 | 실행 보고를 다시 읽어들이지 못한다 |

(별도로 `test_server.py` 2건과 `test_sc1.py` 1건은 내 개발 기계에 `qrcode`·`cv2` 가
없어서다. 네 쪽에서는 통과할 것이다.)

```bash
cd pill_dispenser/firmware && python -m pytest tests -q
```

### 8. 터치가 죽어 있던 이유. 배선은 멀쩡했고 소프트웨어가 세 군데 틀렸다

**고쳐서 올렸다. 지금 실물에서 유리를 누르면 약이 나온다.** 다만 왜 그렇게 오래
죽어 있었는지는 알아둘 값어치가 있다. 세 가지가 겹쳐 있었고, 각각이 혼자서도 증상을
만든다.

배선은 처음부터 맞았다. 패널은 정전식 **FT6236, `0x38`, `i2c-1`** 이다.

**(1) `probe_bus()` 가 CTP_RST 를 풀지 않고 훑었다.** FT6236 은 리셋에 잠겨 있으면
주소에 응답하지 않는다. 그래서 `--touch-setup` 은 "Nothing answered", `i2cdetect` 는
두 버스 다 텅 빈 화면, CTP_INT 는 15초를 눌러도 미동도 없음. 셋 다 사실이었고 셋 다
같은 한 가지였다. 이 기계에서 GPIO 12 를 올린 것이 아무도 없었기 때문이다. 손으로
HIGH 를 주자 `0x38` 이 즉시 대답했다. 지금은 훑기 전에 리셋을 풀고, 못 풀었으면
"아무것도 확인되지 않았다" 고 따로 말한다.

**(2) `dtoverlay=edt-ft5406` 이 버스를 안 적어서 엉뚱한 데 붙었다.** 그 오버레이는
공식 7인치 DSI 화면용이라 기본값이 카메라·디스플레이 커넥터의 `i2c_csi_dsi` 다.
드라이버는 멀쩡히 올라와서 없는 버스를 뒤지고 죽었다.

```
edt_ft5x06 10-0038: touchscreen probe failed
edt_ft5x06 10-0038: probe with driver edt_ft5x06 failed with error -5
```

`10-` 이 단서였다. 이 모듈은 `i2c-1`(GPIO 2·3)에 있다. 이제 `TOUCH_I2C_BUS` 에서
번호를 뽑아 `,i2c1` 을 붙여 쓴다. 겸사겸사, 같은 오버레이의 묵은 줄이 남아 있으면
덧붙이지 않고 갈아끼운다. `dtoverlay` 는 찾는 대로 전부 로드되므로, 매개변수만 다른
줄 둘이 있으면 실패한 쪽 메시지가 `dmesg` 에 남아 고친 파일이 안 고친 것처럼 보인다.

**(3) `find_touch_device()` 가 이름으로 찾고 있었다.** `edt_ft5x06` 은 칩에게 모델
문자열을 물어서 그대로 입력 장치 이름에 쓴다. 이 패널은 이렇게 온다.

```
1-0038 EP0110M09
```

`_TOUCH_NAMES` 어디에도 안 걸린다. 드라이버가 제대로 붙었는데 데몬은 "no touch panel
found" 라고 말했다. 벤더가 돌려줄 모델 번호에는 끝이 없고 그것을 낼 수 있는 드라이버
목록에는 끝이 있으므로, 이제 `device/device/driver` 를 보고 정한다.

고친 뒤 실물에서 끝까지 확인했다. 파이에 2분 뒤 일정을 넣고 기다렸다가 유리를 눌렀다.

```
13:26:03  green + chirp — tray 2 is due, waiting for a release
13:26:08  tray 2: drop (GPIO 27)
13:26:10  indicator: blue — tray 2 released
{"tray": 2, "time": "1326", "taken": true, "reason": "released", "sc1": "SC1*E*2*1326*T*66"}
```

복용이 없을 때 누르면 `button pressed with no dose waiting — nothing released` 로
남는 것도 같이 봤다. 배출 버튼이 아니라 수령 버튼이라는 그 구분이 살아 있다.

물리 버튼은 없다. GPIO 24 를 15초 폴링했는데 계속 HIGH 였다. **달지 않기로 했으니
그대로 두면 된다.** 유리가 유일한 조작부라는 원래 설계 그대로다. `button.py` 는 남아
있고 핀만 잡고 있을 뿐이라 아무것도 방해하지 않는다.

**그리고 `config.txt` 에 `dtoverlay=ads7846` 을 넣어보는 것은 하지 마라.** 진단 도중에
그걸 해봤고 화면이 통째로 죽었다. 그 오버레이는 CE1 만 가져가는 게 아니라 spidev 노드를
둘 다 비활성화하는데, 이 펌웨어는 ILI9341 을 `/dev/spidev0.0` 으로 직접 몬다.

```
NO DISPLAY (ili9341: [Errno 2] No such file or directory: '/dev/spidev0.0')
```

네 `touch.py` 와 README, `install.sh` 가 전부 "그 줄이 있으면 안 된다" 고 이미 적어둔
그대로였다. 경고가 맞았다는 것을 실물에서 확인한 셈이라 여기 적어둔다.

(곁가지 하나. I2C 버스가 비어 보이는 것은 정상이다. 이 빌드의 RTC 는 DS3231 이 아니라
GPIO 3선식 DS1302 이고 `kind: "ds1302", trustworthy: true` 로 잘 돈다.)

---

## 참고: 웹 쪽에서 확인한 것

클라우드 릴레이를 fly.io 에 띄웠다 — `https://snapcare-relay.fly.dev`
(`pill_dispenser/cloud_relay` 를 네 `fly.toml.example` 그대로, 볼륨 1GB, 도쿄).
배포된 웹이 실제로 그 릴레이를 통해 모의 기기를 본다.

돌려서 확인한 전 구간: 열 글자 코드 → 짝짓기 → 상태 → 시계 미신뢰 경고 → 시각 보증 →
일정 전송 → 시각 도래 → 배출 카드 → 눌러서 배출 → 트레이 회전 → 기록 반영 → 카드 소멸
→ 짝 해제 → 재짝짓기. 기기가 남긴 기록:

```
SC1*E*2*1902*T*02   SC1*E*5*1908*T*03   SC1*E*7*1912*T*04
```

종이 폼시트도 같은 경로로: 사진 → 브라우저 판독 → 사서함 → 기기에
`SC1*W*2:0800-021-007` 도착(월·수·금 7일이 살아서 건너감).

앱이 쓰는 것 중 네 문서에 없던 것 둘을 타입에 더했다 — `status.blockedReason` 과
`status.servoUsable`. 둘 다 기기가 실제로 보내고, 앞의 것은 사람에게 그대로 읽어 줄 수
있는 유일한 진단이라 화면에 쓴다.

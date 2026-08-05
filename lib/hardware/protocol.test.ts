import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeSchedule, decodeSchedule, encodeEvent, decodeEvent, messageKind, normalizeTime, fitsDeviceScreen, MAX_DEVICE_PAYLOAD, encodeWeekly, decodeWeekly } from './protocol.ts';

/**
 * 광학 프로토콜 회귀 테스트.
 * 이 형식은 펌웨어와의 계약이라, 한쪽만 바뀌면 기기가 조용히 말을 안 듣게 된다.
 * 의존성 없이 node --test 로 돈다 (npm run test).
 */

test('시각 표기를 HHMM 으로 정규화한다', () => {
  assert.equal(normalizeTime('8:00 AM'), '0800');
  assert.equal(normalizeTime('8:00 PM'), '2000');
  assert.equal(normalizeTime('12:00 AM'), '0000');   // 자정은 12가 아니라 00
  assert.equal(normalizeTime('12:30 PM'), '1230');   // 정오는 12 그대로
  assert.equal(normalizeTime('18:00'), '1800');
  assert.equal(normalizeTime('0800'), '0800');
});

test('한 칸의 같은 시각은 한 번만 실린다', () => {
  // 한 칸이 같은 분에 두 번 떨어질 수는 없다. 앱에서 두 번 눌렸든, 폼시트를 두 번
  // 읽었든, 아침이 겹치는 처방 둘을 합쳤든 — 나가는 payload 에는 한 번만 실린다.
  // 기기도 같은 일을 하지만(sc1._parse_slot_times), 그쪽은 우리가 아닌 곳에서 온
  // 것까지 막는 자리이고 이쪽은 우리가 잘못된 것을 보내지 않는 자리다.
  assert.equal(
    encodeSchedule([{ slot: 1, times: ['0800', '8:00 AM', '2000'] }]),
    'SC1*S*1:0800.2000',
  );
  assert.equal(
    encodeWeekly([{ slot: 1, times: ['2000', '0800', '2000'], days: 127, durationDays: 30 }]),
    'SC1*W*1:0800.2000-127-030',
  );
  // 한 칸이 하루에 여러 번인 것은 정상이다 — 없어지는 것은 겹치는 것뿐이다.
  assert.equal(
    encodeSchedule([{ slot: 1, times: ['0800', '1300', '2000'] }]),
    'SC1*S*1:0800.1300.2000',
  );
});

test('스케줄이 왕복한다', () => {
  const payload = encodeSchedule([
    { slot: 1, times: ['8:00 AM', '8:00 PM'] },
    { slot: 2, times: ['18:00'] },
  ]);
  assert.equal(payload, 'SC1*S*1:0800.2000/2:1800');
  assert.deepEqual(decodeSchedule(payload), [
    { slot: 1, times: ['0800', '2000'] },
    { slot: 2, times: ['1800'] },
  ]);
});

test('사건이 왕복한다', () => {
  const payload = encodeEvent({ slot: 1, time: '0800', taken: true, seq: 7 });
  assert.equal(payload, 'SC1*E*1*0800*T*07');
  assert.deepEqual(decodeEvent(payload), { slot: 1, time: '0800', taken: true, seq: 7 });
  assert.equal(decodeEvent(encodeEvent({ slot: 3, time: '1930', taken: false, seq: 12 }))?.taken, false);
});

test('기기 메시지가 OLED 한계 안에 들어간다', () => {
  // 128x64 OLED 는 QR 세로 64px 가 벽이라, 모듈 2px 로 version 1 (20자) 까지만 그릴 수 있다.
  // 최악의 경우(두 자리 칸 + 두 자리 순번)에도 넘지 않아야 한다.
  const worst = encodeEvent({ slot: 99, time: '2359', taken: false, seq: 99 });
  assert.ok(
    fitsDeviceScreen(worst),
    `${worst.length}자 — 한계 ${MAX_DEVICE_PAYLOAD}자 초과, 기기가 화면에 못 그린다`,
  );

  // 한계를 넘기면 조용히 잘리는 대신 터져야 한다.
  // (나중에 필드를 추가할 때 여기서 걸리는 것이 목적이다)
  assert.throws(() => encodeEvent({ slot: 12345678, time: '0800', taken: true, seq: 99 }));
});

test('무엇을 읽었는지 먼저 가려낸다', () => {
  assert.equal(messageKind('SC1*S*1:0800'), 'schedule');
  assert.equal(messageKind('SC1*E*1*0800*T*01'), 'event');
  assert.equal(messageKind('https://example.com'), null);  // 남의 QR
});

test('깨진 입력은 throw 하지 않고 null 을 준다', () => {
  // 카메라는 아무 QR이나 읽으므로, 파서가 예외를 던지면 스캔 화면이 멈춘다.
  assert.equal(decodeSchedule(''), null);
  assert.equal(decodeSchedule('SC1*S*1:2599'), null);   // 25시 59분
  assert.equal(decodeSchedule('SC1*S*0:0800'), null);   // 슬롯은 1부터
  assert.equal(decodeEvent('SC1*E*1*0800'), null);      // 필드 부족
  assert.equal(decodeEvent('SC1*E*1*0800*X*01'), null); // T/M 이 아님
});

test('대소문자를 가리지 않는다', () => {
  // QR 영숫자 모드는 대문자만 담지만, 다른 리더가 소문자로 넘길 수 있다.
  assert.equal(decodeEvent('sc1*e*1*0800*t*01')?.slot, 1);
});

/* ── SC1*W* — 요일·기간까지 실은 일정 ────────────────────────
 *
 * 기준은 하드웨어 쪽 참조 구현이다 (pill_dispenser/form_sheet_parser/schedule.py,
 * firmware/libraries/SC1/SC1.cpp). 같은 문자열을 서로 만들고 서로 읽어야 한다 —
 * 한쪽만 맞으면 종이 시트가 기기에서 다른 일정이 된다.
 */

test('요일과 기간이 살아서 왕복한다', () => {
  // 이 형식이 필요한 이유: SC1*S* 에는 요일·기간 자리가 없어서, 월수금 30일짜리
  // 시트가 '매일 무기한' 과 같은 payload 가 된다. 일정은 맞아 보이는데 아무도
  // 요청하지 않은 나흘에 약이 나간다.
  const slots = [
    { slot: 1, times: ['0800', '2000'], days: 127, durationDays: 30 },
    { slot: 3, times: ['1900'], days: 21, durationDays: 0 },
  ];
  const payload = encodeWeekly(slots);
  assert.equal(payload, 'SC1*W*1:0800.2000-127-030/3:1900-021-000');
  assert.deepEqual(decodeWeekly(payload), slots);
});

test('필드 폭이 고정이다', () => {
  // 8비트 펌웨어가 토크나이저 없이 포인터 연산으로 읽는다. 자릿수가 흔들리면
  // 오프셋이 어긋나고, 기기는 엉뚱한 숫자를 요일로 읽는다.
  const p = encodeWeekly([{ slot: 1, times: ['0800'], days: 1, durationDays: 7 }]);
  assert.equal(p, 'SC1*W*1:0800-001-007');
});

test('구버전 앱이 W 코드를 만나도 죽지 않는다', () => {
  // 기기·시트 쪽이 먼저 W 를 쓰기 시작해도, 아직 모르는 앱 빌드가 카메라로 그걸
  // 읽을 수 있다. 모르는 것은 모른다고 해야지 예외를 던지면 스캔 루프가 멈춘다.
  const w = 'SC1*W*1:0800-127-030';
  assert.equal(decodeSchedule(w), null);
  assert.doesNotThrow(() => decodeSchedule(w));
});

test('무엇을 읽었는지 먼저 가려낸다 (W 포함)', () => {
  assert.equal(messageKind('SC1*W*1:0800-127-030'), 'weekly');
  assert.equal(messageKind('SC1*S*1:0800'), 'schedule');
  // 요일 자리가 5(토)다. 여러 문서에 4(금)로 적혀 있었는데 2026-07-25 는 토요일이다.
  // 여기서는 종류만 보므로 값이 영향을 주지 않지만, 틀린 벡터를 베껴 쓰는 자리가 되면
  // 안 된다 — 요일이 하루 밀리면 요일 마스크 전체가 어긋난다.
  assert.equal(messageKind('SC1*C*202607251930*5'), null, '아직 모르는 종류는 null');
});

test('깨진 W 는 throw 하지 않고 null 을 준다', () => {
  // 카메라는 프레임에 들어온 아무 QR 이나 읽는다.
  assert.equal(decodeWeekly('SC1*W*1:0800-127'), null, '필드가 빠짐');
  assert.equal(decodeWeekly('SC1*W*1:0800-12-030'), null, '마스크 자릿수 부족');
  assert.equal(decodeWeekly('SC1*W*1:0800-000-030'), null, '아무 요일도 아닌 일정');
  assert.equal(decodeWeekly('SC1*W*1:0800-128-030'), null, '7비트를 넘음');
  assert.equal(decodeWeekly('SC1*W*1:2500-127-030'), null, '없는 시각');
  assert.equal(decodeWeekly('SOMETHING ELSE'), null);
});

test('기간은 세 자리를 넘지 않는다', () => {
  const p = encodeWeekly([{ slot: 1, times: ['0800'], days: 127, durationDays: 5000 }]);
  assert.equal(p, 'SC1*W*1:0800-127-999');
});

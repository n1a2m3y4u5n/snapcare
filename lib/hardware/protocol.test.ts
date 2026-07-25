import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeSchedule, decodeSchedule,
  encodeEvent, decodeEvent,
  messageKind, normalizeTime,
  fitsDeviceScreen, MAX_DEVICE_PAYLOAD,
} from './protocol.ts';

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

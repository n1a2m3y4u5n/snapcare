import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockFace, dayPart, msUntil, parseClock, speakTime } from './clock.ts';

test('앱 안에 섞여 있는 세 가지 시각 표기를 모두 읽는다', () => {
  assert.deepEqual(parseClock('Today · 2:14 PM'), { hour: 14, minute: 14 });
  assert.deepEqual(parseClock('Yesterday · 6:40 PM'), { hour: 18, minute: 40 });
  assert.deepEqual(parseClock('08:00'), { hour: 8, minute: 0 });
  assert.deepEqual(parseClock('8:00 AM'), { hour: 8, minute: 0 });
});

test('자정과 정오를 뒤집지 않는다', () => {
  // 12시간제에서 제일 흔한 실수다. 12 AM 을 12시로 두면 복약 시간이 반나절 어긋난다.
  assert.deepEqual(parseClock('12:00 AM'), { hour: 0, minute: 0 });
  assert.deepEqual(parseClock('12:30 PM'), { hour: 12, minute: 30 });
});

test('읽을 수 없으면 시계를 그리지 않는다', () => {
  // 틀린 시계를 그리느니 글자만 보여주는 편이 낫다.
  assert.equal(parseClock('Today'), null);
  assert.equal(parseClock('25:00'), null);
  assert.equal(parseClock('9:99'), null);
});

test('문자판은 가장 가까운 30분으로 맞춘다', () => {
  assert.equal(clockFace(2, 0), '🕑');    // 2시
  assert.equal(clockFace(2, 14), '🕑');   // 15분 전이면 정시 쪽
  assert.equal(clockFace(2, 30), '🕝');   // 2시 반
  assert.equal(clockFace(2, 50), '🕒');   // 45분 넘으면 다음 정시
  assert.equal(clockFace(12, 0), '🕛');
  assert.equal(clockFace(0, 0), '🕛', '자정도 12시 문자판이다');
  assert.equal(clockFace(23, 50), '🕛', '자정을 넘어가도 12로 돌아온다');
});

test('해와 달이 오전·오후를 가른다', () => {
  // 12시간제 문자판만으로는 아침 8시와 저녁 8시가 같은 그림이 된다.
  assert.notEqual(dayPart(8).emoji, dayPart(20).emoji);
  assert.equal(clockFace(8, 0), clockFace(20, 0), '문자판만으로는 구분되지 않는다');

  assert.equal(dayPart(7).emoji, '🌅');
  assert.equal(dayPart(13).emoji, '☀️');
  assert.equal(dayPart(18).emoji, '🌆');
  assert.equal(dayPart(23).emoji, '🌙');
  assert.equal(dayPart(3).emoji, '🌙');
});

test('시각도 소리로 들린다', () => {
  assert.equal(speakTime(8, 0), "8 o'clock in the morning");
  assert.equal(speakTime(18, 30), '6 30 in the evening');
  // 적도 부근은 해가 6시 반쯤 지므로 저녁 8시는 이미 밤이다
  assert.equal(speakTime(20, 30), '8 30 at night');
  assert.equal(speakTime(14, 5), '2 oh 5 in the middle of the day');
  assert.equal(speakTime(0, 0), "12 o'clock at night");
});

test('msUntil 은 오늘 남은 시각까지', () => {
  const now = new Date('2026-08-02T07:00:00');
  assert.equal(msUntil('8:00 AM', now), 60 * 60 * 1000);
});

test('이미 지난 시각이면 내일까지 — 음수를 돌려주지 않는다', () => {
  // 저녁 7시에 아침 8시 약을 찍은 사람이 있다. 음수를 주면 예약이 조용히 취소되거나
  // 즉시 뜨고, 둘 다 사용자에게는 "알림이 이상하다" 로만 보인다.
  const now = new Date('2026-08-02T19:00:00');
  assert.equal(msUntil('8:00 AM', now), 13 * 60 * 60 * 1000);
});

test('읽을 수 없는 시각은 예약하지 않는다', () => {
  assert.ok(msUntil('sometime', new Date('2026-08-02T07:00:00')) < 0);
});

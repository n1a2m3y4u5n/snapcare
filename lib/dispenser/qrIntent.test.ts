import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readQr } from './qrIntent.ts';
import { claimFromPairUrl } from './claim.ts';

/*
  기기가 실제로 인쇄하는 네 가지 QR. 값은 `provisioning.py` 의 형식 그대로다 —
  여기가 어긋나면 라벨을 찍었을 때 앱이 아무 일도 하지 않는다.
*/
const CLAIM = 'DDBQEKEJ78';

test('릴레이가 설정된 기기의 짝짓기 QR 을 읽는다', () => {
  const got = readQr(`https://snapcare-relay.fly.dev/pair#${CLAIM}`);
  assert.deepEqual(got, { kind: 'pair', claim: CLAIM });
});

test('릴레이가 없는 기기의 짝짓기 QR 도 읽는다', () => {
  /*
    공장에서 나온 모든 기기가 이 형식이다. 이것을 못 읽는 동안 새 기기를 찍으면
    "SnapCare 코드가 아닙니다" 가 떴다 — 기기가 방금 자기 화면에 그린 코드를 두고.
  */
  const got = readQr('SNAPCARE-PAIR:DDBQE-KEJ78');
  assert.deepEqual(got, { kind: 'pair', claim: CLAIM });
});

test('하이픈이 있든 없든, 대소문자가 어떻든 같은 코드다', () => {
  for (const text of ['SNAPCARE-PAIR:ddbqe-kej78', `https://r.example/pair#${CLAIM}`,
                      'DDBQE-KEJ78', 'ddbqekej78']) {
    assert.equal(readQr(text).kind, 'pair', text);
    assert.equal((readQr(text) as { claim: string }).claim, CLAIM, text);
  }
});

test('열 글자가 아니면 짝짓기가 아니다', () => {
  /*
    한 글자 모자란 코드는 **완벽하게 유효한 열쇠**를 만들어 낸다 — 존재하지 않는
    사서함의 것이라, 증상은 "전원이 뽑힌 것처럼 보이는 기기" 뿐이고 양쪽 어디에도
    오류가 남지 않는다. 그래서 여기서 막는다.
  */
  assert.equal(readQr('DDBQE-KEJ7').kind, 'unknown');
  assert.equal(readQr('DDBQE-KEJ789').kind, 'unknown');
});

test('기기 주소 QR 을 알아본다', () => {
  assert.deepEqual(readQr('http://pilldispenser.local/'),
                   { kind: 'device', url: 'http://pilldispenser.local/' });
});

test('설정 페이지 QR 을 알아본다', () => {
  // 이름이 아니라 숫자 주소인 것이 기기 주소와의 구별점이다.
  assert.deepEqual(readQr('http://192.168.4.1/'),
                   { kind: 'setup', url: 'http://192.168.4.1/' });
});

test('와이파이 QR 에서 망 이름을 꺼낸다', () => {
  assert.deepEqual(readQr('WIFI:S:SnapCare-96MM;T:WPA;P:abc123;;'),
                   { kind: 'wifi', ssid: 'SnapCare-96MM' });
});

test('망 이름에 세미콜론이 있어도 안 잘린다', () => {
  // escape 를 무시하면 존재하지 않는 망 이름을 사람에게 읽어 주게 된다.
  assert.deepEqual(readQr('WIFI:S:home\\;guest;T:WPA;P:x;;'),
                   { kind: 'wifi', ssid: 'home;guest' });
});

test('남의 QR 은 모른다고 답한다', () => {
  for (const text of ['https://example.com/', 'hello', '', null, undefined,
                      'https://snapcare-relay.fly.dev/']) {
    assert.equal(readQr(text).kind, 'unknown', String(text));
  }
});

test('짝짓기를 주소보다 먼저 본다', () => {
  /*
    릴레이가 설정된 기기의 짝짓기 코드는 그 자체로 멀쩡한 https 주소다. 주소 규칙을
    먼저 태우면 이것이 "모르는 주소" 로 떨어지고, 라벨을 찍어도 짝이 안 맺어진다.
  */
  assert.equal(readQr(`https://pilldispenser.local/pair#${CLAIM}`).kind, 'pair');
});

test('claim.ts 와 같은 답을 낸다', () => {
  // 두 곳에서 형식을 알고 있으므로, 한쪽만 고쳐지는 날이 오지 않게 묶어 둔다.
  for (const text of [`https://r.example/pair#${CLAIM}`, 'SNAPCARE-PAIR:DDBQE-KEJ78']) {
    assert.equal((readQr(text) as { claim: string }).claim, claimFromPairUrl(text));
  }
});

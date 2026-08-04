import test from 'node:test';
import assert from 'node:assert/strict';

import { orbitSpots, overlaps } from './orbit.ts';

/*
  Orbit.tsx 가 쓰는 실제 크기. 여기 값이 저쪽과 어긋나면 이 시험은 **실물이 아닌
  것을 재게 된다** — 가운데 버튼을 40%에서 46%로 키웠을 때 이 상수가 40 으로
  남아 있어서, 위성이 버튼에 파고들어도 통과할 수 있는 상태였다.
*/
const SATELLITE_PCT = 18;   // w-[20%]
const CENTER_PCT = 52;      // w-[46%]

test('12시에서 시작해 고르게 나눈다', () => {
  // 처음에는 6시를 비우려고 각도를 좁혔다. "Scan something" 이라는 이름을 원 안에
  // 절대 위치로 얹어 두었기 때문인데, 그 시험은 **위성끼리만** 보고 글자는 안 봐서
  // 실제로 글자가 깔리는 배치를 통과시켰다. 글자를 원 밖으로 내보내 문제를 없앴고,
  // 배치는 가장 단순한 것으로 돌아왔다.
  const four = orbitSpots(4);
  assert.ok(four[0].top < 50 && Math.abs(four[0].left - 50) < 0.01, '첫 위성이 12시가 아니다');
  // 네 개면 12·3·6·9시. 이웃 사이 거리가 모두 같아야 한다.
  const gaps = four.map((s, i) => {
    const n = four[(i + 1) % four.length];
    return Math.hypot(s.left - n.left, s.top - n.top);
  });
  for (const g of gaps) assert.ok(Math.abs(g - gaps[0]) < 0.01, `간격이 고르지 않다: ${gaps}`);
});

test('위성끼리 겹치지 않는다', () => {
  // 손으로 좌표를 박으면 개수가 바뀔 때 겹쳐도 코드만 봐서는 안 보인다.
  for (const n of [2, 3, 4, 5]) {
    const spots = orbitSpots(n);
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        assert.ok(!overlaps(spots[i], spots[j], SATELLITE_PCT),
          `${n}개일 때 ${i} 와 ${j} 가 겹친다`);
      }
    }
  }
});

test('상자 밖으로 나가지 않는다', () => {
  /*
    픽셀로 박으면 좁은 화면에서 위성이 잘린다. 백분율로 내는 이유다.

    **딱 맞는 것은 안 된다.** 궤도 반지름이 0.8 일 때 위성의 바깥 모서리가 상자
    모서리에 정확히 닿았고 — 산수로는 통과다 — 실제 화면에서는 그림자와 배지가
    상자 밖으로 나가 끝이 잘려 보였다. 그래서 여백을 요구한다.
  */
  const half = SATELLITE_PCT / 2;
  for (const s of orbitSpots(4)) {
    const margin = 1;   // 그림자와 배지가 나갈 자리
    assert.ok(s.left - half >= margin && s.left + half <= 100 - margin,
              `가로로 여백이 없다: ${s.left}`);
    assert.ok(s.top - half >= margin && s.top + half <= 100 - margin,
              `세로로 여백이 없다: ${s.top}`);
  }
});

test('가운데 버튼과 겹치지 않는다', () => {
  // 위성이 버튼 위에 앉으면 누를 곳이 겹치고, 겹친 자리를 누르면 어느 쪽이
  // 잡히는지가 브라우저마다 다르다 — 카메라를 누르려다 설정으로 가는 일이 생긴다.
  const centerRadius = CENTER_PCT / 2;
  const satRadius = SATELLITE_PCT / 2;
  for (const s of orbitSpots(4)) {
    const d = Math.hypot(s.left - 50, s.top - 50);
    assert.ok(d >= centerRadius + satRadius, `가운데와 ${d.toFixed(1)}% 밖에 안 떨어졌다`);
  }
});

test('한쪽으로 몰리지 않는다', () => {
  // 한쪽에 뭉치면 반대쪽 엄지로는 닿지 않는다. "왼쪽에 몇 개" 로 세면 12시·6시처럼
  // 정확히 가운데 있는 것을 어느 쪽으로도 못 세어 배치가 멀쩡해도 실패한다.
  // 무게중심이 가운데인지를 본다 — 그것이 "고르다" 의 실제 뜻이다.
  for (const n of [3, 4, 5, 6]) {
    const spots = orbitSpots(n);
    const cx = spots.reduce((a, s) => a + s.left, 0) / n;
    const cy = spots.reduce((a, s) => a + s.top, 0) / n;
    assert.ok(Math.abs(cx - 50) < 0.01 && Math.abs(cy - 50) < 0.01,
      `${n}개일 때 무게중심이 (${cx.toFixed(1)}, ${cy.toFixed(1)}) 이다`);
  }
});

test('하나만 있으면 위에 놓는다', () => {
  const [only] = orbitSpots(1);
  assert.ok(Math.abs(only.left - 50) < 0.01);
  assert.ok(only.top < 50, '12시 방향이어야 한다');
});

test('없으면 빈 목록이다', () => {
  assert.deepEqual(orbitSpots(0), []);
});

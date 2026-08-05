import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cropField, otsu } from './field.ts';
import { SHEET_CONFIG } from './config.ts';
import { makeGray } from './image.ts';
import type { Mat3 } from './homography.ts';

/** 원본이 정규 좌표의 `k` 배로 찍힌 사진 — 폰이 종이를 크게 찍은 경우. */
function zoom(k: number): Mat3 {
  return Float64Array.from([1 / k, 0, 0, 0, 1 / k, 0, 0, 0, 1]) as unknown as Mat3;
}

test('칸의 크기는 사진이 아니라 배율이 정한다', () => {
  /*
    OCR 은 글자 높이에 민감하다. 사진마다 다른 크기를 던지면 잘 읽히는 날과 아닌
    날이 생기고, 그 차이는 아무도 재현하지 못한다. 그래서 나오는 그림의 크기는
    **원본 해상도와 무관하게** 일정하다.
  */
  const rect = SHEET_CONFIG.fields.name;
  const [x0, y0, x1, y1] = rect;

  for (const k of [2, 4, 8]) {
    const src = makeGray(1000 * k, 1000 * k);
    const out = cropField(src, zoom(k), rect, 4);
    assert.equal(out.w, (x1 - x0) * 4, `배율 ${k}`);
    assert.equal(out.h, (y1 - y0) * 4, `배율 ${k}`);
  }
});

test('정규 격자를 거치지 않는다 — 원본에서 바로 뜬다', () => {
  /*
    이 파일이 있는 이유다. 이름칸은 정규 좌표로 28행뿐이라(A5 에서 4.7mm), 정규
    격자에서 자르면 어떤 OCR 도 못 읽는 그림이 나온다. 확인하는 방법: 원본에만
    있고 정규 격자에서는 사라질 만큼 가는 무늬를 그려 두고, 잘라낸 그림에 그것이
    살아 있는지 본다.
  */
  const k = 8;                     // 사진이 정규 좌표의 8배
  const src = makeGray(1000 * k, 1000 * k);
  src.d.fill(255);
  const [x0, y0, x1, y1] = SHEET_CONFIG.fields.name;

  /*
    원본에서 4픽셀 주기의 세로 줄무늬 — 정규 좌표로는 0.5 단위라 정규 격자(1배)를
    거치면 통째로 사라진다. 잘라낸 그림(배율 4, 출력 1px = 원본 2px)에서는 주기가
    2px 이라 살아 있어야 한다.
  */
  for (let y = y0 * k; y < y1 * k; y++) {
    for (let x = x0 * k; x < x1 * k; x++) {
      if (Math.floor(x / 2) % 2 === 0) src.d[y * src.w + x] = 0;
    }
  }

  const out = cropField(src, zoom(k), SHEET_CONFIG.fields.name, 4);
  const values = new Set(Array.from(out.d.slice(0, out.w)));
  assert.ok(values.size > 1, '줄무늬가 통째로 뭉개졌다 — 원본에서 안 뜨고 있다');
});


test('Otsu 가 두 무리를 실제로 가른다', () => {
  /*
    값이 아니라 **가름**을 잰다. 문턱의 정의(어두운 무리에 들어가는 마지막 값인가,
    밝은 무리의 첫 값인가)는 구현마다 한 칸씩 다르고, 그 한 칸이 실제로 이 파일을
    한 번 깨뜨렸다 — `<` 로 갈랐더니 흑백 그림에서 어두운 무리가 통째로 비었다.
    시험이 값을 붙들면 그 오류를 못 잡는다.
  */
  const d = new Uint8Array(200);
  d.fill(40, 0, 100);
  d.fill(210, 100, 200);
  const t = otsu(d);
  assert.ok(40 <= t && t < 210, `문턱이 두 무리 사이가 아니다: ${t}`);
  assert.equal(Array.from(d).filter((v) => v <= t).length, 100, '어두운 쪽이 절반이어야 한다');
});

test('설정의 세 칸이 서로 안 겹치고 종이 안에 있다', () => {
  // 겹치면 이름칸을 읽는데 개수칸의 숫자가 섞여 들어온다. 그건 화면에 안 보인다.
  const rects = Object.entries(SHEET_CONFIG.fields);
  assert.ok(rects.length >= 3);
  for (const [name, [x0, y0, x1, y1]] of rects) {
    assert.ok(x1 > x0 && y1 > y0, `${name}: 뒤집힌 사각형`);
    assert.ok(x0 >= 0 && y0 >= 0 && x1 <= 1000 && y1 <= 1000, `${name}: 종이 밖`);
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const [, a] = rects[i];
      const [, b] = rects[j];
      const apart = a[3] <= b[1] || b[3] <= a[1] || a[2] <= b[0] || b[2] <= a[0];
      assert.ok(apart, `${rects[i][0]} 와 ${rects[j][0]} 이 겹친다`);
    }
  }
});

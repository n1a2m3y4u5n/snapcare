import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/*
  포크의 살 셋이 같은 굵기인가.

  0.4 / 1.5 / 1.8 이었다. 화면에서는 "첫 살만 가늘다" 로만 보여서 원인을 그림에서
  짐작할 수가 없었다 — 윤곽선이 제자리로 안 닫혀 생긴 높이 없는 겹친 선이 첫 살을
  1.1 만큼 먹고 있었다.

  경로 문자열을 눈으로 검토해서는 안 잡힌다. 그래서 잰다.
*/
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.tsx'), 'utf8');

/** 살 윗변(y=2.2)에 놓인 가로 변들로부터 채워진 구간의 폭을 잰다. */
function tineWidths(d: string): number[] {
  const nums = d.match(/[MmHhVvCcZz]|-?\d*\.?\d+/g) ?? [];
  let x = 0, y = 0, i = 0, startX = 0, cmd = '';
  const spans: [number, number][] = [];
  const rd = () => parseFloat(nums[i++]);
  while (i < nums.length) {
    if (/^[MmHhVvCcZz]$/.test(nums[i])) {
      cmd = nums[i]; i++;
      if (cmd === 'Z' || cmd === 'z') { x = startX; continue; }
    }
    const x0 = x, y0 = y;
    if (cmd === 'M') { x = rd(); y = rd(); startX = x; }
    else if (cmd === 'H') x = rd();
    else if (cmd === 'h') x += rd();
    else if (cmd === 'V') y = rd();
    else if (cmd === 'v') y += rd();
    else if (cmd === 'C') { rd(); rd(); rd(); rd(); x = rd(); y = rd(); }
    else if (cmd === 'c') { rd(); rd(); rd(); rd(); x += rd(); y += rd(); }
    else break;
    if (y === 2.2 && y0 === 2.2 && x !== x0) spans.push([Math.min(x0, x), Math.max(x0, x)]);
  }
  const pts = [...new Set(spans.flat())].sort((a, b) => a - b);
  const solid: number[][] = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const mid = (pts[k] + pts[k + 1]) / 2;
    // 홀수 번 덮이면 채워진 자리다. 겹친 변은 짝수가 되어 저절로 빠진다.
    if (spans.filter(([a, b]) => a < mid && mid < b).length % 2 === 1) solid.push([pts[k], pts[k + 1]]);
  }
  const merged: number[][] = [];
  for (const s of solid) {
    const last = merged.at(-1);
    if (last && last[1] === s[0]) last[1] = s[1];
    else merged.push([...s]);
  }
  return merged.map(([a, b]) => Number((b - a).toFixed(2)));
}

test('포크의 살 셋이 같은 굵기다', () => {
  const d = src.split('포크 —')[1]?.match(/d="([^"]+)"/)?.[1];
  assert.ok(d, '포크 경로를 못 찾았다 — 주석이나 순서가 바뀌었으면 이 시험부터 고쳐야 한다');

  const widths = tineWidths(d);
  assert.equal(widths.length, 3, `살이 셋이어야 한다 (지금 ${widths.length}개: ${widths})`);
  assert.deepEqual(widths, [1.5, 1.5, 1.5], `살 굵기가 어긋난다: ${widths.join(' / ')}`);
});

test('포크 머리의 가운데가 자루의 가운데와 같다', () => {
  // 어긋나면 포크가 기울어 보인다. 눈으로는 "왠지 이상하다" 까지만 온다.
  const d = src.split('포크 —')[1]?.match(/d="([^"]+)"/)?.[1] ?? '';
  const [head] = [d.match(/^M([\d.]+)/)?.[1]].map(Number);
  const right = 12.4, handleL = 8.2, handleR = 9.9;
  assert.equal(head, 5.7);
  assert.equal((head + right) / 2, (handleL + handleR) / 2);
});

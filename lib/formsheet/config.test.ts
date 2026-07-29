import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SHEET_CONFIG } from './config.ts';

/**
 * 좌표표의 사본이 원본과 갈라지지 않았는지 본다.
 *
 * 이 시험이 없으면 갈라진 것을 아무도 모른다. 파이썬 쪽에서 버블 좌표를 다시 보정하고
 * JSON 만 고치면, 브라우저 판독기는 **실패하지 않는다** — 옛 좌표로 옆 칸을 읽고
 * 그럴듯한 다른 일정을 내놓는다. 조용한 오독은 약이 든 기계로 간다.
 */
const JSON_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../pill_dispenser/form_sheet_parser/form_sheet/form_sheet_config.json',
);

test('버블 좌표가 파이썬 파서의 설정과 같다', () => {
  const original = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
  assert.deepEqual(JSON.parse(JSON.stringify(SHEET_CONFIG)), original);
});

test('무리는 넷이고 버블은 마흔넷이다', () => {
  // 하위 사분위수를 빈 버블의 기준으로 쓰는 근거가 이 개수에 걸려 있다 — 제대로 채운
  // 시트라도 표시되는 것은 3분의 1 남짓이라 하위 사분위수는 빈 쪽에 안전하게 앉는다.
  const total = Object.values(SHEET_CONFIG.groups)
    .reduce((n, g) => n + Object.keys(g.bubbles).length, 0);
  assert.equal(Object.keys(SHEET_CONFIG.groups).length, 4);
  assert.equal(total, 44);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 사전과 에셋 파일이 어긋나지 않는지.
 *
 * engine.py 는 assets/{role}/{name}.png 를 이름으로 찾는다. 사전에만 있고 파일이 없으면
 * 그 픽토그램은 렌더 중에 터지고, 파일만 있고 사전에 없으면 DSL 에서 쓸 수가 없다.
 * 둘 다 사람 손으로 맞춰야 했는데, 이제 build_assets.py 가 함께 만들므로 여기서 잠근다.
 */

const ENGINE = join(process.cwd(), 'engine');
const dict = JSON.parse(readFileSync(join(ENGINE, 'dictionary.json'), 'utf8')) as {
  heads: { name: string }[];
  modifiers: { name: string }[];
};

function assetNames(role: string): string[] {
  return readdirSync(join(ENGINE, 'assets', role))
    .filter((f) => f.endsWith('.png'))
    .map((f) => f.replace(/\.png$/, ''))
    .sort();
}

for (const [role, key] of [['head', 'heads'], ['modifier', 'modifiers']] as const) {
  test(`${role}: 사전과 파일이 정확히 일치한다`, () => {
    const inDict = dict[key].map((e) => e.name).sort();
    assert.deepEqual(assetNames(role), inDict);
  });
}

test('빈 글리프가 섞여 있지 않다', () => {
  // 그리는 함수가 조용히 아무것도 안 그리면 투명한 정사각형이 나온다. 화면에서는
  // 그냥 빈칸으로 보이고, 그 빈칸은 "정보가 없다" 가 아니라 "문제 없다" 로 읽힌다.
  for (const role of ['head', 'modifier']) {
    for (const name of assetNames(role)) {
      const size = statSync(join(ENGINE, 'assets', role, `${name}.png`)).size;
      assert.ok(size > 1000, `${role}/${name}.png 가 ${size}바이트뿐이다 — 비어 있을 수 있다`);
    }
  }
});

test('앱이 쓰는 알레르겐 형태소가 전부 있다', () => {
  // 판정 화면이 알레르기 픽토그램을 그리려는데 형태소가 없으면 조용히 빠진다.
  const heads = new Set(dict.heads.map((e) => e.name));
  for (const a of ['peanut', 'tree_nut', 'milk', 'egg', 'gluten', 'shellfish', 'soy', 'sesame']) {
    assert.ok(heads.has(`allergen_${a}`), `allergen_${a} 가 없다`);
  }
});

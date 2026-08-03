/**
 * public/glyphs/ 에 있는 형태소 이름을 목록으로 뽑는다.
 *
 * 왜 목록이 필요한가
 * ------------------
 * 오프라인 예열(lib/offline/warm.ts)이 그림을 미리 받아두려면 무엇을 받아야 하는지
 * 알아야 하는데, 앱 코드에서 그림 이름은 전부 **실행 중에** 정해진다 —
 * `/glyphs/${GLYPH[t.condition.trigger]}.png` 처럼. 코드를 훑어서 목록을 만들 수가
 * 없다는 뜻이다.
 *
 * 손으로 적은 목록을 두는 방법도 있지만, 형태소는 engine/gen_glyphs.py 가 만들고
 * 지금까지 78장까지 늘었다. 손목록은 반드시 뒤처지고, 뒤처진 티가 안 난다 —
 * 빠진 그림은 온라인에서 멀쩡히 뜨고 오프라인에서만 안 뜬다.
 *
 * 그래서 빌드 때 디렉터리를 그대로 읽는다. 그림을 추가하면 목록이 따라온다.
 */
import { readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'public', 'glyphs');
const OUT = join(DIR, 'manifest.json');

let names = [];
try {
  names = readdirSync(DIR)
    .filter((f) => f.endsWith('.png'))
    .map((f) => f.slice(0, -4))
    .sort();
} catch {
  // 엔진 없이 빌드하는 환경. 예열이 그냥 건너뛴다.
  console.log('[glyph-manifest] public/glyphs 가 없다 — 건너뜀');
  process.exit(0);
}

const next = JSON.stringify(names) + '\n';
let prev = '';
try { prev = readFileSync(OUT, 'utf8'); } catch { /* 처음 */ }

if (prev === next) {
  console.log(`[glyph-manifest] 이미 최신 — ${names.length}개`);
} else {
  writeFileSync(OUT, next, 'utf8');
  console.log(`[glyph-manifest] ${names.length}개 기록`);
}

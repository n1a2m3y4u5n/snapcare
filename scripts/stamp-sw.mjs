/**
 * 서비스워커의 캐시 이름에 자산 지문을 찍는다.
 *
 * 왜 필요한가
 * -----------
 * sw.js 는 `const VERSION = 'snapcare-v2'` 처럼 손으로 적은 값을 쓰고 있었고,
 * activate 때 그 값으로 시작하지 않는 캐시를 지운다. 그런데 아무도 그 숫자를 올리지
 * 않으므로 캐시는 영영 갱신되지 않는다.
 *
 * 대부분의 자원은 이 문제가 없다. 화면은 네트워크 우선이라 온라인이면 늘 새것이고,
 * /_next/static/ 은 내용이 바뀌면 주소가 바뀐다.
 *
 * 문제가 되는 것은 **픽토그램**이다. 주소가 DSL 문자열에서 나오므로 그림을 갈아도
 * 주소가 그대로다. 오늘 78개 중 74개를 새로 만들었는데, 서비스워커는 cacheFirst 로
 * 옛 PNG 를 계속 내준다 — 한 번 방문한 적 있는 사람은 영영 옛 그림을 본다.
 * 심사위원이 어제 한 번 열어봤다면 오늘 고친 것을 못 본다.
 *
 * 지문은 prewarm 이 이미 계산해 manifest.json 에 남겨둔 값을 쓴다. 자산이나 사전이
 * 바뀔 때만 달라지므로, 아무것도 안 바뀐 배포에서는 캐시를 헛되이 버리지 않는다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SW = join(ROOT, 'public', 'sw.js');
const MANIFEST = join(ROOT, 'public', 'pictograms', 'manifest.json');

function fingerprint() {
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8')).__assets || 'dev';
  } catch {
    return 'dev';   // 엔진 없이 빌드하는 환경 — 캐시 이름만 고정된다
  }
}

const fp = fingerprint();
const src = readFileSync(SW, 'utf8');
const next = src.replace(/const VERSION = '[^']*';/, `const VERSION = 'snapcare-${fp}';`);

if (next === src) {
  console.log('[stamp-sw] 이미 최신 —', fp);
} else {
  writeFileSync(SW, next, 'utf8');
  console.log('[stamp-sw] 캐시 이름 → snapcare-' + fp);
}

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
 * 문제가 되는 것은 **주소가 안 바뀌는 그림들**이다. 픽토그램은 주소가 DSL 문자열에서
 * 나오고, 로고와 아이콘은 이름이 고정이다. 서비스워커는 그것들을 cacheFirst 로 내주므로,
 * 한 번 방문한 적 있는 사람은 그림을 갈아도 영영 옛것을 본다.
 *
 * 무엇을 지문에 넣는가
 * --------------------
 * 처음에는 픽토그램 매니페스트의 `__assets` **하나뿐**이었다. 그래서 로고를 새 워드마크로
 * 갈았을 때 버전이 안 바뀌었고 — 컴퓨터에서는 새 로고가 보이는데 폰에서는 옛 로고가
 * 그대로였다. 폰에는 서비스워커가 살아 있고 컴퓨터에는 방금 연 탭뿐이었기 때문이다.
 *
 * 그래서 **서비스워커가 cacheFirst 로 내주는 것들**을 같이 센다:
 *
 *   sw.js 자신    규칙이 바뀌면 캐시도 새로 만들어야 한다. 새 파일을 목록에 넣는
 *                 것만으로는 옛 캐시가 안 지워진다.
 *   public 최상위  로고와 "TRY IT" 예시 그림들. 이름이 고정이라 갈아도 주소가 같다.
 *   icons/        홈 화면 아이콘 다섯 벌. 같은 이유다.
 *   픽토그램      전과 같이 `__assets`.
 *
 * 아무것도 안 바뀐 배포에서는 값이 그대로라 캐시를 헛되이 버리지 않는다. 그것이 처음에
 * 이 지문을 파일 목록이 아니라 매니페스트에서 뽑은 이유였고, 그 성질은 지킨다.
 *
 * 큰 자산 폴더(models·glyphs·nutrition)는 안 센다. models 는 16MB 이고 nutrition 은
 * 사람이 쓸수록 늘어난다. 앞엣것은 바뀌면 픽토그램 지문도 같이 바뀌고, 뒤엣것은 내용이
 * 바코드마다 갈려 옛것이 남아도 틀리지 않는다.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const PUBLIC = join(ROOT, 'public');
const SW = join(PUBLIC, 'sw.js');
const MANIFEST = join(PUBLIC, 'pictograms', 'manifest.json');

function pictograms() {
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8')).__assets || 'dev';
  } catch {
    return 'dev';   // 엔진 없이 빌드하는 환경
  }
}

/** 서비스워커가 cacheFirst 로 내주면서 주소가 안 바뀌는 파일들. */
function pinned() {
  const out = [];
  for (const name of readdirSync(PUBLIC).sort()) {
    const full = join(PUBLIC, name);
    // 최상위 파일만. 폴더는 아래에서 아이콘만 따로 센다.
    if (statSync(full).isFile()) out.push(full);
  }
  try {
    for (const name of readdirSync(join(PUBLIC, 'icons')).sort()) {
      out.push(join(PUBLIC, 'icons', name));
    }
  } catch { /* 아이콘이 아직 없는 환경 */ }
  return out;
}

const hash = createHash('sha256');
hash.update(pictograms());
for (const file of pinned()) {
  const bytes = readFileSync(file);
  // sw.js 는 지금 찍을 값이 그 안에 들어가므로, 그 줄을 빼고 센다. 안 그러면
  // 매번 값이 달라져서 아무것도 안 바뀐 배포에서도 캐시를 통째로 버린다.
  const body = file === SW
    ? Buffer.from(bytes.toString('utf8').replace(/const VERSION = '[^']*';/, ''), 'utf8')
    : bytes;
  hash.update(file.slice(PUBLIC.length));
  hash.update(createHash('sha256').update(body).digest());
}
const fp = hash.digest('hex').slice(0, 16);

const src = readFileSync(SW, 'utf8');
const next = src.replace(/const VERSION = '[^']*';/, `const VERSION = 'snapcare-${fp}';`);

if (next === src) {
  console.log('[stamp-sw] 이미 최신 —', fp);
} else {
  writeFileSync(SW, next, 'utf8');
  console.log('[stamp-sw] 캐시 이름 → snapcare-' + fp);
}

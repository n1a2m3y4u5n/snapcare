import test from 'node:test';
import assert from 'node:assert/strict';
import { staticAssetsFrom, warmOffline, WARM_ROUTES, WARM_ASSETS, WARM_PROBE } from './warm.ts';

/** 실제 Next 16 프로덕션 HTML 에서 잘라온 모양 */
const HTML = `<!DOCTYPE html><html lang="en" class="h-full"><head><meta charSet="utf-8"/>
<link rel="stylesheet" href="/_next/static/chunks/0xnpya9r0u9i7.css" data-precedence="next"/>
<link rel="preload" as="script" href="/_next/static/chunks/turbopack-0h9rni98emk.js"/>
<script src="/_next/static/chunks/0mo4tyl.jfe6u.js" async=""></script>
<link rel="icon" href="/icons/icon-192.png"/>
<img src="/glyphs/finish_course.png"/></head><body>x</body></html>`;

test('HTML 에서 부팅에 쓰는 정적 자산만 뽑는다', () => {
  const got = staticAssetsFrom(HTML);
  assert.deepEqual(got.sort(), [
    '/_next/static/chunks/0mo4tyl.jfe6u.js',
    '/_next/static/chunks/0xnpya9r0u9i7.css',
    '/_next/static/chunks/turbopack-0h9rni98emk.js',
  ]);
});

test('스타일시트를 빠뜨리지 않는다', () => {
  // href 만 보거나 src 만 보면 한쪽이 통째로 빠진다. 스타일이 빠지면 오프라인에서
  // 화면이 뜨긴 뜨는데 아무 서식이 없는 상태가 되고, 이건 눈으로만 보인다.
  assert.ok(staticAssetsFrom(HTML).some((u) => u.endsWith('.css')));
  assert.ok(staticAssetsFrom(HTML).some((u) => u.endsWith('.js')));
});

test('_next/static 밖은 건드리지 않는다', () => {
  // 형태소와 아이콘은 따로 받는다. 여기서 같이 뽑으면 화면마다 중복해서 훑는다.
  const got = staticAssetsFrom(HTML);
  assert.ok(!got.some((u) => u.startsWith('/glyphs/')));
  assert.ok(!got.some((u) => u.startsWith('/icons/')));
});

test('같은 주소를 두 번 세지 않는다', () => {
  assert.equal(staticAssetsFrom(HTML + HTML).length, 3);
});

function recorder(fail: (url: string) => boolean = () => false) {
  const seen: string[] = [];
  const fetcher = async (url: string) => {
    seen.push(url);
    if (fail(url)) return { ok: false, text: async () => '' };
    if (url === '/glyphs/manifest.json') return { ok: true, text: async () => '["pill","sun"]' };
    if (url.startsWith('/_next/') || url.endsWith('.png') || url.endsWith('.json')) {
      return { ok: true, text: async () => '' };
    }
    return { ok: true, text: async () => HTML };
  };
  return { seen, fetcher };
}

test('화면·청크·형태소·표본을 모두 받아둔다', async () => {
  const { seen, fetcher } = recorder();
  const report = await warmOffline({ fetcher, concurrency: 2 });

  for (const r of WARM_ROUTES) assert.ok(seen.includes(r), `화면 ${r} 을 안 받았다`);
  assert.ok(seen.includes('/_next/static/chunks/0xnpya9r0u9i7.css'));
  assert.ok(seen.includes('/glyphs/pill.png'));
  assert.ok(seen.includes('/glyphs/sun.png'));
  for (const a of WARM_ASSETS) assert.ok(seen.includes(a), `자산 ${a} 을 안 받았다`);
  assert.deepEqual(report.failed, []);
});

test('청크는 화면이 여럿이어도 한 번만 받는다', async () => {
  // 화면 여덟 개가 같은 프레임워크 청크를 공유한다. 화면마다 다시 받으면 예열이
  // 여덟 배가 되고, 예열이 무거워지는 순간 예열을 끄고 싶어진다.
  const { seen, fetcher } = recorder();
  await warmOffline({ fetcher, concurrency: 3 });
  const css = seen.filter((u) => u.endsWith('.css'));
  assert.equal(css.length, 1);
});

test('모델과 OCR 은 예열하지 않는다', async () => {
  // 68 MB. 첫 실행에서 받으면 앱이 안 켜진 것과 구별이 안 된다.
  const { seen, fetcher } = recorder();
  await warmOffline({ fetcher });
  assert.ok(!seen.some((u) => u.startsWith('/models/')));
  assert.ok(!seen.some((u) => u.startsWith('/ocr/')));
});

test('일부가 실패해도 나머지를 계속 받는다', async () => {
  const { seen, fetcher } = recorder((u) => u === '/settings');
  const report = await warmOffline({ fetcher, concurrency: 2 });
  assert.deepEqual(report.failed, ['/settings']);
  assert.ok(seen.includes('/nutrition'));
  assert.ok(seen.includes('/glyphs/pill.png'));
  assert.ok(report.ok > 10);
});

test('형태소 목록을 못 읽어도 화면 예열은 끝낸다', async () => {
  const { seen, fetcher } = recorder((u) => u === '/glyphs/manifest.json');
  const report = await warmOffline({ fetcher });
  assert.ok(!seen.some((u) => u.startsWith('/glyphs/') && u.endsWith('.png')));
  assert.ok(seen.includes('/prescription-antibiotic.png'));
  assert.ok(report.ok > 0);
});

test('던지는 fetch 도 셈으로만 처리한다', async () => {
  const fetcher = async (url: string) => {
    if (url === '/camera') throw new Error('망 끊김');
    if (url === '/glyphs/manifest.json') return { ok: true, text: async () => '[]' };
    return { ok: true, text: async () => '' };
  };
  const report = await warmOffline({ fetcher });
  assert.deepEqual(report.failed, ['/camera']);
});

test('예열 목록이 서비스워커의 셸 목록을 덮는다', async () => {
  // 두 목록이 어긋나면 sw.js 가 미리 담아 둔 화면인데 청크가 없어 안 열리는 상태가
  // 그대로 되살아난다. 실제로 그래서 /nutrition 이 안 열렸다.
  const { readFileSync } = await import('node:fs');
  const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
  const block = sw.slice(sw.indexOf('const SHELL_URLS'), sw.indexOf('const STATIC_FILES'));
  const shell = [...block.matchAll(/'(\/[a-z-]*)'/g)].map((m) => m[1])
    .filter((p) => !p.includes('.'));
  assert.ok(shell.length >= 9, `sw.js 셸 목록을 못 읽었다 (${shell.length}개)`);

  for (const p of shell) {
    assert.ok(WARM_ROUTES.includes(p as (typeof WARM_ROUTES)[number]),
      `sw.js 는 ${p} 를 오프라인 화면으로 담는데 예열 목록에 없다`);
  }
});

/**
 * 앱에 화면을 하나 더 만들면, 그 화면은 아무도 손대지 않는 한 오프라인에서 안 열린다.
 * 안 열리는 티도 안 난다 — 개발도 심사도 망이 있는 데서 하니까.
 *
 * /dose·/people·/provider 가 정확히 그렇게 빠져 있었다. 셋 다 홈이나 설정에서 한 번
 * 눌러서 가는 자리인데, 오프라인에서 누르면 막다른 길이었다.
 */
const OFFLINE_EXEMPT = new Set([
  // 픽토그램 이해도 조사. 앱 안에서 가는 링크가 없고 조사원이 주소로 직접 연다.
  'survey',
]);

test('예열 성공을 확인할 주소는 새 규칙에서만 담기는 것이어야 한다', async () => {
  // 이 주소가 캐시에 남았는지로 "예열이 진짜 먹었는가" 를 판단한다. 그러려면
  // 두 가지가 동시에 참이어야 한다: 예열이 실제로 받아 오는 주소일 것, 그리고
  // sw.js 의 STATIC_FILES 에 있을 것. 후자가 핵심이다 — 접두사 규칙에도 걸리는
  // 주소를 고르면 옛 워커 밑에서도 담겨서, 확인이 늘 통과하는 장식이 된다.
  assert.ok(WARM_ASSETS.includes(WARM_PROBE), '예열이 받지 않는 주소로는 확인할 수 없다');

  const { readFileSync } = await import('node:fs');
  const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
  const block = sw.slice(sw.indexOf('const STATIC_FILES'), sw.indexOf('self.addEventListener'));
  assert.ok(block.includes(`'${WARM_PROBE}'`), `sw.js 의 STATIC_FILES 에 ${WARM_PROBE} 이 없다`);

  const prefixes = ['/_next/static/', '/pictograms/', '/models/', '/ocr/', '/nutrition/', '/glyphs/', '/icons/'];
  for (const p of prefixes) {
    assert.ok(!WARM_PROBE.startsWith(p), `${WARM_PROBE} 은 ${p} 규칙에도 걸려서 확인용으로 못 쓴다`);
  }
});

test('앱의 모든 화면이 오프라인 목록에 있다', async () => {
  const { readdirSync, existsSync } = await import('node:fs');
  const appDir = new URL('../../app/', import.meta.url);
  const routes = readdirSync(appDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && d.name !== 'api')
    .map((d) => d.name)
    .filter((n) => existsSync(new URL(`${n}/page.tsx`, appDir)))
    .filter((n) => !OFFLINE_EXEMPT.has(n));

  assert.ok(routes.length >= 10, `app/ 에서 화면을 못 읽었다 (${routes.length}개)`);
  for (const r of routes) {
    assert.ok(WARM_ROUTES.includes(`/${r}` as (typeof WARM_ROUTES)[number]),
      `/${r} 화면이 오프라인 목록에 없다 — 망이 없으면 막다른 길이 된다`);
  }
});

/**
 * 화면마다 접근성 값을 재어 §4.4 의 서술과 견준다.
 *
 * 문서가 네 가지를 주장한다 — 표적 최소 24픽셀(SC 2.5.8), 이름 없는 조작 없음
 * (SC 4.1.2), 375픽셀에서 가로 스크롤 없음(SC 1.4.10), 그리고 소리에 닿는 경로가
 * 있다는 것이다. 눈으로는 지킬 수 없는 값이라 재어 본다.
 *
 * 실제로 이 훑기가 §4.4 의 문장 하나를 고치게 했다. "최소 24픽셀을 깔았다" 고
 * 적혀 있었는데 /scan 의 닫기 버튼이 15x24 였다. SC 2.5.8 의 간격 예외로 기준은
 * 충족하지만(가장 가까운 표적이 654픽셀 떨어져 있다) 문장은 문자 그대로 사실이
 * 아니었다.
 *
 *     SNAPCARE_BASE=https://snapcare.fly.dev node docs/proposal/tools/check_a11y.mjs
 *
 * 저장소에 node_modules 가 있어야 한다(puppeteer-core).
 */
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.SNAPCARE_BASE || 'http://localhost:3000';
const MIN = 24; // SC 2.5.8 Target Size (Minimum)

// /onboarding 은 없앴다(ef8c97b). 그 자리에 첫 실행의 두 단계가 들어가고,
// 그 뒤에 만들어진 화면들(지난 날들·짝짓기·촬영)도 함께 잰다.
const PATHS = ['/home', '/scan', '/nutrition', '/settings', '/profile',
  '/people', '/device', '/dose', '/history', '/text-size', '/login',
  '/camera', '/pair'];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  defaultViewport: { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true },
  args: ['--disable-gpu', '--hide-scrollbars'],
});

let faults = 0;

for (const p of PATHS) {
  const page = await browser.newPage();
  try {
    await page.goto(BASE + p + '?demo=1', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1200));

    const r = await page.evaluate((MIN) => {
      const sel = 'button, a[href], [role="button"], input, select, textarea,'
        + ' [tabindex]:not([tabindex="-1"])';
      // 접힌 <details> 안은 화면에도 보조기술에도 나오지 않는다. offsetParent 는
      // 그것을 걸러 주지 못하고, innerText 만 비어서 "이름 없는 조작" 으로 잡힌다.
      // 실제로 /device 에서 그렇게 두 건이 잡혔는데 둘 다 글자를 가진 링크였다.
      const els = [...document.querySelectorAll(sel)].filter((e) => {
        const s = getComputedStyle(e);
        if (s.display === 'none' || s.visibility === 'hidden' || e.offsetParent === null) return false;
        return !e.closest('details:not([open])');
      });
      const box = (e) => e.getBoundingClientRect();
      const name = (e) => (e.innerText || '').trim() || e.getAttribute('aria-label')
        || e.getAttribute('aria-labelledby') || e.title || (e.textContent || '').trim();

      // 작은 표적. 간격 예외를 함께 본다 — 24픽셀 원이 다른 표적의 원과
      // 겹치지 않으면 SC 2.5.8 을 충족한다.
      const small = [];
      for (const e of els) {
        const a = box(e);
        if (a.width >= MIN && a.height >= MIN) continue;
        const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
        let nearest = Infinity;
        for (const o of els) {
          if (o === e) continue;
          const b = box(o);
          const bx = b.left + b.width / 2, by = b.top + b.height / 2;
          const dx = Math.max(0, Math.abs(ax - bx) - (Math.max(MIN, b.width) / 2 + MIN / 2));
          const dy = Math.max(0, Math.abs(ay - by) - (Math.max(MIN, b.height) / 2 + MIN / 2));
          nearest = Math.min(nearest, Math.hypot(dx, dy));
        }
        small.push({
          size: `${Math.round(a.width)}x${Math.round(a.height)}`,
          txt: name(e).slice(0, 22).replace(/\n/g, ' '),
          gap: Math.round(nearest),
          spared: nearest > 0,      // 간격 예외로 충족
        });
      }

      return {
        n: els.length,
        small,
        unnamed: els.filter((e) => !name(e))
          .map((e) => e.tagName.toLowerCase() + '.' + (e.className || '').toString().slice(0, 24)),
        hscroll: document.documentElement.scrollWidth > innerWidth,
        say: document.querySelectorAll('[data-say]').length,
      };
    }, MIN);

    const hard = r.small.filter((s) => !s.spared);
    const ok = !hard.length && !r.unnamed.length && !r.hscroll;
    if (!ok) faults += 1;
    console.log(`${ok ? '  ' : '!!'} ${p.padEnd(12)} 조작 ${String(r.n).padStart(3)}`
      + ` · ${MIN}px 미만 ${r.small.length}(간격 예외로 충족 ${r.small.length - hard.length})`
      + ` · 이름 없는 조작 ${r.unnamed.length} · 가로 스크롤 ${r.hscroll}`
      + ` · 소리에 닿는 자리 ${r.say}`);
    for (const s of r.small) {
      console.log(`      ${s.size} "${s.txt}" — 가장 가까운 표적까지 ${s.gap}px`
        + `${s.spared ? ' (간격 예외로 충족)' : ' ← 기준 미달'}`);
    }
    for (const u of r.unnamed) console.log(`      이름 없음: ${u}`);
  } catch (e) {
    faults += 1;
    console.log(`!! ${p.padEnd(12)} 실패 (${e.name})`);
  }
  await page.close();
}

await browser.close();
console.log(faults ? `\n${faults}개 화면에서 걸렸다` : `\n${PATHS.length}개 화면 모두 통과`);
process.exit(faults ? 1 : 0);

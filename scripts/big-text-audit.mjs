/**
 * 글자를 키웠을 때 화면이 깨지는가.
 *
 * 왜 필요한가
 * -----------
 * 글자 크기를 32px(기본의 두 배)까지 열어 두고 홈과 판정 화면만 눈으로 봤다. 나머지
 * 화면들은 재 보지 않았고, 실제로 여러 군데가 깨져 있었다.
 *
 *   - 설정 화면: 동그란 얼굴 그림이 40×80 짜리 타원이 되고, 스위치가 88 에서 61 로 눌렸다
 *   - 판정 화면: "Morning at 8:00 AM" 이 52px 칸에 갇혀 "Mor / nin / g at" 으로 끊겼다
 *   - 판정 화면: 듣기 버튼이 옆 버튼 높이를 따라가 112×160 짜리 타원이 됐다
 *   - 잠금 화면: 그림 열쇠 격자가 415px 이 되어 화면(375) 밖으로 나갔다
 *   - 카메라 화면: 데모 목록 두 칸이 안 맞아 화면 전체에 가로 스크롤이 생겼다
 *
 * 원인은 두 가지였다.
 *
 *   1. 가로줄(flex) 안에서 크기를 못박은 그림들이 `shrink-0` 없이 놓여, 옆의 글자가
 *      커지자 대신 눌렸다.
 *   2. 이 앱의 크기가 전부 rem 이라, 글자를 키우면 **여백과 장식도 같이** 커졌다.
 *      늘어난 자리를 글이 아니라 여백이 가져갔다.
 *
 * 그래서 규칙이 생겼다 — **틀은 px, 내용은 rem** (app/globals.css 의 `.sc-row`).
 *
 * 기본 크기에서는 자리가 남아 아무 일도 안 생기므로, 이것들은 전부 **큰 글자를 켜
 * 봐야만 보이는** 결함이었다. 눈으로 화면마다 확인하는 것으로는 다음에 또 놓친다.
 *
 *     node scripts/big-text-audit.mjs            # 검사 코드를 낸다
 *
 * 브라우저가 필요해 `npm test` 에는 안 들어간다. `scripts/textless-audit.mjs` 와 같은
 * 자리에 있고 같은 방식으로 쓴다 — 화면을 하나 더 만들거나 줄 배치를 고치면 한 번
 * 돌려 보라는 뜻이다.
 */

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');

/** 375×812 (아이폰 SE 폭) 에서 본다. 이보다 좁은 폰은 대상 지역에 거의 없다. */
const SCREENS = [
  '/home', '/camera', '/scan', '/nutrition', '/settings', '/device',
  '/login', '/profile', '/people', '/dose', '/provider', '/history', '/text-size',
];

/**
 * 다섯 크기를 한 번에 훑는다 (lib/a11y/textSize.ts 의 ROOT_PX).
 *
 * 뿌리 font-size 를 바꾸는 것이 이 앱이 글자 크기를 바꾸는 방식 그대로라, 설정을
 * 다섯 번 오가지 않고 한 화면에서 다섯 크기를 다 볼 수 있다.
 */
export const PROBE = `(() => {
  const root = document.documentElement;
  const orig = root.style.fontSize;
  const out = {};

  for (const px of [16, 18, 22, 26, 32]) {
    root.style.fontSize = px + 'px';

    const doc = document.scrollingElement;
    const vw = doc.clientWidth;
    const name = (el) => (el.innerText || String(el.className) || el.tagName)
      .replace(/\\s+/g, ' ').slice(0, 30);

    /* 가로로 미는 칸 안의 것은 밖으로 나가도 된다 — 밀어서 볼 수 있다. */
    const inScroller = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll') return true;
      }
      return false;
    };

    const squashed = [], offscreen = [], clipped = [];

    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;

      /* 1) 정사각형으로 적어 놓고 눌린 것 — 동그라미가 타원이 되면 얼룩이 된다.
            h-10 w-10 처럼 **같은 수**로 적힌 것만 본다 (스위치 h-6 w-11 은 원래 알약이다). */
      const cls = String(el.className);
      const h = cls.match(/(?:^|\\s)h-(\\d+)(?:\\s|$)/);
      const w = cls.match(/(?:^|\\s)w-(\\d+)(?:\\s|$)/);
      if (h && w && h[1] === w[1] && Math.abs(r.width - r.height) > 3) {
        squashed.push(name(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      }

      /* 2) 화면 밖으로 나간 것 — 가로 스크롤은 WCAG 1.4.10 이 막는다 */
      if ((r.right > vw + 1 || r.left < -1) && !inScroller(el)) offscreen.push(name(el));

      /* 3) 부모 안에서 잘린 것 */
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0
          && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') {
        clipped.push(name(el) + ' ' + el.clientWidth + '<' + el.scrollWidth);
      }
    }

    out[px] = {
      horizontalScroll: doc.scrollWidth > vw + 1,
      squashed: squashed.slice(0, 3),
      offscreen: offscreen.slice(0, 3),
      clipped: clipped.slice(0, 3),
    };
  }

  root.style.fontSize = orig;
  return JSON.stringify({ path: location.pathname, out });
})()`;

console.log('글자를 키웠을 때 화면이 깨지는가\n');
console.log(`대상: ${BASE}   화면 폭 375`);
console.log(`화면 ${SCREENS.length}개: ${SCREENS.join(' ')}\n`);
console.log('화면마다 아래를 실행해 다섯 크기 전부에서 squashed / offscreen / clipped 가');
console.log('비어 있고 horizontalScroll 이 false 인지 본다.\n');
console.log('/scan 과 /dose 는 상태가 있어야 열린다 — /camera 에서 데모 항목을 눌러 들어간다.\n');
console.log(PROBE);
console.log('\n마지막으로 확인한 날: 2026-08-03 — 13개 화면 × 5개 크기, 전부 0');

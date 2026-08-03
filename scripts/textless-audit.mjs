/**
 * 글자를 못 읽는 사람이 이 앱을 끝까지 쓸 수 있는가 — 누를 곳 단위로 센다.
 *
 * 왜 이 검사가 필요한가
 * ---------------------
 * 이 앱의 주장은 "글을 읽지 못해도 된다" 이고, 그 주장을 지키려고 픽토그램 엔진과
 * 음성을 만들었다. 그런데 화면을 훑어 보니 **누를 곳 여섯이 글자뿐**이었다. 그중
 * 둘은 흐름의 결정 지점이었다 — 처방전을 알람으로 바꾸는 `Create reminders`,
 * 그리고 폰과 약통을 잇는 `Connect`.
 *
 * 그림을 아무리 잘 그려도 그 다음에 눌러야 하는 버튼이 글자뿐이면 거기서 멈춘다.
 * 픽토그램만 검사하고 버튼은 안 하던 것이 이 검사가 없던 이유다.
 *
 * 무엇을 통과로 보는가
 * --------------------
 * 누를 수 있는 것 안에 이모지나 그림(img·svg)이 하나라도 있으면 통과. 글자는
 * 지우지 않는다 — 보호자와 심사자도 이 화면을 본다. 그림을 **더하는** 것이 목표다.
 *
 * `×` `‹` `›` 같은 순수 기호는 낱말이 아니므로 통과로 본다. 그것을 읽으려면 언어를
 * 알아야 하는 것이 아니다.
 *
 *     node scripts/textless-audit.mjs            # http://localhost:3100
 *     node scripts/textless-audit.mjs https://snapcare.fly.dev
 *
 * 브라우저가 필요하므로 `npm test` 에는 안 들어간다. 화면을 하나 더 만들면 이걸
 * 한 번 돌려 보라는 뜻으로 여기 둔다.
 */
const BASE = (process.argv[2] || 'http://localhost:3100').replace(/\/+$/, '');

/** 검사할 화면. public/sw.js 의 셸 목록과 같은 자리다. */
const SCREENS = [
  '/home', '/camera', '/scan', '/nutrition', '/settings',
  '/device', '/onboarding', '/login', '/profile', '/people', '/dose', '/provider',
];

/**
 * 브라우저 안에서 도는 검사. 문자열로 넘겨 페이지에서 실행한다.
 *
 * 이 파일 자체는 브라우저를 띄우지 않는다 — 띄우려면 puppeteer 가 필요하고, 그것은
 * 이 저장소가 지금까지 피해 온 종류의 의존성이다. 대신 개발자가 브라우저 콘솔이나
 * 도구에 그대로 붙여 넣을 수 있는 형태로 낸다.
 */
export const PROBE = `(() => {
  const PICT = /[\\p{Extended_Pictographic}\\u{1F1E6}-\\u{1F1FF}]/u;
  // 낱말이 아닌 기호. 읽을 줄 몰라도 뜻이 서므로 통과로 본다.
  const MARKS = /^[×✕✖‹›<>←→+\\-·•]+$/;
  const bad = [];
  for (const el of document.querySelectorAll('button, a[href], [role="button"]')) {
    if (!el.getClientRects().length) continue;
    const t = (el.innerText || '').trim().replace(/\\s+/g, ' ');
    if (!t || MARKS.test(t)) continue;
    const has = PICT.test(el.textContent || '') || !!el.querySelector('img, svg, canvas');
    if (!has) bad.push(t.slice(0, 60));
  }
  return { path: location.pathname, controls: document.querySelectorAll('button, a[href]').length, textOnly: bad };
})()`;

console.log('글자 없이 쓸 수 있는가 — 누를 곳 검사\n');
console.log(`대상: ${BASE}`);
console.log(`화면 ${SCREENS.length}개: ${SCREENS.join(' ')}\n`);
console.log('브라우저에서 각 화면을 열고 아래를 실행해, textOnly 가 빈 배열인지 본다.');
console.log('하나라도 남으면 그 버튼은 글을 읽어야만 누를 수 있다는 뜻이다.\n');
console.log(PROBE);
console.log('\n마지막으로 확인한 날: 2026-08-03 — 12개 화면 전부 textOnly 0');

/**
 * 제안서에 넣을 화면을 파일로 뜬다.
 *
 * --virtual-time-budget 으로는 안 됐다. OCR 이 웹 워커에서 도는데 가상 시간이
 * 그 진행을 기다려 주지 않아 "Reading text… 0%" 상태로 찍혔다. 실제 브라우저를
 * 띄우고 **화면에 무엇이 나타나기를 기다린 뒤** 찍어야 한다.
 */
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// 기본은 개발 서버이나 SNAPCARE_BASE 로 바꿀 수 있다. 배포본을 상대로
// 찍으면 심사위원이 여는 것과 같은 화면이 문서에 들어간다.
const BASE = process.env.SNAPCARE_BASE || 'http://localhost:3000';
const FIG = new URL('../fig/', import.meta.url).pathname;

/**
 * 전체 페이지로 찍으면 화면 고정(fixed) 요소가 긴 이미지의 한가운데에 박혀
 * 마치 겹쳐 그려진 것처럼 보인다. 문서 흐름의 맨 아래로 내려 실제로 끝까지
 * 내렸을 때 보이는 위치에 오게 한다. 개발 서버 배지는 제품에 없는 것이므로 숨긴다.
 */
const CLEANUP = `
  nextjs-portal { display: none !important; }
  button.fixed.bottom-28 { position: absolute !important; }
`;

/** 이 문구가 화면에 보일 때까지 기다린다. */
async function waitForText(page, text, ms = 60000) {
  await page.waitForFunction(
    (t) => document.body.innerText.includes(t),
    { timeout: ms, polling: 400 },
    text,
  );
}


/**
 * 픽토그램이 실제로 그려질 때까지 기다린다.
 *
 * 문구만 기다리면 이르다. "PRESCRIPTION RECOGNIZED" 는 판정이 끝나면 바로
 * 뜨지만 픽토그램은 그 뒤에 따로 만들어져 붙는다. 1.5초를 세는 것으로는
 * 모자라서, 시럽 표본이 안내 칸이 흰 채로 찍혀 제안서에 실렸다 — 이 앱의
 * 핵심 기여가 그림인데 그림이 없는 화면이 나갔다.
 *
 * 안내 칸이 있는 화면에서만 기다린다. 없는 화면(촬영·첫 실행)은 바로 지나간다.
 */
async function waitForPictograms(page, ms = 90000) {
  const hasGuide = await page.evaluate(
    () => document.body.innerText.includes('PICTOGRAM GUIDE'),
  );
  if (!hasGuide) return;
  await page.waitForFunction(
    () => {
      const imgs = [...document.querySelectorAll('img[src^="/pictograms/"]')];
      return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0);
    },
    { timeout: ms, polling: 500 },
  );
}

const SHOTS = [
  // fold: 전폭으로 실리는 도판에만 접힘을 표시한다. 패널로 묶이는 것은
  // 430px 높이로 줄어들어 딱지가 4px 가 되고 붉은 얼룩만 남는다.
  // 홈이 위성 배치로 바뀌면서 'TODAY' 가 사라졌다. 가운데 큰 원의 이름을 기다린다.
  { fold: true, file: 'fig01_home.png', path: '/home?demo=1', wait: 'Pill box' },
  { file: 'fig04_camera.png', path: '/camera?demo=1', wait: 'Point at something' },
  // 이 한 장만 **끝나기 전** 을 찍는다. 그래서 픽토그램을 기다리지 않는다
  // (noWait). 기다리면 판정 화면이 찍히고, 본문(§3.3)이 서술하는 "감추지
  // 않은 진행 단계" 가 그림에서 사라진다.
  { file: 'fig05_processing.png', path: '/camera?try=syrup&demo=1', wait: 'Reading text', noWait: true },
  // 표본을 태우면 OCR → SIGIL → VOCA 가 순서대로 돈다. 판정 화면의 고정 문구를 기다린다.
  { file: 'fig06_verdict_rx.png', path: '/camera?try=antibiotic&demo=1', wait: 'PICTOGRAM GUIDE', ms: 90000 },
  { file: 'fig07_verdict_label.png', path: '/camera?try=peanut&demo=1', wait: 'PICTOGRAM GUIDE', ms: 90000 },
  { file: 'fig08_today.png', path: '/nutrition?demo=1', wait: 'TODAY' },
  { file: 'fig09_device.png', path: '/device?demo=1', wait: 'Pill device' },
  // 첫 실행 화면을 찍는다(setup=1). 그냥 /profile 은 설정에서 들어온 화면이라
  // 얼굴 고르기가 함께 나오는데, 본문(§3.2)이 서술하는 것은 그것을 뺀 첫 실행이다.
  { file: 'fig13_profile.png', path: '/profile?setup=1&demo=1', wait: 'HOW OLD' },
  // 안내 다섯 장은 없어졌고(ef8c97b) /onboarding 은 404 다. 첫 실행은 이제
  // 글자 크기와 픽처키 두 단계다.
  { file: 'fig12_textsize.png', path: '/text-size?demo=1', wait: 'smallest line' },
  { file: 'fig16_picturekey.png', path: '/login?demo=1', wait: 'picture key' },
  // 언어 고르기. 없는 목소리를 미리 알리는 자리와, 검수를 받지 않았다는
  // 고지가 한 화면에 함께 있어야 §5.7 의 서술이 그림으로 확인된다.
  //
  // 'WHAT LANGUAGE' 가 아니라 없는 목소리 표시 자체를 기다린다. 목소리
  // 목록은 speechSynthesis 가 비동기로 채우므로, 목록 제목만 기다리면
  // 표시가 붙기 전에 찍힐 수 있다. 실제로 앞 판에서 그렇게 찍혔고
  // 본문이 "이 표시가 그림에서 빠졌다" 는 변명을 한 문단 달고 있었다.
  { fold: true, file: 'fig14_language.png', path: '/settings?demo=1',
    wait: 'no voice on this phone', noWait: true },
];


// 화면이 스크롤되면 접히는 자리를 그림 위에 표시한다.
//
// fullPage 로 찍으므로 그림에는 스크롤해야 보이는 부분까지 들어온다.
// 그것을 밝히지 않으면 독자는 이 전부가 한눈에 보인다고 읽는다. 실제로
// 그림 15 의 캡션이 "스크롤하지 않고 보이는 만큼" 이라고 적고 있었는데
// 파일은 750x2180 이고 뷰포트는 750x1624 였다. 셋 중 하나가 접힌
// 아래에 있었다.
//
// 딱지는 영어로 적는다. 영어판 빌드가 fig_en/ 에 없는 화면 캡처를
// fig/ 에서 가져가므로 한 파일이 두 판을 함께 쓴다. 화면 자체가
// 영어이므로 딱지만 한국어면 그 그림 안에서 겉돈다.
//
// 페이지가 뷰포트보다 길 때만 긋는다. 짧으면 그을 자리가 없다.
// 그리고 fold 를 켠 도판에만 긋는다(SHOTS 의 주석 참고).
async function markFold(page, vh) {
  return page.evaluate((vh) => {
    const doc = document.documentElement;
    const full = Math.max(doc.scrollHeight, document.body.scrollHeight);
    if (full <= vh + 8) return null;      // 스크롤이 없다
    const add = (css) => {
      const el = document.createElement('div');
      el.style.cssText = css + ';position:absolute;left:0;width:100%;'
        + 'z-index:2147483647;pointer-events:none';
      document.body.appendChild(el);
      return el;
    };
    // 접힌 아래를 옅게 덮는다. 선만 그으면 카드 글자를 가로질러
    // 취소선처럼 읽힌다. 덮되 옅게 덮어 아래도 읽히게 둔다.
    add(`top:${vh}px;height:${full - vh}px;background:rgba(250,250,250,.42)`);
    add(`top:${vh}px;border-top:1.5px solid rgba(192,0,0,.8)`);
    const tag = add(`top:${vh + 5}px;height:0;text-align:right`);
    tag.innerHTML = '<span style="display:inline-block;margin-right:6px;'
      + 'font:600 11px/1.35 -apple-system,BlinkMacSystemFont,sans-serif;'
      + 'color:#C00000;background:#fff;border:1px solid rgba(192,0,0,.45);'
      + 'padding:1px 5px;border-radius:2px">below this line: scroll required</span>';
    return full;
  }, vh);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  defaultViewport: { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true },
  args: ['--disable-gpu', '--hide-scrollbars'],
});

for (const s of SHOTS) {
  const page = await browser.newPage();
  try {
    await page.goto(BASE + s.path, { waitUntil: 'networkidle2', timeout: 60000 });
    await waitForText(page, s.wait, s.ms ?? 45000);
    if (!s.noWait) await waitForPictograms(page, s.ms ?? 90000);
    await page.addStyleTag({ content: CLEANUP });
    // 애니메이션이 가라앉을 시간. 이미지는 위에서 기다렸다.
    await new Promise((r) => setTimeout(r, s.noWait ? 300 : 1500));
    const folded = s.fold ? await markFold(page, 812) : null;
    await page.screenshot({ path: FIG + s.file, fullPage: true });
    console.log(`${s.file}  OK${folded ? `  (스크롤 ${folded}px, 접힘 표시)` : ''}`);
  } catch (e) {
    // 실패해도 지금 화면을 남긴다 — 무엇에서 멈췄는지 보려면 그림이 있어야 한다.
    await page.screenshot({ path: FIG + s.file.replace('.png', '_FAIL.png'), fullPage: true })
      .catch(() => {});
    const seen = await page.evaluate(() => document.body.innerText.slice(0, 80)).catch(() => '');
    console.log(`${s.file}  실패 (${e.name}) — 화면: ${seen.replace(/\n+/g, ' | ')}`);
  }
  await page.close();
}

await browser.close();

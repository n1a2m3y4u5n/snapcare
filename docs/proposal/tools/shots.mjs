/**
 * 제안서에 넣을 화면을 파일로 뜬다.
 *
 * --virtual-time-budget 으로는 안 됐다. OCR 이 웹 워커에서 도는데 가상 시간이
 * 그 진행을 기다려 주지 않아 "Reading text… 0%" 상태로 찍혔다. 실제 브라우저를
 * 띄우고 **화면에 무엇이 나타나기를 기다린 뒤** 찍어야 한다.
 */
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:3000';
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
  { file: 'fig01_home.png', path: '/home?demo=1', wait: 'TODAY' },
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
  { file: 'fig12_onboarding.png', path: '/onboarding?demo=1', wait: 'Point & scan' },
  // 언어 고르기. 없는 목소리를 미리 알리는 자리와, 검수를 받지 않았다는
  // 고지가 한 화면에 함께 있어야 §5.7 의 서술이 그림으로 확인된다.
  { file: 'fig14_language.png', path: '/settings?demo=1', wait: 'WHAT LANGUAGE', noWait: true },
];

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
    await page.screenshot({ path: FIG + s.file, fullPage: true });
    console.log(`${s.file}  OK`);
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

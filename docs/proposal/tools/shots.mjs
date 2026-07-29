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

const SHOTS = [
  { file: 'fig01_home.png', path: '/home?demo=1', wait: 'TODAY' },
  { file: 'fig04_camera.png', path: '/camera?demo=1', wait: 'Point at something' },
  { file: 'fig05_processing.png', path: '/camera?try=syrup&demo=1', wait: 'Reading text' },
  // 표본을 태우면 OCR → SIGIL → VOCA 가 순서대로 돈다. 판정 화면의 고정 문구를 기다린다.
  { file: 'fig06_verdict_rx.png', path: '/camera?try=antibiotic&demo=1', wait: 'PICTOGRAM GUIDE', ms: 90000 },
  { file: 'fig07_verdict_label.png', path: '/camera?try=peanut&demo=1', wait: 'PICTOGRAM GUIDE', ms: 90000 },
  { file: 'fig08_today.png', path: '/nutrition?demo=1', wait: 'TODAY' },
  { file: 'fig09_device.png', path: '/device?demo=1', wait: 'Pill device' },
  { file: 'fig13_profile.png', path: '/profile?demo=1', wait: 'HOW OLD' },
  { file: 'fig12_onboarding.png', path: '/onboarding?demo=1', wait: 'Point & scan' },
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
    await page.addStyleTag({ content: CLEANUP });
    // 애니메이션과 이미지 로딩이 가라앉을 시간
    await new Promise((r) => setTimeout(r, 1500));
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

/*
  로고 한 장 → 앱이 쓰는 아이콘 전부.

    node scripts/logo.mjs                     (public/logo.png 을 쓴다)
    node scripts/logo.mjs <원본.png|jpeg>     (그 파일을 public/logo.png 로 들여오고 쓴다)

  왜 스크립트인가
  ---------------
  아이콘이 다섯 벌이다 — 파비콘, PWA 192·512, 마스커블 512, 애플 터치. 손으로 만들면
  로고를 고칠 때마다 다섯 번 자르게 되고, 그러다 한 벌이 옛 그림으로 남는다. 홈 화면
  아이콘은 새 것인데 브라우저 탭만 옛 것인 앱을 여럿 봤다.

  왜 글자 전체가 아니라 **S** 인가
  --------------------------------
  로고는 두 줄짜리 가로 글자다("Snap Care"). 정사각형 아이콘에 그것을 통째로 넣으면
  512px 에서도 글자 획이 실오라기가 되고, 32px 파비콘에서는 회색 얼룩이 된다.

  첫 글자는 그 크기에서 살아남는다. 그리고 이 로고에서 사람이 기억하는 것 — 연둣빛,
  손으로 그린 굵은 획, 빗금 무늬 — 이 전부 그 한 글자에 들어 있다. 브랜드가 자기
  머리글자를 아이콘으로 쓰는 것은 흔한 일이고, 여기서는 그것이 유일하게 읽히는 선택이다.

  글자 전체는 `public/logo.png` 로 남는다. 폭이 있는 자리(문서·포스터·넓은 화면 머리)는
  그쪽을 쓴다.

  무엇을 조심하나
  ---------------
  · **여백을 먼저 잘라낸다.** 사진으로 찍은 그림은 흰 여백이 넓고, 그대로 줄이면
    아이콘 한가운데에 작은 그림이 앉는다.
  · **마스커블은 더 띄운다.** 안드로이드가 제 모양으로 잘라내므로 가장자리 20% 는
    잘려 나간다고 봐야 한다(W3C 안전 영역은 지름의 80%).
  · **바탕을 깐다.** 투명한 아이콘은 어두운 배경에서 사라진다. 이 앱의 오프화이트다.
*/
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

/**
 * 바탕색. **로고의 종이색과 같아야 한다.**
 *
 * 이 앱의 오프화이트(#F4F3EF)를 썼더니 로고의 흰 종이가 그 위에 흰 네모로 떠올랐다 —
 * 글자를 담은 액자처럼 보였고, 액자는 이 로고에 없는 것이다. 원본이 흰 종이에 그린
 * 그림이므로 흰색이 맞다.
 */
const BG = { r: 0xff, g: 0xff, b: 0xff, alpha: 1 };

const LOGO = 'public/logo.png';
const OUT = 'public/icons';

/**
 * 머리글자가 있는 자리를 **잰다.**
 *
 * 처음에는 화소 좌표를 박아 뒀다. 눈대중으로 잡은 값이라 S 의 왼쪽이 잘리고 옆 글자
 * 'n' 이 딸려 들어왔고, 그것을 512px 로 키워 놓고서야 알았다. 로고를 다시 그리면
 * 그 일이 또 난다.
 *
 * 재는 것은 어렵지 않다. 첫 줄에서 잉크가 있는 세로 띠를 찾으면 글자 덩어리가
 * 나뉘고, 그중 첫째가 머리글자다. 로고를 다시 그려도 따라온다.
 */
async function firstLetterBox() {
  const W = 800;
  const { data, info } = await sharp(LOGO).resize(W).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const ink = (x, y) => {
    const i = (y * w + x) * ch;
    return data[i] + data[i + 1] + data[i + 2] < 660;   // 흰 종이보다 어두우면 잉크
  };

  /** 잉크가 있는 구간들. 한두 화소는 사진 잡음이라 안 센다. */
  const bands = (len, has) => {
    const out = [];
    let from = null;
    for (let i = 0; i < len; i++) {
      const on = has(i);
      if (on && from === null) from = i;
      if (!on && from !== null) { if (i - from > 8) out.push([from, i]); from = null; }
    }
    if (from !== null) out.push([from, len]);
    return out;
  };

  // 첫 줄을 세로로 먼저 가른다. 로고가 두 줄이고 머리글자는 첫 줄에 있다.
  const lines = bands(h, (y) => {
    let n = 0;
    for (let x = 0; x < w; x++) if (ink(x, y)) n++;
    return n > 2;
  });
  if (lines.length === 0) throw new Error('로고에서 글자를 못 찾았다');
  const [top0, top1] = lines[0];

  // 그 줄 안에서 글자 덩어리를 가르고 첫째를 고른다.
  const letters = bands(w, (x) => {
    let n = 0;
    for (let y = top0; y < top1; y++) if (ink(x, y)) n++;
    return n > 2;
  });
  if (letters.length === 0) throw new Error('첫 줄에서 글자를 못 찾았다');
  const [x0, x1] = letters[0];

  /*
    머리글자의 세로 범위는 **그 글자의 칸 안에서** 다시 잰다. 줄 전체의 범위를 쓰면
    옆 글자가 더 높거나 낮을 때 그만큼 여백이 붙는다.
  */
  let y0 = Infinity;
  let y1 = -1;
  for (let y = top0; y < top1; y++) {
    let n = 0;
    for (let x = x0; x < x1; x++) if (ink(x, y)) n++;
    if (n > 2) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  if (y1 < 0) throw new Error('머리글자의 세로 범위를 못 쟀다');

  const k = (await sharp(LOGO).metadata()).width / w;
  return {
    left: Math.round(x0 * k), top: Math.round((y0 ?? 0) * k),
    width: Math.round((x1 - x0) * k), height: Math.round((y1 - (y0 ?? 0)) * k),
  };
}

async function main() {
  const src = process.argv[2];
  if (src) {
    await mkdir('public', { recursive: true });
    await sharp(src).png().toFile(LOGO);
    console.log('들여왔다', LOGO);
  }
  await mkdir(OUT, { recursive: true });

  /*
    화면에 놓을 판을 따로 만든다 — 여백을 턴 것.

    원본은 사진이라 흰 종이가 넓게 남는다. 그대로 화면에 놓으면 로고가 제 상자의
    가운데에 작게 앉고, 그만큼 자리를 먹으면서 작아 보인다. 여백을 털면 같은 높이에서
    글자가 훨씬 크다.

    `trim` 만 부른다. `extract` 와 같이 부르면 순서가 뒤집히는데(아래 참고) 여기서는
    자를 것이 없으므로 그 함정에 안 걸린다.
  */
  await sharp(LOGO).trim({ threshold: 12 }).png({ compressionLevel: 9, palette: true })
    .toFile('public/logo-mark.png');
  console.log('썼다 public/logo-mark.png (여백 턴 것)');

  const box = await firstLetterBox();
  console.log('머리글자를 찾았다', box);

  /** 머리글자를 오프화이트 정사각형 가운데에. `pad` 는 가장자리 여백 비율. */
  async function mark(pad) {
    /*
      `trim()` 을 붙이면 안 된다.

      sharp 의 파이프라인은 부르는 순서가 아니라 **정해진 순서**로 돈다. `trim` 이
      `extract` 보다 먼저라, `.extract(box).trim()` 은 "잘라낸 뒤 여백을 턴다" 가
      아니라 "로고 전체의 여백을 턴 다음 그 그림에서 box 를 잘라낸다" 가 된다.
      좌표가 어긋난 그림이 나오고, 512px 로 키워 보고서야 알았다.

      여기서는 필요도 없다 — 위에서 잉크를 재서 자리를 잡았으므로 이미 딱 맞는다.
    */
    const cut = await sharp(LOGO).extract(box).toBuffer();
    const { width, height } = await sharp(cut).metadata();
    const side = Math.round(Math.max(width, height) / (1 - pad * 2));
    return sharp({ create: { width: side, height: side, channels: 4, background: BG } })
      .composite([{ input: cut, gravity: 'center' }])
      .png()
      .toBuffer();
  }

  const plain = await mark(0.1);
  const masked = await mark(0.22);

  for (const [name, buf, size] of [
    ['icon-192.png', plain, 192],
    ['icon-512.png', plain, 512],
    ['apple-touch-icon.png', plain, 180],
    ['icon-maskable-512.png', masked, 512],
  ]) {
    await sharp(buf).resize(size, size, { fit: 'cover' }).png().toFile(join(OUT, name));
    console.log('썼다', join(OUT, name), `${size}×${size}`);
  }

  // 파비콘. `app/favicon.ico` 는 Next 가 자동으로 링크를 거는 자리라 이름이 정확해야 한다.
  const png32 = await sharp(plain).resize(32, 32, { fit: 'cover' }).png().toBuffer();
  await writeFile('app/favicon.ico', ico(png32, 32));
  console.log('썼다 app/favicon.ico 32×32');
}

/** PNG 한 장을 담은 최소 ICO. */
function ico(png, size) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(1, 4);
  const dir = Buffer.alloc(16);
  dir.writeUInt8(size % 256, 0);
  dir.writeUInt8(size % 256, 1);
  dir.writeUInt16LE(1, 4);
  dir.writeUInt16LE(32, 6);
  dir.writeUInt32LE(png.length, 8);
  dir.writeUInt32LE(head.length + dir.length, 12);
  return Buffer.concat([head, dir, png]);
}

await main();

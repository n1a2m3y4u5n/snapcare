/*
  로고 두 장 → 앱이 쓰는 그림 전부.

    node scripts/logo.mjs <워드마크> <마크>

  로고가 왜 둘인가
  ----------------
  자리가 둘이고 요구가 반대다.

    **메인 화면 머리** — 폭이 있다. 앱 이름이 읽혀야 하므로 두 줄짜리 글자 로고를 쓴다.
    **아이콘** — 정사각형이고 32px 까지 작아진다. 글자 로고를 여기 넣으면 512px 에서도
    획이 실오라기가 되고 파비콘에서는 얼룩이 된다. 그래서 마크(디스펜서 P)를 쓴다.

  한때는 글자 로고 한 장으로 둘 다 만들려고 머리글자 'S' 를 잘라 냈다. 자리를 재서
  자르는 코드가 필요했고, 그 코드가 두 번 틀렸다(눈대중 좌표, 그리고 누끼 딴 그림에서
  투명을 잉크로 읽은 것). 그림 두 장을 받으면 그 코드가 통째로 없어진다.

  아이콘 다섯 벌을 손으로 만들지 않는 이유
  ---------------------------------------
  파비콘, PWA 192·512, 마스커블 512, 애플 터치. 손으로 하면 로고를 고칠 때마다 다섯
  번 자르게 되고, 그러다 한 벌이 옛 그림으로 남는다 — 홈 화면 아이콘은 새 것인데
  브라우저 탭만 옛 것인 앱을 여럿 봤다.

  무엇을 조심하나
  ---------------
  · **아이콘 바탕은 흰색을 깐다.** 투명한 아이콘은 iOS 에서 검게 합성되고 안드로이드
    에서도 배경에 따라 사라진다. 마크 자체는 투명이라 어디에 놓든 이 결정이 필요하다.
  · **마스커블은 더 띄운다.** 안드로이드가 제 모양으로 잘라내므로 가장자리 20% 는
    잘려 나간다고 봐야 한다(W3C 안전 영역은 지름의 80%).
  · **화면용 판은 투명 그대로.** 앱 배경 위에 놓이므로 흰 종이가 붙으면 액자가 된다.
*/
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

/** 아이콘 바탕. 마크가 흰 선으로 그려져 있어 밝은 바탕이 필요하다. */
const BG = { r: 0xff, g: 0xff, b: 0xff, alpha: 1 };

const OUT = 'public/icons';

/**
 * 글자 로고를 **똑바로 세운다.**
 *
 * 손으로 그린 원본이 조금 기울어 있다. 재 보면 첫 줄의 밑선이 -3.6°, 둘째 줄이
 * -8.7° 다 — 두 줄이 서로 다른 각도라 어느 회전으로도 둘 다 완전히 눕히지는 못한다.
 * 6° 가 눈에 가장 수평으로 보이는 값이고, 4°·6°·8° 를 나란히 놓고 골랐다.
 *
 * 그림 자체를 고치지 않고 여기서 도는 이유: 원본은 사람이 그린 것이고, 다시 그려
 * 올 때마다 같은 손질을 잊지 않고 해야 한다. 스크립트에 두면 다음 판에도 따라온다.
 */
const TILT = 6;

/*
  가운데 맞추기를 여기서 하지 않는다 — **화면 쪽에서 한다.**

  한동안 여기서 했다. 여백을 턴 그림을 화면 가운데 놓으면 상자는 가운데인데 눈에는
  왼쪽으로 치우쳐 보인다(오른쪽 위의 사진기와 반짝임이 상자를 넓혀 놓기 때문이다).
  그래서 왼쪽에 투명을 채워 그림을 오른쪽으로 밀었다.

  그 방법은 **폭을 꽉 채우는 것과 싸운다.** 채운 여백만큼 상자가 넓어지고, 같은
  화면 폭 안에서 그만큼 그림이 작아진다. 지금은 글자가 화면 폭을 거의 채우기를
  원하므로, 파일은 잉크에 딱 맞게 두고 미는 일은 화면에서 `translateX` 로 한다 —
  그쪽은 자리를 안 먹는다.
*/

/*
  화면 머리에 놓을 글자 로고.

  **손으로 그린 로고 시절의 코드를 걷어냈다.** 그때는 6도 기울여 쓰고 여백을 털었다.
  기울인 것은 그 그림이 손글씨였기 때문이고, 턴 것은 잉크가 상자를 꽉 채우게 하려던
  것이다. 둘 다 지금 로고에서는 틀린 손질이다 — 반듯한 활자를 기울이면 실수로 보이고,
  여백은 **일부러 넣은 것**이라(마침표가 글자 블록 밖으로 매달리는 만큼 왼쪽을 비워
  두어야 화면에서 가운데 선다) 털면 그 균형이 무너진다.

  걷어내지 않았으면 이 스크립트를 다시 도는 날 새 로고가 조용히 옛 손질로 덮였을
  것이다. 파일은 멀쩡해 보이고 화면에서만 기울어 있다.

  아래 좌표는 원본에서 **재서** 얻은 것이다. 다른 그림을 주면 맞을 리가 없으므로
  크기를 확인하고, 안 맞으면 그 자리에서 멈춘다 — 조용히 이상한 것을 뱉느니 낫다.
*/
const SOURCE = { w: 2366, h: 1135 };
/** 두 줄의 잉크 상자. 위는 SNAP, 아래는 CARE 와 마침표. */
const ROWS = {
  top: { left: 64, top: 73, width: 1655, height: 498 },
  bottom: { left: 601, top: 605, width: 1753, height: 513 },
};
/** 마침표를 뺀 CARE 의 폭. 이것을 SNAP 과 같게 맞춰야 두 줄의 좌우 끝이 선다. */
const CARE_LETTERS = 1606;
/** 두 줄 사이. 원본이 쓰던 값이고, 대문자 높이 485 의 7% 다. */
const GAP = 35;

async function wordmark(src) {
  await mkdir('public', { recursive: true });
  const meta = await sharp(src).metadata();
  if (meta.width !== SOURCE.w || meta.height !== SOURCE.h) {
    throw new Error(
      `이 스크립트의 좌표는 ${SOURCE.w}×${SOURCE.h} 짜리 원본에서 잰 것인데 `
      + `${meta.width}×${meta.height} 를 받았다. 로고를 새로 그렸으면 ROWS 를 다시 재라.`);
  }

  const top = await sharp(src).extract(ROWS.top).png().toBuffer();
  // 대문자 높이는 두 줄이 이미 485 로 같다. 어긋난 것은 폭이라, 3.05% 만 키워
  // 글자 폭을 맞춘다. 대문자 높이는 500 이 되는데 화면 크기에서 1px 남짓이고,
  // 줄맞춤이 어긋난 것보다 훨씬 싸다.
  const k = ROWS.top.width / CARE_LETTERS;
  const bottom = await sharp(src).extract(ROWS.bottom)
    .resize({ width: Math.round(ROWS.bottom.width * k) }).png().toBuffer();
  const bottomW = Math.round(ROWS.bottom.width * k);
  const bottomH = Math.round(ROWS.bottom.height * k);

  // 마침표가 글자 블록 밖으로 나오는 만큼 **왼쪽을 비운다.** 그래야 화면에서 파일을
  // 가운데 두기만 하면 글자가 가운데 선다 — 옛 로고에 필요했던 `translateX` 가 없다.
  const hang = bottomW - ROWS.top.width;
  const side = hang + 24;
  const width = side * 2 + ROWS.top.width;
  const height = 24 * 2 + ROWS.top.height + GAP + bottomH;

  await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: top, left: side, top: 24 },
      { input: bottom, left: side, top: 24 + ROWS.top.height + GAP },
    ])
    .png({ compressionLevel: 9 })
    .toFile('public/logo-mark.png');
  console.log(`썼다 public/logo-mark.png (메인 화면 머리) ${width}×${height}`);
}

/** 아이콘 다섯 벌. `pad` 만큼 띄운 정사각형에 마크를 앉힌다. */
async function icons(src) {
  await mkdir(OUT, { recursive: true });

  async function square(pad) {
    const cut = await sharp(src).trim({ threshold: 12 }).toBuffer();
    const { width, height } = await sharp(cut).metadata();
    const side = Math.round(Math.max(width, height) / (1 - pad * 2));
    return sharp({ create: { width: side, height: side, channels: 4, background: BG } })
      .composite([{ input: cut, gravity: 'center' }])
      .png()
      .toBuffer();
  }

  const plain = await square(0.08);
  const masked = await square(0.2);

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

/** PNG 한 장을 담은 최소 ICO. Vista 이후 브라우저가 모두 읽는다. */
function ico(png, size) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2);            // type: icon
  head.writeUInt16LE(1, 4);            // 그림 한 장
  const dir = Buffer.alloc(16);
  dir.writeUInt8(size % 256, 0);       // 폭 (256 은 0 으로 적는다)
  dir.writeUInt8(size % 256, 1);       // 높이
  dir.writeUInt16LE(1, 4);             // 색 평면
  dir.writeUInt16LE(32, 6);            // 비트 깊이
  dir.writeUInt32LE(png.length, 8);
  dir.writeUInt32LE(head.length + dir.length, 12);
  return Buffer.concat([head, dir, png]);
}

const [word, mark] = process.argv.slice(2);
if (!word || !mark) {
  console.error('쓰는 법: node scripts/logo.mjs <워드마크> <마크>');
  process.exit(1);
}
await wordmark(word);
await icons(mark);

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

/**
 * 그림의 **광학 중심**을 상자 가운데로 옮긴다.
 *
 * 무엇이 문제인가
 * ---------------
 * 여백을 턴 그림을 화면 가운데 놓으면 상자는 정확히 가운데다. 그런데 눈은 상자를
 * 보지 않고 **잉크의 무게**를 본다. 이 로고는 오른쪽 위에 사진기와 반짝임이, 오른쪽
 * 가운데에 회색 디스펜서가 있어서 상자의 오른쪽 끝이 그만큼 밀려 있고, 정작 진한
 * 것은 왼쪽의 연둣빛 글자다. 그래서 가운데에 놓아도 왼쪽으로 치우쳐 보인다.
 *
 * 두 번 재서 두 번 다 틀렸다
 * --------------------------
 * 처음에는 상자 중심을 썼다 — 왼쪽으로 치우쳐 보였다(0% 보정).
 * 다음에는 연둣빛 글자의 상자 중심을 썼다 — 이번에는 오른쪽으로 치우쳐 보였다.
 * 20% 를 민 셈인데, 그 값은 회색과 검정을 **없는 것으로 친** 값이다. 그것들도 눈에는
 * 보인다.
 *
 * 세 번째로 잰 것이 이것이다: **모든 잉크의, 투명도로 가중한 무게중심.** 진한 초록
 * 획은 무겁게, 가는 검은 선은 가볍게 센다. 이 그림에서 그 값은 상자 중심보다 3.4%
 * 왼쪽이고, 그만큼만 밀면 된다. 앞의 두 값(0% 와 20%) 사이 어디쯤이라는 것이 눈으로
 * 본 것과도 맞는다.
 */
async function centreOnInk(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;

  let sum = 0;
  let mass = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * ch + 3];
      if (a > 60) { sum += x * a; mass += a; }
    }
  }
  if (mass === 0) return buf;

  /*
    잰 값 위에 **손으로 조금 더** 민다.

    무게중심은 잉크의 양만 센다. 눈은 거기에 더해 **덩어리가 어디에 뭉쳐 있는가**를
    보는데, 이 로고는 왼쪽에 두 줄짜리 글자 덩어리가 서 있고 오른쪽은 사진기·반짝임
    처럼 흩어진 점들이다. 흩어진 쪽은 무게로는 세지지만 덩어리로는 덜 세진다.

    그 차이를 수식으로 잡으려면 이 그림에만 맞는 규칙을 만들게 된다. 잰 값을 기준으로
    두고 눈으로 정한 만큼만 더하는 편이 정직하다 — 얼마를 더했는지가 숫자 하나로
    남아서, 다음 사람이 그것만 보고 되돌릴 수 있다.
  */
  const NUDGE = 0.025;                          // 폭의 2.5% 만큼 오른쪽으로

  const off = Math.round(w / 2 - sum / mass + w * NUDGE);
  if (Math.abs(off) < 4) return buf;            // 이미 가운데다
  const pad = Math.abs(off) * 2;
  return sharp(buf)
    .extend({
      left: off > 0 ? pad : 0,
      right: off > 0 ? 0 : pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

/** 화면 머리에 놓을 글자 로고. 여백을 털어 같은 높이에서 글자가 크게 보이게 한다. */
async function wordmark(src) {
  await mkdir('public', { recursive: true });
  const straight = await sharp(src)
    // 돌린 뒤에 턴다. 돌리면 네 귀퉁이에 투명이 생기고, 그 여백을 털어야 글자가
    // 제 상자를 꽉 채운다.
    .rotate(TILT, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .trim({ threshold: 12 })
    .png()
    .toBuffer();

  const centred = await centreOnInk(straight);
  // 홈에서 쓰는 높이의 두 배쯤. 3배 화면에서도 또렷하다.
  await sharp(centred).resize({ height: 320 }).png({ compressionLevel: 9 })
    .toFile('public/logo-mark.png');
  const box = await sharp('public/logo-mark.png').metadata();
  console.log(`썼다 public/logo-mark.png (메인 화면 머리) ${box.width}×${box.height}`);

  // 보관용. 문서·포스터처럼 폭이 있는 자리가 쓴다. 이쪽도 세워 둔다 — 같은 로고가
  // 자리에 따라 기울기가 다르면 두 벌처럼 보인다.
  await sharp(src)
    .rotate(TILT, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .trim({ threshold: 12 })
    .resize({ width: 1200 }).png({ compressionLevel: 9, palette: true, colors: 128 })
    .toFile('public/logo.png');
  console.log('썼다 public/logo.png (보관용)');
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

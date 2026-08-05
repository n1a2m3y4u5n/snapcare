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

  **원본의 계단 배치를 그대로 쓴다.**

  한 번 두 줄의 좌우 끝을 맞춰 본 적이 있다. SNAP 과 CARE 의 글자 폭이 1655 대 1606
  으로 어긋나 있어서 아래 줄을 3% 키워 맞췄는데, 그러면 두 줄이 한 덩어리로 서는 대신
  **네모난 블록**이 된다. 계단은 실수가 아니라 이 로고가 고른 모양이다 — 위 줄이 왼쪽에
  서고 아래 줄이 오른쪽으로 물러나면서 두 낱말이 겹치지 않고 읽힌다.

  손으로 그린 로고 시절의 손질(6도 기울이기)도 안 한다. 그때는 그림이 손글씨여서
  기울인 것이고, 반듯한 활자를 기울이면 실수로 보인다.

  하는 일은 여백을 터는 것 하나다. 잉크가 상자를 꽉 채워야 같은 화면 폭에서 글자가
  크게 선다.
*/
async function wordmark(src) {
  await mkdir('public', { recursive: true });
  await sharp(src)
    .trim({ threshold: 12 })
    .png({ compressionLevel: 9 })
    .toFile('public/logo-mark.png');
  const box = await sharp('public/logo-mark.png').metadata();
  console.log(`썼다 public/logo-mark.png (메인 화면 머리) ${box.width}×${box.height}`);
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

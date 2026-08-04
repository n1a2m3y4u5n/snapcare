'use client';

import jsQR from 'jsqr';

/**
 * 이미지에서 QR을 읽는다 (완전 오프라인, 브라우저 안에서).
 *
 * 카메라가 이미 사진을 받고 있으므로, 디스펜서와의 통신은 새로운 인터랙션이 아니라
 * 같은 제스처의 연장이 된다 — 기기가 스캔 대상 하나로 추가될 뿐이다.
 */

/**
 * 판독을 시도할 긴 변 길이들, 큰 쪽부터.
 *
 * 하나가 아니라 둘인 이유는 이 화면이 **다른 화면을 찍는** 자리이기 때문이다.
 * 기기의 QR 은 320px 패널 위의 205px 이고, 그 패널을 30cm 떨어져 찍으면 4000px 짜리
 * 사진 안에서 몇백 픽셀이 된다. 거기에 LCD 를 찍을 때 생기는 모아레와 반사가 얹힌다.
 *
 * 1000 은 깨끗한 그림에는 충분하다 — 재 보면 패널이 사진의 15% 만 차지해도 읽힌다.
 * 1800 은 그 여유가 잡음에 먹혔을 때를 위한 것이고, **읽히면 거기서 끝나므로**
 * 대부분의 사진은 여전히 한 번만 훑는다.
 */
const EDGES = [1000, 1800] as const;

/**
 * 가운데를 잘라서 다시 보는 비율.
 *
 * 사람은 찍고 싶은 것을 가운데 둔다. 4032px 사진의 가운데 절반을 잘라 원본 해상도
 * 그대로 훑으면 축소를 한 번도 안 거치는 셈이라, 같은 QR 이 두 배 크기의 모듈로
 * 도착한다. 위의 두 배율이 다 실패한 뒤에만 하므로 평소에는 비용이 0 이다.
 */
const CENTRE = 0.5;

/** 잘라서 볼 때의 상한. 이보다 크면 jsQR 이 한 프레임 안에 못 끝낸다. */
const CROP_EDGE = 2000;

export async function decodeQrFromImage(source: File | Blob | string): Promise<string | null> {
  const opened = await open(source);
  if (!opened) return null;

  try {
    const { image } = opened;
    const longest = Math.max(image.width, image.height);

    for (const edge of EDGES) {
      const found = readAt(image, Math.min(1, edge / longest));
      if (found) return found;
      // 사진이 이미 이 크기보다 작으면 더 키워 봐야 같은 픽셀이다.
      if (longest <= edge) break;
    }

    /*
      마지막 수. 여기까지 왔다는 것은 화면 전체에서는 모듈이 너무 작다는 뜻이고,
      실제로 그런 사진에서 판별 모델은 "QR 코드"라고 알아본다 — 그림은 있는데
      우리 판독기에 닿는 픽셀이 모자란 것이다.
    */
    return readAt(image, Math.min(1, CROP_EDGE / (longest * CENTRE)), CENTRE);
  } finally {
    opened.release();
  }
}

/**
 * 한 배율로 캔버스에 그려 훑는다. `centre` 를 주면 그 비율만큼 가운데만 본다.
 */
function readAt(image: ImageBitmap | HTMLImageElement, scale: number,
                centre = 1): string | null {
  const sx = Math.round(image.width * (1 - centre) / 2);
  const sy = Math.round(image.height * (1 - centre) / 2);
  const sw = Math.round(image.width * centre);
  const sh = Math.round(image.height * centre);

  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);

  // 기기 화면은 배경이 어둡고 코드가 밝다. 반대 극성도 한 번 더 본다.
  return jsQR(data, w, h, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

interface Opened {
  image: ImageBitmap | HTMLImageElement;
  /** 다 쓴 뒤에 부른다. blob: 주소를 놓아 주고, ImageBitmap 이면 닫는다. */
  release(): void;
}

/**
 * 사진 한 장을 그릴 수 있는 무언가로 연다.
 *
 * **`createImageBitmap` 하나에 걸지 않는다.** 그게 이 기능을 통째로 죽이고 있었다 —
 * 카메라로 찍은 파일을 넣으면 이렇게 끝났다:
 *
 *     InvalidStateError: The source image could not be decoded.
 *
 * 같은 파일을 `<img>` 로 넣으면 멀쩡히 디코딩된다. 배포본에서 직접 재서 확인했고,
 * 증상은 "QR 을 찍었는데 앱이 QR 인 줄 모른다" 였다 — 판독이 실패한 것이 아니라
 * **판독기에 그림이 도착하지 못한** 것이다. 그리고 이 실패는 조용하다: 판독기는
 * null 을 돌려받고, 화면은 "읽지 못했습니다" 라고만 말한다.
 *
 * 왜 그런가는 브라우저마다 다르다. `createImageBitmap` 은 코덱을 직접 여는 길이라
 * `<img>` 보다 지원 범위가 좁고, 특히 폰 카메라가 내놓는 형식과 색 프로파일에서
 * 갈린다. 어느 쪽이 되는지 미리 알 방법이 없으므로 둘 다 해 본다.
 *
 * 순서는 그대로 `createImageBitmap` 이 먼저다. 성공하면 그쪽이 빠르고 메모리를 덜
 * 쓴다 — 바뀐 것은 그것이 실패했을 때 포기하지 않는다는 점뿐이다.
 */
async function open(source: File | Blob | string): Promise<Opened | null> {
  if (typeof source !== 'string') {
    try {
      const bitmap = await createImageBitmap(source);
      return { image: bitmap, release: () => bitmap.close() };
    } catch (err) {
      console.warn('[qr] createImageBitmap 이 거절했다 — <img> 로 다시 해 본다:', err);
    }
  }

  /*
    blob: 주소는 이 문서가 살아 있는 동안 유지되므로 반드시 놓아 줘야 한다. 사진 한
    장은 수 MB 이고 이 화면은 한 사람이 여러 번 찍는 자리다.

    다만 **그리기가 끝난 뒤에** 놓는다. 디코딩 직후에 놓으면 캔버스가 아직 그 그림을
    필요로 하는 순간에 사라질 수 있다.
  */
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  const release = () => { if (typeof source !== 'string') URL.revokeObjectURL(url); };
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { image: img, release };
  } catch (err) {
    // 사진이 나쁘면 흔히 실패하지만, 그 실패가 무엇이었는지는 남긴다.
    console.warn('[qr] 이미지를 읽지 못했다:', err);
    release();
    return null;
  }
}

/**
 * 사진 파일 → 회색조 픽셀. 브라우저 전용(캔버스를 쓴다).
 *
 * 판독기 본체(`sheet.ts`)는 DOM 을 모른다. 그래야 node 에서 시험할 수 있고, 시험이
 * 없으면 이런 종류의 코드는 "되는 것 같다" 이상으로 올라가지 못한다.
 */
import { grayFromRGBA, type Gray } from './image.ts';

/**
 * 긴 변을 이 크기로 줄여서 읽는다.
 *
 * 폰 사진은 3000~4000px 인데 그만큼이 필요하지 않다. A5 종이의 마커 무늬는 6.4mm 라
 * 긴 변 2000px 에서 약 60px 로 잡히고, 4×4 무늬를 읽는 데 필요한 것의 두 배가 넘는다.
 * 그 아래로 더 줄이면 꼭짓점 정밀도가 잔차 예산(8px)을 먹기 시작한다.
 *
 * 줄이는 쪽의 이득은 속도다 — 윤곽선 추적이 화소 수에 비례하고, 4000px 짜리는
 * 2000px 짜리의 네 배다.
 */
export const MAX_WORK_DIM = 2000;

/**
 * 첫 판독이 종이를 못 찾았을 때 다시 볼 크기.
 *
 * 멀리서 찍어 마커가 작게 잡힌 장은 2000px 로 줄이는 순간 4×4 무늬가 뭉개진다.
 * 그럴 때는 화소를 더 준다. 원본 그대로 두지 않는 이유는 요즘 폰의 5000만 화소
 * 사진(8000×6000 = 4800만 화소)까지 올라가면 윤곽선 추적이 몇 초씩 걸리기 때문이다 —
 * 못 읽는 것보다는 낫지만, 다시 찍는 편이 더 빠른 지점이 있다.
 */
export const RETRY_WORK_DIM = 3500;

export async function decodeToGray(source: Blob, maxDim = MAX_WORK_DIM): Promise<Gray> {
  const bitmap = await createImageBitmap(source);
  try {
    return grayFrom(bitmap, maxDim);
  } finally {
    bitmap.close();
  }
}

/**
 * 사진을 **한 번만 푼다.**
 *
 * 종이 경로가 같은 blob 을 최대 세 번 `decodeToGray` 에 넘기고 있었다 — 마커를 찾을
 * 작은 판, 못 찾았을 때의 큰 판, 그리고 칸을 자를 큰 판. 그때마다 JPEG 을 처음부터
 * 다시 풀었다. 폰이 찍는 12메가픽셀 한 장에서 그 일은 공짜가 아니고, 사람은 그 동안
 * 셔터를 누른 채 기다린다.
 *
 * 비트맵 하나를 들고 크기만 다시 뽑으면 그 일이 한 번으로 준다. 그림을 줄여 그리는
 * 것은 이미 캔버스가 하던 일이라 새로 드는 값이 없다.
 *
 * 부르는 쪽이 `close()` 를 책임진다 — 여러 크기를 뽑는 동안 살아 있어야 하기 때문이다.
 */
export function decodeBitmap(source: Blob): Promise<ImageBitmap> {
  return createImageBitmap(source);
}

/** 이미 푼 비트맵에서 원하는 크기의 회색조를 뽑는다. */
export function grayFrom(bitmap: ImageBitmap, maxDim = MAX_WORK_DIM): Gray {
  {
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = (canvas as HTMLCanvasElement).getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2d 캔버스를 만들 수 없다');

    ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    return grayFromRGBA(data, w, h);
  }
}

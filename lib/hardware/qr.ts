'use client';

import jsQR from 'jsqr';

/**
 * 이미지에서 QR을 읽는다 (완전 오프라인, 브라우저 안에서).
 *
 * 카메라가 이미 사진을 받고 있으므로, 디스펜서와의 통신은 새로운 인터랙션이 아니라
 * 같은 제스처의 연장이 된다 — 기기가 스캔 대상 하나로 추가될 뿐이다.
 */

/** 디코딩 전 축소 한계. 너무 크면 느리고, 너무 작으면 작은 화면의 QR을 놓친다. */
const MAX_EDGE = 1000;

export async function decodeQrFromImage(source: File | Blob | string): Promise<string | null> {
  const bitmap = await toBitmap(source);
  if (!bitmap) return null;

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);

  // 기기 화면은 배경이 어둡고 코드가 밝다. 반대 극성도 한 번 더 본다.
  return (
    jsQR(data, w, h, { inversionAttempts: 'attemptBoth' })?.data ?? null
  );
}

async function toBitmap(source: File | Blob | string): Promise<ImageBitmap | HTMLImageElement | null> {
  try {
    if (typeof source !== 'string') return await createImageBitmap(source);
    const img = new Image();
    img.src = source;
    await img.decode();
    return img;
  } catch (err) {
    // 사진이 나쁘면 흔히 실패하지만, 그 실패가 무엇이었는지는 남긴다.
    console.warn('[qr] 이미지를 읽지 못했다:', err);
    return null;
  }
}

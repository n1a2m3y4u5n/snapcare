import { recognizeText } from '@/lib/ocr';
import { SHEET_CONFIG } from './config';
import { cropField, forOcr } from './field';
import type { Gray } from './image';
import type { Mat3 } from './homography';

/**
 * 폼시트의 손으로 쓴 칸을 읽는다. 브라우저 전용(캔버스와 tesseract 를 쓴다).
 *
 * 왜 이 한 칸만 OCR 인가
 * ----------------------
 * 나머지는 전부 버블이라 채웠는지만 보면 된다. 이름은 목록으로 만들 수 없어서 —
 * 이 세상의 약 이름은 닫힌 집합이 아니다 — 손으로 쓰는 수밖에 없고, 손으로 쓴 것은
 * 읽어야 한다.
 *
 * 이 저장소는 손글씨 OCR 의 실패를 이미 재 두었다(라고스 처방전에서 `8hrly` →
 * `8mg`). 그 측정은 여전히 맞는데, **여기서는 문제가 다르다**. 저기서는 종이 한
 * 장에서 아무 글자나 맞혀야 했고, 여기서는 이미 반듯하게 편 한 줄에서 90개짜리
 * 목록 중 하나를 고르면 된다(`lib/formulary/match.ts`). 어휘를 닫는 것이 인식기를
 * 고치는 것보다 싸다.
 *
 * 그리고 자르는 그림이 다르다
 * ---------------------------
 * 페이지 전체를 던지지 않는다. ArUco 로 종이를 편 뒤 이름칸만, **원본 사진의
 * 해상도로** 잘라서(`cropField`) 밑줄을 지우고 흑백으로 만든 뒤에 넘긴다.
 * tesseract 가 하지 않아도 되는 일 — 글줄 찾기, 기울기 보정, 배경 분리 — 을
 * 기하가 미리 해 준 셈이고, 그 셋이 손글씨에서 가장 자주 틀리는 자리다.
 */

/** 잘라낸 칸을 tesseract 가 받는 모양으로. */
async function toBlob(g: Gray): Promise<Blob> {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(g.w, g.h)
    : Object.assign(document.createElement('canvas'), { width: g.w, height: g.h });
  const ctx = (canvas as HTMLCanvasElement).getContext('2d');
  if (!ctx) throw new Error('2d 캔버스를 만들 수 없다');

  const img = ctx.createImageData(g.w, g.h);
  for (let i = 0; i < g.d.length; i++) {
    const v = g.d[i];
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  if (canvas instanceof OffscreenCanvas) return canvas.convertToBlob({ type: 'image/png' });
  return new Promise<Blob>((ok, no) => {
    (canvas as HTMLCanvasElement).toBlob((b) => (b ? ok(b) : no(new Error('캔버스를 그림으로 못 바꿨다'))), 'image/png');
  });
}

/**
 * 이름칸과 개수칸의 글자.
 *
 * 실패해도 던지지 않는다. 이 칸들을 못 읽는 것은 **일정을 못 읽는 것과 다르다** —
 * 버블은 이미 읽혔고, 층·요일·기간·시각은 그대로 상자로 보낼 수 있다. 여기서
 * 예외가 나가면 그 넷까지 같이 잃는다. 이름 없는 일정은 반쪽이지만 일정이고,
 * 아무것도 없는 것보다 낫다.
 */
export async function readHandwriting(
  gray: Gray,
  transform: Mat3,
  onProgress?: (p: number) => void,
): Promise<{ name: string; count: string; notes: string }> {
  const read = async (field: 'name' | 'count' | 'notes') => {
    const rect = SHEET_CONFIG.fields[field];
    if (!rect) return '';
    try {
      const blob = await toBlob(forOcr(cropField(gray, transform, rect)));
      return (await recognizeText(blob, field === 'name' ? onProgress : undefined)).trim();
    } catch (err) {
      console.error(`[form-sheet] ${field} 칸을 못 읽었다:`, err);
      return '';
    }
  };
  // 차례로 돈다. tesseract 워커가 하나라 나란히 던져 봐야 줄을 설 뿐이고,
  // 진행률이 두 개 섞여 사람에게는 되감기는 막대로 보인다.
  return {
    name: await read('name'),
    count: await read('count'),
    // 약사가 주의를 적는 자리. 종이가 이미 인쇄되어 있어 칸을 새로 팔 수 없는데,
    // 이 빈 줄은 처음부터 있었고 아무도 읽지 않고 있었다.
    notes: await read('notes'),
  };
}

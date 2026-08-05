import { matchDrug } from '@/lib/formulary/match';
import { readNotes } from '@/lib/formulary/notes';
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

/** 잘라낸 칸을 그림 한 장으로. tesseract 도 Vision 도 이것을 받는다. */
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
  const local = {
    name: await read('name'),
    count: await read('count'),
    // 약사가 주의를 적는 자리. 종이가 이미 인쇄되어 있어 칸을 새로 팔 수 없는데,
    // 이 빈 줄은 처음부터 있었고 아무도 읽지 않고 있었다.
    notes: await read('notes'),
  };

  if (!needsHelp(local)) return local;

  /*
    tesseract 가 놓쳤다 — 손글씨에 눈이 있는 쪽에 다시 묻는다.

    측정: 필기체로 쓴 약 이름 셋에 tesseract 는 하나를 맞혔고(conf 33/41/0)
    Vision 은 셋 다 맞혔다(각 1.7~1.9초). 같은 칸을 인쇄 글씨로 주면 tesseract 가
    conf 96 이므로, 이 부름은 **손글씨일 때만** 일어난다.

    셋을 한 번에 보낸다. 어차피 한 번 나가는 길이고, 이름만 뭉갠 사진이 개수와 주의는
    멀쩡히 읽혔을 이유가 없다.
  */
  const shots = await Promise.all(
    (['name', 'count', 'notes'] as const).map(async (f) => {
      const rect = SHEET_CONFIG.fields[f];
      if (!rect) return '';
      try {
        return await toDataUrl(forOcr(cropField(gray, transform, rect)));
      } catch {
        return '';
      }
    }),
  );

  const better = await askVision({ name: shots[0], count: shots[1], notes: shots[2] });
  if (!better?.legible) return local;

  /*
    받은 것을 **덮어쓰지 않고 고른다.**

    tesseract 가 이미 표에 맞는 이름을 읽었다면 그것을 지킨다 — 닫힌 목록에 맞은 답은
    이 앱에서 가장 확실한 답이고, 그것을 못 맞은 쪽으로 바꿀 이유가 없다. 빈 칸도
    안 덮는다: 못 읽은 것을 못 읽었다고 두는 편이, 한쪽이 지어낸 것으로 채우는 것보다
    낫다.
  */
  return {
    name: matchDrug(local.name) ? local.name : (better.name || local.name),
    count: local.count.match(/\d/) ? local.count : (better.count || local.count),
    notes: better.notes || local.notes,
  };
}

/** 그림 한 장 → data URL. Vision 라우트가 받는 모양. */
async function toDataUrl(g: Gray): Promise<string> {
  const blob = await toBlob(g);
  return new Promise<string>((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => no(new Error('그림을 못 읽었다'));
    r.readAsDataURL(blob);
  });
}

/**
 * tesseract 의 답을 그대로 써도 되는가.
 *
 * 두 신호를 본다. 어느 쪽도 "글자가 이상해 보인다" 같은 눈대중이 아니라, **다음
 * 단계가 그것으로 무엇을 할 수 있는가**를 묻는다:
 *
 *   이름이 표에 안 맞는다        → 손글씨가 뭉개졌거나 표 밖의 약이다. 둘 다 다시 볼 값어치가 있다.
 *   주의 줄에 글자는 있는데      → 약사가 뭔가 적었는데 우리가 못 알아들었다. 놓친 경고일 수 있다.
 *   아는 주의가 하나도 없다
 */
function needsHelp(r: { name: string; count: string; notes: string }): boolean {
  if (!matchDrug(r.name)) return true;
  const notes = readNotes(r.notes);
  return r.notes.trim().length > 0 && notes.flags.length === 0 && notes.unknown.length > 0;
}

/** 한 번만 묻는다. 못 물어보면 `null` — tesseract 가 읽은 것이 그대로 남는다. */
async function askVision(shots: { name: string; count: string; notes: string }) {
  try {
    const res = await fetch('/api/handwriting', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(shots),
      signal: AbortSignal.timeout(16_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as { name: string; count: string; notes: string; legible: boolean };
  } catch (err) {
    console.warn('[form-sheet] 손글씨를 다시 못 물어봤다:', err);
    return null;
  }
}

import { WHO_DRUGS } from '@/lib/formulary/who';
import { SHEET_CONFIG } from './config';
import { cropField } from './field';
import type { Gray } from './image';
import type { Mat3 } from './homography';

/**
 * 폼시트의 손으로 쓴 칸을 읽는다. 브라우저 전용(캔버스를 쓴다).
 *
 * 왜 이 세 칸만 읽는가
 * --------------------
 * 나머지는 전부 버블이라 채웠는지만 보면 된다. 이름·개수·주의는 목록으로 만들 수
 * 없어서 — 이 세상의 약 이름은 닫힌 집합이 아니고, 약사가 적는 말도 그렇다 — 손으로
 * 쓰는 수밖에 없고, 손으로 쓴 것은 읽어야 한다.
 *
 * tesseract 를 걷어냈다
 * ---------------------
 * 여기에 tesseract 가 있었다. 먼저 돌리고, 그 답이 약품표에 안 맞을 때만 Vision 에
 * 다시 묻는 순서였다 — 공짜에 오프라인이라는 것이 그 순서의 이유였다.
 *
 * 두 자리에서 나란히 재고 뺐다:
 *
 *   손글씨 약 이름   tesseract 1/3 (conf 33·41·0)   Vision 3/3
 *   영양성분표       tesseract 부분 성공             Vision 8/8 칸 일치
 *
 * 그리고 tesseract 가 잘하는 자리 — 반듯하게 인쇄된 글자 — 는 이 앱에서 드물다.
 * 사람이 찍는 것은 손으로 쓴 종이다. 두 번째 인식기를 유지하는 값(52MB 자산, 두 갈래
 * 코드, 두 벌의 실패 모드)이 그 드문 경우를 위해 치르기에 비쌌다.
 *
 * 잃은 것: **이 칸들을 오프라인으로 읽던 길.** 망이 없으면 이름·개수·주의가 빈다.
 * 다만 버블(층·요일·기간·시각)은 여전히 기기 안에서 읽히므로, 망이 없어도 일정 자체는
 * 상자로 갈 수 있다 — 이름 없는 일정은 반쪽이지만 일정이다.
 *
 * 자르는 그림은 그대로다
 * ----------------------
 * 페이지 전체를 던지지 않는다. ArUco 로 종이를 편 뒤 그 칸만, **원본 사진의 해상도로**
 * 잘라서 보낸다(`cropField`). 한 줄만 보내면 **어느 칸의 글자인지**가 확실해진다 —
 * 종이 전체를 주면 맨 위 제목이 이름칸에 섞인다(실제로 그랬다).
 *
 * 이진화하지 않는다. `forOcr` 은 tesseract 를 위한 손질이었고, 회색조에 남은 획의
 * 농담이 손글씨를 읽는 단서다.
 */

/** 잘라낸 칸을 그림 한 장으로. */
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

/** 그림 한 장 → data URL. */
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
 * 이름칸·개수칸·주의칸의 글자.
 *
 * 실패해도 던지지 않는다. 이 칸들을 못 읽는 것은 **일정을 못 읽는 것과 다르다** —
 * 버블은 이미 읽혔고, 층·요일·기간·시각은 그대로 상자로 보낼 수 있다. 여기서
 * 예외가 나가면 그 넷까지 같이 잃는다.
 */
export interface Handwriting {
  name: string;
  count: string;
  notes: string;
  /**
   * 이름이 비었을 때 **왜** 비었나.
   *
   * 세 상황이 있고 사람이 할 일이 다르다. 전에는 셋이 다 빈 문자열 하나로 내려가서
   * 화면이 "평평하게, 밝은 곳에서 다시 찍으세요" 를 똑같이 말했다 — 망이 끊긴
   * 사람에게 그 말은 몇 번을 다시 찍어도 안 바뀌는 일을 시키는 것이다. tesseract 를
   * 걷어낸 뒤로 그 경우가 흔해졌으므로(이제 이 칸은 언제나 망이 필요하다) 갈라 둔다.
   *
   *   offline    못 물어봤다 — 망, 시간 초과, 상류 과부하
   *   illegible  물어봤고 못 읽겠다는 답을 받았다
   */
  reason?: 'offline' | 'illegible';
}

export async function readHandwriting(
  gray: Gray,
  transform: Mat3,
  onProgress?: (p: number) => void,
): Promise<Handwriting> {
  const shots = await Promise.all(
    (['name', 'count', 'notes'] as const).map(async (f) => {
      const rect = SHEET_CONFIG.fields[f];
      if (!rect) return '';
      try {
        return await toDataUrl(cropField(gray, transform, rect));
      } catch (err) {
        console.error(`[form-sheet] ${f} 칸을 못 잘랐다:`, err);
        return '';
      }
    }),
  );

  onProgress?.(0.5);
  const read = await askVision({
    name: shots[0],
    count: shots[1],
    notes: shots[2],
    /*
      어휘를 닫아 준다 — 철자 변형(`also`)까지 함께.

      실제 손글씨 60장에서 이것이 읽기를 49.2% 에서 63% 대로 올렸다. 목록에서 **고르게**
      한 것이 아니라 **보게** 한 것이 일했다(`scripts/handwriting-vocab-eval.mjs`).
      종이에 INN 이 아니라 상품명이 적히는 것이 오히려 흔해서 변형도 같이 보낸다.
    */
    candidates: [...new Set(WHO_DRUGS.flatMap((d) => [d.name, ...(d.also ?? [])]))],
  });
  onProgress?.(1);

  if (!read) return { name: '', count: '', notes: '', reason: 'offline' };
  if (!read.legible) return { name: '', count: '', notes: '', reason: 'illegible' };

  /*
    목록에서 고른 것(`match`)은 **거의 안 쓴다.**

    문턱을 훑어 보니 정확도가 0.7 부터 "아예 안 씀" 까지 평평했다 — 이 값을 쓰든 안
    쓰든 맞히는 수가 같고, 낮은 문턱은 다른 약에 가서 붙는 수만 늘렸다(0.7 에서
    15.0%, 0.9 에서 0%). 그래서 0.9 다: 실제 목록은 94종으로 훨씬 작아 고르기가
    쉬워질 여지가 있고, 문턱이 높으면 그 여지는 공짜다.
  */
  const picked = read.match && read.matchConfidence >= 0.9 ? read.match : '';

  return { name: picked || read.name, count: read.count, notes: read.notes };
}

/**
 * 묻는다. 못 물어보면 `null` — 그때는 이름 없는 일정이 남는다.
 *
 * **한 번은 앱이 알아서 다시 보낸다.** 상류가 잠깐 밀리는 것은 이 사진의 문제가
 * 아니고, 사진 판별 쪽에서 같은 판단을 이미 내려 두었다 — 처방전 200장 중 아홉 장이
 * 503 이었는데 다시 보내니 아홉 장 전부 읽혔다. 사람에게 "다시 눌러 보세요" 라고 말할
 * 수는 있지만 이 앱의 사용자는 그 문장을 읽지 못하고, 한 번 더 누르는 일 자체가
 * 우리가 없애기로 한 종류의 수고다.
 *
 * 두 번은 안 한다. 조용히 세 번 재시도하면 사람은 앱이 멈춘 줄 안다.
 */
async function askVision(shots: { name: string; count: string; notes: string; candidates: string[] }) {
  for (let tries = 0; tries < 2; tries++) {
    try {
      const res = await fetch('/api/handwriting', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(shots),
        signal: AbortSignal.timeout(16_000),
      });
      if (res.ok) {
        return (await res.json()) as {
          name: string; count: string; notes: string; legible: boolean;
          match: string; matchConfidence: number;
        };
      }
      // 4xx 는 다시 보내도 같다 — 우리가 보낸 것이 문제다.
      if (res.status < 500) return null;
    } catch (err) {
      console.warn('[form-sheet] 손글씨를 못 물어봤다:', err);
    }
    if (tries === 0) await new Promise((r) => setTimeout(r, 1200));
  }
  return null;
}

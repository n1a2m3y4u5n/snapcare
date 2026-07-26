import type { ModelTotals } from './mealModel';

/**
 * 기기 안에서 음식 사진의 영양을 추정한다.
 *
 * 모델(nutrition_manager/web)은 브라우저에서 onnxruntime-web 으로 돈다. 서버 추론도,
 * 네트워크 왕복도, 파이썬도 없다 — 오프라인이 전제인 앱에서 이게 결정적이다.
 * 예전에는 서버가 파이썬을 띄워 PyTorch 로 추론하려 했는데, 그 경로는 이미지에
 * 1.5GB 를 더하면서 정작 인터넷이 없으면 못 쓰는 것이었다.
 *
 * 실패하면 null 이다. 모델이 없거나, WASM 이 막혀 있거나, 사진이 이상하거나 —
 * 어느 쪽이든 앱은 Vision 경로로 넘어가야 하고 여기서 멈추면 안 된다.
 */

/** 16MB 를 매번 받지 않도록 세션을 붙들고 있는다. */
let loading: Promise<{ estimate: (b: ImageBitmap) => Promise<Record<string, number>> } | null> | null = null;

async function session() {
  loading ??= (async () => {
    try {
      const { MealModel } = await import('./onnxMealModel');
      return await MealModel.load('/models/web.json');
    } catch (err) {
      console.warn('[meal-model] unavailable:', err);
      return null;
    }
  })();
  return loading;
}

/** 모델을 미리 받아둔다 (카메라 화면에 들어올 때). 실패해도 조용히 지나간다. */
export function warmUp(): void {
  void session();
}

export async function estimateOnDevice(image: Blob | File): Promise<ModelTotals | null> {
  const model = await session();
  if (!model) return null;

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(image);
    const out = await model.estimate(bitmap);
    const totals: ModelTotals = {
      calories: out.calories,
      mass: out.mass,
      fat: out.fat,
      carb: out.carb,
      protein: out.protein,
    };
    // 다섯 값이 다 숫자로 나왔을 때만 넘긴다. 검증은 densityFromTotals 가 한다 —
    // 모델이 우리 것이라고 해서 물리 검증을 건너뛰지는 않는다.
    return Object.values(totals).every((v) => typeof v === 'number' && Number.isFinite(v))
      ? totals
      : null;
  } catch (err) {
    console.warn('[meal-model] estimate failed:', err);
    return null;
  } finally {
    bitmap?.close();
  }
}

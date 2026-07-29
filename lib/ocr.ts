import Tesseract from 'tesseract.js';

/**
 * Tesseract 자산을 우리 서버에서 받는다.
 *
 * 기본값은 CDN(jsdelivr)인데, CSP 의 `connect-src 'self'` 가 그것을 막는다. 그래서
 * 배포본에서 OCR 이 통째로 죽어 있었다 — 성분표 표본을 눌러도 "Could not read that"
 * 만 뜨고 콘솔에는 아무것도 안 남아서, 눈으로는 멀쩡해 보였다.
 *
 * 우리 서버에서 주면 CSP 도 통과하고 오프라인에서도 돈다. 파일은 scripts/copy-ocr.mjs
 * 가 public/ocr/ 로 옮긴다.
 */
const OCR_ASSETS = {
  workerPath: '/ocr/worker.min.js',
  corePath: '/ocr/',
  langPath: '/ocr/',
} as const;

/**
 * 이미지 URL 또는 Blob에서 텍스트를 추출한다 (OCR)
 * @param image - 이미지 URL, File, Blob
 * @param onProgress - 진행률 콜백 (0~1)
 */
export async function recognizeText(
  image: string | File | Blob,
  onProgress?: (progress: number) => void
): Promise<string> {
  // 영어만 읽는다.
  //
  // 예전에는 'kor+eng' 였다. 언어를 하나 더 얹으면 받는 자료가 1.5MB 늘고, 두 모델이
  // 같은 글자를 두고 경쟁하면서 인식률이 떨어진다. 대상 지역은 몰도바이고 화면도
  // 전부 영어다.
  //
  // 파서(lib/ocr-to-macro.ts)의 한글 패턴 35개는 그대로 둔다 — 전부 `안약|eye drops`
  // 처럼 영어와 나란히 적혀 있어서, 영어만 읽어도 같은 자리를 잡아낸다.
  // 한국어 라벨을 읽어야 할 때가 오면 여기에 'kor' 을 되돌리면 된다.
  const result = await Tesseract.recognize(image, 'eng', {
    ...OCR_ASSETS,
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(m.progress ?? 0);
      }
    },
  });
  return result.data.text;
}

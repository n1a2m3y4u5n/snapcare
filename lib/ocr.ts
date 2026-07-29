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
  const result = await Tesseract.recognize(image, 'kor+eng', {
    ...OCR_ASSETS,
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(m.progress ?? 0);
      }
    },
  });
  return result.data.text;
}

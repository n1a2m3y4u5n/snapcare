import Tesseract from 'tesseract.js';

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
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(m.progress ?? 0);
      }
    },
  });
  return result.data.text;
}

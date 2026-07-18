import { ocrToMacro, extractRxInfo, type StructuredRxInfo } from './ocr-to-macro';
export type { StructuredRxInfo };

export interface PictogramItem {
  type: 'medication' | 'instruction' | 'warning' | 'info';
  parts: { morpheme_id: string; props?: Record<string, unknown> }[];
  display_meta: {
    color: 'blue' | 'green' | 'purple' | 'pink' | 'amber' | 'red';
    priority: number;
  };
}

export type PictogramResult =
  | {
      success: true;
      sequence: PictogramItem[];
      images: string[];
      /** 엔진에 입력된 DSL 원본 (디버그·시연용) */
      source: string;
      /** 줄 단위로 분해된 DSL 라벨 (이미지 인덱스와 1:1 대응) */
      dslLines: string[];
      /** OCR 텍스트에서 추출한 구조화 처방 정보 */
      rxInfo: StructuredRxInfo;
    }
  | {
      success: false;
      unmatched_tokens: string[];
      partial_sequence: PictogramItem[];
      images: string[];
      source: string;
      dslLines: string[];
      rxInfo: StructuredRxInfo;
    };

export interface PictogramComposer {
  compose(input: {
    text: string;
    lang: string;
    confidence?: number;
    docType?: 'prescription' | 'device_manual';
  }): Promise<PictogramResult>;
}

const composer: PictogramComposer = {
  async compose({ text, lang: _lang }) {
    const source = ocrToMacro(text);
    const rxInfo = extractRxInfo(text);

    const res = await fetch('/api/pictogram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    });

    if (!res.ok) {
      return {
        success: false as const,
        unmatched_tokens: [text],
        partial_sequence: [],
        images: [],
        source,
        dslLines: source.split('\n').filter((l) => l.trim().length > 0),
        rxInfo,
      };
    }

    const { images, dslLines } = (await res.json()) as {
      images: string[];
      source: string;
      dslLines: string[];
    };

    // images 배열을 sequence에 매핑 (라벨당 1개 아이템)
    const sequence: PictogramItem[] = images.map((img, i) => ({
      type: 'instruction' as const,
      parts: [{ morpheme_id: `label.${i}`, props: { imageData: img } }],
      display_meta: {
        color: img ? ('green' as const) : ('amber' as const),
        priority: i,
      },
    }));

    return { success: true as const, sequence, images, source, dslLines, rxInfo };
  },
};

export default composer;

/** 형태소 ID를 이모지로 변환한다 (폴백용) */
export function morphemeToEmoji(id: string): string {
  const map: Record<string, string> = {
    'pill.round.white': '⚪',
    'pill.capsule.blue': '💊',
    'time.morning': '🌅',
    'time.evening': '🌙',
    'time.noon': '☀️',
    'context.after_meal': '🍽️',
    'warning.general': '⚠️',
  };
  if (id.startsWith('label.')) return '🖼️';
  return map[id] ?? '❓';
}

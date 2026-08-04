'use client';

import type { ScanItem, Verdict } from '@/lib/snapcare/types';
import { LEVEL_META } from '@/lib/snapcare/verdict';
import { Say } from './Say';
import { spokenName } from '@/lib/tts/speakable';
import { FoodIcon, PillIcon } from '@/components/icons';

/**
 * 신호등 판정 히어로 — 큰 아이콘 + headline + 요약 배지.
 * "no reading required": 색 하나로 안전/주의/회피를 즉시 전달.
 */
export function VerdictHero({ item, verdict, photo }: {
  item: ScanItem;
  verdict: Verdict;
  /** 방금 찍은 사진. 표본을 눌러 본 것이면 없다. */
  photo?: string | null;
}) {
  const meta = LEVEL_META[verdict.level];
  const Fallback = item.kind === 'medicine' || item.kind === 'prescription' ? PillIcon : FoodIcon;
  return (
    <div className="flex flex-col items-center text-center px-6 pt-6">
      {/*
        방금 찍은 그 사진이 여기 온다.

        여기 있던 것은 이모지였다 — 사람이 자기 집 부엌에서 자기 빵을 찍었는데
        화면에는 남의 빵 그림이 떴다. 그러면 이 판정이 **내가 찍은 그것**에 대한
        말인지 아닌지가 흐려진다. 판정을 믿게 만드는 것은 문장이 아니라 "그래,
        내가 찍은 게 이거다" 라는 확인이다.

        테두리로 판정 색을 두른다. 사진이 들어오면 배경색이 가려지는데, 그 색이
        이 화면에서 글자 없이 뜻이 서는 유일한 것이라 잃으면 안 된다.
      */}
      <div
        className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full"
        style={{ background: meta.bg, color: meta.color, fontSize: 56,
                 boxShadow: photo ? `0 0 0 4px ${meta.color}` : undefined }}
      >
        {photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={photo} alt="" aria-hidden className="h-full w-full object-cover" />
          : <Fallback />}
      </div>

      {/*
        핵심은 판정과 제품명 둘뿐이다.
        인식 경로("Detected via …")는 사용자가 행동을 정하는 데 쓰이지 않는 메타정보라 뺐다 —
        읽을 것이 적을수록 색과 아이콘이 먼저 눈에 들어온다.
      */}
      {/*
        문장마다 따로 누를 수 있어야 하는 이유: 듣는 사람은 되감을 수 없다.
        한 번에 다 읽어주는 버튼만 있으면, 놓친 한 문장 때문에 처음부터 다시 들어야 한다.
      */}
      <h1 className="mt-5 text-2xl font-bold" style={{ color: 'var(--color-sc-ink)' }}>
        <Say>{verdict.headline}</Say>
      </h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--color-sc-muted)' }}>
        <Say as={spokenName(item.name, item.kind)}>{item.name}</Say>
      </p>

      {item.chips && item.chips.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {item.chips.map((c, i) => (
            <span
              key={i}
              className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-medium shadow-sm"
              style={{ color: 'var(--color-sc-ink)' }}
            >
              <span>{c.emoji}</span> <Say bare>{c.label}</Say>
            </span>
          ))}
        </div>
      )}

      <div
        className="mt-5 flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm font-semibold"
        style={{ background: meta.bg, color: meta.color }}
      >
        <span className="text-lg">{meta.emoji}</span>
        {/* 왜 이 판정이 나왔는지 — 화면에서 가장 중요한 문장이라 반드시 들려야 한다 */}
        <Say>{verdict.summary}</Say>
      </div>
    </div>
  );
}

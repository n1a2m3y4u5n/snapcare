'use client';

import type { ScanItem, Verdict } from '@/lib/snapcare/types';
import { LEVEL_META } from '@/lib/snapcare/verdict';

/**
 * 신호등 판정 히어로 — 큰 아이콘 + headline + 요약 배지.
 * "no reading required": 색 하나로 안전/주의/회피를 즉시 전달.
 */
export function VerdictHero({ item, verdict }: { item: ScanItem; verdict: Verdict }) {
  const meta = LEVEL_META[verdict.level];
  return (
    <div className="flex flex-col items-center text-center px-6 pt-6">
      <div
        className="flex h-28 w-28 items-center justify-center rounded-full text-5xl"
        style={{ background: meta.bg }}
      >
        {item.emoji}
      </div>

      {/*
        핵심은 판정과 제품명 둘뿐이다.
        인식 경로("Detected via …")는 사용자가 행동을 정하는 데 쓰이지 않는 메타정보라 뺐다 —
        읽을 것이 적을수록 색과 아이콘이 먼저 눈에 들어온다.
      */}
      <h1 className="mt-5 text-2xl font-bold" style={{ color: 'var(--color-sc-ink)' }}>
        {verdict.headline}
      </h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--color-sc-muted)' }}>
        {item.name}
      </p>

      {item.chips && item.chips.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {item.chips.map((c, i) => (
            <span
              key={i}
              className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-medium shadow-sm"
              style={{ color: 'var(--color-sc-ink)' }}
            >
              <span>{c.emoji}</span> {c.label}
            </span>
          ))}
        </div>
      )}

      <div
        className="mt-5 flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm font-semibold"
        style={{ background: meta.bg, color: meta.color }}
      >
        <span className="text-lg">{meta.emoji}</span>
        <span>{verdict.summary}</span>
      </div>
    </div>
  );
}

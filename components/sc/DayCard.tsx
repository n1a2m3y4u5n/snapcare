'use client';

import { useState } from 'react';

import { Hear } from './Say';
import { Thumb } from './Thumb';
import { dayLabel, daySentence, type DaySummary } from '@/lib/history/byDay';
import { LEVEL_META } from '@/lib/snapcare/verdict';

/**
 * 하루 한 덩어리.
 *
 * `only` 는 어느 쪽 기록만 볼 것인가다. 화면이 영양과 복약으로 갈리면서, 같은
 * 하루를 두 화면이 각자의 눈으로 봐야 한다 — 영양 화면의 "8월 3일" 에 복용 기록이
 * 섞여 있으면 그 화면이 답한다고 한 물음이 흐려지고, 반대도 같다.
 *
 * 거르는 자리를 화면이 아니라 여기 두는 이유는 요약 배지 때문이다. 줄 끝의
 * 💊·🚫·🤢 는 `DaySummary` 에서 오는데, 화면에서 records 만 걸러 넘기면 그 배지들이
 * 걸러지지 않은 하루를 계속 말하게 된다.
 */
export function DayCard({ day, today, only = 'all' }: {
  day: DaySummary;
  today: string;
  only?: 'all' | 'food' | 'dose';
}) {
  const records = only === 'all' ? day.records
    : only === 'dose' ? day.records.filter((r) => r.dose)
    : day.records.filter((r) => !r.dose);
  const label = dayLabel(day.dayKey, today);
  const say = daySentence(day, label);
  const [open, setOpen] = useState(false);

  // 훅 뒤에서 물러난다. 앞에서 물러나면 그 날에 이쪽 기록이 있느냐 없느냐에 따라
  // 훅이 불렸다 안 불렸다 하고, 그것이 리액트가 금지하는 바로 그것이다.
  if (!records.length) return null;

  return (
    <div>
      <div className="flex items-center gap-2">
        {/*
          이름을 못박는다. 접근성 트리에서 이 버튼은 이름이 비어 있었다 — 안의
          글자가 span 여럿에 흩어져 있고 그림은 전부 aria-hidden 이라 그렇다.
          스캐닝으로 훑는 사람에게는 날짜 목록이 이름 없는 버튼 여러 개가 된다.
        */}
        <button onClick={() => setOpen(!open)} aria-expanded={open}
                aria-label={open ? `Hide ${label}` : `Show what happened on ${label}`}
                className="flex flex-1 items-center gap-2 text-left">
          <span aria-hidden className="text-sm">{open ? '▼' : '▶'}</span>
          <span className="text-sm font-bold" style={{ color: 'var(--color-sc-ink)' }}>{label}</span>
          {/* 그날에 무슨 일이 있었는지를 줄 끝에서 한눈에. 펴 보지 않아도 보인다. */}
          {only !== 'food' && day.missed > 0 && <span aria-hidden title="missed a dose">💊</span>}
          {only !== 'dose' && day.hadAvoid && <span aria-hidden title="something to avoid">🚫</span>}
          {only !== 'dose' && day.hadReaction && <span aria-hidden title="felt unwell">🤢</span>}
        </button>
        <Hear text={say} />
      </div>

      {/*
        접힌 상태에서도 그날 먹은 것의 그림은 보인다. 펴야만 보이면 되짚는 데
        누름이 하루마다 하나씩 더 들고, 이 화면은 되짚으라고 있는 화면이다.
      */}
      <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
        {/* 직접 찍은 것은 사진으로, 나머지는 이모지로. 이유는 Thumb 안에 적었다. */}
        {records.slice(0, open ? records.length : 8).map((r) => (
          <Thumb key={r.id} id={r.id} emoji={r.emoji} />
        ))}
        {!open && records.length > 8 && (
          <span className="flex h-9 items-center px-1 text-xs" style={{ color: 'var(--color-sc-muted)' }}>
            +{records.length - 8}
          </span>
        )}
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-1.5 pl-6">
          {records.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-sm">
              <Thumb id={r.id} emoji={r.emoji} size={28} />
              <span className="flex-1">
                <span className="block text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
                  {r.name}
                </span>
                <span className="block text-[11px]" style={{ color: 'var(--color-sc-muted)' }}>
                  {r.timeLabel}
                </span>
              </span>
              {/* 상자에서 온 것은 먹었는지 걸렀는지를 그림으로 낸다. 판정 색과 다른
                  뜻이라 색만으로 구별하지 않는다. */}
              {r.dose && (
                <span aria-hidden className="text-base">{r.dose.taken ? '✅' : '⭕'}</span>
              )}
              {!r.dose && r.level !== 'safe' && (
                <span aria-hidden className="text-base">{LEVEL_META[r.level].emoji}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

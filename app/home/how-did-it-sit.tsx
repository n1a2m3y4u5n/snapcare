'use client';

import { useState } from 'react';
import type { ScanRecord, Symptom } from '@/lib/snapcare/types';
import { useScans } from '@/stores/scans';
import { sayable } from '@/components/sc/Say';

/**
 * "그거 먹고 괜찮았나요?" — 식이 일지의 입력부.
 *
 * 왜 나중에 묻는가: 반응은 먹은 직후에 나오지 않는다. 판정 화면에서 바로 물으면
 * 아직 답할 수 없는 것을 묻는 셈이라, 아직 답하지 않은 끼니 중 가장 오래된 것을 고른다.
 *
 * 왜 한 번에 하나인가: 기록 전체에 얼굴을 붙이면 밀린 숙제처럼 보이고, 그러면
 * 아무거나 눌러 치우게 된다. 성의 없는 답이 쌓이면 추론은 조용히 틀린다.
 * 답하지 않는 것은 자료가 아니므로(무응답은 세지 않는다) 건너뛰어도 아무 손해가 없다.
 *
 * 글자를 못 읽어도 되어야 하므로 선택지는 전부 그림이다. 다만 이 화면의 문구는
 * 보호자·심사자도 읽으므로 영어 라벨을 함께 둔다 (앱 전체와 같은 방침).
 */

/**
 * 증상 선택지.
 *
 * 이모지에서 우리 글리프로 바꿨다. 🌶️ 로 '가려움' 을 뜻하게 하는 건 무리였고 —
 * 고추는 매운 것이지 두드러기가 아니다 — 이모지는 기기마다 다르게 그려져서
 * 같은 그림을 보고 답한다는 보장이 없다. 여기 답이 알레르기 추론의 입력이므로,
 * 무엇을 가리켰는지가 흔들리면 추론도 흔들린다.
 */
const SYMPTOMS: { key: Symptom; glyph: string; label: string }[] = [
  { key: 'skin', glyph: 'symptom_skin', label: 'Itchy skin' },
  { key: 'gut', glyph: 'symptom_gut', label: 'Upset stomach' },
  { key: 'mouth', glyph: 'symptom_mouth', label: 'Lips or mouth' },
  { key: 'breath', glyph: 'symptom_breath', label: 'Hard to breathe' },
];

/** 아직 답하지 않은 음식·음료 중 가장 오래된 것. 없으면 카드를 띄우지 않는다. */
export function pendingFeedback(scans: ScanRecord[], memberId: string): ScanRecord | undefined {
  const open = scans.filter(
    (s) => s.memberId === memberId
      && (s.kind === 'food' || s.kind === 'drink')
      && s.reaction === undefined,
  );
  return open[open.length - 1];   // scans 는 최신순이라 마지막이 가장 오래된 것
}

export function HowDidItSit({ record }: { record: ScanRecord }) {
  const setReaction = useScans((s) => s.setReaction);
  const [asking, setAsking] = useState(false);

  function pick(symptom: Symptom) {
    setReaction(record.id, 'unwell', [symptom]);
    setAsking(false);
  }

  return (
    <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}
         {...sayable(`How did it sit? You had ${record.name}. Tap the smiling face if you were fine, or the unhappy face if you felt unwell.`)}>
        HOW DID IT SIT?
      </p>

      <div className="mt-2 flex items-center gap-2">
        <span className="text-xl">{record.emoji}</span>
        <span className="text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
          {record.name}
        </span>
      </div>

      {!asking ? (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setReaction(record.id, 'fine')}
            className="flex flex-1 flex-col items-center gap-1 rounded-2xl py-3"
            style={{ background: 'var(--color-safe-bg)', color: 'var(--color-safe)' }}
          >
            <span className="text-2xl" aria-hidden>🙂</span>
            <span className="text-xs font-semibold" {...sayable('Fine.')}>Fine</span>
          </button>
          <button
            onClick={() => setAsking(true)}
            className="flex flex-1 flex-col items-center gap-1 rounded-2xl py-3"
            style={{ background: 'var(--color-caution-bg)', color: 'var(--color-caution)' }}
          >
            <span className="text-2xl" aria-hidden>😣</span>
            <span className="text-xs font-semibold" {...sayable('Unwell.')}>Unwell</span>
          </button>
        </div>
      ) : (
        <>
          <p className="mt-3 text-xs" style={{ color: 'var(--color-sc-muted)' }}
             {...sayable('Where did it bother you?')}>
            Where?
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {SYMPTOMS.map((s) => (
              <button
                key={s.key}
                onClick={() => pick(s.key)}
                className="flex items-center gap-2 rounded-2xl bg-[var(--color-sc-bg)] px-3 py-3 text-left"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/glyphs/${s.glyph}.png`} alt="" aria-hidden className="h-7 w-7 shrink-0" />
                <span className="text-xs font-semibold" style={{ color: 'var(--color-sc-ink)' }}
                      {...sayable(s.label)}>
                  {s.label}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

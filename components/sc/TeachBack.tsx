'use client';

import { useEffect, useRef, useState } from 'react';
import { dslSentence } from '@/lib/snapcare/dslSpeech';
import { buildQuestions } from '@/lib/snapcare/teachBack';
import { Speakable } from '@/components/sc/Say';
import { speak } from '@/lib/voice';
import type { ScanItem } from '@/lib/snapcare/types';

/**
 * 되말하기 — 설명이 끝난 뒤에 알아들었는지 확인한다.
 *
 * 왜 이 화면이 필요한가는 lib/snapcare/teachBack.ts 에 적었다. 여기서 지키는 것은
 * 그것을 화면으로 옮길 때의 규칙이다:
 *
 *  · **막지 않는다.** 틀려도 다음으로 간다. 이 화면 아래에 약 정보가 그대로 있고,
 *    건너뛸 수도 있다. 확인을 통과해야 정보를 주는 앱은 약을 못 먹게 하는 앱이다.
 *  · **틀리면 그 자리에서 다시 말해 준다.** 맞는 그림을 켜 두고 소리로 한 번 더.
 *    목적은 점수가 아니라 두 번째 기회다.
 *  · **소리가 먼저다.** 물음은 뜨자마자 읽힌다 — 화면을 못 읽는 사람에게는 그것이
 *    물음이 도착하는 유일한 경로다.
 *  · 맞았다고 축하하지 않는다. 이것은 놀이가 아니고, 처방을 다루는 자리에서 요란한
 *    반응은 다음 화면의 경고까지 같은 무게로 만든다.
 */
export function TeachBack({ item }: { item: ScanItem }) {
  const questions = buildQuestions(item);
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);
  /** 이미 읽어 준 물음 — 다시 그려질 때마다 되풀이하지 않는다. */
  const said = useRef(-1);

  const q = questions[at];

  useEffect(() => {
    if (!q || said.current === at) return;
    said.current = at;
    void speak(q.ask, 'en-US');
  }, [q, at]);

  if (questions.length === 0 || skipped) return null;

  // 다 끝났다. 조용히 사라지지 않고 한 줄 남긴다 — 무엇을 했는지 보이는 편이 낫다.
  if (!q) {
    return (
      <Speakable text="You went through it. The pictures above say the same thing whenever you need them."
                 className="mt-4 flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-sm"
                 style={{ background: 'var(--color-safe-bg)', color: 'var(--color-sc-ink)' }}>
        <span aria-hidden className="text-xl">✅</span>
        <span className="flex-1">You went through it — the pictures above stay here.</span>
      </Speakable>
    );
  }

  const right = picked === q.correct;

  function choose(option: string) {
    if (picked) return;
    setPicked(option);
    // 맞았든 틀렸든 **같은 문장**을 말한다. 맞은 사람에게는 확인이고 틀린 사람에게는
    // 정정인데, 어느 쪽이든 마지막으로 듣는 말이 옳은 지시여야 한다. 틀렸다는 말을
    // 앞에 붙이지 않는 이유도 같다 — 앞말이 기억에 남는다.
    void speak(option === q.correct ? q.again : `${q.again} Look at the picture that is lit up.`, 'en-US');
  }

  function next() {
    setPicked(null);
    setAt((n) => n + 1);
  }

  return (
    <section className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
      <Speakable text="Let us check. You can skip this."
                 className="flex w-full items-center gap-2 text-[11px] font-bold tracking-wide"
                 style={{ color: 'var(--color-sc-muted)' }}>
        <span className="flex-1">LET&apos;S CHECK</span>
        <span>{at + 1}/{questions.length}</span>
      </Speakable>

      <Speakable text={q.ask} className="mt-2 flex w-full items-center gap-2 text-lg font-bold">
        <span className="flex-1">{q.ask}</span>
      </Speakable>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {q.options.map((option) => {
          const isCorrect = option === q.correct;
          // 답한 뒤에는 **맞는 것**을 켠다. 짚은 것이 아니라. 틀린 사람이 마지막으로
          // 보는 것이 맞는 그림이어야 한다.
          const lit = picked ? isCorrect : false;
          const dim = picked ? !isCorrect : false;
          return (
            <button
              key={option}
              onClick={() => choose(option)}
              disabled={!!picked}
              aria-label={dslSentence(`\\${option}`) ?? option.replace(/_/g, ' ')}
              className="flex aspect-square items-center justify-center rounded-2xl p-2 transition-opacity"
              style={{
                background: 'var(--color-sc-bg)',
                outline: lit ? '3px solid var(--color-safe)' : 'none',
                opacity: dim ? 0.35 : 1,
              }}
            >
              {/*
                형태소 자산을 그대로 쓴다. 엔진을 거치면 테두리와 안쪽 여백이 붙어
                그림이 작아지는데, 여기서 필요한 것은 짚을 수 있을 만큼 큰 그림 하나다.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/glyphs/${option}.png`} alt="" aria-hidden className="h-full w-full object-contain" />
            </button>
          );
        })}
      </div>

      {picked && (
        <Speakable text={q.again}
                   className="mt-3 flex w-full items-center gap-2 text-sm font-semibold"
                   style={{ color: right ? 'var(--color-safe)' : 'var(--color-caution)' }}>
          <span aria-hidden className="text-lg">{right ? '✅' : '↺'}</span>
          <span className="flex-1">{q.again}</span>
        </Speakable>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => setSkipped(true)}
          className="text-xs font-semibold underline"
          style={{ color: 'var(--color-sc-muted)' }}
        >
          Skip
        </button>
        <span className="flex-1" />
        {picked && (
          <button
            onClick={next}
            className="h-11 rounded-2xl px-5 text-sm font-bold text-white"
            style={{ background: 'var(--color-sc-primary)' }}
            aria-label={at + 1 < questions.length ? 'Next question' : 'Done'}
          >
            {at + 1 < questions.length ? 'Next' : 'Done'}
          </button>
        )}
      </div>
    </section>
  );
}

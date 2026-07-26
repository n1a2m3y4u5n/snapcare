'use client';

import { useRouter } from 'next/navigation';
import { FIRST_RUN_SAMPLES } from '@/lib/snapcare/samples';
import { sayable } from '@/components/sc/Say';

/**
 * 아직 아무것도 찍지 않은 사람에게 내놓는 세 장.
 *
 * 처음 연 홈은 파란 단추 하나와 빈 공간이었다. 단추가 무엇을 하는지 아는 사람에게는
 * 충분하지만, 모르는 사람에게는 누를 이유가 없는 원 하나다. 카메라 권한을 내주는
 * 것은 "이게 뭘 해주는지" 를 본 다음의 일인데, 순서가 거꾸로였다.
 *
 * 표본은 원래 카메라 화면의 `Can't take a photo?` 뒤에 있었다. 실패한 사람을 위한
 * 자리라 처음 온 사람은 영영 만나지 못한다. 옮긴 것이지 새로 만든 것이 아니다.
 *
 * 그림 자체를 크게 내놓는 이유: 이게 무엇인지가 글이 아니라 사진으로 보여야 한다.
 * 처방전은 처방전처럼, 성분표는 성분표처럼 생겼으므로 그림이 곧 설명이다.
 */
export function TryIt() {
  const router = useRouter();

  return (
    <section className="mt-8">
      <p className="text-xs font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}
         {...sayable('Try it. Tap one of these pictures and SnapCare will read it, just like a photograph.')}>
        TRY IT
      </p>

      <div className="mt-2 grid grid-cols-3 gap-2">
        {FIRST_RUN_SAMPLES.map((s) => (
          <button
            key={s.slug}
            onClick={() => router.push(`/camera?try=${s.slug}`)}
            className="overflow-hidden rounded-2xl bg-white shadow-sm active:scale-95 transition-transform"
            aria-label={`Try ${s.label}`}
            {...sayable(`${s.label}. Tap to read it.`)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.src}
              alt=""
              aria-hidden
              className="h-20 w-full object-cover object-top"
            />
            <span className="flex items-center justify-center gap-1 px-1 py-1.5 text-[10px] font-semibold"
                  style={{ color: 'var(--color-sc-ink)' }}>
              <span aria-hidden>{s.emoji}</span>
              {s.label.replace(/ (label|Rx)$/, '')}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

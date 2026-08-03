'use client';

import { clockFace, dayPart, parseClock, speakTime } from '@/lib/snapcare/clock';
import { Speakable } from './Say';

/**
 * 시각을 시계 문자판 + 해/달로 보여준다.
 *
 * 글자를 지우지는 않는다 — 보호자와 심사자도 이 화면을 본다. 대신 크기를 뒤집었다.
 * 그림이 먼저 보이고 글자는 작게 딸린다. 글을 읽는 사람에게는 아무것도 잃지 않으면서,
 * 못 읽는 사람에게는 없던 정보가 생긴다.
 *
 * 시각을 못 읽어내면 그림을 그리지 않는다. 틀린 시계는 없는 시계보다 나쁘다.
 */
export function TimeGlyph({ label, className = '', mute = false, compact = false }: {
  label: string;
  className?: string;
  /** 이미 버튼 안에 있는 자리에서 쓴다 — 버튼을 중첩하면 키보드 탐색이 깨진다 */
  mute?: boolean;
  /**
   * 목록 줄 안에서 쓴다 — 시계 문자판을 뺀다.
   *
   * 원래 시각을 세 가지로 겹쳐 냈다: 시계 문자판(🕣), 때 그림(🌙), 그리고 글자.
   * 겹쳐 내는 것 자체는 이 앱의 원칙이지만, 17px 짜리 시계 문자판은 **읽히지 않는다** —
   * 바늘 두 개를 그 크기로 구별하려면 이미 시계를 읽을 줄 알아야 하고, 그럴 줄 아는
   * 사람은 옆의 글자를 읽으면 된다. 남는 것은 잡음뿐이다.
   *
   * 때 그림(아침·낮·저녁·밤)은 남긴다. 그쪽은 17px 에서도 갈리고, 글을 못 읽는
   * 사람에게 실제로 도착하는 유일한 시각 정보다.
   */
  compact?: boolean;
}) {
  const t = parseClock(label);
  if (!t) return <span className={className}>{label}</span>;

  const part = dayPart(t.hour);
  // 'Today · 2:14 PM' 에서 날짜 부분만 남긴다 — 시각은 그림이 맡았다
  const day = label.includes('·') ? label.split('·')[0].trim() : '';

  const face = (
    <>
      {!compact && (
        <span aria-hidden className="text-[17px] leading-none">{clockFace(t.hour, t.minute)}</span>
      )}
      <span aria-hidden className="text-[17px] leading-none">{part.emoji}</span>
      <span className="text-[10px] opacity-50">{label}</span>
    </>
  );

  if (mute) {
    return <span className={`inline-flex items-center gap-1 ${className}`}>{face}</span>;
  }
  return (
    <Speakable
      text={`${day} ${speakTime(t.hour, t.minute)}`.trim()}
      className={`inline-flex items-center gap-1 ${className}`}
    >
      {face}
    </Speakable>
  );
}

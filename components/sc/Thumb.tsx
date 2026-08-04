'use client';

import { useEffect, useState } from 'react';

import { getThumb } from '@/lib/photos/store';
import { FoodIcon, PillIcon } from '@/components/icons';
import type { ItemKind, Level } from '@/lib/snapcare/types';

/**
 * 그 기록의 사진. 없으면 그림으로 떨어진다.
 *
 * **찍은 사진이 가장 좋은 그림이다.** 그 사람이 실제로 먹은 그것이고, 어떤 아이콘도
 * 그만큼 정확할 수 없다. 목록을 되짚는 사람이 찾는 것도 "그날 그 빵" 이지 빵 일반이
 * 아니다.
 *
 * 사진이 없는 것은 셋뿐이다 — 표본을 눌러 본 것, 약통이 보낸 복용, 시연 자료.
 * 그 자리에 예전에는 이모지가 앉았는데, 이모지는 우리가 그린 것이 아니라 기기마다
 * 다르게 생기고 크기도 우리가 못 정한다. 그래서 우리 그림으로 떨어진다: 약은 알약,
 * 나머지는 그릇이다.
 *
 * 판정 색을 입힌다. 사진이 있는 줄과 없는 줄이 같은 목록에 섞이는데, 없는 쪽이
 * 회색 덩어리로만 남으면 그 줄이 빈 것처럼 읽힌다. 색이 들어가면 사진 대신 **판정**
 * 이 그 자리를 지킨다.
 *
 * 사진은 IndexedDB 에서 온다. 첫 그림이 뜨기 전 한 프레임쯤 이 그림이 보이는데,
 * 그것을 없애려고 자리를 비워 두면 목록이 뜰 때마다 칸이 흔들린다.
 */
const LEVEL_COLOR: Record<string, string> = {
  safe: 'var(--color-safe)',
  caution: 'var(--color-caution)',
  avoid: 'var(--color-avoid)',
};

export function Thumb({ id, size = 36, kind, level }: {
  id: string;
  size?: number;
  kind?: ItemKind;
  level?: Level;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getThumb(id).then((t) => { if (alive) setSrc(t); });
    return () => { alive = false; };
  }, [id]);

  if (!src) {
    const Fallback = kind === 'medicine' ? PillIcon : FoodIcon;
    return (
      <span aria-hidden
            className="flex shrink-0 items-center justify-center rounded-xl bg-white"
            style={{
              width: size, height: size, fontSize: size * 0.55,
              color: (level && LEVEL_COLOR[level]) ?? 'var(--color-sc-muted)',
            }}>
        <Fallback />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      className="shrink-0 rounded-xl object-cover"
      style={{ width: size, height: size }}
    />
  );
}

'use client';

import { useEffect, useState } from 'react';

import { getThumb } from '@/lib/photos/store';

/**
 * 그 기록의 사진. 없으면 이모지로 떨어진다.
 *
 * 왜 이모지를 그대로 두는가
 * -------------------------
 * 사진이 있는 기록은 **직접 찍은 것뿐**이다. 표본을 눌러 본 것, 약통이 보낸 복용,
 * 시연 자료에는 사진이 없다. 그 자리에 회색 네모를 두면 목록이 구멍 난 것처럼
 * 보이고, 사진이 없는 것이 무언가 잘못된 것처럼 읽힌다. 이모지는 원래 거기 있던
 * 것이고 뜻도 지고 있다.
 *
 * 사진은 IndexedDB 에서 온다. 첫 그림이 뜨기 전 한 프레임쯤 이모지가 보이는데,
 * 그것을 없애려고 자리를 비워 두면 목록이 뜰 때마다 칸이 흔들린다.
 */
export function Thumb({ id, emoji, size = 36 }: { id: string; emoji: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getThumb(id).then((t) => { if (alive) setSrc(t); });
    return () => { alive = false; };
  }, [id]);

  if (!src) {
    return (
      <span aria-hidden
            className="flex shrink-0 items-center justify-center rounded-xl bg-white text-lg"
            style={{ width: size, height: size }}>
        {emoji}
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

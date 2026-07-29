'use client';

import Link from 'next/link';
import { sayable } from './Say';

export type TabKey = 'home' | 'nutrition' | 'settings';

const TABS: { key: TabKey; href: string; label: string; emoji: string; says: string }[] = [
  { key: 'home', href: '/home', label: 'Home', emoji: '🏠', says: 'Home. Take a photograph, and see what was checked.' },
  { key: 'nutrition', href: '/nutrition', label: 'Nutrition', emoji: '🥗', says: "Nutrition. Everything eaten today." },
  { key: 'settings', href: '/settings', label: 'Settings', emoji: '⚙️', says: 'Settings. Who we check for, and the voice.' },
];

/**
 * 하단 탭. 낭독 버튼도 여기 한 칸을 받는다 (children).
 *
 * 떠 있는 원으로 두었더니 어느 구석에 놓아도 내용을 가렸다 — 줄마다 듣기 버튼이
 * 생기면서 화면 양옆이 컨트롤 열이 됐기 때문이다. 탭바는 내용이 지나가지 않는
 * 유일한 자리이고, 읽지 못하는 사람이 버튼을 찾는 방법인 '늘 거기 있다' 도 그대로다.
 */
export function TabBar({ active, children }: { active: TabKey; children?: React.ReactNode }) {
  return (
    <nav
      className="absolute bottom-0 left-0 right-0 mx-auto max-w-[440px] flex items-stretch justify-around border-t bg-white/95 backdrop-blur px-2 pt-2 pb-6"
      style={{ borderColor: 'var(--color-sc-line)' }}
    >
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            className="flex flex-1 flex-col items-center gap-1 py-1"
            style={{ color: on ? 'var(--color-sc-primary)' : 'var(--color-sc-muted)' }}
          >
            <span className="text-xl leading-none" aria-hidden style={{ opacity: on ? 1 : 0.7 }}>{t.emoji}</span>
            {/* 어디로 갈 수 있는지도 들려야 한다 — 이동 수단이 안 들리면 앱을 못 벗어난다.
                지금 있는 곳은 그렇다고 말해준다. */}
            <span className="text-[11px] font-semibold" {...sayable(on ? `${t.says} You are here.` : t.says)}>
              {t.label}
            </span>
          </Link>
        );
      })}
      {children}
    </nav>
  );
}

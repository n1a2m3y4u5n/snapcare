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
export function TabBar({ active, children, hideNav = false }: {
  active: TabKey;
  children?: React.ReactNode;
  /**
   * 이동 링크만 감춘다. 낭독 버튼은 **자리를 그대로 지킨다.**
   *
   * 홈이 궤도가 되면서 아래 탭의 이동 링크가 궤도와 같은 말을 하게 됐다. 링크는
   * 걷어내면 되는데 낭독 버튼은 그럴 수 없다 — 이 파일 위에 적힌 대로, 읽지 못하는
   * 사람이 그 버튼을 찾는 방법은 '늘 거기 있다' 뿐이다. 홈에서만 자리가 바뀌면
   * 그 규칙이 깨지고, 하필 홈이 앱을 여는 첫 화면이다.
   *
   * 그래서 링크 자리에 빈 칸을 남긴다. 낭독 버튼은 넷 중 마지막 칸 그대로다.
   */
  hideNav?: boolean;
}) {
  return (
    <nav
      className="absolute bottom-0 left-0 right-0 mx-auto max-w-[440px] flex items-stretch justify-around border-t bg-white/95 backdrop-blur px-2 pt-2 pb-6"
      style={{ borderColor: 'var(--color-sc-line)' }}
    >
      {hideNav
        ? TABS.map((t) => <span key={t.key} aria-hidden className="flex-1" />)
        : TABS.map((t) => {
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

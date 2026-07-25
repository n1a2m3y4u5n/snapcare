'use client';

import Link from 'next/link';

export type TabKey = 'home' | 'nutrition' | 'settings';

const TABS: { key: TabKey; href: string; label: string; emoji: string }[] = [
  { key: 'home', href: '/home', label: 'Home', emoji: '🏠' },
  { key: 'nutrition', href: '/nutrition', label: 'Nutrition', emoji: '🥗' },
  { key: 'settings', href: '/settings', label: 'Settings', emoji: '⚙️' },
];

export function TabBar({ active }: { active: TabKey }) {
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
            <span className="text-xl leading-none" style={{ opacity: on ? 1 : 0.7 }}>{t.emoji}</span>
            <span className="text-[11px] font-semibold">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

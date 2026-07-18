'use client';

import { ReactNode } from 'react';

type CardColor = 'blue' | 'green' | 'purple' | 'pink' | 'amber' | 'red';

const colorMap: Record<CardColor, { bg: string; text: string; border: string }> = {
  blue:   { bg: 'bg-blue-50',   text: 'text-blue-800',   border: 'border-blue-100' },
  green:  { bg: 'bg-green-50',  text: 'text-green-800',  border: 'border-green-100' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-100' },
  pink:   { bg: 'bg-pink-50',   text: 'text-pink-800',   border: 'border-pink-100' },
  amber:  { bg: 'bg-amber-50',  text: 'text-amber-800',  border: 'border-amber-100' },
  red:    { bg: 'bg-red-50',    text: 'text-red-800',    border: 'border-red-100' },
};

interface PictogramCardProps {
  emoji: string;
  label: string;
  color: CardColor;
  onClick?: () => void;
  children?: ReactNode;
  /** 카드 크기 — 기본은 100×100dp 이상 */
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

/**
 * 픽토그램 카드 — Pictogram-first, Big-target, Color=Category 원칙
 */
export function PictogramCard({
  emoji,
  label,
  color,
  onClick,
  children,
  size = 'md',
  disabled = false,
}: PictogramCardProps) {
  const { bg, text, border } = colorMap[color];

  const sizeClass =
    size === 'sm' ? 'min-h-[100px] p-3 text-3xl' :
    size === 'lg' ? 'min-h-[140px] p-6 text-6xl' :
    'min-h-[110px] p-4 text-5xl';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex flex-col items-center justify-center gap-2 rounded-2xl border-2
        ${bg} ${text} ${border} ${sizeClass}
        w-full font-semibold transition-all
        active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
        shadow-sm hover:shadow-md
      `}
      aria-label={label}
      style={{ minHeight: 100 }}
    >
      <span role="img" aria-hidden="true" className="leading-none">
        {emoji}
      </span>
      <span className="text-sm font-bold">{label}</span>
      {children}
    </button>
  );
}

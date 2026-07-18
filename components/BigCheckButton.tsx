'use client';

interface BigCheckButtonProps {
  onClick?: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * 대형 확인 버튼 (초록 원형, ≥64px)
 */
export function BigCheckButton({
  onClick,
  label = '확인',
  disabled = false,
  className = '',
}: BigCheckButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{ minWidth: 80, minHeight: 80 }}
      className={`
        flex items-center justify-center rounded-full bg-green-600 text-white text-3xl
        w-20 h-20 shadow-lg transition-all active:scale-95
        disabled:opacity-50 disabled:cursor-not-allowed ${className}
      `}
    >
      ✓
    </button>
  );
}

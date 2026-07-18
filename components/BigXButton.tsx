'use client';

interface BigXButtonProps {
  onClick?: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * 대형 취소 버튼 (빨강 원형, ≥64px)
 */
export function BigXButton({
  onClick,
  label = '취소',
  disabled = false,
  className = '',
}: BigXButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{ minWidth: 80, minHeight: 80 }}
      className={`
        flex items-center justify-center rounded-full bg-red-600 text-white text-3xl
        w-20 h-20 shadow-lg transition-all active:scale-95
        disabled:opacity-50 disabled:cursor-not-allowed ${className}
      `}
    >
      ✕
    </button>
  );
}

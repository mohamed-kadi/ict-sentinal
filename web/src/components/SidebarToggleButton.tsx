'use client';

import clsx from 'clsx';

type SidebarToggleButtonProps = {
  open: boolean;
  side?: 'left' | 'right';
  onClick: () => void;
  title: string;
  ariaLabel: string;
  className?: string;
};

export function SidebarToggleButton({
  open,
  side = 'left',
  onClick,
  title,
  ariaLabel,
  className,
}: SidebarToggleButtonProps) {
  return (
    <button
      type="button"
      className={clsx(
        'flex h-10 w-10 items-center justify-center rounded-lg border border-transparent bg-transparent text-zinc-500 shadow-none transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/15',
        className,
      )}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 28 28"
        className="h-5 w-5"
        style={side === 'right' ? { transform: 'scaleX(-1)' } : undefined}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3.5" y="4.5" width="21" height="19" rx="5.5" />
        <path d="M13.5 5.5v17" />
        {open ? (
          <rect x="5.5" y="6.5" width="6" height="15" rx="2.5" fill="currentColor" opacity="0.18" stroke="none" />
        ) : (
          <rect x="5.5" y="6.5" width="2.5" height="15" rx="1.25" fill="currentColor" opacity="0.18" stroke="none" />
        )}
      </svg>
    </button>
  );
}

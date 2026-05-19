'use client';

export type RuntimeStatusTone = 'success' | 'info' | 'warning' | 'danger';

export type RuntimeStatusItem = {
  id: string;
  label: string;
  state: string;
  summary: string;
  detail?: string | null;
  tone: RuntimeStatusTone;
};

type RuntimeStatusPanelProps = {
  items: RuntimeStatusItem[];
  compact?: boolean;
};

const TONE_STYLES: Record<
  RuntimeStatusTone,
  {
    card: string;
    label: string;
    chip: string;
    summary: string;
    detail: string;
  }
> = {
  success: {
    card: 'border-emerald-500/25 bg-emerald-500/8',
    label: 'text-emerald-200',
    chip: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100',
    summary: 'text-emerald-50',
    detail: 'text-emerald-200/75',
  },
  info: {
    card: 'border-sky-500/25 bg-sky-500/8',
    label: 'text-sky-200',
    chip: 'border-sky-400/30 bg-sky-500/15 text-sky-100',
    summary: 'text-sky-50',
    detail: 'text-sky-200/75',
  },
  warning: {
    card: 'border-amber-500/25 bg-amber-500/8',
    label: 'text-amber-200',
    chip: 'border-amber-400/30 bg-amber-500/15 text-amber-100',
    summary: 'text-amber-50',
    detail: 'text-amber-200/75',
  },
  danger: {
    card: 'border-rose-500/25 bg-rose-500/8',
    label: 'text-rose-200',
    chip: 'border-rose-400/30 bg-rose-500/15 text-rose-100',
    summary: 'text-rose-50',
    detail: 'text-rose-200/75',
  },
};

export function RuntimeStatusPanel({ items, compact = false }: RuntimeStatusPanelProps) {
  if (!items.length) return null;

  return (
    <div className={compact ? 'flex flex-col gap-2' : 'grid gap-3 lg:grid-cols-2'}>
      {items.map((item) => {
        const styles = TONE_STYLES[item.tone];
        return (
          <article
            key={item.id}
            className={`rounded-2xl border px-4 py-3 shadow-[0_10px_35px_rgba(0,0,0,0.18)] backdrop-blur-sm ${styles.card}`}
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${styles.label}`}>
                  {item.label}
                </p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${styles.chip}`}>
                {item.state}
              </span>
            </div>
            <p className={`text-sm leading-relaxed ${styles.summary}`}>{item.summary}</p>
            {item.detail ? (
              <p className={`mt-2 text-xs leading-relaxed break-words ${styles.detail}`}>{item.detail}</p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/state/useAppStore';

type Props = { total: number };

export function BacktestControls({ total }: Props) {
  const { backtest, setBacktest } = useAppStore();

  useEffect(() => {
    if (!backtest.enabled || !backtest.playing) return;
    const maxIndex = Math.max(total - 1, 0);
    const id = setInterval(() => {
      setBacktest({ cursor: Math.min(Math.max(0, backtest.cursor + 1), maxIndex) });
    }, 1200 / backtest.speed);
    return () => clearInterval(id);
  }, [backtest.enabled, backtest.playing, backtest.cursor, backtest.speed, setBacktest, total]);

  if (!backtest.enabled) return null;

  return (
    <div className="flex items-center gap-3 border-t border-zinc-800 bg-zinc-950/70 px-4 py-3 text-sm text-zinc-200">
      <button
        className={btn()}
        onClick={() => setBacktest({ playing: !backtest.playing })}
        disabled={total === 0}
      >
        {backtest.playing ? 'Pause' : 'Play'}
      </button>
      <button
        className={btn()}
        onClick={() => setBacktest({ cursor: Math.max(0, backtest.cursor - 1) })}
        disabled={backtest.cursor <= 0}
      >
        Step -1
      </button>
      <button
        className={btn()}
        onClick={() => {
          const maxIndex = Math.max(total - 1, 0);
          setBacktest({ cursor: Math.min(Math.max(0, backtest.cursor + 1), maxIndex) });
        }}
        disabled={backtest.cursor >= Math.max(total - 1, 0)}
      >
        Step +1
      </button>
      <div className="text-xs text-zinc-400">
        Candle {Math.min(backtest.cursor + 1, total)} / {total} • Speed {backtest.speed}x
      </div>
    </div>
  );
}

function btn() {
  return 'rounded border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs font-semibold hover:border-zinc-700 disabled:opacity-50';
}

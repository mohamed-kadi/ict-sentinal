'use client';

import Image from 'next/image';
import { Bias, Timeframe, AssetClass } from '@/lib/types';
import { CRYPTO_SYMBOLS, FOREX_SYMBOLS, STOCK_SYMBOLS } from '@/lib/config';
import clsx from 'clsx';
import { useAppStore } from '@/state/useAppStore';

const MARKET_OPTIONS: { id: AssetClass; label: string }[] = [
  { id: 'crypto', label: 'Crypto' },
  { id: 'forex', label: 'Forex/Gold' },
  { id: 'stocks', label: 'Stocks' },
];

// Lightweight logo mapping (Clearbit). Falls back to dot if missing.
export const SYMBOL_LOGOS: Record<string, string> = {
  BTCUSDT: 'https://logo.clearbit.com/binance.com',
  ETHUSDT: 'https://logo.clearbit.com/ethereum.org',
  SOLUSDT: 'https://logo.clearbit.com/solana.com',
  XRPUSDT: 'https://logo.clearbit.com/ripple.com',
  EURUSD: 'https://logo.clearbit.com/ecb.europa.eu',
  GBPUSD: 'https://logo.clearbit.com/bankofengland.co.uk',
  USDJPY: 'https://logo.clearbit.com/boj.or.jp',
  XAUUSD: 'https://logo.clearbit.com/lbma.org.uk',
  AAPL: 'https://logo.clearbit.com/apple.com',
  MSFT: 'https://logo.clearbit.com/microsoft.com',
  NVDA: 'https://logo.clearbit.com/nvidia.com',
  AMZN: 'https://logo.clearbit.com/amazon.com',
  GOOGL: 'https://logo.clearbit.com/abc.xyz',
  META: 'https://logo.clearbit.com/meta.com',
  TSLA: 'https://logo.clearbit.com/tesla.com',
  SPY: 'https://logo.clearbit.com/spglobal.com',
  QQQ: 'https://logo.clearbit.com/nasdaq.com',
  DIA: 'https://logo.clearbit.com/spglobal.com',
  US100: 'https://logo.clearbit.com/nasdaq.com',
  default: 'https://logo.clearbit.com/tradingview.com',
};

type Props = {
  symbol: string;
  timeframe: Timeframe;
  bias?: Bias;
};

export function TopBar({ symbol, timeframe, bias }: Props) {
  const { assetClass, setAssetClass, setSymbol, sidebarOpen, toggleSidebar } = useAppStore();
  const biasColor =
    bias?.label === 'Bullish' ? 'text-emerald-400' : bias?.label === 'Bearish' ? 'text-red-400' : 'text-zinc-200';
  const symbols = assetClass === 'crypto' ? CRYPTO_SYMBOLS : assetClass === 'forex' ? FOREX_SYMBOLS : STOCK_SYMBOLS;

  return (
    <header className="flex flex-col gap-2 border-b border-zinc-800 bg-zinc-950/70 px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-zinc-400">ICT Trading Desk</p>
          <p className="text-lg font-semibold text-white tracking-tight">
            {symbol} <span className="text-zinc-500">/</span> {timeframe}
          </p>
        </div>
        <button
          className="hidden rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 transition hover:border-zinc-700 sm:inline-flex"
          onClick={() => useAppStore.getState().toggleSidebar()}
        >
          Toggle Sidebar
        </button>
        <div className="hidden items-center gap-2 rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-xs text-zinc-200 sm:flex">
          {MARKET_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={clsx(
                'rounded px-2 py-1 transition',
                assetClass === opt.id ? 'bg-emerald-500/20 text-emerald-200' : 'hover:bg-zinc-800',
              )}
              onClick={() => setAssetClass(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 sm:hidden">
          <select
            className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-white"
            value={assetClass}
            onChange={(e) => setAssetClass(e.target.value as AssetClass)}
          >
            {MARKET_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase text-zinc-400">Daily Bias</p>
          <p className={clsx('text-base font-semibold', biasColor)}>
            {bias?.label ?? 'Neutral'} {bias?.reason ? <span className="text-xs text-zinc-500">({bias.reason})</span> : null}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {symbols.map((s) => (
          <button
            key={s}
            className={clsx(
              'flex items-center gap-2 rounded border px-3 py-1 text-xs font-semibold transition',
              symbol === s
                ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
                : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700',
            )}
            onClick={() => setSymbol(s)}
          >
            {SYMBOL_LOGOS[s] ? (
              <Image
                src={SYMBOL_LOGOS[s]!}
                alt={s}
                width={20}
                height={20}
                className="h-5 w-5 rounded-full bg-white/10 object-contain"
                loading="lazy"
                sizes="20px"
              />
            ) : (
              <span>•</span>
            )}
            <span>{s}</span>
          </button>
        ))}
      </div>
    </header>
  );
}

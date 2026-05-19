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
  latestOhlc?: { o: number; h: number; l: number; c: number } | null;
};

export function TopBar({ symbol, timeframe, bias, latestOhlc }: Props) {
  const { assetClass, setAssetClass, setSymbol, toggleInfo } = useAppStore();
  const biasColor =
    bias?.label === 'Bullish' ? 'text-emerald-400' : bias?.label === 'Bearish' ? 'text-red-400' : 'text-zinc-200';
  const biasChipClass =
    bias?.label === 'Bullish'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
      : bias?.label === 'Bearish'
        ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
        : 'border-zinc-700 bg-zinc-900 text-zinc-300';
  const symbols = assetClass === 'crypto' ? CRYPTO_SYMBOLS : assetClass === 'forex' ? FOREX_SYMBOLS : STOCK_SYMBOLS;

  const formatOhlc = (val: number) => {
    const abs = Math.abs(val);
    if (abs >= 1000) return val.toFixed(2);
    if (abs >= 1) return val.toFixed(2);
    if (abs >= 0.01) return val.toFixed(4);
    return val.toFixed(6);
  };

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/70 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
            <Image
              src="/ict-trading-desk-logo.png"
              alt="ICT Trading Desk logo"
              width={1254}
              height={1254}
              className="h-full w-full object-cover object-top"
              priority
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold tracking-tight text-white">
                {symbol}
              </p>
              <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
                {timeframe}
              </span>
            </div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              ICT Trading Desk
            </p>
          </div>
        </div>
        <div className="ml-auto flex flex-1 flex-wrap items-center justify-end gap-2">
          <select
            className="min-w-[7.5rem] rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-white"
            value={assetClass}
            onChange={(e) => setAssetClass(e.target.value as AssetClass)}
            aria-label="Asset class"
          >
            {MARKET_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          {latestOhlc && (
            <div className="hidden items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/70 px-2.5 py-1 text-[10px] text-zinc-300 lg:flex">
              <span>O <span className="text-sky-200">{formatOhlc(latestOhlc.o)}</span></span>
              <span>H <span className="text-emerald-200">{formatOhlc(latestOhlc.h)}</span></span>
              <span>L <span className="text-rose-200">{formatOhlc(latestOhlc.l)}</span></span>
              <span>C <span className="text-amber-200">{formatOhlc(latestOhlc.c)}</span></span>
            </div>
          )}
          <div
            className={clsx(
              'max-w-[12rem] truncate rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide',
              biasChipClass,
            )}
            title={bias?.reason ?? undefined}
          >
            <span className={biasColor}>{bias?.label ?? 'Neutral'}</span>
          </div>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-[12px] font-semibold text-zinc-200 transition hover:border-sky-500 hover:text-sky-200"
            onClick={() => toggleInfo()}
            title="Info dashboard"
            aria-label="Info dashboard"
          >
            ℹ
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {symbols.map((s) => (
          <button
            key={s}
            className={clsx(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition',
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
                width={14}
                height={14}
                className="h-[14px] w-[14px] rounded-full bg-white/10 object-contain"
                loading="lazy"
                sizes="14px"
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

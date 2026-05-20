'use client';

import Image from 'next/image';
import clsx from 'clsx';
import { useMemo, useState } from 'react';

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

const LOGO_PALETTE = [
  'border-sky-500/30 bg-sky-500/10 text-sky-100',
  'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
  'border-amber-500/30 bg-amber-500/10 text-amber-100',
  'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-100',
  'border-cyan-500/30 bg-cyan-500/10 text-cyan-100',
  'border-rose-500/30 bg-rose-500/10 text-rose-100',
];

type Props = {
  symbol: string;
  size?: number;
  className?: string;
};

function hashSymbol(symbol: string) {
  return symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function getBadgeText(symbol: string, size: number) {
  const normalized = symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!normalized) return '?';
  if (size >= 28) return normalized.slice(0, 3);
  if (size >= 18) return normalized.slice(0, 2);
  return normalized.slice(0, 1);
}

export function SymbolLogo({ symbol, size = 14, className }: Props) {
  const [failed, setFailed] = useState(false);
  const src = SYMBOL_LOGOS[symbol] ?? SYMBOL_LOGOS.default;
  const badgeText = useMemo(() => getBadgeText(symbol, size), [symbol, size]);
  const paletteClass = LOGO_PALETTE[hashSymbol(symbol) % LOGO_PALETTE.length];
  const fontSize = size >= 28 ? 'text-[11px]' : size >= 18 ? 'text-[9px]' : 'text-[8px]';

  if (!src || failed) {
    return (
      <span
        className={clsx(
          'inline-flex shrink-0 items-center justify-center rounded-full border font-semibold uppercase tracking-tight',
          paletteClass,
          fontSize,
          className,
        )}
        style={{ width: size, height: size }}
        aria-label={`${symbol} badge`}
        title={symbol}
      >
        {badgeText}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={`${symbol} logo`}
      width={size}
      height={size}
      unoptimized
      className={clsx('shrink-0 rounded-full bg-white/10 object-contain', className)}
      loading="lazy"
      sizes={`${size}px`}
      onError={() => setFailed(true)}
    />
  );
}

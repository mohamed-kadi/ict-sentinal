'use client';

import { useQuery } from '@tanstack/react-query';
import { AssetClass, Candle, Timeframe } from '@/lib/types';

type CandleResponse = { candles: Candle[]; source?: string; warning?: string; detail?: string };

async function fetchCandles(assetClass: AssetClass, symbol: string, timeframe: Timeframe): Promise<CandleResponse> {
  const base =
    assetClass === 'crypto'
      ? `/api/crypto/klines?symbol=${symbol}&interval=${timeframe}&limit=800`
      : `/api/forex/klines?symbol=${symbol}&interval=${timeframe}&limit=1200`;
  const res = await fetch(base, { cache: 'no-store' });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || 'Unable to fetch candles');
  }
  const json = await res.json();
  return {
    candles: (json.candles ?? []) as Candle[],
    source: json.source,
    warning: json.warning,
    detail: json.detail,
  };
}

export function useCandles(assetClass: AssetClass, symbol: string, timeframe: Timeframe) {
  return useQuery({
    queryKey: ['candles', assetClass, symbol, timeframe],
    queryFn: () => fetchCandles(assetClass, symbol, timeframe),
    refetchInterval: assetClass === 'crypto' ? 10_000 : 15_000,
  });
}

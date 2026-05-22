'use client';

import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useBackendBaseUrl } from '@/lib/backend';
import { fetchSignalAnalysis } from '@/lib/signalAnalysis';
import type { Candle, Timeframe } from '@/lib/types';

export function useSignalAnalysis(
  symbol: string,
  timeframe: Timeframe,
  candles: Candle[],
  signalLimit?: number | null,
  optimizerEnabled = true,
  enabled = true,
) {
  const backendBaseUrl = useBackendBaseUrl();
  const signature = useMemo(() => {
    const first = candles[0];
    const last = candles.at(-1);
    return [
      candles.length,
      first?.t ?? null,
      last?.t ?? null,
      last?.o ?? null,
      last?.h ?? null,
      last?.l ?? null,
      last?.c ?? null,
      last?.v ?? null,
    ];
  }, [candles]);

  return useQuery({
    queryKey: ['signal-analysis', backendBaseUrl, symbol, timeframe, signalLimit ?? null, optimizerEnabled, ...signature],
    queryFn: () => fetchSignalAnalysis(symbol, timeframe, candles, signalLimit, optimizerEnabled),
    enabled: enabled && Boolean(backendBaseUrl) && Boolean(symbol) && Boolean(timeframe) && candles.length > 1,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

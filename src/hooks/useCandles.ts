'use client';

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { AssetClass, Candle, Timeframe } from '@/lib/types';

type CandleResponse = {
  candles: Candle[];
  source?: string;
  warning?: string;
  detail?: string;
  timezone?: string | null;
};

type CandlePage = CandleResponse & { nextCursor: number | null };

const CRYPTO_CHUNK = 900;
const FOREX_CHUNK = 1500;

async function fetchCandles(
  assetClass: AssetClass,
  symbol: string,
  timeframe: Timeframe,
  limit: number,
  before?: number | null,
): Promise<CandlePage> {
  const baseUrl =
    assetClass === 'crypto'
      ? `/api/crypto/klines?symbol=${symbol}&interval=${timeframe}&limit=${Math.min(limit, 1000)}`
      : `/api/forex/klines?symbol=${symbol}&interval=${timeframe}&limit=${Math.min(limit, 5000)}`;
  const url = new URL(baseUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  if (before && Number.isFinite(before)) {
    url.searchParams.set('endTime', String(before));
  }
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || 'Unable to fetch candles');
  }
  const json = await res.json();
  const raw = (json.candles ?? []) as Candle[];
  const candles = [...raw].sort((a, b) => a.t - b.t);
  const earliest = candles[0]?.t ?? null;
  const nextCursor =
    candles.length >= Math.min(limit, assetClass === 'crypto' ? 1000 : 5000) && earliest != null
      ? earliest - 1
      : null;
  return {
    candles,
    source: json.source,
    warning: json.warning,
    detail: json.detail,
    timezone: json.timezone ?? 'UTC',
    nextCursor,
  };
}

export function useCandles(assetClass: AssetClass, symbol: string, timeframe: Timeframe) {
  const chunk =
    assetClass === 'crypto' ? Math.min(CRYPTO_CHUNK, 1000) : Math.min(FOREX_CHUNK, 5000);
  const query = useInfiniteQuery({
    queryKey: ['candles', assetClass, symbol, timeframe, chunk],
    queryFn: ({ pageParam }) => fetchCandles(assetClass, symbol, timeframe, chunk, pageParam ?? null),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    refetchInterval: assetClass === 'crypto' ? 10_000 : 15_000,
  });

  const candles = useMemo(() => {
    const map = new Map<number, Candle>();
    query.data?.pages.forEach((page) => {
      page.candles.forEach((candle) => {
        map.set(candle.t, candle);
      });
    });
    return Array.from(map.values())
      .sort((a, b) => a.t - b.t)
      .slice(-12_000);
  }, [query.data]);

  const latestPage = query.data?.pages?.[0];
  return {
    candles,
    source: latestPage?.source,
    warning: latestPage?.warning,
    detail: latestPage?.detail,
    timezone: latestPage?.timezone ?? 'UTC',
    fetchOlder: () => query.fetchNextPage(),
    hasMore: Boolean(query.hasNextPage),
    isFetchingOlder: query.isFetchingNextPage,
    isLoading: query.isLoading && !query.data,
    isRefetching: query.isRefetching,
    error: query.error,
    refetch: query.refetch,
  };
}

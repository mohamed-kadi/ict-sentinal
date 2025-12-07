'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
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
  const query = useInfiniteQuery<
    CandlePage, // TQueryFnData
    Error, // TError
    InfiniteData<CandlePage>, // TData (infinite shape)
    [string, AssetClass, string, Timeframe, number], // TQueryKey
    number | null // TPageParam
  >({
    queryKey: ['candles', assetClass, symbol, timeframe, chunk],
    queryFn: ({ pageParam = null }) => fetchCandles(assetClass, symbol, timeframe, chunk, pageParam),
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

  const [liveCandle, setLiveCandle] = useState<Candle | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (assetClass !== 'crypto') {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }
    const interval = timeframeToBinanceInterval(timeframe);
    if (!interval) return;
    const streamSymbol = symbol.toLowerCase();
    const url = `wss://stream.binance.com:9443/ws/${streamSymbol}@kline_${interval}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const k = data.k;
        if (!k) return;
        const candle: Candle = {
          t: k.t,
          o: Number(k.o),
          h: Number(k.h),
          l: Number(k.l),
          c: Number(k.c),
          v: Number(k.v),
        };
        setLiveCandle(candle);
      } catch {
        // ignore malformed
      }
    };
    ws.onerror = () => {
      ws.close();
    };
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [assetClass, symbol, timeframe]);

  const mergedCandles = useMemo(() => {
    if (!liveCandle) return candles;
    const list = [...candles];
    const last = list.at(-1);
    if (last && liveCandle.t >= last.t) {
      list[list.length - 1] = liveCandle;
      return list;
    }
    return list;
  }, [candles, liveCandle]);

  const latestPage = query.data?.pages?.[0];
  return {
    candles: mergedCandles,
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

function timeframeToBinanceInterval(tf: Timeframe): string | null {
  switch (tf) {
    case '1m':
    case '5m':
    case '15m':
    case '1h':
    case '4h':
      return tf;
    case '1D':
      return '1d';
    default:
      return null;
  }
}

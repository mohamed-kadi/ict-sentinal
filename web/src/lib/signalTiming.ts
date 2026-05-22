import type { Candle, Timeframe } from './types';

export type SignalActionability = {
  actionable: boolean;
  actionableTime: number | null;
  barsBehindLatest: number | null;
  latestCandleTime: number | null;
  latestCandleLikelyOpen: boolean;
  mode: 'none' | 'current-candle' | 'prior-closed-candle';
};

export function timeframeToMs(tf?: Timeframe) {
  switch (tf) {
    case '1m':
      return 60_000;
    case '5m':
      return 5 * 60_000;
    case '15m':
      return 15 * 60_000;
    case '1h':
      return 60 * 60_000;
    case '4h':
      return 4 * 60 * 60_000;
    case '1D':
      return 24 * 60 * 60_000;
    case '1W':
      return 7 * 24 * 60 * 60_000;
    case '1M':
      return 30 * 24 * 60 * 60_000;
    default:
      return 60 * 60_000;
  }
}

export function getSignalActionability({
  signalTime,
  candles,
  timeframeMs,
  allowPreviousWhenLatestOpen,
  now = Date.now(),
}: {
  signalTime: number | null | undefined;
  candles: Candle[];
  timeframeMs: number;
  allowPreviousWhenLatestOpen: boolean;
  now?: number;
}): SignalActionability {
  const latestCandleTime = candles.at(-1)?.t ?? null;
  if (!signalTime || !latestCandleTime || candles.length === 0) {
    return {
      actionable: false,
      actionableTime: null,
      barsBehindLatest: null,
      latestCandleTime,
      latestCandleLikelyOpen: false,
      mode: 'none',
    };
  }

  const latestIndex = candles.length - 1;
  const signalIndex = candles.findIndex((candle) => candle.t === signalTime);
  const barsBehindLatest =
    signalIndex >= 0
      ? latestIndex - signalIndex
      : Math.max(0, Math.round((latestCandleTime - signalTime) / Math.max(timeframeMs, 1)));
  const latestCandleLikelyOpen = now < latestCandleTime + Math.max(timeframeMs, 1);

  if (barsBehindLatest === 0) {
    return {
      actionable: true,
      actionableTime: signalTime,
      barsBehindLatest,
      latestCandleTime,
      latestCandleLikelyOpen,
      mode: 'current-candle',
    };
  }

  if (barsBehindLatest === 1 && allowPreviousWhenLatestOpen && latestCandleLikelyOpen) {
    return {
      actionable: true,
      actionableTime: signalTime,
      barsBehindLatest,
      latestCandleTime,
      latestCandleLikelyOpen,
      mode: 'prior-closed-candle',
    };
  }

  return {
    actionable: false,
    actionableTime: null,
    barsBehindLatest,
    latestCandleTime,
    latestCandleLikelyOpen,
    mode: 'none',
  };
}

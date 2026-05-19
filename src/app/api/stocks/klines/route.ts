import { NextRequest, NextResponse } from 'next/server';
import { clamp } from '@/lib/utils';

type Candle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

const YAHOO_INTERVALS: Record<string, { interval: string; aggregateCount?: number }> = {
  '1m': { interval: '1m' },
  '5m': { interval: '5m' },
  '15m': { interval: '15m' },
  '1h': { interval: '60m' },
  '4h': { interval: '60m', aggregateCount: 4 },
  '1D': { interval: '1d' },
  '1W': { interval: '1wk' },
  '1M': { interval: '1mo' },
};

const YAHOO_SYMBOL_MAP: Record<string, string> = {
  US100: '^NDX',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = normalizeSymbol(searchParams.get('symbol') || 'AAPL');
  const interval = searchParams.get('interval') ?? '1h';
  const limit = clamp(Number(searchParams.get('limit')) || 500, 50, 5000);
  const endTimeParam = searchParams.get('endTime');
  const before = endTimeParam ? Number(endTimeParam) : null;

  try {
    const yahoo = await fetchYahoo(symbol, interval, limit, before);
    return NextResponse.json({
      ...yahoo,
      candles: applyWindow(yahoo.candles, before, limit),
      source: 'yahoo',
    });
  } catch (error) {
    const candles = generateMockCandles(symbol, interval, limit);
    return NextResponse.json(
      {
        symbol,
        interval,
        candles: applyWindow(candles, before, limit),
        timezone: 'America/New_York',
        source: 'mock',
        warning: 'Live stock provider failed; showing mock data.',
        detail: String(error),
      },
      { status: 200 },
    );
  }
}

async function fetchYahoo(symbol: string, interval: string, limit: number, before: number | null) {
  const config = YAHOO_INTERVALS[interval];
  if (!config) {
    throw new Error('Unsupported interval for Yahoo');
  }

  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${mapYahooSymbol(symbol)}`);
  url.searchParams.set('interval', config.interval);
  if (before && Number.isFinite(before)) {
    const period2 = Math.floor(before / 1000);
    const period1 = Math.max(0, Math.floor((before - yahooWindowMs(interval, limit)) / 1000));
    url.searchParams.set('period1', String(period1));
    url.searchParams.set('period2', String(period2));
  } else {
    url.searchParams.set('range', yahooRangeFromInterval(interval, limit));
  }

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Yahoo error ${res.status}`);
  }

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result?.timestamp || !result?.indicators?.quote?.[0]) {
    throw new Error('Yahoo missing data');
  }

  const quotes = result.indicators.quote[0];
  const timezone = result.meta?.timezone ?? 'America/New_York';
  const candles: Candle[] = [];
  for (let idx = 0; idx < result.timestamp.length; idx += 1) {
    const timestamp = result.timestamp[idx];
    const open = Number(quotes.open?.[idx] ?? NaN);
    const high = Number(quotes.high?.[idx] ?? NaN);
    const low = Number(quotes.low?.[idx] ?? NaN);
    const close = Number(quotes.close?.[idx] ?? NaN);
    const volume = Number(quotes.volume?.[idx] ?? 0);
    if (Number.isFinite(open) && Number.isFinite(high) && Number.isFinite(low) && Number.isFinite(close)) {
      candles.push({
        t: timestamp * 1000,
        o: open,
        h: high,
        l: low,
        c: close,
        v: Number.isFinite(volume) ? volume : 0,
      });
    }
  }

  if (candles.length === 0) {
    throw new Error('Yahoo returned no finite candles');
  }

  const normalizedCandles = config.aggregateCount
    ? aggregateSequentialCandles(candles, config.aggregateCount, timezone)
    : candles;

  return {
    symbol,
    interval,
    candles: normalizedCandles.slice(-limit),
    timezone,
  };
}

function aggregateSequentialCandles(candles: Candle[], groupSize: number, timeZone: string) {
  const groupedByDay = new Map<string, Candle[]>();
  for (const candle of candles) {
    const dayKey = toDayKey(candle.t, timeZone);
    const dayCandles = groupedByDay.get(dayKey);
    if (dayCandles) {
      dayCandles.push(candle);
      continue;
    }
    groupedByDay.set(dayKey, [candle]);
  }

  const aggregated: Candle[] = [];
  for (const dayCandles of groupedByDay.values()) {
    for (let index = 0; index < dayCandles.length; index += groupSize) {
      const chunk = dayCandles.slice(index, index + groupSize);
      if (chunk.length === 0) {
        continue;
      }
      aggregated.push({
        t: chunk[0].t,
        o: chunk[0].o,
        h: Math.max(...chunk.map((candle) => candle.h)),
        l: Math.min(...chunk.map((candle) => candle.l)),
        c: chunk[chunk.length - 1].c,
        v: chunk.reduce((total, candle) => total + candle.v, 0),
      });
    }
  }

  return aggregated;
}

function toDayKey(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  }
  return `${values.year ?? '1970'}-${values.month ?? '01'}-${values.day ?? '01'}`;
}

function normalizeSymbol(symbol: string) {
  return symbol.replace('/', '').trim().toUpperCase();
}

function mapYahooSymbol(symbol: string) {
  return YAHOO_SYMBOL_MAP[symbol] ?? symbol;
}

function yahooRangeFromInterval(interval: string, limit: number) {
  if (interval === '1m') return '2d';
  if (interval === '5m' || interval === '15m') return '1mo';
  if (interval === '1h' || interval === '4h') return '3mo';
  if (interval === '1D' || interval === '1W') return '1y';
  if (interval === '1M') return '2y';
  return limit > 1000 ? '1y' : '6mo';
}

function yahooWindowMs(interval: string, limit: number) {
  switch (interval) {
    case '1m':
      return 2 * 24 * 60 * 60 * 1000;
    case '5m':
    case '15m':
      return 31 * 24 * 60 * 60 * 1000;
    case '1h':
    case '4h':
      return 93 * 24 * 60 * 60 * 1000;
    case '1D':
    case '1W':
      return 366 * 24 * 60 * 60 * 1000;
    case '1M':
      return 730 * 24 * 60 * 60 * 1000;
    default:
      return Math.max(limit, 1) * 24 * 60 * 60 * 1000;
  }
}

function applyWindow<T extends { t: number }>(candles: T[], before: number | null, limit: number): T[] {
  let filtered = candles;
  if (before && Number.isFinite(before)) {
    filtered = filtered.filter((candle) => candle.t < before);
  }
  return filtered.slice(-limit);
}

function generateMockCandles(symbol: string, interval: string, limit: number) {
  const now = Date.now();
  const step =
    interval === '1m'
      ? 60_000
      : interval === '5m'
        ? 300_000
        : interval === '15m'
          ? 900_000
          : interval === '1h'
            ? 3_600_000
            : interval === '4h'
              ? 14_400_000
              : 86_400_000;
  let price = symbol === 'US100' ? 18_000 : 100;
  const candles = [];
  for (let index = limit - 1; index >= 0; index -= 1) {
    const timestamp = now - index * step;
    const drift = (Math.sin(index / 15) + Math.random() * 0.25 - 0.125) * (price * 0.006);
    const open = price;
    const close = Math.max(1, price + drift);
    const high = Math.max(open, close) + Math.random() * (price * 0.003);
    const low = Math.min(open, close) - Math.random() * (price * 0.003);
    candles.push({
      t: timestamp,
      o: Number(open.toFixed(2)),
      h: Number(high.toFixed(2)),
      l: Number(low.toFixed(2)),
      c: Number(close.toFixed(2)),
      v: Math.round(100_000 + Math.random() * 900_000),
    });
    price = close;
  }
  return candles;
}

import { NextRequest, NextResponse } from 'next/server';
import { clamp } from '@/lib/utils';

const TWELVE_INTERVALS: Record<string, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '1h': '1h',
  '4h': '4h',
  '1D': '1day',
  '1W': '1week',
  '1M': '1month',
};

const ALPHA_INTERVALS: Record<string, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '30m': '30min',
  '1h': '60min',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = normalizeSymbol(searchParams.get('symbol') || 'EURUSD');
  const interval = searchParams.get('interval') ?? '1h';
  const limit = clamp(Number(searchParams.get('limit')) || 500, 50, 5000);

  try {
    // prefer TwelveData if available
    if (process.env.TWELVE_DATA_KEY) {
      try {
        const data = await fetchTwelveData(symbol, interval, limit, process.env.TWELVE_DATA_KEY);
        return NextResponse.json({ ...data, source: 'twelvedata' });
      } catch (err) {
        // continue to next provider
      }
    }
    if (process.env.ALPHA_VANTAGE_KEY) {
      try {
        const data = await fetchAlphaVantage(symbol, interval, limit, process.env.ALPHA_VANTAGE_KEY);
        return NextResponse.json({ ...data, source: 'alpha_vantage' });
      } catch (err) {
        // continue to fallback
      }
    }
    // fallback to Yahoo Finance (no key required)
    try {
      const yahoo = await fetchYahoo(symbol, interval, limit);
      return NextResponse.json({ ...yahoo, source: 'yahoo' });
    } catch (err) {
      // final fallback: synthetic candles so UI stays alive
      const candles = generateMockCandles(symbol, interval, limit);
      return NextResponse.json({
        symbol,
        interval,
        candles,
        source: 'mock',
        warning:
          'Live providers failed; showing mock data. Check TWELVE_DATA_KEY/ALPHA_VANTAGE_KEY or try a different interval/symbol.',
        detail: String(err),
      });
    }
  } catch (error) {
    // final fallback: synthetic candles so UI stays alive
    const candles = generateMockCandles(symbol, interval, limit);
    return NextResponse.json(
      {
        symbol,
        interval,
        candles,
        warning:
          'Live providers failed; showing mock data. Check TWELVE_DATA_KEY/ALPHA_VANTAGE_KEY or try a different interval/symbol.',
        detail: String(error),
      },
      { status: 200 },
    );
  }
}

async function fetchTwelveData(symbol: string, interval: string, limit: number, key: string) {
  const mappedInterval = TWELVE_INTERVALS[interval];
  if (!mappedInterval) throw new Error('Unsupported interval for TwelveData');
  const resolvedSymbol = await resolveTwelveSymbol(symbol, key).catch(() => symbol);
  const url = new URL('https://api.twelvedata.com/time_series');
  url.searchParams.set('symbol', resolvedSymbol);
  url.searchParams.set('interval', mappedInterval);
  url.searchParams.set('apikey', key);
  url.searchParams.set('outputsize', String(limit));
  url.searchParams.set('format', 'JSON');

  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json();
  if (json.status === 'error') throw new Error(json.message ?? 'TwelveData error');
  const timezone = json.meta?.timezone ?? 'UTC';
  const candles = (json.values ?? []).reverse().map((v: any) => ({
    t: zonedTimeToUtc(v.datetime, timezone),
    o: Number(v.open),
    h: Number(v.high),
    l: Number(v.low),
    c: Number(v.close),
    v: Number(v.volume ?? 0),
  }));
  return { symbol, interval, candles };
}

async function resolveTwelveSymbol(symbol: string, key: string) {
  const searchUrl = new URL('https://api.twelvedata.com/symbol_search');
  searchUrl.searchParams.set('symbol', symbol);
  searchUrl.searchParams.set('apikey', key);
  const res = await fetch(searchUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error('symbol search failed');
  const json = await res.json();
  const data = json?.data;
  if (Array.isArray(data) && data.length > 0 && typeof data[0].symbol === 'string') {
    return data[0].symbol;
  }
  return symbol;
}

async function fetchAlphaVantage(symbol: string, interval: string, limit: number, key: string) {
  const mappedInterval = ALPHA_INTERVALS[interval];
  if (!mappedInterval) throw new Error('Unsupported interval for Alpha Vantage');
  const url = new URL('https://www.alphavantage.co/query');
  url.searchParams.set('function', 'FX_INTRADAY');
  url.searchParams.set('from_symbol', symbol.slice(0, 3));
  url.searchParams.set('to_symbol', symbol.slice(3));
  url.searchParams.set('interval', mappedInterval);
  url.searchParams.set('apikey', key);
  url.searchParams.set('outputsize', 'full');

  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json();
  const keyName = Object.keys(json).find((k) => k.startsWith('Time Series'));
  if (!keyName) throw new Error(json['Error Message'] ?? 'Alpha Vantage error');
  const series = json[keyName];
  const timezone = json['Meta Data']?.['6. Time Zone'] ?? 'UTC';
  const entries = Object.entries(series)
    .map(([time, v]: any) => ({
      t: zonedTimeToUtc(time, timezone),
      o: Number(v['1. open']),
      h: Number(v['2. high']),
      l: Number(v['3. low']),
      c: Number(v['4. close']),
      v: 0,
    }))
    .sort((a, b) => a.t - b.t)
    .slice(-limit);
  return { symbol, interval, candles: entries };
}

function normalizeSymbol(symbol: string) {
  const clean = symbol.replace('/', '').toUpperCase();
  if (clean.length === 6) return clean;
  return clean;
}

async function fetchYahoo(symbol: string, interval: string, limit: number) {
  const yahooInterval = mapYahooInterval(interval);
  if (!yahooInterval) throw new Error('Unsupported interval for Yahoo');
  const yahooSymbol = mapYahooSymbol(symbol);

  const url = new URL('https://query1.finance.yahoo.com/v8/finance/chart/' + yahooSymbol);
  url.searchParams.set('interval', yahooInterval);
  url.searchParams.set('range', yahooRangeFromInterval(interval, limit));

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Yahoo error ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result?.timestamp || !result?.indicators?.quote?.[0]) {
    throw new Error('Yahoo missing data');
  }
  const quotes = result.indicators.quote[0];
  const candles: { t: number; o: number; h: number; l: number; c: number; v: number }[] = [];
  for (let idx = 0; idx < result.timestamp.length; idx++) {
    const t = result.timestamp[idx];
    const o = Number(quotes.open?.[idx] ?? NaN);
    const h = Number(quotes.high?.[idx] ?? NaN);
    const l = Number(quotes.low?.[idx] ?? NaN);
    const c = Number(quotes.close?.[idx] ?? NaN);
    const v = Number(quotes.volume?.[idx] ?? 0);
    if (Number.isFinite(o) && Number.isFinite(h) && Number.isFinite(l) && Number.isFinite(c)) {
      candles.push({ t: t * 1000, o, h, l, c, v });
    }
  }
  if (candles.length === 0) throw new Error('Yahoo returned no finite candles');
  return { symbol, interval, candles: candles.slice(-limit) };
}

function mapYahooInterval(interval: string) {
  switch (interval) {
    case '1m':
      return '1m';
    case '5m':
      return '5m';
    case '15m':
      return '15m';
    case '1h':
      return '60m';
    case '4h':
      return '4h';
    case '1D':
      return '1d';
    case '1W':
      return '1wk';
    case '1M':
      return '1mo';
    default:
      return null;
  }
}

function mapYahooSymbol(symbol: string) {
  const clean = symbol.toUpperCase();
  if (clean === 'XAUUSD') return 'GC=F'; // gold futures
  return `${clean}=X`;
}

function zonedTimeToUtc(dateTime: string, timeZone: string) {
  const trimmed = dateTime.trim();
  const isoBase = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const isoNormalized = isoBase.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  if (/[+-]\d{2}:\d{2}$/.test(isoNormalized) || /Z$/i.test(isoNormalized)) {
    const parsed = Date.parse(isoNormalized);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  const [datePart, timePart = '00:00:00'] = trimmed.split(/[\sT]/);
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second] = timePart.split(':').map((v) => Number(v ?? 0));
  const utcGuess = Date.UTC(year, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0, second ?? 0);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(utcGuess));
  const data: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      data[part.type] = Number(part.value);
    }
  }
  const actual = Date.UTC(
    data.year ?? 1970,
    (data.month ?? 1) - 1,
    data.day ?? 1,
    data.hour ?? 0,
    data.minute ?? 0,
    data.second ?? 0,
  );
  const desired = Date.UTC(year, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0, second ?? 0);
  const diff = desired - actual;
  return utcGuess + diff;
}

function yahooRangeFromInterval(interval: string, limit: number) {
  if (interval === '1m') return '2d';
  if (interval === '5m' || interval === '15m') return '1mo';
  if (interval === '1h' || interval === '4h') return '3mo';
  if (interval === '1D' || interval === '1W') return '1y';
  if (interval === '1M') return '2y';
  return '6mo';
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
  let price = symbol.toUpperCase().includes('XAU') ? 1950 : symbol.toUpperCase().includes('USD') ? 1.1 : 100;
  const candles = [];
  for (let i = limit - 1; i >= 0; i--) {
    const t = now - i * step;
    const drift = (Math.sin(i / 15) + Math.random() * 0.2 - 0.1) * (price * 0.001);
    const o = price;
    const c = Math.max(0.0001, price + drift);
    const h = Math.max(o, c) + Math.random() * (price * 0.0005);
    const l = Math.min(o, c) - Math.random() * (price * 0.0005);
    candles.push({
      t,
      o: Number(o.toFixed(4)),
      h: Number(h.toFixed(4)),
      l: Number(l.toFixed(4)),
      c: Number(c.toFixed(4)),
      v: 0,
    });
    price = c;
  }
  return candles;
}

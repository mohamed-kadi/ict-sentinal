import { NextRequest, NextResponse } from 'next/server';
import { clamp } from '@/lib/utils';

const INTERVAL_MAP: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1D': '1d',
  '1W': '1w',
  '1M': '1M',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  const interval = searchParams.get('interval') ?? '1h';
  const binanceInterval = INTERVAL_MAP[interval];
  if (!binanceInterval) {
    return NextResponse.json({ error: 'Unsupported interval' }, { status: 400 });
  }

  const limit = clamp(Number(searchParams.get('limit')) || 500, 10, 1000);
  const startTime = searchParams.get('startTime');
  const endTime = searchParams.get('endTime');

  const url = new URL('https://api.binance.com/api/v3/klines');
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', binanceInterval);
  url.searchParams.set('limit', String(limit));
  if (startTime) url.searchParams.set('startTime', startTime);
  if (endTime) url.searchParams.set('endTime', endTime);

  try {
    const res = await fetch(url, { next: { revalidate: 5 } });
    if (!res.ok) {
      return NextResponse.json({ error: 'Binance API error', status: res.status }, { status: 502 });
    }
    const raw = await res.json();
    const candles = (raw as unknown[][]).map((candle) => ({
      t: Number(candle[0]),
      o: Number(candle[1]),
      h: Number(candle[2]),
      l: Number(candle[3]),
      c: Number(candle[4]),
      v: Number(candle[5]),
    }));
    return NextResponse.json({ symbol, interval, candles });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to reach Binance', detail: String(error) },
      { status: 500 },
    );
  }
}

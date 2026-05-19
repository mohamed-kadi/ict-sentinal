import { Candle } from './types';

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function groupByDay(candles: Candle[]) {
  return candles.reduce<Record<string, Candle[]>>((acc, c) => {
    const key = new Date(c.t).toISOString().slice(0, 10);
    acc[key] = acc[key] ? [...acc[key], c] : [c];
    return acc;
  }, {});
}

export function dayStats(dayCandles: Candle[]) {
  const high = Math.max(...dayCandles.map((c) => c.h));
  const low = Math.min(...dayCandles.map((c) => c.l));
  return { open: dayCandles[0]?.o ?? 0, close: dayCandles.at(-1)?.c ?? 0, high, low };
}

export function toUTCDate(ms: number) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

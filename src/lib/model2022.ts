import {
  Bias,
  Candle,
  DailyCandle,
  DailyLiquidity,
  Gap,
  Model2022Signal,
  Model2022State,
  OrderBlock,
  StrongWeakSwing,
  StructureShift,
  Swing,
} from './types';
import {
  detectFVG,
  detectLiquiditySweeps,
  detectStructureShifts,
  detectSwings,
} from './ict';
import { groupByDay } from './utils';

const M15_MS = 15 * 60 * 1000;

type BuildArgs = {
  candles: Candle[];
  fullCandles?: Candle[];
  swings?: Swing[];
  gaps?: Gap[];
  orderBlocks?: OrderBlock[];
  bias?: Bias;
  structureShifts?: StructureShift[];
};

export function buildModel2022State({
  candles,
  fullCandles,
  swings = [],
  gaps = [],
  orderBlocks = [],
  bias,
  structureShifts,
}: BuildArgs): Model2022State {
  const source = fullCandles && fullCandles.length ? fullCandles : candles;
  const strongSwings = deriveStrongWeakSwings(swings, bias, structureShifts);
  const obWithDisplacement = filterOrderBlocksWithFvg(orderBlocks, gaps, candles);
  const dailyCandle = computeDailyCandle(source);
  const dailyLiquidity = computeDailyLiquidity(source);
  const m15Signals = detectModel2022Signals(source);

  return {
    strongSwings,
    obWithDisplacement,
    dailyCandle,
    dailyLiquidity,
    m15Signals,
  };
}

function deriveStrongWeakSwings(
  swings: Swing[],
  bias?: Bias,
  structureShifts?: StructureShift[],
): StrongWeakSwing[] {
  const latestShiftDir = structureShifts?.at(-1)?.direction ?? null;
  const biasDir =
    bias?.label === 'Bullish' ? 'bullish' : bias?.label === 'Bearish' ? 'bearish' : null;
  const dir = latestShiftDir ?? biasDir;
  return swings.map((s) => ({
    ...s,
    strength: dir
      ? dir === 'bullish'
        ? s.type === 'low'
          ? 'strong'
          : 'weak'
        : s.type === 'high'
          ? 'strong'
          : 'weak'
      : 'weak',
  }));
}

function filterOrderBlocksWithFvg(orderBlocks: OrderBlock[], gaps: Gap[], candles: Candle[]): OrderBlock[] {
  if (!orderBlocks.length || !gaps.length) return [];
  const frameMs = inferTimeframeMs(candles);
  const lookahead = frameMs ? frameMs * 6 : 6 * 60 * 60 * 1000;
  return orderBlocks.filter((ob) =>
    gaps.some(
      (g) =>
        g.type === ob.type &&
        g.startTime >= ob.endTime &&
        g.startTime <= ob.endTime + lookahead,
    ),
  );
}

function computeDailyCandle(candles: Candle[]): DailyCandle | null {
  if (!candles.length) return null;
  const byDay = groupByDay(candles);
  const keys = Object.keys(byDay).sort();
  const latestKey = keys.at(-1);
  if (!latestKey) return null;
  const day = byDay[latestKey] ?? [];
  if (!day.length) return null;
  const high = Math.max(...day.map((c) => c.h));
  const low = Math.min(...day.map((c) => c.l));
  return {
    date: latestKey,
    open: day[0].o,
    close: day.at(-1)?.c ?? day[0].c,
    high,
    low,
  };
}

function computeDailyLiquidity(candles: Candle[]): DailyLiquidity {
  const byDay = groupByDay(candles);
  const keys = Object.keys(byDay).sort();
  const latestKey = keys.at(-1);
  const prevKey = keys.at(-2);
  const prevDay = prevKey ? byDay[prevKey] ?? [] : [];
  const pdh = prevDay.length ? Math.max(...prevDay.map((c) => c.h)) : null;
  const pdl = prevDay.length ? Math.min(...prevDay.map((c) => c.l)) : null;
  const historyKeys = keys.filter((k) => k !== latestKey).slice(-3);
  const last3Highs = historyKeys
    .map((k) => {
      const day = byDay[k] ?? [];
      const price = day.length ? Math.max(...day.map((c) => c.h)) : null;
      return price != null ? { date: k, price } : null;
    })
    .filter((lvl): lvl is NonNullable<typeof lvl> => lvl != null);
  const last3Lows = historyKeys
    .map((k) => {
      const day = byDay[k] ?? [];
      const price = day.length ? Math.min(...day.map((c) => c.l)) : null;
      return price != null ? { date: k, price } : null;
    })
    .filter((lvl): lvl is NonNullable<typeof lvl> => lvl != null);
  const midnightOpen = latestKey ? byDay[latestKey]?.[0]?.o ?? null : null;
  return { pdh, pdl, last3Highs, last3Lows, midnightOpen };
}

function detectModel2022Signals(candles: Candle[]): Model2022Signal[] {
  if (candles.length < 10) return [];
  const frameMs = inferTimeframeMs(candles);
  if (!frameMs || frameMs > M15_MS * 1.1) return [];
  const m15 = aggregateCandles(candles, M15_MS);
  if (m15.length < 20) return [];

  const swings15 = detectSwings(m15, 2);
  const shifts15 = detectStructureShifts(m15, swings15, 0, { minBreakPct: 0.00005 });
  const gaps15 = detectFVG(m15);
  const sweeps15 = detectLiquiditySweeps(m15);
  const atr15 = computeAtr(m15, 14);
  const signals: Model2022Signal[] = [];

  gaps15.forEach((gap) => {
    const isBull = gap.type === 'bullish';
    const sweep = sweeps15.findLast(
      (s) => s.time <= gap.startTime && s.direction === (isBull ? 'down' : 'up'),
    );
    if (!sweep) return;
    const shift = shifts15.findLast((s) => s.time <= gap.endTime);
    if (!shift || shift.direction !== (isBull ? 'bullish' : 'bearish')) return;
    const idx = m15.findIndex((c) => c.t >= gap.startTime);
    if (idx < 0) return;
    const candle = m15[idx];
    const atrVal = atr15[idx] ?? 0;
    const body = Math.abs(candle.c - candle.o);
    if (atrVal > 0 && body < atrVal * 0.7) return;
    const nyHour = getHourInTz(candle.t, 'America/New_York');
    const withinKill = nyHour != null && nyHour >= 7 && nyHour < 10;
    const entry = isBull ? Math.min(gap.top, gap.bottom) : Math.max(gap.top, gap.bottom);
    const stop = isBull ? Math.max(gap.top, gap.bottom) : Math.min(gap.top, gap.bottom);
    const basis = [
      isBull ? 'Liquidity grab of lows' : 'Liquidity grab of highs',
      `${shift.label} with displacement`,
      '15m FVG formed',
    ];
    if (withinKill) {
      basis.push('NY Kill Zone 07:00-10:00');
    }
    signals.push({
      time: gap.startTime,
      direction: isBull ? 'buy' : 'sell',
      label: isBull ? 'BUY SETUP' : 'SELL SETUP',
      fvg: gap,
      entry,
      stop,
      basis,
    });
  });

  return signals.slice(-8);
}

function inferTimeframeMs(candles: Candle[]): number | null {
  if (candles.length < 2) return null;
  const diffs: number[] = [];
  for (let i = candles.length - 1; i > 0 && diffs.length < 80; i--) {
    const delta = candles[i].t - candles[i - 1].t;
    if (delta > 0) diffs.push(delta);
  }
  if (!diffs.length) return null;
  const avg = diffs.reduce((sum, d) => sum + d, 0) / diffs.length;
  return Number.isFinite(avg) ? avg : null;
}

function aggregateCandles(candles: Candle[], intervalMs: number): Candle[] {
  if (!candles.length) return [];
  const buckets = new Map<number, Candle>();
  candles.forEach((candle) => {
    const bucketKey = Math.floor(candle.t / intervalMs) * intervalMs;
    const bucket = buckets.get(bucketKey);
    if (!bucket) {
      buckets.set(bucketKey, {
        t: bucketKey,
        o: candle.o,
        h: candle.h,
        l: candle.l,
        c: candle.c,
        v: candle.v,
      });
    } else {
      bucket.h = Math.max(bucket.h, candle.h);
      bucket.l = Math.min(bucket.l, candle.l);
      bucket.c = candle.c;
      bucket.v += candle.v;
    }
  });
  return Array.from(buckets.values()).sort((a, b) => a.t - b.t);
}

function computeAtr(candles: Candle[], period = 14): number[] {
  if (candles.length === 0) return [];
  const atr: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      current.h - current.l,
      Math.abs(current.h - prev.c),
      Math.abs(current.l - prev.c),
    );
    if (i === 1) {
      atr[i] = tr;
    } else {
      atr[i] = ((atr[i - 1] * (period - 1)) + tr) / period;
    }
  }
  return atr;
}

function getHourInTz(ms: number, timeZone: string): number | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      hour: 'numeric',
    });
    const parts = formatter.formatToParts(new Date(ms));
    const hourStr = parts.find((p) => p.type === 'hour')?.value ?? null;
    const hour = hourStr ? Number(hourStr) : null;
    return Number.isFinite(hour) ? hour : null;
  } catch {
    return null;
  }
}

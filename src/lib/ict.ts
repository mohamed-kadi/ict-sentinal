import {
  Bias,
  BreakerBlock,
  Candle,
  EqualLiquidityLevel,
  Gap,
  LiquiditySweep,
  OrderBlock,
  PremiumDiscountRange,
  HtfLevels,
  SessionZone,
  Signal,
  StructureShift,
  Swing,
} from './types';
import { dayStats, groupByDay } from './utils';
import type { OptimizationWeights } from './tradeMemory';

export type SessionOpenLevels = {
  [dateKey: string]: {
    midnightOpen?: number;
    londonOpen?: number;
    nyOpen?: number;
  };
};

export type SmtSignal = {
  time: number;
  type: 'buy' | 'sell';
  reason: string;
};

type TradeMemoryAdapter = {
  getOptimizationParams(): OptimizationWeights;
};

let tradeMemoryInstance: TradeMemoryAdapter | null | undefined;

function getTradeMemoryInstance(): TradeMemoryAdapter | null {
  if (tradeMemoryInstance !== undefined) return tradeMemoryInstance;
  if (typeof window !== 'undefined') {
    tradeMemoryInstance = null;
    return tradeMemoryInstance;
  }
  try {
    // This branch only runs in Node (server); bundler will include the module.
    const mod = require('./tradeMemory') as { TradeMemory: new () => TradeMemoryAdapter };
    tradeMemoryInstance = new mod.TradeMemory();
  } catch (err) {
    console.warn('[ICT] TradeMemory unavailable', err);
    tradeMemoryInstance = null;
  }
  return tradeMemoryInstance;
}

export function computeBias(candles: Candle[]): Bias {
  if (candles.length < 5) {
    return { label: 'Neutral', reason: 'Not enough data to compute bias' };
  }

  const grouped = groupByDay(candles);
  const days = Object.keys(grouped).sort();
  const currentDayKey = days.at(-1);
  const prevDayKey = days.at(-2);

  if (!currentDayKey || !prevDayKey) {
    return { label: 'Neutral', reason: 'Waiting for at least two sessions' };
  }

  const latest = candles.at(-1)!;
  const currentDay = grouped[currentDayKey].filter((c) => c.t <= latest.t);
  const prevDay = grouped[prevDayKey];
  if (!currentDay.length || !prevDay.length) {
    return { label: 'Neutral', reason: 'Incomplete session data' };
  }
  const prev = dayStats(prevDay);
  const currentOpen = currentDay[0].o;
  const currentClose = currentDay.at(-1)!.c;
  const currentHigh = Math.max(...currentDay.map((c) => c.h));
  const currentLow = Math.min(...currentDay.map((c) => c.l));
  const tookHigh = currentHigh >= prev.high;
  const tookLow = currentLow <= prev.low;
  const aboveOpen = currentClose > currentOpen;
  const abovePrevClose = currentClose > prev.close;

  if (aboveOpen && abovePrevClose && tookHigh) {
    return { label: 'Bullish', reason: 'Above daily open/prev close and swept prior high' };
  }
  if (!aboveOpen && !abovePrevClose && tookLow) {
    return { label: 'Bearish', reason: 'Below daily open/prev close and swept prior low' };
  }
  const trendFallback = computeTrendBias(candles);
  if (trendFallback) return trendFallback;
  return { label: 'Neutral', reason: 'Inside previous range or mixed signals' };
}

function computeTrendBias(candles: Candle[]): Bias | null {
  if (candles.length < 40) return null;
  const closes = candles.map((c) => c.c);
  const short = closes.slice(-40);
  const long = closes.slice(-160);
  const shortAvg = short.reduce((sum, price) => sum + price, 0) / short.length;
  const longAvg = long.length ? long.reduce((sum, price) => sum + price, 0) / long.length : shortAvg;
  if (!Number.isFinite(shortAvg) || !Number.isFinite(longAvg)) return null;
  if (shortAvg > longAvg * 1.0005) {
    return { label: 'Bullish', reason: 'Fallback trend bias (short avg above long avg)' };
  }
  if (shortAvg < longAvg * 0.9995) {
    return { label: 'Bearish', reason: 'Fallback trend bias (short avg below long avg)' };
  }
  return null;
}

export function computeWeeklyBias(candles: Candle[]): Bias {
  if (candles.length < 10) {
    return { label: 'Neutral', reason: 'Not enough data to compute weekly bias' };
  }

  const byWeek: Record<string, Candle[]> = {};
  for (const candle of candles) {
    const d = new Date(candle.t);
    const week = `${d.getUTCFullYear()}-W${getIsoWeek(d)}`;
    byWeek[week] = byWeek[week] || [];
    byWeek[week].push(candle);
  }
  const weekKeys = Object.keys(byWeek).sort();
  const currentWeekKey = weekKeys.at(-1);
  const prevWeekKey = weekKeys.at(-2);
  if (!currentWeekKey || !prevWeekKey) {
    return { label: 'Neutral', reason: 'Waiting for at least two weeks' };
  }
  const currentWeek = byWeek[currentWeekKey];
  const prevWeek = byWeek[prevWeekKey];
  if (!currentWeek.length || !prevWeek.length) {
    return { label: 'Neutral', reason: 'Incomplete weekly data' };
  }

  const prevHigh = Math.max(...prevWeek.map((c) => c.h));
  const prevLow = Math.min(...prevWeek.map((c) => c.l));
  const currentOpen = currentWeek[0].o;
  const currentClose = currentWeek.at(-1)!.c;
  const tookHigh = Math.max(...currentWeek.map((c) => c.h)) >= prevHigh;
  const tookLow = Math.min(...currentWeek.map((c) => c.l)) <= prevLow;
  const aboveOpen = currentClose > currentOpen;

  if (aboveOpen && tookHigh) {
    return { label: 'Bullish', reason: 'Weekly close above open and swept prior weekly high' };
  }
  if (!aboveOpen && tookLow) {
    return { label: 'Bearish', reason: 'Weekly close below open and swept prior weekly low' };
  }
  return { label: 'Neutral', reason: 'Weekly range inside prior week or mixed' };
}

export function detectSwings(candles: Candle[], lookback = 2): Swing[] {
  const swings: Swing[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const window = candles.slice(i - lookback, i + lookback + 1);
    const center = candles[i];
    const highs = window.map((c) => c.h);
    const lows = window.map((c) => c.l);
    if (center.h === Math.max(...highs)) {
      swings.push({ index: i, time: center.t, price: center.h, type: 'high' });
    }
    if (center.l === Math.min(...lows)) {
      swings.push({ index: i, time: center.t, price: center.l, type: 'low' });
    }
  }
  return swings;
}

export function detectFVG(candles: Candle[]): Gap[] {
  const gaps: Gap[] = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const a = candles[i - 1];
    const b = candles[i];
    const c = candles[i + 1];
    const bullishGap = a.h < c.l && b.l > a.h && b.l > c.h;
    const bearishGap = a.l > c.h && b.h < a.l && b.h < c.l;

    if (bullishGap) {
      gaps.push({
        startTime: a.t,
        endTime: c.t,
        top: a.h,
        bottom: c.l,
        type: 'bullish',
      });
    }
    if (bearishGap) {
      gaps.push({
        startTime: a.t,
        endTime: c.t,
        top: c.h,
        bottom: a.l,
        type: 'bearish',
      });
    }
  }
  return gaps;
}

export function detectOrderBlocks(candles: Candle[], window = 5): OrderBlock[] {
  const blocks: OrderBlock[] = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const current = candles[i];
    const prevHigh = Math.max(...candles.slice(Math.max(0, i - window), i).map((c) => c.h));
    const prevLow = Math.min(...candles.slice(Math.max(0, i - window), i).map((c) => c.l));
    const next = candles[i + 1];
    const isBullishOB = current.c < current.o && next.h > prevHigh;
    const isBearishOB = current.c > current.o && next.l < prevLow;

    if (isBullishOB) {
      blocks.push({
        startTime: current.t,
        endTime: next.t,
        high: current.h,
        low: current.l,
        type: 'bullish',
      });
    }
    if (isBearishOB) {
      blocks.push({
        startTime: current.t,
        endTime: next.t,
        high: current.h,
        low: current.l,
        type: 'bearish',
      });
    }
  }
  return dedupeBlocks(blocks);
}

export function detectSignals(
  candles: Candle[],
  bias: Bias,
  gaps: Gap[],
  blocks: OrderBlock[],
  sessions: SessionZone[],
  swings?: Swing[],
  sweeps?: LiquiditySweep[],
  includeChoChFvgOte = true,
  breakerBlocks?: import('./types').BreakerBlock[],
  premiumRange?: PremiumDiscountRange | null,
  htfLevels?: HtfLevels | null,
  options?: {
    enforceSessionOpenFilter?: boolean;
    uiSignalLimit?: number | null;
    strictSessions?: boolean;
    debug?: boolean;
  },
): Signal[] {
  const signals: Signal[] = [];
  const RR_TP1 = 1.5;
  const RR_TP2 = 3;
  const RR_TP3 = 4.5;
  const RR_TP4 = 6;
  const MIN_R_MULTIPLE = 1.25;
  const SETUP_COOLDOWN = 5;
  const GLOBAL_COOLDOWN = 2;
  const MAX_SIGNALS_PER_BAR = 1;
  const MAX_TRADES_PER_DAY = 12;
  const BIAS_FLIP_COOLDOWN_MS = 3 * 60 * 60 * 1000;
  const enforceSessionOpenFilter = options?.enforceSessionOpenFilter ?? false;
  const uiSignalLimit = options?.uiSignalLimit ?? null;
  const strictSessions = options?.strictSessions ?? false;
  const debugSignals = options?.debug ?? process.env.NEXT_PUBLIC_DEBUG_SIGNALS === 'true';
  if (debugSignals) {
    console.info('[ICT] detectSignals debug ON');
  }
  const atrValues = computeAtr(candles, 14);
  const optimizationWeights: OptimizationWeights = getTradeMemoryInstance()?.getOptimizationParams() ?? {};
  const lastSignalIndex: Record<string, number> = {};
  const setupPriority = new Map<string, number>([
    ['Bias + OB/FVG + Session', 5],
    ['CHoCH + FVG + OTE', 5],
    ['Institutional Kill Zone', 4],
    ['Kill Zone Liquidity Entry', 4],
    ['Power of Three Kill Zone', 4],
    ['Asia Sweep Reversal', 4],
    ['Silver Bullet', 4],
    ['Turtle Soup', 4],
    ['Breaker + FVG', 3],
    ['PD Array (Discount)', 3],
    ['PD Array (Premium)', 3],
    ['Trend Pullback', 2],
    ['Momentum Continuation', 2],
    ['Mean Reversion Fade', 2],
  ]);
  const tierOneSetups = new Set([
    'Bias + OB/FVG + Session',
    'CHoCH + FVG + OTE',
    'Silver Bullet',
    'Turtle Soup',
  ]);
  const setupRiskCaps = new Map<string, number>([
    ['Mean Reversion Fade', 1.5],
    ['Momentum Continuation', 2],
    ['Range Breakout', 2],
    ['Pullback Reentry', 1.8],
  ]);
  const sessionOpenLevels = computeSessionOpenLevels(candles, sessions);
  const signalsPerBar: Record<number, number> = {};
  const signalsPerDay: Record<string, number> = {};
  const tierTwoSessions: Record<string, number> = {};
  const weeklyPdRange = getWeeklyPdRange(htfLevels);
  const byDay = groupByDay(candles);
  const dayKeys = Object.keys(byDay).sort();
  const dayIndexMap = new Map(dayKeys.map((key, idx) => [key, idx]));
  const getPdRange = (barIndex: number) =>
    computeAnchoredPdRange(candles, swings, barIndex) ??
    premiumRange ??
    computePremiumDiscountRange(candles.slice(Math.max(0, barIndex - 80), barIndex + 1)) ??
    null;
  const closes = candles.map((c) => c.c);
  const emaFastSeries = computeEma(closes, 34);
  const emaSlowSeries = computeEma(closes, 89);
  const liquidityVoids: {
    direction: 'up' | 'down';
    midpoint: number;
    top: number;
    bottom: number;
    time: number;
  }[] = [];
  const inversionGaps: {
    type: 'bullish' | 'bearish';
    level: number;
    expiry: number;
  }[] = [];
  type AsiaRange = {
    day: string;
    high: number;
    low: number;
    active: boolean;
    lastTrigger?: number;
  };
  let asiaRange: AsiaRange | null = null;
  let currentDayLevels: SessionOpenLevels[string] | undefined;
  let currentPrice: number | undefined;
  let lastSignalBar = -Infinity;
  let lastSignalMeta: {
    direction: 'buy' | 'sell' | null;
    priority: number;
    barIndex: number;
  } = { direction: null, priority: 0, barIndex: -Infinity };
  let currentSignalContext = {
    biasLabel: bias.label as Bias['label'],
    htfBuyZone: false,
    htfSellZone: false,
    isKillZone: false,
    isLondonOrNy: false,
    sessionLabel: '' as string,
  };
  const debugCounters = debugSignals
    ? {
        killZoneBuys: 0,
        killZoneSells: 0,
        asiaSweepBuys: 0,
        asiaSweepSells: 0,
        trendPullbackBuys: 0,
        trendPullbackSells: 0,
      }
    : null;
  const lowConfluenceSetups = new Set([
    'Mean Reversion Fade',
    'Momentum Continuation',
    'Range Breakout',
    'Pullback Reentry',
  ]);
  const disabledSetups = new Set([
    'Mean Reversion Fade',
    'Momentum Continuation',
    'Range Breakout',
    'Pullback Reentry',
  ]);
  let activeDayKey: string | null = null;
  let activeDayBias: Bias['label'] | null = null;
  let biasFreeze = false;
  let biasFreezeUntil: number | null = null;
  let sweepContext: LiquiditySweep | null = null;
  let atrForFilter = 0;
  const pushSignal = (s: Signal, barIndex: number) => {
    if (!s.session) {
      s.session = currentSignalContext.sessionLabel;
    }
    if (!s.bias) {
      s.bias = currentSignalContext.biasLabel;
    }
    if (s.setup) {
      const stats = optimizationWeights[s.setup];
      const stop = s.stop ?? null;
      const risk = stop != null ? (s.direction === 'buy' ? s.price - stop : stop - s.price) : null;
      const approxTarget =
        s.tp1 ??
        (risk && risk > 0 ? (s.direction === 'buy' ? s.price + risk * 2 : s.price - risk * 2) : undefined);
      const filterOutcome = evaluateSetupFilters(
        s.setup,
        s.direction,
        s.price,
        approxTarget,
        stats,
        gaps,
        atrForFilter,
      );
      if (!filterOutcome) {
        return;
      }
      s.sizeMultiplier = (s.sizeMultiplier ?? 1) * filterOutcome.sizeMultiplier;
    }
    if (enforceSessionOpenFilter) {
      const priceContext = currentPrice ?? s.price;
      if (currentDayLevels && !respectsSessionOpen(s.direction, currentDayLevels, priceContext)) {
        return;
      }
    }
    if (biasFreeze) {
      return;
    }
    if (barIndex - lastSignalBar < GLOBAL_COOLDOWN) {
      return;
    }
    const perBarCount = signalsPerBar[barIndex] ?? 0;
    if (perBarCount >= MAX_SIGNALS_PER_BAR) {
      return;
    }
    if (disabledSetups.has(s.setup ?? '')) {
      return;
    }
    const tierOne = tierOneSetups.has(s.setup ?? '');
    const setupKey = s.setup ?? 'default';
    if (lastSignalIndex[setupKey] != null && barIndex - lastSignalIndex[setupKey]! < SETUP_COOLDOWN) {
      return;
    }
    const priority = getSetupPriority(setupPriority, s.setup);
    const stop = s.stop ?? null;
    if (stop !== null) {
      const risk = s.direction === 'buy' ? s.price - stop : stop - s.price;
      if (risk <= 0) return;
      const atr = atrValues[barIndex] ?? 0;
      if (!tierOne && atr < Math.abs(s.price) * 0.0003) {
        return;
      }
      const pipFloor = Math.max(Math.abs(s.price) * 0.000004, 1e-5);
      const atrFloor = atr > 0 ? Math.min(atr * 0.02, Math.abs(s.price) * 0.0006) : 0;
      const minRisk = Math.max(pipFloor, atrFloor);
      if (risk < minRisk) {
        return;
      }
      if (atr > 0 && risk > atr * 4) {
        return;
      }
      const customCap = setupRiskCaps.get(s.setup ?? '');
      if (customCap && atr > 0 && risk > atr * customCap) {
        return;
      }
      const tp1Mult = tierOne ? RR_TP1 : Math.max(2, RR_TP1);
      const tp2Mult = tierOne ? RR_TP2 : Math.max(RR_TP2, tp1Mult + 1);
      const tp3Mult = tierOne ? RR_TP3 : Math.max(RR_TP3, tp2Mult + 1.5);
      const tp4Mult = tierOne ? RR_TP4 : Math.max(RR_TP4, tp3Mult + 1.5);
      if (!s.tp1) {
        const offset = Math.max(risk * tp1Mult, atr * 1.5);
        s.tp1 = s.direction === 'buy' ? s.price + offset : s.price - offset;
      }
      if (!s.tp2) {
        const offset = Math.max(risk * tp2Mult, atr * 2);
        s.tp2 = s.direction === 'buy' ? s.price + offset : s.price - offset;
      }
      if (!s.tp3) {
        const offset = Math.max(risk * tp3Mult, atr * 3);
        s.tp3 = s.direction === 'buy' ? s.price + offset : s.price - offset;
      }
      if (!s.tp4) {
        const offset = Math.max(risk * tp4Mult, atr * 4);
        s.tp4 = s.direction === 'buy' ? s.price + offset : s.price - offset;
      }
      const rr =
        s.tp1 != null && risk > 0 ? Math.abs(s.tp1 - s.price) / risk : MIN_R_MULTIPLE;
      if (rr < MIN_R_MULTIPLE) {
        const adj = risk * MIN_R_MULTIPLE;
        s.tp1 = s.direction === 'buy' ? s.price + adj : s.price - adj;
        if (!s.tp2) {
          s.tp2 = s.direction === 'buy' ? s.price + adj * 2 : s.price - adj * 2;
        }
        if (!s.tp3) {
          s.tp3 = s.direction === 'buy' ? s.price + adj * 3 : s.price - adj * 3;
        }
        if (!s.tp4) {
          s.tp4 = s.direction === 'buy' ? s.price + adj * 4 : s.price - adj * 4;
        }
      }
    }
    const biasDirectionalSupport =
      (s.direction === 'buy' && (currentSignalContext.htfBuyZone || currentSignalContext.biasLabel === 'Bullish')) ||
      (s.direction === 'sell' && (currentSignalContext.htfSellZone || currentSignalContext.biasLabel === 'Bearish'));
    const sweepConfluence =
      sweepContext &&
      ((s.direction === 'buy' && sweepContext.direction === 'down') ||
        (s.direction === 'sell' && sweepContext.direction === 'up'));
    const asiaSupport = (asiaRange?.active ?? false) && biasDirectionalSupport;
    if (!tierOne) {
      const tierTwoAllowed = currentSignalContext.isLondonOrNy && (currentSignalContext.isKillZone || biasDirectionalSupport);
      if (!(tierTwoAllowed && (sweepConfluence || asiaSupport))) {
        return;
      }
    } else if (currentSignalContext.isLondonOrNy && !sweepConfluence) {
      return;
    }
    if (lowConfluenceSetups.has(s.setup ?? '') && !biasDirectionalSupport) {
      return;
    }
    const oppositeFlip =
      lastSignalMeta.direction &&
      s.direction !== lastSignalMeta.direction &&
      barIndex - lastSignalMeta.barIndex <= 1;
    const biasSupportsNewDirection =
      (s.direction === 'buy' && currentSignalContext.biasLabel === 'Bullish' && currentSignalContext.htfBuyZone) ||
      (s.direction === 'sell' && currentSignalContext.biasLabel === 'Bearish' && currentSignalContext.htfSellZone);
    if (oppositeFlip && !(priority > lastSignalMeta.priority || biasSupportsNewDirection)) {
      return;
    }
    const dayKey = candles[barIndex] ? new Date(candles[barIndex].t).toISOString().slice(0, 10) : 'unknown';
    const dailyCount = signalsPerDay[dayKey] ?? 0;
    if (dailyCount >= MAX_TRADES_PER_DAY) {
      return;
    }
    if (!tierOne) {
      const sessionKey = `${dayKey}-${currentSignalContext.sessionLabel ?? 'session'}`;
      const sessionCount = tierTwoSessions[sessionKey] ?? 0;
      if (sessionCount >= 1) {
        return;
      }
      tierTwoSessions[sessionKey] = sessionCount + 1;
    }
    const atrLocal = atrValues[barIndex] ?? 0;
    const sizeBaseline = Math.max(Math.abs(s.price) * 0.0008, 1e-6);
    const rawSize = atrLocal > 0 ? Math.min(2.5, Math.max(0.5, atrLocal / sizeBaseline)) : 1;
    const baseSize = tierOne ? Math.max(0.75, Math.min(1.5, rawSize)) : rawSize;
    const userMultiplier = s.sizeMultiplier ?? 1;
    s.sizeMultiplier = baseSize * userMultiplier;
    signals.push(s);
    lastSignalIndex[setupKey] = barIndex;
    lastSignalBar = barIndex;
    lastSignalMeta = { direction: s.direction, priority, barIndex };
    signalsPerBar[barIndex] = perBarCount + 1;
    signalsPerDay[dayKey] = dailyCount + 1;
  };
  for (let i = 1; i < candles.length; i++) {
    const candle = candles[i];
    const prev = candles[i - 1];
    const direction = candle.c >= candle.o ? 'bullish' : 'bearish';
    const candleDate = new Date(candle.t);
    let session = classifySession(candleDate, sessions);
    if (!session) {
      session = fallbackSession(candleDate, sessions);
    }
    if (!session) continue;
    const lastSweepGlobal = sweeps?.findLast((s) => s.time <= candle.t) ?? null;
    sweepContext = lastSweepGlobal;
    const hour = candleDate.getUTCHours();
    const silverBulletWindow = (() => {
      if (!/new york/i.test(session.label)) return false;
      return hour >= 17 && hour <= 20;
    })();
    const sessionLabel = session.label;
    const isLondonOrNy = /london|new york/i.test(sessionLabel);
    const killZone =
      session.killStartHour != null && session.killEndHour != null
        ? isWithinKillZone(candleDate, session)
        : true;
    const bodyMid = (candle.h + candle.l) / 2;
    const bullishConfirm = direction === 'bullish' && candle.c > candle.o && candle.c >= bodyMid;
    const bearishConfirm = direction === 'bearish' && candle.c < candle.o && candle.c <= bodyMid;
    const currentAtr = atrValues[i] ?? 0;
    atrForFilter = currentAtr;
    const proximity = Math.max(currentAtr, Math.abs(candle.c) * 0.0005);
    const nearLevel = (level?: number | null) =>
      level != null && Math.abs(candle.c - level) <= proximity;
    const pdRange = getPdRange(i);
    const dateKey = candleDate.toISOString().slice(0, 10);
    const dayLevels = sessionOpenLevels[dateKey];
    currentDayLevels = dayLevels;
    currentPrice = candle.c;
    const emaFast = emaFastSeries[i];
    const emaSlow = emaSlowSeries[i];
    const momentumBias: Bias['label'] =
      emaFast != null && emaSlow != null
        ? emaFast > emaSlow * 1.0005
          ? 'Bullish'
          : emaFast < emaSlow * 0.9995
            ? 'Bearish'
            : 'Neutral'
        : 'Neutral';
    let biasLabel: Bias['label'] = bias.label !== 'Neutral' ? bias.label : momentumBias;
    const hasPrevDayLow = htfLevels?.prevDayLow != null;
    const hasPrevDayHigh = htfLevels?.prevDayHigh != null;
    const hasPrevWeekLow = htfLevels?.prevWeekLow != null;
    const hasPrevWeekHigh = htfLevels?.prevWeekHigh != null;
    const nearPrevDayLow = nearLevel(htfLevels?.prevDayLow);
    const nearPrevDayHigh = nearLevel(htfLevels?.prevDayHigh);
    const nearPrevWeekLow = nearLevel(htfLevels?.prevWeekLow);
    const nearPrevWeekHigh = nearLevel(htfLevels?.prevWeekHigh);
    const nearPdLow = pdRange ? Math.abs(candle.c - pdRange.low) <= proximity : false;
    const nearPdHigh = pdRange ? Math.abs(candle.c - pdRange.high) <= proximity : false;
    const nearWeeklyLow = weeklyPdRange ? Math.abs(candle.c - weeklyPdRange.low) <= proximity * 1.5 : false;
    const nearWeeklyHigh = weeklyPdRange ? Math.abs(candle.c - weeklyPdRange.high) <= proximity * 1.5 : false;
    const discount = pdRange ? candle.c <= pdRange.equilibrium && candle.c >= pdRange.low : false;
    const premium = pdRange ? candle.c >= pdRange.equilibrium && candle.c <= pdRange.high : false;
    const weeklyDiscountZone =
      weeklyPdRange ? candle.c >= weeklyPdRange.low && candle.c <= weeklyPdRange.equilibrium : false;
    const weeklyPremiumZone =
      weeklyPdRange ? candle.c <= weeklyPdRange.high && candle.c >= weeklyPdRange.equilibrium : false;
    const discountContext = discount || weeklyDiscountZone;
    const premiumContext = premium || weeklyPremiumZone;
    const institutionalBuyZone =
      discountContext ||
      (htfLevels?.prevDayLow != null && candle.l <= htfLevels.prevDayLow * 1.0005) ||
      (htfLevels?.prevWeekLow != null && candle.l <= htfLevels.prevWeekLow * 1.0005);
    const institutionalSellZone =
      premiumContext ||
      (htfLevels?.prevDayHigh != null && candle.h >= htfLevels.prevDayHigh * 0.9995) ||
      (htfLevels?.prevWeekHigh != null && candle.h >= htfLevels.prevWeekHigh * 0.9995);
    const htfBuyZone =
      discountContext ||
      nearPrevDayLow ||
      nearPrevWeekLow ||
      nearPdLow ||
      nearWeeklyLow ||
      (!hasPrevDayLow && !hasPrevWeekLow && !pdRange && !weeklyPdRange);
    const htfSellZone =
      premiumContext ||
      nearPrevDayHigh ||
      nearPrevWeekHigh ||
      nearPdHigh ||
      nearWeeklyHigh ||
      (!hasPrevDayHigh && !hasPrevWeekHigh && !pdRange && !weeklyPdRange);
    const sessionWindowAllowed =
      hour >= Math.max(0, session.startHour - 1) && hour < Math.min(24, session.endHour + 1);
    const sessionAllowed = strictSessions
      ? isLondonOrNy
        ? killZone || sessionWindowAllowed
        : true
      : sessionWindowAllowed || killZone || !isLondonOrNy;
    if (biasLabel === 'Neutral') {
      if (institutionalBuyZone && !institutionalSellZone) biasLabel = 'Bullish';
      else if (institutionalSellZone && !institutionalBuyZone) biasLabel = 'Bearish';
    }
    const powerOfThree = detectPowerOfThreePattern(candles, i, session, asiaRange);
    if (activeDayKey !== dateKey) {
      activeDayKey = dateKey;
      activeDayBias = biasLabel !== 'Neutral' ? biasLabel : null;
      biasFreezeUntil = null;
      biasFreeze = false;
    } else if (activeDayBias == null && biasLabel !== 'Neutral') {
      activeDayBias = biasLabel;
      biasFreezeUntil = null;
      biasFreeze = false;
    } else if (
      activeDayBias &&
      biasLabel !== 'Neutral' &&
      biasLabel !== activeDayBias &&
      (!biasFreezeUntil || candle.t >= biasFreezeUntil)
    ) {
      biasFreezeUntil = candle.t + BIAS_FLIP_COOLDOWN_MS;
      biasFreeze = true;
    } else if (biasFreezeUntil && candle.t >= biasFreezeUntil && biasLabel !== 'Neutral') {
      activeDayBias = biasLabel;
      biasFreezeUntil = null;
      biasFreeze = false;
    } else {
      biasFreeze = biasFreezeUntil != null && candle.t < biasFreezeUntil;
    }
    currentSignalContext = {
      biasLabel,
      htfBuyZone,
      htfSellZone,
      isKillZone: killZone && isLondonOrNy,
      isLondonOrNy,
      sessionLabel,
    };
    if (debugSignals && i % 50 === 0) {
      console.log('[ICT] detectSignals snapshot', {
        bar: i,
        total: candles.length,
        time: new Date(candle.t).toISOString(),
        bias: biasLabel,
        session: session.label,
        sessionAllowed,
        killZone,
        sessionWindowAllowed,
        htfBuyZone,
        htfSellZone,
        discountContext,
        premiumContext,
        signalsSoFar: signals.length,
        lastSignalBar,
      });
    }
    if (session.label === 'Asia') {
      if (!asiaRange || asiaRange.day !== dateKey) {
        asiaRange = { day: dateKey, high: candle.h, low: candle.l, active: false };
      } else {
        asiaRange.high = Math.max(asiaRange.high, candle.h);
        asiaRange.low = Math.min(asiaRange.low, candle.l);
      }
    } else if (asiaRange && asiaRange.day === dateKey) {
      asiaRange.active = true;
    }
    let cachedShift: StructureShift | null | undefined;
    const getLastShift = () => {
      if (cachedShift === undefined) {
        const sliceStart = Math.max(0, i - 300);
        cachedShift = swings?.length
          ? detectStructureShifts(candles.slice(sliceStart, i + 1), swings, currentAtr).at(-1) ?? null
          : null;
      }
      return cachedShift;
    };

    const shiftNow = getLastShift();
    if (
      biasLabel === 'Bullish' &&
      sessionAllowed &&
      bullishConfirm &&
      htfBuyZone &&
      shiftNow?.direction === 'bullish' &&
      hasClearPath(candle.c, candle.c + proximity * 3, 'buy', gaps)
    ) {
      const tappedOB = blocks.find(
        (b) => b.type === 'bullish' && b.endTime <= candle.t && candle.l <= b.high && candle.h >= b.low,
      );
      const tappedGap = gaps.find(
        (g) => g.type === 'bullish' && g.endTime <= candle.t && candle.l <= g.top && candle.h >= g.bottom,
      );
      if ((tappedOB || tappedGap) && prev.c >= prev.o) {
        const stop = findRecentSwing(swings, 'low', candle.t) ?? prev.l;
        const entry = candle.c;
        const risk = entry - stop;
        if (risk <= 0) continue;
        pushSignal({
          time: candle.t,
          price: candle.c,
          direction: 'buy',
          setup: 'Bias + OB/FVG + Session',
          stop,
          tp1: entry + risk,
          tp2: entry + risk * 2,
          basis: [
            'Bias bullish',
            tappedOB ? 'Tapped Bullish OB' : 'Tapped Bullish FVG',
            `Session ${session.label}`,
          ].join(' • '),
        }, i);
      }
    }

    const shiftNowSell = shiftNow;
    if (
      biasLabel === 'Bearish' &&
      sessionAllowed &&
      bearishConfirm &&
      htfSellZone &&
      shiftNowSell?.direction === 'bearish' &&
      hasClearPath(candle.c, candle.c - proximity * 3, 'sell', gaps)
    ) {
      const tappedOB = blocks.find(
        (b) => b.type === 'bearish' && b.endTime <= candle.t && candle.h >= b.low && candle.l <= b.high,
      );
      const tappedGap = gaps.find(
        (g) => g.type === 'bearish' && g.endTime <= candle.t && candle.h >= g.bottom && candle.l <= g.top,
      );
      if ((tappedOB || tappedGap) && prev.c <= prev.o) {
        const stop = findRecentSwing(swings, 'high', candle.t) ?? prev.h;
        const entry = candle.c;
        const risk = stop - entry;
        if (risk <= 0) continue;
        pushSignal({
          time: candle.t,
          price: candle.c,
          direction: 'sell',
          setup: 'Bias + OB/FVG + Session',
          stop,
          tp1: entry - risk,
          tp2: entry - risk * 2,
          basis: [
            'Bias bearish',
            tappedOB ? 'Tapped Bearish OB' : 'Tapped Bearish FVG',
            `Session ${session.label}`,
          ].join(' • '),
        }, i);
      }
    }

    // CHoCH + FVG return + OTE confluence
    if (includeChoChFvgOte && swings?.length && gaps.length && sessionAllowed) {
      const lastShiftVal = shiftNow;
      const recentGap = gaps.findLast((g) => g.endTime <= candle.t);
      if (lastShiftVal && recentGap) {
        const range = computePremiumDiscountRange(candles.slice(Math.max(0, i - 50), i + 1));
        if (range) {
          const oteHigh = range.high - (range.high - range.low) * 0.62;
          const oteLow = range.high - (range.high - range.low) * 0.705;
          const inOte = candle.c >= Math.min(oteHigh, oteLow) && candle.c <= Math.max(oteHigh, oteLow);
          const inFvg =
            candle.l <= Math.max(recentGap.top, recentGap.bottom) &&
            candle.h >= Math.min(recentGap.top, recentGap.bottom);

          if (lastShiftVal.direction === 'bullish' && inFvg && inOte && bullishConfirm && htfBuyZone) {
            const stop = findRecentSwing(swings, 'low', candle.t) ?? prev.l;
            const entry = candle.c;
            const risk = entry - stop;
            pushSignal({
              time: candle.t,
              price: candle.c,
              direction: 'buy',
              setup: 'CHoCH + FVG + OTE',
              stop,
              tp1: risk > 0 ? entry + risk : undefined,
              tp2: risk > 0 ? entry + risk * 2 : undefined,
              basis: ['CHoCH up', 'FVG tap', 'Within OTE zone'].join(' • '),
            }, i);
          }

          if (lastShiftVal.direction === 'bearish' && inFvg && inOte && bearishConfirm && htfSellZone) {
            const stop = findRecentSwing(swings, 'high', candle.t) ?? prev.h;
            const entry = candle.c;
            const risk = stop - entry;
            pushSignal({
              time: candle.t,
              price: candle.c,
              direction: 'sell',
              setup: 'CHoCH + FVG + OTE',
              stop,
              tp1: risk > 0 ? entry - risk : undefined,
              tp2: risk > 0 ? entry - risk * 2 : undefined,
              basis: ['CHoCH down', 'FVG tap', 'Within OTE zone'].join(' • '),
            }, i);
          }
        }
      }
    }

    if ((pdRange || weeklyPdRange) && swings?.length && sessionAllowed) {
      const swingLow = findRecentSwing(swings, 'low', candle.t);
      const swingHigh = findRecentSwing(swings, 'high', candle.t);
      const shift = getLastShift();
      const sweepDown = sweeps?.findLast((s) => s.direction === 'down' && s.time <= candle.t);
      const sweepUp = sweeps?.findLast((s) => s.direction === 'up' && s.time <= candle.t);
      const discountLabel = discount ? 'Discount array' : weeklyDiscountZone ? 'Weekly discount array' : null;
      const premiumLabel = premium ? 'Premium array' : weeklyPremiumZone ? 'Weekly premium array' : null;

      if (
        discountContext &&
        biasLabel === 'Bullish' &&
        shift?.direction === 'bullish' &&
        sweepDown &&
        bullishConfirm &&
        htfBuyZone &&
        currentSignalContext.isKillZone &&
        hasClearPath(candle.c, candle.c + proximity * 2.5, 'buy', gaps)
      ) {
        const stop = Math.min(swingLow ?? candle.l, candle.l);
        const entry = candle.c;
        const risk = entry - stop;
        pushSignal({
          time: candle.t,
          price: entry,
          direction: 'buy',
          setup: 'PD Array (Discount)',
          stop,
          tp1: risk > 0 ? entry + risk : undefined,
          tp2: risk > 0 ? entry + risk * 2 : undefined,
          basis: [discountLabel ?? 'Discount context', shift?.direction === 'bullish' ? 'BOS/CHoCH up' : 'Sweep of lows', `Session ${session.label}`].join(' • '),
        }, i);
      }

      if (
        premiumContext &&
        biasLabel === 'Bearish' &&
        shift?.direction === 'bearish' &&
        sweepUp &&
        bearishConfirm &&
        htfSellZone &&
        currentSignalContext.isKillZone &&
        hasClearPath(candle.c, candle.c - proximity * 2.5, 'sell', gaps)
      ) {
        const stop = Math.max(swingHigh ?? candle.h, candle.h);
        const entry = candle.c;
        const risk = stop - entry;
        pushSignal({
          time: candle.t,
          price: entry,
          direction: 'sell',
          setup: 'PD Array (Premium)',
          stop,
          tp1: risk > 0 ? entry - risk : undefined,
          tp2: risk > 0 ? entry - risk * 2 : undefined,
          basis: [premiumLabel ?? 'Premium context', shift?.direction === 'bearish' ? 'BOS/CHoCH down' : 'Sweep of highs', `Session ${session.label}`].join(' • '),
        }, i);
      }
    }

    if (sweeps?.length && sessionAllowed) {
      const lastSweep = lastSweepGlobal;
      if (lastSweep) {
        if (
          lastSweep.direction === 'up' &&
          bearishConfirm &&
          biasLabel === 'Bearish' &&
          htfSellZone &&
          currentSignalContext.isKillZone
        ) {
          const stop = lastSweep.price * 1.0002;
          const entry = candle.c;
          const risk = stop - entry;
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'sell',
            setup: 'Sweep + Shift',
            stop,
            tp1: risk > 0 ? entry - risk : undefined,
            tp2: risk > 0 ? entry - risk * 2 : undefined,
            basis: ['EQH sweep', 'Looking for shift lower'].join(' • '),
          }, i);
        } else if (
          lastSweep.direction === 'down' &&
          bullishConfirm &&
          biasLabel === 'Bullish' &&
          htfBuyZone &&
          currentSignalContext.isKillZone
        ) {
          const stop = lastSweep.price * 0.9998;
          const entry = candle.c;
          const risk = entry - stop;
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'buy',
            setup: 'Sweep + Shift',
            stop,
            tp1: risk > 0 ? entry + risk : undefined,
            tp2: risk > 0 ? entry + risk * 2 : undefined,
            basis: ['EQL sweep', 'Looking for shift higher'].join(' • '),
          }, i);
        }
      }
    }

    if (breakerBlocks?.length && sessionAllowed) {
      const breaker = breakerBlocks.findLast((b) => b.endTime <= candle.t);
      if (breaker && candle.l <= breaker.high && candle.h >= breaker.low) {
        if (breaker.type === 'bullish' && bullishConfirm && htfBuyZone) {
          const stop = breaker.low;
          const entry = candle.c;
          const risk = entry - stop;
          const grade = breaker.grade ?? 'weak';
          if (risk > 0) {
            pushSignal({
              time: candle.t,
              price: entry,
              direction: 'buy',
              setup: 'Breaker Retest',
              stop,
              tp1: entry + risk,
              tp2: entry + risk * 2,
              basis: [`Bull breaker (${grade})`, 'Retest within block'].join(' • '),
            }, i);
          }
        } else if (breaker.type === 'bearish' && bearishConfirm && htfSellZone) {
          const stop = breaker.high;
          const entry = candle.c;
          const risk = stop - entry;
          const grade = breaker.grade ?? 'weak';
          if (risk > 0) {
            pushSignal({
              time: candle.t,
              price: entry,
              direction: 'sell',
              setup: 'Breaker Retest',
              stop,
              tp1: entry - risk,
              tp2: entry - risk * 2,
              basis: [`Bear breaker (${grade})`, 'Retest within block'].join(' • '),
            }, i);
          }
        }
      }
    }

    if (sweeps?.length && swings?.length && sessionAllowed) {
      const lastSweep = lastSweepGlobal;
      const lastShift = shiftNow;
      if (lastSweep && lastShift && lastShift.time >= lastSweep.time) {
        if (
          lastSweep.direction === 'up' &&
          lastShift.direction === 'bearish' &&
          bearishConfirm &&
          htfSellZone &&
          currentSignalContext.isKillZone &&
          hasClearPath(candle.c, candle.c - proximity * 3, 'sell', gaps)
        ) {
          const stop = lastSweep.price * 1.0002;
          const entry = candle.c;
          const risk = stop - entry;
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'sell',
            setup: 'Sweep + CHoCH',
            stop,
            tp1: risk > 0 ? entry - risk : undefined,
            tp2: risk > 0 ? entry - risk * 2 : undefined,
            basis: ['EQH sweep', 'CHoCH down'].join(' • '),
          }, i);
        }
        if (
          lastSweep.direction === 'down' &&
          lastShift.direction === 'bullish' &&
          bullishConfirm &&
          htfBuyZone &&
          currentSignalContext.isKillZone &&
          hasClearPath(candle.c, candle.c + proximity * 3, 'buy', gaps)
        ) {
          const stop = lastSweep.price * 0.9998;
          const entry = candle.c;
          const risk = entry - stop;
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'buy',
            setup: 'Sweep + CHoCH',
            stop,
            tp1: risk > 0 ? entry + risk : undefined,
            tp2: risk > 0 ? entry + risk * 2 : undefined,
            basis: ['EQL sweep', 'CHoCH up'].join(' • '),
          }, i);
        }
      }
    }

    const trendSeparation =
      emaFast != null && emaSlow != null && Math.abs(emaSlow ?? candle.c) > 0
        ? Math.abs(emaFast - emaSlow) / Math.max(Math.abs(emaSlow ?? candle.c), 1e-6)
        : 0;
    const hasTrendStrength = trendSeparation >= 0.001;
    const lastShiftTrend = shiftNow;
    if (sessionAllowed && emaFast != null && emaSlow != null) {
      if (
        emaFast > emaSlow &&
        biasLabel === 'Bullish' &&
        hasTrendStrength &&
        candle.c >= emaFast &&
        candle.l <= emaFast * 1.0005 &&
        bullishConfirm &&
        currentSignalContext.isKillZone &&
        lastShiftTrend?.direction === 'bullish'
      ) {
        const stop = Math.min(emaFast, candle.l, prev.l);
        const entry = candle.c;
        const risk = entry - stop;
        if (risk > 0) {
          if (debugCounters) debugCounters.trendPullbackBuys++;
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'buy',
            setup: 'Trend Pullback',
            stop,
            tp1: entry + risk,
            tp2: entry + risk * 2,
            basis: ['EMA stack up', 'Pullback to EMA'].join(' • '),
          }, i);
        }
      }
      if (
        emaFast < emaSlow &&
        biasLabel === 'Bearish' &&
        hasTrendStrength &&
        candle.c <= emaFast &&
        candle.h >= emaFast * 0.9995 &&
        bearishConfirm &&
        currentSignalContext.isKillZone &&
        lastShiftTrend?.direction === 'bearish'
      ) {
        const stop = Math.max(emaFast, candle.h, prev.h);
        const entry = candle.c;
        const risk = stop - entry;
        if (risk > 0) {
          if (debugCounters) debugCounters.trendPullbackSells++;
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'sell',
            setup: 'Trend Pullback',
            stop,
            tp1: entry - risk,
            tp2: entry - risk * 2,
            basis: ['EMA stack down', 'Pullback to EMA'].join(' • '),
          }, i);
        }
      }
    }

    if (sessionAllowed && isLondonOrNy && i - lastSignalBar > 6) {
      const lastShift = shiftNow;
      if (
        institutionalBuyZone &&
        bullishConfirm &&
        biasLabel === 'Bullish' &&
        htfBuyZone &&
        lastShift?.direction === 'bullish' &&
        currentSignalContext.isKillZone &&
        hasClearPath(candle.c, candle.c + proximity * 3, 'buy', gaps)
      ) {
        const stop = Math.min(asiaRange?.low ?? candle.l, findRecentSwing(swings, 'low', candle.t) ?? candle.l, candle.l);
        const entry = candle.c;
        const risk = entry - stop;
        if (risk > 0) {
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'buy',
            setup: 'Kill Zone Liquidity Entry',
            stop,
            tp1: entry + risk,
            tp2: entry + risk * 2,
            basis: ['Institutional discount', `Session ${session.label}`].join(' • '),
          }, i);
        }
      }
      if (
        institutionalSellZone &&
        bearishConfirm &&
        biasLabel === 'Bearish' &&
        htfSellZone &&
        lastShift?.direction === 'bearish' &&
        currentSignalContext.isKillZone &&
        hasClearPath(candle.c, candle.c - proximity * 3, 'sell', gaps)
      ) {
        const stop = Math.max(asiaRange?.high ?? candle.h, findRecentSwing(swings, 'high', candle.t) ?? candle.h, candle.h);
        const entry = candle.c;
        const risk = stop - entry;
        if (risk > 0) {
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'sell',
            setup: 'Kill Zone Liquidity Entry',
            stop,
            tp1: entry - risk,
            tp2: entry - risk * 2,
            basis: ['Institutional premium', `Session ${session.label}`].join(' • '),
          }, i);
        }
      }
    }

    const buyPowerContext = powerOfThree && powerOfThree.direction === 'buy' && (institutionalBuyZone || htfBuyZone);
    const sellPowerContext = powerOfThree && powerOfThree.direction === 'sell' && (institutionalSellZone || htfSellZone);
    if (
      sessionAllowed &&
      powerOfThree &&
      (buyPowerContext || sellPowerContext) &&
      currentSignalContext.isKillZone &&
      shiftNow?.direction === (powerOfThree.direction === 'buy' ? 'bullish' : 'bearish') &&
      hasClearPath(
        powerOfThree.entry ?? candle.c,
        powerOfThree.direction === 'buy'
          ? (powerOfThree.entry ?? candle.c) + proximity * 3
          : (powerOfThree.entry ?? candle.c) - proximity * 3,
        powerOfThree.direction,
        gaps,
      )
    ) {
      const stop = powerOfThree.direction === 'buy'
        ? Math.min(powerOfThree.anchorLow ?? candle.l, candle.l)
        : Math.max(powerOfThree.anchorHigh ?? candle.h, candle.h);
      const entryPrice = powerOfThree.entry ?? candle.c;
      const risk = powerOfThree.direction === 'buy' ? entryPrice - stop : stop - entryPrice;
      if (risk > 0) {
        pushSignal({
          time: candle.t,
          price: entryPrice,
          direction: powerOfThree.direction,
          setup: 'Power of Three Kill Zone',
          stop,
          tp1: powerOfThree.direction === 'buy' ? entryPrice + risk : entryPrice - risk,
          tp2: powerOfThree.direction === 'buy' ? entryPrice + risk * 2 : entryPrice - risk * 2,
          basis: [powerOfThree.reason, `Session ${session.label}`].join(' • '),
        }, i);
      }
    }

    if (sessionAllowed && isLondonOrNy && killZone) {
      if (
        institutionalSellZone &&
        bearishConfirm &&
        biasLabel === 'Bearish' &&
        discountContext &&
        shiftNow?.direction === 'bearish' &&
        hasClearPath(candle.c, candle.c - proximity * 3, 'sell', gaps)
      ) {
        const recentHigh = Math.max(...candles.slice(Math.max(0, i - 6), i + 1).map((c) => c.h));
        const stop = Math.max(candle.h, recentHigh, prev.h);
        const entry = candle.c;
        const risk = stop - entry;
        if (risk > 0) {
          if (debugCounters) debugCounters.killZoneSells++;
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'sell',
            setup: 'Institutional Kill Zone',
            stop,
            tp1: entry - risk,
            tp2: entry - risk * 2,
            basis: ['Premium kill-zone tap', `Session ${session.label}`].join(' • '),
          }, i);
        }
      }
      if (
        institutionalBuyZone &&
        bullishConfirm &&
        biasLabel === 'Bullish' &&
        premiumContext &&
        shiftNow?.direction === 'bullish' &&
        hasClearPath(candle.c, candle.c + proximity * 3, 'buy', gaps)
      ) {
        const recentLow = Math.min(...candles.slice(Math.max(0, i - 6), i + 1).map((c) => c.l));
        const stop = Math.min(candle.l, recentLow, prev.l);
        const entry = candle.c;
        const risk = entry - stop;
        if (risk > 0) {
          if (debugCounters) debugCounters.killZoneBuys++;
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'buy',
            setup: 'Institutional Kill Zone',
            stop,
            tp1: entry + risk,
            tp2: entry + risk * 2,
            basis: ['Discount kill-zone tap', `Session ${session.label}`].join(' • '),
          }, i);
        }
      }
    }

    if (
      sessionAllowed &&
      isLondonOrNy &&
      killZone &&
      asiaRange?.active &&
      (asiaRange.lastTrigger == null || i - asiaRange.lastTrigger > 8)
    ) {
      const sweepTolerance = 0.0002;
      const sweptAsiaHigh =
        candle.h >= asiaRange.high * (1 + sweepTolerance) &&
        candle.c < asiaRange.high &&
        bearishConfirm &&
        htfSellZone;
      if (sweptAsiaHigh) {
        const stop = Math.max(candle.h, asiaRange.high);
        const entry = candle.c;
        const risk = stop - entry;
        if (risk > 0) {
          if (debugCounters) debugCounters.asiaSweepSells++;
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'sell',
            setup: 'Asia Sweep Reversal',
            stop,
            tp1: entry - risk,
            tp2: entry - risk * 2,
            basis: ['London/NY sweep of Asia high', 'Kill zone rejection'].join(' • '),
          }, i);
          asiaRange.lastTrigger = i;
        }
      }
      const sweptAsiaLow =
        candle.l <= asiaRange.low * (1 - sweepTolerance) &&
        candle.c > asiaRange.low &&
        bullishConfirm &&
        htfBuyZone;
      if (sweptAsiaLow) {
        const stop = Math.min(candle.l, asiaRange.low);
        const entry = candle.c;
        const risk = entry - stop;
        if (risk > 0) {
          if (debugCounters) debugCounters.asiaSweepBuys++;
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'buy',
            setup: 'Asia Sweep Reversal',
            stop,
            tp1: entry + risk,
            tp2: entry + risk * 2,
            basis: ['London/NY sweep of Asia low', 'Kill zone rejection'].join(' • '),
          }, i);
          asiaRange.lastTrigger = i;
        }
      }
    }

    if (breakerBlocks?.length && gaps.length && sessionAllowed) {
      const breaker = breakerBlocks.findLast((b) => b.endTime <= candle.t);
      const recentGap = gaps.findLast((g) => g.endTime <= candle.t);
      if (breaker && recentGap) {
        const fvgMid = (recentGap.top + recentGap.bottom) / 2;
        const inFvg =
          candle.l <= Math.max(recentGap.top, recentGap.bottom) &&
          candle.h >= Math.min(recentGap.top, recentGap.bottom);

        if (breaker.type === 'bullish' && inFvg && biasLabel === 'Bullish' && bullishConfirm && htfBuyZone) {
          const stop = breaker.low;
          const entry = fvgMid;
          const risk = entry - stop;
          if (risk > 0) {
            pushSignal({
              time: candle.t,
              price: entry,
              direction: 'buy',
              setup: 'Breaker + FVG',
              stop,
              tp1: entry + risk,
              tp2: entry + risk * 2,
              basis: ['Bull breaker', 'FVG return', 'With bias'].join(' • '),
            }, i);
          }
        }

        if (breaker.type === 'bearish' && inFvg && biasLabel === 'Bearish' && bearishConfirm && htfSellZone) {
          const stop = breaker.high;
          const entry = fvgMid;
          const risk = stop - entry;
          if (risk > 0) {
            pushSignal({
              time: candle.t,
              price: entry,
              direction: 'sell',
              setup: 'Breaker + FVG',
              stop,
              tp1: entry - risk,
              tp2: entry - risk * 2,
              basis: ['Bear breaker', 'FVG return', 'With bias'].join(' • '),
            }, i);
          }
        }
      }
    }

    const filledGap = gaps.findLast((g) => {
      const top = Math.max(g.top, g.bottom);
      const bottom = Math.min(g.top, g.bottom);
      return g.endTime <= candle.t && candle.l <= bottom && candle.h >= top;
    });
    if (filledGap && swings?.length && sessionAllowed) {
      const gapTop = Math.max(filledGap.top, filledGap.bottom);
      const gapBottom = Math.min(filledGap.top, filledGap.bottom);
      const gapMid = (gapTop + gapBottom) / 2;
      if (filledGap.type === 'bullish' && bullishConfirm && htfBuyZone) {
        const stop = Math.min(findRecentSwing(swings, 'low', candle.t) ?? candle.l, candle.l);
        const entry = candle.c;
        const risk = entry - stop;
        pushSignal({
          time: candle.t,
          price: entry,
          direction: 'buy',
          setup: 'FVG Fill Rejection',
          stop,
          tp1: risk > 0 ? entry + risk : undefined,
          tp2: risk > 0 ? entry + risk * 2 : undefined,
          basis: ['Bullish FVG fill', 'Rejection wick'].join(' • '),
        }, i);
      }
      if (filledGap.type === 'bearish' && bearishConfirm && htfSellZone) {
        const stop = Math.max(findRecentSwing(swings, 'high', candle.t) ?? candle.h, candle.h);
        const entry = candle.c;
        const risk = stop - entry;
        pushSignal({
          time: candle.t,
          price: entry,
          direction: 'sell',
          setup: 'FVG Fill Rejection',
          stop,
          tp1: risk > 0 ? entry - risk : undefined,
          tp2: risk > 0 ? entry - risk * 2 : undefined,
          basis: ['Bearish FVG fill', 'Rejection wick'].join(' • '),
        }, i);
      }
      if (filledGap.type === 'bullish' && candle.c < gapBottom) {
        inversionGaps.push({ type: 'bearish', level: gapMid, expiry: candle.t + 6 * 60 * 60 * 1000 });
      }
      if (filledGap.type === 'bearish' && candle.c > gapTop) {
        inversionGaps.push({ type: 'bullish', level: gapMid, expiry: candle.t + 6 * 60 * 60 * 1000 });
      }
    }

    for (let j = inversionGaps.length - 1; j >= 0; j--) {
      if (candle.t >= inversionGaps[j].expiry) {
        inversionGaps.splice(j, 1);
      }
    }
    if (inversionGaps.length && sessionAllowed) {
      const atr = atrValues[i] ?? Math.abs(candle.c) * 0.0004;
      const tol = Math.max(atr * 0.5, Math.abs(candle.c) * 0.0004);
      const inversion = inversionGaps.findLast((gap) => Math.abs(candle.c - gap.level) <= tol);
      if (inversion) {
        const recentSweep = sweeps?.findLast((sw) => sw.time <= candle.t && candle.t - sw.time <= 3 * 60 * 60 * 1000);
        const tappedOb = blocks.find((b) =>
          b.endTime <= candle.t &&
          candle.t - b.endTime <= 3 * 60 * 60 * 1000 &&
          candle.l <= b.high && candle.h >= b.low,
        );
        if (inversion.type === 'bullish' && bullishConfirm && htfBuyZone) {
          const confluence = (recentSweep?.direction === 'down') || tappedOb?.type === 'bullish';
          if (!confluence) {
            inversionGaps.splice(inversionGaps.indexOf(inversion), 1);
            continue;
          }
          const stop = Math.min(candle.l, inversion.level - tol);
          const entry = candle.c;
          const risk = entry - stop;
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'buy',
            setup: 'Inversion FVG',
            stop,
            tp1: risk > 0 ? entry + risk : undefined,
            tp2: risk > 0 ? entry + risk * 2 : undefined,
            basis: ['Inversion FVG support', `Level ${inversion.level.toFixed(2)}`].join(' • '),
          }, i);
          inversionGaps.splice(inversionGaps.indexOf(inversion), 1);
        }
        if (inversion.type === 'bearish' && bearishConfirm && htfSellZone) {
          const confluence = (recentSweep?.direction === 'up') || tappedOb?.type === 'bearish';
          if (!confluence) {
            inversionGaps.splice(inversionGaps.indexOf(inversion), 1);
            continue;
          }
          const stop = Math.max(candle.h, inversion.level + tol);
          const entry = candle.c;
          const risk = stop - entry;
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'sell',
            setup: 'Inversion FVG',
            stop,
            tp1: risk > 0 ? entry - risk : undefined,
            tp2: risk > 0 ? entry - risk * 2 : undefined,
            basis: ['Inversion FVG resistance', `Level ${inversion.level.toFixed(2)}`].join(' • '),
          }, i);
          inversionGaps.splice(inversionGaps.indexOf(inversion), 1);
        }
      }
    }

    if (breakerBlocks?.length && swings?.length && sessionAllowed) {
      const breaker = breakerBlocks.findLast((b) => b.endTime <= candle.t);
      const lastShift = shiftNow;
      if (breaker && lastShift && lastShift.time >= breaker.startTime) {
        if (breaker.type === 'bullish' && lastShift.direction === 'bullish' && bullishConfirm && htfBuyZone) {
          const stop = breaker.low;
          const entry = candle.c;
          const risk = entry - stop;
          if (risk > 0) {
            pushSignal({
              time: candle.t,
              price: entry,
              direction: 'buy',
              setup: 'Breaker + CHoCH',
              stop,
              tp1: entry + risk,
              tp2: entry + risk * 2,
              basis: ['Bull breaker', 'CHoCH up'].join(' • '),
            }, i);
          }
        }
        if (breaker.type === 'bearish' && lastShift.direction === 'bearish' && bearishConfirm && htfSellZone) {
          const stop = breaker.high;
          const entry = candle.c;
          const risk = stop - entry;
          if (risk > 0) {
            pushSignal({
              time: candle.t,
              price: entry,
              direction: 'sell',
              setup: 'Breaker + CHoCH',
              stop,
              tp1: entry - risk,
              tp2: entry - risk * 2,
              basis: ['Bear breaker', 'CHoCH down'].join(' • '),
            }, i);
          }
        }
      }
    }

    if (breakerBlocks?.length && sweeps?.length && sessionAllowed) {
      const breaker = breakerBlocks.findLast((b) => b.endTime <= candle.t);
      const sweep = lastSweepGlobal;
      if (breaker && sweep && sweep.time >= breaker.startTime) {
        const insideBreaker = candle.l <= breaker.high && candle.h >= breaker.low;
        if (insideBreaker) {
          if (breaker.type === 'bullish' && sweep.direction === 'down' && bullishConfirm && htfBuyZone) {
            const stop = breaker.low;
            const entry = candle.c;
            const risk = entry - stop;
            pushSignal({
              time: candle.t,
              price: entry,
              direction: 'buy',
              setup: 'Breaker + Sweep',
              stop,
              tp1: risk > 0 ? entry + risk : undefined,
              tp2: risk > 0 ? entry + risk * 2 : undefined,
              basis: ['Bull breaker', 'Liquidity sweep of lows'].join(' • '),
            }, i);
          }
          if (breaker.type === 'bearish' && sweep.direction === 'up' && bearishConfirm && htfSellZone) {
            const stop = breaker.high;
            const entry = candle.c;
            const risk = stop - entry;
            pushSignal({
              time: candle.t,
              price: entry,
              direction: 'sell',
              setup: 'Breaker + Sweep',
              stop,
              tp1: risk > 0 ? entry - risk : undefined,
              tp2: risk > 0 ? entry - risk * 2 : undefined,
              basis: ['Bear breaker', 'Liquidity sweep of highs'].join(' • '),
            }, i);
          }
        }
      }
    }

    if (htfLevels && session && /NY/i.test(session.label)) {
      const hour = new Date(candle.t).getUTCHours();
      const nyWindow = hour >= 12 && hour <= 16;
      if (nyWindow) {
        if (htfLevels.prevDayHigh && candle.h > htfLevels.prevDayHigh && bearishConfirm && htfSellZone) {
          const stop = Math.max(candle.h, htfLevels.prevDayHigh);
          const entry = candle.c;
          const risk = stop - entry;
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'sell',
            setup: 'Judas Swing',
            stop,
            tp1: risk > 0 ? entry - risk : undefined,
            tp2: risk > 0 ? entry - risk * 2 : undefined,
            basis: ['NY open sweep of PDH', 'Reversal candle'].join(' • '),
          }, i);
        }
        if (htfLevels.prevDayLow && candle.l < htfLevels.prevDayLow && bullishConfirm && htfBuyZone) {
          const stop = Math.min(candle.l, htfLevels.prevDayLow);
          const entry = candle.c;
          const risk = entry - stop;
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'buy',
            setup: 'Judas Swing',
            stop,
            tp1: risk > 0 ? entry + risk : undefined,
            tp2: risk > 0 ? entry + risk * 2 : undefined,
            basis: ['NY open sweep of PDL', 'Reversal candle'].join(' • '),
          }, i);
        }
      }
    }

    if (silverBulletWindow && sweeps?.length && gaps.length) {
      const lastSweep = lastSweepGlobal;
      const recentGap = gaps.findLast((g) => g.endTime <= candle.t);
      if (lastSweep && recentGap) {
        const gapTop = Math.max(recentGap.top, recentGap.bottom);
        const gapBottom = Math.min(recentGap.top, recentGap.bottom);
        const inGap = candle.l <= gapTop && candle.h >= gapBottom;
        if (lastSweep.direction === 'down' && recentGap.type === 'bullish' && inGap && bullishConfirm && htfBuyZone) {
          const stop = Math.min(lastSweep.price, candle.l);
          const entry = candle.c;
          const risk = entry - stop;
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'buy',
            setup: 'Silver Bullet',
            stop,
            tp1: risk > 0 ? entry + risk : undefined,
            tp2: risk > 0 ? entry + risk * 2 : undefined,
            basis: ['NY silver window', 'Sweep of lows', 'FVG return'].join(' • '),
          }, i);
        }
        if (lastSweep.direction === 'up' && recentGap.type === 'bearish' && inGap && bearishConfirm && htfSellZone) {
          const stop = Math.max(lastSweep.price, candle.h);
          const entry = candle.c;
          const risk = stop - entry;
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'sell',
            setup: 'Silver Bullet',
            stop,
            tp1: risk > 0 ? entry - risk : undefined,
            tp2: risk > 0 ? entry - risk * 2 : undefined,
            basis: ['NY silver window', 'Sweep of highs', 'FVG return'].join(' • '),
          }, i);
        }
      }
    }

    const dayIdx = dayIndexMap.get(dateKey) ?? -1;
    const TURTLE_LOOKBACK = 20;
    let turtleHigh: number | null = null;
    let turtleLow: number | null = null;
    if (dayIdx > 0) {
      const lookbackKeys = dayKeys.slice(Math.max(0, dayIdx - TURTLE_LOOKBACK), dayIdx);
      if (lookbackKeys.length >= Math.min(TURTLE_LOOKBACK, 10)) {
        const lookbackCandles = lookbackKeys.flatMap((key) => byDay[key] ?? []);
        if (lookbackCandles.length) {
          turtleHigh = Math.max(...lookbackCandles.map((c) => c.h));
          turtleLow = Math.min(...lookbackCandles.map((c) => c.l));
        }
      }
    }
    const atrWindow = atrValues.slice(Math.max(0, i - 120), i);
    const avgAtr = atrWindow.length ? atrWindow.reduce((sum, val) => sum + val, 0) / atrWindow.length : currentAtr;
    const turtleRange =
      turtleHigh != null && turtleLow != null && turtleHigh > turtleLow ? turtleHigh - turtleLow : null;
    const strongTrend =
      emaFast != null &&
      emaSlow != null &&
      Math.abs(emaFast - emaSlow) > Math.abs(emaSlow ?? candle.c) * 0.0025;
    if (
      sessionAllowed &&
      turtleHigh != null &&
      turtleLow != null &&
      turtleRange != null &&
      avgAtr > 0 &&
      turtleRange <= avgAtr * 8 &&
      !strongTrend
    ) {
      if (candle.h > turtleHigh && candle.c < turtleHigh && direction === 'bearish') {
        const stop = Math.max(candle.h, turtleHigh);
        const entry = Math.min(candle.c, turtleHigh);
        const risk = stop - entry;
        pushSignal({
          time: candle.t,
          price: entry,
          direction: 'sell',
          setup: 'Turtle Soup',
          stop,
          tp1: risk > 0 ? entry - risk : undefined,
          tp2: risk > 0 ? entry - risk * 2 : undefined,
          basis: ['20-day high sweep', 'Close back below range'].join(' • '),
        }, i);
      } else if (candle.l < turtleLow && candle.c > turtleLow && direction === 'bullish') {
        const stop = Math.min(candle.l, turtleLow);
        const entry = Math.max(candle.c, turtleLow);
        const risk = entry - stop;
        pushSignal({
          time: candle.t,
          price: entry,
          direction: 'buy',
          setup: 'Turtle Soup',
          stop,
          tp1: risk > 0 ? entry + risk : undefined,
          tp2: risk > 0 ? entry + risk * 2 : undefined,
          basis: ['20-day low sweep', 'Close back above range'].join(' • '),
        }, i);
      }
    }

    const rangeWindow = candles.slice(Math.max(0, i - 20), i);
    const avgRange =
      rangeWindow.length > 0 ? rangeWindow.reduce((sum, c) => sum + (c.h - c.l), 0) / rangeWindow.length : candle.h - candle.l;
    const body = Math.abs(candle.c - candle.o);
    if (body > avgRange * 1.5) {
      const top = Math.max(candle.o, candle.c);
      const bottom = Math.min(candle.o, candle.c);
      liquidityVoids.push({
        direction: candle.c > candle.o ? 'up' : 'down',
        midpoint: (top + bottom) / 2,
        top,
        bottom,
        time: candle.t,
      });
    }
    const latestVoid = liquidityVoids.findLast((v) => candle.t - v.time <= 12 * 60 * 60 * 1000);
    if (latestVoid) {
      if (
        latestVoid.direction === 'up' &&
        candle.l <= latestVoid.midpoint &&
        candle.c > latestVoid.midpoint &&
        biasLabel === 'Bullish' &&
        bullishConfirm &&
        sessionAllowed
      ) {
        const stop = Math.min(latestVoid.bottom, candle.l);
        const entry = latestVoid.midpoint;
        const risk = entry - stop;
        pushSignal({
          time: candle.t,
          price: entry,
          direction: 'buy',
          setup: 'Liquidity Void Return',
          stop,
          tp1: risk > 0 ? entry + risk : undefined,
          tp2: risk > 0 ? entry + risk * 2 : undefined,
          basis: ['Bullish displacement', 'Return into imbalance'].join(' • '),
        }, i);
      }
      if (
        latestVoid.direction === 'down' &&
        candle.h >= latestVoid.midpoint &&
        candle.c < latestVoid.midpoint &&
        biasLabel === 'Bearish' &&
        bearishConfirm &&
        sessionAllowed
      ) {
        const stop = Math.max(latestVoid.top, candle.h);
        const entry = latestVoid.midpoint;
        const risk = stop - entry;
        pushSignal({
          time: candle.t,
          price: entry,
          direction: 'sell',
          setup: 'Liquidity Void Return',
          stop,
          tp1: risk > 0 ? entry - risk : undefined,
          tp2: risk > 0 ? entry - risk * 2 : undefined,
          basis: ['Bearish displacement', 'Return into imbalance'].join(' • '),
        }, i);
      }
    }

    if (asiaRange && asiaRange.active && sessionAllowed) {
      if (
        candle.l < asiaRange.low &&
        candle.c > asiaRange.low &&
        (!asiaRange.lastTrigger || candle.t - asiaRange.lastTrigger > 60 * 60 * 1000)
      ) {
        const stop = Math.min(candle.l, asiaRange.low);
        const entry = candle.c;
        const risk = entry - stop;
        pushSignal({
          time: candle.t,
          price: entry,
          direction: 'buy',
          setup: 'Asian Range Breakout',
          stop,
          tp1: risk > 0 ? entry + risk : undefined,
          tp2: risk > 0 ? entry + risk * 2 : undefined,
          basis: ['London/NY sweep Asia low', 'Reversal candle'].join(' • '),
        }, i);
        asiaRange.lastTrigger = candle.t;
      }
      if (
        candle.h > asiaRange.high &&
        candle.c < asiaRange.high &&
        (!asiaRange.lastTrigger || candle.t - asiaRange.lastTrigger > 60 * 60 * 1000)
      ) {
        const stop = Math.max(candle.h, asiaRange.high);
        const entry = candle.c;
        const risk = stop - entry;
        pushSignal({
          time: candle.t,
          price: entry,
          direction: 'sell',
          setup: 'Asian Range Breakout',
          stop,
          tp1: risk > 0 ? entry - risk : undefined,
          tp2: risk > 0 ? entry - risk * 2 : undefined,
          basis: ['London/NY sweep Asia high', 'Reversal candle'].join(' • '),
        }, i);
        asiaRange.lastTrigger = candle.t;
      }
    }

    if (sessionAllowed && currentAtr > 0.00001) {
      const momentumMove = Math.abs(candle.c - prev.c) >= currentAtr * 0.8;
      if (momentumMove && biasLabel === 'Bullish' && bullishConfirm) {
        const stop = Math.min(prev.l, candle.l);
        const entry = candle.c;
        const risk = entry - stop;
        if (risk > 0) {
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'buy',
            setup: 'Momentum Continuation',
            stop,
            tp1: entry + risk,
            tp2: entry + risk * 2,
            basis: ['Strong impulsive candle', `Session ${session.label}`].join(' • '),
          }, i);
        }
      }
      if (momentumMove && biasLabel === 'Bearish' && bearishConfirm) {
        const stop = Math.max(prev.h, candle.h);
        const entry = candle.c;
        const risk = stop - entry;
        if (risk > 0) {
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'sell',
            setup: 'Momentum Continuation',
            stop,
            tp1: entry - risk,
            tp2: entry - risk * 2,
            basis: ['Strong impulsive candle', `Session ${session.label}`].join(' • '),
          }, i);
        }
      }
      const meanRevertZone =
        (htfLevels?.prevDayHigh && candle.h >= htfLevels.prevDayHigh) ||
        (htfLevels?.prevDayLow && candle.l <= htfLevels.prevDayLow) ||
        nearPdHigh ||
        nearPdLow;
      if (meanRevertZone && direction === 'bearish' && biasLabel !== 'Bearish') {
        const stop = Math.max(candle.h, prev.h);
        const entry = candle.c;
        const risk = stop - entry;
        if (risk > 0) {
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'sell',
            setup: 'Mean Reversion Fade',
            stop,
            tp1: entry - risk,
            tp2: entry - risk * 2,
            basis: ['Rejecting HTF premium', `Session ${session.label}`].join(' • '),
          }, i);
        }
      }
      if (meanRevertZone && direction === 'bullish' && biasLabel !== 'Bullish') {
        const stop = Math.min(candle.l, prev.l);
        const entry = candle.c;
        const risk = entry - stop;
        if (risk > 0) {
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'buy',
            setup: 'Mean Reversion Fade',
            stop,
            tp1: entry + risk,
            tp2: entry + risk * 2,
            basis: ['Rejecting HTF discount', `Session ${session.label}`].join(' • '),
          }, i);
        }
      }
    }
    if (sessionAllowed) {
      const breakoutWindow = candles.slice(Math.max(0, i - 10), i);
      if (breakoutWindow.length >= 4) {
        const breakoutHigh = Math.max(...breakoutWindow.map((c) => c.h));
        const breakoutLow = Math.min(...breakoutWindow.map((c) => c.l));
        if (candle.c > breakoutHigh && biasLabel !== 'Bearish' && bullishConfirm) {
          const stop = Math.min(breakoutLow, prev.l);
          const entry = candle.c;
          const risk = entry - stop;
          if (risk > 0) {
            pushSignal({
              time: candle.t,
              price: entry,
              direction: 'buy',
              setup: 'Range Breakout',
              stop,
              tp1: entry + risk,
              tp2: entry + risk * 2,
              basis: ['Breakout of recent range', `Session ${session.label}`].join(' • '),
            }, i);
          }
        }
        if (candle.c < breakoutLow && biasLabel !== 'Bullish' && bearishConfirm) {
          const stop = Math.max(breakoutHigh, prev.h);
          const entry = candle.c;
          const risk = stop - entry;
          if (risk > 0) {
            pushSignal({
              time: candle.t,
              price: entry,
              direction: 'sell',
              setup: 'Range Breakout',
              stop,
              tp1: entry - risk,
              tp2: entry - risk * 2,
              basis: ['Breakout of recent range', `Session ${session.label}`].join(' • '),
            }, i);
          }
        }
      }
      const bullEngulf =
        direction === 'bullish' &&
        candle.o <= prev.c &&
        candle.c >= prev.h &&
        candle.c - candle.o > Math.abs(prev.c - prev.o);
      const bearEngulf =
        direction === 'bearish' &&
        candle.o >= prev.c &&
        candle.c <= prev.l &&
        candle.o - candle.c > Math.abs(prev.c - prev.o);
      if (
        bullEngulf &&
        biasLabel === 'Bullish' &&
        currentSignalContext.isKillZone &&
        shiftNow?.direction === 'bullish' &&
        hasClearPath(candle.c, candle.c + proximity * 2, 'buy', gaps)
      ) {
        const stop = Math.min(prev.l, candle.l);
        const entry = candle.c;
        const risk = entry - stop;
        if (risk > 0) {
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'buy',
            setup: 'Engulfing Shift',
            stop,
            tp1: entry + risk,
            tp2: entry + risk * 2,
            basis: ['Bullish engulfing', `Session ${session.label}`].join(' • '),
          }, i);
        }
      }
      if (
        bearEngulf &&
        biasLabel === 'Bearish' &&
        currentSignalContext.isKillZone &&
        shiftNow?.direction === 'bearish' &&
        hasClearPath(candle.c, candle.c - proximity * 2, 'sell', gaps)
      ) {
        const stop = Math.max(prev.h, candle.h);
        const entry = candle.c;
        const risk = stop - entry;
        if (risk > 0) {
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'sell',
            setup: 'Engulfing Shift',
            stop,
            tp1: entry - risk,
            tp2: entry - risk * 2,
            basis: ['Bearish engulfing', `Session ${session.label}`].join(' • '),
          }, i);
        }
      }
      if (biasLabel === 'Bullish' && candle.l <= prev.l && bullishConfirm) {
        const stop = Math.min(candle.l, prev.l);
        const entry = candle.c;
        const risk = entry - stop;
        if (risk > 0) {
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'buy',
            setup: 'Pullback Reentry',
            stop,
            tp1: entry + risk,
            tp2: entry + risk * 2,
            basis: ['Bias bullish', 'Pullback rejection'].join(' • '),
          }, i);
        }
      }
      if (biasLabel === 'Bearish' && candle.h >= prev.h && bearishConfirm) {
        const stop = Math.max(candle.h, prev.h);
        const entry = candle.c;
        const risk = stop - entry;
        if (risk > 0) {
          pushSignal({
            time: candle.t,
            price: entry,
            direction: 'sell',
            setup: 'Pullback Reentry',
            stop,
            tp1: entry - risk,
            tp2: entry - risk * 2,
            basis: ['Bias bearish', 'Pullback rejection'].join(' • '),
          }, i);
        }
      }
    }

  }
  if (uiSignalLimit != null && uiSignalLimit > 0) {
    return signals.slice(-uiSignalLimit);
  }
  if (debugCounters) {
    console.log('[ICT] detectSignals counters', debugCounters);
  }
  return signals;
}

function findRecentSwing(swings: Swing[] | undefined, kind: 'high' | 'low', beforeTime: number) {
  if (!swings || swings.length === 0) return null;
  const filtered = swings.filter((s) => s.type === kind && s.time <= beforeTime);
  return filtered.at(-1)?.price ?? null;
}

export function classifySession(date: Date, sessions: SessionZone[]): SessionZone | null {
  const hour = date.getUTCHours();
  return sessions.find((s) => hour >= s.startHour && hour < s.endHour) ?? null;
}

type StructureShiftOptions = {
  minSwingDistance?: number;
  minSpacingBars?: number;
  minBreakPct?: number;
};

export function detectStructureShifts(
  candles: Candle[],
  swings: Swing[],
  displacementAtr = 0,
  options?: StructureShiftOptions,
): StructureShift[] {
  if (candles.length === 0 || swings.length < 2) return [];
  const shifts: StructureShift[] = [];
  const sortedSwings = [...swings].sort((a, b) => a.time - b.time);
  const highSwings = sortedSwings.filter((s) => s.type === 'high');
  const lowSwings = sortedSwings.filter((s) => s.type === 'low');
  let highIdx = -1;
  let lowIdx = -1;
  let state: 'bullish' | 'bearish' | null = null;
  let lastShiftBar = -Infinity;
  const minSwingDistance = options?.minSwingDistance ?? 1;
  const minSpacingBars = options?.minSpacingBars ?? 3;
  const minBreakPct = options?.minBreakPct ?? 0.00008;

  const hasDisplacement = (candle: Candle, level: number, dir: 'up' | 'down') => {
    const range = candle.h - candle.l || Math.abs(candle.c - candle.o) || 1;
    const atrThreshold = displacementAtr > 0 ? displacementAtr * 0.4 : range * 0.35;
    const buffer = Math.max(level * minBreakPct, atrThreshold * 0.1);
    if (dir === 'up') {
      return candle.h > level + buffer && candle.c > level + atrThreshold * 0.25;
    }
    return candle.l < level - buffer && candle.c < level - atrThreshold * 0.25;
  };

  for (let bar = 0; bar < candles.length; bar++) {
    const candle = candles[bar];
    while (highIdx + 1 < highSwings.length && highSwings[highIdx + 1].time <= candle.t) {
      highIdx++;
    }
    while (lowIdx + 1 < lowSwings.length && lowSwings[lowIdx + 1].time <= candle.t) {
      lowIdx++;
    }
    const activeHigh = highIdx >= 0 ? highSwings[highIdx] : null;
    const activeLow = lowIdx >= 0 ? lowSwings[lowIdx] : null;
    const highSpacingOk =
      activeHigh?.index != null ? bar - activeHigh.index >= minSwingDistance : true;
    const lowSpacingOk =
      activeLow?.index != null ? bar - activeLow.index >= minSwingDistance : true;
    const brokeHigh = activeHigh && highSpacingOk ? hasDisplacement(candle, activeHigh.price, 'up') : false;
    const brokeLow = activeLow && lowSpacingOk ? hasDisplacement(candle, activeLow.price, 'down') : false;

    if (brokeHigh && state !== 'bullish' && activeHigh) {
      if (bar - lastShiftBar < minSpacingBars) continue;
      shifts.push({
        time: candle.t,
        price: activeHigh.price,
        direction: 'bullish',
        label: state === 'bearish' ? 'CHoCH' : 'BOS',
      });
      state = 'bullish';
      lastShiftBar = bar;
    } else if (brokeLow && state !== 'bearish' && activeLow) {
      if (bar - lastShiftBar < minSpacingBars) continue;
      shifts.push({
        time: candle.t,
        price: activeLow.price,
        direction: 'bearish',
        label: state === 'bullish' ? 'CHoCH' : 'BOS',
      });
      state = 'bearish';
      lastShiftBar = bar;
    }
  }

  return shifts.slice(-30);
}

export function computePremiumDiscountRange(candles: Candle[]): PremiumDiscountRange | null {
  if (candles.length < 2) return null;
  const highs = candles.map((c) => c.h);
  const lows = candles.map((c) => c.l);
  const high = Math.max(...highs);
  const low = Math.min(...lows);
  return { high, low, equilibrium: (high + low) / 2 };
}

export function computeHtfLevels(candles: Candle[]): HtfLevels {
  if (candles.length === 0) {
    return {
      prevDayHigh: null,
      prevDayLow: null,
      prevWeekHigh: null,
      prevWeekLow: null,
      weekOpen: null,
      monthOpen: null,
    };
  }

  const byDay = groupByDay(candles);
  const dayKeys = Object.keys(byDay).sort();
  const prevDay = dayKeys.at(-2);
  const prevDayCandles = prevDay ? byDay[prevDay] : [];

  const byWeek: Record<string, Candle[]> = {};
  for (const candle of candles) {
    const d = new Date(candle.t);
    // ISO week grouping
    const week = `${d.getUTCFullYear()}-W${getIsoWeek(d)}`;
    byWeek[week] = byWeek[week] || [];
    byWeek[week].push(candle);
  }
  const weekKeys = Object.keys(byWeek).sort();
  const prevWeek = weekKeys.at(-2);
  const prevWeekCandles = prevWeek ? byWeek[prevWeek] : [];

  const weekOpen = weekKeys.length ? byWeek[weekKeys.at(-1)!][0]?.o ?? null : null;
  const monthOpen = (() => {
    const months = [...candles].sort((a, b) => a.t - b.t);
    const first = months.find((c) => {
      const d = new Date(c.t);
      return d.getUTCDate() === 1 && d.getUTCHours() === 0;
    });
    return first?.o ?? candles[0].o ?? null;
  })();

  return {
    prevDayHigh: prevDayCandles.length ? Math.max(...prevDayCandles.map((c) => c.h)) : null,
    prevDayLow: prevDayCandles.length ? Math.min(...prevDayCandles.map((c) => c.l)) : null,
    prevWeekHigh: prevWeekCandles.length ? Math.max(...prevWeekCandles.map((c) => c.h)) : null,
    prevWeekLow: prevWeekCandles.length ? Math.min(...prevWeekCandles.map((c) => c.l)) : null,
    weekOpen,
    monthOpen,
  };
}

export function detectLiquiditySweeps(
  candles: Candle[],
  tolerancePct = 0.0005,
  minSpacingBars = 3,
): LiquiditySweep[] {
  const sweeps: LiquiditySweep[] = [];
  if (candles.length < 3) return sweeps;
  const levelsHigh: { price: number; time: number }[] = [];
  const levelsLow: { price: number; time: number }[] = [];
  let lastHighSweepIdx = -Infinity;
  let lastHighSweepPrice = NaN;
  let lastLowSweepIdx = -Infinity;
  let lastLowSweepPrice = NaN;

  // find equal highs/lows
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    const tolHigh = prev.h * tolerancePct;
    const tolLow = prev.l * tolerancePct;
    if (Math.abs(cur.h - prev.h) <= tolHigh) {
      levelsHigh.push({ price: (cur.h + prev.h) / 2, time: cur.t });
    }
    if (Math.abs(cur.l - prev.l) <= tolLow) {
      levelsLow.push({ price: (cur.l + prev.l) / 2, time: cur.t });
    }
  }

  // detect sweeps of those levels
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const sweptHigh = levelsHigh.find((l) => c.h > l.price && c.t > l.time);
    if (
      sweptHigh &&
      i - lastHighSweepIdx >= minSpacingBars &&
      (Number.isNaN(lastHighSweepPrice) || Math.abs(sweptHigh.price - lastHighSweepPrice) > sweptHigh.price * tolerancePct)
    ) {
      sweeps.push({ time: c.t, price: sweptHigh.price, type: 'eqh', direction: 'up' });
      lastHighSweepIdx = i;
      lastHighSweepPrice = sweptHigh.price;
    }
    const sweptLow = levelsLow.find((l) => c.l < l.price && c.t > l.time);
    if (
      sweptLow &&
      i - lastLowSweepIdx >= minSpacingBars &&
      (Number.isNaN(lastLowSweepPrice) || Math.abs(sweptLow.price - lastLowSweepPrice) > sweptLow.price * tolerancePct)
    ) {
      sweeps.push({ time: c.t, price: sweptLow.price, type: 'eql', direction: 'down' });
      lastLowSweepIdx = i;
      lastLowSweepPrice = sweptLow.price;
    }
  }

  return sweeps.slice(-20);
}

export function detectBreakerBlocks(orderBlocks: OrderBlock[], candles: Candle[]): BreakerBlock[] {
  const breakers: BreakerBlock[] = [];
  if (!orderBlocks.length || candles.length === 0) return breakers;

  for (const ob of orderBlocks) {
    const violatingCandle = candles.find((c) => {
      if (c.t <= ob.endTime) return false;
      if (ob.type === 'bullish') return c.c < ob.low;
      return c.c > ob.high;
    });
    if (!violatingCandle) continue;
    const breakerType = ob.type === 'bullish' ? 'bearish' : 'bullish';
    const displacement =
      ob.type === 'bullish'
        ? (ob.low - violatingCandle.c) / Math.max(1e-9, violatingCandle.h - violatingCandle.l)
        : (violatingCandle.c - ob.high) / Math.max(1e-9, violatingCandle.h - violatingCandle.l);
    const grade = displacement > 1 ? 'strong' : displacement > 0.5 ? 'medium' : 'weak';
    breakers.push({
      startTime: ob.startTime,
      endTime: violatingCandle.t,
      high: ob.high,
      low: ob.low,
      type: breakerType,
      sourceObType: ob.type,
      grade,
    });
  }
  return breakers.slice(-10);
}

export function detectEqualHighsLows(candles: Candle[], tolerancePct = 0.0005): EqualLiquidityLevel[] {
  const levels: EqualLiquidityLevel[] = [];
  if (candles.length < 2) return levels;
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    const tolH = prev.h * tolerancePct;
    const tolL = prev.l * tolerancePct;
    if (Math.abs(cur.h - prev.h) <= tolH) {
      levels.push({ price: (cur.h + prev.h) / 2, times: [prev.t, cur.t], kind: 'highs' });
    }
    if (Math.abs(cur.l - prev.l) <= tolL) {
      levels.push({ price: (cur.l + prev.l) / 2, times: [prev.t, cur.t], kind: 'lows' });
    }
  }
  return levels.slice(-20);
}

export function detectSmtSignals(primary: Candle[], secondary: Candle[], lookback = 100): SmtSignal[] {
  const signals: SmtSignal[] = [];
  if (!primary.length || !secondary.length) return signals;
  const secondaryByTime = new Map<number, Candle>();
  for (const candle of secondary.slice(-lookback)) {
    secondaryByTime.set(candle.t, candle);
  }
  for (let i = Math.max(1, primary.length - lookback); i < primary.length; i++) {
    const current = primary[i];
    const prev = primary[i - 1];
    const currentSecondary = secondaryByTime.get(current.t);
    const prevSecondary = secondaryByTime.get(prev.t);
    if (!currentSecondary || !prevSecondary) continue;
    const primaryHigherHigh = current.h > prev.h;
    const secondaryHigherHigh = currentSecondary.h > prevSecondary.h;
    if (primaryHigherHigh && !secondaryHigherHigh) {
      signals.push({ time: current.t, type: 'sell', reason: 'Primary made HH, secondary did not' });
    }
    const primaryLowerLow = current.l < prev.l;
    const secondaryLowerLow = currentSecondary.l < prevSecondary.l;
    if (primaryLowerLow && !secondaryLowerLow) {
      signals.push({ time: current.t, type: 'buy', reason: 'Primary made LL, secondary held' });
    }
  }
  return signals.slice(-20);
}

function getIsoWeek(date: Date) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function dedupeBlocks(blocks: OrderBlock[]) {
  const unique: OrderBlock[] = [];
  for (const block of blocks) {
    const exists = unique.some(
      (b) =>
        b.type === block.type &&
        Math.abs(b.startTime - block.startTime) < 1000 &&
        Math.abs(b.high - block.high) < 1e-8 &&
        Math.abs(b.low - block.low) < 1e-8,
    );
    if (!exists) unique.push(block);
  }
  return unique;
}

type SetupFilterOutcome = {
  sizeMultiplier: number;
};

function evaluateSetupFilters(
  setupName: string,
  direction: 'buy' | 'sell',
  entry: number,
  tpTarget: number | undefined,
  stats: OptimizationWeights[string] | undefined,
  gaps: Gap[],
  fallbackAtr: number,
): SetupFilterOutcome | null {
  if (stats && !stats.allowed) return null;
  const projectedTarget =
    tpTarget ??
    (fallbackAtr > 0
      ? direction === 'buy'
        ? entry + fallbackAtr * 3
        : entry - fallbackAtr * 3
      : undefined);
  if (projectedTarget != null && !hasClearPath(entry, projectedTarget, direction, gaps)) {
    return null;
  }
  return { sizeMultiplier: stats?.sizeMultiplier ?? 1 };
}

function hasClearPath(currentPrice: number, targetPrice: number, direction: 'buy' | 'sell', gaps: Gap[]) {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(targetPrice)) return true;
  if (direction === 'buy' && targetPrice <= currentPrice) return true;
  if (direction === 'sell' && targetPrice >= currentPrice) return true;
  return !gaps.some((gap) => {
    if (direction === 'buy') {
      return (
        gap.type === 'bearish' &&
        gap.bottom > currentPrice &&
        gap.bottom < targetPrice
      );
    }
    return gap.type === 'bullish' && gap.top < currentPrice && gap.top > targetPrice;
  });
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

function isWithinKillZone(date: Date, session: SessionZone) {
  const hour = date.getUTCHours();
  if (session.killStartHour == null || session.killEndHour == null) return true;
  return hour >= session.killStartHour && hour < session.killEndHour;
}

function computeEma(values: number[], length: number): Array<number | undefined> {
  if (length <= 1) return [...values];
  const ema: Array<number | undefined> = new Array(values.length).fill(undefined);
  const k = 2 / (length + 1);
  let prev: number | undefined;
  for (let i = 0; i < values.length; i++) {
    const price = values[i];
    if (!Number.isFinite(price)) continue;
    if (i < length - 1) continue;
    if (prev === undefined) {
      const window = values.slice(i - length + 1, i + 1).filter((v) => Number.isFinite(v));
      if (!window.length) continue;
      const seed = window.reduce((sum, val) => sum + val, 0) / window.length;
      ema[i] = seed;
      prev = seed;
      continue;
    }
    prev = price * k + prev * (1 - k);
    ema[i] = prev;
  }
  return ema;
}

function computeSessionOpenLevels(candles: Candle[], sessions: SessionZone[]): SessionOpenLevels {
  const levels: SessionOpenLevels = {};
  const londonStart = sessions.find((s) => /london/i.test(s.label))?.startHour ?? 7;
  const nyStart = sessions.find((s) => /new york/i.test(s.label))?.startHour ?? 12;
  for (const candle of candles) {
    const d = new Date(candle.t);
    const dateKey = d.toISOString().slice(0, 10);
    const hour = d.getUTCHours();
    const bucket = (levels[dateKey] = levels[dateKey] ?? {});
    if (hour === 0 && bucket.midnightOpen == null) {
      bucket.midnightOpen = candle.o;
    }
    if (hour === londonStart && bucket.londonOpen == null) {
      bucket.londonOpen = candle.o;
    }
    if (hour === nyStart && bucket.nyOpen == null) {
      bucket.nyOpen = candle.o;
    }
  }
  return levels;
}

function detectPowerOfThreePattern(
  candles: Candle[],
  index: number,
  session: SessionZone | null,
  asiaRange: { high: number; low: number; active: boolean } | null,
) {
  if (!session || !/london|new york/i.test(session.label)) return null;
  if (index < 12) return null;
  const window = candles.slice(Math.max(0, index - 10), index - 2);
  if (window.length < 6) return null;
  const high = Math.max(...window.map((c) => c.h));
  const low = Math.min(...window.map((c) => c.l));
  const range = high - low;
  const avgBody = window.reduce((sum, c) => sum + Math.abs(c.c - c.o), 0) / window.length;
  const accumulation = range <= (avgBody || 1) * 5;
  if (!accumulation) return null;
  const candle = candles[index];
  const prev = candles[index - 1];
  const sweepHigh = asiaRange && asiaRange.active && candle.h >= asiaRange.high * 0.9995 && prev.c < asiaRange.high;
  const sweepLow = asiaRange && asiaRange.active && candle.l <= asiaRange.low * 1.0005 && prev.c > asiaRange.low;
  if (sweepLow && candle.c > candle.o) {
    return {
      direction: 'buy' as const,
      entry: candle.c,
      anchorLow: Math.min(candle.l, asiaRange?.low ?? candle.l),
      reason: 'Power of three: accumulation + manipulation low',
    };
  }
  if (sweepHigh && candle.c < candle.o) {
    return {
      direction: 'sell' as const,
      entry: candle.c,
      anchorHigh: Math.max(candle.h, asiaRange?.high ?? candle.h),
      reason: 'Power of three: accumulation + manipulation high',
    };
  }
  return null;
}

function respectsSessionOpen(
  direction: 'buy' | 'sell',
  levels?: SessionOpenLevels[string],
  price?: number,
) {
  if (!levels || price == null) return true;
  const opens = [levels.midnightOpen, levels.londonOpen, levels.nyOpen].filter((v): v is number => v != null);
  if (!opens.length) return true;
  if (direction === 'buy') {
    return opens.some((lvl) => price >= lvl);
  }
  return opens.some((lvl) => price <= lvl);
}

function computeAnchoredPdRange(
  candles: Candle[],
  swings: Swing[] | undefined,
  index: number,
): PremiumDiscountRange | null {
  if (!swings?.length) return null;
  const cutoff = candles[index]?.t;
  if (!cutoff) return null;
  const highs = swings.filter((s) => s.type === 'high' && s.time <= cutoff);
  const lows = swings.filter((s) => s.type === 'low' && s.time <= cutoff);
  const lastHigh = highs.at(-1);
  const lastLow = lows.at(-1);
  if (!lastHigh || !lastLow) return null;
  const high = Math.max(lastHigh.price, lastLow.price);
  const low = Math.min(lastHigh.price, lastLow.price);
  if (high <= low) return null;
  return { high, low, equilibrium: (high + low) / 2 };
}

function getWeeklyPdRange(htfLevels?: HtfLevels | null): PremiumDiscountRange | null {
  if (!htfLevels) return null;
  if (
    htfLevels.prevWeekHigh != null &&
    htfLevels.prevWeekLow != null &&
    htfLevels.prevWeekHigh > htfLevels.prevWeekLow
  ) {
    return {
      high: htfLevels.prevWeekHigh,
      low: htfLevels.prevWeekLow,
      equilibrium: (htfLevels.prevWeekHigh + htfLevels.prevWeekLow) / 2,
    };
  }
  return null;
}

function getSetupPriority(map: Map<string, number>, setup?: string | null) {
  if (!setup) return 1;
  return map.get(setup) ?? 1;
}

function fallbackSession(date: Date, sessions: SessionZone[]): SessionZone | null {
  const hour = date.getUTCHours();
  if (hour >= 0 && hour < 6) {
    return { label: 'Asia', startHour: 0, endHour: 6, killStartHour: 0, killEndHour: 6 };
  }
  if (hour >= 6 && hour < 12) {
    const london = sessions.find((s) => /london/i.test(s.label));
    return {
      label: 'London',
      startHour: london?.startHour ?? 6,
      endHour: london?.endHour ?? 12,
      killStartHour: london?.killStartHour ?? london?.startHour ?? 6,
      killEndHour: london?.killEndHour ?? london?.endHour ?? 12,
    };
  }
  if (hour >= 12 && hour < 20) {
    const ny = sessions.find((s) => /new york/i.test(s.label));
    return {
      label: 'New York',
      startHour: ny?.startHour ?? 12,
      endHour: ny?.endHour ?? 20,
      killStartHour: ny?.killStartHour ?? ny?.startHour ?? 12,
      killEndHour: ny?.killEndHour ?? ny?.endHour ?? 20,
    };
  }
  return null;
}

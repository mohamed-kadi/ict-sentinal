export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D' | '1W' | '1M';

export type AssetClass = 'crypto' | 'forex' | 'stocks';

export type Candle = {
  t: number; // epoch ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type Bias = {
  label: 'Bullish' | 'Bearish' | 'Neutral';
  reason: string;
};

export type Swing = {
  index: number;
  time: number;
  price: number;
  type: 'high' | 'low';
};

export type Gap = {
  startTime: number;
  endTime: number;
  top: number;
  bottom: number;
  type: 'bullish' | 'bearish';
};

export type OrderBlock = {
  startTime: number;
  endTime: number;
  high: number;
  low: number;
  type: 'bullish' | 'bearish';
};

export type Signal = {
  time: number;
  price: number;
  direction: 'buy' | 'sell';
  basis: string;
  setup?: string;
  stop?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  tp4?: number;
  sizeMultiplier?: number;
};

export type SessionZone = {
  label: string;
  startHour: number;
  endHour: number;
  killStartHour?: number;
  killEndHour?: number;
};

export type StructureShift = {
  time: number;
  price: number;
  direction: 'bullish' | 'bearish';
  label: 'BOS' | 'CHoCH';
};

export type PremiumDiscountRange = {
  high: number;
  low: number;
  equilibrium: number;
};

export type LiquiditySweep = {
  time: number;
  price: number;
  type: 'eqh' | 'eql';
  direction: 'up' | 'down';
};

export type BreakerBlock = {
  startTime: number;
  endTime: number;
  high: number;
  low: number;
  type: 'bullish' | 'bearish';
  sourceObType: 'bullish' | 'bearish';
  grade?: 'weak' | 'medium' | 'strong';
};

export type DrawingType = 'hline' | 'trend' | 'rect' | 'fibo' | 'measure' | 'long' | 'short';

export type Drawing = {
  id: string;
  type: DrawingType;
  points: { time: number; price: number }[];
  color: string;
};

export type EqualLiquidityLevel = {
  price: number;
  times: number[];
  kind: 'highs' | 'lows';
};

export type HtfLevels = {
  prevDayHigh: number | null;
  prevDayLow: number | null;
  prevWeekHigh: number | null;
  prevWeekLow: number | null;
  weekOpen: number | null;
  monthOpen: number | null;
};

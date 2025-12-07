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

export type StrongWeakSwing = Swing & {
  strength: 'strong' | 'weak';
};

export type DailyCandle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
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
  session?: string | null;
  bias?: Bias['label'];
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

export type Model2022Signal = {
  time: number;
  direction: 'buy' | 'sell';
  label: 'BUY SETUP' | 'SELL SETUP';
  fvg: Gap;
  entry: number;
  stop?: number;
  basis: string[];
};

export type DailyLiquidity = {
  pdh: number | null;
  pdl: number | null;
  last3Highs: Array<{ price: number; date: string }>;
  last3Lows: Array<{ price: number; date: string }>;
  midnightOpen: number | null;
};

export type Model2022State = {
  strongSwings: StrongWeakSwing[];
  obWithDisplacement: OrderBlock[];
  dailyCandle: DailyCandle | null;
  dailyLiquidity: DailyLiquidity;
  m15Signals: Model2022Signal[];
};

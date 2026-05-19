import { buildBackendUrl } from './backend';
import type {
  Bias,
  BreakerBlock,
  Candle,
  EqualLiquidityLevel,
  Gap,
  HtfLevels,
  LiquiditySweep,
  Model2022State,
  OrderBlock,
  PremiumDiscountRange,
  Signal,
  StructureShift,
  Swing,
  Timeframe,
} from './types';

export type SignalAnalysisResponse = {
  bias: Bias;
  signals: Signal[];
  swings: Swing[];
  gaps: Gap[];
  orderBlocks: OrderBlock[];
  structureShifts: StructureShift[];
  sweeps: LiquiditySweep[];
  equalHighsLows: EqualLiquidityLevel[];
  breakerBlocks: BreakerBlock[];
  premiumDiscount: PremiumDiscountRange | null;
  htfLevels: HtfLevels | null;
  model2022: Model2022State;
  engineVersion: string;
  supportedSetups: string[];
};

export async function fetchSignalAnalysis(
  symbol: string,
  timeframe: Timeframe | string,
  candles: Candle[],
  signalLimit?: number | null,
  optimizerEnabled = true,
) {
  const endpoint = buildBackendUrl('/api/v1/analysis/signals');
  if (!endpoint) {
    throw new Error('NEXT_PUBLIC_BACKEND_BASE_URL is not configured');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbol,
      timeframe,
      candles,
      signalLimit: signalLimit ?? null,
      optimizerEnabled,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to analyze signals (${response.status})`);
  }

  return (await response.json()) as SignalAnalysisResponse;
}

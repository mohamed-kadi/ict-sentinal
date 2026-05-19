import { buildBackendUrl } from './backend';
import type { Timeframe } from './types';

export type CreateTradeJournalEntryInput = {
  symbol: string;
  timeframe: Timeframe | string;
  setup: string;
  session?: string | null;
  bias?: string | null;
  direction: 'buy' | 'sell';
  result: 'win' | 'loss';
  rMultiple: number;
  entryPrice?: number;
  exitPrice?: number;
  stopPrice?: number;
  takeProfitPrice?: number;
  executedAt: number;
  closedAt?: number;
};

export async function postTradeJournalEntry(input: CreateTradeJournalEntryInput) {
  const endpoint = buildBackendUrl('/api/v1/trades');
  if (!endpoint) {
    return;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbol: input.symbol,
      timeframe: input.timeframe,
      setup: input.setup,
      session: input.session ?? null,
      bias: input.bias ?? null,
      direction: input.direction.toUpperCase(),
      result: input.result.toUpperCase(),
      rMultiple: input.rMultiple,
      entryPrice: toOptionalFiniteNumber(input.entryPrice),
      exitPrice: toOptionalFiniteNumber(input.exitPrice),
      stopPrice: toOptionalFiniteNumber(input.stopPrice),
      takeProfitPrice: toOptionalFiniteNumber(input.takeProfitPrice),
      executedAt: new Date(input.executedAt).toISOString(),
      closedAt: new Date(input.closedAt ?? input.executedAt).toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to record trade (${response.status})`);
  }
}

function toOptionalFiniteNumber(value?: number) {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

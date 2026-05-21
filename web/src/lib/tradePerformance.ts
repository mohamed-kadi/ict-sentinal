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

export type PersistedTradeJournalEntry = {
  id: string;
  symbol: string;
  timeframe: string;
  setup: string;
  session?: string | null;
  bias?: string | null;
  direction: 'BUY' | 'SELL';
  result: 'WIN' | 'LOSS';
  rMultiple: number;
  entryPrice?: number | null;
  exitPrice?: number | null;
  stopPrice?: number | null;
  takeProfitPrice?: number | null;
  executedAt: string;
  closedAt: string;
  createdAt: string;
};

export type TradeJournalEntriesResponse = {
  totalEntries: number;
  entries: PersistedTradeJournalEntry[];
};

export type TradePerformanceSetupResponse = {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  averageR: number;
  averageWinR: number;
  averageLossR: number;
  allowed: boolean;
  sizeMultiplier: number;
};

export type TradePerformanceResponse = {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  averageR: number;
  lastTradeAt?: string | null;
  setups: Record<string, TradePerformanceSetupResponse>;
};

export function tradeJournalScopeQueryKey(
  symbol?: string | null,
  timeframe?: Timeframe | string | null,
) {
  return ['trade-journal', symbol ?? null, timeframe ?? null] as const;
}

export function tradeJournalEntriesQueryKey(
  symbol?: string | null,
  timeframe?: Timeframe | string | null,
  limit = 20,
) {
  return [...tradeJournalScopeQueryKey(symbol, timeframe), 'entries', limit] as const;
}

export function tradePerformanceQueryKey(
  symbol?: string | null,
  timeframe?: Timeframe | string | null,
  lookbackDays?: number | null,
) {
  return [...tradeJournalScopeQueryKey(symbol, timeframe), 'performance', lookbackDays ?? null] as const;
}

export async function postTradeJournalEntry(input: CreateTradeJournalEntryInput) {
  const endpoint = requireBackendUrl('/api/v1/trades');

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

export async function fetchTradeJournalEntries({
  symbol,
  timeframe,
  lookbackDays,
  limit = 20,
}: {
  symbol?: string | null;
  timeframe?: Timeframe | string | null;
  lookbackDays?: number | null;
  limit?: number;
}) {
  const endpoint = new URL(requireBackendUrl('/api/v1/trades'));
  if (symbol) endpoint.searchParams.set('symbol', symbol);
  if (timeframe) endpoint.searchParams.set('timeframe', timeframe);
  if (lookbackDays != null) endpoint.searchParams.set('lookbackDays', String(lookbackDays));
  endpoint.searchParams.set('limit', String(limit));

  const response = await fetch(endpoint.toString(), {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to load trade journal (${response.status})`);
  }

  return (await response.json()) as TradeJournalEntriesResponse;
}

export async function fetchTradePerformance({
  symbol,
  timeframe,
  lookbackDays,
}: {
  symbol?: string | null;
  timeframe?: Timeframe | string | null;
  lookbackDays?: number | null;
}) {
  const endpoint = new URL(requireBackendUrl('/api/v1/trades/performance'));
  if (symbol) endpoint.searchParams.set('symbol', symbol);
  if (timeframe) endpoint.searchParams.set('timeframe', timeframe);
  if (lookbackDays != null) endpoint.searchParams.set('lookbackDays', String(lookbackDays));

  const response = await fetch(endpoint.toString(), {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to load trade performance (${response.status})`);
  }

  return (await response.json()) as TradePerformanceResponse;
}

function requireBackendUrl(path: string) {
  const endpoint = buildBackendUrl(path);
  if (!endpoint) {
    throw new Error('NEXT_PUBLIC_BACKEND_BASE_URL is not configured');
  }
  return endpoint;
}

function toOptionalFiniteNumber(value?: number) {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

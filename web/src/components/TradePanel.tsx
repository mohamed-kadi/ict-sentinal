'use client';

import { FormEvent, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { useBackendBaseUrl } from '@/lib/backend';
import { formatWithTz, getClockLabel } from '@/lib/time';
import {
  fetchTradeJournalEntries,
  fetchTradePerformance,
  postTradeJournalEntry,
  tradeJournalEntriesQueryKey,
  tradeJournalScopeQueryKey,
  tradePerformanceQueryKey,
  type PersistedTradeJournalEntry,
} from '@/lib/tradePerformance';
import { useAppStore, type BacktestTrade } from '@/state/useAppStore';

const JOURNAL_ENTRIES_LIMIT = 6;
const JOURNAL_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

export function TradePanel() {
  const queryClient = useQueryClient();
  const backendBaseUrl = useBackendBaseUrl();
  const { backtest, addTrade, clearTrades, updateTrade, symbol, timeframe, clockTz } = useAppStore(
    useShallow((state) => ({
      backtest: state.backtest,
      addTrade: state.addTrade,
      clearTrades: state.clearTrades,
      updateTrade: state.updateTrade,
      symbol: state.symbol,
      timeframe: state.timeframe,
      clockTz: state.clockTz,
    })),
  );
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy');
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');
  const [target, setTarget] = useState('');
  const clockLabel = getClockLabel(clockTz);

  const journalEntriesQuery = useQuery({
    queryKey: tradeJournalEntriesQueryKey(symbol, timeframe, JOURNAL_ENTRIES_LIMIT),
    queryFn: () =>
      fetchTradeJournalEntries({
        symbol,
        timeframe,
        limit: JOURNAL_ENTRIES_LIMIT,
      }),
    enabled: Boolean(backendBaseUrl) && Boolean(symbol) && Boolean(timeframe),
  });
  const performanceQuery = useQuery({
    queryKey: tradePerformanceQueryKey(symbol, timeframe),
    queryFn: () =>
      fetchTradePerformance({
        symbol,
        timeframe,
      }),
    enabled: Boolean(backendBaseUrl) && Boolean(symbol) && Boolean(timeframe),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const entryNum = Number(entry);
    const stopNum = Number(stop);
    const targetNum = Number(target);
    if (!entryNum || !stopNum || !targetNum) return;
    if (direction === 'buy') {
      if (stopNum >= entryNum) {
        alert('For long trades the stop must be below the entry price.');
        return;
      }
      if (targetNum <= entryNum) {
        alert('For long trades the target should be above the entry price.');
        return;
      }
    } else {
      if (stopNum <= entryNum) {
        alert('For short trades the stop must be above the entry price.');
        return;
      }
      if (targetNum >= entryNum) {
        alert('For short trades the target should be below the entry price.');
        return;
      }
    }

    const id = crypto.randomUUID();
    const risk = Math.abs(entryNum - stopNum);
    const reward = Math.abs(targetNum - entryNum);
    const rMultiple = reward / risk;
    const openedAt = Date.now();
    addTrade({
      id,
      symbol,
      timeframe,
      direction,
      entry: entryNum,
      stop: stopNum,
      target: targetNum,
      rMultiple,
      risk,
      positionSize: 1,
      setup: 'Manual Entry',
      sessionLabel: 'Manual',
      manual: true,
      openTime: openedAt,
      status: 'active',
    });
    setEntry('');
    setStop('');
    setTarget('');
  };

  const closeTradeManually = (trade: BacktestTrade, exitPrice: number, exitTime: number) => {
    const size = trade.positionSize ?? 1;
    const pnlPerUnit = trade.direction === 'buy' ? exitPrice - trade.entry : trade.entry - exitPrice;
    const pnl = pnlPerUnit * size;
    let result: BacktestTrade['result'];
    if (Math.abs(pnlPerUnit) < 1e-8) result = 'breakeven';
    else if (pnlPerUnit > 0) result = 'win';
    else result = 'loss';

    updateTrade(trade.id, {
      status: 'closed',
      result,
      pnl,
      exitTime,
    });

    if (result !== 'win' && result !== 'loss') {
      return;
    }

    const risk = trade.risk && trade.risk > 0 ? trade.risk : Math.abs(trade.entry - trade.stop);
    const computedR = risk > 0 ? pnlPerUnit / risk : result === 'win' ? 1 : -1;
    postTradeJournalEntry({
      symbol: trade.symbol ?? symbol,
      timeframe: trade.timeframe ?? timeframe,
      setup: trade.setup ?? 'Manual Entry',
      session: trade.sessionLabel ?? 'Manual',
      bias: trade.biasLabel ?? 'Neutral',
      direction: trade.direction,
      result,
      rMultiple: Number.isFinite(computedR) ? computedR : result === 'win' ? 1 : -1,
      entryPrice: trade.entry,
      exitPrice,
      stopPrice: trade.stop,
      takeProfitPrice: trade.target,
      executedAt: trade.openTime ?? exitTime,
      closedAt: exitTime,
    })
      .then(() =>
        queryClient.invalidateQueries({
          queryKey: tradeJournalScopeQueryKey(trade.symbol ?? symbol, trade.timeframe ?? timeframe),
        }),
      )
      .catch(() => {});
  };

  const wins = backtest.trades.filter((t) => t.result === 'win').length;
  const losses = backtest.trades.filter((t) => t.result === 'loss').length;
  const totalPnl = backtest.trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const recentEntries = journalEntriesQuery.data?.entries ?? [];
  const performance = performanceQuery.data ?? null;
  const journalError = (performanceQuery.error as Error | null) ?? (journalEntriesQuery.error as Error | null) ?? null;
  const journalLoading = Boolean(backendBaseUrl) && !journalError && (performanceQuery.isLoading || journalEntriesQuery.isLoading);
  const journalRefreshing = Boolean(backendBaseUrl) && (performanceQuery.isFetching || journalEntriesQuery.isFetching);

  return (
    <div className="mt-4 rounded border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-200">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs uppercase text-zinc-500">
        <div>
          <span className="text-emerald-300">Win {wins}</span>{' '}
          <span className="text-white/80">|</span>{' '}
          <span className="text-red-400">Loss {losses}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>
            PnL <span className={totalPnl >= 0 ? 'text-emerald-300' : 'text-red-400'}>{totalPnl.toFixed(2)}</span>
          </span>
          <span className="text-white/80">|</span>
          <span className={backtest.balance >= 0 ? 'text-emerald-300' : 'text-red-400'}>
            Balance {backtest.balance.toFixed(2)}
          </span>
        </div>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <select
            className="w-24 rounded bg-zinc-900 px-2 py-1"
            value={direction}
            onChange={(e) => setDirection(e.target.value as 'buy' | 'sell')}
          >
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
          <input
            type="number"
            step="0.0001"
            placeholder="Entry"
            className="w-full rounded bg-zinc-900 px-2 py-1"
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.0001"
            placeholder="Stop"
            className="w-full rounded bg-zinc-900 px-2 py-1"
            value={stop}
            onChange={(e) => setStop(e.target.value)}
          />
          <input
            type="number"
            step="0.0001"
            placeholder="Target"
            className="w-full rounded bg-zinc-900 px-2 py-1"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="flex-1 rounded border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200"
          >
            Add trade
          </button>
          <button
            type="button"
            className="flex-1 rounded border border-red-500/60 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200"
            onClick={clearTrades}
          >
            Clear trades
          </button>
        </div>
      </form>
      {backtest.trades.length > 0 && (
        <div className="mt-3 space-y-2 text-xs">
          {backtest.trades.slice(-5).reverse().map((t) => (
            <div key={t.id} className="rounded border border-zinc-800 bg-zinc-950/70 p-2">
              <div className="flex items-center justify-between">
                <span className={t.direction === 'buy' ? 'text-emerald-400' : 'text-red-400'}>
                  {t.direction.toUpperCase()}
                </span>
                <span className="text-zinc-500">~{t.rMultiple?.toFixed(2)}R</span>
              </div>
              <div className="text-zinc-300">
                {t.entry.toFixed(2)} / SL {t.stop.toFixed(2)} / TP {t.target.toFixed(2)}
              </div>
              <TradeStatusRow
                trade={t}
                onClose={(price, ts) => closeTradeManually(t, price, ts)}
                onCancel={() =>
                  updateTrade(t.id, { status: 'closed', result: 'breakeven', pnl: 0, exitTime: Date.now() })
                }
              />
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 rounded border border-sky-500/25 bg-sky-500/5 p-3 text-xs">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold uppercase tracking-wide text-sky-200">Persisted Journal</div>
            <div className="text-[11px] text-zinc-400">
              {symbol} {timeframe}
            </div>
          </div>
          {journalRefreshing && (
            <span className="text-[10px] uppercase tracking-wide text-sky-100/80">Syncing</span>
          )}
        </div>

        {!backendBaseUrl && (
          <div className="mt-3 rounded border border-zinc-800 bg-zinc-950/70 p-3 text-[11px] text-zinc-400">
            Set `NEXT_PUBLIC_BACKEND_BASE_URL` to enable persisted journal history and setup performance.
          </div>
        )}

        {backendBaseUrl && journalError && (
          <div className="mt-3 rounded border border-rose-500/25 bg-rose-500/10 p-3 text-[11px] text-rose-100">
            {journalError.message}
          </div>
        )}

        {backendBaseUrl && !journalError && (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <JournalStat
                label="Stored"
                value={journalLoading ? '...' : String(performance?.totalTrades ?? journalEntriesQuery.data?.totalEntries ?? 0)}
              />
              <JournalStat
                label="Win rate"
                value={journalLoading ? '...' : `${Math.round((performance?.winRate ?? 0) * 100)}%`}
              />
              <JournalStat
                label="Avg R"
                value={journalLoading ? '...' : formatSignedR(performance?.averageR ?? 0)}
              />
              <JournalStat
                label="Last close"
                value={
                  journalLoading
                    ? '...'
                    : performance?.lastTradeAt
                      ? formatWithTz(new Date(performance.lastTradeAt), clockTz, JOURNAL_TIME_FORMAT)
                      : '--'
                }
              />
            </div>
            <div className="mt-1 text-[10px] text-zinc-500">{clockLabel}</div>

            <div className="mt-3 space-y-2">
              {recentEntries.length === 0 && !journalLoading && (
                <div className="rounded border border-zinc-800 bg-zinc-950/70 p-3 text-[11px] text-zinc-400">
                  No persisted trades yet for this symbol and timeframe.
                </div>
              )}
              {recentEntries.map((entry) => (
                <PersistedJournalCard key={entry.id} entry={entry} clockTz={clockTz} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TradeStatusRow({
  trade,
  onClose,
  onCancel,
}: {
  trade: BacktestTrade;
  onClose: (exitPrice: number, exitTime: number) => void;
  onCancel: () => void;
}) {
  const status = trade.status ?? (trade.result ? 'closed' : 'active');
  const canCloseManually = status === 'active' && !trade.result && trade.manual;
  const handleManualClose = () => {
    const defaultPrice = trade.entry.toFixed(4);
    const exitStr = window.prompt('Enter exit price to close the trade', defaultPrice);
    if (!exitStr) return;
    const exitPrice = Number(exitStr);
    if (!Number.isFinite(exitPrice)) return;
    onClose(exitPrice, Date.now());
  };
  return (
    <div className="mt-2 text-xs">
      {status === 'planned' && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-amber-300">Planned (waiting for entry)</span>
          <button
            className="rounded border border-zinc-600 px-2 py-0.5 text-[10px] font-semibold text-zinc-200"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      )}
      {status === 'active' && !trade.result && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sky-300">{trade.manual ? 'Taken manually' : 'Taken'}</span>
          {canCloseManually && (
            <button
              className="rounded border border-zinc-600 px-2 py-0.5 text-[10px] font-semibold text-zinc-200"
              onClick={handleManualClose}
            >
              Close trade
            </button>
          )}
        </div>
      )}
      {status === 'canceled' && <span className="text-zinc-400">Cancelled</span>}
      {status === 'closed' && trade.result && (
        <span
          className={
            trade.result === 'win'
              ? 'text-emerald-300'
              : trade.result === 'loss'
                ? 'text-red-300'
                : 'text-zinc-300'
          }
        >
          {trade.result.toUpperCase()} {trade.pnl != null ? `(${trade.pnl.toFixed(4)})` : ''}
        </span>
      )}
    </div>
  );
}

function JournalStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/70 p-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 font-semibold text-zinc-100">{value}</div>
    </div>
  );
}

function PersistedJournalCard({
  entry,
  clockTz,
}: {
  entry: PersistedTradeJournalEntry;
  clockTz: string;
}) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={entry.direction === 'BUY' ? 'text-emerald-300' : 'text-red-300'}>
            {entry.direction}
          </span>
          <span
            className={
              entry.result === 'WIN'
                ? 'rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200'
                : 'rounded bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-200'
            }
          >
            {entry.result}
          </span>
        </div>
        <span className={entry.rMultiple >= 0 ? 'text-emerald-300' : 'text-red-300'}>
          {formatSignedR(entry.rMultiple)}
        </span>
      </div>
      <div className="mt-2 font-semibold text-zinc-100">{entry.setup}</div>
      <div className="mt-1 text-[11px] text-zinc-400">
        {entry.session ?? 'No session'} · {entry.symbol} {entry.timeframe}
      </div>
      <div className="mt-1 text-[11px] text-zinc-500">
        Closed {formatWithTz(new Date(entry.closedAt), clockTz, JOURNAL_TIME_FORMAT)}
      </div>
    </div>
  );
}

function formatSignedR(value: number) {
  const rounded = value.toFixed(2);
  return `${value > 0 ? '+' : ''}${rounded}R`;
}

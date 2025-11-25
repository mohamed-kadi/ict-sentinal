'use client';

import { FormEvent, useState } from 'react';
import { useAppStore, type BacktestTrade } from '@/state/useAppStore';

export function TradePanel() {
  const { backtest, addTrade, clearTrades, updateTrade } = useAppStore();
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy');
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');
  const [target, setTarget] = useState('');

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
    addTrade({
      id,
      direction,
      entry: entryNum,
      stop: stopNum,
      target: targetNum,
      rMultiple,
      setup: 'Manual Entry',
      sessionLabel: 'Manual',
      manual: true,
      status: 'planned',
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
  };

  const wins = backtest.trades.filter((t) => t.result === 'win').length;
  const losses = backtest.trades.filter((t) => t.result === 'loss').length;
  const totalPnl = backtest.trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);

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
                onCancel={() => updateTrade(t.id, { status: 'closed', result: 'breakeven', pnl: 0, exitTime: Date.now() })}
              />
            </div>
          ))}
        </div>
      )}
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
          <span className="text-sky-300">Taken</span>
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
      {status === 'canceled' && (
        <span className="text-zinc-400">Cancelled</span>
      )}
      {status === 'closed' && trade.result && (
        <span className={trade.result === 'win' ? 'text-emerald-300' : trade.result === 'loss' ? 'text-red-300' : 'text-zinc-300'}>
          {trade.result.toUpperCase()} {trade.pnl != null ? `(${trade.pnl.toFixed(4)})` : ''}
        </span>
      )}
    </div>
  );
}

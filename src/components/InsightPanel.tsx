'use client';

import { AssetClass, Bias, Gap, OrderBlock, Signal, Swing, PremiumDiscountRange } from '@/lib/types';
import { TradePanel } from './TradePanel';
import { SYMBOL_LOGOS } from './TopBar';
import { useAppStore } from '@/state/useAppStore';
import { formatWithTz, getClockLabel } from '@/lib/time';
import { IctScannerResult, evaluateIctScanner } from '@/lib/ictScanner';

const ADVANCED_SETUPS = new Set(['Silver Bullet', 'Turtle Soup']);

type Props = {
  symbol?: string;
  assetClass?: AssetClass;
  latestPrice?: number;
  priceChangeAbs?: number;
  priceChangePct?: number;
  marketOpen?: boolean;
  dataSource?: string;
  bias?: Bias;
  swings?: Swing[];
  gaps?: Gap[];
  orderBlocks?: OrderBlock[];
  signals?: Signal[];
  selectedSetup?: string;
  ictScanner?: IctScannerResult;
  premiumDiscount?: PremiumDiscountRange | null;
};

export function InsightPanel({
  symbol,
  assetClass,
  latestPrice,
  priceChangeAbs,
  priceChangePct,
  marketOpen,
  dataSource,
  bias,
  swings = [],
  gaps = [],
  orderBlocks = [],
  signals = [],
  selectedSetup = 'all',
  ictScanner,
  premiumDiscount = null,
}: Props) {
  const clockTz = useAppStore((state) => state.clockTz);
  const clockLabel = getClockLabel(clockTz);
  const matchesSelectedSetup = (setup?: string) => {
    if (!setup) return false;
    if (selectedSetup === 'all') return true;
    if (selectedSetup === 'advanced') return ADVANCED_SETUPS.has(setup);
    return setup === selectedSetup;
  };
  const filteredSignals =
    selectedSetup === 'all' ? signals.slice(-5) : signals.filter((s) => matchesSelectedSetup(s.setup)).slice(-5);

  return (
    <div className="flex h-full w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-200">
      <details open className="rounded border border-zinc-800 bg-zinc-900/70">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase text-zinc-400">
          Asset
        </summary>
        <div className="px-3 pb-3 pt-1">
          <div className="flex items-center gap-2">
            {symbol && (
              <img
                src={SYMBOL_LOGOS[symbol] ?? SYMBOL_LOGOS.default}
                alt={symbol}
                className="h-8 w-8 rounded-full bg-zinc-800 object-contain"
              />
            )}
            <div>
              <p className="text-lg font-semibold text-white">{symbol ?? '--'}</p>
              <p className="text-xs text-zinc-400">{assetClass ? assetClass.toUpperCase() : ''}</p>
            </div>
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {latestPrice !== undefined ? latestPrice.toFixed(4) : '--'}
            {dataSource && (
              <span className="ml-2 rounded bg-zinc-800 px-1 py-[1px] text-[10px] text-zinc-400">{dataSource}</span>
            )}
          </div>
          {priceChangeAbs !== undefined && priceChangePct !== undefined && (
            <div className={priceChangeAbs >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {priceChangeAbs >= 0 ? '+' : ''}
              {priceChangeAbs.toFixed(4)} ({priceChangePct.toFixed(2)}%)
            </div>
          )}
          {marketOpen !== undefined && (
            <div className={`mt-1 text-xs ${marketOpen ? 'text-emerald-400' : 'text-red-400'}`}>
              ● Market {marketOpen ? 'open' : 'closed'}
            </div>
          )}
        </div>
      </details>

      <details open className="rounded border border-zinc-800 bg-zinc-900/70">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase text-zinc-400">
          Snapshot
        </summary>
        <div className="px-3 pb-3 pt-1">
          <h3 className="mb-3 text-xs uppercase text-zinc-500">Snapshot</h3>
          <ul className="space-y-2">
            <li className="flex items-center justify-between">
              <span>Bias</span>
              <span className={biasColor(bias?.label)}>{bias?.label ?? 'Neutral'}</span>
            </li>
            <li className="flex items-center justify-between">
              <span>Liquidity points</span>
              <span className="text-zinc-300">{swings.length}</span>
            </li>
            <li className="flex items-center justify-between">
              <span>FVGs</span>
              <span className="text-zinc-300">{gaps.length}</span>
            </li>
            <li className="flex items-center justify-between">
              <span>Order Blocks</span>
              <span className="text-zinc-300">{orderBlocks.length}</span>
            </li>
            <li className="flex items-center justify-between">
              <span>Signals</span>
              <span className="text-zinc-300">{signals.length}</span>
            </li>
          </ul>
        </div>
      </details>

      {ictScanner && (
        <details open className="rounded border border-sky-500/30 bg-sky-500/5">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase text-sky-300">
            ICT radar
          </summary>
          <div className="px-3 pb-3 pt-1 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span
                className={`rounded px-2 py-1 text-xs font-semibold uppercase tracking-wide ${scannerLabelClass(
                  ictScanner,
                )}`}
              >
                {ictScanner.label}
              </span>
              <span
                className={`rounded px-2 py-1 text-sm font-semibold ${scannerColorClass(
                  ictScanner.score,
                  true,
                  ictScanner.direction,
                )}`}
              >
                {ictScanner.score.toFixed(0)}%
              </span>
            </div>
            <p className="text-sm text-sky-100">{ictScanner.summary}</p>
            <ul className="space-y-1 text-xs text-sky-200">
              {ictScanner.reasons.map((reason, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span>•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}

      {filteredSignals.length > 0 && (
        <details open className="rounded border border-zinc-800 bg-zinc-900/70">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase text-zinc-400">
            Latest setups
          </summary>
          <div className="px-3 pb-3 pt-1 space-y-2">
            <div className="space-y-2">
              {filteredSignals
                .slice()
                .reverse()
                .map((s, idx) => (
                  <SetupCard
                    key={`${s.time}-${s.direction}-${idx}`}
                    signal={s}
                    idx={idx}
                    clockTz={clockTz}
                    clockLabel={clockLabel}
                    latestPrice={latestPrice}
                    bias={bias}
                    premiumDiscount={premiumDiscount}
                  />
                ))}
            </div>
          </div>
        </details>
      )}
      {filteredSignals.length === 0 && (
        <details open className="rounded border border-zinc-800 bg-zinc-900/70">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase text-zinc-400">
            Latest setups
          </summary>
          <div className="px-3 pb-3 pt-2 text-[11px] text-zinc-400">
            No signals for this setup/timeframe yet.
          </div>
        </details>
      )}

      <details open className="rounded border border-emerald-500/30 bg-emerald-500/5">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase text-emerald-300">
          Paper trades
        </summary>
        <div className="px-3 pb-3 pt-1">
          <TradePanel />
        </div>
      </details>
    </div>
  );
}

function biasColor(label?: string) {
  if (label === 'Bullish') return 'text-emerald-400';
  if (label === 'Bearish') return 'text-red-400';
  return 'text-zinc-300';
}

function rrLabel(entry: number, stop: number, target: number, dir: 'buy' | 'sell') {
  const risk = dir === 'buy' ? entry - stop : stop - entry;
  const reward = dir === 'buy' ? target - entry : entry - target;
  if (risk <= 0) return '';
  return (reward / risk).toFixed(2) + 'R';
}

function SetupCard({
  signal,
  idx,
  clockTz,
  clockLabel,
  latestPrice,
  bias,
  premiumDiscount,
}: {
  signal: Signal;
  idx: number;
  clockTz: string;
  clockLabel: string;
  latestPrice?: number;
  bias?: Bias;
  premiumDiscount?: PremiumDiscountRange | null;
}) {
  const readiness = evaluateIctScanner({
    signal,
    bias,
    premiumDiscount,
    latestPrice: latestPrice ?? signal.price,
  });
  const scoreClass = readiness.direction === 'sell' ? sellChipClass(true) : buyChipClass(true);
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/70 p-2">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className={signal.direction === 'buy' ? 'text-emerald-400' : 'text-red-400'}>
            {signal.direction === 'buy' ? 'Buy' : 'Sell'}
          </span>
          {signal.setup && (
            <span className="rounded bg-zinc-800 px-1 py-[1px] text-[10px] text-zinc-300">{signal.setup}</span>
          )}
          <span className="rounded bg-zinc-800 px-1 py-[1px] text-[10px] text-zinc-400">#{idx + 1}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-[1px] text-[10px] font-semibold ${scoreClass}`}>
            {readiness.score.toFixed(0)}%
          </span>
          <span className="text-zinc-400">
            {formatWithTz(signal.time, clockTz, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            {clockLabel}
          </span>
        </div>
      </div>
      <div className="text-xs">
        <span className="text-sky-300">Entry</span>{' '}
        <span className="text-sky-100">~ {signal.price.toFixed(4)}</span>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] text-zinc-400">
        {signal.stop && (
          <span>
            <span className="text-red-300">SL {signal.stop.toFixed(4)}</span>
            {signal.tp1 && (
              <>
                <span className="text-white/70"> | </span>
                <span className="text-emerald-300">R1: {rrLabel(signal.price, signal.stop, signal.tp1, signal.direction)}</span>
              </>
            )}
            {signal.tp2 && (
              <>
                <span className="text-white/70"> | </span>
                <span className="text-emerald-300">R2: {rrLabel(signal.price, signal.stop, signal.tp2, signal.direction)}</span>
              </>
            )}
            {signal.tp3 && (
              <>
                <span className="text-white/70"> | </span>
                <span className="text-emerald-300">R3: {rrLabel(signal.price, signal.stop, signal.tp3, signal.direction)}</span>
              </>
            )}
            {signal.tp4 && (
              <>
                <span className="text-white/70"> | </span>
                <span className="text-emerald-300">R4: {rrLabel(signal.price, signal.stop, signal.tp4, signal.direction)}</span>
              </>
            )}
          </span>
        )}
        {!signal.stop && (
          <>
            {signal.tp1 && <span className="text-emerald-300">TP1 {signal.tp1.toFixed(4)}</span>}
            {signal.tp2 && <span className="text-emerald-300">TP2 {signal.tp2.toFixed(4)}</span>}
            {signal.tp3 && <span className="text-emerald-300">TP3 {signal.tp3.toFixed(4)}</span>}
            {signal.tp4 && <span className="text-emerald-300">TP4 {signal.tp4.toFixed(4)}</span>}
          </>
        )}
      </div>
      <div className="text-[11px] text-zinc-500">{signal.basis}</div>
    </div>
  );
}

function scannerLabelClass(result: IctScannerResult) {
  if (result.direction === 'sell') return 'bg-red-600/60 text-red-50 border border-red-400/60';
  return 'bg-emerald-500/30 text-emerald-50 border border-emerald-300/60';
}

function scannerColorClass(score: number, solid = false, direction?: 'buy' | 'sell' | null) {
  if (direction === 'sell') {
    return solid ? 'bg-red-600/60 text-red-50 border border-red-500/80' : 'bg-red-500/15 text-red-100 border border-red-400/50';
  }
  return solid ? 'bg-emerald-500/40 text-emerald-50 border border-emerald-400/70' : 'bg-emerald-500/15 text-emerald-100 border border-emerald-400/40';
}

function buyChipClass(solid = false) {
  return solid ? 'bg-emerald-500/30 text-emerald-50 border border-emerald-400/70' : 'bg-emerald-500/15 text-emerald-100 border border-emerald-400/50';
}

function sellChipClass(solid = false) {
  return solid ? 'bg-red-600/60 text-red-50 border border-red-500/80' : 'bg-red-500/20 text-red-100 border border-red-400/60';
}

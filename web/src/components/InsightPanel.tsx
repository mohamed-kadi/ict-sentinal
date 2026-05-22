'use client';

import { AssetClass, Bias, Gap, OrderBlock, Signal, Swing, PremiumDiscountRange } from '@/lib/types';
import { useAlertRelayStatus } from '@/lib/alertConnectors';
import clsx from 'clsx';
import { useShallow } from 'zustand/react/shallow';
import { TradePanel } from './TradePanel';
import { SymbolLogo } from './SymbolLogo';
import { SidebarToggleButton } from './SidebarToggleButton';
import { type AlertRelayEvent, useAppStore } from '@/state/useAppStore';
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
  activeSignal?: Signal | null;
  activeSignalScore?: number | null;
  backtestEnabled?: boolean;
  onTakeActiveSignal?: () => void;
  onDismissActiveSignal?: () => void;
  hasMoreHistory?: boolean;
  isFetchingOlderHistory?: boolean;
  onFetchOlderHistory?: () => void;
  latestSignalTime?: number | null;
  actionableSignalTime?: number | null;
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
  activeSignal = null,
  activeSignalScore = null,
  backtestEnabled = false,
  onTakeActiveSignal,
  onDismissActiveSignal,
  hasMoreHistory = false,
  isFetchingOlderHistory = false,
  onFetchOlderHistory,
  latestSignalTime = null,
  actionableSignalTime = null,
}: Props) {
  const { clockTz, alertStatus, alertRelayEvents, clearAlertRelayEvents, notificationsEnabled, autoTradeEnabled, toggleInsight } =
    useAppStore(
      useShallow((state) => ({
        clockTz: state.clockTz,
        alertStatus: state.alertStatus,
        alertRelayEvents: state.alertRelayEvents,
        clearAlertRelayEvents: state.clearAlertRelayEvents,
        notificationsEnabled: state.notificationsEnabled,
        autoTradeEnabled: state.backtest.autoTrade,
        toggleInsight: state.toggleInsight,
      })),
    );
  const relayStatus = useAlertRelayStatus();
  const clockLabel = getClockLabel(clockTz);
  const lastRelayEvent =
    alertRelayEvents
      .slice()
      .reverse()
      .find((event) => event.channel === 'webhook' || event.channel === 'execution') ?? null;
  const matchesSelectedSetup = (setup?: string) => {
    if (!setup) return false;
    if (selectedSetup === 'all') return true;
    if (selectedSetup === 'advanced') return ADVANCED_SETUPS.has(setup);
    return setup === selectedSetup;
  };
  const filteredSignals =
    selectedSetup === 'all' ? signals.slice(-5) : signals.filter((s) => matchesSelectedSetup(s.setup)).slice(-5);
  const filteredLatestSignalTime = filteredSignals.at(-1)?.time ?? null;
  const filteredActionableSignalTime =
    filteredLatestSignalTime != null && actionableSignalTime != null && filteredLatestSignalTime === actionableSignalTime
      ? filteredLatestSignalTime
      : null;

  return (
    <div className="flex h-full w-72 xl:w-80 shrink-0 flex-col gap-2 overflow-y-auto border-l border-zinc-800 bg-zinc-950/60 px-2.5 pb-2.5 pt-1.5 text-sm text-zinc-200">
      {activeSignal && (
        <details open className="relative rounded border border-emerald-500/30 bg-emerald-500/5">
          <SidebarToggleButton
            open
            side="right"
            onClick={() => toggleInsight()}
            ariaLabel="Hide right panel"
            title="Hide right panel"
            className="absolute right-2 top-1 z-10 h-9 w-9 shrink-0 text-zinc-400 hover:text-zinc-100"
          />
          <summary className="cursor-pointer px-3 py-1.5 pr-12 text-xs font-semibold uppercase text-emerald-300">
            Current ICT Entry
          </summary>
          <div className="space-y-2.5 px-3 pb-2.5 pt-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={activeSignal.direction === 'buy' ? 'text-emerald-300' : 'text-red-300'}>
                    {activeSignal.direction === 'buy' ? 'Buy Entry' : 'Sell Entry'}
                  </span>
                  {activeSignal.setup && (
                    <span className="rounded bg-zinc-800 px-1 py-[1px] text-[10px] text-zinc-300">{activeSignal.setup}</span>
                  )}
                </div>
                <div className="mt-1 text-[11px] text-zinc-400">
                  {formatWithTz(activeSignal.time, clockTz, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}{' '}
                  {clockLabel}
                </div>
              </div>
              <span
                className={clsx(
                  'rounded px-2 py-1 text-[10px] font-semibold',
                  activeSignal.direction === 'sell' ? sellChipClass(true) : buyChipClass(true),
                )}
              >
                {activeSignalScore != null ? `${activeSignalScore.toFixed(0)}%` : 'Scanning'}
              </span>
            </div>
            <div className="rounded border border-zinc-800 bg-zinc-900/70 p-3">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">Entry</div>
              <div className="mt-1 text-lg font-semibold text-sky-100">~ {activeSignal.price.toFixed(4)}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-300">
                {activeSignal.stop && <span className="text-red-300">SL {activeSignal.stop.toFixed(4)}</span>}
                {activeSignal.tp1 && <span className="text-emerald-300">TP1 {activeSignal.tp1.toFixed(4)}</span>}
                {activeSignal.tp2 && <span className="text-emerald-300">TP2 {activeSignal.tp2.toFixed(4)}</span>}
                {activeSignal.tp3 && <span className="text-emerald-300">TP3 {activeSignal.tp3.toFixed(4)}</span>}
                {activeSignal.tp4 && <span className="text-emerald-300">TP4 {activeSignal.tp4.toFixed(4)}</span>}
                {activeSignal.stop && activeSignal.tp1 && (
                  <span className="text-emerald-200">
                    R/R {rrLabel(activeSignal.price, activeSignal.stop, activeSignal.tp1, activeSignal.direction)}
                  </span>
                )}
              </div>
              <div className="mt-2 text-[11px] text-zinc-500">{activeSignal.basis}</div>
            </div>
            <div className="flex gap-2 text-[11px]">
              <button
                type="button"
                className="flex-1 rounded border border-emerald-500/60 bg-emerald-500/10 py-1 font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                onClick={onTakeActiveSignal}
              >
                {backtestEnabled ? 'Enter trade' : 'Take trade'}
              </button>
              <button
                type="button"
                className="flex-1 rounded border border-zinc-600 bg-zinc-800/70 py-1 font-semibold text-zinc-200 transition hover:bg-zinc-700"
                onClick={onDismissActiveSignal}
              >
                {backtestEnabled ? 'Cancel' : 'Dismiss'}
              </button>
            </div>
          </div>
        </details>
      )}
      <details open className="relative rounded border border-zinc-800 bg-zinc-900/70">
        {!activeSignal && (
          <SidebarToggleButton
            open
            side="right"
            onClick={() => toggleInsight()}
            ariaLabel="Hide right panel"
            title="Hide right panel"
            className="absolute right-2 top-1 z-10 h-9 w-9 shrink-0 text-zinc-400 hover:text-zinc-100"
          />
        )}
        <summary className="cursor-pointer px-3 py-1.5 pr-12 text-xs font-semibold uppercase text-zinc-400">
          Asset
        </summary>
        <div className="px-3 pb-2.5 pt-1">
          <div className="flex items-center gap-2">
            {symbol && (
              <SymbolLogo symbol={symbol} size={32} className="h-8 w-8" />
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
          {hasMoreHistory && (
            <button
              type="button"
              className="mt-3 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-200 transition hover:border-emerald-500 disabled:opacity-60"
              onClick={onFetchOlderHistory}
              disabled={isFetchingOlderHistory}
            >
              {isFetchingOlderHistory ? 'Loading older data…' : 'Load older history'}
            </button>
          )}
        </div>
      </details>

      <details open className="rounded border border-amber-500/25 bg-amber-500/5">
        <summary className="cursor-pointer px-3 py-1.5 text-xs font-semibold uppercase text-amber-200">
          Alert Pipeline
        </summary>
        <div className="space-y-2.5 px-3 pb-2.5 pt-1">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <PipelineStat
              label="Relay"
              value={relayStatus.configured ? relayStatus.label : 'Local only'}
              tone={relayStatus.configured ? 'emerald' : 'amber'}
            />
            <PipelineStat label="Alerts" value={notificationsEnabled ? 'On' : 'Off'} tone={notificationsEnabled ? 'emerald' : 'zinc'} />
            <PipelineStat label="Auto Trade" value={autoTradeEnabled ? 'On' : 'Off'} tone={autoTradeEnabled ? 'emerald' : 'zinc'} />
            <PipelineStat
              label="Signal"
              value={
                filteredActionableSignalTime != null
                  ? 'Entry Now'
                  : filteredLatestSignalTime != null
                    ? 'Historical'
                    : 'None'
              }
              tone={filteredActionableSignalTime != null ? 'emerald' : filteredLatestSignalTime != null ? 'amber' : 'zinc'}
            />
            <PipelineStat
              label="Bot Ack"
              value={formatRelayAck(lastRelayEvent)}
              tone={relayAckTone(lastRelayEvent)}
            />
            <PipelineStat
              label="Last HTTP"
              value={formatRelayHttp(lastRelayEvent)}
              tone={relayHttpTone(lastRelayEvent)}
            />
          </div>
          {alertStatus && (
            <div className="rounded border border-zinc-800 bg-zinc-950/70 p-2 text-[11px]">
              <div className="font-semibold text-zinc-200">{alertStatus.message}</div>
              {alertStatus.detail && <div className="mt-1 text-zinc-400">{alertStatus.detail}</div>}
            </div>
          )}
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase text-zinc-400">Recent relay activity</p>
            {alertRelayEvents.length > 0 && (
              <button
                type="button"
                className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 transition hover:text-zinc-200"
                onClick={clearAlertRelayEvents}
              >
                Clear
              </button>
            )}
          </div>
          {alertRelayEvents.length > 0 ? (
            <div className="space-y-2">
              {alertRelayEvents
                .slice()
                .reverse()
                .slice(0, 5)
                .map((event) => (
                  <RelayEventCard key={event.id} event={event} clockTz={clockTz} clockLabel={clockLabel} />
                ))}
            </div>
          ) : (
            <div className="rounded border border-zinc-800 bg-zinc-950/70 p-2 text-[11px] text-zinc-400">
              No relay attempts yet for this session.
            </div>
          )}
        </div>
      </details>

      <details open className="rounded border border-zinc-800 bg-zinc-900/70">
        <summary className="cursor-pointer px-3 py-1.5 text-xs font-semibold uppercase text-zinc-400">
          Snapshot
        </summary>
        <div className="px-3 pb-2.5 pt-1">
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
          <summary className="cursor-pointer px-3 py-1.5 text-xs font-semibold uppercase text-sky-300">
            ICT radar
          </summary>
          <div className="px-3 pb-2.5 pt-1 space-y-2.5">
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
          <summary className="cursor-pointer px-3 py-1.5 text-xs font-semibold uppercase text-zinc-400">
            ICT Entries
          </summary>
          <div className="px-3 pb-2.5 pt-1 space-y-2">
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
                    latestSignalTime={filteredLatestSignalTime}
                    actionableSignalTime={filteredActionableSignalTime}
                  />
                ))}
            </div>
          </div>
        </details>
      )}
      {filteredSignals.length === 0 && (
        <details open className="rounded border border-zinc-800 bg-zinc-900/70">
          <summary className="cursor-pointer px-3 py-1.5 text-xs font-semibold uppercase text-zinc-400">
            ICT Entries
          </summary>
          <div className="px-3 pb-2.5 pt-1.5 text-[11px] text-zinc-400">
            No qualified ICT entries for this setup and timeframe yet.
          </div>
        </details>
      )}

      <details open className="rounded border border-emerald-500/30 bg-emerald-500/5">
        <summary className="cursor-pointer px-3 py-1.5 text-xs font-semibold uppercase text-emerald-300">
          Paper trades
        </summary>
        <div className="px-3 pb-2.5 pt-1">
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
  latestSignalTime,
  actionableSignalTime,
}: {
  signal: Signal;
  idx: number;
  clockTz: string;
  clockLabel: string;
  latestPrice?: number;
  bias?: Bias;
  premiumDiscount?: PremiumDiscountRange | null;
  latestSignalTime?: number | null;
  actionableSignalTime?: number | null;
}) {
  const readiness = evaluateIctScanner({
    signal,
    bias,
    premiumDiscount,
    latestPrice: latestPrice ?? signal.price,
  });
  const scoreClass = readiness.direction === 'sell' ? sellChipClass(true) : buyChipClass(true);
  const signalState =
    actionableSignalTime != null && signal.time === actionableSignalTime
      ? { label: 'Entry Now', className: 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/50' }
      : latestSignalTime != null && signal.time === latestSignalTime
        ? { label: 'Stale', className: 'bg-amber-500/20 text-amber-100 border border-amber-400/50' }
        : { label: 'Historical', className: 'bg-zinc-800 text-zinc-300 border border-zinc-700' };
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/70 p-2">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className={signal.direction === 'buy' ? 'text-emerald-400' : 'text-red-400'}>
            {signal.direction === 'buy' ? 'Buy Entry' : 'Sell Entry'}
          </span>
          {signal.setup && (
            <span className="rounded bg-zinc-800 px-1 py-[1px] text-[10px] text-zinc-300">{signal.setup}</span>
          )}
          <span className="rounded bg-zinc-800 px-1 py-[1px] text-[10px] text-zinc-400">#{idx + 1}</span>
          <span className={clsx('rounded px-1.5 py-[1px] text-[10px] font-semibold', signalState.className)}>
            {signalState.label}
          </span>
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

function PipelineStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'emerald' | 'amber' | 'zinc';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-100 border-emerald-500/30 bg-emerald-500/10'
      : tone === 'amber'
        ? 'text-amber-100 border-amber-500/30 bg-amber-500/10'
        : 'text-zinc-200 border-zinc-700 bg-zinc-900/70';
  return (
    <div className={clsx('rounded border px-2 py-2', toneClass)}>
      <div className="text-[10px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-1 text-xs font-semibold">{value}</div>
    </div>
  );
}

function RelayEventCard({
  event,
  clockTz,
  clockLabel,
}: {
  event: AlertRelayEvent;
  clockTz: string;
  clockLabel: string;
}) {
  const statusClass =
    event.deliveryStatus === 'delivered' || event.deliveryStatus === 'executed'
      ? 'text-emerald-100 border-emerald-500/30 bg-emerald-500/10'
      : event.deliveryStatus === 'failed'
        ? 'text-rose-100 border-rose-500/30 bg-rose-500/10'
        : 'text-amber-100 border-amber-500/30 bg-amber-500/10';
  const ackClass =
    event.ackStatus === 'acknowledged'
      ? event.acceptanceStatus === 'rejected'
        ? 'text-rose-100 border-rose-500/30 bg-rose-500/10'
        : 'text-emerald-100 border-emerald-500/30 bg-emerald-500/10'
      : 'text-zinc-200 border-zinc-700 bg-zinc-900/70';
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/70 p-2 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={event.direction === 'buy' ? 'text-emerald-300' : 'text-red-300'}>
            {event.direction === 'buy' ? 'Buy' : 'Sell'}
          </span>
          <span className="text-zinc-400">{event.setup ?? 'ICT'}</span>
        </div>
        <span className={clsx('rounded border px-1.5 py-[1px] text-[10px] font-semibold uppercase', statusClass)}>
          {relayEventChannelLabel(event)} {event.deliveryStatus}
        </span>
      </div>
      <div className="mt-1 text-zinc-300">{event.detail}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className={clsx('rounded border px-1.5 py-[1px] text-[10px] font-semibold uppercase', ackClass)}>
          {relayAckBadge(event)}
        </span>
        {event.lastResponse?.status != null && (
          <span className="rounded border border-zinc-700 bg-zinc-900/70 px-1.5 py-[1px] text-[10px] font-semibold uppercase text-zinc-200">
            HTTP {event.lastResponse.status}
          </span>
        )}
      </div>
      {event.lastResponse?.bodyPreview && (
        <div className="mt-1 text-[10px] text-zinc-500">{event.lastResponse.bodyPreview}</div>
      )}
      <div className="mt-1 text-[10px] text-zinc-500">
        {formatWithTz(event.createdAt, clockTz, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}{' '}
        {clockLabel}
      </div>
    </div>
  );
}

function formatRelayAck(event: AlertRelayEvent | null) {
  if (!event) return 'None';
  if (event.ackStatus !== 'acknowledged') return 'No ack';
  if (event.acceptanceStatus === 'accepted') return 'Accepted';
  if (event.acceptanceStatus === 'rejected') return 'Rejected';
  return 'Ack only';
}

function relayAckTone(event: AlertRelayEvent | null): 'emerald' | 'amber' | 'zinc' {
  if (!event) return 'zinc';
  if (event.ackStatus !== 'acknowledged' || event.acceptanceStatus === 'rejected') return 'amber';
  return 'emerald';
}

function formatRelayHttp(event: AlertRelayEvent | null) {
  if (!event?.lastResponse) return 'None';
  if (event.lastResponse.status == null) return 'No code';
  return event.lastResponse.statusText
    ? `${event.lastResponse.status} ${event.lastResponse.statusText}`
    : String(event.lastResponse.status);
}

function relayHttpTone(event: AlertRelayEvent | null): 'emerald' | 'amber' | 'zinc' {
  if (!event?.lastResponse?.status) return 'zinc';
  return event.lastResponse.status >= 400 ? 'amber' : 'emerald';
}

function relayEventChannelLabel(event: AlertRelayEvent) {
  if (event.channel === 'auto-trade') return 'Auto';
  return event.channel === 'execution' ? 'Execution' : 'Webhook';
}

function relayAckBadge(event: AlertRelayEvent) {
  if (event.channel === 'auto-trade') return 'No bot ack';
  if (event.ackStatus !== 'acknowledged') return 'No bot ack';
  if (event.acceptanceStatus === 'accepted') return 'Bot accepted';
  if (event.acceptanceStatus === 'rejected') return 'Bot rejected';
  return 'Bot acked';
}

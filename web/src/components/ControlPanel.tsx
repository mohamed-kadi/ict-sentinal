'use client';

import { useEffect, useMemo } from 'react';
import { TIMEFRAMES } from '@/lib/config';
import { useAppStore } from '@/state/useAppStore';

const ADVANCED_SETUP_VALUES = new Set(['Silver Bullet', 'Turtle Soup']);
const FALLBACK_SUPPORTED_SETUPS = [
  'Bias + OB/FVG + Session',
  'CHoCH + FVG + OTE',
  'PD Array (Discount)',
  'PD Array (Premium)',
  'Sweep + Shift',
  'Trend Pullback',
  'Kill Zone Liquidity Entry',
  'Asia Sweep Reversal',
  'Silver Bullet',
  'Turtle Soup',
  'Engulfing Shift',
  'Pullback Reentry',
] as const;
const MODEL_2022_SETUP = 'Model 2022 M15 FVG';

type ControlPanelProps = {
  supportedSetups?: string[];
};

export function ControlPanel({ supportedSetups = [] }: ControlPanelProps) {
  const {
    timeframe,
    overlays,
    backtest,
    selectedSetup,
    clearTrades,
    setTimeframe,
    setBacktest,
    toggleOverlay,
    setSelectedSetup,
    setAllOverlays,
    notificationsEnabled,
    waitForRetest,
    setWaitForRetest,
    toggleNotifications,
    toggleSidebar,
  } = useAppStore();
  const resolvedSupportedSetups = useMemo(
    () => uniqueSetups(supportedSetups.length ? supportedSetups : [...FALLBACK_SUPPORTED_SETUPS]),
    [supportedSetups],
  );
  const standardSetups = useMemo(
    () => resolvedSupportedSetups.filter((setup) => !ADVANCED_SETUP_VALUES.has(setup)),
    [resolvedSupportedSetups],
  );
  const advancedSetups = useMemo(
    () => resolvedSupportedSetups.filter((setup) => ADVANCED_SETUP_VALUES.has(setup)),
    [resolvedSupportedSetups],
  );
  const validSelections = useMemo(
    () => new Set(['all', 'advanced', MODEL_2022_SETUP, ...resolvedSupportedSetups]),
    [resolvedSupportedSetups],
  );

  useEffect(() => {
    if (!validSelections.has(selectedSetup)) {
      setSelectedSetup('all');
    }
  }, [selectedSetup, setSelectedSetup, validSelections]);

  return (
    <div className="flex h-full w-80 flex-col gap-2.5 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 text-sm text-zinc-200 shadow-2xl shadow-black/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-sm text-zinc-200">
            ☰
          </span>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Chart Layers</p>
          </div>
        </div>
        <button
          className="rounded px-2 py-1 text-xs text-zinc-300 transition hover:text-emerald-200"
          onClick={() => toggleSidebar()}
          aria-label="Close layers"
        >
          ✕
        </button>
      </div>
      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs uppercase text-zinc-500">Timeframe</p>
          <span className="text-[10px] uppercase tracking-wide text-zinc-600">Quick switch</span>
        </div>
        <div className="grid grid-cols-8 gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              className={[
                'flex h-7 min-w-0 items-center justify-center rounded-md border px-1 text-[10px] font-semibold leading-none transition',
                timeframe === tf
                  ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700',
              ].join(' ')}
              onClick={() => setTimeframe(tf)}
              title={`Switch to ${tf}`}
            >
              {tf}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between text-xs uppercase text-zinc-500">
          <span>Entry alerts</span>
          <label className="flex items-center gap-2 text-[11px] normal-case text-zinc-300">
            <input
              type="checkbox"
              className="accent-emerald-400"
              checked={notificationsEnabled}
              onChange={toggleNotifications}
            />
            <span>{notificationsEnabled ? 'On' : 'Off'}</span>
          </label>
        </div>
        <div className="mt-2 flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/70 px-2 py-2 text-[11px] text-zinc-300">
          <div>
            <div className="font-semibold uppercase tracking-wide text-zinc-400">Retest Mode</div>
            <div className="mt-0.5 text-[10px] text-zinc-500">Arm supported setups and wait for a later touch.</div>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-emerald-400"
              checked={waitForRetest}
              onChange={(e) => setWaitForRetest(e.target.checked)}
            />
            <span>{waitForRetest ? 'On' : 'Off'}</span>
          </label>
        </div>
        <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950/70 px-2 py-2 text-[10px] leading-relaxed text-zinc-400">
          <div>
            <span className="font-semibold text-zinc-300">Uses retest:</span> Bias + OB/FVG + Session, CHoCH + FVG +
            OTE, Model 2022 M15 FVG, Trend Pullback, Kill Zone Liquidity Entry, PD Array (Discount), PD Array
            (Premium).
          </div>
          <div className="mt-1">
            <span className="font-semibold text-zinc-300">Immediate entry:</span> Pullback Reentry, Sweep + Shift,
            Silver Bullet, Turtle Soup, and any setup not listed above.
          </div>
        </div>
        <div className="mt-2">
          <p className="mb-1 text-xs uppercase text-zinc-500">Setup</p>
          <select
            className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs"
            value={selectedSetup}
            onChange={(e) => setSelectedSetup(e.target.value)}
          >
            <option value="all">All</option>
            {standardSetups.map((setup) => (
              <option key={setup} value={setup}>
                {setup}
              </option>
            ))}
            <option value={MODEL_2022_SETUP}>Model 2022 (M15 FVG)</option>
            {advancedSetups.length > 0 && (
              <optgroup label="Advanced ICT">
                <option value="advanced">Advanced ICT (All)</option>
                {advancedSetups.map((setup) => (
                  <option key={setup} value={setup}>
                    {setup}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between text-xs uppercase text-zinc-500">
          <p>ICT overlays</p>
          <div className="flex items-center gap-2">
            <button
              className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-300 hover:border-emerald-500/60 hover:text-emerald-200"
              onClick={() => setAllOverlays(false)}
            >
              Clear
            </button>
            <button
              className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-300 hover:border-emerald-500/60 hover:text-emerald-200"
              onClick={() => setAllOverlays(true)}
            >
              All
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {Object.entries(overlays).map(([key, value]) => (
            <button
              key={key}
              type="button"
              aria-pressed={value}
              className={[
                'flex min-h-14 flex-col items-start justify-between rounded-lg border px-2 py-1.5 text-left text-[10px] transition',
                value
                  ? 'border-emerald-500/35 bg-emerald-500/8 text-emerald-100'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700',
              ].join(' ')}
              onClick={() => toggleOverlay(key as any)}
            >
              <span className="line-clamp-2 leading-tight">{labelFor(key)}</span>
              <span
                className={[
                  'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                  value ? 'bg-emerald-500/15 text-emerald-200' : 'bg-zinc-800 text-zinc-500',
                ].join(' ')}
              >
                {value ? 'On' : 'Off'}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
          <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-zinc-500">
            <span>Replay</span>
            <span
              className={[
                'rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                backtest.enabled ? 'bg-emerald-500/15 text-emerald-200' : 'bg-zinc-800 text-zinc-500',
              ].join(' ')}
            >
              {backtest.enabled ? 'On' : 'Off'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={controlBtn(backtest.enabled)}
              onClick={() =>
                setBacktest({
                  enabled: !backtest.enabled,
                  playing: false,
                })
              }
            >
              {backtest.enabled ? 'Disable' : 'Enable'}
            </button>
            <button
              type="button"
              className={controlBtn(false)}
              onClick={() => {
                clearTrades();
                setBacktest({ cursor: 0, playing: false });
              }}
              disabled={!backtest.enabled && backtest.cursor === 0 && backtest.trades.length === 0}
            >
              Reset
            </button>
            <button
              type="button"
              className={controlBtn(backtest.playing)}
              onClick={() => setBacktest({ playing: !backtest.playing })}
              disabled={!backtest.enabled}
            >
              {backtest.playing ? 'Pause' : 'Play'}
            </button>
            <div className="flex items-center justify-end gap-1">
              {[0.5, 1, 2, 5].map((speed) => (
                <button
                  key={speed}
                  type="button"
                  className={speedChip(backtest.speed === speed)}
                  onClick={() => setBacktest({ speed })}
                  disabled={!backtest.enabled}
                >
                  {speed}x
                </button>
              ))}
            </div>
            <button
              type="button"
              className={controlBtn(false)}
              onClick={() => setBacktest({ cursor: Math.max(0, backtest.cursor - 1), playing: false })}
              disabled={!backtest.enabled || backtest.cursor <= 0}
            >
              Step -1
            </button>
            <button
              type="button"
              className={controlBtn(false)}
              onClick={() => setBacktest({ cursor: backtest.cursor + 1, playing: false })}
              disabled={!backtest.enabled}
            >
              Step +1
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function controlBtn(active: boolean) {
  return [
    'rounded border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-50',
    active
      ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
      : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100',
  ].join(' ');
}

function speedChip(active: boolean) {
  return [
    'rounded border px-1.5 py-1 text-[9px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
    active
      ? 'border-sky-500/60 bg-sky-500/10 text-sky-200'
      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
  ].join(' ');
}

function labelFor(key: string) {
  switch (key) {
    case 'liquidity':
      return 'Liquidity';
    case 'fvg':
      return 'FVG';
    case 'orderBlocks':
      return 'Order Blocks';
    case 'sessions':
      return 'Sessions';
    case 'killzones':
      return 'Killzones';
    case 'signals':
      return 'Signals';
    case 'sweeps':
      return 'Sweeps';
    case 'breakers':
      return 'Breakers';
    case 'oteBands':
      return 'OTE';
    case 'pdZones':
      return 'PD Zones';
    case 'inversionFvgSignals':
      return 'Inv FVG';
    case 'tradeMarkers':
      return 'Trades';
    case 'structureSegments':
      return 'BOS/CHoCH';
    case 'eqConnectors':
      return 'EQ Connect';
    default:
      return key;
  }
}

function uniqueSetups(setups: readonly string[]) {
  return Array.from(new Set(setups.filter(Boolean)));
}

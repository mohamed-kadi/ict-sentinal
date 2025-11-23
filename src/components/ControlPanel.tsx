'use client';

import { CRYPTO_SYMBOLS, FOREX_SYMBOLS, STOCK_SYMBOLS, TIMEFRAMES } from '@/lib/config';
import { useAppStore } from '@/state/useAppStore';

export function ControlPanel() {
  const {
    assetClass,
    symbol,
    timeframe,
    overlays,
    selectedSetup,
    setSymbol,
    setTimeframe,
    toggleOverlay,
    setSelectedSetup,
    backtest,
    setBacktest,
    setAllOverlays,
    notificationsEnabled,
    toggleNotifications,
  } = useAppStore();

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-4 border-r border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-200">
      <section>
        <p className="mb-1 text-xs uppercase text-zinc-500">Timeframe</p>
        <div className="flex flex-wrap gap-2">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              className={[
                'flex h-8 w-8 items-center justify-center rounded-full border text-[11px] font-semibold transition',
                timeframe === tf
                  ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700',
              ].join(' ')}
              onClick={() => setTimeframe(tf)}
            >
              {tf}
            </button>
          ))}
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
        <div className="flex flex-col gap-2">
          {Object.entries(overlays).map(([key, value]) => (
            <label key={key} className="flex items-center justify-between gap-2">
              <span className="capitalize">{labelFor(key)}</span>
              <input
                type="checkbox"
                className="accent-emerald-400"
                checked={value}
                onChange={() => toggleOverlay(key as any)}
              />
            </label>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between text-xs uppercase text-zinc-500">
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
        <div className="mt-3">
          <p className="mb-1 text-xs uppercase text-zinc-500">Setup</p>
          <select
            className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs"
            value={selectedSetup}
            onChange={(e) => setSelectedSetup(e.target.value)}
          >
            <option value="all">All</option>
            <option value="Bias + OB/FVG + Session">Bias + OB/FVG + Session</option>
            <option value="CHoCH + FVG + OTE">CHoCH + FVG + OTE</option>
            <option value="Sweep + Shift">Sweep + Shift</option>
            <option value="Breaker Retest">Breaker Retest</option>
            <option value="Sweep + CHoCH">Sweep + CHoCH</option>
            <option value="Breaker + FVG">Breaker + FVG</option>
            <option value="Breaker + CHoCH">Breaker + CHoCH</option>
            <option value="PD Array (Discount)">PD Array Discount</option>
            <option value="PD Array (Premium)">PD Array Premium</option>
            <option value="FVG Fill Rejection">FVG Fill Rejection</option>
            <option value="Breaker + Sweep">Breaker + Sweep</option>
            <option value="Judas Swing">Judas Swing</option>
            <option value="Liquidity Void Return">Liquidity Void Return</option>
            <option value="Asian Range Breakout">Asian Range Breakout</option>
            <optgroup label="Advanced ICT">
              <option value="advanced">Advanced ICT (All)</option>
              <option value="Silver Bullet">Silver Bullet</option>
              <option value="Turtle Soup">Turtle Soup</option>
            </optgroup>
          </select>
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs uppercase text-zinc-500">Backtest</p>
        <div className="flex items-center justify-between">
          <span>Enable</span>
          <input
            type="checkbox"
            className="accent-emerald-400"
            checked={backtest.enabled}
            onChange={() => setBacktest({ enabled: !backtest.enabled })}
          />
        </div>
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span>Speed</span>
            <span className="text-zinc-500">{backtest.speed.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={10}
            step={0.05}
            value={backtest.speed}
            onChange={(e) => setBacktest({ speed: Number(e.target.value) })}
            className="w-full accent-emerald-400"
          />
          <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
            {[0.1, 0.25, 0.5, 1, 2, 5, 10].map((v) => (
              <button
                key={v}
                className={`rounded px-1 py-0.5 ${backtest.speed === v ? 'bg-emerald-500/20 text-emerald-200' : 'hover:text-emerald-200'}`}
                onClick={() => setBacktest({ speed: v })}
              >
                {v}x
              </button>
            ))}
          </div>
        </div>
      </section>
    </aside>
  );
}

function buttonClass(active: boolean) {
  return [
    'rounded border px-3 py-1 text-xs font-semibold transition',
    active
      ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
      : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700',
  ].join(' ');
}

function labelFor(key: string) {
  switch (key) {
    case 'liquidity':
      return 'Liquidity/Swing Highs-Lows';
    case 'fvg':
      return 'Fair Value Gaps';
    case 'orderBlocks':
      return 'Order Blocks';
    case 'sessions':
      return 'Kill Zones';
    case 'killzones':
      return 'Kill Zone Shading';
    case 'signals':
      return 'Signals';
    case 'sweeps':
      return 'EQH/EQL Sweeps';
    case 'breakers':
      return 'Breaker Blocks';
    case 'oteBands':
      return 'OTE Bands';
    case 'inversionFvgSignals':
      return 'Inversion FVG signals';
    case 'tradeMarkers':
      return 'Trade markers';
    default:
      return key;
  }
}

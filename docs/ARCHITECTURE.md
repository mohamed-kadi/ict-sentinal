# Architecture Overview

## Runtime Flow
1) UI renders `Dashboard` (client component) → subscribes to app store (symbol, timeframe, overlays, backtest).
2) `useCandles` fetches OHLC via app routes (`/api/crypto/klines`, `/api/forex/klines`, or `/api/stocks/klines`), cached by React Query.
3) ICT computations (`src/lib/ict.ts`) derive bias, swings, FVGs, order blocks, and signals from the scoped candle window (live or backtest cursor).
4) `ChartPanel` renders candles + overlays via Lightweight Charts and markers plugin; `InsightPanel` lists derived stats; `BacktestControls` updates the cursor.

## Client Composition
- `src/components/Dashboard.tsx`: layout shell, orchestrates data + derived overlays, renders chart + insights + controls.
- `ChartPanel`: lazy-loads Lightweight Charts, sets candlestick series, draws price lines for FVG/OB, and markers for swings/signals.
- `ControlPanel`: user inputs (asset class, symbol, timeframe, overlay toggles, backtest switch).
- `BacktestControls`: play/pause/step and speed, guarded by store.
- `InsightPanel`: textual summary of bias, counts, and latest signals.
- `TopBar`: headline info (current symbol/timeframe/bias).

## State & Data
- Global UI/backtest state: `src/state/useAppStore.ts` (Zustand). Shape includes `assetClass`, `symbol`, `timeframe`, `overlays`, `backtest.enabled/cursor/speed`.
- Server data: React Query keyed by `[assetClass, symbol, timeframe]`. Backtest cursor simply slices the array client-side.

## API Layer
- `src/app/api/crypto/klines/route.ts`: Binance REST proxy; supports `symbol`, `interval`, `limit`, optional `startTime/endTime`.
- `src/app/api/forex/klines/route.ts`: Twelve Data primary, Alpha Vantage fallback.
- `src/app/api/stocks/klines/route.ts`: Yahoo Finance route for equities and `US100`, with mock fallback.
- Both return normalized candles `{ t, o, h, l, c, v }` in epoch ms for chart compatibility.

## ICT Logic Highlights (`src/lib/ict.ts`)
- `computeBias`: compares current vs previous day ranges, open/close positioning, and sweep conditions.
- `detectSwings`: rolling extrema with lookback window.
- `detectFVG`: three-candle gap checks (bullish/bearish).
- `detectOrderBlocks`: simple displacement check vs prior window.
- `detectSignals`: session-aware, bias-conditioned triggers when candles tap OB/FVG zones.

## Extensibility Hooks
- Overlay algorithms: strengthen in `src/lib/ict.ts`; results flow through `Dashboard` → `ChartPanel`.
- Data sources: add new app routes and wire them in `useCandles` for other venues.
- Chart primitives: add new price/area series or primitives in `ChartPanel` without touching store logic.

## Known Constraints
- REST candles cap at provided exchange intervals (Binance min 1m). Sub-minute accuracy requires websocket aggregation.
- Backtest is client-only; no persistence or multi-session playback yet.

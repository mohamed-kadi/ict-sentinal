# ICT Trading Desk (Next.js)

Desktop-first single-page ICT trading view with live/public data only. It overlays bias, liquidity, fair value gaps, order blocks, and simple rule-based signals on top of lightweight-charts, with a backtest/replay switch.

## Quick start
1) Install deps: `npm install`
2) Run dev server: `npm run dev` then open `http://localhost:3000`
3) (Optional) create a `.env.local` (never committed) if you want forex data beyond the free defaults (gold uses Binance PAXG -> XAUUSD out of the box):
```
TWELVE_DATA_KEY=your_key   # preferred
# or
ALPHA_VANTAGE_KEY=your_key
```
4) (Optional) Drop reproducible candle data into `public/backtest-sample.json` (same structure as the sample file) when you need to share exact backtests.
5) Lint/fix CI rules locally via `npm run lint` (Next.js 16 requires Node ≥20.9).
6) (Optional) Set `NEXT_PUBLIC_ALERT_WEBHOOK` in `.env.local` to relay entry alerts to your own webhook/broker bridge.

## Documentation
- Technical guide: `docs/TECHNICAL.md`
- Architecture overview: `docs/ARCHITECTURE.md`
- User manual: `docs/USER_MANUAL.md`

## Stack
- Next.js 13 (app router, TypeScript, Tailwind)
- React Query for data fetch/cache, Zustand for UI/backtest state
- Lightweight Charts for OHLC + markers
- API routes:
  - `/api/crypto/klines` → Binance public OHLC (no key)
  - `/api/forex/klines` → Binance (PAXGUSDT mapped to XAUUSD), otherwise TwelveData (free key) or Alpha Vantage, then Yahoo fallback
  - `/api/trade-memory` → local JSON persistence for trade outcomes (feeds the optimization filters shown on the chart)

## Features in this cut
- Symbol/timeframe selector (BTC/ETH/SOL/XRP + EURUSD/GBPUSD/USDJPY/XAUUSD; 1m→1D).
- ICT overlays: swings/liquidity, FVG detection, heuristic order blocks, session windows, daily bias, rule-based buy/sell markers. The overlay drawer now includes toggles for inversion-FVG signals and trade markers so you can declutter the main chart when needed.
- Entry alerts: React to the same feed used by auto-trade/backtest. When Backtest is off, alerts display the latest real-time setup, and the chart header shows the timestamp of the last alert so you instantly know if signals are flowing.
- Backtest mode: scrubs through loaded history with play/pause/step and speed control. Auto-trade controls let you replay any percentage slice of history (0–100 by default) and optional partial scaling logic feeds the paper-trade ledger automatically.
- History paging: use the “Load older history” button above the chart to fetch additional cached bars (stitching older slices together without losing your current view).
- Alert diagnostics: if alerts pause (e.g., backtest playback) or data stalls, the chart badge and console log explain why, so you immediately know whether to expect new signals. You can also point `NEXT_PUBLIC_ALERT_WEBHOOK` at a custom endpoint to mirror every alert (useful for broker/webhook integration tests).
- Blueprint magnet: movable, resizable mini-window that shows the active candle blueprint (date, time, OHLC range) and serves as the docking point for upcoming order-book/footprint data without covering the main chart.
- Insight panel showing counts and latest setups, plus live paper-trade stats with manual trade validation and chart markers (BUY/SELL) for both manual and auto trades.
- Manual trading flow: right-click to queue a buy/sell limit (`(P)` planned). Orders auto-activate once entry trades, and every trade marker carries a status suffix (`(T)` taken, `(W)` win, `(L)` loss, `(C)` canceled/breakeven). Planned trades can be canceled or manually closed early, and outcomes are persisted to `ict_trade_memory.json`.

## Next steps to harden
- Draw true shaded zones for FVG/OB + session backgrounds.
- Add paging/stitching for deeper history, plus caching.
- Surface live alert diagnostics in the UI (e.g., toast when alerts pause because a provider is stale).
- Strengthen ICT heuristics (multi-timeframe bias, BOS/CHoCH checks) and parameter controls; add broker/webhook connectors once the alert feed is hardened.

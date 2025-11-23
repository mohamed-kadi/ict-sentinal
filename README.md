# ICT Trading Desk (Next.js)

Desktop-first single-page ICT trading view with live/public data only. It overlays bias, liquidity, fair value gaps, order blocks, and simple rule-based signals on top of lightweight-charts, with a backtest/replay switch.

## Quick start
1) Install deps: `npm install`
2) Run dev server: `npm run dev` then open `http://localhost:3000`
3) (Optional) Env vars for forex/gold in `.env.local`:
```
TWELVE_DATA_KEY=your_key   # preferred
# or
ALPHA_VANTAGE_KEY=your_key
```
4) (Optional) Drop reproducible candle data into `public/backtest-sample.json` (same structure as the sample file) when you need to share exact backtests.

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
  - `/api/forex/klines` → TwelveData (free key) or Alpha Vantage fallback

## Features in this cut
- Symbol/timeframe selector (BTC/ETH/SOL/XRP + EURUSD/GBPUSD/USDJPY/XAUUSD; 1m→1D).
- ICT overlays: swings/liquidity, FVG detection, heuristic order blocks, session windows, daily bias, rule-based buy/sell markers. The overlay drawer now includes toggles for inversion-FVG signals and trade markers so you can declutter the main chart when needed.
- Backtest mode: scrubs through loaded history with play/pause/step and speed control. Auto-trade controls let you replay any percentage slice of history (0–100 by default) and optional partial scaling logic feeds the paper-trade ledger automatically.
- Blueprint magnet: movable, resizable mini-window that shows the active candle blueprint (date, time, OHLC range) and serves as the docking point for upcoming order-book/footprint data without covering the main chart.
- Insight panel showing counts and latest setups, plus live paper-trade stats with manual trade validation and chart markers (BUY/SELL) for both manual and auto trades.

## Next steps to harden
- Draw true shaded zones for FVG/OB + session backgrounds.
- Add paging/stitching for deeper history, plus caching.
- Hook manual trade marking and R-multiple stats in backtest state.
- Strengthen ICT heuristics (multi-timeframe bias, BOS/CHoCH checks) and parameter controls.

# Technical Guide

## Stack & Tooling
- Next.js 13 (app router) + React 18 + TypeScript, Tailwind for styling.
- Data fetch/cache: React Query (`src/app/providers.tsx` bootstraps a `QueryClient`).
- Client state: Zustand store (`src/state/useAppStore.ts`) holds symbol, timeframe, overlays, and backtest controls.
- Charting: TradingView Lightweight Charts v5 (`src/components/ChartPanel.tsx`) with markers plugin for ICT overlays.

## Data Sources & API
- Crypto OHLC: `/api/crypto/klines` (Binance REST `api/v3/klines`). No auth required.
- Forex/metal OHLC: `/api/forex/klines` (prefers Twelve Data, falls back to Alpha Vantage). Requires `TWELVE_DATA_KEY` or `ALPHA_VANTAGE_KEY`.
- Stock/index OHLC: `/api/stocks/klines` (Yahoo Finance primary, mock fallback). `US100` is mapped to Nasdaq-100 market data.
- Requests are proxied through app routes to keep the frontend simple and allow caching/throttling.

## Key Modules
- UI composition: `src/components/Dashboard.tsx` wires data + overlays + backtest controls.
- ICT logic: `src/lib/ict.ts` (bias, swings, fair value gaps, order blocks, rule-based signals).
- Helpers: `src/lib/utils.ts` (grouping, stats), `src/lib/config.ts` (symbols, timeframes, sessions).
- Data fetching: `src/hooks/useCandles.ts` chooses the right API route based on asset class.

## Running & Building
- Install: `npm install`
- Dev: `npm run dev`
- Lint/typecheck: `npm run lint`, `npx tsc --noEmit`
- Build: `npm run build` then `npm start`
- Required Node: `24.15.0` LTS for this repo. Next.js 16 requires at least `20.9.0`, but Node 20 is already EOL, so this project is pinned to the current 24.x LTS line.
- Sidebar toggle: use the left-edge handle to collapse/expand the control panel; the right insight panel stays visible.
- Insight panel highlights the current asset (symbol, price, % move, market-open status, and data source badge from candle API responses).
- Chart overlay includes drawing tools (horizontal line, trendline, rectangle) with a compact toolbar on the chart; drawings live only for the current session.

## Environment
Create `.env.local` for optional keys:
```
TWELVE_DATA_KEY=your_key
ALPHA_VANTAGE_KEY=your_key
```

## Performance & Caching Notes
- React Query caches candle responses per symbol/timeframe; `staleTime` is 10s and window refetching is off to avoid needless hits.
- API layer uses Next revalidation hints; switch to `cache: 'no-store'` in fetch calls if you need stricter real-time behavior.

## Testing Ideas
- Add unit coverage for `src/lib/ict.ts` functions (bias, gaps, signals) with synthetic candle sets.
- Add integration tests against mocked API routes for backtest cursor behavior and overlay toggles.

## Project Tree (key files)
```
ict-trading-desk/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── TECHNICAL.md
│   └── USER_MANUAL.md
├── web/
│   ├── .env.local
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.js
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── crypto/klines/route.ts
│   │   │   │   └── forex/klines/route.ts
│   │   │   ├── globals.css
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   └── providers.tsx
│   │   ├── components/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── ChartPanel.tsx
│   │   │   ├── ControlPanel.tsx
│   │   │   ├── InsightPanel.tsx
│   │   │   ├── BacktestControls.tsx
│   │   │   ├── TopBar.tsx
│   │   │   └── TradePanel.tsx
│   │   ├── hooks/useCandles.ts
│   │   ├── lib/
│   │   │   ├── config.ts
│   │   │   ├── ict.ts
│   │   │   ├── types.ts
│   │   │   └── utils.ts
│   │   └── state/useAppStore.ts
│   └── public/
│       └── ...
└── README.md
```

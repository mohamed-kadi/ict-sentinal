# ICT Trading Desk Frontend

Next.js 16 frontend for the ICT Trading Desk workstation.

This app fetches public market data, renders the charting UI, manages replay/backtest state, and calls the Spring Boot backend for server-side ICT analysis and trade journaling.

## What this app does
- Fetches crypto candles from `/api/crypto/klines` and patches the latest crypto candle from the Binance websocket stream.
- Fetches forex and gold candles from `/api/forex/klines` using Twelve Data, Alpha Vantage, Yahoo, or mock fallback data.
- Fetches stocks and the `US100` index proxy from `/api/stocks/klines` using Yahoo Finance, with mock fallback if the provider fails.
- Sends candle windows to the backend analysis API when `NEXT_PUBLIC_BACKEND_BASE_URL` is configured.
- Renders overlays, drawing tools, replay controls, alert relays, and paper/manual trade tracking.

## Run locally

Install dependencies:

```bash
cd web
PATH="$(pwd)/.tools/node/current/bin:$PATH" npm install
```

Start the dev server:

```bash
cd web
npm run dev
```

Open `http://localhost:3000`.

## Frontend structure
- `src/app/`: Next.js app shell and server routes used to normalize market data.
- `src/components/`: dashboard, chart, controls, status panels, and journaling UI.
- `src/hooks/`: React Query and orchestration hooks for candles and backend analysis.
- `src/lib/`: shared frontend utilities, DTOs, backend URL helpers, sessions, and scanner logic.
- `src/state/`: Zustand store for workspace state, overlays, replay mode, and preferences.
- `scripts/`: frontend-only utility scripts and fixtures that should not live in `public/`.

## Environment

Create `web/.env.local` when needed:

```env
NEXT_PUBLIC_BACKEND_BASE_URL=http://localhost:8080
TWELVE_DATA_KEY=your_key
ALPHA_VANTAGE_KEY=your_key
NEXT_PUBLIC_ALERT_WEBHOOK=https://your-endpoint.example/webhook
NEXT_PUBLIC_DEBUG_SIGNALS=false
```

Notes:
- `NEXT_PUBLIC_BACKEND_BASE_URL` enables backend-driven signal analysis and trade journaling.
- Without that backend URL, the chart can still load candles, but server-side analysis hooks stay disabled.
- `TWELVE_DATA_KEY` is preferred for forex coverage. If both paid/free providers fail, the route falls back to Yahoo or mock candles.

## Stack
- Next.js 16.2.6
- React 18
- TypeScript
- Tailwind CSS
- React Query
- Zustand
- Lightweight Charts

## Node runtime

This app is pinned to Node `22.21.1` in `web/.nvmrc` and `web/.node-version`. It also supports a repo-local Node toolchain in `web/.tools/node/current`.

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run typecheck`
- `npm run analyze:sample`
- `npm run capture:fixture -- --assetClass crypto --symbol BTCUSDT --timeframe 15m --limit 300`
- `npm run debug:env`

all prepend that local Node binary automatically, so they do not depend on your global `node` path.

`npm run analyze:sample` posts the static regression fixture in `scripts/fixtures/backtest-sample.json` to the backend analysis API.
`npm run capture:fixture` saves a fresh normalized market snapshot from the local Next.js API routes into `scripts/fixtures/`.

## Verification

```bash
cd web
npm run lint
npm run typecheck
```

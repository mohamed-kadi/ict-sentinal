# ICTCrakr Web

Next.js 16 frontend for the ICTCrakr trading desk.

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
npm install
```

Start the dev server:

```bash
cd web
npm run dev
```

Open `http://localhost:3000`.

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

## Verification

```bash
cd web
npm run lint
npm run typecheck
```

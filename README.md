<p align="center">
  <img src="web/public/ict-trading-desk-logo.png" alt="ICT Trading Desk logo" width="180" />
</p>

<h1 align="center">ICT Trading Desk</h1>

<p align="center">
  <strong>ICT trading workflow studio for chart replay, structure detection, and trade journaling.</strong>
</p>

<p align="center">
  ICT Trading Desk helps traders inspect liquidity, fair value gaps, order blocks, structure shifts, and replay-driven setups
  across crypto, forex, metals, and stocks with a Next.js workstation backed by a Spring Boot analysis API.
</p>

<p align="center">
  <a href="#how-to-run-the-project">
    <img alt="Demo Localhost 3000" src="https://img.shields.io/badge/demo-localhost%3A3000-2563eb?style=for-the-badge&labelColor=4b5563" />
  </a>
  <img alt="Backend Spring Boot 3.3" src="https://img.shields.io/badge/backend-Spring_Boot_3.3-0f766e?style=for-the-badge&labelColor=4b5563&logo=springboot&logoColor=white" />
  <img alt="Frontend Next.js 16 and React 18" src="https://img.shields.io/badge/frontend-Next.js_16_%2B_React_18-7c3aed?style=for-the-badge&labelColor=4b5563&logo=react&logoColor=white" />
</p>

<p align="center">
  <img alt="TypeScript 5" src="https://img.shields.io/badge/typescript-5-3178c6?style=for-the-badge&labelColor=4b5563&logo=typescript&logoColor=white" />
  <img alt="Java 17" src="https://img.shields.io/badge/java-17-2563eb?style=for-the-badge&labelColor=4b5563&logo=openjdk&logoColor=white" />
  <img alt="Data H2 and PostgreSQL" src="https://img.shields.io/badge/data-H2_%7C_PostgreSQL-ea580c?style=for-the-badge&labelColor=4b5563&logo=postgresql&logoColor=white" />
</p>

<p align="center">
  <a href="#how-to-run-the-project">Quick Start</a> |
  <a href="#exact-project-scope">Scope</a> |
  <a href="#current-data-support">Data Support</a> |
  <a href="#main-backend-endpoints">API</a> |
  <a href="#documentation">Docs</a>
</p>

ICT Trading Desk combines a Next.js charting workstation with a Spring Boot analysis API.

The `web/` app fetches public OHLC candles, renders the charting and replay UI, and sends candle windows to the `backend/` API. The Spring Boot backend performs the server-side ICT analysis, returns derived structures and trade setups, stores completed trades, and calculates setup performance weights that can be reused by the signal engine.

This project is currently an analysis, replay, and journaling tool. It is not a live broker execution service.

## Exact project scope
- `web/`: Next.js 16 dashboard with Lightweight Charts, React Query, Zustand state, overlays, replay/backtest controls, drawing tools, alert relays, and paper/manual trade tracking.
- `backend/`: Spring Boot 3.3 API for ICT signal analysis and trade journaling.
- Server-side analysis currently returns daily bias, swings, fair value gaps, order blocks, BOS/CHoCH structure shifts, liquidity sweeps, equal highs/lows, breaker blocks, premium/discount range, HTF reference levels, and Model 2022 state/signals.
- Completed trades can be posted to the backend and aggregated into per-setup performance statistics and sizing multipliers.

## Current data support
- Crypto candles: Binance REST through `web/src/app/api/crypto/klines/route.ts`, with Binance websocket updates for the latest live candle.
- Forex and gold candles: Twelve Data first, Alpha Vantage second, Yahoo fallback, then mock candles if every provider fails.
- Stocks and index proxies: dedicated `web/src/app/api/stocks/klines/route.ts`, backed by Yahoo Finance with mock fallback. `US100` is mapped to the Nasdaq-100 index feed.

## Project structure
- `web/`: Next.js frontend, market-data proxy routes, charting UI, and frontend-only utilities.
- `backend/`: Spring Boot API, Flyway migration, JPA persistence, and backend tests.
- `docs/`: shared architecture, technical, repository, and user-facing documentation.
- `ops/`: reserved home for deployment, infrastructure, and environment automation artifacts.

## Documentation
- [Repository Guide](docs/REPOSITORY.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Technical Guide](docs/TECHNICAL.md)
- [User Manual](docs/USER_MANUAL.md)

## Prerequisites
- Java 17 for the backend build.
- Maven 3.9+.
- Node `22.21.1` for the frontend. The version is pinned in `web/.nvmrc` and `web/.node-version`.

## How to run the project

Run the backend in one terminal:

```bash
cd backend
export ICTCRAKR_FRONTEND_ORIGIN=http://localhost:3000
mvn spring-boot:run
```

Backend defaults:
- Base URL: `http://localhost:8080`
- Database: local H2 file database at `backend/data/ictcrakr`
- CORS origin: `http://localhost:3000`

Optional PostgreSQL override for the backend:

```bash
cd backend
export ICTCRAKR_FRONTEND_ORIGIN=http://localhost:3000
export ICTCRAKR_DB_URL=jdbc:postgresql://localhost:5432/ictcrakr
export ICTCRAKR_DB_USERNAME=postgres
export ICTCRAKR_DB_PASSWORD=postgres
mvn spring-boot:run
```

Run the frontend in a second terminal:

```bash
cd web
PATH="$(pwd)/.tools/node/current/bin:$PATH" npm install
npm run dev
```

Open `http://localhost:3000`.

## Frontend environment

Create `web/.env.local` when you need backend integration or market-data keys:

```env
NEXT_PUBLIC_BACKEND_BASE_URL=http://localhost:8080
TWELVE_DATA_KEY=your_key
ALPHA_VANTAGE_KEY=your_key
NEXT_PUBLIC_ALERT_WEBHOOK=https://your-endpoint.example/webhook
NEXT_PUBLIC_DEBUG_SIGNALS=false
```

Notes:
- `NEXT_PUBLIC_BACKEND_BASE_URL` is required for server-side signal analysis and trade journaling from the UI.
- Without the backend URL, the chart can still load candle data, but backend-derived analysis will not run.
- Forex and gold can still work without API keys because the route falls back to Yahoo or mock candles.

## Main backend endpoints
- `POST /api/v1/analysis/signals`
- `POST /api/v1/trades`
- `GET /api/v1/trades/performance`

## Useful commands

Backend:

```bash
cd backend
mvn test
```

Frontend:

```bash
cd web
npm run lint
npm run typecheck
```

Optional frontend utility commands:

```bash
cd web
npm run analyze:sample
npm run debug:env
```

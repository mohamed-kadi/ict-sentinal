# Architecture Overview

## Monorepo Boundaries
- `web/`: Next.js application that owns market-data proxy routes, the dashboard UI, replay controls, and frontend state.
- `backend/`: Spring Boot service that owns ICT signal analysis, trade journaling, and performance weighting.
- `docs/`: shared documentation for contributors and operators.
- `ops/`: reserved location for future deployment and infrastructure assets.

## Runtime Flow
1. `web/src/components/Dashboard.tsx` orchestrates the active symbol, timeframe, overlays, replay state, and runtime notices.
2. `useCandles` in `web/src/hooks/useCandles.ts` pulls normalized candles from the Next.js server routes:
   - `/api/crypto/klines`
   - `/api/forex/klines`
   - `/api/stocks/klines`
3. Those routes normalize third-party provider payloads into the shared candle shape `{ t, o, h, l, c, v }`.
4. `useSignalAnalysis` posts the scoped candle window to `backend /api/v1/analysis/signals` when `NEXT_PUBLIC_BACKEND_BASE_URL` is configured.
5. `backend/src/main/java/com/ictcrakr/backend/analysis/service/SignalAnalysisService.java` computes bias, structure, gaps, order blocks, sweeps, Model 2022 data, and trade setups.
6. The frontend renders that response through:
   - `ChartPanel` for overlays and drawings
   - `InsightPanel` for recent signals
   - `TradePanel` for journaling and performance context
   - `InfoDrawer` and `RuntimeStatusPanel` for diagnostics

## Frontend Composition
- `web/src/app/`: app shell and route handlers.
- `web/src/components/`: visual workspace, chart, side panels, and journaling UI.
- `web/src/hooks/`: data-fetching and backend-analysis hooks.
- `web/src/lib/`: frontend utilities, DTOs, URL helpers, alert connectors, and session logic.
- `web/src/state/`: Zustand store for the workspace state.
- `web/scripts/`: frontend-only scripts and fixtures that should not ship as public assets.

## Backend Composition
- `backend/.../analysis/api/`: request/response DTOs and analysis controller.
- `backend/.../analysis/service/`: server-side ICT analysis engine.
- `backend/.../trading/api/`: trade journal and performance endpoints.
- `backend/.../trading/service/`: journaling and setup-performance aggregation.
- `backend/.../trading/domain/` and `repository/`: persistence model and JPA access.
- `backend/src/main/resources/db/migration/`: Flyway database migrations.

## Ownership Rules
- Frontend owns provider normalization, replay UX, chart rendering, and client-side diagnostics.
- Backend owns the canonical signal-analysis engine and trade-performance weighting.
- Shared docs should describe boundaries and workflows, not duplicate source code.

## Extension Points
- Add market data providers under `web/src/app/api/`.
- Add new frontend dashboards or controls under `web/src/components/`.
- Add backend analysis endpoints under `backend/.../analysis/api/` and matching services under `analysis/service/`.
- Add deployment and infrastructure material under `ops/` once the project formalizes containers, CI/CD, or IaC.

## Current Constraints
- Crypto uses REST candles plus a Binance websocket patch for the live candle.
- Replay/backtest is a client-side slice of the loaded candle history.
- The backend analysis is heuristic-based and should be validated with targeted fixtures as it evolves.

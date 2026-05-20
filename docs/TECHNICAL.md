# Technical Guide

## Stack & Tooling
- Frontend: Next.js 16.2.6, React 18, TypeScript, Tailwind CSS, React Query, Zustand, Lightweight Charts.
- Backend: Spring Boot 3.3.5, Java 17, Spring Web, Spring Data JPA, Flyway, H2/PostgreSQL.
- Repo conventions: `.editorconfig` at the root, repo-wide ignores in root `.gitignore`, and service-specific docs inside each top-level app directory.

## Repository Layout
- `web/`: browser-facing application and market-data proxy layer.
- `backend/`: API and persistence layer.
- `docs/`: contributor-facing documentation.
- `ops/`: future home for deployment and infrastructure assets.

## Frontend Code Map
- `web/src/app/`: app shell and market-data route handlers.
- `web/src/components/`: UI composition and rendering.
- `web/src/hooks/`: data fetching and backend-analysis query hooks.
- `web/src/lib/`:
  - `backend.ts`: backend base URL helpers
  - `config.ts`: symbols, timeframes, and UI-facing config
  - `signalAnalysis.ts`: backend request layer
  - `tradePerformance.ts`: journaling/performance helpers
  - `sessions.ts`, `time.ts`, `utils.ts`, `types.ts`: shared frontend utilities
  - `ictScanner.ts`: client-side confidence scoring on top of backend output
- `web/src/state/`: Zustand workspace state.
- `web/scripts/`: utility scripts and fixtures kept out of shipped frontend assets.

## Execution Modes
- Immediate-entry mode: a fresh signal opens a paper trade as soon as the signal candle qualifies.
- Retest mode: a fresh signal creates an armed `planned` trade first; the trade only becomes `active` if a later candle revisits the entry before expiry.

Retest mode wiring:
- UI toggle: `web/src/components/ControlPanel.tsx`
- Persisted preference: `waitForRetest` in `web/src/state/useAppStore.ts`
- Execution policy: `RETEST_CAPABLE_SETUPS` and planned-trade activation in `web/src/components/ChartPanel.tsx`

Current retest-enabled setups:
- `Bias + OB/FVG + Session`
- `CHoCH + FVG + OTE`
- `Model 2022 M15 FVG`
- `Trend Pullback`
- `Kill Zone Liquidity Entry`
- `PD Array (Discount)`
- `PD Array (Premium)`

Current immediate-entry opt-outs:
- `Pullback Reentry`
- `Sweep + Shift`
- `Silver Bullet`
- `Turtle Soup`
- Any setup not explicitly present in `RETEST_CAPABLE_SETUPS`

Maintenance rule:
- When adding or renaming a setup, explicitly decide whether it belongs in `RETEST_CAPABLE_SETUPS`. If not, it stays on immediate-entry behavior by default.

## Backend Code Map
- `backend/.../analysis/api/`: analysis request/response contracts and controller.
- `backend/.../analysis/service/`: server-side analysis engine.
- `backend/.../trading/api/`: trade journaling and performance endpoints.
- `backend/.../trading/service/`: trade recording and setup statistics.
- `backend/.../trading/domain/`: entities and enums.
- `backend/.../trading/repository/`: JPA repository.
- `backend/src/main/resources/db/migration/`: schema migrations.

## Local Runtime
- Frontend Node version is pinned to `22.21.1` in `web/.nvmrc` and `web/.node-version`.
- Frontend commands can use the repo-local Node toolchain through `web/scripts/with-local-node.sh`.
- Backend runs on Java 17 and defaults to a local H2 file database.

## Environment Variables
Frontend:
```env
NEXT_PUBLIC_BACKEND_BASE_URL=http://localhost:8080
TWELVE_DATA_KEY=your_key
ALPHA_VANTAGE_KEY=your_key
ALERT_WEBHOOK_URL=https://your-endpoint.example/webhook
ALERT_EXECUTION_URL=https://your-execution.example/alerts
NEXT_PUBLIC_ALERT_RELAY_MODE=webhook
NEXT_PUBLIC_ALERT_WEBHOOK=https://your-endpoint.example/webhook
NEXT_PUBLIC_DEBUG_SIGNALS=false
```

Backend:
```bash
export ICTCRAKR_FRONTEND_ORIGIN=http://localhost:3000
export ICTCRAKR_DB_URL=jdbc:postgresql://localhost:5432/ictcrakr
export ICTCRAKR_DB_USERNAME=postgres
export ICTCRAKR_DB_PASSWORD=postgres
```

## Verification Commands
Frontend:
```bash
cd web
npm run lint
npm run typecheck
npm run analyze:sample
```

Fixture capture:
```bash
cd web
npm run capture:fixture -- --assetClass crypto --symbol BTCUSDT --timeframe 15m --limit 300
```

Backend:
```bash
cd backend
mvn test
```

## Repo Hygiene Rules
- Keep shipped browser assets in `web/public/`.
- Keep script-only fixtures in `web/scripts/fixtures/`.
- Keep deployment and infrastructure material out of `web/` and `backend/`; place it in `ops/`.
- Do not commit local editor state, generated frontend output, backend build output, or local database files.

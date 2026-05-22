# ICT Trading Desk Backend

Spring Boot backend for server-side ICT analysis and trade journaling.

This service receives candle data from the Next.js client, calculates the trading structures and setups on the server, stores completed trades, and exposes setup-performance statistics that can be reused as optimization weights.

## What this backend does
- `POST /api/v1/analysis/signals`
  Accepts candles and returns bias, signals, swings, FVGs, order blocks, BOS/CHoCH shifts, sweeps, equal highs/lows, breaker blocks, premium/discount range, HTF levels, and Model 2022 data.
- `POST /api/v1/trades`
  Stores a completed trade journal entry.
- `GET /api/v1/trades`
  Returns recent persisted journal entries, optionally filtered by symbol, timeframe, lookback window, and limit.
- `GET /api/v1/trades/performance`
  Aggregates journal performance by setup and returns `allowed` and `sizeMultiplier` fields used by the signal optimizer.
- Flyway manages the `trade_journal_entries` schema.
- Runtime persistence defaults to a local H2 file database, with PostgreSQL available as an override. Tests use in-memory H2.

## Runtime role in the project
1. The frontend fetches raw candles through its own market-data proxy routes.
2. The frontend sends those candles to `POST /api/v1/analysis/signals`.
3. Manual and paper-trade outcomes can be posted to `POST /api/v1/trades`.
4. Setup-performance statistics are available at `GET /api/v1/trades/performance`.

## Local run

Default local startup:

```bash
cd backend
export ICTCRAKR_FRONTEND_ORIGIN=http://localhost:3000
mvn spring-boot:run
```

Safer local startup when an old backend may still be hanging onto port `8080` or the H2 file:

```bash
cd backend
./scripts/run-local.sh
```

If the script reports a stale backend, replace it in one step:

```bash
cd backend
./scripts/run-local.sh --replace
```

Default local settings:
- Port: `8080`
- Database: local H2 file at `backend/data/ictcrakr`
- Allowed frontend origin: `http://localhost:3000`

Optional PostgreSQL override:

```bash
cd backend
export ICTCRAKR_FRONTEND_ORIGIN=http://localhost:3000
export ICTCRAKR_DB_URL=jdbc:postgresql://localhost:5432/ictcrakr
export ICTCRAKR_DB_USERNAME=postgres
export ICTCRAKR_DB_PASSWORD=postgres
mvn spring-boot:run
```

## Verification

```bash
cd backend
mvn test
```

## Example trade payload
```json
{
  "symbol": "BTCUSDT",
  "timeframe": "15M",
  "setup": "Bias + OB/FVG + Session",
  "session": "New York",
  "bias": "Bullish",
  "direction": "BUY",
  "result": "WIN",
  "rMultiple": 2.25,
  "entryPrice": 104325.10,
  "exitPrice": 104980.25,
  "stopPrice": 104050.00,
  "takeProfitPrice": 104875.00,
  "executedAt": "2026-05-19T13:30:00Z",
  "closedAt": "2026-05-19T15:00:00Z"
}
```

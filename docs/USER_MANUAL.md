# User Manual

## Local Startup
1. Start the backend:
   - `cd backend`
   - `export ICTCRAKR_FRONTEND_ORIGIN=http://localhost:3000`
   - `mvn spring-boot:run`
2. Start the frontend:
   - `cd web`
   - `PATH="$(pwd)/.tools/node/current/bin:$PATH" npm install`
   - `npm run dev`
3. Open `http://localhost:3000`.

Optional frontend environment:
```env
NEXT_PUBLIC_BACKEND_BASE_URL=http://localhost:8080
TWELVE_DATA_KEY=your_key
ALPHA_VANTAGE_KEY=your_key
NEXT_PUBLIC_ALERT_WEBHOOK=https://your-endpoint.example/webhook
NEXT_PUBLIC_DEBUG_SIGNALS=false
```

## Main Workspace
- `TopBar`: active symbol, timeframe, and current bias.
- `ChartPanel`: candles, overlays, drawings, replay cursor, and signal markers.
- `ControlPanel`: market selection, timeframe, overlay toggles, replay settings, and setup filters.
- `InsightPanel`: latest signal feed, current counts, and ICT scanner summary.
- `TradePanel`: manual or paper trade journaling.
- `InfoDrawer`: provider status, counts, and runtime diagnostics.

## Typical Workflow
1. Choose an asset class, symbol, and timeframe.
2. Wait for candles to load through the frontend proxy routes.
3. Enable the backend URL if you want server-side ICT analysis and setup generation.
4. Use replay mode to scope the visible candles to a point in history.
5. Review overlays, runtime notices, and the latest signals before journaling a trade.

## Notes on Data Freshness
- Crypto uses REST candles plus a websocket patch for the current live candle.
- Forex, metals, and stocks rely on the provider fallback chain exposed by the frontend routes.
- If the backend URL is missing, the chart still renders candles but server-side analysis remains disabled.

## Troubleshooting
- Blank or stale chart: check the runtime notices in the workspace and retry the feed.
- Missing backend analysis: confirm `NEXT_PUBLIC_BACKEND_BASE_URL` points to the running Spring Boot API.
- Missing forex data: verify `TWELVE_DATA_KEY` or `ALPHA_VANTAGE_KEY`.
- Node runtime mismatch: use Node `22.21.1`, as pinned in `web/.nvmrc` and `web/.node-version`.

## Useful Frontend Utility Commands
```bash
cd web
npm run analyze:sample
npm run debug:env
```

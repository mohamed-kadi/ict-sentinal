# User Manual

## Getting Started
1) Install dependencies: `npm install`
2) Run dev server: `npm run dev` and open `http://localhost:3000`
3) (Optional) set `.env.local` with `TWELVE_DATA_KEY` or `ALPHA_VANTAGE_KEY` for forex/metals data.

## Main Screen
- Top bar: shows current symbol, timeframe, and computed daily bias.
- Chart: candlesticks with optional overlays (swings/liquidity dots, FVG markers, order block dashed lines, buy/sell arrows).
- Insight panel: counts of detected structures and latest signal descriptions.
- Bottom bar: backtest controls.

## Controls
- Asset selector: choose Crypto (BTCUSDT/ETHUSDT/SOLUSDT/XRPUSDT) or Forex/Metals (EURUSD/GBPUSD/USDJPY/XAUUSD).
- Timeframe selector: 1m, 5m, 15m, 1h, 4h, 1D.
- Overlay toggles:
  - Liquidity: swing highs/lows markers.
  - FVG: bullish/bearish fair value gap markers and midlines.
  - Order Blocks: dashed midlines for detected blocks.
  - Sessions: session labeling in signals (visual fill pending).
  - Signals: rule-based buy/sell arrows and tooltips.
- Backtest switch: enables cursor-based playback on loaded candles.

## Backtest Controls
- Play/Pause: auto-advance the cursor over loaded candles.
- Step: move one candle forward/backward.
- Speed: adjust playback speed multiplier.
- Progress: shows position vs total candles; seek by clicking/dragging (if enabled in UI).

## Tips for Accuracy & Freshness
- Data updates follow the selected timeframe; crypto uses public Binance REST (1m minimum granularity).
- For near real-time behavior, refresh manually or reduce caching by switching fetches to `cache: 'no-store'` in API routes.
- Signals depend on overlays: enable FVG/Order Blocks/Sessions for fuller context.

## Troubleshooting
- If the chart is blank, ensure data loaded (no API error banner) and overlays are toggled as desired.
- If lint/build warn about Node version, switch to Node `24.15.0` LTS for this repo.
- For missing forex data, verify `TWELVE_DATA_KEY`/`ALPHA_VANTAGE_KEY` is set and not rate-limited.

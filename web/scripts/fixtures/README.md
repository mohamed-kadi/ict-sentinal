# Fixture Guide

This directory holds saved candle snapshots for backend analysis checks.

## Purpose
- `backtest-sample.json` is the default static regression fixture.
- Captured fixtures are immutable snapshots of past candles, not live-updating market data.
- The goal is reproducibility: engineers can run the backend analysis against the same candle set and compare results across logic changes.

## Default Regression Fixture
- File: `backtest-sample.json`
- Role: stable sample for `npm run analyze:sample`
- Use it when you want a repeatable analysis check that does not drift with live market data.

## Capture a New Fixture
Start the frontend dev server first so the Next.js API routes are available, then run:

```bash
cd web
npm run capture:fixture -- --assetClass forex --symbol XAUUSD --timeframe 15m --limit 300
```

Optional flags:
- `--baseUrl http://localhost:3000`
- `--out ./scripts/fixtures/my-case.json`

Captured fixtures include:
- asset class
- symbol
- timeframe
- source/timezone metadata
- the exact normalized candle array used for later analysis

## Analyze Any Fixture
Run the backend first, then:

```bash
cd web
npm run analyze:sample -- ./scripts/fixtures/backtest-sample.json
```

You can replace the path with any captured fixture in this directory.

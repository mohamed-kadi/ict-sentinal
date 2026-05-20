# Model 2022 M15 FVG

## What This Strategy Tries To Capture

This is the separate Model 2022 signal stream used by the frontend. It looks for a 15-minute fair value gap that forms after a liquidity grab and aligned structure shift.

## Market Context Required

- The dataset must effectively be 15-minute data or close enough to it.
- Enough candles must exist to aggregate and analyze a 15-minute structure view.
- A sweep must happen before the gap forms.
- A structure shift must align with the gap direction.

## Entry Condition

- Bullish case:
  - a bullish 15-minute FVG forms
  - a prior downside liquidity sweep exists
  - a bullish structure shift exists by the time the gap completes
  - the candle body is large enough relative to ATR to count as displacement
- Bearish case:
  - a bearish 15-minute FVG forms
  - a prior upside liquidity sweep exists
  - a bearish structure shift exists by the time the gap completes
  - the candle body is large enough relative to ATR to count as displacement

## Stop Placement

- Longs: on the opposite side of the gap.
- Shorts: on the opposite side of the gap.

## Profit Targets

- The frontend derives practical targets from gap-based risk when it maps these signals into the regular chart signal format.

## Failure Cases And Common Traps

- This setup is not part of the main `supportedSetups` list returned by the backend.
- If the inferred timeframe is too large, the engine returns no Model 2022 signals.
- The kill-zone note here is informational only; the current code does not require kill-zone status to emit the signal.

## How This Repo Currently Implements It

- The backend aggregates to 15-minute bars, then checks swings, shifts, FVGs, and sweeps on that series.
- Displacement currently means the candle body is at least `0.7 * ATR`.
- The basis text adds `NY Kill Zone 07:00-10:00` when the signal candle falls in that local New York window.

# Asia Sweep Reversal

## What This Strategy Tries To Capture

This setup looks for London or New York to run the Asia range and then reject that sweep.

## Market Context Required

- The engine must have built an Asia range for the same trading day.
- The setup must happen during London or New York kill-zone time.
- The Asia range must still be marked active for that day.
- Higher-timeframe buy or sell zone support is still required.

## Entry Condition

- Bearish case:
  - price sweeps above the Asia high by a small tolerance
  - the candle closes back below the Asia high
  - the candle confirms bearish intent
  - the higher-timeframe sell zone is active
- Bullish case:
  - price sweeps below the Asia low by a small tolerance
  - the candle closes back above the Asia low
  - the candle confirms bullish intent
  - the higher-timeframe buy zone is active

## Stop Placement

- Shorts: above the greater of the sweep candle high and the Asia high.
- Longs: below the lower of the sweep candle low and the Asia low.

## Profit Targets

- First target at 1R.
- Second target at 2R.

## Failure Cases And Common Traps

- If the day did not build a valid Asia range first, this setup cannot fire.
- The engine uses a trigger spacing rule to avoid repeated signals from the same Asia range.
- A sweep that does not close back through the level is ignored.

## How This Repo Currently Implements It

- The sweep tolerance is currently `0.0002`.
- The setup uses an 8-bar spacing guard through `asiaRange.lastTriggerBar`.
- The rule is still inline in the service.

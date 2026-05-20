# Pullback Reentry

## What This Strategy Tries To Capture

This is the simplest continuation setup in the project. It looks for a quick rejection of the previous candle extreme in the direction of the current bias.

## Market Context Required

- The setup must happen in an allowed session window.
- Bias must already be bullish or bearish.
- The current candle must confirm the intended direction.

## Entry Condition

- Bullish case:
  - bias is bullish
  - the current candle trades down to or through the previous candle low
  - the same candle still confirms bullish intent by the close
- Bearish case:
  - bias is bearish
  - the current candle trades up to or through the previous candle high
  - the same candle still confirms bearish intent by the close

## Stop Placement

- Longs: below the lower of the current candle low and previous candle low.
- Shorts: above the higher of the current candle high and previous candle high.

## Profit Targets

- First target at 1R.
- Second target at 2R.

## Failure Cases And Common Traps

- This setup is intentionally simple, so it can trigger in noisy conditions.
- It depends heavily on the bias being right because it does not require deeper structure logic.
- Wide candles can make the risk too large for the quality of the signal.

## How This Repo Currently Implements It

- The helper only checks session allowance, bias direction, a sweep of the previous candle extreme, and bullish or bearish confirmation.
- It does not require a structure shift, order block, or fair value gap.
- This makes it a useful baseline strategy when debugging the signal engine.

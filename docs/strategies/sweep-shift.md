# Sweep + Shift

## What This Strategy Tries To Capture

This setup tries to catch the move that follows a liquidity sweep once structure turns in the opposite direction.

## Market Context Required

- The setup must happen in a kill-zone context.
- A valid liquidity sweep must already be detected.
- A valid structure shift must already align with the intended direction.
- Bias and higher-timeframe buy or sell zones must support the trade.

## Entry Condition

- Bearish case:
  - an EQH-style sweep pushes up
  - the candle confirms bearish intent
  - bias is bearish
  - higher-timeframe sell zone is active
  - the latest shift direction is bearish
- Bullish case:
  - an EQL-style sweep pushes down
  - the candle confirms bullish intent
  - bias is bullish
  - higher-timeframe buy zone is active
  - the latest shift direction is bullish

## Stop Placement

- Shorts: slightly above the sweep price.
- Longs: slightly below the sweep price.

## Profit Targets

- First target at 1R.
- Second target at 2R.

## Failure Cases And Common Traps

- A sweep without a structure shift is not enough.
- Bias and higher-timeframe location still matter. A sweep against context can fail quickly.
- The move can be too extended by the time the confirmation candle closes.

## How This Repo Currently Implements It

- The rule is now isolated in a helper and will not emit unless both the sweep and the shift are present.
- The stop buffer is currently a small percentage around the sweep price.
- The signal is taken at candle close, not intrabar.

# Turtle Soup

## What This Strategy Tries To Capture

This setup looks for a false breakout of an established range high or range low, then enters once price closes back inside the range.

## Market Context Required

- The engine first builds a prior range from previous daily candles.
- The current environment should not be strongly trending.
- The range should not be unusually wide compared with ATR.
- The setup must happen in kill-zone context.
- Higher-timeframe buy or sell zone support is still required.

## Entry Condition

- Bearish case:
  - price trades above the tracked range high
  - the candle closes back below that range high
  - the candle confirms bearish intent
  - the higher-timeframe sell zone is active
- Bullish case:
  - price trades below the tracked range low
  - the candle closes back above that range low
  - the candle confirms bullish intent
  - the higher-timeframe buy zone is active

## Stop Placement

- Shorts: above the sweep candle high.
- Longs: below the sweep candle low.

## Profit Targets

- First target at 1R.
- Second target at 2R.

## Failure Cases And Common Traps

- A breakout is not enough if the candle does not close back inside the range.
- Very strong trend conditions can make the reversal idea weak.
- If the range itself is too large, the setup is filtered out.

## How This Repo Currently Implements It

- The current range is built from up to the last 20 day buckets, with at least 10 candles required before using it.
- The helper now also requires kill-zone context, which makes the setup narrower than the older inline version.
- The entry is placed at the close-back-inside level rather than at the exact sweep extreme.

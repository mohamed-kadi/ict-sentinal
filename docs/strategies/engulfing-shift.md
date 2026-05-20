# Engulfing Shift

## What This Strategy Tries To Capture

This setup looks for a strong engulfing candle that appears after structure has already shifted in the same direction.

## Market Context Required

- The setup must happen during kill-zone context.
- A structure shift must already align with the intended direction.
- Bias must agree with the trade.
- The path toward the first target must be relatively clear.

## Entry Condition

- Bullish case:
  - current candle is bullish
  - current open is at or below the previous close
  - current close is at or above the previous high
  - the bullish body is larger than the previous candle body
  - bias is bullish
  - shift direction is bullish
  - the path above price is clear enough
- Bearish case:
  - current candle is bearish
  - current open is at or above the previous close
  - current close is at or below the previous low
  - the bearish body is larger than the previous candle body
  - bias is bearish
  - shift direction is bearish
  - the path below price is clear enough

## Stop Placement

- Longs: below the lower of the previous candle low and current candle low.
- Shorts: above the higher of the previous candle high and current candle high.

## Profit Targets

- First target at 1R.
- Second target at 2R.

## Failure Cases And Common Traps

- A visually strong engulfing candle can still be filtered out by clear-path logic.
- No shift means no setup.
- This setup uses the previous candle heavily, so noisy prior bars can distort quality.

## How This Repo Currently Implements It

- The engulfing definition is strict and uses both the previous candle range and body size.
- The rule is still inline in the service.
- The basis text is session-aware but otherwise simple.

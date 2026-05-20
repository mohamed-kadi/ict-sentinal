# Trend Pullback

## What This Strategy Tries To Capture

This setup tries to buy or sell a pullback into the fast EMA while a broader EMA trend is already established.

## Market Context Required

- The setup must happen in kill-zone context.
- Bias must already agree with the trend direction.
- A structure shift must already point in the same direction.
- The EMA stack must clearly separate enough to qualify as trend strength.

## Entry Condition

- Bullish case:
  - fast EMA is above slow EMA
  - bias is bullish
  - trend separation passes the minimum threshold
  - the candle closes above the fast EMA
  - the candle low pulls back close enough to the fast EMA
  - the candle confirms bullish intent
  - the shift direction is bullish
- Bearish case:
  - fast EMA is below slow EMA
  - bias is bearish
  - trend separation passes the minimum threshold
  - the candle closes below the fast EMA
  - the candle high pulls back close enough to the fast EMA
  - the candle confirms bearish intent
  - the shift direction is bearish

## Stop Placement

- Longs: below the lowest of the fast EMA, current candle low, and previous candle low.
- Shorts: above the highest of the fast EMA, current candle high, and previous candle high.

## Profit Targets

- First target at 1R.
- Second target at 2R.

## Failure Cases And Common Traps

- If the EMA spread is too small, the setup is filtered out as weak trend.
- A trend pullback can still fail if the shift direction lags.
- The pullback tolerance around the fast EMA is narrow, so many visual near-misses will not trigger.

## How This Repo Currently Implements It

- The fast EMA is 34 and the slow EMA is 89.
- Trend strength is currently a normalized EMA separation of at least `0.001`.
- The rule is still inline in the service.

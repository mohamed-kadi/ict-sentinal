# Bias + OB/FVG + Session

## What This Strategy Tries To Capture

This setup looks for continuation in the direction of the current market bias after price pulls back into an order block or a fair value gap during an active session.

## Market Context Required

- The overall bias must already be bullish or bearish.
- Price should be inside a higher-timeframe buy zone for longs or sell zone for shorts.
- A recent structure shift must already agree with the bias.
- The setup must happen in an allowed session window.

## Entry Condition

- Bullish case:
  - bias is bullish
  - the current candle confirms bullish intent
  - a bullish order block or bullish FVG is tapped
  - the recent shift direction is bullish
  - the path to the first target is relatively clear
  - the previous candle was not weak against the setup
- Bearish case:
  - bias is bearish
  - the current candle confirms bearish intent
  - a bearish order block or bearish FVG is tapped
  - the recent shift direction is bearish
  - the path to the first target is relatively clear
  - the previous candle was not weak against the setup

## Stop Placement

- Longs: below the most recent swing low, with the previous candle low used as fallback.
- Shorts: above the most recent swing high, with the previous candle high used as fallback.

## Profit Targets

- First target at 1R.
- Second target at 2R.

## Failure Cases And Common Traps

- Bias and structure can agree, but price may still be too close to opposing gaps or congestion.
- A tap into an order block is not enough if the candle confirmation is weak.
- Session timing matters. The same shape outside the allowed session can be ignored.

## How This Repo Currently Implements It

- The code checks bias, session allowance, higher-timeframe zone, aligned structure direction, clear path, and a tapped OB or FVG.
- The bullish branch also requires the previous candle to have closed bullish.
- The bearish branch also requires the previous candle to have closed bearish.
- The signal is emitted at the current candle close.

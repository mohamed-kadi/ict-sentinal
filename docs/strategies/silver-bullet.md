# Silver Bullet

## What This Strategy Tries To Capture

This setup looks for a liquidity sweep during a specific New York time window, followed by a return into a fair value gap that offers a sharp entry.

## Market Context Required

- The candle must fall inside the New York Silver Bullet window used by the engine.
- A recent sweep must already exist.
- A fair value gap must still be available and price must trade back into it.
- Higher-timeframe buy or sell zone context must support the direction.

## Entry Condition

- Bullish case:
  - price previously swept lows
  - the latest gap is bullish
  - the current candle trades back into that gap
  - the candle confirms bullish intent
  - the higher-timeframe buy zone is active
- Bearish case:
  - price previously swept highs
  - the latest gap is bearish
  - the current candle trades back into that gap
  - the candle confirms bearish intent
  - the higher-timeframe sell zone is active

## Stop Placement

- Longs: below the lower of the sweep price and the current candle low.
- Shorts: above the higher of the sweep price and the current candle high.

## Profit Targets

- First target at 1R.
- Second target at 2R.

## Failure Cases And Common Traps

- A sweep alone is not enough if price does not return into the gap.
- A gap touch without candle confirmation is ignored.
- Time filtering is strict, so visually similar setups outside the coded window will not fire.

## How This Repo Currently Implements It

- The rule now uses New York local hours instead of the old inconsistent UTC shortcut.
- The current implementation accepts the 10:00 and 14:00 New York hours.
- The repo does not currently model every possible Silver Bullet interpretation used by different ICT traders.

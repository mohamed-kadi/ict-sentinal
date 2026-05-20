# Kill Zone Liquidity Entry

## What This Strategy Tries To Capture

This setup looks for entries from institutional discount or premium areas during London or New York kill zones.

## Market Context Required

- The session must be London or New York.
- Kill-zone context must be active.
- A structure shift must already align with the intended direction.
- Bias and higher-timeframe zone must agree.
- Price should be trading from an institutional buy or sell area.

## Entry Condition

- Bullish case:
  - institutional buy zone is active
  - bias is bullish
  - higher-timeframe buy zone is active
  - shift direction is bullish
  - candle confirms bullish intent
  - the path above price is relatively clear
- Bearish case:
  - institutional sell zone is active
  - bias is bearish
  - higher-timeframe sell zone is active
  - shift direction is bearish
  - candle confirms bearish intent
  - the path below price is relatively clear

## Stop Placement

- Longs: below the lower of the Asia low, recent swing low, and current candle low.
- Shorts: above the higher of the Asia high, recent swing high, and current candle high.

## Profit Targets

- First target at 1R.
- Second target at 2R.

## Failure Cases And Common Traps

- Institutional zone status can come from several fallback checks, so the setup can appear even without a perfect textbook zone.
- The setup depends on both session and kill-zone logic, so time alignment matters a lot.
- If the Asia range is not available, the stop logic falls back to other lows or highs.

## How This Repo Currently Implements It

- Institutional buy zone currently means discount context or a tag of previous day/week lows.
- Institutional sell zone currently means premium context or a tag of previous day/week highs.
- The rule is still inline in the service.

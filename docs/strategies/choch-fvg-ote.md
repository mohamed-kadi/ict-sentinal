# CHoCH + FVG + OTE

## What This Strategy Tries To Capture

This setup looks for a reversal after a clear change of character, then waits for price to return into a fair value gap while also trading inside the OTE area.

## Market Context Required

- A real CHoCH must already exist. A plain BOS is not enough.
- Price must still agree with the higher-timeframe buy or sell zone.
- The setup must happen in an allowed session window.
- The current price must be inside the OTE band used by the engine.

## Entry Condition

- Bullish case:
  - bias is bullish
  - the shift direction is bullish
  - the shift label is CHoCH
  - a bullish FVG is tapped
  - the candle confirms bullish intent
  - price is inside the OTE zone
- Bearish case:
  - bias is bearish
  - the shift direction is bearish
  - the shift label is CHoCH
  - a bearish FVG is tapped
  - the candle confirms bearish intent
  - price is inside the OTE zone

## Stop Placement

- Longs: below the recent swing low used for the OTE branch.
- Shorts: above the recent swing high used for the OTE branch.

## Profit Targets

- First target at 1R.
- Second target at 2R.

## Failure Cases And Common Traps

- A BOS can look visually similar to CHoCH, but the repo now rejects BOS for this setup.
- Touching an FVG without being in the OTE zone is not enough.
- If the candle confirms too late, the risk can become poor even if the pattern is valid.

## How This Repo Currently Implements It

- The helper only accepts the setup when the shift label is exactly `CHoCH`.
- The OTE zone is derived from the rolling dealing range and currently uses the 62 percent to 70.5 percent band.
- The signal is emitted from the current candle close once all gates align.

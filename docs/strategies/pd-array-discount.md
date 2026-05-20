# PD Array (Discount)

## What This Strategy Tries To Capture

This setup looks for a long entry when price is trading from the discount side of the dealing range and the market has already shown bullish intent.

## Market Context Required

- Discount context must be active, either from the rolling range or the weekly range.
- The setup must happen during kill-zone context.
- Bias must be bullish.
- The latest structure shift must point bullish.
- The latest sweep must be a downside sweep.
- The higher-timeframe buy zone must still agree.

## Entry Condition

- Price is inside a discount or weekly discount area.
- A bullish structure shift is already in place.
- The latest sweep moved down into liquidity.
- The candle confirms bullish intent.
- The path above price is relatively clear.

## Stop Placement

- The stop is placed below the recent swing low, with the current candle low used as part of the floor.

## Profit Targets

- First target at 1R.
- Second target at 2R.

## Failure Cases And Common Traps

- Discount alone is not enough if there is no bullish shift.
- A bullish candle without a prior downside sweep is ignored.
- Nearby opposing gaps can block the setup through the clear-path filter.

## How This Repo Currently Implements It

- The basis text distinguishes between normal discount and weekly discount context.
- The rule is still inline in the service, not yet extracted into `SignalSetupRules`.
- The signal is emitted at candle close after all shared gates pass.

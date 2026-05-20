# PD Array (Premium)

## What This Strategy Tries To Capture

This is the bearish mirror of the discount setup. It looks for a short entry when price is trading from the premium side of the dealing range and the market has already shown bearish intent.

## Market Context Required

- Premium context must be active, either from the rolling range or the weekly range.
- The setup must happen during kill-zone context.
- Bias must be bearish.
- The latest structure shift must point bearish.
- The latest sweep must be an upside sweep.
- The higher-timeframe sell zone must still agree.

## Entry Condition

- Price is inside a premium or weekly premium area.
- A bearish structure shift is already in place.
- The latest sweep moved up into liquidity.
- The candle confirms bearish intent.
- The path below price is relatively clear.

## Stop Placement

- The stop is placed above the recent swing high, with the current candle high used as part of the ceiling.

## Profit Targets

- First target at 1R.
- Second target at 2R.

## Failure Cases And Common Traps

- Premium alone is not enough if there is no bearish shift.
- A bearish candle without a prior upside sweep is ignored.
- Congestion below price can invalidate the setup through the clear-path filter.

## How This Repo Currently Implements It

- The basis text distinguishes between normal premium and weekly premium context.
- The rule is still inline in the service, not yet extracted into `SignalSetupRules`.
- The signal is emitted at candle close after all shared gates pass.

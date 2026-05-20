# Shared Engine Filters

## Why This Note Matters

Many apparent strategy bugs are not caused by the setup branch itself. The shared engine filters can suppress a valid-looking setup before it ever reaches the frontend.

## Session Model

- Primary session map:
  - Asia: `00:00` to `03:00` UTC, kill zone `00:00` to `02:00`
  - London: `07:00` to `10:00` UTC, kill zone `07:00` to `10:00`
  - New York: `12:00` to `16:00` UTC, kill zone `12:00` to `15:00`
- Fallback session map:
  - Asia: `00:00` to `06:00` UTC
  - London: `06:00` to `12:00` UTC
  - New York: `12:00` to `20:00` UTC

## Session Gates

- `sessionAllowed` is broader than kill-zone context.
- London and New York setups can still pass through the wider session window logic, depending on the branch.
- `killZoneContext` is stricter and requires both a London or New York session label and active kill-zone hours.

## Higher-Timeframe Context

- `htfBuyZone` and `htfSellZone` are built from several checks:
  - rolling premium/discount range
  - weekly premium/discount range
  - proximity to previous day high or low
  - proximity to previous week high or low
- `institutionalBuyZone` and `institutionalSellZone` are even broader and can be true from direct tags of previous day or week liquidity.

## Signal Suppression Rules

- Optimizer gate:
  - if a setup is marked not allowed by performance stats, the signal is dropped
- Global cooldown:
  - `2` bars
- Per-setup cooldown:
  - `5` bars
- Max signals per bar:
  - `1`
- Max trades per day:
  - `12`

## Risk And Target Normalization

- A signal must have positive risk after stop calculation or it is dropped.
- Missing targets are auto-filled.
- If the first target gives less than `1.25R`, targets are widened to force at least that minimum.

## Position Sizing

- Size is scaled from ATR relative to price.
- Tier-one setups use a tighter cap than non-tier-one setups.
- Tier one currently includes:
  - Bias + OB/FVG + Session
  - CHoCH + FVG + OTE
  - Silver Bullet
  - Turtle Soup

## Practical Debugging Advice

- When a setup looks valid on the chart but does not appear in the signal list, check:
  1. session and kill-zone context
  2. higher-timeframe zone flags
  3. clear-path filters
  4. global and setup cooldowns
  5. per-bar and per-day caps
  6. optimizer permissions

## How This Repo Currently Implements It

- Most suppression happens inside the shared `pushSignal` path.
- That means two setups with correct branch logic can still behave differently if they are competing on the same bar or inside the same day.

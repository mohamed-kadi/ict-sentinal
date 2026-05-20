# Strategy Notes

This folder contains plain-English notes for the main trading setups used in the project.

Purpose:
- keep one file per strategy
- explain the idea in simple terms
- document the chart conditions the code is checking
- record caveats so we can revisit the logic later

Current notes:
- [Bias + OB/FVG + Session](./bias-ob-fvg-session.md)
- [CHoCH + FVG + OTE](./choch-fvg-ote.md)
- [PD Array (Discount)](./pd-array-discount.md)
- [PD Array (Premium)](./pd-array-premium.md)
- [Sweep + Shift](./sweep-shift.md)
- [Trend Pullback](./trend-pullback.md)
- [Kill Zone Liquidity Entry](./kill-zone-liquidity-entry.md)
- [Asia Sweep Reversal](./asia-sweep-reversal.md)
- [Silver Bullet](./silver-bullet.md)
- [Turtle Soup](./turtle-soup.md)
- [Engulfing Shift](./engulfing-shift.md)
- [Pullback Reentry](./pullback-reentry.md)

Related implementation notes:
- [Model 2022 M15 FVG](./model-2022-m15-fvg.md)
- [Shared Engine Filters](./shared-engine-filters.md)

Recommended structure for each note:
1. What the strategy tries to capture
2. Market context required
3. Entry condition
4. Stop placement
5. Profit targets
6. Failure cases / common traps
7. How this repo currently implements it

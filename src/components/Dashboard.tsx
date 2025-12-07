'use client';

import { useEffect, useMemo } from 'react';
import { ControlPanel } from './ControlPanel';
import { ChartPanel } from './ChartPanel';
import { TopBar } from './TopBar';
import { BacktestControls } from './BacktestControls';
import { InsightPanel } from './InsightPanel';
import { InfoDrawer } from './InfoDrawer';
import { useAppStore } from '@/state/useAppStore';
import type { AssetClass, Candle, Signal, Model2022Signal } from '@/lib/types';
import { useCandles } from '@/hooks/useCandles';
import { SESSION_ZONES } from '@/lib/config';
import { computeBias, detectStructureShifts, detectSwings } from '@/lib/strategies/structure';
import {
  computePremiumDiscountRange,
  computeHtfLevels,
  detectLiquiditySweeps,
  detectEqualHighsLows,
} from '@/lib/strategies/liquidity';
import { detectOrderBlocks, detectBreakerBlocks } from '@/lib/strategies/blocks';
import { detectFVG } from '@/lib/strategies/gaps';
import { detectSignals } from '@/lib/strategies/signals';
import { evaluateIctScanner } from '@/lib/ictScanner';
import { buildModel2022State } from '@/lib/strategies/model2022';

const EMPTY_CANDLES: Candle[] = [];

export function Dashboard() {
  const {
    assetClass,
    symbol,
    timeframe,
    overlays,
    backtest,
    setBacktest,
    selectedSetup,
    sidebarOpen,
    toggleSidebar,
    infoOpen,
  } = useAppStore();
  const {
    candles = EMPTY_CANDLES,
    source,
    isLoading,
    error,
    fetchOlder,
    hasMore,
    isFetchingOlder,
  } = useCandles(assetClass, symbol, timeframe);

  useEffect(() => {
    if (!backtest.enabled) return;
    const capped = Math.max(0, Math.min(backtest.cursor, Math.max(candles.length - 1, 0)));
    if (capped !== backtest.cursor) {
      setBacktest({ cursor: capped });
    }
  }, [backtest.enabled, backtest.cursor, candles.length, setBacktest]);

  const scopedCandles = useMemo(() => {
    if (!backtest.enabled) return candles;
    const end = Math.min(backtest.cursor + 1, candles.length);
    return candles.slice(0, end);
  }, [backtest.enabled, backtest.cursor, candles]);

  const bias = useMemo(() => computeBias(scopedCandles), [scopedCandles]);
  const needsStructure = overlays.liquidity || overlays.structureSegments;
  const swings = useMemo(
    () => (needsStructure ? detectSwings(scopedCandles, 2) : []),
    [scopedCandles, needsStructure],
  );
  const gaps = useMemo(() => (overlays.fvg ? detectFVG(scopedCandles) : []), [scopedCandles, overlays.fvg]);
  const orderBlocks = useMemo(
    () => (overlays.orderBlocks ? detectOrderBlocks(scopedCandles) : []),
    [scopedCandles, overlays.orderBlocks],
  );
  const structureShiftOptions = useMemo(
    () => ({ minSwingDistance: 2, minSpacingBars: 4, minBreakPct: 0.00005 }),
    [],
  );
  const structureShifts = useMemo(
    () =>
      needsStructure
        ? detectStructureShifts(scopedCandles, swings, 0, structureShiftOptions)
        : [],
    [scopedCandles, swings, needsStructure, structureShiftOptions],
  );
  const sweeps = useMemo(
    () => (overlays.sweeps ? detectLiquiditySweeps(scopedCandles) : []),
    [scopedCandles, overlays.sweeps],
  );
  const equalHighsLows = useMemo(
    () => (overlays.sweeps ? detectEqualHighsLows(scopedCandles) : []),
    [scopedCandles, overlays.sweeps],
  );
  const breakerBlocks = useMemo(
    () => (overlays.breakers ? detectBreakerBlocks(orderBlocks, scopedCandles) : []),
    [orderBlocks, scopedCandles, overlays.breakers],
  );
  const premiumDiscount = useMemo(
    () => computePremiumDiscountRange(scopedCandles),
    [scopedCandles],
  );
  const htfLevels = useMemo(() => computeHtfLevels(scopedCandles), [scopedCandles]);
  const model2022 = useMemo(
    () =>
      buildModel2022State({
        candles: scopedCandles,
        fullCandles: candles,
        swings,
        gaps,
        orderBlocks,
        bias,
        structureShifts,
      }),
    [scopedCandles, candles, swings, gaps, orderBlocks, bias, structureShifts],
  );
  const model2022Signals = useMemo(() => mapModel2022Signals(model2022.m15Signals), [model2022.m15Signals]);
  const debugSignals = process.env.NEXT_PUBLIC_DEBUG_SIGNALS === 'true';
  const notificationSignals = useMemo(
    () => [
      ...detectSignals(
        scopedCandles,
        bias,
        gaps,
        orderBlocks,
        SESSION_ZONES,
        swings,
        sweeps,
        true,
        breakerBlocks,
        premiumDiscount,
        htfLevels,
        { uiSignalLimit: overlays.signals ? 25 : null, debug: debugSignals },
      ),
      ...model2022Signals,
    ],
    [
      scopedCandles,
      bias,
      gaps,
      orderBlocks,
      swings,
      sweeps,
      breakerBlocks,
      premiumDiscount,
      htfLevels,
      overlays.signals,
      debugSignals,
      model2022Signals,
    ],
  );
  const signals = overlays.signals ? notificationSignals : [];
  const fullBias = useMemo(() => computeBias(candles), [candles]);
  const fullNeedsStructure = overlays.liquidity || overlays.structureSegments;
  const fullSwings = useMemo(
    () => (fullNeedsStructure ? detectSwings(candles, 2) : []),
    [candles, fullNeedsStructure],
  );
  const fullStructureShifts = useMemo(
    () =>
      fullNeedsStructure
        ? detectStructureShifts(candles, fullSwings, 0, structureShiftOptions)
        : [],
    [candles, fullSwings, fullNeedsStructure, structureShiftOptions],
  );
  const fullGaps = useMemo(() => (overlays.fvg ? detectFVG(candles) : []), [candles, overlays.fvg]);
  const fullOrderBlocks = useMemo(
    () => (overlays.orderBlocks ? detectOrderBlocks(candles) : []),
    [candles, overlays.orderBlocks],
  );
  const fullSweeps = useMemo(
    () => (overlays.sweeps ? detectLiquiditySweeps(candles) : []),
    [candles, overlays.sweeps],
  );
  const fullBreakerBlocks = useMemo(
    () => (overlays.breakers ? detectBreakerBlocks(fullOrderBlocks, candles) : []),
    [fullOrderBlocks, candles, overlays.breakers],
  );
  const fullPremiumDiscount = useMemo(() => computePremiumDiscountRange(candles), [candles]);
  const fullHtfLevels = useMemo(() => computeHtfLevels(candles), [candles]);
  const fullModel2022 = useMemo(
    () =>
      buildModel2022State({
        candles,
        fullCandles: candles,
        swings: fullSwings,
        gaps: fullGaps,
        orderBlocks: fullOrderBlocks,
        bias: fullBias,
        structureShifts: fullStructureShifts,
      }),
    [candles, fullSwings, fullGaps, fullOrderBlocks, fullBias, fullStructureShifts],
  );
  const fullModel2022Signals = useMemo(
    () => mapModel2022Signals(fullModel2022.m15Signals),
    [fullModel2022.m15Signals],
  );
  const fullNotificationSignals = useMemo(
    () => [
      ...detectSignals(
        candles,
        fullBias,
        fullGaps,
        fullOrderBlocks,
        SESSION_ZONES,
        fullSwings,
        fullSweeps,
        true,
        fullBreakerBlocks,
        fullPremiumDiscount,
        fullHtfLevels,
        { uiSignalLimit: null, debug: debugSignals },
      ),
      ...fullModel2022Signals,
    ],
    [
      candles,
      fullBias,
      fullGaps,
      fullOrderBlocks,
      fullSwings,
      fullSweeps,
      fullBreakerBlocks,
      fullPremiumDiscount,
      fullHtfLevels,
      debugSignals,
      fullModel2022Signals,
    ],
  );
  const latest = scopedCandles.at(-1);
  const prev = scopedCandles.at(-2);
  const latestPrice = latest?.c ?? null;
  const latestOhlc = latest
    ? { o: latest.o, h: latest.h, l: latest.l, c: latest.c }
    : null;
  const priceChangeAbs = latest && prev ? latest.c - prev.c : null;
  const priceChangePct = priceChangeAbs && prev ? (priceChangeAbs / prev.c) * 100 : null;
  const marketOpen = isMarketOpen(assetClass);
  const ictScanner = evaluateIctScanner({
    signal: notificationSignals.at(-1),
    bias,
    premiumDiscount,
    latestPrice,
  });

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-white">
      <TopBar symbol={symbol} timeframe={timeframe} bias={bias} latestOhlc={latestOhlc} />
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        <div
          className={`
            absolute top-0 bottom-0 left-0 z-40 w-80 transform transition-transform duration-200
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
        >
          <div className="h-full bg-zinc-950/95 shadow-2xl shadow-black/60">
            <ControlPanel />
          </div>
        </div>
        <div
          className={`
            absolute top-0 bottom-0 right-0 z-40 w-80 transform transition-transform duration-200
            ${infoOpen ? 'translate-x-0' : 'translate-x-full'}
          `}
        >
          <div className="h-full bg-zinc-950/95 shadow-2xl shadow-black/60">
            <InfoDrawer
              source={source}
              candlesCount={candles.length}
              signalsCount={notificationSignals.length}
              orderBlocksCount={orderBlocks.length}
              gapsCount={gaps.length}
              swingsCount={swings.length}
              sweepsCount={sweeps.length}
            />
          </div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {isLoading && (
            <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
              Fetching {symbol} {timeframe} candles...
            </div>
          )}
          {error && (
            <div className="flex flex-1 items-center justify-center text-sm text-red-400">
              {(error as Error).message}
            </div>
          )}
          {!isLoading && !error && (
            <>
              {hasMore && (
                <div className="flex justify-end px-4 pb-2 text-xs text-zinc-300">
                  <button
                    type="button"
                    className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1 font-semibold text-emerald-200 transition hover:border-emerald-500 disabled:opacity-60"
                    onClick={() => fetchOlder()}
                    disabled={isFetchingOlder}
                  >
                    {isFetchingOlder ? 'Loading older data…' : 'Load older history'}
                  </button>
                </div>
              )}
              <div className="flex flex-1 min-h-0">
                <div className="flex-1 min-h-0">
                  <ChartPanel
                    backtest={backtest}
                    backtestTotal={candles.length}
                    symbol={symbol}
                    timeframe={timeframe}
                    candles={scopedCandles}
                    fullCandles={candles}
                    swings={swings}
                    gaps={gaps}
                    orderBlocks={orderBlocks}
                    signals={signals}
                    structureShifts={structureShifts}
                    sweeps={sweeps}
                    breakerBlocks={breakerBlocks}
                    equalHighsLows={equalHighsLows}
                    htfLevels={htfLevels}
                    selectedSetup={selectedSetup}
                    dataSource={source}
                    premiumDiscount={premiumDiscount}
                    model2022={model2022}
                    bias={bias}
                    latestPrice={latestPrice}
                    notificationSignals={notificationSignals}
                    backtestSignals={fullNotificationSignals}
                    overlays={overlays}
                  />
                </div>
                <InsightPanel
                  symbol={symbol}
                  assetClass={assetClass}
                  latestPrice={latestPrice ?? undefined}
                  priceChangeAbs={priceChangeAbs ?? undefined}
                  priceChangePct={priceChangePct ?? undefined}
                  marketOpen={marketOpen}
                  dataSource={source}
                  bias={bias}
                  swings={swings}
                  gaps={gaps}
                  orderBlocks={orderBlocks}
                  signals={notificationSignals}
                  ictScanner={ictScanner}
                  premiumDiscount={premiumDiscount}
                />
              </div>
              <BacktestControls total={candles.length} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function isMarketOpen(assetClass: AssetClass) {
  const now = new Date();
  const day = now.getUTCDay();
  if (assetClass === 'crypto') return true;
  if (assetClass === 'forex') {
    return day !== 0 && !(day === 6 && now.getUTCHours() >= 21);
  }
  // stocks (US hours 14:30-21:00 UTC Mon-Fri)
  if (day === 0 || day === 6) return false;
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;
  return hour >= 14.5 && hour <= 21;
}

function mapModel2022Signals(modelSignals: Model2022Signal[] = []): Signal[] {
  return modelSignals.map((sig) => {
    const gapTop = Math.max(sig.fvg.top, sig.fvg.bottom);
    const gapBottom = Math.min(sig.fvg.top, sig.fvg.bottom);
    const rawStop = sig.stop ?? (sig.direction === 'buy' ? gapBottom : gapTop);
    const gapRisk = Math.abs(gapTop - gapBottom) || Math.abs(sig.entry) * 0.0008;
    const minRisk = Math.max(Math.abs(sig.entry) * 0.0012, gapRisk * 0.5);
    const risk = Math.max(Math.abs(sig.entry - rawStop), minRisk);
    const stop = sig.direction === 'buy' ? sig.entry - risk : sig.entry + risk;
    const tp1 = sig.direction === 'buy' ? sig.entry + risk * 2 : sig.entry - risk * 2;
    const tp2 = sig.direction === 'buy' ? sig.entry + risk * 3 : sig.entry - risk * 3;
    return {
      time: sig.time,
      price: sig.entry,
      direction: sig.direction,
      setup: 'Model 2022 M15 FVG',
      stop,
      tp1,
      tp2,
      basis: sig.basis.join(' • '),
      session: 'New York',
    };
  });
}

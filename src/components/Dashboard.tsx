'use client';

import { useEffect, useMemo } from 'react';
import { ControlPanel } from './ControlPanel';
import { ChartPanel } from './ChartPanel';
import { TopBar } from './TopBar';
import { BacktestControls } from './BacktestControls';
import { InsightPanel } from './InsightPanel';
import { useAppStore } from '@/state/useAppStore';
import type { AssetClass, Candle } from '@/lib/types';
import { useCandles } from '@/hooks/useCandles';
import { SESSION_ZONES } from '@/lib/config';
import {
  computeBias,
  computePremiumDiscountRange,
  detectBreakerBlocks,
  computeHtfLevels,
  detectFVG,
  detectEqualHighsLows,
  detectOrderBlocks,
  detectSignals,
  detectStructureShifts,
  detectLiquiditySweeps,
  detectSwings,
} from '@/lib/ict';
import { evaluateIctScanner } from '@/lib/ictScanner';

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
  } = useAppStore();
  const { data: candleRes, isLoading, error } = useCandles(assetClass, symbol, timeframe);
  const candles = candleRes?.candles ?? EMPTY_CANDLES;
  const source = candleRes?.source;

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
  const swings = useMemo(
    () => (overlays.liquidity ? detectSwings(scopedCandles, 2) : []),
    [scopedCandles, overlays.liquidity],
  );
  const gaps = useMemo(() => (overlays.fvg ? detectFVG(scopedCandles) : []), [scopedCandles, overlays.fvg]);
  const orderBlocks = useMemo(
    () => (overlays.orderBlocks ? detectOrderBlocks(scopedCandles) : []),
    [scopedCandles, overlays.orderBlocks],
  );
  const structureShifts = useMemo(
    () => (overlays.liquidity ? detectStructureShifts(scopedCandles, swings) : []),
    [scopedCandles, swings, overlays.liquidity],
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
  const debugSignals = process.env.NEXT_PUBLIC_DEBUG_SIGNALS === 'true';
  const notificationSignals = useMemo(
    () =>
      detectSignals(
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
    ],
  );
  const signals = overlays.signals ? notificationSignals : [];
  const fullBias = useMemo(() => computeBias(candles), [candles]);
  const fullSwings = useMemo(
    () => (overlays.liquidity ? detectSwings(candles, 2) : []),
    [candles, overlays.liquidity],
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
  const fullNotificationSignals = useMemo(
    () =>
      detectSignals(
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
    ],
  );
  const latest = scopedCandles.at(-1);
  const prev = scopedCandles.at(-2);
  const latestPrice = latest?.c ?? null;
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
      <TopBar symbol={symbol} timeframe={timeframe} bias={bias} />
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        <div
          className={`absolute top-0 bottom-0 left-0 z-30 w-72 transform transition-transform duration-200 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <ControlPanel />
        </div>
        <button
          aria-label="Toggle sidebar"
          className={`
            group absolute top-1/2 z-40 flex h-10 w-6 -translate-y-1/2 items-center justify-center
            rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300 shadow
            transition hover:border-emerald-500 hover:text-emerald-200
          `}
          style={{
            left: sidebarOpen ? '17.5rem' : '0.5rem',
          }}
          onClick={() => toggleSidebar()}
        >
          <span
            className={`
              text-xs font-semibold transition
              ${sidebarOpen ? 'rotate-180' : ''}
            `}
          >
            ❯
          </span>
        </button>
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

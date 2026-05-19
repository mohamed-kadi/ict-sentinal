'use client';

import { useEffect, useMemo } from 'react';
import { ControlPanel } from './ControlPanel';
import { ChartPanel } from './ChartPanel';
import { TopBar } from './TopBar';
import { InsightPanel } from './InsightPanel';
import { InfoDrawer } from './InfoDrawer';
import { useAppStore } from '@/state/useAppStore';
import type { AssetClass, Bias, Candle, Model2022Signal, Model2022State, Signal } from '@/lib/types';
import { useCandles } from '@/hooks/useCandles';
import { evaluateIctScanner } from '@/lib/ictScanner';
import { useSignalAnalysis } from '@/hooks/useSignalAnalysis';
import { useBackendBaseUrl } from '@/lib/backend';
import { RuntimeStatusPanel, type RuntimeStatusItem } from './RuntimeStatusPanel';

const EMPTY_CANDLES: Candle[] = [];
const EMPTY_BIAS: Bias = { label: 'Neutral', reason: 'Awaiting backend analysis' };
const EMPTY_MODEL_2022: Model2022State = {
  strongSwings: [],
  obWithDisplacement: [],
  dailyCandle: null,
  dailyLiquidity: {
    pdh: null,
    pdl: null,
    last3Highs: [],
    last3Lows: [],
    midnightOpen: null,
  },
  m15Signals: [],
};

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
    infoOpen,
    optimizerEnabled,
    toggleSidebar,
  } = useAppStore();
  const {
    candles = EMPTY_CANDLES,
    source,
    warning,
    detail,
    isLoading,
    error,
    refetch,
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
  const scopedAnalysisQuery = useSignalAnalysis(
    symbol,
    timeframe,
    scopedCandles,
    25,
    optimizerEnabled,
    true,
  );
  const fullAnalysisQuery = useSignalAnalysis(
    symbol,
    timeframe,
    candles,
    null,
    optimizerEnabled,
    true,
  );
  const scopedAnalysis = scopedAnalysisQuery.data;
  const fullAnalysis = fullAnalysisQuery.data;
  const backendBaseUrl = useBackendBaseUrl();
  const providerLabel = formatDataSourceLabel(source);
  const supportedSetups = useMemo(
    () => uniqueSetups(fullAnalysis?.supportedSetups ?? scopedAnalysis?.supportedSetups ?? []),
    [fullAnalysis?.supportedSetups, scopedAnalysis?.supportedSetups],
  );
  const marketDataStatus = useMemo(
    () => buildMarketDataStatus(providerLabel, warning, detail),
    [providerLabel, warning, detail],
  );
  const analysisStatus = useMemo(
    () =>
      buildAnalysisStatus({
        backendBaseUrl,
        backtestEnabled: backtest.enabled,
        scopedCandlesCount: scopedCandles.length,
        fullCandlesCount: candles.length,
        error: (scopedAnalysisQuery.error as Error | null) ?? (fullAnalysisQuery.error as Error | null) ?? null,
        hasData: Boolean(scopedAnalysisQuery.data || fullAnalysisQuery.data),
        isFetching: scopedAnalysisQuery.isFetching || fullAnalysisQuery.isFetching,
      }),
    [
      backendBaseUrl,
      backtest.enabled,
      scopedCandles.length,
      candles.length,
      scopedAnalysisQuery.error,
      fullAnalysisQuery.error,
      scopedAnalysisQuery.data,
      fullAnalysisQuery.data,
      scopedAnalysisQuery.isFetching,
      fullAnalysisQuery.isFetching,
    ],
  );
  const runtimeIssues = useMemo(
    () => [marketDataStatus, analysisStatus].filter((item) => item.tone !== 'success'),
    [marketDataStatus, analysisStatus],
  );
  const swings = scopedAnalysis?.swings ?? [];
  const gaps = scopedAnalysis?.gaps ?? [];
  const orderBlocks = scopedAnalysis?.orderBlocks ?? [];
  const structureShifts = scopedAnalysis?.structureShifts ?? [];
  const sweeps = scopedAnalysis?.sweeps ?? [];
  const equalHighsLows = scopedAnalysis?.equalHighsLows ?? [];
  const breakerBlocks = scopedAnalysis?.breakerBlocks ?? [];
  const premiumDiscount = scopedAnalysis?.premiumDiscount ?? null;
  const htfLevels = scopedAnalysis?.htfLevels ?? null;
  const model2022 = scopedAnalysis?.model2022 ?? EMPTY_MODEL_2022;
  const model2022Signals = useMemo(() => mapModel2022Signals(model2022.m15Signals), [model2022.m15Signals]);
  const notificationSignals = useMemo(
    () => [...(scopedAnalysis?.signals ?? []), ...model2022Signals],
    [scopedAnalysis?.signals, model2022Signals],
  );
  const fullModel2022 = fullAnalysis?.model2022 ?? scopedAnalysis?.model2022 ?? EMPTY_MODEL_2022;
  const fullModel2022Signals = useMemo(
    () => mapModel2022Signals(fullModel2022.m15Signals),
    [fullModel2022.m15Signals],
  );
  const fullNotificationSignals = useMemo(
    () => [...(fullAnalysis?.signals ?? scopedAnalysis?.signals ?? []), ...fullModel2022Signals],
    [fullAnalysis?.signals, scopedAnalysis?.signals, fullModel2022Signals],
  );
  const signals = overlays.signals ? notificationSignals : [];
  const latest = scopedCandles.at(-1);
  const prev = scopedCandles.at(-2);
  const latestPrice = latest?.c ?? null;
  const latestOhlc = latest
    ? { o: latest.o, h: latest.h, l: latest.l, c: latest.c }
    : null;
  const priceChangeAbs = latest && prev ? latest.c - prev.c : null;
  const priceChangePct = priceChangeAbs && prev ? (priceChangeAbs / prev.c) * 100 : null;
  const marketOpen = isMarketOpen(assetClass);
  const displayBias = scopedAnalysis?.bias ?? buildFallbackBias(analysisStatus);
  const ictScanner = evaluateIctScanner({
    signal: notificationSignals.at(-1),
    bias: displayBias,
    premiumDiscount,
    latestPrice,
  });

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-white">
      <TopBar symbol={symbol} timeframe={timeframe} bias={displayBias} latestOhlc={latestOhlc} />
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        <div
          className={`
            absolute top-0 bottom-0 left-0 z-40 w-80 transform transition-transform duration-200
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
        >
          <div className="h-full bg-zinc-950/95 shadow-2xl shadow-black/60">
            <ControlPanel supportedSetups={supportedSetups} />
          </div>
        </div>
        {!sidebarOpen && (
          <button
            type="button"
            className="absolute left-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950/90 text-sm font-semibold text-zinc-200 shadow-lg shadow-black/40 transition hover:border-emerald-500/60 hover:text-emerald-200"
            onClick={() => toggleSidebar()}
            title="Open layers"
            aria-label="Open layers"
          >
            <span className="leading-none">☰</span>
          </button>
        )}
        <div
          className={`
            absolute top-0 bottom-0 right-0 z-40 w-80 transform transition-transform duration-200
            ${infoOpen ? 'translate-x-0' : 'translate-x-full'}
          `}
        >
          <div className="h-full bg-zinc-950/95 shadow-2xl shadow-black/60">
            <InfoDrawer
              source={providerLabel}
              candlesCount={candles.length}
              signalsCount={notificationSignals.length}
              orderBlocksCount={orderBlocks.length}
              gapsCount={gaps.length}
              swingsCount={swings.length}
              sweepsCount={sweeps.length}
              runtimeStatuses={[marketDataStatus, analysisStatus]}
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
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="w-full max-w-xl rounded-[28px] border border-rose-500/25 bg-[linear-gradient(135deg,rgba(120,28,41,0.35),rgba(17,24,39,0.92))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-200">
                  Data Feed Unavailable
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  {symbol} {timeframe} candles could not be loaded.
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-rose-100/90">
                  {(error as Error).message}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-rose-100/65">
                  Try the feed again, switch market/symbol, or wait for the upstream provider to recover.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="rounded-full border border-rose-300/30 bg-rose-500/15 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-rose-50 transition hover:border-rose-200/50 hover:bg-rose-500/25"
                    onClick={() => refetch()}
                  >
                    Retry Feed
                  </button>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-zinc-300">
                    Runtime notices stay visible once candles reconnect.
                  </span>
                </div>
              </div>
            </div>
          )}
          {!isLoading && !error && (
            <>
              {runtimeIssues.length > 0 && (
                <div className="px-4 pb-3">
                  <RuntimeStatusPanel items={runtimeIssues} />
                </div>
              )}
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
                    htfLevels={htfLevels ?? undefined}
                    selectedSetup={selectedSetup}
                    dataSource={source}
                    premiumDiscount={premiumDiscount}
                    model2022={model2022}
                    bias={displayBias}
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
                  dataSource={providerLabel}
                  bias={displayBias}
                  swings={swings}
                  gaps={gaps}
                  orderBlocks={orderBlocks}
                  signals={notificationSignals}
                  selectedSetup={selectedSetup}
                  ictScanner={ictScanner}
                  premiumDiscount={premiumDiscount}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function buildMarketDataStatus(
  sourceLabel: string,
  warning?: string | null,
  detail?: string | null,
): RuntimeStatusItem {
  if (warning) {
    return {
      id: 'market-data',
      label: 'Market Data',
      state: 'Fallback',
      summary: warning,
      detail: cleanStatusDetail(detail),
      tone: 'warning',
    };
  }

  return {
    id: 'market-data',
    label: 'Market Data',
    state: 'Live',
    summary: `Candles are streaming through ${sourceLabel}.`,
    detail: null,
    tone: 'success',
  };
}

function buildAnalysisStatus({
  backendBaseUrl,
  backtestEnabled,
  scopedCandlesCount,
  fullCandlesCount,
  error,
  hasData,
  isFetching,
}: {
  backendBaseUrl: string | null;
  backtestEnabled: boolean;
  scopedCandlesCount: number;
  fullCandlesCount: number;
  error: Error | null;
  hasData: boolean;
  isFetching: boolean;
}): RuntimeStatusItem {
  if (!backendBaseUrl) {
    return {
      id: 'signal-engine',
      label: 'Signal Engine',
      state: 'Disabled',
      summary: 'Backend URL is not configured. Server-side bias, setups, and trade journaling are currently off.',
      detail: 'Set NEXT_PUBLIC_BACKEND_BASE_URL to the Spring Boot API to re-enable server analysis.',
      tone: 'warning',
    };
  }

  if (error) {
    return hasData
      ? {
          id: 'signal-engine',
          label: 'Signal Engine',
          state: 'Stale',
          summary: 'The latest backend refresh failed. The UI is showing the last successful server-side analysis.',
          detail: cleanStatusDetail(error.message),
          tone: 'warning',
        }
      : {
          id: 'signal-engine',
          label: 'Signal Engine',
          state: 'Unavailable',
          summary: 'The backend analysis request failed. Candles remain visible, but server-side signals are unavailable.',
          detail: cleanStatusDetail(error.message),
          tone: 'danger',
        };
  }

  if (backtestEnabled && scopedCandlesCount <= 1) {
    return {
      id: 'signal-engine',
      label: 'Signal Engine',
      state: 'Waiting',
      summary: 'Backtest replay needs at least two candles before the current window can be analyzed.',
      detail: null,
      tone: 'info',
    };
  }

  if (fullCandlesCount <= 1) {
    return {
      id: 'signal-engine',
      label: 'Signal Engine',
      state: 'Waiting',
      summary: 'The backend will begin analysis once enough candle history is loaded.',
      detail: null,
      tone: 'info',
    };
  }

  if (isFetching && !hasData) {
    return {
      id: 'signal-engine',
      label: 'Signal Engine',
      state: 'Syncing',
      summary: 'The backend is analyzing the latest candle window.',
      detail: null,
      tone: 'info',
    };
  }

  return {
    id: 'signal-engine',
    label: 'Signal Engine',
    state: 'Live',
    summary: 'Server-side bias, structures, and setup generation are up to date.',
    detail: null,
    tone: 'success',
  };
}

function buildFallbackBias(status: RuntimeStatusItem): Bias {
  if (status.id !== 'signal-engine' || status.tone === 'success') {
    return EMPTY_BIAS;
  }

  if (status.state === 'Disabled') {
    return { label: 'Neutral', reason: 'Backend analysis disabled' };
  }
  if (status.state === 'Unavailable' || status.state === 'Stale') {
    return { label: 'Neutral', reason: 'Backend analysis unavailable' };
  }
  if (status.state === 'Waiting' || status.state === 'Syncing') {
    return { label: 'Neutral', reason: 'Backend analysis warming up' };
  }
  return EMPTY_BIAS;
}

function formatDataSourceLabel(source?: string | null) {
  switch (source) {
    case 'binance_paxg':
      return 'Binance PAXG';
    case 'twelvedata':
      return 'Twelve Data';
    case 'alpha_vantage':
      return 'Alpha Vantage';
    case 'yahoo':
      return 'Yahoo Finance';
    case 'mock':
      return 'Mock Feed';
    case undefined:
    case null:
    case '':
      return 'Live Feed';
    default:
      return source
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
  }
}

function cleanStatusDetail(value?: string | null, maxLength = 180) {
  if (!value) return null;
  const normalized = value.replace(/^Error:\s*/i, '').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

function uniqueSetups(setups: readonly string[]) {
  return Array.from(new Set(setups.filter(Boolean)));
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

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  SeriesMarker,
  ISeriesMarkersPluginApi,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import { LineStyle } from "lightweight-charts";
import {
  BreakerBlock,
  Candle,
  EqualLiquidityLevel,
  Gap,
  LiquiditySweep,
  OrderBlock,
  PremiumDiscountRange,
  Signal,
  StructureShift,
  Swing,
  Drawing,
  DrawingType,
  Bias,
  Timeframe,
  Model2022State,
} from "@/lib/types";
import { SESSION_ZONES } from "@/lib/config";
import { classifySession } from "@/lib/sessions";
import { alertRelayConfigured, alertRelayLabel, notifyAlertConnectors } from "@/lib/alertConnectors";
import { CLOCK_OPTIONS, formatWithTz, getClockLabel } from "@/lib/time";
import { evaluateIctScanner } from "@/lib/ictScanner";
import { postTradeJournalEntry, tradeJournalScopeQueryKey } from "@/lib/tradePerformance";
import { useAppStore, type BacktestState, type BacktestTrade } from "@/state/useAppStore";
import { useShallow } from "zustand/react/shallow";
import { clamp } from "@/lib/utils";
import { SidebarToggleButton } from "./SidebarToggleButton";

const ADVANCED_SETUPS = new Set(["Silver Bullet", "Turtle Soup"]);
const TIER_ONE_SETUPS = new Set([
  "Bias + OB/FVG + Session",
  "CHoCH + FVG + OTE",
  "Silver Bullet",
  "Turtle Soup",
]);
const RETEST_CAPABLE_SETUPS = new Set([
  "Bias + OB/FVG + Session",
  "CHoCH + FVG + OTE",
  "Model 2022 M15 FVG",
  "Trend Pullback",
  "Kill Zone Liquidity Entry",
  "PD Array (Discount)",
  "PD Array (Premium)",
]);
const RETEST_WINDOW_BARS = 3;
const TIME_LABEL_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
};
const DRAWING_TOOLBAR_TOOLS = [
  { mode: "none" as const, label: "Exit", shortLabel: "✕", title: "Exit drawing mode" },
  { mode: "hline" as const, label: "H-Line", shortLabel: "H", title: "Horizontal line" },
  { mode: "trend" as const, label: "Trend", shortLabel: "/", title: "Trend line" },
  { mode: "rect" as const, label: "Zone", shortLabel: "▭", title: "Rectangle" },
  { mode: "fibo" as const, label: "Fib", shortLabel: "Fib", title: "Fibonacci retracement" },
  { mode: "measure" as const, label: "Measure", shortLabel: "R", title: "Ruler / measurement" },
  { mode: "long" as const, label: "Long", shortLabel: "Long", title: "Long position" },
  { mode: "short" as const, label: "Short", shortLabel: "Short", title: "Short position" },
];

function timeframeToMs(tf?: Timeframe) {
  switch (tf) {
    case "1m":
      return 60_000;
    case "5m":
      return 5 * 60_000;
    case "15m":
      return 15 * 60_000;
    case "1h":
      return 60 * 60_000;
    case "4h":
      return 4 * 60 * 60_000;
    case "1D":
      return 24 * 60 * 60_000;
    case "1W":
      return 7 * 24 * 60 * 60_000;
    case "1M":
      return 30 * 24 * 60 * 60_000;
    default:
      return 60 * 60_000;
  }
}

type Props = {
  symbol?: string;
  timeframe?: Timeframe;
  leftPanelOpen?: boolean;
  rightPanelOpen?: boolean;
  onToggleLeftPanel?: () => void;
  onToggleRightPanel?: () => void;
  backtest?: BacktestState;
  backtestTotal?: number;
  candles: Candle[];
  fullCandles?: Candle[];
  swings?: Swing[];
  gaps?: Gap[];
  orderBlocks?: OrderBlock[];
  signals?: Signal[];
  notificationSignals?: Signal[];
  backtestSignals?: Signal[];
  structureShifts?: StructureShift[];
  sweeps?: LiquiditySweep[];
  breakerBlocks?: BreakerBlock[];
  equalHighsLows?: EqualLiquidityLevel[];
  htfLevels?: import("@/lib/types").HtfLevels;
  dataSource?: string;
  premiumDiscount?: PremiumDiscountRange | null;
  selectedSetup?: string;
  bias?: Bias;
  latestPrice?: number | null;
  model2022?: Model2022State;
  onSignalPromptChange?: (signal: Signal | null, score: number | null) => void;
  dismissSignalPromptToken?: number;
  takeSignalPromptToken?: number;
  overlays: Record<
    | "liquidity"
    | "fvg"
    | "orderBlocks"
    | "sessions"
    | "killzones"
    | "signals"
    | "sweeps"
    | "breakers"
    | "oteBands"
    | "pdZones"
    | "inversionFvgSignals"
    | "tradeMarkers"
    | "structureSegments"
    | "eqConnectors",
    boolean
  >;
};

type HoverSnapshot = {
  timeLabel: string | null;
  point: { x: number; y: number } | null;
  price: number | null;
  candle: Candle | null;
};

const EMPTY_HOVER_SNAPSHOT: HoverSnapshot = {
  timeLabel: null,
  point: null,
  price: null,
  candle: null,
};

function areHoverPointsEqual(
  left: HoverSnapshot["point"],
  right: HoverSnapshot["point"],
) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.x === right.x && left.y === right.y;
}

function areCandlesEqual(left: Candle | null, right: Candle | null) {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.t === right.t &&
    left.o === right.o &&
    left.h === right.h &&
    left.l === right.l &&
    left.c === right.c &&
    left.v === right.v
  );
}

function areHoverSnapshotsEqual(left: HoverSnapshot, right: HoverSnapshot) {
  return (
    left.timeLabel === right.timeLabel &&
    left.price === right.price &&
    areHoverPointsEqual(left.point, right.point) &&
    areCandlesEqual(left.candle, right.candle)
  );
}

export function ChartPanel({
  symbol,
  timeframe,
  leftPanelOpen = true,
  rightPanelOpen = true,
  onToggleLeftPanel,
  onToggleRightPanel,
  backtest,
  backtestTotal,
  candles,
  fullCandles,
  swings,
  gaps,
  orderBlocks,
  signals = [],
  notificationSignals,
  backtestSignals,
  structureShifts,
  sweeps,
  breakerBlocks,
  equalHighsLows,
  htfLevels,
  dataSource,
  premiumDiscount,
  selectedSetup = "all",
  bias,
  latestPrice,
  model2022,
  onSignalPromptChange,
  dismissSignalPromptToken,
  takeSignalPromptToken,
  overlays,
}: Props) {
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const gapZonesRef = useRef<IPriceLine[]>([]);
  const obZonesRef = useRef<IPriceLine[]>([]);
  const pdLinesRef = useRef<IPriceLine[]>([]);
  const oteLinesRef = useRef<IPriceLine[]>([]);
  const eqLinesRef = useRef<IPriceLine[]>([]);
  const htfLinesRef = useRef<IPriceLine[]>([]);
  const slTpLinesRef = useRef<IPriceLine[]>([]);
  const legOteLinesRef = useRef<IPriceLine[]>([]);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<UTCTimestamp> | null>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [chartHeight, setChartHeight] = useState(0);
  const [markersPluginReady, setMarkersPluginReady] = useState(0);
  const {
    drawingMode,
    setDrawingMode,
    drawings,
    addDrawing,
    clearDrawings,
    clockTz,
    setClockTz: updateClockTz,
    notificationsEnabled,
    waitForRetest,
    optimizerEnabled,
    addTrade,
    trades,
    updateTrade,
    setBacktest: patchBacktest,
    alertStatus,
    setAlertStatus,
    pushAlertRelayEvent,
  } = useAppStore(
    useShallow((state) => ({
      drawingMode: state.drawingMode,
      setDrawingMode: state.setDrawingMode,
      drawings: state.drawings,
      addDrawing: state.addDrawing,
      clearDrawings: state.clearDrawings,
      clockTz: state.clockTz,
      setClockTz: state.setClockTz,
      notificationsEnabled: state.notificationsEnabled,
      waitForRetest: state.waitForRetest,
      optimizerEnabled: state.optimizerEnabled,
      addTrade: state.addTrade,
      trades: state.backtest.trades,
      updateTrade: state.updateTrade,
      setBacktest: state.setBacktest,
      alertStatus: state.alertStatus,
      setAlertStatus: state.setAlertStatus,
      pushAlertRelayEvent: state.pushAlertRelayEvent,
    })),
  );
  const candlesSnapshotRef = useRef(candles);
  candlesSnapshotRef.current = candles;
  const clockTzRef = useRef(clockTz);
  clockTzRef.current = clockTz;
  const [hoverSnapshot, setHoverSnapshot] = useState<HoverSnapshot>(EMPTY_HOVER_SNAPSHOT);
  const [lastTzTime, setLastTzTime] = useState<string | null>(null);
  const [timelineTicks, setTimelineTicks] = useState<{ label: string; position: number }[]>([]);
  type SessionShade = {
    id: string;
    left: number;
    width: number;
    label: string;
    color: string;
    gradient?: string;
    textColor?: string;
  };
  const [sessionBands, setSessionBands] = useState<SessionShade[]>([]);
  const [killZoneBands, setKillZoneBands] = useState<SessionShade[]>([]);
  const [fvgBoxes, setFvgBoxes] = useState<OverlayBox[]>([]);
  const [obBoxes, setObBoxes] = useState<OverlayBox[]>([]);
  const [breakerBoxes, setBreakerBoxes] = useState<OverlayBox[]>([]);
  const [pdZones, setPdZones] = useState<OverlayBox[]>([]);
  const [oteBoxes, setOteBoxes] = useState<OverlayBox[]>([]);
  const [model2022Boxes, setModel2022Boxes] = useState<OverlayBox[]>([]);
  const [signalBoxes, setSignalBoxes] = useState<OverlayBox[]>([]);
  const [tradeBoxes, setTradeBoxes] = useState<OverlayBox[]>([]);
  const [structureSegments, setStructureSegments] = useState<OverlayBox[]>([]);
  const [eqSegments, setEqSegments] = useState<
    Array<{ id: string; x1: number; x2: number; y: number; label: string; color: string }>
  >([]);
  const [viewportVersion, setViewportVersion] = useState(0);
  const [pendingPoints, setPendingPoints] = useState<{ time: number; price: number }[]>([]);
  const [previewPoint, setPreviewPoint] = useState<{ time: number; price: number } | null>(null);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const pointerIdRef = useRef<number | null>(null);
  const pointerMovedRef = useRef(false);
  const [panMode, setPanMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [signalPrompt, setSignalPrompt] = useState<Signal | null>(null);
  const [signalPromptScore, setSignalPromptScore] = useState<number | null>(null);
  const lastPromptedSignalRef = useRef<number | null>(null);
  const dismissSignalPromptTokenRef = useRef(dismissSignalPromptToken ?? 0);
  const takeSignalPromptTokenRef = useRef(takeSignalPromptToken ?? 0);
  const viewportSyncFrameRef = useRef<number | null>(null);
  const viewportSyncUntilRef = useRef(0);
  const promptSignalSource = backtest?.enabled
    ? notificationSignals ?? signals
    : backtestSignals ?? notificationSignals ?? signals;
  const promptSignals = useMemo(() => promptSignalSource ?? [], [promptSignalSource]);
  const [manualTradePrompt, setManualTradePrompt] = useState<{
    x: number;
    y: number;
    price: number;
    time: number;
  } | null>(null);
  const manualMenuRef = useRef<HTMLDivElement | null>(null);
  const backtestSignalSource = backtestSignals ?? notificationSignals ?? signals;
  const chartSignals = useMemo(() => {
    const source = backtest?.enabled
      ? notificationSignals ?? signals
      : signals.length
        ? signals
        : notificationSignals ?? signals;
    return source ?? [];
  }, [backtest?.enabled, notificationSignals, signals]);
  const chartTrades = useMemo(() => backtest?.trades ?? trades ?? [], [backtest?.trades, trades]);
  const lastSignalFeed = backtestSignals ?? notificationSignals ?? signals;
  const lastSignal =
    lastSignalFeed && lastSignalFeed.length ? lastSignalFeed.at(-1)! : null;
  const backtestCandles = fullCandles && fullCandles.length ? fullCandles : candles;
  const datasetKey = `${symbol ?? "?"}-${timeframe ?? "?"}`;
  const signalStorageKey = useMemo(() => `ict:last-signal:${datasetKey}`, [datasetKey]);
  const lastDatasetKeyRef = useRef(datasetKey);
  const lastCandleTimeRef = useRef<number | null>(candles.at(-1)?.t ?? null);
  const timeframeMs = useMemo(() => timeframeToMs(timeframe), [timeframe]);
  const swingStrengthMap = useMemo(() => {
    const map = new Map<number, "strong" | "weak">();
    model2022?.strongSwings.forEach((sw) => map.set(sw.time, sw.strength));
    return map;
  }, [model2022]);
  const staleSignalThreshold = useMemo(
    () => Math.max(timeframeMs * 2, 15 * 60_000),
    [timeframeMs],
  );
  const retestWindowMs = useMemo(
    () => Math.max(timeframeMs, 60_000) * RETEST_WINDOW_BARS,
    [timeframeMs],
  );
  const persistLastPromptedSignal = useCallback(
    (timestamp: number | null) => {
      lastPromptedSignalRef.current = timestamp;
      if (typeof window === "undefined" || timestamp == null || !Number.isFinite(timestamp)) return;
      try {
        window.localStorage.setItem(signalStorageKey, String(timestamp));
      } catch {
        // ignore persistence errors
      }
    },
    [signalStorageKey],
  );
  const atrSeries = useMemo(() => computeAtrSeries(candles, 14), [candles]);
  const matchesSelectedSetup = useCallback(
    (setup?: string) => {
      if (!setup) return false;
      if (selectedSetup === "all") return true;
      if (selectedSetup === "advanced") return ADVANCED_SETUPS.has(setup);
      return setup === selectedSetup;
    },
    [selectedSetup],
  );
  const totalCandles = backtestTotal ?? candles.length;
  const backtestCurrent = backtest?.enabled ? Math.min(backtest.cursor + 1, Math.max(totalCandles, 1)) : null;
  const backtestProgress =
    backtest?.enabled && totalCandles > 0 ? Math.min(1, Math.max(0, (backtestCurrent ?? 0) / totalCandles)) : null;
  const buildSignalId = useCallback(
    (signal: Signal) => `${signal.direction}-${signal.time}-${signal.setup ?? "ict"}`,
    [],
  );
  const supportsRetestEntry = useCallback(
    (signal: Signal) => Boolean(signal.setup && RETEST_CAPABLE_SETUPS.has(signal.setup)),
    [],
  );
  const stopViewportSync = useCallback(() => {
    if (viewportSyncFrameRef.current != null && typeof window !== "undefined") {
      window.cancelAnimationFrame(viewportSyncFrameRef.current);
    }
    viewportSyncFrameRef.current = null;
    viewportSyncUntilRef.current = 0;
  }, []);
  const nudgeViewportSync = useCallback((durationMs = 160) => {
    if (typeof window === "undefined") return;
    const now = window.performance.now();
    viewportSyncUntilRef.current = Math.max(viewportSyncUntilRef.current, now + durationMs);
    if (viewportSyncFrameRef.current != null) return;
    const tick = () => {
      setViewportVersion((v) => v + 1);
      if (window.performance.now() < viewportSyncUntilRef.current) {
        viewportSyncFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        viewportSyncFrameRef.current = null;
      }
    };
    viewportSyncFrameRef.current = window.requestAnimationFrame(tick);
  }, []);
  const enterDemoTradeFromSignal = useCallback(
    (
      signal: Signal,
      overrides: Partial<BacktestTrade> = {},
      force = false,
    ): BacktestTrade | null => {
      if (!addTrade) return null;
      const signalId = overrides.signalId ?? buildSignalId(signal);
      if (!force && seenSignalIdsRef.current.has(signalId)) return null;
      let stop =
        overrides.stop ??
        signal.stop ??
        (signal.direction === "buy" ? signal.price * (1 - 0.001) : signal.price * (1 + 0.001));
      let directionalRisk = signal.direction === "buy" ? signal.price - stop : stop - signal.price;
      if (directionalRisk <= 0) {
        const fallback = Math.abs(signal.price) * 0.0008;
        stop = signal.direction === "buy" ? signal.price - fallback : signal.price + fallback;
        directionalRisk = fallback;
      }
      const baseRisk = Math.max(directionalRisk, Math.abs(signal.price) * 0.0005);
      const risk = overrides.risk ?? baseRisk;
      const isTierOneSetup = TIER_ONE_SETUPS.has(signal.setup ?? "");
      const partialFraction = !isTierOneSetup ? 0.5 : undefined;
      const takePartial =
        overrides.takePartial ??
        (!isTierOneSetup
          ? signal.direction === "buy"
            ? signal.price + risk * 2
            : signal.price - risk * 2
          : undefined);
      const positionSize = overrides.positionSize ?? signal.sizeMultiplier ?? 1;
      const target =
        overrides.target ??
        signal.tp1 ??
        signal.tp2 ??
        signal.tp3 ??
        signal.tp4 ??
        (signal.direction === "buy" ? signal.price + risk : signal.price - risk);
      const rMultiple =
        overrides.rMultiple ??
        (risk > 0 ? Math.abs(target - signal.price) / risk : undefined);
      const shouldWaitForRetest =
        waitForRetest &&
        !overrides.manual &&
        supportsRetestEntry(signal) &&
        overrides.status == null &&
        overrides.openTime == null &&
        overrides.armedAt == null;
      const trade: BacktestTrade = {
        id: overrides.id ?? `bt-${signal.setup ?? "ict"}-${signal.time}-${Math.random().toString(36).slice(2, 6)}`,
        symbol,
        timeframe,
        direction: overrides.direction ?? signal.direction,
        entry: overrides.entry ?? signal.price,
        stop,
        target,
        rMultiple,
        setup: signal.setup,
        signalId,
        initialStop: overrides.initialStop ?? stop,
        risk,
        takePartial,
        partialFraction,
        partialHit: overrides.partialHit ?? false,
        partialRealized: overrides.partialRealized,
        openTime: overrides.openTime ?? (shouldWaitForRetest ? undefined : signal.time),
        positionSize,
        sessionLabel: overrides.sessionLabel ?? signal.session ?? undefined,
        biasLabel: overrides.biasLabel ?? signal.bias ?? undefined,
        armedAt: overrides.armedAt ?? (shouldWaitForRetest ? signal.time : undefined),
        expiresAt: overrides.expiresAt ?? (shouldWaitForRetest ? signal.time + retestWindowMs : undefined),
        status: overrides.status ?? (shouldWaitForRetest ? "planned" : "active"),
        ...overrides,
      };
      addTrade(trade);
      seenSignalIdsRef.current.add(signalId);
      return trade;
    },
    [addTrade, buildSignalId, retestWindowMs, symbol, supportsRetestEntry, timeframe, waitForRetest],
  );
  const runAutoBacktest = () => {
    if (!backtest?.enabled || !patchBacktest) {
      setAutoError("Enable backtest before auto trading.");
      return;
    }
    if (!backtest.autoTrade) {
      setAutoError("Turn on auto trade before running this tool.");
      return;
    }
    if (backtestCandles.length < 2) {
      setAutoError("Not enough candles.");
      return;
    }
    const start = clamp(autoStartPct, 0, 100);
    const end = clamp(autoEndPct, 0, 100);
    if (end <= start) {
      setAutoError("End % must be greater than start %.");
      return;
    }
    const startIdx = Math.max(0, Math.min(backtestCandles.length - 2, Math.floor(((start / 100) * (backtestCandles.length - 1)))));
    const endIdx = Math.max(startIdx + 1, Math.min(backtestCandles.length - 1, Math.floor(((end / 100) * (backtestCandles.length - 1)))));
    const startTime = backtestCandles[startIdx].t;
    const endTime = backtestCandles[endIdx].t;
    const relevantSignals = backtestSignalSource.filter(
      (s) => matchesSelectedSetup(s.setup) && s.time >= startTime && s.time <= endTime,
    );
    if (relevantSignals.length === 0) {
      setAutoError("No signals in selected range.");
      return;
    }
    setAutoError(null);
    setAutoRunning(true);
    let wins = 0;
    let losses = 0;
    let balanceDelta = 0;
    let added = 0;
    for (const signal of relevantSignals) {
      const shouldWaitForRetestEntry = waitForRetest && supportsRetestEntry(signal);
      const stop =
        signal.stop ??
        (signal.direction === "buy" ? signal.price * (1 - 0.001) : signal.price * (1 + 0.001));
      const risk = Math.max(Math.abs(signal.price - stop), Math.abs(signal.price) * 0.0005);
      const isTierOneSetup = TIER_ONE_SETUPS.has(signal.setup ?? "");
      const partialFraction = !isTierOneSetup ? 0.5 : undefined;
      const takePartial = !isTierOneSetup
        ? signal.direction === "buy"
          ? signal.price + risk * 2
          : signal.price - risk * 2
        : undefined;
      const positionSize = signal.sizeMultiplier ?? 1;
      const target =
        signal.tp1 ??
        signal.tp2 ??
        signal.tp3 ??
        signal.tp4 ??
        (signal.direction === "buy" ? signal.price + risk : signal.price - risk);
      const rMultiple = risk > 0 ? Math.abs(target - signal.price) / risk : undefined;
      const tradeBase: BacktestTrade = {
        id: `auto-${signal.setup ?? "ict"}-${signal.time}-${Math.random().toString(36).slice(2, 6)}`,
        direction: signal.direction,
        entry: signal.price,
        stop,
        target,
        rMultiple,
        initialStop: stop,
        risk,
        takePartial,
        partialFraction,
        openTime: shouldWaitForRetestEntry ? undefined : signal.time,
        positionSize,
        armedAt: shouldWaitForRetestEntry ? signal.time : undefined,
        expiresAt: shouldWaitForRetestEntry ? signal.time + retestWindowMs : undefined,
        status: shouldWaitForRetestEntry ? "planned" : "active",
      };
      const outcome = simulateTradeOutcome(signal, tradeBase, backtestCandles, startIdx, endIdx, {
        waitForRetest: shouldWaitForRetestEntry,
      });
      if (shouldWaitForRetestEntry && outcome.openTime == null) {
        continue;
      }
      const trade = enterDemoTradeFromSignal(
        signal,
        {
          ...tradeBase,
          ...outcome,
          signalId: buildSignalId(signal),
        },
        true,
      );
      if (!trade) continue;
      added++;
      if (trade.result === "win") wins++;
      if (trade.result === "loss") losses++;
      balanceDelta += trade.pnl ?? 0;
    }
    const newBalance = (backtest.balance ?? 0) + balanceDelta;
    patchBacktest?.({ balance: newBalance });
    setAutoSummary({ trades: added, wins, losses });
    setAutoRunning(false);
  };

  const convertCoordTime = useCallback((value: Time | null): number | null => {
    if (value == null) return null;
    if (typeof value === "number") return value * 1000;
    if (typeof value === "object" && "year" in value) {
      return Date.UTC(value.year, (value.month ?? 1) - 1, value.day ?? 1);
    }
    return null;
  }, []);

  const handleManualTrade = useCallback(
    (direction: "buy" | "sell") => {
      if (!manualTradePrompt) return;
      const session = classifySession(new Date(manualTradePrompt.time), SESSION_ZONES);
      const manualSignal: Signal = {
        time: manualTradePrompt.time,
        price: manualTradePrompt.price,
        direction,
        basis: "Manual chart trade",
        setup: "Manual Chart Trade",
        session: session?.label ?? null,
        bias: bias?.label,
      };
      enterDemoTradeFromSignal(manualSignal, { manual: true, status: "planned" }, true);
      setManualTradePrompt(null);
    },
    [manualTradePrompt, bias?.label, enterDemoTradeFromSignal],
  );

  const handleChartContextMenu = useCallback(
    (evt: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current || !chartRef.current || !seriesRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const inside =
        evt.clientX >= rect.left &&
        evt.clientX <= rect.right &&
        evt.clientY >= rect.top &&
        evt.clientY <= rect.bottom;
      if (!inside) return;
      evt.preventDefault();
      const relX = evt.clientX - rect.left;
      const relY = evt.clientY - rect.top;
      const price = seriesRef.current.coordinateToPrice(relY);
      if (price == null || !Number.isFinite(price)) {
        setManualTradePrompt(null);
        return;
      }
      const timeValue = chartRef.current.timeScale().coordinateToTime(relX);
      const timeMs = convertCoordTime(timeValue ?? null) ?? candlesSnapshotRef.current.at(-1)?.t ?? Date.now();
      setManualTradePrompt({
        x: relX,
        y: relY,
        price: Number(price),
        time: timeMs,
      });
    },
    [convertCoordTime],
  );
  const hoverSnapshotRef = useRef<HoverSnapshot>(EMPTY_HOVER_SNAPSHOT);
  const pendingHoverSnapshotRef = useRef<HoverSnapshot | null>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const hoverPoint = hoverSnapshot.point;
  const hoverPrice = hoverSnapshot.price;
  const hoverCandle = hoverSnapshot.candle;
  const hoverTzTime = hoverSnapshot.timeLabel;
  const [autoStartPct, setAutoStartPct] = useState(0);
  const [autoEndPct, setAutoEndPct] = useState(100);
  const [autoSummary, setAutoSummary] = useState<{ trades: number; wins: number; losses: number } | null>(null);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const [setupStats, setSetupStats] = useState<Record<string, { wins: number; losses: number; winR: number; lossR: number }>>({});
  const setupStatsEntries = useMemo(
    () =>
      Object.entries(setupStats)
        .map(([setupName, stat]) => {
          const wins = stat.wins;
          const losses = stat.losses;
          const total = wins + losses;
          const avgWin = wins ? stat.winR / wins : 0;
          const avgLoss = losses ? stat.lossR / losses : 0;
          const winRate = total ? (wins / total) * 100 : 0;
          return { setup: setupName, wins, losses, total, avgWin, avgLoss, winRate };
        })
        .sort((a, b) => b.total - a.total || b.winRate - a.winRate || a.setup.localeCompare(b.setup)),
    [setupStats],
  );
  const seenSignalIdsRef = useRef<Set<string>>(new Set());
  const processedTradeIdsRef = useRef<Set<string>>(new Set());
  const flushHoverSnapshot = useCallback((next: HoverSnapshot) => {
    if (areHoverSnapshotsEqual(hoverSnapshotRef.current, next)) return;
    hoverSnapshotRef.current = next;
    setHoverSnapshot(next);
  }, []);
  const queueHoverSnapshot = useCallback(
    (next: HoverSnapshot) => {
      if (typeof window === "undefined") {
        flushHoverSnapshot(next);
        return;
      }
      pendingHoverSnapshotRef.current = next;
      if (hoverFrameRef.current != null) return;
      hoverFrameRef.current = window.requestAnimationFrame(() => {
        hoverFrameRef.current = null;
        const pending = pendingHoverSnapshotRef.current;
        pendingHoverSnapshotRef.current = null;
        if (pending) {
          flushHoverSnapshot(pending);
        }
      });
    },
    [flushHoverSnapshot],
  );
  const copySetupStats = useCallback(() => {
    if (!Object.keys(setupStats).length || typeof navigator === "undefined") return;
    const payload = Object.entries(setupStats)
      .map(([setup, stat]) => {
        const avgWin = stat.wins ? (stat.winR / stat.wins).toFixed(2) : "-";
        const avgLoss = stat.losses ? (stat.lossR / stat.losses).toFixed(2) : "-";
        return `${setup}: W ${stat.wins} / L ${stat.losses} (avg ${avgWin}/${avgLoss}R)`;
      })
      .join("\n");
    navigator.clipboard?.writeText(payload).catch(() => {});
  }, [setupStats]);
  const logTradeOutcome = useCallback((trade: BacktestTrade) => {
    if (typeof window === "undefined") return;
    if (!symbol || !timeframe) return;
    if (!trade.setup) return;
    if (trade.result !== "win" && trade.result !== "loss") return;
    const size = trade.positionSize ?? 1;
    const effectiveRisk = trade.risk && trade.risk > 0 ? trade.risk : undefined;
    const pnlPerUnit = trade.pnl != null ? trade.pnl / size : undefined;
    const computedR =
      trade.rMultiple ??
      (effectiveRisk && effectiveRisk > 0 && pnlPerUnit != null
        ? pnlPerUnit / effectiveRisk
        : trade.result === "win"
          ? 1
          : -1);
    const exitPrice =
      pnlPerUnit != null
        ? trade.direction === "buy"
          ? trade.entry + pnlPerUnit
          : trade.entry - pnlPerUnit
        : trade.result === "win"
          ? trade.target
          : trade.stop;
    postTradeJournalEntry({
      symbol: trade.symbol ?? symbol,
      timeframe: trade.timeframe ?? timeframe,
      setup: trade.setup,
      session: trade.sessionLabel ?? "Unknown",
      bias: trade.biasLabel ?? "Neutral",
      direction: trade.direction,
      result: trade.result,
      rMultiple: Number.isFinite(computedR) ? computedR : trade.result === "win" ? 1 : -1,
      entryPrice: trade.entry,
      exitPrice,
      stopPrice: trade.stop,
      takeProfitPrice: trade.target,
      executedAt: trade.openTime ?? trade.exitTime ?? Date.now(),
      closedAt: trade.exitTime ?? Date.now(),
    })
      .then(() =>
        queryClient.invalidateQueries({
          queryKey: tradeJournalScopeQueryKey(trade.symbol ?? symbol, trade.timeframe ?? timeframe),
        }),
      )
      .catch(() => {});
  }, [queryClient, symbol, timeframe]);
  useEffect(() => {
    setPendingPoints([]);
    setPreviewPoint(null);
    setIsPointerDown(false);
    pointerIdRef.current = null;
    pointerMovedRef.current = false;
  }, [drawingMode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(signalStorageKey);
      const parsed = stored ? Number(stored) : null;
      lastPromptedSignalRef.current = Number.isFinite(parsed) ? parsed : null;
    } else {
      lastPromptedSignalRef.current = null;
    }
    if (lastDatasetKeyRef.current !== datasetKey) {
      lastDatasetKeyRef.current = datasetKey;
      setSignalPrompt(null);
      setSignalPromptScore(null);
      seenSignalIdsRef.current.clear();
    }
  }, [datasetKey, signalStorageKey]);

  useEffect(() => {
    onSignalPromptChange?.(signalPrompt, signalPromptScore);
  }, [signalPrompt, signalPromptScore, onSignalPromptChange]);

  useEffect(() => {
    return () => {
      onSignalPromptChange?.(null, null);
    };
  }, [onSignalPromptChange]);

  useEffect(() => {
    if (dismissSignalPromptToken == null) return;
    if (dismissSignalPromptTokenRef.current === dismissSignalPromptToken) return;
    dismissSignalPromptTokenRef.current = dismissSignalPromptToken;
    setSignalPrompt(null);
    setSignalPromptScore(null);
  }, [dismissSignalPromptToken]);

  useEffect(() => {
    if (takeSignalPromptToken == null) return;
    if (takeSignalPromptTokenRef.current === takeSignalPromptToken) return;
    takeSignalPromptTokenRef.current = takeSignalPromptToken;
    if (signalPrompt) {
      enterDemoTradeFromSignal(signalPrompt, {}, true);
    }
    setSignalPrompt(null);
    setSignalPromptScore(null);
  }, [enterDemoTradeFromSignal, signalPrompt, takeSignalPromptToken]);

  useEffect(() => {
    const wantsAuto = Boolean(backtest?.autoTrade);
    if (!notificationsEnabled && !wantsAuto) {
      setAlertStatus(null);
      return;
    }
    if (backtest?.enabled) {
      setAlertStatus({
        status: "paused",
        message: "Alerts follow Backtest playback. Disable Backtest for live alerts.",
        since: Date.now(),
      });
      return;
    }
    if (!alertRelayConfigured && !wantsAuto) {
      setAlertStatus({
        status: "paused",
        message: "Relay adapter not configured. Chart entries are local only.",
        detail: "Set ALERT_WEBHOOK_URL or ALERT_EXECUTION_URL, and optionally NEXT_PUBLIC_ALERT_RELAY_MODE for the UI badge.",
        since: Date.now(),
      });
      return;
    }
    const latestTime = candles.at(-1)?.t ?? null;
    const lastSignalTime = lastSignal?.time ?? null;
    if (!latestTime || !lastSignalTime) {
      setAlertStatus({
        status: "stale",
        message: "Awaiting first actionable entry alert…",
        since: Date.now(),
      });
      return;
    }
    const signalIsCurrent = lastSignalTime === latestTime;
    const signalAgeMs = Math.max(0, latestTime - lastSignalTime);
    if (!signalIsCurrent) {
      setAlertStatus({
        status: "stale",
        message: "Latest signal is historical and no longer actionable.",
        detail: "The bot only announces or auto-trades signals on the current candle. It does not enter retroactively on prior candles.",
        since: lastSignalTime,
      });
    } else if (signalAgeMs > staleSignalThreshold) {
      setAlertStatus({
        status: "stale",
        message: "Latest signal is historical and no longer actionable.",
        detail: "Only the newest fresh signal is eligible for relay or auto-trade. Older chart signals remain visible for review.",
        since: lastSignalTime,
      });
    } else {
      setAlertStatus({
        status: "live",
        message: `${alertRelayConfigured ? `${alertRelayLabel} adapter live` : "Auto-trade relay live"} · latest signal is actionable`,
        detail: "Only the newest fresh signal is relayed. Historical chart entries do not trigger the bot retroactively.",
        since: lastSignalTime,
      });
    }
  }, [
    notificationsEnabled,
    backtest?.enabled,
    backtest?.autoTrade,
    candles,
    lastSignal?.time,
    setAlertStatus,
    staleSignalThreshold,
  ]);

  useEffect(() => {
    const next = new Set<string>();
    trades.forEach((trade) => {
      if (trade.signalId) next.add(trade.signalId);
    });
    seenSignalIdsRef.current = next;
  }, [trades]);

  useEffect(() => {
    trades.forEach((trade) => {
      if (!trade.result || processedTradeIdsRef.current.has(trade.id)) return;
      processedTradeIdsRef.current.add(trade.id);
      logTradeOutcome(trade);
      if (!trade.setup) return;
      const key = trade.setup;
      const isWin = trade.result === 'win';
      const rMultiple =
        trade.rMultiple ??
        (trade.risk && trade.risk > 0 ? (trade.pnl ?? 0) / trade.risk : trade.pnl ?? 0);
      setSetupStats((prev) => {
        const stat = prev[key] ?? { wins: 0, losses: 0, winR: 0, lossR: 0 };
        const next = { ...stat };
        if (isWin) {
          next.wins += 1;
          next.winR += rMultiple;
        } else {
          next.losses += 1;
          next.lossR += rMultiple;
        }
        return { ...prev, [key]: next };
      });
    });
  }, [trades, logTradeOutcome]);

  useEffect(() => {
    if (trades.length === 0) {
      processedTradeIdsRef.current.clear();
      setSetupStats({});
    }
  }, [trades.length]);

  useEffect(() => {
    const latest = candles.at(-1)?.t ?? null;
    if (latest == null) return;
    if (
      backtest?.enabled &&
      signalPrompt &&
      lastCandleTimeRef.current !== null &&
      latest > lastCandleTimeRef.current
    ) {
      setSignalPrompt(null);
      setSignalPromptScore(null);
    }
    lastCandleTimeRef.current = latest;
  }, [candles, backtest?.enabled, signalPrompt]);

  useEffect(() => {
    if (trades.length === 0 || candles.length === 0 || !updateTrade) return;
    const latestIdx = candles.length - 1;
    if (latestIdx < 0) return;
    const latest = candles[latestIdx];
    const latestAtr = atrSeries[latestIdx] ?? 0;
    trades.forEach((trade) => {
      const status = trade.status ?? (trade.result ? "closed" : "active");
      if (status === "planned") {
        if (trade.expiresAt != null && latest.t > trade.expiresAt) {
          updateTrade(trade.id, {
            status: "canceled",
            exitTime: latest.t,
            armedAt: undefined,
            expiresAt: undefined,
          });
          return;
        }
        if (trade.entry == null) {
          return;
        }
        const canActivate = trade.armedAt == null || latest.t > trade.armedAt;
        if (!canActivate) {
          return;
        }
        const entryHit = latest.l <= trade.entry && latest.h >= trade.entry;
        if (entryHit) {
          updateTrade(trade.id, {
            status: "active",
            openTime: latest.t,
            armedAt: undefined,
            expiresAt: undefined,
          });
        }
        return;
      }
      if (status !== "active") return;
      if (trade.result) return;
      if (trade.stop == null || trade.target == null) return;
      if (trade.openTime == null) {
        updateTrade(trade.id, { openTime: latest.t });
        return;
      }
      if (latest.t <= trade.openTime) {
        return;
      }
      const isManual = trade.manual === true || !trade.signalId;
      if (isManual) {
        const { direction, stop, target, entry } = trade;
        let outcome: "win" | "loss" | null = null;
        if (direction === "buy") {
          if (latest.l <= stop) outcome = "loss";
          else if (latest.h >= target) outcome = "win";
        } else {
          if (latest.h >= stop) outcome = "loss";
          else if (latest.l <= target) outcome = "win";
        }
        if (!outcome) return;
        const size = trade.positionSize ?? 1;
        const pnl =
          (direction === "buy"
            ? outcome === "win"
              ? target - entry
              : stop - entry
            : outcome === "win"
              ? entry - target
              : entry - stop) * size;
        updateTrade(trade.id, { result: outcome, pnl, exitTime: latest.t, status: "closed" });
        return;
      }
      const initialStop = trade.initialStop ?? trade.stop;
      const computedRisk = trade.risk ?? (initialStop != null ? Math.abs(trade.entry - initialStop) : 0);
      if (trade.takePartial != null && !trade.partialHit) {
        const hitPartial =
          trade.direction === "buy"
            ? latest.h >= trade.takePartial
            : latest.l <= trade.takePartial;
        if (hitPartial) {
          const move = trade.direction === "buy" ? trade.takePartial - trade.entry : trade.entry - trade.takePartial;
          const fraction = trade.partialFraction ?? 0.5;
          const size = trade.positionSize ?? 1;
          const realized = fraction * move * size;
          updateTrade(trade.id, {
            stop: trade.entry,
            breakevenTriggered: true,
            partialRealized: (trade.partialRealized ?? 0) + realized,
            partialHit: true,
          });
          return;
        }
      }
      const breakevenDistance = computedRisk * 1.5;
      if (
        computedRisk > 0 &&
        !trade.breakevenTriggered &&
        ((trade.direction === "buy" && latest.h >= trade.entry + breakevenDistance) ||
          (trade.direction === "sell" && latest.l <= trade.entry - breakevenDistance))
      ) {
        const beStop = trade.direction === "buy" ? trade.entry : trade.entry;
        updateTrade(trade.id, { stop: beStop, breakevenTriggered: true });
        return;
      }
      if (trade.breakevenTriggered && latestAtr > 0) {
        const buffer = latestAtr * 0.5;
        if (trade.direction === "buy") {
          const newStop = Math.max(trade.stop ?? trade.entry, latest.c - buffer);
          if (newStop > (trade.stop ?? 0) + 1e-6) {
            updateTrade(trade.id, { stop: newStop });
            return;
          }
        } else {
          const newStop = Math.min(trade.stop ?? trade.entry, latest.c + buffer);
          if (newStop < (trade.stop ?? 0) - 1e-6) {
            updateTrade(trade.id, { stop: newStop });
            return;
          }
        }
      }
      const { direction, stop, target, entry } = trade;
      let outcome: "win" | "loss" | null = null;
      if (direction === "buy") {
        if (latest.l <= stop) {
          outcome = "loss";
        } else if (latest.h >= target) {
          outcome = "win";
        }
      } else {
        if (latest.h >= stop) {
          outcome = "loss";
        } else if (latest.l <= target) {
          outcome = "win";
        }
      }
      if (!outcome) return;
      const move =
        direction === "buy"
          ? outcome === "win"
            ? target - entry
            : stop - entry
          : outcome === "win"
            ? entry - target
            : entry - stop;
      const remainingFraction = trade.partialHit ? 1 - (trade.partialFraction ?? 0.5) : 1;
      const size = trade.positionSize ?? 1;
      const pnl = (trade.partialRealized ?? 0) + move * remainingFraction * size;
      updateTrade(trade.id, { result: outcome, pnl, exitTime: latest.t, status: "closed" });
    });
  }, [backtest?.enabled, trades, candles, atrSeries, updateTrade]);

  useEffect(() => {
    if (drawingMode !== "none" && panMode) {
      setPanMode(false);
      setIsPanning(false);
    }
  }, [drawingMode, panMode]);

  useEffect(() => {
    if (!panMode) return;
    const handlePointerEnd = () => setIsPanning(false);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [panMode]);
  const DRAW_COLORS: Record<DrawingType, string> = {
    hline: "#fbbf24",
    trend: "#22d3ee",
    rect: "#f97316",
    fibo: "#f472b6",
    measure: "#a5b4fc",
    long: "#34d399",
    short: "#f87171",
  };

  const TOOL_CONFIG: Record<
    DrawingType,
    {
      points: number;
      dragPreview: boolean;
      autoTargetR?: number;
    }
  > = {
    hline: { points: 1, dragPreview: false },
    trend: { points: 2, dragPreview: true },
    rect: { points: 2, dragPreview: true },
    fibo: { points: 2, dragPreview: true },
    measure: { points: 2, dragPreview: true },
    long: { points: 2, dragPreview: true, autoTargetR: 2 },
    short: { points: 2, dragPreview: true, autoTargetR: 2 },
  };

  const buildDrawingPoints = (
    type: DrawingType,
    points: { time: number; price: number }[],
    preview = false,
  ) => {
    const config = TOOL_CONFIG[type];
    const normalized = points.slice(0, config.points);
    if ((type !== "long" && type !== "short") || normalized.length < 2) {
      return normalized;
    }

    const [entry, stop] = normalized;
    if (!entry || !stop) {
      return normalized;
    }

    const risk = Math.abs(entry.price - stop.price);
    if (risk <= Number.EPSILON) {
      return normalized;
    }

    const rewardMultiple = config.autoTargetR ?? 2;
    const direction = type === "long" ? 1 : -1;
    const target = {
      time: Math.max(entry.time, stop.time),
      price: entry.price + risk * rewardMultiple * direction,
    };

    if (preview) {
      return [entry, stop, target];
    }
    return [entry, stop, target];
  };

  const timeToXCoord = (ms: number) => {
    const coord = chartRef.current?.timeScale().timeToCoordinate((ms / 1000) as UTCTimestamp);
    if (coord == null) return null;
    return Number(coord);
  };

  const priceToYCoord = (price: number) => {
    const coord = seriesRef.current?.priceToCoordinate(price);
    if (coord == null) return null;
    return Number(coord);
  };

  const addNewDrawing = (type: DrawingType, points: { time: number; price: number }[]) => {
    addDrawing({
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      points: buildDrawingPoints(type, points),
      color: DRAW_COLORS[type],
    });
  };

  useEffect(() => {
    if (!manualTradePrompt) return;
    const handlePointerDown = (evt: PointerEvent) => {
      if (manualMenuRef.current && manualMenuRef.current.contains(evt.target as Node)) {
        return;
      }
      setManualTradePrompt(null);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [manualTradePrompt]);

  useEffect(() => {
    if (!manualTradePrompt) return;
    const handleKey = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") {
        setManualTradePrompt(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [manualTradePrompt]);

  const resetDrawingState = () => {
    setPendingPoints([]);
    setPreviewPoint(null);
    setIsPointerDown(false);
    pointerIdRef.current = null;
    pointerMovedRef.current = false;
  };

  const getPointFromPointerEvent = (evt: React.PointerEvent<HTMLDivElement>) => {
    if (!chartRef.current || !seriesRef.current || !containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clamp(evt.clientX - rect.left, 0, rect.width);
    const y = clamp(evt.clientY - rect.top, 0, rect.height);
    const time = chartRef.current.timeScale().coordinateToTime(x);
    const ms = convertCoordTime(time ?? null);
    const price = seriesRef.current.coordinateToPrice(y);
    if (ms == null || price == null) return null;
    return { time: ms, price };
  };

  const finalizeDrawing = (
    points: { time: number; price: number }[],
    type?: DrawingType,
    opts?: { exit?: boolean },
  ) => {
    const effectiveType = type ?? (drawingMode === "none" ? null : drawingMode);
    if (!effectiveType) return;
    addNewDrawing(effectiveType, points);
    resetDrawingState();
    if (opts?.exit) {
      setDrawingMode("none");
    }
  };

  const handlePointerDown = (evt: React.PointerEvent<HTMLDivElement>) => {
    if (panMode) {
      return;
    }
    if (drawingMode === "none") return;
    const config = TOOL_CONFIG[drawingMode];
    if (!config) return;
    const point = getPointFromPointerEvent(evt);
    if (!point) return;
    evt.preventDefault();

    if (!config.dragPreview) {
      const nextPoints = [...pendingPoints, point];
      setPendingPoints(nextPoints);
      if (nextPoints.length === config.points) {
        finalizeDrawing(nextPoints, drawingMode);
      }
      return;
    }

    if (drawingMode === "hline") {
      addNewDrawing("hline", [point]);
      setDrawingMode("none");
      return;
    }

    if (pendingPoints.length === 1 && !isPointerDown) {
      finalizeDrawing([pendingPoints[0], point], drawingMode);
      return;
    }

    setPendingPoints([point]);
    setPreviewPoint(point);
    setIsPointerDown(true);
    pointerMovedRef.current = false;
    pointerIdRef.current = evt.pointerId;
    try {
      evt.currentTarget.setPointerCapture(evt.pointerId);
    } catch {
      pointerIdRef.current = null;
    }
  };

  const handlePointerMove = (evt: React.PointerEvent<HTMLDivElement>) => {
    if (panMode) {
      return;
    }
    if (drawingMode === "none") return;
    if (pendingPoints.length === 0 && !isPointerDown) return;
    const point = getPointFromPointerEvent(evt);
    if (!point) return;
    if (isPointerDown) {
      pointerMovedRef.current = true;
    }
    setPreviewPoint(point);
  };

  const releasePointerCapture = (target: HTMLDivElement) => {
    if (pointerIdRef.current == null) return;
    try {
      target.releasePointerCapture(pointerIdRef.current);
    } catch {
      // ignore release errors
    }
    pointerIdRef.current = null;
  };

  const cancelPointerDrawing = (target: HTMLDivElement) => {
    if (isPointerDown) {
      releasePointerCapture(target);
    }
    resetDrawingState();
  };

  const togglePanMode = () => {
    if (panMode) {
      setPanMode(false);
      setIsPanning(false);
    } else {
      setPanMode(true);
      setDrawingMode("none");
    }
  };

  const handlePointerUp = (evt: React.PointerEvent<HTMLDivElement>) => {
    if (panMode) {
      return;
    }
    if (!isPointerDown) return;
    evt.preventDefault();
    const preview = previewPoint;
    releasePointerCapture(evt.currentTarget);
    setIsPointerDown(false);
    const type = drawingMode === "none" ? null : drawingMode;
    if (pointerMovedRef.current && preview && type && pendingPoints.length > 0) {
      finalizeDrawing([pendingPoints[0], preview], type);
      return;
    }
    pointerMovedRef.current = false;
    setPreviewPoint(null);
  };

  const handlePointerCancel = (evt: React.PointerEvent<HTMLDivElement>) => {
    if (panMode) {
      return;
    }
    if (!isPointerDown) return;
    evt.preventDefault();
    cancelPointerDrawing(evt.currentTarget);
  };

  const handlePointerLeave = (evt: React.PointerEvent<HTMLDivElement>) => {
    if (panMode) {
      return;
    }
    if (!isPointerDown) {
      if (pendingPoints.length === 0) {
        setPreviewPoint(null);
      }
      return;
    }
    if (pointerIdRef.current != null) {
      return;
    }
    evt.preventDefault();
    cancelPointerDrawing(evt.currentTarget);
  };

  const renderPositionDrawing = (drawing: Drawing, key: string, preview: boolean) => {
    if (!chartRef.current || !seriesRef.current) return null;
    const [entry, stop, target] = drawing.points;
    if (!entry || !stop) return null;
    const entryY = priceToYCoord(entry.price);
    const stopY = priceToYCoord(stop.price);
    if (entryY == null || stopY == null) return null;
    const targetY = target ? priceToYCoord(target.price) : null;
    const xCoords = drawing.points
      .filter(Boolean)
      .map((p) => timeToXCoord(p.time))
      .filter((x): x is number => typeof x === "number");
    if (xCoords.length === 0) return null;
    let left = Math.min(...xCoords);
    let right = Math.max(...xCoords);
    let width = Math.max(2, right - left);
    if (width < 60) {
      const pad = (60 - width) / 2;
      left -= pad;
      width = 60;
    }
    const stopTop = Math.min(entryY, stopY);
    const stopHeight = Math.max(2, Math.abs(entryY - stopY));
    const hasTarget = Boolean(target && targetY != null);
    const targetTop = hasTarget ? Math.min(entryY, targetY!) : null;
    const targetHeight = hasTarget ? Math.max(2, Math.abs(entryY - targetY!)) : 0;
    const risk = Math.abs(entry.price - stop.price);
    const reward = hasTarget && target ? Math.abs(target.price - entry.price) : null;
    const rrText = reward && risk > 0 ? (reward / risk).toFixed(2) : null;
    const directionLabel = drawing.type === "long" ? "Long" : "Short";
    const labelText = rrText ? `${directionLabel} • RR ${rrText}` : `${directionLabel}${hasTarget ? "" : " • set target"}`;
    const stopShade = preview ? "rgba(248,113,113,0.35)" : "rgba(248,113,113,0.45)";
    const stopBorder = "rgba(248,113,113,0.8)";
    const profitShade = preview ? "rgba(34,197,94,0.3)" : "rgba(34,197,94,0.45)";
    const profitBorder = "rgba(34,197,94,0.8)";
    return (
      <div key={key} className="pointer-events-none absolute inset-0 z-30">
        <div
          className="absolute text-[11px] font-semibold uppercase tracking-wide text-gray-100 drop-shadow"
          style={{ left, width, top: Math.min(stopTop, targetTop ?? stopTop) - 20 }}
        >
          <div className="flex items-center justify-between gap-2">
            <span>{labelText}</span>
            <span className="text-[10px] font-normal text-gray-300">Entry {formatPrice(entry.price)}</span>
          </div>
        </div>
        <div
          className="absolute border border-dashed border-white/60"
          style={{ left, width, top: entryY }}
        />
        <div
          className="absolute rounded border text-[11px] text-white"
          style={{ left, width, top: stopTop, height: stopHeight, backgroundColor: stopShade, borderColor: stopBorder }}
        >
          <div className="flex h-full flex-col justify-center px-2">
            <span>Stop</span>
            <span className="text-[10px] text-gray-100">{formatPrice(stop.price)}</span>
          </div>
        </div>
        {hasTarget && targetTop != null && (
          <div
            className="absolute rounded border text-[11px] text-white"
            style={{
              left,
              width,
              top: targetTop,
              height: targetHeight,
              backgroundColor: profitShade,
              borderColor: profitBorder,
            }}
          >
            <div className="flex h-full flex-col justify-center px-2">
              <span>Target</span>
              <span className="text-[10px] text-gray-100">{target ? formatPrice(target.price) : "-"}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderActiveSignalGuide = () => {
    if (!signalPrompt || !chartRef.current || !seriesRef.current || chartWidth <= 0 || chartHeight <= 0) {
      return null;
    }
    const entryY = priceToYCoord(signalPrompt.price);
    if (entryY == null) return null;
    const stopPrice = signalPrompt.stop ?? null;
    const targetPrice = signalPrompt.tp1 ?? signalPrompt.tp2 ?? signalPrompt.tp3 ?? signalPrompt.tp4 ?? null;
    const stopY = stopPrice != null ? priceToYCoord(stopPrice) : null;
    const targetY = targetPrice != null ? priceToYCoord(targetPrice) : null;
    const rawAnchorX = timeToXCoord(signalPrompt.time);
    const anchorX =
      rawAnchorX != null
        ? clamp(rawAnchorX, 10, Math.max(10, chartWidth - 140))
        : Math.max(10, chartWidth - 180);
    const zoneLeft = clamp(anchorX + 12, 8, Math.max(8, chartWidth - 180));
    const zoneWidth = Math.max(124, chartWidth - zoneLeft - 10);
    const bullish = signalPrompt.direction === "buy";
    const accent = bullish ? "rgba(74,222,128,0.96)" : "rgba(251,146,60,0.96)";
    const accentBg = bullish ? "rgba(6,78,59,0.88)" : "rgba(124,45,18,0.88)";
    const stopBorder = "rgba(248,113,113,0.92)";
    const stopFill = "rgba(248,113,113,0.18)";
    const targetBorder = bullish ? "rgba(45,212,191,0.92)" : "rgba(250,204,21,0.92)";
    const targetFill = bullish ? "rgba(16,185,129,0.18)" : "rgba(249,115,22,0.18)";
    const headerLeft = clamp(anchorX + 14, 8, Math.max(8, chartWidth - 220));
    const headerTop = clamp(entryY - 52, 8, Math.max(8, chartHeight - 58));
    const rr =
      stopPrice != null && targetPrice != null
        ? calcRMultiple(signalPrompt.price, stopPrice, targetPrice, signalPrompt.direction)
        : null;
    const title = `${bullish ? "Actionable Buy" : "Actionable Sell"}${
      signalPromptScore != null ? ` • ${signalPromptScore.toFixed(0)}%` : ""
    }`;
    const setupLabel = signalPrompt.setup ?? (bullish ? "Buy setup" : "Sell setup");

    return (
      <div className="pointer-events-none absolute inset-0 z-[24]">
        {rawAnchorX != null && (
          <div
            className="absolute top-0 bottom-0 border-l border-dashed opacity-75"
            style={{ left: anchorX, borderColor: accent }}
          />
        )}
        <div
          className="absolute left-0 right-0 border-t border-dashed opacity-90"
          style={{ top: entryY, borderColor: accent }}
        />
        <div
          className="absolute right-2 z-[25] -translate-y-1/2 rounded px-2 py-1 text-[10px] font-semibold text-white shadow-lg"
          style={{
            top: entryY,
            backgroundColor: accentBg,
            boxShadow: `0 10px 28px ${accentBg}`,
          }}
        >
          Entry {formatPrice(signalPrompt.price)}
        </div>
        {stopY != null && (
          <div
            className="absolute rounded border text-[10px] text-white shadow-sm"
            style={{
              left: zoneLeft,
              width: zoneWidth,
              top: Math.min(entryY, stopY),
              height: Math.max(2, Math.abs(entryY - stopY)),
              backgroundColor: stopFill,
              borderColor: stopBorder,
            }}
          >
            <div className="absolute left-2 top-1 rounded bg-black/45 px-1.5 py-0.5">
              SL {formatPrice(stopPrice!)}
            </div>
          </div>
        )}
        {targetY != null && (
          <div
            className="absolute rounded border text-[10px] text-white shadow-sm"
            style={{
              left: zoneLeft,
              width: zoneWidth,
              top: Math.min(entryY, targetY),
              height: Math.max(2, Math.abs(entryY - targetY)),
              backgroundColor: targetFill,
              borderColor: targetBorder,
            }}
          >
            <div className="absolute left-2 top-1 rounded bg-black/45 px-1.5 py-0.5">
              TP1 {formatPrice(targetPrice!)}
              {rr != null && Number.isFinite(rr) ? ` • ${rr.toFixed(2)}R` : ""}
            </div>
          </div>
        )}
        <div
          className="absolute z-[25] rounded border bg-slate-950/90 px-2 py-1 text-[10px] text-white shadow-lg"
          style={{ left: headerLeft, top: headerTop, borderColor: accent }}
        >
          <div className="font-semibold uppercase tracking-wide" style={{ color: bullish ? "#86efac" : "#fdba74" }}>
            {title}
          </div>
          <div className="mt-0.5 text-zinc-300">{setupLabel}</div>
        </div>
      </div>
    );
  };

  const renderDrawingShape = (drawing: Drawing, key: string, opts: { preview?: boolean } = {}) => {
    if (!chartRef.current || !seriesRef.current) return null;
    const preview = opts.preview ?? false;
    if (drawing.type === "hline") {
      const y = priceToYCoord(drawing.points[0]?.price ?? NaN);
      if (y == null) return null;
      return (
        <div
          key={key}
          className={clsx("pointer-events-none absolute left-0 right-0 z-20", preview && "opacity-70")}
          style={{
            top: y,
            borderTop: `1px ${preview ? "dashed" : "solid"} ${drawing.color}`,
          }}
        />
      );
    }
    if (drawing.type === "trend") {
      const [p1, p2] = drawing.points;
      if (!p1 || !p2) return null;
      const x1 = timeToXCoord(p1.time);
      const y1 = priceToYCoord(p1.price);
      const x2 = timeToXCoord(p2.time);
      const y2 = priceToYCoord(p2.price);
      if (x1 == null || x2 == null || y1 == null || y2 == null) return null;
      return (
        <svg key={key} className="pointer-events-none absolute inset-0 z-20">
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={drawing.color}
            strokeDasharray={preview ? "4 3" : undefined}
            strokeWidth={2}
          />
        </svg>
      );
    }
    if (drawing.type === "rect") {
      const [p1, p2] = drawing.points;
      if (!p1 || !p2) return null;
      const x1 = timeToXCoord(p1.time);
      const y1 = priceToYCoord(p1.price);
      const x2 = timeToXCoord(p2.time);
      const y2 = priceToYCoord(p2.price);
      if (x1 == null || x2 == null || y1 == null || y2 == null) return null;
      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const width = Math.max(2, Math.abs(x2 - x1));
      const height = Math.max(2, Math.abs(y2 - y1));
      return (
        <div
          key={key}
          className={clsx("pointer-events-none absolute z-20 rounded border", preview ? "opacity-70" : "")}
          style={{
            left,
            top,
            width,
            height,
            borderColor: drawing.color,
            borderStyle: preview ? "dashed" : "solid",
            backgroundColor: `${drawing.color}22`,
          }}
        />
      );
    }
    if (drawing.type === "fibo") {
      const [start, end] = drawing.points;
      if (!start || !end) return null;
      const x1 = timeToXCoord(start.time);
      const x2 = timeToXCoord(end.time);
      const y1 = priceToYCoord(start.price);
      const y2 = priceToYCoord(end.price);
      if (x1 == null || x2 == null || y1 == null || y2 == null) return null;
      const left = Math.min(x1, x2);
      const width = Math.max(2, Math.abs(x2 - x1));
      const top = Math.min(y1, y2);
      const height = Math.max(2, Math.abs(y2 - y1));
      const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      return (
        <div key={key} className="pointer-events-none absolute inset-0 z-30">
          <div
            className="absolute rounded border border-pink-400/40"
            style={{
              left,
              width,
              top,
              height,
              borderStyle: preview ? "dashed" : "solid",
            }}
          />
          {fibLevels.map((lvl) => {
            const price = start.price + (end.price - start.price) * lvl;
            const y = priceToYCoord(price);
            if (y == null) return null;
            return (
              <div
                key={`${key}-${lvl}`}
                className="absolute flex items-center gap-2 text-[10px]"
                style={{ left, width, top: y - 6 }}
              >
                <div className="h-px flex-1 bg-pink-400/60" />
                <span className="rounded bg-black/70 px-1 py-[1px] text-pink-100">
                  {(lvl * 100).toFixed(1)}% {formatPrice(price)}
                </span>
              </div>
            );
          })}
        </div>
      );
    }
    if (drawing.type === "measure") {
      const [start, end] = drawing.points;
      if (!start || !end) return null;
      const x1 = timeToXCoord(start.time);
      const y1 = priceToYCoord(start.price);
      const x2 = timeToXCoord(end.time);
      const y2 = priceToYCoord(end.price);
      if (x1 == null || x2 == null || y1 == null || y2 == null) return null;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const label = formatMeasureLabel(start, end);
      return (
        <div key={key} className="pointer-events-none absolute inset-0 z-30">
          <svg className="absolute inset-0">
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={drawing.color}
              strokeDasharray={preview ? "4 2" : "none"}
              strokeWidth={2}
            />
            <circle cx={x1} cy={y1} r={3} fill={drawing.color} />
            <circle cx={x2} cy={y2} r={3} fill={drawing.color} />
          </svg>
          <div
            className="absolute -translate-x-1/2 rounded bg-black/80 px-2 py-1 text-[11px] text-indigo-100 shadow"
            style={{ left: midX, top: midY - 18 }}
          >
            {label}
          </div>
        </div>
      );
    }
    if (drawing.type === "long" || drawing.type === "short") {
      return renderPositionDrawing(drawing, key, preview);
    }
    return null;
  };

  const drawingElements = drawings
    .map((drawing) => renderDrawingShape(drawing, drawing.id))
    .filter(Boolean);

  const previewDrawing = (() => {
    if (drawingMode === "none") return null;
    const config = TOOL_CONFIG[drawingMode];
    if (!config) return null;
    if (config.dragPreview && !previewPoint) return null;
    if (pendingPoints.length === 0 && !isPointerDown) return null;
    if (config.dragPreview) {
      if (!previewPoint || pendingPoints.length === 0) return null;
      return {
        id: "preview",
        type: drawingMode,
        color: DRAW_COLORS[drawingMode],
        points: buildDrawingPoints(
          drawingMode,
          [...pendingPoints.slice(0, config.points - 1), previewPoint],
          true,
        ),
      } as Drawing;
    }
    if (!previewPoint) return null;
    if (pendingPoints.length >= config.points) return null;
    return {
      id: "preview",
      type: drawingMode,
      color: DRAW_COLORS[drawingMode],
      points: buildDrawingPoints(drawingMode, [...pendingPoints, previewPoint].slice(0, config.points), true),
    } as Drawing;
  })();

  const previewElement = previewDrawing ? renderDrawingShape(previewDrawing, "preview", { preview: true }) : null;
  const drawingHint = panMode
    ? "Pan mode on. Drag the chart to move around."
    : drawingMode === "none"
      ? "Choose a drawing tool. Drag tools draw on click-and-drag."
      : drawingMode === "hline"
        ? "Click once on the chart to place a horizontal level."
      : drawingMode === "long" || drawingMode === "short"
          ? "Click and drag to set entry and stop. Target is previewed automatically."
          : "Click and drag on the chart. Press Esc to cancel the active tool.";

  useEffect(() => {
    if (drawingMode === "none" && !panMode && pendingPoints.length === 0 && !isPointerDown) return;
    const handleEscape = (evt: KeyboardEvent) => {
      if (evt.key !== "Escape") return;
      resetDrawingState();
      setDrawingMode("none");
      setPanMode(false);
      setIsPanning(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [drawingMode, panMode, pendingPoints.length, isPointerDown, setDrawingMode]);

  useEffect(() => {
    if (!containerRef.current || chartRef.current) return;

    let mounted = true;
    let chart: IChartApi | null = null;
    let series: ISeriesApi<"Candlestick"> | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let markersPlugin: ISeriesMarkersPluginApi<UTCTimestamp> | null = null;

    const initChart = async () => {
      const lwc = await import("lightweight-charts");
      if (!mounted || !containerRef.current || chartRef.current) return;

      const createChart = (lwc as any).createChart ?? (lwc as any).default?.createChart;
      const ColorType = (lwc as any).ColorType ?? (lwc as any).default?.ColorType;
      const createSeriesMarkers =
        (lwc as any).createSeriesMarkers ?? (lwc as any).default?.createSeriesMarkers;
      if (!createChart || !ColorType) {
        console.error("lightweight-charts exports missing createChart/ColorType");
        return;
      }
      const chartInstance = createChart(containerRef.current, {
        layout: { background: { type: ColorType.Solid, color: "#0b0b0f" }, textColor: "#d1d5db" },
        rightPriceScale: { borderColor: "#1f2937" },
        timeScale: {
          borderColor: "#1f2937",
          timeVisible: true,
          secondsVisible: false,
          visible: true,
          tickMarkFormatter: (t: Time) => formatTimeTick(t, true, clockTzRef.current),
        },
        grid: {
          vertLines: { color: "#111827" },
          horzLines: { color: "#111827" },
        },
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
      chart = chartInstance;

      const CandlestickSeries =
        (lwc as any).CandlestickSeries ?? (lwc as any).default?.CandlestickSeries;
      const chartAny = chartInstance as any;

      const seriesOptions = {
        upColor: "#34d399",
        wickUpColor: "#34d399",
        downColor: "#f87171",
        wickDownColor: "#f87171",
      };

      series =
        typeof chartAny.addCandlestickSeries === "function"
          ? chartAny.addCandlestickSeries(seriesOptions)
          : typeof chartAny.addSeries === "function" && CandlestickSeries
            ? chartAny.addSeries(CandlestickSeries, seriesOptions)
            : null;

      if (!series) {
        console.error("addCandlestickSeries missing on chart", chart);
        chartInstance.remove();
        chart = null;
        return;
      }

      chartRef.current = chart;
      seriesRef.current = series;
      markersPlugin = createSeriesMarkers ? createSeriesMarkers(series, []) : null;
      markersPluginRef.current = markersPlugin;
      setMarkersPluginReady((v) => v + 1);

      const initialCandles = candlesSnapshotRef.current;
      if (initialCandles.length > 0) {
        series.setData(
          initialCandles.map((c) => ({
            time: (c.t / 1000) as UTCTimestamp,
            open: c.o,
            high: c.h,
            low: c.l,
            close: c.c,
          })),
        );
        chartInstance.timeScale().fitContent();
      }

      resizeObserver = new ResizeObserver((entries) => {
        const { width, height } = entries[0].contentRect;
        const nextWidth = Math.round(width);
        const nextHeight = Math.round(height);
        setChartWidth((prev) => (prev === nextWidth ? prev : nextWidth));
        setChartHeight((prev) => (prev === nextHeight ? prev : nextHeight));
        chart?.applyOptions({ width: nextWidth, height: nextHeight });
      });
      resizeObserver.observe(containerRef.current);
    };

    initChart().catch((err) => console.error("Failed to init chart", err));

    return () => {
      mounted = false;
      markersPlugin?.detach();
      if (markersPluginRef.current === markersPlugin) {
        markersPluginRef.current = null;
      }
      resizeObserver?.disconnect();
      chart?.remove();
      if (chartRef.current === chart) {
        chartRef.current = null;
      }
      if (seriesRef.current === series) {
        seriesRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (hoverFrameRef.current != null && typeof window !== "undefined") {
        window.cancelAnimationFrame(hoverFrameRef.current);
      }
      hoverFrameRef.current = null;
      pendingHoverSnapshotRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const timeScale = chart.timeScale();
    const bump = () => setViewportVersion((v) => v + 1);
    // React to pan/zoom to keep overlay coordinates in sync
    timeScale.subscribeVisibleTimeRangeChange?.(bump);
    // Some builds expose logical range change instead of time range
    const logicalRangeSub = timeScale as unknown as {
      subscribeVisibleLogicalRangeChange?: (handler: () => void) => void;
      unsubscribeVisibleLogicalRangeChange?: (handler: () => void) => void;
    };
    logicalRangeSub.subscribeVisibleLogicalRangeChange?.(bump);
    return () => {
      timeScale.unsubscribeVisibleTimeRangeChange?.(bump);
      logicalRangeSub.unsubscribeVisibleLogicalRangeChange?.(bump);
    };
  }, []);

  useEffect(() => () => stopViewportSync(), [stopViewportSync]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let firstFrame: number | null = null;
    let secondFrame: number | null = null;
    const syncLayout = () => {
      const chart = chartRef.current;
      const container = containerRef.current;
      if (!chart || !container) return;
      const nextWidth = Math.round(container.clientWidth);
      const nextHeight = Math.round(container.clientHeight);
      if (nextWidth <= 0 || nextHeight <= 0) return;
      setChartWidth((prev) => (prev === nextWidth ? prev : nextWidth));
      setChartHeight((prev) => (prev === nextHeight ? prev : nextHeight));
      chart.applyOptions({ width: nextWidth, height: nextHeight });
      nudgeViewportSync(220);
    };
    firstFrame = window.requestAnimationFrame(() => {
      syncLayout();
      secondFrame = window.requestAnimationFrame(syncLayout);
    });
    return () => {
      if (firstFrame != null) window.cancelAnimationFrame(firstFrame);
      if (secondFrame != null) window.cancelAnimationFrame(secondFrame);
    };
  }, [leftPanelOpen, rightPanelOpen, nudgeViewportSync]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof window === "undefined") return;
    const handlePointerDown = () => nudgeViewportSync(260);
    const handlePointerMove = (event: PointerEvent) => {
      if (event.buttons !== 0) {
        nudgeViewportSync(120);
      }
    };
    const handlePointerUp = () => nudgeViewportSync(90);
    const handleWheel = () => nudgeViewportSync(220);
    el.addEventListener("pointerdown", handlePointerDown, { passive: true });
    el.addEventListener("wheel", handleWheel, { passive: true });
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", handlePointerDown);
      el.removeEventListener("wheel", handleWheel);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [nudgeViewportSync]);

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(
      candles.map((c) => ({
        time: (c.t / 1000) as UTCTimestamp,
        open: c.o,
        high: c.h,
        low: c.l,
        close: c.c,
      })),
    );
    const latest = candles.at(-1);
    setLastTzTime(latest ? formatWithTz(latest.t, clockTz, TIME_LABEL_FORMAT) : null);
    const chart = chartRef.current;
    if (chart) {
      const intervalMs =
        candles.length > 1 ? Math.max(1, candles[1].t - candles[0].t) : 0;
      const showIntraday = intervalMs < 24 * 60 * 60 * 1000;
      const localize = (t: Time) => formatTimeTick(t, showIntraday, clockTz);
      chart.applyOptions({
        timeScale: {
          tickMarkFormatter: localize,
          secondsVisible: showIntraday,
        },
        localization: {
          timeFormatter: (t: Time) => formatFullDate(t, clockTz),
          locale: "en-US",
        },
      });
    }

    // recompute timeline ticks
    if (candles.length === 0 || (chartWidth === 0 && !containerRef.current)) {
      setTimelineTicks([]);
    } else {
      const usableWidth = chartWidth || (containerRef.current?.clientWidth ?? 600);
      const maxTicks = Math.max(2, Math.floor(usableWidth / 80));
      const step = Math.max(1, Math.floor(candles.length / maxTicks));
        const ticks: { label: string; position: number }[] = [];
      const delta =
        candles.length > 1 ? Math.max(1, candles[1].t - candles[0].t) : 0;

      const scaleWidth = chartRef.current?.timeScale().width() ?? usableWidth;
      const modelPoint = chartRef.current?.timeScale().coordinateToTime(0);
      const floorOffset =
        typeof modelPoint === "number"
          ? modelPoint * 1000 - candles[0].t
          : 0;
      for (let i = 0; i < candles.length; i += step) {
        const ts = (candles[i].t / 1000) as UTCTimestamp;
        const coord = chartRef.current?.timeScale().timeToCoordinate(ts);
        if (typeof coord === "number") {
          ticks.push({ label: formatTimelineLabel(candles[i].t + floorOffset, delta, clockTz), position: coord });
        }
      }

      setTimelineTicks(ticks);
    }
  }, [candles, chartWidth, clockTz, viewportVersion]);

  useEffect(() => {
    if (!overlays.sessions || candles.length < 2) {
      setSessionBands([]);
      setKillZoneBands([]);
      return;
    }
    const chart = chartRef.current;
    const timeScale = chart?.timeScale();
    const ranges: { start: number; end: number; label: string }[] = [];
    let currentLabel: string | null = null;
    let currentStart = candles[0].t;
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const session = classifySession(new Date(c.t), SESSION_ZONES);
      const label = session?.label ?? "Other";
      if (currentLabel === null) {
        currentLabel = label;
        currentStart = c.t;
      } else if (label !== currentLabel) {
        ranges.push({ start: currentStart, end: c.t, label: currentLabel });
        currentLabel = label;
        currentStart = c.t;
      }
    }
    ranges.push({ start: currentStart, end: candles.at(-1)!.t, label: currentLabel ?? "Other" });

    const mapCoord = (ms: number) => {
      const tsVal = (ms / 1000) as UTCTimestamp;
      const coord = timeScale?.timeToCoordinate(tsVal as any);
      if (coord !== undefined && coord !== null && Number.isFinite(coord)) return coord;
      if (candles.length <= 1) return 0;
      const first = candles[0].t;
      const last = candles[candles.length - 1].t;
      return ((ms - first) / (last - first)) * (chartWidth || 1);
    };

    const bands = ranges
      .map((r, idx) => {
        const left = mapCoord(r.start);
        const right = mapCoord(r.end);
        const width = Math.max(4, right - left);
        const sessionStyle = styleForSession(r.label);
        return {
          id: `${r.label}-${idx}-${r.start}`,
          left,
          width,
          label: r.label,
          color: sessionStyle.fill,
          gradient: sessionStyle.gradient,
          textColor: sessionStyle.text,
        };
      })
      .filter((b) => Number.isFinite(b.left) && Number.isFinite(b.width));
    setSessionBands(bands);
  }, [overlays.sessions, candles, chartWidth, viewportVersion]);

  useEffect(() => {
    if (!overlays.killzones || candles.length < 2) {
      setKillZoneBands([]);
      return;
    }
    const chart = chartRef.current;
    const timeScale = chart?.timeScale();
    const ranges: { start: number; end: number; label: string }[] = [];
    let active: { start: number; label: string } | null = null;
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const session = classifySession(new Date(c.t), SESSION_ZONES);
      const hour = new Date(c.t).getUTCHours();
      const killStart = session?.killStartHour;
      const killEnd = session?.killEndHour;
      const killActive = session
        ? killStart != null && killEnd != null
          ? hour >= killStart && hour < killEnd
          : true
        : false;
      const label = killActive && session ? `${session.label} Kill Zone` : null;
      if (label && !active) {
        active = { start: c.t, label };
      } else if (!label && active) {
        ranges.push({ start: active.start, end: c.t, label: active.label });
        active = null;
      }
    }
    if (active) {
      ranges.push({ start: active.start, end: candles.at(-1)!.t, label: active.label });
    }

    const mapCoord = (ms: number) => {
      const tsVal = (ms / 1000) as UTCTimestamp;
      const coord = timeScale?.timeToCoordinate(tsVal as any);
      if (coord !== undefined && coord !== null && Number.isFinite(coord)) return coord;
      if (candles.length <= 1) return 0;
      const first = candles[0].t;
      const last = candles[candles.length - 1].t;
      return ((ms - first) / (last - first)) * (chartWidth || 1);
    };

    const bands = ranges
      .map((r, idx) => {
        const left = mapCoord(r.start);
        const right = mapCoord(r.end);
        const width = Math.max(4, right - left);
        const color = colorForKillzone(r.label);
        return {
          id: `${r.label}-${idx}-${r.start}`,
          left,
          width,
          label: r.label,
          color,
          gradient: `linear-gradient(180deg, ${color} 0%, rgba(0,0,0,0) 95%)`,
          textColor: "#fefce8",
        };
      })
      .filter((b) => Number.isFinite(b.left) && Number.isFinite(b.width));
    setKillZoneBands(bands);
  }, [overlays.killzones, candles, chartWidth, viewportVersion]);

  useEffect(() => {
    if (!markersPluginRef.current) return;
    const markers: SeriesMarker<UTCTimestamp>[] = [];

    const swingMarkers: Swing[] = [];
    if (swings && swings.length) {
      const byTimeDesc = [...swings].reverse();
      const getStrength = (s: Swing) => swingStrengthMap.get(s.time) ?? 'weak';
      const pickLast = (predicate: (s: Swing) => boolean) => byTimeDesc.find(predicate);
      const candidates = [
        (s: Swing) => s.type === "high" && getStrength(s) === "strong",
        (s: Swing) => s.type === "low" && getStrength(s) === "strong",
        (s: Swing) => s.type === "high" && getStrength(s) === "weak",
        (s: Swing) => s.type === "low" && getStrength(s) === "weak",
      ];
      candidates.forEach((fn) => {
        const hit = pickLast(fn);
        if (hit) swingMarkers.push(hit);
      });
    }
    if (overlays.liquidity && swingMarkers.length) {
      markers.push(
        ...swingMarkers.map((s) => ({
          time: (s.time / 1000) as UTCTimestamp,
          position: s.type === "high" ? ("aboveBar" as const) : ("belowBar" as const),
          color:
            swingStrengthMap.get(s.time) === "strong"
              ? s.type === "high"
                ? "#fb923c"
                : "#22c55e"
              : "#a78bfa",
          shape: swingStrengthMap.has(s.time) ? ("square" as const) : ("circle" as const),
          text: swingStrengthMap.has(s.time)
            ? `${swingStrengthMap.get(s.time) === "strong" ? "Strong" : "Weak"} ${s.type === "high" ? "High" : "Low"}`
            : undefined,
          size: 0.85,
        })),
      );
    }

    if (overlays.signals && chartSignals.length) {
      const filteredSignals =
        selectedSetup === "all"
          ? chartSignals
          : chartSignals.filter((s) => matchesSelectedSetup(s.setup));
      markers.push(
        ...filteredSignals.map((s) => ({
          time: (s.time / 1000) as UTCTimestamp,
          position: s.direction === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
          color: s.direction === "buy" ? "#34d399" : "#f87171",
          shape: s.direction === "buy" ? ("arrowUp" as const) : ("arrowDown" as const),
          text: s.setup ? formatSetupShort(s.setup) : s.direction === "buy" ? "Buy" : "Sell",
          id: `sig-${s.time}-${s.setup ?? s.direction}`,
          size: 0.85,
        })),
      );
    }

    if (overlays.inversionFvgSignals && model2022?.m15Signals?.length) {
      markers.push(
        ...model2022.m15Signals.map((sig) => ({
          time: (sig.time / 1000) as UTCTimestamp,
          position: sig.direction === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
          color: sig.direction === "buy" ? "#14b8a6" : "#fb923c",
          shape: "square" as const,
          text: sig.label,
          id: `m22-${sig.time}-${sig.direction}`,
          size: 0.85,
        })),
      );
    }

    if (overlays.structureSegments && structureShifts?.length) {
      markers.push(
        ...structureShifts.map((b) => ({
          time: (b.time / 1000) as UTCTimestamp,
          position: b.direction === "bullish" ? ("belowBar" as const) : ("aboveBar" as const),
          color: b.direction === "bullish" ? "#22d3ee" : "#fb7185",
          shape: b.direction === "bullish" ? ("arrowUp" as const) : ("arrowDown" as const),
          text: b.label === "CHoCH" ? "MSS" : b.label,
          size: 0.85,
        })),
      );
    }

    if (overlays.sessions && candles.length > 0) {
      const sessionMarkers = computeSessionMarkers(candles);
      markers.push(
        ...sessionMarkers.map((m) => ({
          time: (m.time / 1000) as UTCTimestamp,
          position: "belowBar" as const,
          color: "#facc15",
          shape: "circle" as const,
          text: m.label,
          size: 0.75,
        })),
      );
    }

    if (overlays.sweeps && sweeps?.length) {
      const recentSweeps = sweeps.slice(-4); // keep chart clean: show only latest few sweeps
      markers.push(
        ...recentSweeps.map((s) => ({
          time: (s.time / 1000) as UTCTimestamp,
          position: s.direction === "up" ? ("aboveBar" as const) : ("belowBar" as const),
          color: s.type === "eqh" ? "#a855f7" : "#f97316",
          shape: s.direction === "up" ? ("arrowUp" as const) : ("arrowDown" as const),
          text: s.type === "eqh" ? "EQH" : "EQL",
          size: 0.8,
        })),
      );
    }

    if (chartTrades.length && (overlays.tradeMarkers ?? true)) {
      markers.push(
        ...chartTrades.map((trade, idx) => ({
          time: ((trade.openTime ?? candles.at(-1)?.t ?? Date.now()) / 1000) as UTCTimestamp,
          position: trade.direction === 'buy' ? ('belowBar' as const) : ('aboveBar' as const),
          color: trade.direction === 'buy' ? '#10b981' : '#f97316',
          shape: trade.direction === 'buy' ? ('arrowUp' as const) : ('arrowDown' as const),
          text: formatTradeMarkerLabel(trade),
          id: `trade-${trade.id ?? idx}`,
          size: 0.85,
        })),
      );
    }

    markersPluginRef.current.setMarkers(markers);
  }, [
    swings,
    gaps,
    chartSignals,
    structureShifts,
    sweeps,
    chartTrades,
    overlays.liquidity,
    overlays.fvg,
    overlays.signals,
    overlays.sessions,
    overlays.sweeps,
    overlays.inversionFvgSignals,
    overlays.tradeMarkers,
    overlays.structureSegments,
    markersPluginReady,
    candles,
    selectedSetup,
    matchesSelectedSetup,
    model2022?.m15Signals,
    swingStrengthMap,
  ]);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    const timeScale = chartRef.current.timeScale();
    const priceToY = (price: number) => seriesRef.current?.priceToCoordinate(price) ?? null;
    const timeToX = (t: number) => timeScale.timeToCoordinate((t / 1000) as UTCTimestamp as any);
    const latestTime = candles.length ? candles[candles.length - 1].t : null;
    const lastVisibleX = latestTime != null ? timeToX(latestTime) : chartWidth ?? null;
    const candleSlotWidth = estimateCandleSlotWidth(candles, timeToX, chartWidth);

    if (overlays.fvg && gaps && chartWidth > 0 && chartHeight > 0) {
      const boxes: typeof fvgBoxes = [];
      gaps.slice(-8).forEach((g, idx) => {
        const box = buildGapOverlayBox({
          id: `fvg-${idx}-${g.startTime}`,
          gap: g,
          timeToX,
          priceToY,
          candleSlotWidth,
          color: g.type === "bullish" ? "rgba(14,165,233,0.16)" : "rgba(245,158,11,0.14)",
          gradient:
            g.type === "bullish"
              ? "linear-gradient(180deg, rgba(14,165,233,0.28) 0%, rgba(14,165,233,0.04) 100%)"
              : "linear-gradient(180deg, rgba(245,158,11,0.24) 0%, rgba(245,158,11,0.04) 100%)",
          borderColor:
            g.type === "bullish"
              ? "rgba(56,189,248,0.95)"
              : "rgba(251,191,36,0.95)",
          textColor: g.type === "bullish" ? "#d8f3ff" : "#fef3c7",
          label: `${g.type === "bullish" ? "Bullish" : "Bearish"} FVG`,
        });
        if (box) {
          boxes.push(box);
        }
      });
      setFvgBoxes((prev) => (areOverlayBoxesEqual(prev, boxes) ? prev : boxes));
    } else {
      setFvgBoxes((prev) => (prev.length ? [] : prev));
    }

    if (overlays.oteBands && premiumDiscount && chartWidth > 0 && chartHeight > 0) {
      const dealingRange = premiumDiscount.high - premiumDiscount.low;
      if (dealingRange > 0) {
        const oteHigh = premiumDiscount.high - dealingRange * 0.62;
        const oteLow = premiumDiscount.high - dealingRange * 0.705;
        const yHigh = priceToY(oteHigh);
        const yLow = priceToY(oteLow);
        if (yHigh != null && yLow != null) {
          const boxes: OverlayBox[] = [
            {
              id: "ote-band",
              left: 0,
              width: Math.max(10, chartWidth),
              top: Math.min(yHigh, yLow),
              height: Math.max(4, Math.abs(yHigh - yLow)),
              color: "rgba(168,85,247,0.14)",
              gradient: "linear-gradient(180deg, rgba(168,85,247,0.24) 0%, rgba(168,85,247,0.06) 100%)",
              borderColor: "rgba(196,181,253,0.9)",
              textColor: "#f3e8ff",
              label: "OTE 62% - 70.5%",
              showLabel: true,
              guideColor: "rgba(196,181,253,0.45)",
              midlineColor: "rgba(233,213,255,0.65)",
            },
          ];
          setOteBoxes((prev) => (areOverlayBoxesEqual(prev, boxes) ? prev : boxes));
        } else {
          setOteBoxes((prev) => (prev.length ? [] : prev));
        }
      } else {
        setOteBoxes((prev) => (prev.length ? [] : prev));
      }
    } else {
      setOteBoxes((prev) => (prev.length ? [] : prev));
    }

    if (overlays.pdZones && premiumDiscount && chartWidth > 0 && chartHeight > 0) {
      const yHigh = priceToY(premiumDiscount.high);
      const yLow = priceToY(premiumDiscount.low);
      const yEq = priceToY(premiumDiscount.equilibrium);
      if (yHigh != null && yLow != null && yEq != null) {
        const premiumTop = Math.min(yHigh, yEq);
        const premiumHeight = Math.max(4, Math.abs(yHigh - yEq));
        const discountTop = Math.min(yEq, yLow);
        const discountHeight = Math.max(4, Math.abs(yEq - yLow));
        const zones: OverlayBox[] = [
          {
            id: "pd-premium",
            left: 0,
            width: Math.max(10, chartWidth),
            top: premiumTop,
            height: premiumHeight,
            color: "rgba(248,113,113,0.08)",
            gradient: "linear-gradient(180deg, rgba(248,113,113,0.16) 0%, rgba(248,113,113,0.02) 100%)",
            textColor: "#fed7aa",
            label: "Premium Zone",
          },
          {
            id: "pd-discount",
            left: 0,
            width: Math.max(10, chartWidth),
            top: discountTop,
            height: discountHeight,
            color: "rgba(34,197,94,0.08)",
            gradient: "linear-gradient(180deg, rgba(34,197,94,0.16) 0%, rgba(34,197,94,0.02) 100%)",
            textColor: "#bbf7d0",
            label: "Discount Zone",
          },
        ];
        setPdZones((prev) => (areOverlayBoxesEqual(prev, zones) ? prev : zones));
      } else {
        setPdZones((prev) => (prev.length ? [] : prev));
      }
    } else {
      setPdZones((prev) => (prev.length ? [] : prev));
    }

    if (overlays.orderBlocks && orderBlocks && chartWidth > 0 && chartHeight > 0) {
      const boxes: typeof obBoxes = [];
      orderBlocks.slice(-8).forEach((b, idx) => {
        const x1 = timeToX(b.startTime);
        const x2 = timeToX(b.endTime);
        const yTop = priceToY(b.high);
        const yBot = priceToY(b.low);
        if (x1 == null || x2 == null || yTop == null || yBot == null) return;
        const left = Math.min(x1, x2);
        const baseRight = Math.max(x1, x2);
        const extendedRight = lastVisibleX != null ? Math.max(baseRight, lastVisibleX) : baseRight + 60;
        const modelAligned =
          model2022?.obWithDisplacement?.some(
            (ob) =>
              Math.abs(ob.startTime - b.startTime) < 1_200 &&
              Math.abs(ob.high - b.high) < 1e-8 &&
              Math.abs(ob.low - b.low) < 1e-8 &&
              ob.type === b.type,
          ) ?? false;
        const fill = b.type === "bullish" ? "rgba(34,197,94,0.16)" : "rgba(248,113,113,0.16)";
        const gradient =
          b.type === "bullish"
            ? "linear-gradient(90deg, rgba(34,197,94,0.2) 0%, rgba(34,197,94,0.02) 90%)"
            : "linear-gradient(90deg, rgba(248,113,113,0.2) 0%, rgba(248,113,113,0.02) 90%)";
        const border = modelAligned
          ? "rgba(251,191,36,0.9)"
          : b.type === "bullish"
            ? "rgba(52,211,153,0.8)"
            : "rgba(248,113,113,0.8)";
        const textColor = "#fef3c7";
        boxes.push({
          id: `ob-${idx}-${b.startTime}`,
          left,
          width: Math.max(20, extendedRight - left),
          top: Math.min(yTop, yBot),
          height: Math.max(2, Math.abs(yTop - yBot)),
          color: fill,
          borderColor: border,
          gradient,
          textColor,
          label: `${b.type === "bullish" ? "Bull" : "Bear"} OB${modelAligned ? " + FVG" : ""}`,
        });
      });
      setObBoxes((prev) => (areOverlayBoxesEqual(prev, boxes) ? prev : boxes));
    } else {
      setObBoxes((prev) => (prev.length ? [] : prev));
    }

    if (overlays.breakers && breakerBlocks && chartWidth > 0 && chartHeight > 0) {
      const boxes: typeof breakerBoxes = [];
      breakerBlocks.slice(-6).forEach((b, idx) => {
        const x1 = timeToX(b.startTime);
        const x2 = timeToX(b.endTime);
        const yTop = priceToY(b.high);
        const yBot = priceToY(b.low);
        if (x1 == null || x2 == null || yTop == null || yBot == null) return;
        const left = Math.min(x1, x2);
        const baseRight = Math.max(x1, x2);
        const extendedRight = lastVisibleX != null ? Math.max(baseRight, lastVisibleX) : baseRight + 60;
        const gradeColor =
          b.grade === "strong"
            ? "#16a34a"
            : b.grade === "medium"
              ? "#facc15"
              : "#fb7185";
        const fill =
          b.type === "bullish"
            ? "rgba(59,130,246,0.16)"
            : "rgba(192,38,211,0.16)";
        const gradient =
          b.type === "bullish"
            ? "linear-gradient(180deg, rgba(59,130,246,0.2) 0%, rgba(59,130,246,0.02) 100%)"
            : "linear-gradient(180deg, rgba(192,38,211,0.2) 0%, rgba(192,38,211,0.02) 100%)";
        const textColor = "#fef9c3";
        boxes.push({
          id: `breaker-${idx}-${b.startTime}`,
          left,
          width: Math.max(20, extendedRight - left),
          top: Math.min(yTop, yBot),
          height: Math.max(2, Math.abs(yTop - yBot)),
          color: fill,
          borderColor: gradeColor,
          gradient,
          textColor,
          label: `${b.type === "bullish" ? "Bull" : "Bear"} Breaker (${b.sourceObType} OB • ${b.grade ?? "weak"})`,
        });
      });
      setBreakerBoxes((prev) => (areOverlayBoxesEqual(prev, boxes) ? prev : boxes));
    } else {
      setBreakerBoxes((prev) => (prev.length ? [] : prev));
    }

    if (overlays.inversionFvgSignals && model2022?.m15Signals?.length && chartWidth > 0 && chartHeight > 0) {
      const boxes: typeof model2022Boxes = [];
      model2022.m15Signals.slice(-4).forEach((sig, idx) => {
        const box = buildGapOverlayBox({
          id: `m22-box-${idx}-${sig.fvg.startTime}`,
          gap: sig.fvg,
          timeToX,
          priceToY,
          candleSlotWidth,
          color: sig.direction === "buy" ? "rgba(16,185,129,0.18)" : "rgba(249,115,22,0.18)",
          gradient:
            sig.direction === "buy"
              ? "linear-gradient(180deg, rgba(16,185,129,0.26) 0%, rgba(16,185,129,0.05) 100%)"
              : "linear-gradient(180deg, rgba(249,115,22,0.28) 0%, rgba(249,115,22,0.05) 100%)",
          borderColor: sig.direction === "buy" ? "rgba(45,212,191,0.95)" : "rgba(251,191,36,0.95)",
          textColor: "#f8fafc",
          label: sig.label,
        });
        if (box) {
          box.showLabel = true;
          boxes.push(box);
        }
      });
      setModel2022Boxes((prev) => (areOverlayBoxesEqual(prev, boxes) ? prev : boxes));
    } else {
      setModel2022Boxes((prev) => (prev.length ? [] : prev));
    }

    if (overlays.eqConnectors && equalHighsLows && chartWidth > 0 && chartHeight > 0) {
      const segs: Array<{ id: string; x1: number; x2: number; y: number; label: string; color: string }> = [];
      const recent = equalHighsLows.slice(-6);
      recent.forEach((lvl, idx) => {
        const levelTimes = Array.from(new Set(lvl.times.filter(Number.isFinite))).sort((a, b) => a - b);
        if (levelTimes.length === 0) return;
        const sweepTimes =
          sweeps
            ?.filter((s) => priceMatchesLevel(s.price, lvl.price))
            .map((s) => s.time)
            .filter((time) => time >= levelTimes[0])
            .sort((a, b) => a - b) ?? [];
        const t1 = levelTimes[0];
        const t2 = sweepTimes.at(-1) ?? levelTimes.at(-1) ?? t1;
        const x1 = timeToX(t1);
        const x2 = timeToX(t2);
        const y = priceToY(lvl.price);
        if (x1 == null || x2 == null || y == null) return;
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const color = lvl.kind === "highs" ? "#a855f7" : "#f97316";
        segs.push({
          id: `eq-seg-${idx}-${lvl.price}`,
          x1: left,
          x2: right,
          y,
          label: lvl.kind === "highs" ? "EQH" : "EQL",
          color,
        });
      });
      setEqSegments((prev) => {
        if (prev.length === segs.length && prev.every((p, i) => p.id === segs[i].id && p.x1 === segs[i].x1 && p.x2 === segs[i].x2 && p.y === segs[i].y)) {
          return prev;
        }
        return segs;
      });
    } else {
      setEqSegments((prev) => (prev.length ? [] : prev));
    }

    if (overlays.signals && chartSignals.length && chartWidth > 0 && chartHeight > 0) {
      const boxes: OverlayBox[] = [];
      const filtered =
        selectedSetup === "all"
          ? chartSignals.slice(-12)
          : chartSignals.filter((s) => matchesSelectedSetup(s.setup)).slice(-12);
      filtered.forEach((s, idx) => {
        const x = timeToX(s.time);
        const y = priceToY(s.price);
        if (x == null || y == null) return;
        const width = 118;
        const height = 22;
        const left = clamp(x - width / 2, 4, Math.max(4, (chartWidth || width) - width - 4));
        const bullish = s.direction === "buy";
        const top = clamp(
          bullish ? y + 8 : y - height - 8,
          4,
          Math.max(4, (chartHeight || height) - height - 4),
        );
        const fill = bullish ? "rgba(34,197,94,0.2)" : "rgba(248,113,113,0.22)";
        const gradient = bullish
          ? "linear-gradient(180deg, rgba(16,185,129,0.35) 0%, rgba(16,185,129,0.08) 95%)"
          : "linear-gradient(180deg, rgba(248,113,113,0.35) 0%, rgba(248,113,113,0.08) 95%)";
        const border = bullish ? "rgba(16,185,129,0.8)" : "rgba(248,113,113,0.85)";
        boxes.push({
          id: `sig-box-${idx}-${s.time}`,
          left,
          width,
          top,
          height,
          color: fill,
          borderColor: border,
          gradient,
          textColor: "#f8fafc",
          label: formatSetupShort(s.setup ?? (bullish ? "BUY" : "SELL")),
        });
      });
      setSignalBoxes((prev) => (areOverlayBoxesEqual(prev, boxes) ? prev : boxes));
    } else {
      setSignalBoxes((prev) => (prev.length ? [] : prev));
    }

    if (overlays.tradeMarkers && chartTrades.length && chartWidth > 0 && chartHeight > 0) {
      const boxes: OverlayBox[] = [];
      chartTrades.slice(-12).forEach((trade, idx) => {
        const anchorTime = trade.openTime ?? trade.exitTime ?? candles.at(-1)?.t;
        if (anchorTime == null) return;
        const x = timeToX(anchorTime);
        const y = priceToY(trade.entry);
        if (x == null || y == null) return;
        const width = 132;
        const height = 22;
        const left = clamp(x - width / 2, 4, Math.max(4, (chartWidth || width) - width - 4));
        const top = clamp(
          trade.direction === "buy" ? y + 28 : y - height - 28,
          4,
          Math.max(4, (chartHeight || height) - height - 4),
        );
        const { fill, border, text } = styleForTradeOverlay(trade);
        boxes.push({
          id: `trade-box-${trade.id}-${idx}`,
          left,
          width,
          top,
          height,
          color: fill,
          borderColor: border,
          gradient: fill,
          textColor: text,
          label: formatTradeOverlayLabel(trade),
        });
      });
      setTradeBoxes((prev) => (areOverlayBoxesEqual(prev, boxes) ? prev : boxes));
    } else {
      setTradeBoxes((prev) => (prev.length ? [] : prev));
    }

    if (overlays.structureSegments && structureShifts && chartWidth > 0 && chartHeight > 0) {
      const segs: OverlayBox[] = [];
      structureShifts.slice(-6).forEach((sh, idx) => {
        const x = timeToX(sh.time);
        const y = priceToY(sh.price);
        if (x == null || y == null) return;
        const width = 52;
        const height = 2;
        const left = clamp(x - width / 2, 4, Math.max(4, (chartWidth || width) - width - 4));
        const top = clamp(y - height / 2, 4, Math.max(4, (chartHeight || height) - height - 4));
        const bullish = sh.direction === "bullish";
        const color = bullish ? "rgba(52,211,153,0.9)" : "rgba(248,113,113,0.9)";
        const label = sh.label; // show CHoCH/BOS as-is for clarity
        segs.push({
          id: `shift-${idx}-${sh.time}`,
          left,
          width,
          top,
          height: Math.max(2, height),
          color,
          borderColor: color,
          textColor: color,
          label,
        });
      });
      setStructureSegments((prev) => (areOverlayBoxesEqual(prev, segs) ? prev : segs));
    } else {
      setStructureSegments((prev) => (prev.length ? [] : prev));
    }

  }, [
    gaps,
    orderBlocks,
    breakerBlocks,
    overlays.fvg,
    overlays.orderBlocks,
    overlays.breakers,
    overlays.oteBands,
    premiumDiscount,
    model2022?.m15Signals,
    model2022?.obWithDisplacement,
    overlays.signals,
    overlays.tradeMarkers,
    overlays.liquidity,
    overlays.sweeps,
    overlays.structureSegments,
    overlays.eqConnectors,
    overlays.pdZones,
    overlays.inversionFvgSignals,
    chartSignals,
    chartTrades,
    selectedSetup,
    matchesSelectedSetup,
    chartWidth,
    chartHeight,
    structureShifts,
    sweeps,
    equalHighsLows,
    candles,
    viewportVersion,
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const handler = (param: any) => {
      const time = param?.time;
      if (!time) {
        queueHoverSnapshot(EMPTY_HOVER_SNAPSHOT);
        return;
      }
      const ms = convertCoordTime(time);
      const pt = param?.point;
      let cursorPrice: number | null = null;
      let point: HoverSnapshot["point"] = null;
      if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
        point = { x: pt.x, y: pt.y };
        const coordPrice = seriesRef.current?.coordinateToPrice(pt.y) ?? null;
        if (typeof coordPrice === "number" && Number.isFinite(coordPrice)) {
          cursorPrice = coordPrice;
        }
      }
      const series = seriesRef.current;
      let barPrice: number | null = null;
      let derivedCandle: Candle | null = null;
      if (series && param?.seriesData) {
        const bar: any = param.seriesData.get(series);
        if (bar) {
          const price =
            typeof bar.close === "number"
              ? bar.close
              : typeof bar.value === "number"
                ? bar.value
                : null;
          barPrice = price;
          if (ms && typeof bar.open === "number" && typeof bar.high === "number" && typeof bar.low === "number" && typeof bar.close === "number") {
            derivedCandle = {
              t: ms,
              o: bar.open,
              h: bar.high,
              l: bar.low,
              c: bar.close,
              v: typeof bar.volume === "number" ? bar.volume : 0,
            };
          } else if (price != null && ms) {
            derivedCandle = {
              t: ms,
              o: price,
              h: price,
              l: price,
              c: price,
              v: 0,
            };
          }
        }
      }
      const fallbackPrice = typeof param?.price === "number" ? param.price : null;
      queueHoverSnapshot({
        timeLabel: ms ? formatWithTz(ms, clockTz, TIME_LABEL_FORMAT) : null,
        point,
        price: cursorPrice ?? barPrice ?? fallbackPrice,
        candle: derivedCandle,
      });
    };
    chart.subscribeCrosshairMove(handler);
    return () => {
      chart.unsubscribeCrosshairMove(handler);
    };
  }, [markersPluginReady, clockTz, convertCoordTime, queueHoverSnapshot]);

  useEffect(() => {
    if (!seriesRef.current) return;

    gapZonesRef.current.forEach((line) => seriesRef.current?.removePriceLine(line));
    gapZonesRef.current = [];
    pdLinesRef.current.forEach((line) => seriesRef.current?.removePriceLine(line));
    pdLinesRef.current = [];
    oteLinesRef.current.forEach((line) => seriesRef.current?.removePriceLine(line));
    oteLinesRef.current = [];
    eqLinesRef.current.forEach((line) => seriesRef.current?.removePriceLine(line));
    eqLinesRef.current = [];
    legOteLinesRef.current.forEach((line) => seriesRef.current?.removePriceLine(line));
    legOteLinesRef.current = [];
    slTpLinesRef.current.forEach((line) => seriesRef.current?.removePriceLine(line));
    slTpLinesRef.current = [];

    // FVG price lines suppressed; shown as boxes on-chart

    // premium/discount/OTE horizontal lines suppressed to keep chart clean; zones are shown via shading/badges

    // EQH/EQL price lines suppressed; shown as badges/markers instead

    // Leg OTE lines suppressed; shown via badges only

    // SL/TP price lines for signals are intentionally omitted to keep chart visuals clean; badges handle context
  }, [
    gaps,
    overlays.fvg,
    premiumDiscount,
    overlays.oteBands,
    overlays.sweeps,
    equalHighsLows,
    overlays.signals,
    signals,
    selectedSetup,
    chartHeight,
    chartWidth,
    swings,
    matchesSelectedSetup,
  ]);

  useEffect(() => {
    // suppress HTF level price lines; info is surfaced via badges/overlays
  }, [htfLevels, model2022]);

  useEffect(() => {
    if (!seriesRef.current) return;
    obZonesRef.current.forEach((line) => seriesRef.current?.removePriceLine(line));
    obZonesRef.current = [];

    // order block price lines suppressed; boxes handle the visualization
  }, [orderBlocks, overlays.orderBlocks]);

  useEffect(() => {
    if (promptSignals.length === 0) {
      setSignalPrompt(null);
      setSignalPromptScore(null);
      return;
    }
    const latest = promptSignals.at(-1)!;
    const latestTime = candles.at(-1)?.t ?? latest.time;
    const isCurrent = latest.time === latestTime;
    const signalAgeMs = latestTime ? Math.max(0, latestTime - latest.time) : 0;
    const signalIsFresh = signalAgeMs <= staleSignalThreshold;
    const shouldAnnounceSignal = isCurrent && signalIsFresh;
    const isNewSignal =
      lastPromptedSignalRef.current == null || latest.time > lastPromptedSignalRef.current;
    const showPrompt = () => {
      setSignalPrompt(latest);
      const evalResult = evaluateIctScanner({
        signal: latest,
        bias,
        premiumDiscount,
        latestPrice: latestPrice ?? latest.price,
      });
      setSignalPromptScore(evalResult.score);
      persistLastPromptedSignal(latest.time);
      const shouldNotify = notificationsEnabled && !backtest?.enabled && signalIsFresh;
      const shouldAutoTrade = Boolean(backtest?.autoTrade) && signalIsFresh;
      if (shouldNotify) {
        void notifyAlertConnectors(latest, {
          symbol,
          timeframe,
          bias,
          price: latestPrice ?? latest.price,
          session: latest.session ?? null,
          source: dataSource,
        }).then((result) => {
          pushAlertRelayEvent({
            signalTime: latest.time,
            direction: latest.direction,
            setup: latest.setup,
            channel: result.channel,
            deliveryStatus: result.deliveryStatus,
            ackStatus: result.ackStatus,
            acceptanceStatus: result.acceptanceStatus,
            detail: result.detail,
            lastResponse: result.lastResponse,
          });
        });
      }
      if (shouldAutoTrade) {
        const trade = enterDemoTradeFromSignal(latest);
          pushAlertRelayEvent({
            signalTime: latest.time,
            direction: latest.direction,
            setup: latest.setup,
            channel: 'auto-trade',
            deliveryStatus: trade ? (trade.status === "planned" ? 'armed' : 'executed') : 'skipped',
            ackStatus: 'not-applicable',
            acceptanceStatus: trade ? 'accepted' : 'not-applicable',
            detail: trade
              ? trade.status === "planned"
                ? 'Paper trade armed from fresh signal. Waiting for retest.'
                : 'Paper trade opened from fresh signal.'
              : 'Signal was already consumed or blocked.',
            lastResponse: null,
          });
      } else if (Boolean(backtest?.autoTrade)) {
        pushAlertRelayEvent({
          signalTime: latest.time,
          direction: latest.direction,
          setup: latest.setup,
          channel: 'auto-trade',
          deliveryStatus: 'skipped',
          ackStatus: 'not-applicable',
          acceptanceStatus: 'not-applicable',
          detail: signalIsFresh ? 'Auto trade is enabled, but this signal was not eligible.' : 'Signal is stale and was not auto-executed.',
          lastResponse: null,
        });
      }
    };
    if (isNewSignal) {
      if (!shouldAnnounceSignal) {
        persistLastPromptedSignal(latest.time);
        setSignalPrompt(null);
        setSignalPromptScore(null);
        return;
      }
      showPrompt();
    } else if (backtest?.enabled && isCurrent && signalPrompt && signalPrompt.time > latest.time) {
      // If stepping backward to an earlier signal candle, restore that prompt.
      setSignalPrompt(latest);
      const evalResult = evaluateIctScanner({
        signal: latest,
        bias,
        premiumDiscount,
        latestPrice: latestPrice ?? latest.price,
      });
      setSignalPromptScore(evalResult.score);
    }
  }, [
    promptSignals,
    notificationsEnabled,
    bias,
    premiumDiscount,
    latestPrice,
    candles,
    backtest?.enabled,
    backtest?.autoTrade,
    signalPrompt,
    enterDemoTradeFromSignal,
    pushAlertRelayEvent,
    symbol,
    timeframe,
    dataSource,
    persistLastPromptedSignal,
    staleSignalThreshold,
  ]);

  useEffect(() => {
    if (!signalPrompt) return;
    const evalResult = evaluateIctScanner({
      signal: signalPrompt,
      bias,
      premiumDiscount,
      latestPrice: latestPrice ?? signalPrompt.price,
    });
    setSignalPromptScore(evalResult.score);
  }, [signalPrompt, bias, premiumDiscount, latestPrice]);

  const overlayActive = drawingMode !== "none";
  const panelCursor = panMode ? (isPanning ? "grabbing" : "grab") : drawingMode === "none" ? "default" : "crosshair";
  const overlayCursor = drawingMode === "none" ? "default" : "crosshair";
  const activeTimeLabel = hoverTzTime ?? lastTzTime ?? "—";
  const clockLabel = getClockLabel(clockTz);
  const statusCandle = hoverCandle ?? candles.at(-1) ?? null;
  const hoverPriceLabel = hoverPrice != null ? formatPrice(hoverPrice) : null;
  const headerStatusActive = Boolean(dataSource || statusCandle || backtest?.enabled || notificationsEnabled);
  const manualMenuStyle = manualTradePrompt
    ? (() => {
        const containerWidth = containerRef.current?.clientWidth ?? manualTradePrompt.x + 200;
        const containerHeight = containerRef.current?.clientHeight ?? manualTradePrompt.y + 200;
        const MENU_WIDTH = 180;
        const MENU_HEIGHT = 130;
        const left = Math.min(
          Math.max(8, manualTradePrompt.x + 10),
          Math.max(8, containerWidth - MENU_WIDTH - 8),
        );
        const top = Math.min(
          Math.max(8, manualTradePrompt.y + 10),
          Math.max(8, containerHeight - MENU_HEIGHT - 8),
        );
        return { left, top };
      })()
    : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="shrink-0 border-b border-white/10 bg-[#060b18]/90 px-3 py-2">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-max flex-col items-start gap-2">
                <div className="flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-[#0b1220]/95 px-2 py-1 shadow-[0_14px_34px_rgba(0,0,0,0.35)]">
                  {!leftPanelOpen && onToggleLeftPanel && (
                    <SidebarToggleButton
                      open={false}
                      onClick={onToggleLeftPanel}
                      title="Open layers"
                      ariaLabel="Open layers"
                      className="h-9 w-9 shrink-0 text-zinc-400 hover:text-zinc-100"
                    />
                  )}
                  <button
                    className={clsx(
                      "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                      panMode
                        ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200"
                        : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700",
                    )}
                    onClick={togglePanMode}
                    title="Pan chart"
                  >
                    ✋ Pan
                  </button>
                  {DRAWING_TOOLBAR_TOOLS.map((tool) => (
                    <button
                      key={tool.mode}
                      className={clsx(
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                        drawingMode === tool.mode
                          ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200"
                          : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700",
                      )}
                      onClick={() => setDrawingMode(drawingMode === tool.mode ? "none" : tool.mode)}
                      title={tool.title}
                    >
                      <span className="hidden sm:inline">{tool.label}</span>
                      <span className="sm:hidden">{tool.shortLabel}</span>
                    </button>
                  ))}
                  {drawings.length > 0 && (
                    <button
                      className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 transition hover:border-rose-500/50 hover:text-rose-200"
                      onClick={clearDrawings}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="text-left text-[10px] text-zinc-400">
                  {drawingHint}
                </div>
              </div>
            </div>
          </div>
          {(headerStatusActive || (!rightPanelOpen && onToggleRightPanel)) && (
            <div className="flex flex-wrap items-start justify-end gap-2">
              {headerStatusActive && (
                <div className="flex flex-wrap gap-1.5 lg:max-w-[28rem] lg:flex-col lg:items-end lg:text-right">
                  {dataSource && (
                    <div className="w-fit max-w-full rounded bg-black/70 px-2 py-1 text-[11px] text-zinc-200 shadow">
                      Data: {dataSource}
                    </div>
                  )}
                  {statusCandle && (
                    <div className="min-w-[15rem] max-w-full rounded bg-black/70 px-2 py-1 text-[10px] text-white shadow">
                      <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-right">
                        <span>
                          <span className="text-sky-300">O</span> {formatPrice(statusCandle.o)}
                        </span>
                        <span>
                          <span className="text-emerald-300">H</span> {formatPrice(statusCandle.h)}
                        </span>
                        <span>
                          <span className="text-rose-300">L</span> {formatPrice(statusCandle.l)}
                        </span>
                        <span>
                          <span className="text-amber-200">C</span> {formatPrice(statusCandle.c)}
                        </span>
                      </div>
                    </div>
                  )}
                  {backtest?.enabled && (
                    <div className="w-fit max-w-full rounded bg-emerald-900/70 px-2 py-1 text-[10px] text-emerald-100 shadow">
                      Backtest • {backtestCurrent ?? 0}
                      {backtestTotal ? ` / ${backtestTotal}` : ''}{' '}
                      <span className="text-emerald-300">{backtest?.playing ? 'Playing' : 'Paused'}</span>
                    </div>
                  )}
                  {notificationsEnabled && (
                    <div
                      className="w-fit max-w-full rounded px-2 py-1 text-[10px] text-right shadow"
                      style={{
                        backgroundColor:
                          alertStatus?.status === "live"
                            ? "rgba(16,185,129,0.2)"
                            : alertStatus?.status === "paused"
                              ? "rgba(251,191,36,0.2)"
                              : "rgba(248,113,113,0.2)",
                        color:
                          alertStatus?.status === "live"
                            ? "#bbf7d0"
                            : alertStatus?.status === "paused"
                              ? "#fde68a"
                              : "#fecaca",
                      }}
                    >
                      {alertStatus?.message ?? "Entry alerts enabled"}
                      {alertStatus?.detail ? (
                        <>
                          <br />
                          <span className="text-[9px] opacity-80">{alertStatus.detail}</span>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
              {!rightPanelOpen && onToggleRightPanel && (
                <SidebarToggleButton
                  open={false}
                  side="right"
                  onClick={onToggleRightPanel}
                  title="Open right panel"
                  ariaLabel="Open right panel"
                  className="h-9 w-9 shrink-0 self-start text-zinc-400 hover:text-zinc-100"
                />
              )}
            </div>
          )}
        </div>
      </div>
      <div
        className="relative flex-1 min-h-0 overflow-hidden"
        style={{ cursor: panelCursor }}
        onPointerDown={() => {
          if (panMode) setIsPanning(true);
        }}
        onPointerUp={() => {
          if (panMode) setIsPanning(false);
        }}
        onPointerLeave={() => {
          if (panMode) setIsPanning(false);
        }}
        onContextMenu={handleChartContextMenu}
      >
        <div ref={containerRef} className="h-full w-full" />
        <div
          className={`
            absolute inset-0 z-20
          `}
          style={{
            pointerEvents: overlayActive || manualTradePrompt ? "auto" : "none",
            cursor: overlayCursor,
            touchAction: overlayActive ? "none" : "auto",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onPointerCancel={handlePointerCancel}
        />
        {overlays.pdZones && premiumDiscount && pdZones.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-[5]">
            {pdZones.map((zone) => (
              <div
                key={zone.id}
                className="absolute rounded border border-transparent"
                style={{
                  left: `${zone.left}px`,
                  width: `${zone.width}px`,
                  top: `${zone.top}px`,
                  height: `${zone.height}px`,
                  background: zone.gradient ?? zone.color,
                }}
              >
                <div
                  className="absolute left-1 top-1 rounded px-1 py-0.5 text-[10px]"
                  style={{ backgroundColor: "rgba(0,0,0,0.35)", color: zone.textColor ?? "#e5e7eb" }}
                >
                  {zone.label}
                </div>
              </div>
            ))}
          </div>
        )}
        {overlays.oteBands && oteBoxes.length > 0 && <FvgOverlayLayer boxes={oteBoxes} className="z-[6]" />}
        {overlays.sessions && sessionBands.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-10">
            {sessionBands.map((band) => (
              <div
                key={band.id}
                className="absolute top-0 bottom-0"
                style={{
                  left: `${band.left}px`,
                  width: `${band.width}px`,
                  background: band.gradient ?? band.color,
                }}
              >
                <div
                  className="absolute left-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[10px]"
                  style={{ color: band.textColor ?? "#fde68a" }}
                >
                  {band.label}
                </div>
              </div>
            ))}
          </div>
        )}
        {overlays.killzones && killZoneBands.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-10">
            {killZoneBands.map((band) => (
              <div
                key={band.id}
                className="absolute top-0 bottom-0"
                style={{
                  left: `${band.left}px`,
                  width: `${band.width}px`,
                  background: band.gradient ?? band.color,
                }}
              >
                <div
                  className="absolute left-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[10px]"
                  style={{ color: band.textColor ?? "#fefce8" }}
                >
                  {band.label}
                </div>
              </div>
            ))}
          </div>
        )}
        {hoverPoint && (
          <div className="pointer-events-none absolute inset-0 z-30">
            <div
              className="absolute left-0 right-0 border-t border-dashed border-white/30"
              style={{ top: `${Math.max(0, hoverPoint.y)}px` }}
            />
          </div>
        )}
        {hoverPriceLabel && hoverPoint && (
          <div
            className="pointer-events-none absolute right-2 z-40 -translate-y-1/2 rounded bg-black/80 px-2 py-0.5 text-xs font-semibold text-white shadow-lg shadow-black/40"
            style={{
              top: `${Math.max(10, Math.min(chartHeight ? chartHeight - 10 : hoverPoint.y, hoverPoint.y))}px`,
            }}
          >
            {hoverPriceLabel}
          </div>
        )}
        {renderActiveSignalGuide()}
        {manualTradePrompt && manualMenuStyle && (
          <div
            ref={manualMenuRef}
            className="pointer-events-auto absolute z-40 w-44 rounded border border-emerald-500/40 bg-black/85 p-3 text-xs text-white shadow-lg shadow-emerald-500/20"
            style={{ left: manualMenuStyle.left, top: manualMenuStyle.top }}
          >
            <div className="text-[10px] uppercase tracking-wide text-emerald-300">Manual trade</div>
            <div className="mt-1 text-[11px] text-zinc-400">
            {formatWithTz(manualTradePrompt.time, clockTz, TIME_LABEL_FORMAT)}
            </div>
            <div className="text-base font-semibold text-white">
              {formatPrice(manualTradePrompt.price)}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                className="flex-1 rounded border border-emerald-500/60 bg-emerald-500/10 py-1 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                onClick={() => handleManualTrade("buy")}
              >
                Buy
              </button>
              <button
                className="flex-1 rounded border border-rose-500/60 bg-rose-500/10 py-1 text-[11px] font-semibold text-rose-200 transition hover:bg-rose-500/20"
                onClick={() => handleManualTrade("sell")}
              >
                Sell
              </button>
            </div>
            <button
              className="mt-2 w-full rounded border border-zinc-600 bg-zinc-900/70 py-1 text-[11px] font-semibold text-zinc-300 transition hover:bg-zinc-800"
              onClick={() => setManualTradePrompt(null)}
            >
              Cancel
            </button>
          </div>
        )}
    {drawingElements}
    {previewElement}
        {overlays.signals && signalBoxes.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-20">
            {signalBoxes.map((box) => (
              <div
                key={box.id}
                className="absolute rounded border shadow-sm shadow-black/30"
                style={{
                  left: `${box.left}px`,
                  width: `${box.width}px`,
                  top: `${box.top}px`,
                  height: `${box.height}px`,
                  background: box.gradient ?? box.color,
                  borderColor: box.borderColor ?? box.color,
                }}
                title={box.label}
              >
                <div
                  className="absolute left-1 top-1 rounded px-1 py-0.5 text-[10px] font-semibold"
                  style={{ backgroundColor: "rgba(0,0,0,0.4)", color: box.textColor ?? "#f8fafc" }}
                >
                  {box.label}
                </div>
              </div>
            ))}
          </div>
        )}
        {overlays.tradeMarkers && tradeBoxes.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-[18]">
            {tradeBoxes.map((box) => (
              <div
                key={box.id}
                className="absolute rounded border shadow-sm shadow-black/35"
                style={{
                  left: `${box.left}px`,
                  width: `${box.width}px`,
                  top: `${box.top}px`,
                  height: `${box.height}px`,
                  background: box.gradient ?? box.color,
                  borderColor: box.borderColor ?? box.color,
                }}
                title={box.label}
              >
                <div
                  className="absolute left-1 top-1 rounded px-1 py-0.5 text-[10px] font-semibold"
                  style={{ backgroundColor: "rgba(0,0,0,0.42)", color: box.textColor ?? "#f8fafc" }}
                >
                  {box.label}
                </div>
              </div>
            ))}
          </div>
        )}
        {overlays.liquidity && structureSegments.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-[15]">
            {structureSegments.map((seg) => (
              <div
                key={seg.id}
                className="absolute rounded"
                style={{
                  left: `${seg.left}px`,
                  width: `${seg.width}px`,
                  top: `${seg.top}px`,
                  height: `${seg.height}px`,
                  background: seg.color,
                }}
              >
                <div
                  className="absolute left-1/2 -translate-x-1/2 translate-y-4 rounded px-1 py-[1px] text-[9px] font-semibold"
                  style={{ color: seg.textColor ?? seg.color }}
                >
                  {seg.label}
                </div>
              </div>
            ))}
          </div>
        )}
        {overlays.eqConnectors && eqSegments.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-[15]">
            {eqSegments.map((seg) => (
              <div
                key={seg.id}
                className="absolute"
                style={{
                  left: `${seg.x1}px`,
                  width: `${Math.max(6, seg.x2 - seg.x1)}px`,
                  top: `${seg.y - 1}px`,
                  height: "2px",
                  background: seg.color,
                }}
              >
                <div
                  className="absolute left-1/2 -translate-x-1/2 -translate-y-4 rounded px-1 py-[1px] text-[9px] font-semibold"
                  style={{ color: seg.color }}
                >
                  {seg.label}
                </div>
              </div>
            ))}
          </div>
        )}
        {overlays.inversionFvgSignals && model2022Boxes.length > 0 && (
          <FvgOverlayLayer boxes={model2022Boxes} className="z-20" />
        )}
        {overlays.fvg && fvgBoxes.length > 0 && <FvgOverlayLayer boxes={fvgBoxes} className="z-10" />}
        {overlays.orderBlocks && obBoxes.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-10">
            {obBoxes.map((box) => (
              <div
                key={box.id}
                className="absolute rounded border"
                style={{
                  left: `${box.left}px`,
                  width: `${box.width}px`,
                  top: `${box.top}px`,
                  height: `${box.height}px`,
                  background: box.gradient ?? box.color,
                  borderColor: box.borderColor ?? box.color,
                }}
                title={box.label}
              >
                <div
                  className="absolute left-1 top-1 rounded px-1 py-0.5 text-[10px]"
                  style={{ backgroundColor: "rgba(0,0,0,0.45)", color: box.textColor ?? "#fefce8" }}
                >
                  {box.label}
                </div>
              </div>
            ))}
          </div>
        )}
        {overlays.breakers && breakerBoxes.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-10">
            {breakerBoxes.map((box) => (
              <div
                key={box.id}
                className="absolute rounded border"
                style={{
                  left: `${box.left}px`,
                  width: `${box.width}px`,
                  top: `${box.top}px`,
                  height: `${box.height}px`,
                  background: box.gradient ?? box.color,
                  borderColor: box.borderColor ?? box.color,
                }}
                title={box.label}
              >
                <div
                  className="absolute left-1 top-1 rounded px-1 py-0.5 text-[10px]"
                  style={{ backgroundColor: "rgba(0,0,0,0.45)", color: box.textColor ?? "#fde68a" }}
                >
                  {box.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="relative flex h-12 shrink-0 items-center border-t border-white/10 bg-[#0f172a]/95 text-sm text-white shadow-[0_-1px_0_0_rgba(255,255,255,0.08)]">
        {backtest?.enabled && backtestTotal && (
          <div className="absolute inset-x-0 top-0 h-1 bg-zinc-800/70">
            <div
              className="h-full bg-emerald-500/70 transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(1, backtestProgress ?? 0)) * 100}%` }}
            />
          </div>
        )}
        <div className="relative flex-1 h-full px-3">
          <div className="absolute left-3 top-1 text-[11px] text-gray-400">
            {clockLabel}: {activeTimeLabel}
          </div>
          {timelineTicks.length === 0 && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300">
              Time axis loading…
            </div>
          )}
          <div className="absolute inset-x-0 bottom-1 text-[12px]">
            {timelineTicks.map((tick, idx) => (
              <div
                key={idx}
                className="absolute whitespace-nowrap rounded bg-black/70 px-2 py-1 text-[12px] shadow"
                style={{ transform: "translateX(-50%)", left: `${tick.position}px` }}
              >
                {tick.label}
              </div>
            ))}
          </div>
        </div>
        {backtest?.enabled && (
          <div className="flex flex-wrap items-center gap-2 px-3 text-[11px] text-white/80">
            <button
              className={clsx(
                "rounded border px-2 py-0.5 text-xs font-semibold transition",
                backtest.autoTrade ? "border-emerald-500/60 text-emerald-200" : "border-zinc-600 text-zinc-300",
              )}
              onClick={() => patchBacktest?.({ autoTrade: !backtest.autoTrade })}
            >
              Auto trade: {backtest.autoTrade ? "ON" : "OFF"}
            </button>
              <span>Auto %</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={autoStartPct}
                onChange={(e) => setAutoStartPct(Number(e.target.value))}
                className="w-14 rounded bg-black/60 px-1 py-0.5 text-xs text-white outline-none"
                disabled={!backtest.autoTrade}
              />
              <span className="text-white/50">-</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={autoEndPct}
                onChange={(e) => setAutoEndPct(Number(e.target.value))}
                className="w-14 rounded bg-black/60 px-1 py-0.5 text-xs text-white outline-none"
                disabled={!backtest.autoTrade}
              />
              {backtest.autoTrade && (
                <button
                  className="rounded border border-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50"
                  onClick={runAutoBacktest}
                  disabled={autoRunning}
                >
                  {autoRunning ? "Running…" : "Auto trade"}
                </button>
              )}
              {autoSummary && (
                <span className="text-emerald-200">
                  {autoSummary.trades} trades (W {autoSummary.wins} / L {autoSummary.losses})
                </span>
              )}
              {autoError && <span className="text-red-300">{autoError}</span>}
            </div>
        )}
        <div className="flex items-center gap-2 px-3 text-right text-sm font-semibold text-white drop-shadow">
          <select
            id="clock-tz"
            className="rounded bg-black/80 px-2 py-1 text-xs text-white outline-none"
            value={clockTz}
            onChange={(e) => updateClockTz(e.target.value)}
          >
            {CLOCK_OPTIONS.map((tz) => (
              <option key={tz.id} value={tz.id}>
                {tz.label}
              </option>
            ))}
          </select>
          <LiveClockDisplay clockTz={clockTz} />
        </div>
      </div>
      {setupStatsEntries.length > 0 && (
        <div className="border-t border-white/5 bg-[#050a1a]/95 px-3 py-3 text-[11px] text-white">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Setup telemetry</span>
            <button
              type="button"
              className="rounded border border-emerald-500/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
              onClick={copySetupStats}
            >
              Copy
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto pr-1">
            <div className="grid gap-1 text-[11px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {setupStatsEntries.map((entry) => (
                <div
                  key={entry.setup}
                  className="flex items-start justify-between rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px]"
                >
                  <div className="pr-2">
                    <div className="font-semibold text-white">{entry.setup}</div>
                    <div className="text-[10px] text-zinc-400">
                      {entry.total} trade{entry.total === 1 ? "" : "s"} • {entry.winRate.toFixed(0)}% win
                    </div>
                  </div>
                  <div className="text-right text-[10px] leading-tight text-zinc-300">
                    <div>
                      W <span className="text-emerald-300">{entry.wins}</span> / L{" "}
                      <span className="text-rose-300">{entry.losses}</span>
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      avg {entry.wins ? entry.avgWin.toFixed(2) : "-"} / {entry.losses ? entry.avgLoss.toFixed(2) : "-"}R
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LiveClockDisplay({ clockTz }: { clockTz: string }) {
  const [clockState, setClockState] = useState(() => getClockState(clockTz));

  useEffect(() => {
    const updateClock = () => setClockState(getClockState(clockTz));
    updateClock();
    const id = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(id);
  }, [clockTz]);

  return (
    <div className="flex flex-col text-right leading-tight">
      <span className="text-[10px] font-normal text-zinc-400">{clockState.date}</span>
      <span className="inline-block rounded bg-black/70 px-2 py-0.5 text-sm text-white">{clockState.time}</span>
    </div>
  );
}

function getClockState(clockTz: string) {
  const now = new Date();
  return {
    date: formatWithTz(now, clockTz, { weekday: "short", month: "short", day: "numeric" }),
    time: formatWithTz(now, clockTz),
  };
}

function formatPrice(value: number) {
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toFixed(2);
  if (abs >= 1) return value.toFixed(2);
  if (abs >= 0.01) return value.toFixed(4);
  return value.toFixed(6);
}

function formatTradeMarkerLabel(trade: BacktestTrade) {
  const base = trade.direction === "buy" ? "BUY" : "SELL";
  const code = getTradeStatusCode(trade);
  return code ? `${base}(${code})` : base;
}

function formatTradeOverlayLabel(trade: BacktestTrade) {
  const tradeCode = formatTradeMarkerLabel(trade);
  const setup = trade.setup ? formatSetupShort(trade.setup) : "TRADE";
  return `${tradeCode} · ${setup}`;
}

function styleForTradeOverlay(trade: BacktestTrade) {
  if (trade.result === "win") {
    return {
      fill: "linear-gradient(180deg, rgba(16,185,129,0.36) 0%, rgba(16,185,129,0.12) 100%)",
      border: "rgba(45,212,191,0.88)",
      text: "#d1fae5",
    };
  }
  if (trade.result === "loss") {
    return {
      fill: "linear-gradient(180deg, rgba(248,113,113,0.36) 0%, rgba(248,113,113,0.12) 100%)",
      border: "rgba(251,146,60,0.88)",
      text: "#fee2e2",
    };
  }
  if (trade.result === "breakeven") {
    return {
      fill: "linear-gradient(180deg, rgba(148,163,184,0.34) 0%, rgba(148,163,184,0.12) 100%)",
      border: "rgba(191,219,254,0.88)",
      text: "#e2e8f0",
    };
  }
  return trade.direction === "buy"
    ? {
        fill: "linear-gradient(180deg, rgba(34,197,94,0.34) 0%, rgba(34,197,94,0.1) 100%)",
        border: "rgba(74,222,128,0.88)",
        text: "#dcfce7",
      }
    : {
        fill: "linear-gradient(180deg, rgba(249,115,22,0.34) 0%, rgba(249,115,22,0.1) 100%)",
        border: "rgba(251,146,60,0.88)",
        text: "#ffedd5",
      };
}

function getTradeStatusCode(trade: BacktestTrade) {
  if (trade.result === "win") return "W";
  if (trade.result === "loss") return "L";
  if (trade.result === "breakeven") return "B";
  const status = trade.status ?? (trade.result ? "closed" : "active");
  if (status === "planned") return "P";
  if (status === "active") return "T";
  if (status === "canceled") return "C";
  if (status === "closed") return "C";
  return "";
}

function simulateTradeOutcome(
  signal: Signal,
  base: BacktestTrade,
  candles: Candle[],
  startIdx: number,
  endIdx: number,
  options: { waitForRetest?: boolean } = {},
): Pick<
  BacktestTrade,
  "result" | "pnl" | "exitTime" | "partialRealized" | "partialHit" | "openTime" | "status" | "armedAt" | "expiresAt"
> {
  const idx = candles.findIndex((c) => c.t > signal.time);
  if (idx === -1) return {};
  const start = Math.max(idx, startIdx);
  const waitForRetest = options.waitForRetest ?? false;
  let stop = base.stop;
  const target = base.target;
  const entry = base.entry;
  const dir = base.direction;
  if (stop == null || target == null) return {};
  const takePartial = base.takePartial;
  const partialFraction = base.partialFraction ?? 0.5;
  let partialRealized = base.partialRealized ?? 0;
  let partialHit = base.partialHit ?? false;
  const size = base.positionSize ?? 1;
  let openTime = base.openTime ?? signal.time;
  let entered = !waitForRetest;
  for (let i = start; i <= endIdx; i++) {
    const candle = candles[i];
    if (!entered) {
      if (base.expiresAt != null && candle.t > base.expiresAt) {
        return {};
      }
      const entryHit = candle.l <= entry && candle.h >= entry;
      if (!entryHit) {
        continue;
      }
      entered = true;
      openTime = candle.t;
      continue;
    }
    if (candle.t <= openTime) {
      continue;
    }
    if (takePartial != null && !partialHit) {
      const hitPartial = dir === "buy" ? candle.h >= takePartial : candle.l <= takePartial;
      if (hitPartial) {
        partialHit = true;
        const move = dir === "buy" ? takePartial - entry : entry - takePartial;
        partialRealized += (partialFraction ?? 0.5) * move * size;
        stop = entry;
        continue;
      }
    }
    const hitStop = dir === "buy" ? candle.l <= stop : candle.h >= stop;
    const hitTarget = dir === "buy" ? candle.h >= target : candle.l <= target;
    if (!hitStop && !hitTarget) continue;
    let result: "win" | "loss";
    if (hitStop && hitTarget) {
      const open = candle.o;
      const stopDist = Math.abs(open - stop);
      const targetDist = Math.abs(open - target);
      result = stopDist <= targetDist ? "loss" : "win";
    } else if (hitStop) {
      result = "loss";
    } else {
      result = "win";
    }
    const move =
      dir === "buy"
        ? result === "win"
          ? target - entry
          : stop - entry
        : result === "win"
          ? entry - target
          : entry - stop;
    const remainingFraction = partialHit ? 1 - (partialFraction ?? 0.5) : 1;
    const pnl = partialRealized + move * remainingFraction * size;
    return {
      result,
      pnl,
      exitTime: candle.t,
      partialRealized,
      partialHit,
      openTime,
      status: "closed",
      armedAt: undefined,
      expiresAt: undefined,
    };
  }
  if (!entered) {
    return {};
  }
  return {
    partialRealized: partialRealized || undefined,
    partialHit,
    openTime,
    status: "active",
    armedAt: undefined,
    expiresAt: undefined,
  };
}

function formatMeasureLabel(start: { price: number; time: number }, end: { price: number; time: number }) {
  const delta = end.price - start.price;
  const percent = start.price !== 0 ? (delta / start.price) * 100 : 0;
  const deltaText = `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`;
  const percentText = `${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`;
  const durationText = formatDuration(Math.abs(end.time - start.time));
  return `${deltaText} (${percentText}) • ${durationText}`;
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes && parts.length < 3) parts.push(`${minutes}m`);
  if (!parts.length) parts.push(`${seconds}s`);
  return parts.join(" ");
}

function computeSessionMarkers(candles: Candle[]) {
  const markers: { time: number; label: string }[] = [];
  const seenLabels = new Set<string>();
  for (const candle of candles) {
    const d = new Date(candle.t);
    const hour = d.getUTCHours();
    const session = SESSION_ZONES.find((s) => hour >= s.startHour && hour < s.endHour);
    if (!session) continue;
    const key = `${session.label}-${d.toISOString().slice(0, 10)}-${session.startHour}`;
    if (seenLabels.has(key)) continue;
    seenLabels.add(key);
    markers.push({ time: candle.t, label: session.label });
  }
  return markers.slice(-20);
}

function computeAtrSeries(candles: Candle[], period = 14) {
  if (candles.length === 0) return [];
  const atr: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      current.h - current.l,
      Math.abs(current.h - prev.c),
      Math.abs(current.l - prev.c),
    );
    if (i === 1) {
      atr[i] = tr;
    } else {
      atr[i] = ((atr[i - 1] * (period - 1)) + tr) / period;
    }
  }
  return atr;
}

function formatTimeTick(time: Time, showIntraday: boolean, timeZone: string) {
  if (typeof time === "number") {
    const d = new Date(time * 1000);
    return formatDate(d, showIntraday, timeZone);
  }
  if (typeof time === "object" && "year" in time && "month" in time && "day" in time) {
    const d = new Date(Date.UTC(time.year, time.month - 1, time.day));
    return formatDate(d, showIntraday, timeZone);
  }
  return "";
}

function formatDate(date: Date, showIntraday: boolean, timeZone: string) {
  const optsDay: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const optsIntraday: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  return new Intl.DateTimeFormat("en", { ...(showIntraday ? optsIntraday : optsDay), timeZone }).format(date);
}

function formatSetupShort(setup: string) {
  if (setup.length <= 10) return setup;
  return setup
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function formatTimelineLabel(epochMs: number, intervalMs: number, timeZone: string) {
  const d = new Date(epochMs);
  const isDaily = intervalMs >= 24 * 60 * 60 * 1000;
  const optsDay: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const optsIntraday: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  return new Intl.DateTimeFormat("en", { ...(isDaily ? optsDay : optsIntraday), timeZone }).format(d);
}

function calcRMultiple(entry: number, stop: number, target: number, dir: "buy" | "sell") {
  const risk = dir === "buy" ? entry - stop : stop - entry;
  const reward = dir === "buy" ? target - entry : entry - target;
  if (risk <= 0) return 0;
  return reward / risk;
}

function formatFullDate(time: Time, timeZone: string) {
  let date: Date;
  if (typeof time === "number") {
    date = new Date(time * 1000);
  } else if (typeof time === "object" && "year" in time && "month" in time && "day" in time) {
    date = new Date(Date.UTC(time.year, time.month - 1, time.day));
  } else {
    date = new Date();
  }
  return new Intl.DateTimeFormat("en", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function colorForKillzone(label: string) {
  const lc = label.toLowerCase();
  if (lc.includes("asia")) return "rgba(59,130,246,0.12)";
  if (lc.includes("london")) return "rgba(34,197,94,0.12)";
  if (lc.includes("new york") || lc.includes("ny")) return "rgba(249,115,22,0.12)";
  if (lc.includes("kill") || lc.includes("ote")) return "rgba(217,70,239,0.12)";
  return "rgba(255,255,255,0.04)";
}

function styleForSession(label: string) {
  const lc = label?.toLowerCase() ?? "";
  if (lc.includes("asia")) {
    return {
      fill: "rgba(59,130,246,0.16)",
      gradient: "linear-gradient(180deg, rgba(59,130,246,0.18) 0%, rgba(15,23,42,0) 100%)",
      text: "#bfdbfe",
    };
  }
  if (lc.includes("london")) {
    return {
      fill: "rgba(45,212,191,0.16)",
      gradient: "linear-gradient(180deg, rgba(45,212,191,0.18) 0%, rgba(6,78,59,0) 100%)",
      text: "#d1fae5",
    };
  }
  if (lc.includes("new york") || lc.includes("ny")) {
    return {
      fill: "rgba(249,115,22,0.16)",
      gradient: "linear-gradient(180deg, rgba(249,115,22,0.2) 0%, rgba(120,53,15,0) 100%)",
      text: "#ffedd5",
    };
  }
  return {
    fill: "rgba(148,163,184,0.12)",
    gradient: "linear-gradient(180deg, rgba(148,163,184,0.16) 0%, rgba(30,41,59,0) 100%)",
    text: "#e2e8f0",
  };
}

function priceMatchesLevel(a: number, b: number) {
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= scale * 1e-6;
}

type OverlayBox = {
  id: string;
  left: number;
  width: number;
  top: number;
  height: number;
  color: string;
  borderColor?: string;
  gradient?: string;
  textColor?: string;
  label: string;
  showLabel?: boolean;
  guideColor?: string;
  midlineColor?: string;
};

function areOverlayBoxesEqual(a: OverlayBox[], b: OverlayBox[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const boxA = a[i];
    const boxB = b[i];
    if (
      boxA.id !== boxB.id ||
      boxA.left !== boxB.left ||
      boxA.width !== boxB.width ||
      boxA.top !== boxB.top ||
      boxA.height !== boxB.height ||
      boxA.color !== boxB.color ||
      boxA.borderColor !== boxB.borderColor ||
      boxA.gradient !== boxB.gradient ||
      boxA.textColor !== boxB.textColor ||
      boxA.label !== boxB.label ||
      boxA.showLabel !== boxB.showLabel ||
      boxA.guideColor !== boxB.guideColor ||
      boxA.midlineColor !== boxB.midlineColor
    ) {
      return false;
    }
  }
  return true;
}

function FvgOverlayLayer({ boxes, className }: { boxes: OverlayBox[]; className: string }) {
  return (
    <div className={clsx("pointer-events-none absolute inset-0", className)}>
      {boxes.map((box) => (
        <div
          key={box.id}
          className="absolute overflow-hidden rounded-md border"
          style={{
            left: `${box.left}px`,
            width: `${box.width}px`,
            top: `${box.top}px`,
            height: `${box.height}px`,
            background: box.gradient ?? box.color,
            borderColor: box.borderColor ?? box.color,
            boxShadow: `inset 0 0 0 1px ${box.borderColor ?? box.color}`,
          }}
          title={box.label}
        >
          <div
            className="absolute inset-y-0 left-0 border-l border-dashed opacity-90"
            style={{ borderColor: box.guideColor ?? box.borderColor ?? box.color }}
          />
          <div
            className="absolute inset-y-0 right-0 border-r border-dashed opacity-90"
            style={{ borderColor: box.guideColor ?? box.borderColor ?? box.color }}
          />
          <div
            className="absolute left-0 right-0 top-1/2 border-t border-dashed opacity-60"
            style={{ borderColor: box.midlineColor ?? box.borderColor ?? box.color }}
          />
          {box.showLabel !== false && (
            <div
              className="absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: "rgba(2,6,23,0.62)", color: box.textColor ?? "#e2e8f0" }}
            >
              {box.label}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function buildGapOverlayBox({
  id,
  gap,
  timeToX,
  priceToY,
  candleSlotWidth,
  color,
  gradient,
  borderColor,
  textColor,
  label,
}: {
  id: string;
  gap: Gap;
  timeToX: (time: number) => number | null;
  priceToY: (price: number) => number | null;
  candleSlotWidth: number;
  color: string;
  gradient: string;
  borderColor: string;
  textColor: string;
  label: string;
}): OverlayBox | null {
  const startX = timeToX(gap.startTime);
  const endX = timeToX(gap.endTime);
  const yTop = priceToY(Math.max(gap.top, gap.bottom));
  const yBottom = priceToY(Math.min(gap.top, gap.bottom));
  if (startX == null || endX == null || yTop == null || yBottom == null) {
    return null;
  }

  const halfCandle = candleSlotWidth / 2;
  const visualLeft = Math.min(startX, endX) + halfCandle;
  const visualRight = Math.max(startX, endX) - halfCandle;
  const zoneWidth = Math.max(candleSlotWidth * 0.9, visualRight - visualLeft);
  const zoneHeight = Math.max(3, Math.abs(yTop - yBottom));

  return {
    id,
    left: visualRight > visualLeft ? visualLeft : Math.min(startX, endX),
    width: zoneWidth,
    top: Math.min(yTop, yBottom),
    height: zoneHeight,
    color,
    borderColor,
    gradient,
    textColor,
    label,
    showLabel: zoneWidth >= 72 && zoneHeight >= 16,
    guideColor: borderColor,
    midlineColor: borderColor,
  };
}

function estimateCandleSlotWidth(
  candles: Candle[],
  timeToX: (time: number) => number | null,
  chartWidth: number,
) {
  if (candles.length < 2) {
    return clamp(chartWidth / 12, 8, 28);
  }

  const spacings: number[] = [];
  const startIndex = Math.max(1, candles.length - 40);
  for (let i = startIndex; i < candles.length; i++) {
    const prevX = timeToX(candles[i - 1].t);
    const currX = timeToX(candles[i].t);
    if (prevX == null || currX == null) {
      continue;
    }
    const spacing = Math.abs(currX - prevX);
    if (spacing > 0) {
      spacings.push(spacing);
    }
  }

  const averageSpacing =
    spacings.length > 0
      ? spacings.reduce((sum, spacing) => sum + spacing, 0) / spacings.length
      : chartWidth / Math.max(candles.length, 1);

  return clamp(averageSpacing * 0.72, 6, 42);
}

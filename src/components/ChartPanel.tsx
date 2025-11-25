"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
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
} from "@/lib/types";
import { SESSION_ZONES } from "@/lib/config";
import { classifySession } from "@/lib/ict";
import { CLOCK_OPTIONS, formatWithTz, getClockLabel } from "@/lib/time";
import { evaluateIctScanner } from "@/lib/ictScanner";
import { useAppStore, type BacktestState, type BacktestTrade } from "@/state/useAppStore";
import { useShallow } from "zustand/react/shallow";

const ADVANCED_SETUPS = new Set(["Silver Bullet", "Turtle Soup"]);
const TIER_ONE_SETUPS = new Set([
  "Bias + OB/FVG + Session",
  "CHoCH + FVG + OTE",
  "Silver Bullet",
  "Turtle Soup",
]);
const TIME_LABEL_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
};

type Props = {
  symbol?: string;
  timeframe?: Timeframe;
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
    | "inversionFvgSignals"
    | "tradeMarkers",
    boolean
  >;
};

export function ChartPanel({
  symbol,
  timeframe,
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
  overlays,
}: Props) {
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
    optimizerEnabled,
    addTrade,
    trades,
    updateTrade,
    setBacktest: patchBacktest,
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
      optimizerEnabled: state.optimizerEnabled,
      addTrade: state.addTrade,
      trades: state.backtest.trades,
      updateTrade: state.updateTrade,
      setBacktest: state.setBacktest,
    })),
  );
  const candlesSnapshotRef = useRef(candles);
  candlesSnapshotRef.current = candles;
  const clockTzRef = useRef(clockTz);
  clockTzRef.current = clockTz;
  const [hoverTzTime, setHoverTzTime] = useState<string | null>(null);
  const [lastTzTime, setLastTzTime] = useState<string | null>(null);
  const [liveClock, setLiveClock] = useState<string>(() => formatWithTz(new Date(), clockTz));
  const [liveDate, setLiveDate] = useState<string>(() =>
    formatWithTz(new Date(), clockTz, { weekday: "short", month: "short", day: "numeric" }),
  );
  const [timelineTicks, setTimelineTicks] = useState<{ label: string; position: number }[]>([]);
  const [sessionBands, setSessionBands] = useState<
    { id: string; left: number; width: number; label: string }[]
  >([]);
  const [killZoneBands, setKillZoneBands] = useState<
    { id: string; left: number; width: number; label: string; color: string }[]
  >([]);
  const [fvgBoxes, setFvgBoxes] = useState<OverlayBox[]>([]);
  const [obBoxes, setObBoxes] = useState<OverlayBox[]>([]);
  const [breakerBoxes, setBreakerBoxes] = useState<OverlayBox[]>([]);
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
  const lastSignalFeed = backtestSignals ?? notificationSignals ?? signals;
  const lastSignal =
    lastSignalFeed && lastSignalFeed.length ? lastSignalFeed.at(-1)! : null;
  const backtestCandles = fullCandles && fullCandles.length ? fullCandles : candles;
  const datasetKey = `${symbol ?? "?"}-${timeframe ?? "?"}`;
  const lastDatasetKeyRef = useRef(datasetKey);
  const lastCandleTimeRef = useRef<number | null>(candles.at(-1)?.t ?? null);
  const atrSeries = useMemo(() => computeAtrSeries(candles, 14), [candles]);
  const [magnetVisible, setMagnetVisible] = useState(true);
  const [magnetCollapsed, setMagnetCollapsed] = useState(false);
  const [magnetExpanded, setMagnetExpanded] = useState(false);
  const [magnetPos, setMagnetPos] = useState({ x: 24, y: 24 });
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const activeCandle = useMemo(() => {
    if (backtest?.enabled) {
      const idx = Math.min(Math.max(backtest.cursor, 0), Math.max(backtestCandles.length - 1, 0));
      return backtestCandles[idx] ?? null;
    }
    return candles.at(-1) ?? null;
  }, [backtest?.enabled, backtest?.cursor, backtestCandles, candles]);
  const blueprintData = useMemo(() => {
    if (!activeCandle) return null;
    const range = Math.max(activeCandle.h - activeCandle.l, 1e-9);
    const bodyHigh = Math.max(activeCandle.o, activeCandle.c);
    const bodyLow = Math.min(activeCandle.o, activeCandle.c);
    return {
      wickTopPct: ((activeCandle.h - bodyHigh) / range) * 100,
      bodyPct: ((bodyHigh - bodyLow) / range) * 100,
      wickBottomPct: ((bodyLow - activeCandle.l) / range) * 100,
      direction: activeCandle.c >= activeCandle.o ? 'up' : 'down',
      range,
    };
  }, [activeCandle]);

  const startMagnetDrag = (evt: ReactPointerEvent<HTMLDivElement>) => {
    evt.preventDefault();
    dragState.current = {
      startX: evt.clientX,
      startY: evt.clientY,
      origX: magnetPos.x,
      origY: magnetPos.y,
    };
    window.addEventListener('pointermove', handleMagnetDrag);
    window.addEventListener('pointerup', stopMagnetDrag);
  };

  const handleMagnetDrag = useCallback((evt: PointerEvent) => {
    if (!dragState.current) return;
    const dx = evt.clientX - dragState.current.startX;
    const dy = evt.clientY - dragState.current.startY;
    const boundX = window.innerWidth - 120;
    const boundY = window.innerHeight - 120;
    setMagnetPos({
      x: Math.min(Math.max(dragState.current.origX + dx, 8), boundX),
      y: Math.min(Math.max(dragState.current.origY + dy, 8), boundY),
    });
  }, []);

  const stopMagnetDrag = useCallback(() => {
    dragState.current = null;
    window.removeEventListener('pointermove', handleMagnetDrag);
    window.removeEventListener('pointerup', stopMagnetDrag);
  }, [handleMagnetDrag]);

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handleMagnetDrag);
      window.removeEventListener('pointerup', stopMagnetDrag);
    };
  }, [handleMagnetDrag, stopMagnetDrag]);
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
      const trade: BacktestTrade = {
        id: overrides.id ?? `bt-${signal.setup ?? "ict"}-${signal.time}-${Math.random().toString(36).slice(2, 6)}`,
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
        openTime: overrides.openTime ?? signal.time,
        positionSize,
        sessionLabel: overrides.sessionLabel ?? signal.session ?? undefined,
        biasLabel: overrides.biasLabel ?? signal.bias ?? undefined,
        status: overrides.status ?? "active",
        ...overrides,
      };
      addTrade(trade);
      seenSignalIdsRef.current.add(signalId);
      return trade;
    },
    [addTrade, buildSignalId],
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
        openTime: signal.time,
        positionSize,
      };
      const outcome = simulateTradeOutcome(signal, tradeBase, backtestCandles, startIdx, endIdx);
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
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const [hoverPrice, setHoverPrice] = useState<number | null>(null);
  const [hoverCandle, setHoverCandle] = useState<Candle | null>(null);
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
    fetch("/api/trade-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        setup: trade.setup,
        session: trade.sessionLabel ?? "Unknown",
        bias: trade.biasLabel ?? "Neutral",
        result: trade.result,
        rMultiple: Number.isFinite(computedR) ? computedR : trade.result === "win" ? 1 : -1,
      }),
    }).catch(() => {});
  }, []);
  useEffect(() => {
    setPendingPoints([]);
    setPreviewPoint(null);
    setIsPointerDown(false);
    pointerIdRef.current = null;
    pointerMovedRef.current = false;
  }, [drawingMode]);

  useEffect(() => {
    if (lastDatasetKeyRef.current !== datasetKey) {
      lastDatasetKeyRef.current = datasetKey;
      lastPromptedSignalRef.current = null;
      setSignalPrompt(null);
      setSignalPromptScore(null);
      seenSignalIdsRef.current.clear();
    }
  }, [datasetKey]);

  useEffect(() => {
    if (notificationsEnabled && backtest?.enabled) {
      console.warn(
        "[ICT] Entry alerts follow the Backtest playback. Disable Backtest to receive live alerts.",
      );
    }
  }, [notificationsEnabled, backtest?.enabled]);

  useEffect(() => {
    if (!notificationsEnabled) return;
    const latestTime = candles.at(-1)?.t ?? null;
    const lastSignalTime = lastSignal?.time ?? null;
    if (!latestTime || !lastSignalTime) return;
    const ageHours = (latestTime - lastSignalTime) / (60 * 60 * 1000);
    if (ageHours >= 8) {
      console.info(
        `[ICT] No entry alerts detected in ${ageHours.toFixed(1)}h (last alert ${new Date(lastSignalTime).toISOString()}).`,
      );
    }
  }, [notificationsEnabled, candles, lastSignal?.time]);

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
        if (trade.manual && trade.entry != null) {
          const entryHit = latest.l <= trade.entry && latest.h >= trade.entry;
          if (entryHit) {
            updateTrade(trade.id, { status: "active", openTime: latest.t });
          }
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
    }
  > = {
    hline: { points: 1, dragPreview: false },
    trend: { points: 2, dragPreview: true },
    rect: { points: 2, dragPreview: true },
    fibo: { points: 2, dragPreview: true },
    measure: { points: 2, dragPreview: true },
    long: { points: 3, dragPreview: false },
    short: { points: 3, dragPreview: false },
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
      points: points.slice(0, TOOL_CONFIG[type].points),
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
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
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
        points: [...pendingPoints.slice(0, config.points - 1), previewPoint],
      } as Drawing;
    }
    if (!previewPoint) return null;
    if (pendingPoints.length >= config.points) return null;
    return {
      id: "preview",
      type: drawingMode,
      color: DRAW_COLORS[drawingMode],
      points: [...pendingPoints, previewPoint].slice(0, config.points),
    } as Drawing;
  })();

  const previewElement = previewDrawing ? renderDrawingShape(previewDrawing, "preview", { preview: true }) : null;

  useEffect(() => {
    if (!containerRef.current || chartRef.current) return;

    let mounted = true;
    import("lightweight-charts")
      .then((lwc) => {
        if (!mounted || !containerRef.current) return;
        const createChart = (lwc as any).createChart ?? (lwc as any).default?.createChart;
        const ColorType = (lwc as any).ColorType ?? (lwc as any).default?.ColorType;
        const createSeriesMarkers =
          (lwc as any).createSeriesMarkers ?? (lwc as any).default?.createSeriesMarkers;
        if (!createChart || !ColorType) {
          console.error("lightweight-charts exports missing createChart/ColorType");
          return;
        }
        const chart = createChart(containerRef.current, {
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

        const CandlestickSeries =
          (lwc as any).CandlestickSeries ?? (lwc as any).default?.CandlestickSeries;
        const chartAny = chart as any;

        const seriesOptions = {
          upColor: "#34d399",
          wickUpColor: "#34d399",
          downColor: "#f87171",
          wickDownColor: "#f87171",
        };

        const series: ISeriesApi<"Candlestick"> | undefined =
          typeof chartAny.addCandlestickSeries === "function"
            ? chartAny.addCandlestickSeries(seriesOptions)
            : typeof chartAny.addSeries === "function" && CandlestickSeries
              ? chartAny.addSeries(CandlestickSeries, seriesOptions)
              : undefined;

        if (!series) {
          console.error("addCandlestickSeries missing on chart", chart);
          return;
        }

        chartRef.current = chart;
        seriesRef.current = series;
        markersPluginRef.current = createSeriesMarkers
          ? createSeriesMarkers(series, [])
          : null;
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
          chart.timeScale().fitContent();
        }

        const resizeObserver = new ResizeObserver((entries) => {
          const { width, height } = entries[0].contentRect;
          setChartWidth(width);
          setChartHeight(height);
          chart.applyOptions({ width, height });
        });
        resizeObserver.observe(containerRef.current as Element);

        return () => {
          markersPluginRef.current?.detach();
          markersPluginRef.current = null;
          resizeObserver.disconnect();
          chart.remove();
          chartRef.current = null;
          seriesRef.current = null;
        };
      })
      .catch((err) => console.error("Failed to init chart", err));

    return () => {
      mounted = false;
    };
  }, [candles.length]);

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
  }, [candles, chartWidth, clockTz]);

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
        return { id: `${r.label}-${idx}-${r.start}`, left, width, label: r.label, color: colorForKillzone(r.label) };
      })
      .filter((b) => Number.isFinite(b.left) && Number.isFinite(b.width));
    setSessionBands(bands);
  }, [overlays.sessions, candles, chartWidth]);

  useEffect(() => {
    if (!overlays.killzones || candles.length < 2) {
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
        return { id: `${r.label}-${idx}-${r.start}`, left, width, label: r.label, color: colorForKillzone(r.label) };
      })
      .filter((b) => Number.isFinite(b.left) && Number.isFinite(b.width));
    setKillZoneBands(bands);
  }, [overlays.killzones, candles, chartWidth]);

  useEffect(() => {
    if (!markersPluginRef.current) return;
    const markers: SeriesMarker<UTCTimestamp>[] = [];

    if (overlays.liquidity && swings) {
      markers.push(
        ...swings.map((s) => ({
          time: (s.time / 1000) as UTCTimestamp,
          position: s.type === "high" ? ("aboveBar" as const) : ("belowBar" as const),
          color: "#a78bfa",
          shape: "circle" as const,
        })),
      );
    }

    if (overlays.fvg && gaps) {
      markers.push(
        ...gaps.map((g) => ({
          time: (g.startTime / 1000) as UTCTimestamp,
          position: "aboveBar" as const,
          color: g.type === "bullish" ? "#38bdf8" : "#f59e0b",
          shape: "square" as const,
        })),
      );
    }

    if (overlays.signals && signals) {
      const filteredSignals =
        selectedSetup === "all"
          ? signals
          : signals.filter((s) => matchesSelectedSetup(s.setup));
      markers.push(
        ...filteredSignals.map((s) => ({
          time: (s.time / 1000) as UTCTimestamp,
          position: s.direction === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
          color: s.direction === "buy" ? "#34d399" : "#f87171",
          shape: s.direction === "buy" ? ("arrowUp" as const) : ("arrowDown" as const),
          text: s.setup ? formatSetupShort(s.setup) : s.direction === "buy" ? "Buy" : "Sell",
          id: `sig-${s.time}-${s.setup ?? s.direction}`,
        })),
      );
    }

    if (overlays.liquidity && structureShifts?.length) {
      markers.push(
        ...structureShifts.map((b) => ({
          time: (b.time / 1000) as UTCTimestamp,
          position: b.direction === "bullish" ? ("belowBar" as const) : ("aboveBar" as const),
          color: b.direction === "bullish" ? "#22d3ee" : "#fb7185",
          shape: b.direction === "bullish" ? ("arrowUp" as const) : ("arrowDown" as const),
          text: b.label,
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
        })),
      );
    }

    if (overlays.sweeps && sweeps?.length) {
      markers.push(
        ...sweeps.map((s) => ({
          time: (s.time / 1000) as UTCTimestamp,
          position: s.direction === "up" ? ("aboveBar" as const) : ("belowBar" as const),
          color: s.type === "eqh" ? "#a855f7" : "#f97316",
          shape: s.direction === "up" ? ("arrowUp" as const) : ("arrowDown" as const),
          text: s.type === "eqh" ? "EQH Sweep" : "EQL Sweep",
        })),
      );
    }

    if (backtest?.trades.length && (overlays.tradeMarkers ?? true)) {
      markers.push(
        ...backtest.trades.map((trade, idx) => ({
          time: ((trade.openTime ?? candles.at(-1)?.t ?? Date.now()) / 1000) as UTCTimestamp,
          position: trade.direction === 'buy' ? ('belowBar' as const) : ('aboveBar' as const),
          color: trade.direction === 'buy' ? '#10b981' : '#f97316',
          shape: trade.direction === 'buy' ? ('arrowUp' as const) : ('arrowDown' as const),
          text: formatTradeMarkerLabel(trade),
          id: `trade-${trade.id ?? idx}`,
        })),
      );
    }

    markersPluginRef.current.setMarkers(markers);
  }, [
    swings,
    gaps,
    signals,
    structureShifts,
    sweeps,
    backtest?.trades,
    overlays.liquidity,
    overlays.fvg,
    overlays.signals,
    overlays.sessions,
    overlays.sweeps,
    overlays.inversionFvgSignals,
    overlays.tradeMarkers,
    markersPluginReady,
    candles,
    selectedSetup,
    matchesSelectedSetup,
  ]);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    const timeScale = chartRef.current.timeScale();
    const priceToY = (price: number) => seriesRef.current?.priceToCoordinate(price) ?? null;
    const timeToX = (t: number) => timeScale.timeToCoordinate((t / 1000) as UTCTimestamp as any);
    const latestTime = candles.length ? candles[candles.length - 1].t : null;
    const lastVisibleX = latestTime != null ? timeToX(latestTime) : chartWidth ?? null;

    if (overlays.fvg && gaps && chartWidth > 0 && chartHeight > 0) {
      const boxes: typeof fvgBoxes = [];
      gaps.slice(-8).forEach((g, idx) => {
        const x1 = timeToX(g.startTime);
        const x2 = timeToX(g.endTime);
        const yTop = priceToY(Math.max(g.top, g.bottom));
        const yBot = priceToY(Math.min(g.top, g.bottom));
        if (x1 == null || x2 == null || yTop == null || yBot == null) return;
        const left = Math.min(x1, x2);
        const baseRight = Math.max(x1, x2);
        const extendedRight = lastVisibleX != null ? Math.max(baseRight, lastVisibleX) : baseRight + 60;
        const fill =
          g.type === "bullish"
            ? "rgba(14,165,233,0.12)"
            : "rgba(236,72,153,0.12)";
        const border =
          g.type === "bullish"
            ? "rgba(59,130,246,0.8)"
            : "rgba(244,114,182,0.8)";
        boxes.push({
          id: `fvg-${idx}-${g.startTime}`,
          left,
          width: Math.max(20, extendedRight - left),
          top: Math.min(yTop, yBot),
          height: Math.max(2, Math.abs(yTop - yBot)),
          color: fill,
          borderColor: border,
          label: `${g.type === "bullish" ? "Bull" : "Bear"} FVG`,
        });
      });
      setFvgBoxes((prev) => (areOverlayBoxesEqual(prev, boxes) ? prev : boxes));
    } else {
      setFvgBoxes((prev) => (prev.length ? [] : prev));
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
        const fill = b.type === "bullish" ? "rgba(34,197,94,0.12)" : "rgba(248,113,113,0.12)";
        const border = b.type === "bullish" ? "rgba(52,211,153,0.8)" : "rgba(248,113,113,0.8)";
        boxes.push({
          id: `ob-${idx}-${b.startTime}`,
          left,
          width: Math.max(20, extendedRight - left),
          top: Math.min(yTop, yBot),
          height: Math.max(2, Math.abs(yTop - yBot)),
          color: fill,
          borderColor: border,
          label: `${b.type === "bullish" ? "Bull" : "Bear"} OB`,
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
            ? "rgba(59,130,246,0.12)"
            : "rgba(192,38,211,0.12)";
        boxes.push({
          id: `breaker-${idx}-${b.startTime}`,
          left,
          width: Math.max(20, extendedRight - left),
          top: Math.min(yTop, yBot),
          height: Math.max(2, Math.abs(yTop - yBot)),
          color: fill,
          borderColor: gradeColor,
          label: `${b.type === "bullish" ? "Bull" : "Bear"} Breaker (${b.sourceObType} OB • ${b.grade ?? "weak"})`,
        });
      });
      setBreakerBoxes((prev) => (areOverlayBoxesEqual(prev, boxes) ? prev : boxes));
    } else {
      setBreakerBoxes((prev) => (prev.length ? [] : prev));
    }

  }, [
    gaps,
    orderBlocks,
    breakerBlocks,
    overlays.fvg,
    overlays.orderBlocks,
    overlays.breakers,
    chartWidth,
    chartHeight,
    candles,
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const handler = (param: any) => {
      const time = param?.time;
      if (!time) {
        setHoverTzTime(null);
        setHoverPoint(null);
        setHoverPrice(null);
        setHoverCandle(null);
        return;
      }
      const ms = convertCoordTime(time);
      setHoverTzTime(ms ? formatWithTz(ms, clockTz, TIME_LABEL_FORMAT) : null);
      const pt = param?.point;
      let cursorPrice: number | null = null;
      if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
        setHoverPoint({ x: pt.x, y: pt.y });
        const coordPrice = seriesRef.current?.coordinateToPrice(pt.y) ?? null;
        if (typeof coordPrice === "number" && Number.isFinite(coordPrice)) {
          cursorPrice = coordPrice;
        }
      } else {
        setHoverPoint(null);
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
      setHoverCandle(derivedCandle);
      const fallbackPrice = typeof param?.price === "number" ? param.price : null;
      setHoverPrice(cursorPrice ?? barPrice ?? fallbackPrice);
    };
    chart.subscribeCrosshairMove(handler);
    return () => {
      chart.unsubscribeCrosshairMove(handler);
    };
  }, [markersPluginReady, clockTz, convertCoordTime]);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setLiveClock(formatWithTz(now, clockTz));
      setLiveDate(formatWithTz(now, clockTz, { weekday: "short", month: "short", day: "numeric" }));
    };
    updateClock();
    const id = setInterval(updateClock, 1000);
    return () => clearInterval(id);
  }, [clockTz]);

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

    if (overlays.fvg && gaps) {
      gapZonesRef.current = gaps.slice(-10).map((g) =>
        seriesRef.current!.createPriceLine({
          price: (g.top + g.bottom) / 2,
          color: g.type === "bullish" ? "#38bdf877" : "#f59e0b77",
          lineStyle: LineStyle.Dashed,
          lineWidth: 2,
          title: g.type === "bullish" ? "Bull FVG" : "Bear FVG",
        }),
      );
    }

    if (premiumDiscount) {
      const lines: IPriceLine[] = [];
      lines.push(
        seriesRef.current!.createPriceLine({
          price: premiumDiscount.high,
          color: "#22d3ee55",
          lineStyle: LineStyle.Solid,
          lineWidth: 1,
          title: "Range High",
        }),
      );
      lines.push(
        seriesRef.current!.createPriceLine({
          price: premiumDiscount.low,
          color: "#fb718555",
          lineStyle: LineStyle.Solid,
          lineWidth: 1,
          title: "Range Low",
        }),
      );
      lines.push(
        seriesRef.current!.createPriceLine({
          price: premiumDiscount.equilibrium,
          color: "#e5e7ebaa",
          lineStyle: LineStyle.Dashed,
          lineWidth: 2,
          title: "Equilibrium 50%",
        }),
      );
      pdLinesRef.current = lines;

      if (overlays.oteBands) {
        const range = premiumDiscount.high - premiumDiscount.low;
        const ote62 = premiumDiscount.high - range * 0.62;
        const ote705 = premiumDiscount.high - range * 0.705;
        oteLinesRef.current = [
          seriesRef.current!.createPriceLine({
            price: ote62,
            color: "#38bdf8aa",
            lineStyle: LineStyle.Dotted,
            lineWidth: 2,
            title: "OTE 62%",
          }),
          seriesRef.current!.createPriceLine({
            price: ote705,
            color: "#38bdf8aa",
            lineStyle: LineStyle.Dotted,
            lineWidth: 2,
            title: "OTE 70.5%",
          }),
        ];
      }
    }

    if (overlays.sweeps && equalHighsLows && seriesRef.current) {
      eqLinesRef.current = equalHighsLows.slice(-10).map((lvl) =>
        seriesRef.current!.createPriceLine({
          price: lvl.price,
          color: lvl.kind === "highs" ? "#8b5cf6aa" : "#f97316aa",
          lineStyle: LineStyle.Dashed,
          lineWidth: 1,
          title: lvl.kind === "highs" ? "EQH" : "EQL",
        }),
      );
    }

    if (swings && overlays.oteBands && seriesRef.current) {
      const lastHigh = [...swings].reverse().find((s) => s.type === "high");
      const lastLow = [...swings].reverse().find((s) => s.type === "low");
      if (lastHigh && lastLow) {
        const legUp = lastHigh.time > lastLow.time;
        const high = legUp ? lastHigh.price : Math.max(lastHigh.price, lastLow.price);
        const low = legUp ? Math.min(lastHigh.price, lastLow.price) : lastLow.price;
        const range = high - low;
        if (range > 0) {
          const ote62 = high - range * 0.62;
          const ote705 = high - range * 0.705;
          legOteLinesRef.current = [
            seriesRef.current.createPriceLine({
              price: ote62,
              color: "#a78bfa",
              lineStyle: LineStyle.Dotted,
              lineWidth: 1,
              title: "Leg OTE 62%",
            }),
            seriesRef.current.createPriceLine({
              price: ote705,
              color: "#c084fc",
              lineStyle: LineStyle.Dotted,
              lineWidth: 1,
              title: "Leg OTE 70.5%",
            }),
          ];
        }
      }
    }

    if (overlays.signals && signals && seriesRef.current) {
      const filtered =
        selectedSetup === "all"
          ? signals.slice(-5)
          : signals.filter((s) => matchesSelectedSetup(s.setup)).slice(-5);
      const newLines: IPriceLine[] = [];
      filtered.forEach((s, idx) => {
        if (s.stop) {
          newLines.push(
            seriesRef.current!.createPriceLine({
              price: s.stop,
              color: s.direction === "buy" ? "#f97316" : "#ef4444",
              lineStyle: LineStyle.Solid,
              lineWidth: 1,
              title: `${s.setup ?? s.direction.toUpperCase()} SL ${idx + 1}`,
            }),
          );
        }
        if (s.tp1) {
          newLines.push(
            seriesRef.current!.createPriceLine({
              price: s.tp1,
              color: "#22c55e",
              lineStyle: LineStyle.Dotted,
              lineWidth: 1,
              title: `${s.setup ?? "TP"} 1`,
            }),
          );
        }
        if (s.tp2) {
          newLines.push(
            seriesRef.current!.createPriceLine({
              price: s.tp2,
              color: "#16a34a",
              lineStyle: LineStyle.Dotted,
              lineWidth: 1,
              title: `${s.setup ?? "TP"} 2`,
            }),
          );
        }
      });
      slTpLinesRef.current = newLines;
    }
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
    if (!seriesRef.current) return;
    htfLinesRef.current.forEach((line) => seriesRef.current?.removePriceLine(line));
    htfLinesRef.current = [];
    if (!htfLevels) return;
    const lines: IPriceLine[] = [];
    if (htfLevels.prevDayHigh) {
      lines.push(
        seriesRef.current.createPriceLine({
          price: htfLevels.prevDayHigh,
          color: "#fcd34d",
          lineStyle: LineStyle.Dashed,
          lineWidth: 1,
          title: "PDH",
        }),
      );
    }
    if (htfLevels.prevDayLow) {
      lines.push(
        seriesRef.current.createPriceLine({
          price: htfLevels.prevDayLow,
          color: "#f59e0b",
          lineStyle: LineStyle.Dashed,
          lineWidth: 1,
          title: "PDL",
        }),
      );
    }
    if (htfLevels.prevWeekHigh) {
      lines.push(
        seriesRef.current.createPriceLine({
          price: htfLevels.prevWeekHigh,
          color: "#22d3ee",
          lineStyle: LineStyle.Solid,
          lineWidth: 1,
          title: "PWH",
        }),
      );
    }
    if (htfLevels.prevWeekLow) {
      lines.push(
        seriesRef.current.createPriceLine({
          price: htfLevels.prevWeekLow,
          color: "#0ea5e9",
          lineStyle: LineStyle.Solid,
          lineWidth: 1,
          title: "PWL",
        }),
      );
    }
    if (htfLevels.weekOpen) {
      lines.push(
        seriesRef.current.createPriceLine({
          price: htfLevels.weekOpen,
          color: "#a855f7",
          lineStyle: LineStyle.Dotted,
          lineWidth: 1,
          title: "Week Open",
        }),
      );
    }
    if (htfLevels.monthOpen) {
      lines.push(
        seriesRef.current.createPriceLine({
          price: htfLevels.monthOpen,
          color: "#ef4444",
          lineStyle: LineStyle.Dotted,
          lineWidth: 1,
          title: "Month Open",
        }),
      );
    }
    htfLinesRef.current = lines;
  }, [htfLevels]);

  useEffect(() => {
    if (!seriesRef.current) return;
    obZonesRef.current.forEach((line) => seriesRef.current?.removePriceLine(line));
    obZonesRef.current = [];

    if (overlays.orderBlocks && orderBlocks) {
      obZonesRef.current = orderBlocks.slice(-10).map((b) =>
        seriesRef.current!.createPriceLine({
          price: (b.high + b.low) / 2,
          color: b.type === "bullish" ? "#10b981aa" : "#ef4444aa",
          lineStyle: LineStyle.Dashed,
          lineWidth: 2,
          title: b.type === "bullish" ? "Bull OB" : "Bear OB",
        }),
      );
    }
  }, [orderBlocks, overlays.orderBlocks]);

  useEffect(() => {
    if (!notificationsEnabled) {
      setSignalPrompt(null);
      setSignalPromptScore(null);
      return;
    }
    if (promptSignals.length === 0) {
      setSignalPrompt(null);
      setSignalPromptScore(null);
      return;
    }
    const latest = promptSignals.at(-1)!;
    const latestTime = candles.at(-1)?.t ?? latest.time;
    const isCurrent = latest.time === latestTime;
    const showPrompt = () => {
      setSignalPrompt(latest);
      const evalResult = evaluateIctScanner({
        signal: latest,
        bias,
        premiumDiscount,
        latestPrice: latestPrice ?? latest.price,
      });
      setSignalPromptScore(evalResult.score);
      lastPromptedSignalRef.current = latest.time;
      if (backtest?.autoTrade) {
        enterDemoTradeFromSignal(latest);
      }
    };
    if (lastPromptedSignalRef.current == null) {
      showPrompt();
    } else if (latest.time > lastPromptedSignalRef.current) {
      showPrompt();
    } else if (backtest?.enabled && !isCurrent && signalPrompt && signalPrompt.time > latest.time) {
      // If stepping backward, restore previous prompt
      setSignalPrompt(latest);
      setSignalPromptScore(null);
    }
  }, [promptSignals, notificationsEnabled, bias, premiumDiscount, latestPrice, candles, backtest?.enabled, backtest?.autoTrade, signalPrompt, enterDemoTradeFromSignal]);

  useEffect(() => {
    if (!notificationsEnabled || !signalPrompt) return;
    const evalResult = evaluateIctScanner({
      signal: signalPrompt,
      bias,
      premiumDiscount,
      latestPrice: latestPrice ?? signalPrompt.price,
    });
    setSignalPromptScore(evalResult.score);
  }, [signalPrompt, notificationsEnabled, bias, premiumDiscount, latestPrice]);

  const overlayActive = drawingMode !== "none";
  const panelCursor = panMode ? (isPanning ? "grabbing" : "grab") : drawingMode === "none" ? "default" : "crosshair";
  const overlayCursor = drawingMode === "none" ? "default" : "crosshair";
  const activeTimeLabel = hoverTzTime ?? lastTzTime ?? "—";
  const signalPromptRMultiple =
    signalPrompt && signalPrompt.stop && signalPrompt.tp1
      ? calcRMultiple(signalPrompt.price, signalPrompt.stop, signalPrompt.tp1, signalPrompt.direction)
      : null;
  const clockLabel = getClockLabel(clockTz);
  const hoverPriceLabel = hoverPrice != null ? formatPrice(hoverPrice) : null;
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
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerCancel}
          onPointerCancel={handlePointerCancel}
        />
        <div className="pointer-events-auto absolute top-3 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded bg-black/70 px-3 py-2 text-[11px] text-zinc-200 shadow-lg shadow-black/40">
          <button
            className={clsx(
              "rounded px-2 py-1 transition",
              panMode ? "bg-emerald-500/30 text-emerald-200" : "bg-zinc-900/80 hover:bg-zinc-800",
            )}
            onClick={togglePanMode}
            title="Pan chart"
          >
            ✋
          </button>
          {[
            { mode: "none" as const, label: "✕", title: "Exit drawing mode" },
            { mode: "hline" as const, label: "H", title: "Horizontal line" },
            { mode: "trend" as const, label: "/", title: "Trend line" },
            { mode: "rect" as const, label: "▭", title: "Rectangle" },
            { mode: "fibo" as const, label: "Fib", title: "Fibonacci retracement" },
            { mode: "measure" as const, label: "R", title: "Ruler / measurement" },
            { mode: "long" as const, label: "Long", title: "Long position" },
            { mode: "short" as const, label: "Short", title: "Short position" },
          ].map((tool) => (
            <button
              key={tool.mode}
              className={clsx(
                "rounded px-2 py-1 transition",
                drawingMode === tool.mode ? "bg-emerald-500/30 text-emerald-200" : "bg-zinc-900/80 hover:bg-zinc-800",
              )}
              onClick={() => setDrawingMode(drawingMode === tool.mode ? "none" : tool.mode)}
              title={tool.title}
            >
              {tool.label}
            </button>
          ))}
          {drawings.length > 0 && (
            <button
              className="rounded px-2 py-1 text-zinc-300 transition hover:text-red-300"
              onClick={clearDrawings}
            >
              Clear
            </button>
          )}
        </div>
        {overlays.sessions && sessionBands.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-10">
            {sessionBands.map((band) => (
              <div
                key={band.id}
                className="absolute top-0 bottom-0 bg-amber-500/10"
                style={{ left: `${band.left}px`, width: `${band.width}px` }}
              >
                <div className="absolute left-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[10px] text-amber-100">
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
                style={{ left: `${band.left}px`, width: `${band.width}px`, backgroundColor: band.color }}
              >
                <div className="absolute left-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">
                  {band.label}
                </div>
              </div>
            ))}
          </div>
        )}
        {magnetVisible && activeCandle && blueprintData && (
          <div
            className={`pointer-events-auto absolute z-40 rounded border border-emerald-500/40 bg-black/85 text-xs text-zinc-200 shadow-lg shadow-black/60 transition-all ${magnetExpanded ? 'h-80 w-80' : 'w-64'} ${magnetCollapsed ? 'h-10 overflow-hidden' : 'p-3'}`}
            style={{ left: magnetPos.x, top: magnetPos.y }}
          >
            <div
              className="mb-1 flex cursor-move items-center justify-between text-[11px] font-semibold"
              onPointerDown={startMagnetDrag}
            >
              <span>Blueprint Magnet</span>
              <div className="flex items-center gap-1 text-[10px]">
                <span className="text-emerald-200">
                  {formatWithTz(new Date(activeCandle.t), clockTz).split(', ').at(-1)}
                </span>
                <button
                  className="rounded bg-zinc-800 px-1 text-white/80 hover:bg-zinc-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMagnetCollapsed((prev) => !prev);
                  }}
                >
                  {magnetCollapsed ? '▢' : '—'}
                </button>
                <button
                  className="rounded bg-zinc-800 px-1 text-white/80 hover:bg-zinc-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMagnetExpanded((prev) => !prev);
                  }}
                >
                  {magnetExpanded ? '⤢' : '⤡'}
                </button>
                <button
                  className="rounded bg-zinc-800 px-1 text-white/80 hover:bg-red-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMagnetVisible(false);
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
            {!magnetCollapsed && (
              <div>
                <div className={`flex items-center gap-3 ${magnetExpanded ? 'h-40' : ''}`}>
                  <div className={`relative rounded bg-zinc-900 ${magnetExpanded ? 'h-28 w-10' : 'h-20 w-8'}`}>
                    <div
                      className="absolute left-[45%] w-[10%] rounded bg-zinc-200/70"
                      style={{ top: 0, height: `${blueprintData.wickTopPct}%` }}
                    />
                    <div
                      className={`absolute left-1 right-1 rounded ${blueprintData.direction === 'up' ? 'bg-emerald-400/70' : 'bg-rose-400/70'}`}
                      style={{
                        bottom: `${blueprintData.wickBottomPct}%`,
                        height: `${blueprintData.bodyPct}%`,
                      }}
                    />
                    <div
                      className="absolute left-[45%] w-[10%] rounded bg-zinc-200/70"
                      style={{ bottom: 0, height: `${blueprintData.wickBottomPct}%` }}
                    />
                  </div>
                  <div className="flex-1 space-y-1 text-[11px]">
                    <div className="flex justify-between"><span>Range</span><span>{Math.abs(blueprintData.range).toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>Open</span><span>{formatPrice(activeCandle.o)}</span></div>
                    <div className="flex justify-between"><span>Close</span><span>{formatPrice(activeCandle.c)}</span></div>
                    <div className="flex justify-between"><span>High</span><span>{formatPrice(activeCandle.h)}</span></div>
                    <div className="flex justify-between"><span>Low</span><span>{formatPrice(activeCandle.l)}</span></div>
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-zinc-400">
                  Drag this magnet anywhere. Use the buttons to minimize, expand, or close it. When we plug in the
                  blueprint/order-book feed, it will snap here while keeping the main chart clean.
                </p>
              </div>
            )}
          </div>
        )}
        {!magnetVisible && (
          <button
            className="pointer-events-auto absolute bottom-4 right-4 z-40 rounded border border-emerald-500/40 bg-black/70 px-3 py-1 text-xs text-emerald-200"
            onClick={() => {
              setMagnetVisible(true);
              setMagnetCollapsed(false);
            }}
          >
            Show Blueprint Magnet
          </button>
        )}
        {(dataSource || hoverCandle || backtest?.enabled || notificationsEnabled) && (
          <div className="pointer-events-none absolute left-2 top-2 z-30 space-y-1 text-[11px]">
            {dataSource && (
              <div className="rounded bg-black/70 px-2 py-1 text-[11px] text-zinc-200 shadow">
                Data: {dataSource}
              </div>
            )}
            {hoverCandle && (
              <div className="rounded bg-black/70 px-2 py-1 text-[10px] text-white shadow">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <span>
                    <span className="text-sky-300">O</span> {formatPrice(hoverCandle.o)}
                  </span>
                  <span>
                    <span className="text-emerald-300">H</span> {formatPrice(hoverCandle.h)}
                  </span>
                  <span>
                    <span className="text-rose-300">L</span> {formatPrice(hoverCandle.l)}
                  </span>
                  <span>
                    <span className="text-amber-200">C</span> {formatPrice(hoverCandle.c)}
                  </span>
                </div>
              </div>
            )}
            {backtest?.enabled && (
              <div className="rounded bg-emerald-900/70 px-2 py-1 text-[10px] text-emerald-100 shadow">
                Backtest • {backtestCurrent ?? 0}
                {backtestTotal ? ` / ${backtestTotal}` : ''}{' '}
                <span className="text-emerald-300">{backtest?.playing ? 'Playing' : 'Paused'}</span>
              </div>
            )}
            {notificationsEnabled && (
              <div className="rounded bg-emerald-900/60 px-2 py-1 text-[10px] text-emerald-100 shadow">
                {lastSignal ? (
                  <>
                    Last alert · {formatWithTz(lastSignal.time, clockTz, TIME_LABEL_FORMAT)} ·{' '}
                    {lastSignal.setup ?? lastSignal.direction.toUpperCase()}
                  </>
                ) : (
                  'Entry alerts enabled • awaiting setup'
                )}
              </div>
            )}
            {notificationsEnabled && backtest?.enabled && (
              <div className="rounded bg-amber-900/70 px-2 py-1 text-[10px] text-amber-100 shadow">
                Alerts follow backtest playback
              </div>
            )}
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
    {signalPrompt && (
      <div className="pointer-events-auto absolute top-3 right-3 z-40 w-72 rounded border border-emerald-500/40 bg-black/85 p-3 text-xs text-white shadow-lg shadow-black/60">
        <div className="mb-1 flex items-center justify-between text-sm font-semibold text-emerald-200">
          <span>ICT setup ready</span>
          <button
            className="text-zinc-400 transition hover:text-red-300"
            onClick={() => {
              setSignalPrompt(null);
              setSignalPromptScore(null);
            }}
            aria-label="Dismiss setup prompt"
          >
            ✕
          </button>
        </div>
        <div className="flex items-center justify-between text-sm font-semibold">
          <span className={signalPrompt.direction === "buy" ? "text-emerald-300" : "text-red-300"}>
            {signalPrompt.direction === "buy" ? "Buy" : "Sell"}
          </span>
          <span className="text-[11px] text-zinc-400">
            {formatFullDate((signalPrompt.time / 1000) as UTCTimestamp, clockTz)}
          </span>
        </div>
        <div className="mt-1 text-sm text-white">
          <span className="text-sky-300">Entry</span>{' '}
          <span className="text-sky-200">~ {signalPrompt.price.toFixed(4)}</span>
          {signalPrompt.setup && (
            <span className="ml-2 rounded bg-zinc-800 px-1 py-[1px] text-[10px] text-zinc-300">{signalPrompt.setup}</span>
          )}
        </div>
        <div className="mt-2 space-y-1 text-[11px] text-zinc-200">
          {signalPrompt.stop && (
            <div className="text-red-300">
              SL: <span className="text-red-100">{signalPrompt.stop.toFixed(4)}</span>
            </div>
          )}
          {signalPrompt.tp1 && (
            <div className="text-emerald-300">
              TP1: <span className="text-emerald-100">{signalPrompt.tp1.toFixed(4)}</span>
            </div>
          )}
          {signalPrompt.tp2 && (
            <div className="text-emerald-300">
              TP2: <span className="text-emerald-100">{signalPrompt.tp2.toFixed(4)}</span>
            </div>
          )}
          {signalPrompt.tp3 && (
            <div className="text-emerald-300">
              TP3: <span className="text-emerald-100">{signalPrompt.tp3.toFixed(4)}</span>
            </div>
          )}
          {signalPrompt.tp4 && (
            <div className="text-emerald-300">
              TP4: <span className="text-emerald-100">{signalPrompt.tp4.toFixed(4)}</span>
            </div>
          )}
          {signalPromptRMultiple != null && (
            <div className="text-emerald-300">R/R ≈ {signalPromptRMultiple.toFixed(2)}R</div>
          )}
          <div className="text-zinc-400">{signalPrompt.basis}</div>
        </div>
        <div className="mt-2 text-xs text-emerald-200">
          {signalPromptScore != null ? `Confidence ${signalPromptScore.toFixed(0)}%` : "Evaluating setup..."}
        </div>
        <div className="mt-3 flex gap-2 text-[11px]">
          {backtest?.enabled ? (
            <>
              <button
                className="flex-1 rounded border border-emerald-500/60 bg-emerald-500/10 py-1 font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                onClick={() => {
                  if (signalPrompt) {
                    enterDemoTradeFromSignal(signalPrompt, {}, true);
                  }
                  setSignalPrompt(null);
                  setSignalPromptScore(null);
                }}
              >
                Enter trade
              </button>
              <button
                className="flex-1 rounded border border-zinc-600 bg-zinc-800/70 py-1 font-semibold text-zinc-200 transition hover:bg-zinc-700"
                onClick={() => {
                  setSignalPrompt(null);
                  setSignalPromptScore(null);
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                className="flex-1 rounded border border-emerald-500/60 bg-emerald-500/10 py-1 font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                onClick={() => {
                  if (signalPrompt) {
                    enterDemoTradeFromSignal(signalPrompt, {}, true);
                  }
                  setSignalPrompt(null);
                  setSignalPromptScore(null);
                }}
              >
                Take trade
              </button>
              <button
                className="flex-1 rounded border border-zinc-600 bg-zinc-800/70 py-1 font-semibold text-zinc-200 transition hover:bg-zinc-700"
                onClick={() => {
                  setSignalPrompt(null);
                  setSignalPromptScore(null);
                }}
              >
                Dismiss
              </button>
            </>
          )}
        </div>
      </div>
    )}
    {drawingElements}
    {previewElement}
        {overlays.fvg && fvgBoxes.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-10">
            {fvgBoxes.map((box) => (
              <div
                key={box.id}
                className="absolute rounded border"
                style={{
                  left: `${box.left}px`,
                  width: `${box.width}px`,
                  top: `${box.top}px`,
                  height: `${box.height}px`,
                  backgroundColor: box.color,
                  borderColor: box.borderColor ?? box.color,
                }}
                title={box.label}
              />
            ))}
          </div>
        )}
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
                  backgroundColor: box.color,
                  borderColor: box.borderColor ?? box.color,
                }}
                title={box.label}
              />
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
                  backgroundColor: box.color,
                  borderColor: box.borderColor ?? box.color,
                }}
                title={box.label}
              />
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
          <div className="flex flex-col text-right leading-tight">
            <span className="text-[10px] font-normal text-zinc-400">{liveDate}</span>
            <span className="inline-block rounded bg-black/70 px-2 py-0.5 text-sm text-white">{liveClock}</span>
          </div>
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
): Pick<BacktestTrade, "result" | "pnl" | "exitTime" | "partialRealized" | "partialHit"> {
  const idx = candles.findIndex((c) => c.t >= signal.time);
  if (idx === -1) return {};
  const start = Math.max(idx, startIdx);
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
  for (let i = start; i <= endIdx; i++) {
    const candle = candles[i];
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
    return { result, pnl, exitTime: candle.t, partialRealized, partialHit };
  }
  return partialRealized
    ? { partialRealized, partialHit }
    : {};
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

type OverlayBox = {
  id: string;
  left: number;
  width: number;
  top: number;
  height: number;
  color: string;
  borderColor?: string;
  label: string;
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
      boxA.label !== boxB.label
    ) {
      return false;
    }
  }
  return true;
}

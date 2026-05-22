'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AlertRelayAcceptanceStatus,
  AlertRelayAckStatus,
  AlertRelayChannel,
  AlertRelayDeliveryStatus,
  AlertRelayResponseSnapshot,
} from '@/lib/alertConnectors';
import { AssetClass, Timeframe, Drawing, DrawingType, Bias } from '@/lib/types';

type OverlayKey =
  | 'liquidity'
  | 'fvg'
  | 'orderBlocks'
  | 'bullishOrderBlocks'
  | 'bearishOrderBlocks'
  | 'sessions'
  | 'killzones'
  | 'signals'
  | 'sweeps'
  | 'breakers'
  | 'oteBands'
  | 'pdZones'
  | 'inversionFvgSignals'
  | 'tradeMarkers'
  | 'structureSegments'
  | 'eqConnectors';

export type BacktestTrade = {
  id: string;
  symbol?: string;
  timeframe?: Timeframe;
  direction: 'buy' | 'sell';
  entry: number;
  stop: number;
  target: number;
  result?: 'win' | 'loss' | 'breakeven';
  rMultiple?: number;
  pnl?: number;
  exitTime?: number;
  setup?: string;
  signalId?: string;
  initialStop?: number;
  risk?: number;
  breakevenTriggered?: boolean;
  takePartial?: number;
  partialFraction?: number;
  partialRealized?: number;
  partialHit?: boolean;
  openTime?: number;
  positionSize?: number;
  sessionLabel?: string | null;
  biasLabel?: Bias['label'];
  manual?: boolean;
  armedAt?: number;
  expiresAt?: number;
  status?: 'planned' | 'active' | 'closed' | 'canceled';
};

export type BacktestState = {
  enabled: boolean;
  playing: boolean;
  speed: number;
  cursor: number;
  trades: BacktestTrade[];
  balance: number;
  autoTrade: boolean;
};

export type AlertDiagnostics = {
  status: 'live' | 'paused' | 'stale';
  message: string;
  detail?: string;
  since: number;
};

export type AlertRelayEvent = {
  id: string;
  signalTime: number;
  direction: 'buy' | 'sell';
  setup?: string;
  channel: AlertRelayChannel | 'auto-trade';
  deliveryStatus: AlertRelayDeliveryStatus;
  ackStatus: AlertRelayAckStatus;
  acceptanceStatus: AlertRelayAcceptanceStatus;
  detail: string;
  lastResponse: AlertRelayResponseSnapshot | null;
  createdAt: number;
};

type AppState = {
  assetClass: AssetClass;
  symbol: string;
  timeframe: Timeframe;
  overlays: Record<OverlayKey, boolean>;
  selectedSetup: string;
  backtest: BacktestState;
  sidebarOpen: boolean;
  insightOpen: boolean;
  infoOpen: boolean;
  drawingMode: DrawingType | 'none';
  drawings: Drawing[];
  clockTz: string;
  notificationsEnabled: boolean;
  waitForRetest: boolean;
  optimizerEnabled: boolean;
  setAssetClass: (asset: AssetClass) => void;
  setSymbol: (symbol: string) => void;
  setTimeframe: (tf: Timeframe) => void;
  toggleOverlay: (key: OverlayKey) => void;
  setSelectedSetup: (setup: string) => void;
  setBacktest: (patch: Partial<BacktestState>) => void;
  addTrade: (trade: BacktestTrade) => void;
  clearTrades: () => void;
  toggleSidebar: () => void;
  toggleInsight: () => void;
  toggleInfo: () => void;
  setDrawingMode: (mode: DrawingType | 'none') => void;
  addDrawing: (drawing: Drawing) => void;
  clearDrawings: () => void;
  setClockTz: (tz: string) => void;
  setAllOverlays: (value: boolean) => void;
  toggleNotifications: () => void;
  setWaitForRetest: (value: boolean) => void;
  toggleOptimizer: () => void;
  alertStatus: AlertDiagnostics | null;
  setAlertStatus: (status: AlertDiagnostics | null) => void;
  alertRelayEvents: AlertRelayEvent[];
  pushAlertRelayEvent: (
    event: Omit<AlertRelayEvent, 'id' | 'createdAt'> & Partial<Pick<AlertRelayEvent, 'id' | 'createdAt'>>,
  ) => void;
  clearAlertRelayEvents: () => void;
  updateTrade: (id: string, patch: Partial<BacktestTrade>) => void;
};

const DEFAULT_OVERLAYS: Record<OverlayKey, boolean> = {
  liquidity: true,
  fvg: true,
  orderBlocks: true,
  bullishOrderBlocks: true,
  bearishOrderBlocks: true,
  sessions: true,
  killzones: false,
  signals: true,
  sweeps: true,
  breakers: false,
  oteBands: true,
  pdZones: true,
  inversionFvgSignals: true,
  tradeMarkers: true,
  structureSegments: true,
  eqConnectors: true,
};

function normalizeOverlays(overlays?: Partial<Record<OverlayKey, boolean>>) {
  return { ...DEFAULT_OVERLAYS, ...overlays };
}

const DEFAULT_BACKTEST: BacktestState = {
  enabled: false,
  playing: false,
  speed: 1,
  cursor: 0,
  trades: [],
  balance: 0,
  autoTrade: false,
};

function normalizeBacktest(backtest?: Partial<BacktestState>) {
  const speed =
    typeof backtest?.speed === 'number' && Number.isFinite(backtest.speed) && backtest.speed > 0
      ? backtest.speed
      : DEFAULT_BACKTEST.speed;
  return {
    ...DEFAULT_BACKTEST,
    speed,
  };
}

function computeBacktestBalance(trades: BacktestTrade[]) {
  return trades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      assetClass: 'crypto',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      overlays: DEFAULT_OVERLAYS,
      selectedSetup: 'all',
      backtest: DEFAULT_BACKTEST,
      sidebarOpen: true,
      insightOpen: true,
      infoOpen: false,
      drawingMode: 'none',
      drawings: [],
      clockTz: 'America/New_York',
      notificationsEnabled: true,
      waitForRetest: false,
      optimizerEnabled: true,
      alertStatus: null,
      alertRelayEvents: [],
      setAssetClass: (assetClass) => set({ assetClass }),
      setSymbol: (symbol) => set({ symbol }),
      setTimeframe: (timeframe) => set({ timeframe }),
      toggleOverlay: (key) =>
        set((state) => ({
          overlays: { ...state.overlays, [key]: !state.overlays[key] },
        })),
      setBacktest: (patch) =>
        set((state) => ({
          backtest: { ...state.backtest, ...patch },
        })),
      addTrade: (trade) =>
        set((state) => {
          const trades = [...state.backtest.trades, trade];
          return {
            backtest: {
              ...state.backtest,
              trades,
              balance: computeBacktestBalance(trades),
            },
          };
        }),
      clearTrades: () =>
        set((state) => ({
          backtest: { ...state.backtest, trades: [], balance: 0 },
        })),
      updateTrade: (id, patch) =>
        set((state) => {
          const trades = state.backtest.trades.map((trade) =>
            trade.id === id ? { ...trade, ...patch } : trade,
          );
          return {
            backtest: {
              ...state.backtest,
              trades,
              balance: computeBacktestBalance(trades),
            },
          };
        }),
      setSelectedSetup: (selectedSetup) => set({ selectedSetup }),
      toggleSidebar: () =>
        set((state) => ({
          sidebarOpen: !state.sidebarOpen,
        })),
      toggleInsight: () =>
        set((state) => ({
          insightOpen: !state.insightOpen,
        })),
      toggleInfo: () =>
        set((state) => ({
          infoOpen: !state.infoOpen,
        })),
      setDrawingMode: (mode) => set({ drawingMode: mode }),
      addDrawing: (drawing) =>
        set((state) => ({
          drawings: [...state.drawings, drawing],
        })),
      clearDrawings: () => set({ drawings: [] }),
      setClockTz: (clockTz) => set({ clockTz }),
      setAllOverlays: (value) =>
        set((state) => ({
          overlays: Object.fromEntries(
            Object.keys(DEFAULT_OVERLAYS).map((key) => [key, value]),
          ) as Record<OverlayKey, boolean>,
        })),
      toggleNotifications: () =>
        set((state) => ({
          notificationsEnabled: !state.notificationsEnabled,
          alertStatus: state.notificationsEnabled ? null : state.alertStatus,
        })),
      setWaitForRetest: (waitForRetest) => set({ waitForRetest }),
      toggleOptimizer: () =>
        set((state) => ({
          optimizerEnabled: !state.optimizerEnabled,
        })),
      setAlertStatus: (alertStatus) => set({ alertStatus }),
      pushAlertRelayEvent: (event) =>
        set((state) => ({
          alertRelayEvents: [
            ...state.alertRelayEvents,
            {
              id: event.id ?? crypto.randomUUID(),
              createdAt: event.createdAt ?? Date.now(),
              ...event,
            },
          ].slice(-20),
        })),
      clearAlertRelayEvents: () => set({ alertRelayEvents: [] }),
    }),
    {
      name: 'ict-app-store',
      skipHydration: true,
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<AppState> | undefined) ?? {};
        return {
          ...currentState,
          ...persisted,
          overlays: normalizeOverlays(persisted.overlays as Partial<Record<OverlayKey, boolean>> | undefined),
          backtest: normalizeBacktest(persisted.backtest as Partial<BacktestState> | undefined),
        };
      },
      partialize: (state) => ({
        assetClass: state.assetClass,
        symbol: state.symbol,
        timeframe: state.timeframe,
        overlays: state.overlays,
        selectedSetup: state.selectedSetup,
        backtest: {
          speed: state.backtest.speed,
        },
        sidebarOpen: state.sidebarOpen,
        insightOpen: state.insightOpen,
        infoOpen: state.infoOpen,
        drawingMode: state.drawingMode,
        drawings: state.drawings,
        clockTz: state.clockTz,
        notificationsEnabled: state.notificationsEnabled,
        waitForRetest: state.waitForRetest,
        optimizerEnabled: state.optimizerEnabled,
      }),
    },
  ),
);

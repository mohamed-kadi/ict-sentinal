'use client';

import { create } from 'zustand';
import { AssetClass, Timeframe, Drawing, DrawingType, Bias } from '@/lib/types';

type OverlayKey =
  | 'liquidity'
  | 'fvg'
  | 'orderBlocks'
  | 'sessions'
  | 'killzones'
  | 'signals'
  | 'sweeps'
  | 'breakers'
  | 'oteBands'
  | 'inversionFvgSignals'
  | 'tradeMarkers';

export type BacktestTrade = {
  id: string;
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

type AppState = {
  assetClass: AssetClass;
  symbol: string;
  timeframe: Timeframe;
  overlays: Record<OverlayKey, boolean>;
  selectedSetup: string;
  backtest: BacktestState;
  sidebarOpen: boolean;
  drawingMode: DrawingType | 'none';
  drawings: Drawing[];
  clockTz: string;
  notificationsEnabled: boolean;
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
  setDrawingMode: (mode: DrawingType | 'none') => void;
  addDrawing: (drawing: Drawing) => void;
  clearDrawings: () => void;
  setClockTz: (tz: string) => void;
  setAllOverlays: (value: boolean) => void;
  toggleNotifications: () => void;
  toggleOptimizer: () => void;
  updateTrade: (id: string, patch: Partial<BacktestTrade>) => void;
};

export const useAppStore = create<AppState>((set) => ({
  assetClass: 'crypto',
  symbol: 'BTCUSDT',
  timeframe: '1h',
  overlays: {
    liquidity: true,
    fvg: true,
    orderBlocks: true,
    sessions: true,
    killzones: false,
    signals: true,
    sweeps: true,
    breakers: false,
    oteBands: true,
    inversionFvgSignals: true,
    tradeMarkers: true,
  },
  selectedSetup: 'all',
  backtest: { enabled: false, playing: false, speed: 1, cursor: 0, trades: [], balance: 0, autoTrade: false },
  sidebarOpen: true,
  drawingMode: 'none',
  drawings: [],
  clockTz: 'America/New_York',
  notificationsEnabled: true,
  optimizerEnabled: true,
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
    set((state) => ({
      backtest: { ...state.backtest, trades: [...state.backtest.trades, trade] },
    })),
  clearTrades: () =>
    set((state) => ({
      backtest: { ...state.backtest, trades: [], balance: 0 },
    })),
  updateTrade: (id, patch) =>
    set((state) => ({
      backtest: {
        ...state.backtest,
        trades: state.backtest.trades.map((trade) =>
          trade.id === id ? { ...trade, ...patch } : trade,
        ),
        balance:
          patch.pnl != null
            ? state.backtest.balance + patch.pnl
            : state.backtest.balance,
      },
    })),
  setSelectedSetup: (selectedSetup) => set({ selectedSetup }),
  toggleSidebar: () =>
    set((state) => ({
      sidebarOpen: !state.sidebarOpen,
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
      overlays: Object.fromEntries(Object.keys(state.overlays).map((key) => [key, value])) as Record<
        OverlayKey,
        boolean
      >,
    })),
  toggleNotifications: () =>
    set((state) => ({
      notificationsEnabled: !state.notificationsEnabled,
    })),
  toggleOptimizer: () =>
    set((state) => ({
      optimizerEnabled: !state.optimizerEnabled,
    })),
}));

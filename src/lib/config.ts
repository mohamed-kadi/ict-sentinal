import { SessionZone, Timeframe } from './types';

export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D', '1W', '1M'];

export const CRYPTO_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'] as const;
export const FOREX_SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD'] as const;
export const STOCK_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'SPY', 'QQQ', 'DIA', 'US100'] as const;

export const SESSION_ZONES: SessionZone[] = [
  { label: 'Asia', startHour: 0, endHour: 3, killStartHour: 0, killEndHour: 2 },
  { label: 'London', startHour: 7, endHour: 10, killStartHour: 7, killEndHour: 10 },
  { label: 'New York', startHour: 12, endHour: 16, killStartHour: 12, killEndHour: 15 },
];

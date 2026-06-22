// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
export const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL;

// Time Intervals
export const TIME_INTERVALS = [
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
  "1w",
] as const;

// Order Sides
export const ORDER_SIDES = {
  BUY: "BUY",
  SELL: "SELL",
} as const;

// Order Types
export const ORDER_TYPES = {
  LIMIT: "LIMIT",
  MARKET: "MARKET",
} as const;

// Order Statuses
export const ORDER_STATUSES = {
  PENDING: "PENDING",
  OPEN: "OPEN",
  FILLED: "FILLED",
  PARTIALLY_FILLED: "PARTIALLY_FILLED",
  CANCELLED: "CANCELLED",
} as const;

// WebSocket Channels
export const WS_CHANNELS = {
  TICKER: "ticker",
  ORDERBOOK: "orderbook",
  TRADES: "trades",
  CANDLES: "candles",
  USER_ORDERS: "user.orders",
  USER_TRADES: "user.trades",
  USER_BALANCE: "user.balance",
} as const;

// Local Storage Keys
export const STORAGE_KEYS = {
  ACCESS_TOKEN: "access_token",
  REFRESH_TOKEN: "refresh_token",
  THEME: "theme",
  SELECTED_MARKET: "selected_market",
} as const;

// Default Values
export const DEFAULTS = {
  MARKET: "BTC-USDT",
  TIME_INTERVAL: "1h",
  ORDERBOOK_DEPTH: 20,
} as const;

// Market & Trading Types
export interface Market {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  lastPrice: string;
  priceChange24h: string;
  priceChangePercent24h: string;
  high24h: string;
  low24h: string;
  volume24h: string;
}

export interface Ticker {
  symbol: string;
  price: string;
  timestamp: number;
}

// Orderbook Types
export interface OrderbookEntry {
  price: string;
  quantity: string;
  total: string;
}

export interface Orderbook {
  symbol: string;
  bids: OrderbookEntry[];
  asks: OrderbookEntry[];
  timestamp: number;
}

// Order Types
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'MARKET';
export type OrderStatus = 'PENDING' | 'OPEN' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELLED';

export interface Order {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price: string;
  quantity: string;
  filledQuantity: string;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
}

export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price?: string;
  quantity: string;
}

// Trade Types
export interface Trade {
  id: string;
  symbol: string;
  price: string;
  quantity: string;
  side: OrderSide;
  timestamp: number;
}

// Chart Types
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type TimeInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

// Wallet Types
export interface Balance {
  asset: string;
  free: string;
  locked: string;
  total: string;
}

export interface Wallet {
  balances: Balance[];
  updatedAt: number;
}

// User Types
export interface User {
  id: string;
  email: string;
  createdAt: number;
}

// Account Types
export interface Account {
  id: number;
  accountNumber: number;
  money: string;
}

// API Error Type
export interface ApiError {
  errorCode: string;
  message: string;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string | ApiError;
}

// WebSocket Message Types
export interface WSMessage<T = unknown> {
  type: string;
  channel: string;
  data: T;
}

import { Context } from "telegraf";

export interface MySession {
  markets?: string[];
  lastFetchedAt?: number;
  currentPage?: number;
  awaitingQuote?: boolean;
  awaitingSwap?: boolean;
  awaitingAddLiquidity?: boolean;
  selectedPool?: string;
  selectedPoolIndex?: number;
}

export interface MyContext extends Context {
  session?: MySession;
}

export interface PoolData {
  address: string;
  metadata: any;
  baseToken: TokenInfo;
  quoteToken: TokenInfo;
  metrics: PoolMetrics;
}

export interface TokenInfo {
  symbol: string;
  mint: string;
  decimals: number;
  usdPrice: number;
  stats24h?: {
    buyVolume: number;
    sellVolume: number;
  };
}

export interface PoolMetrics {
  baseAmount: number;
  quoteAmount: number;
  totalLiquidity: number;
  exchangeRate: number;
  reverseRate: number;
  volume24h: number;
  fees24h: number;
  apr: number;
}

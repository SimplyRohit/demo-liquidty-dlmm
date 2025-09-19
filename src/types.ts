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

export interface JupTokenInfo {
  id: string;
  name: string;
  symbol: string;
  icon?: string;
  decimals: number;
  address: string;
  circSupply?: number;
  totalSupply?: number;
  tokenProgram?: string;
  mintAuthority?: string;
  freezeAuthority?: string;
  firstPool?: {
    id: string;
    createdAt: string;
  };
  audit?: Record<string, any>;
  organicScore?: number;
  organicScoreLabel?: string;
  isVerified: boolean;
  tags?: string[];
  fdv?: number;
  mcap?: number;
  usdPrice?: number;
  priceBlockId?: number;
  liquidity?: number;

  stats5m?: TokenStats;
  stats1h?: TokenStats;
  stats6h?: TokenStats;
  stats24h?: TokenStatsExtended;

  cTikles?: number;
  smartClicks?: number;
  updatedAt?: string;
}

export interface TokenStats {
  priceChange: number;
  holderChange: number;
  liquidityChange: number;
  [key: string]: any;
}

export interface TokenStatsExtended extends TokenStats {
  volumeChange?: number;
  buyVolume?: number;
  sellVolume?: number;
  buyOrganicVolume?: number;
  sellOrganicVolume?: number;
  numBuys?: number;
  numSells?: number;
  numTraders?: number;
  numOrganicBuyers?: number;
  numNetBuyers?: number;
}

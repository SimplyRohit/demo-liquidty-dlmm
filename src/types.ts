import { Context } from "telegraf";
import z from "zod";

export interface MySession {
  markets?: string[];
  lastFetchedAt?: number;
  currentPage?: number;
  awaitingQuote?: boolean;
  awaitingSwap?: boolean;
  awaitingAddLiquidity?: boolean;
  awaitingRemoveLiquidity?: boolean;
  selectedPool?: string;
  selectedPoolIndex?: number;
  userPublicKey?: string; 
  pendingTransaction?: {
    poolAddress: string;
    userId: string;
    chatId: string;
    timestamp: number;
    type: string;
  };
}

export interface MyContext extends Context {
  session?: MySession;
}

export const TxResultSchema = z.object({
  status: z.boolean(),
  txId: z.string().optional(),
  errorMessage: z.string().optional(),
  poolAddress: z.string().optional(),
  userId: z.string().optional(),
  chatId: z.string().optional(),
});

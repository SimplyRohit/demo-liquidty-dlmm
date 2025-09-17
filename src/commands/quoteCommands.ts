import { Telegraf } from "telegraf";
import { LiquidityBookServices, type PoolMetadata } from "@saros-finance/dlmm-sdk";
import { PublicKey } from "@solana/web3.js";
import type { MyContext } from "../types";

export function setupQuoteCommands(bot: Telegraf<MyContext>, liquidityBookServices: LiquidityBookServices) {
  
  bot.command("quote", async (ctx) => {
    try {
      const parts = (ctx.message?.text ?? "").trim().split(/\s+/);
      if (parts.length < 3) {
        await ctx.reply("Usage: /quote <poolAddress> <amount>\nExample: /quote <poolAddr> 1.5");
        return;
      }
      const poolAddr = parts[1].trim();
      const amountStr = parts[2].trim();

      let metadata: PoolMetadata;
      try {
        metadata = await liquidityBookServices.fetchPoolMetadata(poolAddr);
      } catch (err) {
        await ctx.reply(`Error fetching metadata for ${poolAddr}: ${String((err as Error)?.message ?? err)}`);
        return;
      }

      // Check for liquidity
      const baseReserve = Number(metadata.baseReserve || 0);
      const quoteReserve = Number(metadata.quoteReserve || 0);
      
      if (baseReserve === 0 || quoteReserve === 0) {
        await ctx.reply(
          `⚠️ Pool has insufficient liquidity:\n` +
          `Base Reserve: ${baseReserve}\n` +
          `Quote Reserve: ${quoteReserve}\n` +
          `Cannot provide quote for this pool.`
        );
        return;
      }

      // Use the correct decimal fields from the extra object
      const baseDecimals = Number(metadata.extra?.tokenBaseDecimal ?? 9);
      const quoteDecimals = Number(metadata.extra?.tokenQuoteDecimal ?? 9);

      // Convert to BigInt like in the SDK example
      const amountFloat = parseFloat(amountStr);
      const amountBigInt = BigInt(Math.floor(amountFloat * Math.pow(10, baseDecimals)));

      // Try smaller amount if the original fails
      let quoteData;
      let actualAmount = amountBigInt;
      let actualAmountStr = amountStr;

      try {
        quoteData = await liquidityBookServices.getQuote({
          amount: amountBigInt,
          isExactInput: true,
          swapForY: true, // swap from base to quote
          pair: new PublicKey(poolAddr),
          tokenBase: new PublicKey(metadata.baseMint),
          tokenQuote: new PublicKey(metadata.quoteMint),
          tokenBaseDecimal: baseDecimals,
          tokenQuoteDecimal: quoteDecimals,
          slippage: 0.5, // Use a reasonable default slippage (0.5%)
        });
      } catch (err: any) {
        if (err.message?.includes("too many bins")) {
          // Try with 10% of the original amount
          actualAmount = amountBigInt / BigInt(10);
          actualAmountStr = (amountFloat / 10).toString();
          
          try {
            quoteData = await liquidityBookServices.getQuote({
              amount: actualAmount,
              isExactInput: true,
              swapForY: true,
              pair: new PublicKey(poolAddr),
              tokenBase: new PublicKey(metadata.baseMint),
              tokenQuote: new PublicKey(metadata.quoteMint),
              tokenBaseDecimal: baseDecimals,
              tokenQuoteDecimal: quoteDecimals,
              slippage: 0.5,
            });
            
            await ctx.reply(`⚠️ Original amount too large, showing quote for reduced amount (${actualAmountStr})`);
          } catch (secondErr) {
            throw err; // Throw original error
          }
        } else {
          throw err;
        }
      }

      await ctx.reply(
        `Quote for swapping ${actualAmountStr} base tokens in pool ${poolAddr}:\n\n` +
        `Pool Liquidity:\n` +
        `  Base Reserve: ${baseReserve} (${baseDecimals} decimals)\n` +
        `  Quote Reserve: ${quoteReserve} (${quoteDecimals} decimals)\n\n` +
        `Quote Results:\n` +
        `  Amount In: ${quoteData.amountIn?.toString() ?? 'N/A'}\n` +
        `  Amount Out: ${quoteData.amountOut?.toString() ?? 'N/A'}\n` +
        `  Price Impact: ${quoteData.priceImpact ?? 'N/A'}%\n` +
        `  Trade Fee: ${metadata.tradeFee}%\n\n` +
        `Full Quote Data:\n${JSON.stringify(quoteData, null, 2)}`
      );
    } catch (err) {
      console.error("/quote error", err);
      await ctx.reply(`Error while quoting: ${String((err as Error)?.message ?? err)}`);
    }
  });
}
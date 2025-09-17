import { Telegraf } from "telegraf";
import { LiquidityBookServices, type PoolMetadata } from "@saros-finance/dlmm-sdk";
import { PublicKey } from "@solana/web3.js";
import type { MyContext } from "../types";

export function setupSwapCommands(bot: Telegraf<MyContext>, liquidityBookServices: LiquidityBookServices) {
  
  bot.command("buildswap", async (ctx) => {
    try {
      const parts = (ctx.message?.text ?? "").trim().split(/\s+/);
      if (parts.length < 4) {
        await ctx.reply("Usage: /buildswap <poolAddress> <amount> <yourPublicKey>");
        return;
      }
      const poolAddr = parts[1].trim();
      const amountStr = parts[2].trim();
      const userPubKeyStr = parts[3].trim();

      let userPub: PublicKey;
      try {
        userPub = new PublicKey(userPubKeyStr);
      } catch {
        await ctx.reply("Invalid public key provided.");
        return;
      }

      let metadata: PoolMetadata;
      try {
        metadata = await liquidityBookServices.fetchPoolMetadata(poolAddr);
      } catch (err) {
        await ctx.reply(`Error fetching metadata for ${poolAddr}: ${String((err as Error)?.message ?? err)}`);
        return;
      }

      // Use consistent decimal handling
      const baseDecimals = Number(metadata.extra?.tokenBaseDecimal ?? 9);
      const quoteDecimals = Number(metadata.extra?.tokenQuoteDecimal ?? 9);

      // Convert to BigInt like in the SDK example
      const amountFloat = parseFloat(amountStr);
      const amountBigInt = BigInt(Math.floor(amountFloat * Math.pow(10, baseDecimals)));

      // Get quote first
      const quoteData = await liquidityBookServices.getQuote({
        amount: amountBigInt, // Use BigInt directly
        isExactInput: true,
        swapForY: true,
        pair: new PublicKey(poolAddr),
        tokenBase: new PublicKey(metadata.baseMint),
        tokenQuote: new PublicKey(metadata.quoteMint),
        tokenBaseDecimal: baseDecimals,
        tokenQuoteDecimal: quoteDecimals,
        slippage: 0.5, // Use reasonable default slippage
      });

      // Build the swap transaction
      const swapResult = await liquidityBookServices.swap({
        amount: (quoteData as any).amount ?? amountBigInt,
        tokenMintX: new PublicKey(metadata.baseMint),
        tokenMintY: new PublicKey(metadata.quoteMint),
        otherAmountOffset: (quoteData as any).otherAmountOffset ?? 0,
        isExactInput: true,
        swapForY: true,
        pair: new PublicKey(poolAddr),
        payer: userPub,
      });

      // Handle different possible return structures
      const txCandidate: any = swapResult?.tx ?? swapResult?.transaction ?? swapResult;
      if (!txCandidate || typeof txCandidate.serialize !== "function") {
        await ctx.reply("SDK did not return a serializable transaction object.");
        return;
      }

      // Set recent blockhash and fee payer if not already set
      const latest = await liquidityBookServices.connection.getLatestBlockhash();
      if (!txCandidate.recentBlockhash) txCandidate.recentBlockhash = latest.blockhash;
      if (!txCandidate.feePayer) txCandidate.feePayer = userPub;

      const serialized = txCandidate.serialize({ requireAllSignatures: false, verifySignatures: false });
      const base64Tx = Buffer.from(serialized).toString("base64");

      await ctx.reply(
        `Swap transaction built successfully!\n\n` +
        `Pool: ${poolAddr}\n` +
        `Amount: ${amountStr} base tokens\n` +
        `Expected Output: ${quoteData.amountOut?.toString() ?? 'N/A'} quote tokens\n` +
        `Price Impact: ${quoteData.priceImpact ?? 'N/A'}%\n\n` +
        `Unsigned transaction (Base64):\n\`\`\`\n${base64Tx}\n\`\`\``
      );
    } catch (err) {
      console.error("/buildswap error", err);
      await ctx.reply(`Error building swap transaction: ${String((err as Error)?.message ?? err)}`);
    }
  });
}
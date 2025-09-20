import type { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import type { MyContext, TokenInfo } from "../../types";
import { PublicKey } from "@solana/web3.js";

export async function handleQuoteRequest(
  ctx: MyContext,
  poolAddress: string,
  liquidityBookServices: LiquidityBookServices
) {
  try {
    //@ts-ignore ignoree krde bhaai
    const amountStr = ctx.message?.text?.trim();
    if (!amountStr) {
      await ctx.reply("❌ Please provide a valid amount.");
      return;
    }

    const amountFloat = parseFloat(amountStr);
    if (isNaN(amountFloat) || amountFloat <= 0) {
      await ctx.reply("❌ Please provide a valid positive number.");
      return;
    }

    await ctx.reply("🔄 Getting quote...");

    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);

    const baseReserve = Number(metadata.baseReserve || 0);
    const quoteReserve = Number(metadata.quoteReserve || 0);

    if (baseReserve === 0 || quoteReserve === 0) {
      await ctx.reply(
        `⚠️ Pool has insufficient liquidity:\n` +
          `Base Reserve: ${baseReserve}\nQuote Reserve: ${quoteReserve}\n` +
          `Cannot provide quote for this pool.`
      );
      return;
    }

    const baseDecimals = Number(metadata.extra?.tokenBaseDecimal ?? 9);
    const quoteDecimals = Number(metadata.extra?.tokenQuoteDecimal ?? 9);
    const amountBigInt = BigInt(
      Math.floor(amountFloat * Math.pow(10, baseDecimals))
    );

    let quoteData;
    let actualAmount = amountBigInt;
    let actualAmountStr = amountStr;

    try {
      quoteData = await liquidityBookServices.getQuote({
        amount: amountBigInt,
        isExactInput: true,
        swapForY: true,
        pair: new PublicKey(poolAddress),
        tokenBase: new PublicKey(metadata.baseMint),
        tokenQuote: new PublicKey(metadata.quoteMint),
        tokenBaseDecimal: baseDecimals,
        tokenQuoteDecimal: quoteDecimals,
        slippage: 0.5,
      });
    } catch (err: any) {
      if (err.message?.includes("too many bins")) {
        actualAmount = amountBigInt / BigInt(10);
        actualAmountStr = (amountFloat / 10).toString();

        quoteData = await liquidityBookServices.getQuote({
          amount: actualAmount,
          isExactInput: true,
          swapForY: true,
          pair: new PublicKey(poolAddress),
          tokenBase: new PublicKey(metadata.baseMint),
          tokenQuote: new PublicKey(metadata.quoteMint),
          tokenBaseDecimal: baseDecimals,
          tokenQuoteDecimal: quoteDecimals,
          slippage: 0.5,
        });

        await ctx.reply(
          `⚠️ Original amount too large, showing quote for reduced amount (${actualAmountStr})`
        );
      } else {
        throw err;
      }
    }

    const amountOutReadable = quoteData.amountOut
      ? (Number(quoteData.amountOut) / Math.pow(10, quoteDecimals)).toFixed(6)
      : "N/A";

    await ctx.reply(
      `Quote Result\n\n` +
        `Address: \n\`${poolAddress}\`\n\n` +
        `Input: ${actualAmountStr} Base\n` +
        `Output: ${amountOutReadable} Quote\n` +
        `Price Impact: ${quoteData.priceImpact ?? "N/A"}%\n` +
        `Trade Fee: ${metadata.tradeFee}%\n\n` +
        `Pool Liquidity:\n` +
        `• Base Reserve: ${(baseReserve / Math.pow(10, baseDecimals)).toLocaleString()}\n` +
        `• Quote Reserve: ${(quoteReserve / Math.pow(10, quoteDecimals)).toLocaleString()}`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Build Swap",
                callback_data: `action:swap:${ctx.session?.selectedPoolIndex ?? 0}`,
              },
            ],
            [
              {
                text: "Back to Market",
                callback_data: `market:${ctx.session?.selectedPoolIndex ?? 0}`,
              },
            ],
          ],
        },
      }
    );
  } catch (err) {
    console.error("Quote error:", err);
    await ctx.reply(`❌ Error getting quote`);
  }
}

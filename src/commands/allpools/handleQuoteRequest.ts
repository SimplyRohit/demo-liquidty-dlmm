import type { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import type { MyContext, TokenInfo } from "../../types";
import { PublicKey } from "@solana/web3.js";

function escapeMarkdownV2(text: string): string {
  if (!text) return "";
  return text.replace(/([_*\[\]()~`>#+-=|{}.!])/g, "\\$1");
}

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

    const baseSymbol = escapeMarkdownV2("BASE");
    const quoteSymbol = escapeMarkdownV2("QUOTE");
    const poolAddressEscaped = escapeMarkdownV2(poolAddress);

    const amountOutReadable = quoteData.amountOut
      ? (Number(quoteData.amountOut) / Math.pow(10, quoteDecimals)).toFixed(6)
      : "N/A";

    await ctx.reply(
      "```\n" +
        `Quote Result\n\n` +
        `Pool: ${baseSymbol}-${quoteSymbol}\n` +
        `Address: ${poolAddressEscaped}\n\n` +
        `Input: ${actualAmountStr} ${baseSymbol}\n` +
        `Output: ${amountOutReadable} ${quoteSymbol}\n` +
        `Price Impact: ${quoteData.priceImpact ?? "N/A"}%\n` +
        `Trade Fee: ${metadata.tradeFee}%\n\n` +
        `Pool Liquidity:\n` +
        `• ${baseSymbol} Reserve: ${(baseReserve / Math.pow(10, baseDecimals)).toLocaleString()}\n` +
        `• ${quoteSymbol} Reserve: ${(quoteReserve / Math.pow(10, quoteDecimals)).toLocaleString()}` +
        "```",
      {
        parse_mode: "MarkdownV2",
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
    await ctx.reply(
      `❌ Error getting quote: ${escapeMarkdownV2(
        String((err as Error)?.message ?? err)
      )}`
    );
  }
}

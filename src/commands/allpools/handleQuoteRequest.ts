import type { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import type { MyContext } from "../../types";

export async function handleQuoteRequest(ctx: MyContext, poolAddress: string, liquidityBookServices: LiquidityBookServices) {
  try {
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

    // Fetch pool metadata
    let metadata: PoolMetadata;
    try {
      metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);
    } catch (err) {
      await ctx.reply(`❌ Error fetching pool metadata: ${String((err as Error)?.message ?? err)}`);
      return;
    }

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
    const amountBigInt = BigInt(Math.floor(amountFloat * Math.pow(10, baseDecimals)));

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
        
        try {
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
          
          await ctx.reply(`⚠️ Original amount too large, showing quote for reduced amount (${actualAmountStr})`);
        } catch (secondErr) {
          throw err;
        }
      } else {
        throw err;
      }
    }
 // Get token information for better display
    const [baseTokenResponse, quoteTokenResponse] = await Promise.all([
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.baseMint}`).catch(() => null),
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.quoteMint}`).catch(() => null)
    ]);

    let baseSymbol = "BASE";
    let quoteSymbol = "QUOTE";

    if (baseTokenResponse && quoteTokenResponse) {
      const baseTokenData = (await baseTokenResponse.json())[0];
      const quoteTokenData = (await quoteTokenResponse.json())[0];
      if (baseTokenData) baseSymbol = baseTokenData.symbol;
      if (quoteTokenData) quoteSymbol = quoteTokenData.symbol;
    }

    // Calculate readable amounts
    const amountOutReadable = quoteData.amountOut ? 
      (Number(quoteData.amountOut) / Math.pow(10, quoteDecimals)).toFixed(6) : 'N/A';

    await ctx.reply(
      `💱 *Quote Result*\n\n` +
      `📊 **${baseSymbol}-${quoteSymbol}** Pool\n` +
      `🏦 \`${poolAddress.slice(0, 8)}...${poolAddress.slice(-4)}\`\n\n` +
      `📥 **Input:** ${actualAmountStr} ${baseSymbol}\n` +
      `📤 **Output:** ${amountOutReadable} ${quoteSymbol}\n` +
      `💥 **Price Impact:** ${quoteData.priceImpact ?? 'N/A'}%\n` +
      `💰 **Trade Fee:** ${metadata.tradeFee}%\n\n` +
      `📊 **Pool Liquidity:**\n` +
      `• ${baseSymbol} Reserve: ${(baseReserve / Math.pow(10, baseDecimals)).toLocaleString()}\n` +
      `• ${quoteSymbol} Reserve: ${(quoteReserve / Math.pow(10, quoteDecimals)).toLocaleString()}`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Build Swap", callback_data: `action:swap:${ctx.session?.selectedPoolIndex || 0}` }],
            [{ text: "🔙 Back to Market", callback_data: `market:${ctx.session?.selectedPoolIndex || 0}` }]
          ]
        }
      }
    );

  } catch (err) {
    console.error("Quote error:", err);
    await ctx.reply(`❌ Error getting quote: ${String((err as Error)?.message ?? err)}`);
  }
}

import type { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import type { MyContext } from "../../types";

export async function startQuoteProcess(
  ctx: MyContext,
  poolAddress: string,
  liquidityBookServices: LiquidityBookServices,
) {
  try {
    // Fetch pool metadata to show token info
    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);

    const [baseTokenResponse, quoteTokenResponse] = await Promise.all([
      fetch(
        `https://lite-api.jup.ag/ultra/v1/search?query=${metadata.baseMint}`
      ).catch(() => null),
      fetch(
        `https://lite-api.jup.ag/ultra/v1/search?query=${metadata.quoteMint}`
      ).catch(() => null),
    ]);

    if (!baseTokenResponse || !quoteTokenResponse) {
      await ctx.reply("❌ Error fetching token information.");
      return;
    }

    const baseTokenData = (await baseTokenResponse.json())[0];
    const quoteTokenData = (await quoteTokenResponse.json())[0];

    if (!baseTokenData || !quoteTokenData) {
      await ctx.reply("❌ Invalid token data.");
      return;
    }

    await ctx.reply(
      `💱 *Get Quote*\n\n` +
        `📊 *Pool:* ${baseTokenData.symbol}-${quoteTokenData.symbol}\n` +
        `🏦 *Address:* \`${poolAddress}\`\n\n` +
        `To get a quote, please send the amount you want to swap:\n\n` +
        `*Format:* \`amount\`\n` +
        `*Example:* \`1.5\` (to swap 1.5 ${baseTokenData.symbol})\n\n` +
        `💡 *Note:* Quote will show you how many ${quoteTokenData.symbol} you'll receive`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🔙 Back to Market",
                callback_data: `market:${ctx.session?.selectedPoolIndex || 0}`,
              },
            ],
          ],
        },
      }
    );

    // Set the context for next message
    ctx.session!.awaitingQuote = true;
  } catch (err) {
    console.error("Error in startQuoteProcess:", err);
    await ctx.reply("❌ Error starting quote process. Please try again.");
  }
}

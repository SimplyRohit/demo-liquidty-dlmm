import type { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import type { MyContext } from "../../types";

export async function startSwapProcess(
  ctx: MyContext,
  poolAddress: string,
  liquidityBookServices: LiquidityBookServices
) {
  try {
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

    await ctx.reply(
      `🔄 *Build Swap Transaction*\n\n` +
        `📊 *Pool:* ${baseTokenData.symbol}-${quoteTokenData.symbol}\n` +
        `🏦 *Address:* \`${poolAddress}\`\n\n` +
        `To build a swap transaction, please send:\n\n` +
        `*Format:* \`amount your_public_key\`\n` +
        `*Example:* \`1.5 YOUR_WALLET_ADDRESS\`\n\n` +
        `💡 *Note:* This will create an unsigned transaction that you can sign and execute`,
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
    ctx.session!.awaitingSwap = true;
  } catch (err) {
    console.error("Error in startSwapProcess:", err);
    await ctx.reply("❌ Error starting swap process. Please try again.");
  }
}

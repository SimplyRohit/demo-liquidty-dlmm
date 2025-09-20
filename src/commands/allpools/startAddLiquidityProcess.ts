import type { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import type { MyContext } from "../../types";

export async function startAddLiquidityProcess(
  ctx: MyContext,
  poolAddress: string,
  liquidityBookServices: LiquidityBookServices
) {
  try {
    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);

    await ctx.reply(
      `Add Liquidity\n\n` +
        `Address: \n\`${poolAddress}\`\n\n` +
        `To add liquidity, please send:\n\n` +
        `Format: amountX amountY your_wallet_address binRangeLower binRangeUpper\n` +
        `Example: 10 10 YOUR_WALLET_ADDRESS -10 10\n` +
        `Parameters:**\n` +
        `• amountX: Amount of BaseMint to add\n` +
        `• amountY: Amount of QuoteMint to add\n` +
        `• wallet: Your wallet address\n` +
        `• binRangeLower: Lower bin range (e.g., -10)\n` +
        `• binRangeUpper: Upper bin range (e.g., 10)\n\n`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Back to Market",
                callback_data: `market:${ctx.session?.selectedPoolIndex || 0}`,
              },
            ],
          ],
        },
      }
    );

    ctx.session!.awaitingAddLiquidity = true;
  } catch (err) {
    console.error("Error in startAddLiquidityProcess:", err);
    await ctx.reply(
      "❌ Error starting add liquidity process. Please try again."
    );
  }
}

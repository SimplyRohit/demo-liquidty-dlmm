import type { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import type { MyContext } from "../../types";

function escapeMdV2(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

export async function startSwapProcess(
  ctx: MyContext,
  poolAddress: string,
  liquidityBookServices: LiquidityBookServices
) {
  try {
    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);

    const message =
      "```\n" +
      `Build Swap Transaction\n\n` +
      `Address:\n${escapeMdV2(poolAddress)}\n\n` +
      `To build a swap transaction, please send:\n\n` +
      `Format: amount your_public_key\n` +
      `Example: 1.5 YOUR_WALLET_ADDRESS\n\n` +
      `Note: This will create an unsigned transaction that you can sign and execute\n` +
      "```";

    await ctx.reply(message, {
      parse_mode: "MarkdownV2",
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
    });

    ctx.session!.awaitingSwap = true;
  } catch (err) {
    console.error("Error in startSwapProcess:", err);
    await ctx.reply("❌ Error starting swap process. Please try again.");
  }
}

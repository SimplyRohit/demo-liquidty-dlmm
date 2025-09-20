import type { MyContext } from "../../types";

export async function startSwapProcess(ctx: MyContext, poolAddress: string) {
  try {
    const message =
      `Build Swap Transaction\n\n` +
      `Address:\n\`${poolAddress}\`\n\n` +
      `To build a swap transaction, please send:\n\n` +
      `Format: amount your_public_key\n` +
      `Example: 1.5 YOUR_WALLET_ADDRESS\n\n` +
      `Note: This will create an unsigned transaction that you can sign and execute\n`;

    await ctx.reply(message, {
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
    });

    ctx.session!.awaitingSwap = true;
  } catch (err) {
    console.error("Error in startSwapProcess:", err);
    await ctx.reply("❌ Error starting swap process. Please try again.");
  }
}

import type { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import type { MyContext } from "../../types";

function escapeMarkdownV2(text: string): string {
  if (!text) return "";
  return text.replace(/([_*\[\]()~`>#+-=|{}.!])/g, "\\$1");
}

export async function startQuoteProcess(
  ctx: MyContext,
  poolAddress: string,
  liquidityBookServices: LiquidityBookServices
) {
  try {
    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);

    const poolAddressEscaped = escapeMarkdownV2(metadata.poolAddress);

    await ctx.reply(
      `*Get Quote*\n\n` +
        `Address: \`${poolAddressEscaped}\`\n\n` +
        `To get a quote, please send the amount you want to swap:\n` +
        `Format: \`amount\``,
      {
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: [
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

    if (!ctx.session) ctx.session = {};
    ctx.session.awaitingQuote = true;
  } catch (err) {
    console.error("Error in startQuoteProcess:", err);
    await ctx.reply("❌ Error starting quote process. Please try again.");
  }
}

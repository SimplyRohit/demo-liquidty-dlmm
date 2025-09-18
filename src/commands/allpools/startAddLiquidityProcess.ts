import type { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import type { MyContext } from "../../types";

export async function startAddLiquidityProcess(ctx: MyContext, poolAddress: string, liquidityBookServices: LiquidityBookServices) {
  try {
    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);
    
    const [baseTokenResponse, quoteTokenResponse] = await Promise.all([
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.baseMint}`).catch(() => null),
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.quoteMint}`).catch(() => null)
    ]);

    if (!baseTokenResponse || !quoteTokenResponse) {
      await ctx.reply("❌ Error fetching token information.");
      return;
    }

    const baseTokenData = (await baseTokenResponse.json())[0];
    const quoteTokenData = (await quoteTokenResponse.json())[0];

    await ctx.reply(
      `➕ *Add Liquidity*\n\n` +
      `📊 *Pool:* ${baseTokenData.symbol}-${quoteTokenData.symbol}\n` +
      `🏦 *Address:* \`${poolAddress}\`\n\n` +
      `To add liquidity, please send:\n\n` +
      `*Format:* \`amountX amountY your_wallet_address binRangeLower binRangeUpper\`\n` +
      `*Example:* \`10 10 YOUR_WALLET_ADDRESS -10 10\`\n\n` +
      `**Parameters:**\n` +
      `• amountX: Amount of ${baseTokenData.symbol} to add\n` +
      `• amountY: Amount of ${quoteTokenData.symbol} to add\n` +
      `• wallet: Your wallet address\n` +
      `• binRangeLower: Lower bin range (e.g., -10)\n` +
      `• binRangeUpper: Upper bin range (e.g., 10)\n\n` +
      `💡 *Note:* This will create unsigned transactions for you to sign`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: "🔙 Back to Market", callback_data: `market:${ctx.session?.selectedPoolIndex || 0}` }
          ]]
        }
      }
    );

    // Set the context for next message
    ctx.session!.awaitingAddLiquidity = true;

  } catch (err) {
    console.error("Error in startAddLiquidityProcess:", err);
    await ctx.reply("❌ Error starting add liquidity process. Please try again.");
  }
}
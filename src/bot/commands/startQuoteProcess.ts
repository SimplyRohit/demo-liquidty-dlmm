import type { LiquidityBookServices } from '@saros-finance/dlmm-sdk';
import type { MyContext } from '@/types';

export async function startQuoteProcess(
  ctx: MyContext,
  poolAddress: string,
  liquidityBookServices: LiquidityBookServices,
) {
  try {
    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);
    await ctx.reply(
      `<i>Get Quote</i>\n\n` +
        `<i>Address:</i>\n<pre>${metadata.poolAddress}</pre>\n\n` +
        `<i>To get a quote, please send the amount you want to swap:\nFormat: amount</i>`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Back to Market',
                callback_data: `market:${ctx.session?.selectedPoolIndex ?? 0}`,
              },
            ],
          ],
        },
      },
    );

    if (!ctx.session) ctx.session = {};
    ctx.session.awaitingQuote = true;
  } catch (err) {
    console.error('Error in startQuoteProcess:', err);
    await ctx.reply(`<i>Error starting quote process. Please try again.</i>`, {
      parse_mode: 'HTML',
    });
  }
}

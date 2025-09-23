import type { MyContext } from '@/types';

export async function startAddLiquidityProcess(ctx: MyContext) {
  try {
    const poolAddress = ctx.session?.selectedPool;
    const userPubKey = ctx.session?.userPublicKey;

    if (!poolAddress || !userPubKey) {
      await ctx.reply(
        '<i>Session data missing. Please use /mypools command again.</i>',
        {
          parse_mode: 'HTML',
        },
      );
      return;
    }

    const message =
      `<i>Add Liquidity\n\n` +
      `Pool:</i>\n<pre>${poolAddress}</pre>\n` +
      `<i>User:</i>\n<pre>${userPubKey}</pre>\n\n` +
      `<i>Please send the amounts and bin range:\n\n` +
      `Format: baseAmount quoteAmount binRangeLower binRangeUpper userPublicKey\n` +
      `Example: 10 10 -5 5 ${userPubKey}\n\n` +
      `This will add 10 base tokens and 10 quote tokens in bins from -5 to +5 relative to active bin.</i>`;

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Cancel',
              callback_data: 'mypools:refresh',
            },
          ],
        ],
      },
    });

    if (!ctx.session) ctx.session = {};
    ctx.session.awaitingAddLiquidity = true;
  } catch (err) {
    console.error('startAddLiquidityProcess error:', err);
    await ctx.reply(
      '<i>Error starting add liquidity process. Please try again.</i>',
      {
        parse_mode: 'HTML',
      },
    );
  }
}

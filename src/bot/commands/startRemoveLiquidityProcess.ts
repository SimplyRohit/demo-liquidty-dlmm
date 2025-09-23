import type { MyContext } from '@/types';

export async function startRemoveLiquidityProcess(ctx: MyContext) {
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
      `<i>Remove Liquidity\n\n` +
      `Pool:</i>\n<pre>${poolAddress}</pre>\n` +
      `<i>User:</i>\n<pre>${userPubKey}</pre>\n\n` +
      `<i>Please send the bin range to remove from:\n\n` +
      `Format: binRangeLower binRangeUpper userPublicKey\n` +
      `Example: -3 3 ${userPubKey}\n\n` +
      `This will remove liquidity from bins -3 to +3 relative to active bin.</i>`;

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
    ctx.session.awaitingRemoveLiquidity = true;
  } catch (err) {
    console.error('startRemoveLiquidityProcess error:', err);
    await ctx.reply(
      '<i>Error starting remove liquidity process. Please try again.</i>',
      {
        parse_mode: 'HTML',
      },
    );
  }
}

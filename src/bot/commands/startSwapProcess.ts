import type { MyContext } from '@/types';

export async function startSwapProcess(ctx: MyContext, poolAddress: string) {
  try {
    const message =
      `<i>Build Swap Transaction\n\n` +
      `Address:</i>\n<pre>${poolAddress}</pre>\n\n` +
      `<i>To build a swap transaction, please send:\n\n` +
      `Format: amount your_public_key Swap(true = BASE -> QUOTE : false = QUOTE -> BASE)\n` +
      `Example: 1.5 YOUR_WALLET_ADDRESS true\n\n` +
      `Note: This will create an unsigned transaction that you can sign and execute</i>\n`;

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Back to Market',
              callback_data: `market:${ctx.session?.selectedPoolIndex || 0}`,
            },
          ],
        ],
      },
    });

    ctx.session!.awaitingSwap = true;
  } catch (err) {
    console.error('Error in startSwapProcess:', err);
    await ctx.reply('<i>Error starting swap process. Please try again.</i>', {
      parse_mode: 'HTML',
    });
  }
}

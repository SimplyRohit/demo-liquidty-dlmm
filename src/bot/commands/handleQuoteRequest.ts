import type { LiquidityBookServices } from '@saros-finance/dlmm-sdk';
import { MyContext } from '@/types';
import { PublicKey } from '@solana/web3.js';

export async function handleQuoteRequest(
  ctx: MyContext,
  poolAddress: string,
  liquidityBookServices: LiquidityBookServices,
) {
  try {
    //@ts-ignore ignoree krde bhaai
    const amountStr = ctx.message?.text?.trim();
    if (!amountStr) {
      await ctx.reply(`<i>Please provide a valid amount.</i>`, {
        parse_mode: 'HTML',
      });
      return;
    }

    const amountFloat = parseFloat(amountStr);
    if (isNaN(amountFloat) || amountFloat <= 0) {
      await ctx.reply(`<i>Please provide a valid positive number.</i>`, {
        parse_mode: 'HTML',
      });
      return;
    }

    await ctx.reply(`<i>Getting quote...</i>`, { parse_mode: 'HTML' });

    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);

    const baseReserve = Number(metadata.baseReserve || 0);
    const quoteReserve = Number(metadata.quoteReserve || 0);

    if (baseReserve === 0 || quoteReserve === 0) {
      await ctx.reply(
        `<i>Pool has insufficient liquidity:\nBase Reserve: ${baseReserve}\nQuote Reserve: ${quoteReserve}\nCannot provide quote for this pool.</i>`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    const baseDecimals = Number(metadata.extra?.tokenBaseDecimal ?? 9);
    const quoteDecimals = Number(metadata.extra?.tokenQuoteDecimal ?? 9);
    const amountBigInt = BigInt(
      Math.floor(amountFloat * Math.pow(10, baseDecimals)),
    );

    let quoteData: any;
    let actualAmount = amountBigInt;
    let actualAmountStr = amountStr;

    try {
      quoteData = await liquidityBookServices.getQuote({
        amount: amountBigInt,
        isExactInput: true,
        swapForY: true,
        pair: new PublicKey(poolAddress),
        tokenBase: new PublicKey(metadata.baseMint),
        tokenQuote: new PublicKey(metadata.quoteMint),
        tokenBaseDecimal: baseDecimals,
        tokenQuoteDecimal: quoteDecimals,
        slippage: 0.5,
      });
    } catch (err: any) {
      if (err.message?.includes('too many bins')) {
        actualAmount = amountBigInt / BigInt(10);
        actualAmountStr = (amountFloat / 10).toString();

        quoteData = await liquidityBookServices.getQuote({
          amount: actualAmount,
          isExactInput: true,
          swapForY: true,
          pair: new PublicKey(poolAddress),
          tokenBase: new PublicKey(metadata.baseMint),
          tokenQuote: new PublicKey(metadata.quoteMint),
          tokenBaseDecimal: baseDecimals,
          tokenQuoteDecimal: quoteDecimals,
          slippage: 0.5,
        });

        await ctx.reply(
          `<i>Original amount too large, showing quote for reduced amount (${actualAmountStr})</i>`,
          { parse_mode: 'HTML' },
        );
      } else {
        throw err;
      }
    }

    const amountOutReadable = quoteData.amountOut
      ? (Number(quoteData.amountOut) / Math.pow(10, quoteDecimals)).toFixed(6)
      : 'N/A';

    await ctx.reply(
      `<i>Quote Result</i>\n\n` +
        `<i>Address:</i>\n<pre>${poolAddress}</pre>\n\n` +
        `<i>Input:</i> ${actualAmountStr} <i>Base</i>\n` +
        `<i>Output:</i> ${amountOutReadable} <i>Quote</i>\n` +
        `<i>Price Impact:</i> ${quoteData.priceImpact ?? 'N/A'}%\n` +
        `<i>Trade Fee:</i> ${metadata.tradeFee}%\n\n` +
        `<i>Pool Liquidity:</i>\n` +
        `• <i>Base Reserve:</i> ${(baseReserve / Math.pow(10, baseDecimals)).toLocaleString()}\n` +
        `• <i>Quote Reserve:</i> ${(quoteReserve / Math.pow(10, quoteDecimals)).toLocaleString()}`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Build Swap',
                callback_data: `action:swap:${ctx.session?.selectedPoolIndex ?? 0}`,
              },
            ],
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
  } catch (err) {
    console.error('Quote error:', err);
    await ctx.reply(`<i>Error getting quote</i>`, { parse_mode: 'HTML' });
  }
}

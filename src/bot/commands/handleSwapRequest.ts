import { LiquidityBookServices, PoolMetadata } from '@saros-finance/dlmm-sdk';
import { PublicKey } from '@solana/web3.js';
import { MyContext } from '@/types';

export async function handleSwapRequest(
  ctx: MyContext,
  poolAddress: string,
  liquidityBookServices: LiquidityBookServices,
) {
  try {
    //@ts-ignore ignoree krde bhaai
    const parts = ctx.message?.text?.trim().split(/\s+/) || [];
    if (parts.length < 2) {
      await ctx.reply(
        `<i>Invalid format!\n\nRequired: amount your_wallet_address\nExample: 1.5 YOUR_WALLET_ADDRESS</i>`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    const amountStr = parts[0].trim();
    const userPubKeyStr = parts[1].trim();

    const amountFloat = parseFloat(amountStr);
    if (isNaN(amountFloat) || amountFloat <= 0) {
      await ctx.reply('<i>Please provide a valid positive amount.</i>', {
        parse_mode: 'HTML',
      });
      return;
    }

    let userPub: PublicKey;
    try {
      userPub = new PublicKey(userPubKeyStr);
    } catch {
      await ctx.reply('<i>Invalid wallet address provided.</i>', {
        parse_mode: 'HTML',
      });
      return;
    }

    await ctx.reply('<i>Building swap transaction...</i>', {
      parse_mode: 'HTML',
    });

    const metadata: PoolMetadata =
      await liquidityBookServices.fetchPoolMetadata(poolAddress);

    const baseDecimals = Number(metadata.extra?.tokenBaseDecimal ?? 9);
    const quoteDecimals = Number(metadata.extra?.tokenQuoteDecimal ?? 9);
    const amountBigInt = BigInt(
      Math.floor(amountFloat * Math.pow(10, baseDecimals)),
    );

    const quoteData = await liquidityBookServices.getQuote({
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

    const swapResult = await liquidityBookServices.swap({
      hook: new PublicKey(liquidityBookServices.hooksConfig),
      amount: (quoteData as any).amount ?? amountBigInt,
      tokenMintX: new PublicKey(metadata.baseMint),
      tokenMintY: new PublicKey(metadata.quoteMint),
      otherAmountOffset: (quoteData as any).otherAmountOffset ?? 0,
      isExactInput: true,
      swapForY: true,
      pair: new PublicKey(poolAddress),
      payer: userPub,
    });

    const txCandidate: any =
      //@ts-ignore ignoree krde bhaai
      swapResult?.tx ?? swapResult?.transaction ?? swapResult;
    if (!txCandidate || typeof txCandidate.serialize !== 'function') {
      await ctx.reply(
        '<i>SDK did not return a serializable transaction object.</i>',
        { parse_mode: 'HTML' },
      );
      return;
    }

    const latest = await liquidityBookServices.connection.getLatestBlockhash();
    if (!txCandidate.recentBlockhash)
      txCandidate.recentBlockhash = latest.blockhash;
    if (!txCandidate.feePayer) txCandidate.feePayer = userPub;

    const serialized = txCandidate.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const base64Tx = Buffer.from(serialized).toString('base64');

    const amountOutReadable = quoteData.amountOut
      ? (Number(quoteData.amountOut) / Math.pow(10, quoteDecimals)).toFixed(6)
      : 'N/A';

    const userId = ctx.from?.id.toString() || '';
    const chatId = ctx.chat?.id.toString() || '';

    const poolIndex = ctx.session?.selectedPoolIndex ?? -1;

    if (!ctx.session) ctx.session = {};
    // @ts-ignore ignoree krde bhaai
    ctx.session.pendingTransaction = {
      poolAddress,
      // @ts-ignore ignoree krde bhaai
      poolIndex,
      userId: ctx.from?.id.toString() || '',
      chatId: ctx.chat?.id.toString() || '',
      timestamp: Date.now(),
    };

    const frontendUrl = process.env.frontendUrl;
    const txParams = new URLSearchParams({
      tx: base64Tx,
      pool: poolAddress,
      userId: userId,
      chatId: chatId,
    });
    const txUrl = `${frontendUrl}/?${txParams.toString()}`;

    await ctx.reply(
      `<i>Swap Transaction Built Successfully\n\n` +
        `Pool Address:</i>\n<pre>${poolAddress}</pre>\n\n` +
        `<i>Wallet:</i>\n<pre>${userPubKeyStr}</pre>\n\n` +
        `<i>Input: ${amountStr} BASE\n` +
        `Expected Output: ${amountOutReadable} QUOTE\n` +
        `Price Impact: ${quoteData.priceImpact ?? 'N/A'}%</i>`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Sign and Send Transaction',
                url: txUrl,
              },
            ],
            [
              {
                text: 'Back to Market',
                callback_data: `market:${ctx.session?.selectedPoolIndex || 0}`,
              },
            ],
          ],
        },
      },
    );
  } catch (err) {
    console.error('Swap error:', err);
    await ctx.reply(
      `<i>Error building swap transaction: ${String((err as Error)?.message ?? err)}</i>`,
      { parse_mode: 'HTML' },
    );
  }
}

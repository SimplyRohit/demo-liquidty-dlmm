import { PublicKey } from '@solana/web3.js';
import { MyContext } from '@/types';
import {
  BIN_STEP_CONFIGS,
  LiquidityBookServices,
} from '@saros-finance/dlmm-sdk';

export async function handleCreatePool(
  ctx: MyContext,
  liquidityBookServices: LiquidityBookServices,
) {
  // @ts-ignore lala
  const parts = (ctx.message?.text ?? '').trim().split(/\s+/);
  if (parts.length < 7) {
    await ctx.reply(
      '<i>Usage: /createpool &lt;tokenXMint&gt; &lt;tokenYMint&gt; &lt;tokenXDecimals&gt; &lt;tokenYDecimals&gt; &lt;ratePrice&gt; &lt;payerPublicKey&gt; [binStep]\n' +
        'Example: \n' +
        '/createpool EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v So11111111111111111111111111111111111111112 6 9 1.0 YOUR_WALLET_ADDRESS 25\n\n' +
        'Available bin steps:' +
        ` ${BIN_STEP_CONFIGS.map((c) => c.binStep).join(' , ')}</i>`,
      {
        parse_mode: 'HTML',
      },
    );
    1;
    return;
  }

  const connection = liquidityBookServices.connection;
  const [
    _,
    tokenXMint,
    tokenYMint,
    tokenXDec,
    tokenYDec,
    ratePriceStr,
    payerKeyStr,
    binStepStr,
  ] = parts;

  const tokenXDecimals = parseInt(tokenXDec);
  const tokenYDecimals = parseInt(tokenYDec);
  const ratePrice = parseFloat(ratePriceStr);
  const binStep = binStepStr ? parseInt(binStepStr) : 20;

  let tokenXPub, tokenYPub, payerPub;
  try {
    tokenXPub = new PublicKey(tokenXMint);
    tokenYPub = new PublicKey(tokenYMint);
    payerPub = new PublicKey(payerKeyStr);
  } catch {
    return await ctx.reply(
      '<i>Invalid token or payer public key provided.</i>',
      {
        parse_mode: 'HTML',
      },
    );
  }

  if (tokenXMint === tokenYMint)
    return ctx.reply('<i>Token X and Token Y cannot be the same.</i>', {
      parse_mode: 'HTML',
    });
  if (isNaN(tokenXDecimals) || isNaN(tokenYDecimals) || isNaN(ratePrice))
    return ctx.reply('<i>Invalid decimals or rate price.</i>', {
      parse_mode: 'HTML',
    });
  if (tokenXDecimals < 0 || tokenYDecimals < 0 || ratePrice <= 0)
    return ctx.reply(
      '<i>Decimals must be non-negative and rate positive.</i>',
      {
        parse_mode: 'HTML',
      },
    );
  const validBinStep = BIN_STEP_CONFIGS.find((c) => c.binStep === binStep);
  if (!validBinStep)
    return ctx.reply(
      `<i>Invalid bin step. Valid: ${BIN_STEP_CONFIGS.map(
        (c) => c.binStep,
      ).join(' , ')}</i>`,
      {
        parse_mode: 'HTML',
      },
    );

  await ctx.reply('<i>Creating pool transaction...,</i>', {
    parse_mode: 'HTML',
  });

  try {
    const { blockhash } = await connection.getLatestBlockhash({
      commitment: 'confirmed',
    });
    const { tx } = await liquidityBookServices.createPairWithConfig({
      tokenBase: { mintAddress: tokenXMint, decimal: tokenXDecimals },
      tokenQuote: { mintAddress: tokenYMint, decimal: tokenYDecimals },
      ratePrice,
      binStep,
      payer: payerPub,
    });

    tx.recentBlockhash = blockhash;
    tx.feePayer = payerPub;

    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const base64Tx = Buffer.from(serialized).toString('base64');
    const userId = ctx.from?.id.toString() || '';
    const chatId = ctx.chat?.id.toString() || '';
    const frontendUrl = process.env.frontendUrl!;
    const txParams = new URLSearchParams({
      tx: base64Tx,
      pool: payerKeyStr,
      userId: userId,
      chatId: chatId,
    });
    const txUrl = `${frontendUrl}/?${txParams.toString()}`;

    await ctx.reply(`<i>Pool transaction built! SuccessFully</i>`, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Pay Transaction',
              url: txUrl,
            },
          ],
        ],
      },
    });
  } catch (error) {
    console.error('Pool creation error:', error);

    // @ts-ignore lala
    await ctx.reply(`<i>Error creating pool: ${err?.message ?? err}</i>`, {
      parse_mode: 'HTML',
    });
  }
}

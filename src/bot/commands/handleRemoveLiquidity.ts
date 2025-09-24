import { LiquidityBookServices } from '@saros-finance/dlmm-sdk';
import { RemoveLiquidityType } from '@saros-finance/dlmm-sdk';
import { MyContext } from '@/types';
import { PublicKey, Transaction } from '@solana/web3.js';
import { PositionInfo } from '@saros-finance/dlmm-sdk/types/services';

export async function handleRemoveLiquidityRequest(
  ctx: MyContext,
  poolAddress: string,
  liquidityBookServices: LiquidityBookServices,
) {
  try {
    // @ts-ignore
    const parts = ctx.message?.text?.trim().split(/\s+/) || [];
    if (parts.length < 3) {
      await ctx.reply(
        `<i>Invalid format!\n\nRequired: <pre>binRangeLower binRangeUpper userPublicKey</pre>\nExample: <pre>-3 3 YOUR_WALLET_ADDRESS</pre></i>`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    const binRangeLower = parseInt(parts[0]);
    const binRangeUpper = parseInt(parts[1]);
    const userPubKeyStr = parts[2].trim();

    if (
      isNaN(binRangeLower) ||
      isNaN(binRangeUpper) ||
      binRangeLower >= binRangeUpper
    ) {
      await ctx.reply(
        `<i>Invalid bin range. Lower must be less than upper.</i>`,
        {
          parse_mode: 'HTML',
        },
      );
      return;
    }

    let userPub: PublicKey;
    let pair: PublicKey;
    try {
      userPub = new PublicKey(userPubKeyStr);
      pair = new PublicKey(poolAddress);
    } catch {
      await ctx.reply(`<i>Invalid wallet address or pool address.</i>`, {
        parse_mode: 'HTML',
      });
      return;
    }

    await ctx.reply(`<i>Building remove liquidity transaction...</i>`, {
      parse_mode: 'HTML',
    });

    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);
    const pairInfo = await liquidityBookServices.getPairAccount(pair);
    const activeId = pairInfo.activeId;

    const absoluteRangeLower = activeId + binRangeLower;
    const absoluteRangeUpper = activeId + binRangeUpper;

    const positions = await liquidityBookServices.getUserPositions({
      payer: userPub,
      pair,
    });

    if (positions.length === 0) {
      await ctx.reply(`<i>No liquidity positions found in this pool.</i>`, {
        parse_mode: 'HTML',
      });
      return;
    }

    const positionsToRemove = positions.filter((position: PositionInfo) => {
      return !(
        position.upperBinId < absoluteRangeLower ||
        position.lowerBinId > absoluteRangeUpper
      );
    });

    if (positionsToRemove.length === 0) {
      await ctx.reply(
        `<i>No positions found in the specified range [${binRangeLower}, ${binRangeUpper}].\n\nYour positions are in different bins. Use /mypools to check your current positions.</i>`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    const maxPositionList = positionsToRemove.map((position: PositionInfo) => {
      const start =
        absoluteRangeLower > position.lowerBinId
          ? absoluteRangeLower
          : position.lowerBinId;
      const end =
        absoluteRangeUpper < position.upperBinId
          ? absoluteRangeUpper
          : position.upperBinId;

      return {
        position: position.position,
        start,
        end,
        positionMint: position.positionMint,
      };
    });

    const connection = liquidityBookServices.connection;
    const { blockhash } = await connection.getLatestBlockhash();

    const tokenX = new PublicKey(metadata.baseMint);
    const tokenY = new PublicKey(metadata.quoteMint);

    const { txs } = await liquidityBookServices.removeMultipleLiquidity({
      maxPositionList,
      payer: userPub,
      type: RemoveLiquidityType.Both,
      pair,
      tokenMintX: tokenX,
      tokenMintY: tokenY,
      activeId,
    });

    let transactionToSend: Transaction;

    if (txs.length > 0) {
      // @ts-ignore
      transactionToSend = txs[0];
    } else {
      await ctx.reply(`<i>No valid transaction to send.</i>`, {
        parse_mode: 'HTML',
      });
      return;
    }

    transactionToSend.recentBlockhash = blockhash;
    transactionToSend.feePayer = userPub;

    const serialized = transactionToSend.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    const base64Tx = Buffer.from(serialized).toString('base64');

    const userId = ctx.from?.id.toString() || '';
    const chatId = ctx.chat?.id.toString() || '';

    const frontendUrl = process.env.frontendUrl;

    const transactionData = {
      transactions: [
        {
          transaction: base64Tx,
          type: 'remove-liquidty',
        },
      ],
      totalTransactions: 1,
      poolAddress,
      userId: userId,
      chatId: chatId,
    };

    const encodedData = Buffer.from(JSON.stringify(transactionData)).toString(
      'base64',
    );
    const txUrl = `${frontendUrl}/?data=${encodedData}`;

    const message =
      `<i>Remove Liquidity Transaction Built</i>\n\n` +
      `<i>Pool:</i> <pre>${poolAddress}</pre>\n` +
      `<i>Wallet:</i> <pre>${userPubKeyStr}</pre>\n\n` +
      `<i>Details:</i>\n` +
      `<i>Bin Range: [${binRangeLower}, ${binRangeUpper}]</i>\n` +
      `<i>Active Bin: ${activeId}</i>\n` +
      `<i>Absolute Range: [${absoluteRangeLower}, ${absoluteRangeUpper}]</i>\n` +
      `<i>Positions to Remove: ${positionsToRemove.length}</i>`;

    await ctx.reply(message, {
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
              text: 'Back to My Pools',
              callback_data: 'mypools:refresh',
            },
          ],
        ],
      },
    });

    if (!ctx.session) ctx.session = {};
    ctx.session.pendingTransaction = {
      poolAddress,
      userId,
      chatId,
      timestamp: Date.now(),
      type: 'remove_liquidity',
    };
  } catch (err) {
    console.error('Remove liquidity error:', err);
    await ctx.reply(
      `<i>Error building remove liquidity transaction: ${String(
        (err as Error)?.message ?? err,
      )}</i>`,
      { parse_mode: 'HTML' },
    );
  }
}

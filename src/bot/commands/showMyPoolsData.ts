import { MyContext } from '@/types';
import { LiquidityBookServices } from '@saros-finance/dlmm-sdk';
import { PublicKey } from '@solana/web3.js';

export async function showMyPoolsData(
  ctx: MyContext,
  liquidityBookServices: LiquidityBookServices,
) {
  try {
    const poolAddr = ctx.session?.selectedPool;
    const userPubKeyStr = ctx.session?.userPublicKey;

    if (!poolAddr || !userPubKeyStr) {
      await ctx.reply(
        '<i>Session data missing. Please use /mypools command again.</i>',
        { parse_mode: 'HTML' },
      );
      return;
    }

    await ctx.reply('<i>Loading your pool information...</i>', {
      parse_mode: 'HTML',
    });

    const userPub = new PublicKey(userPubKeyStr);
    const pair = new PublicKey(poolAddr);
    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddr);
    const positions = await liquidityBookServices.getUserPositions({
      payer: userPub,
      pair,
    });
    const pairInfo = await liquidityBookServices.getPairAccount(pair);
    const activeBin = pairInfo.activeId;

    const baseDecimals = Number(metadata.extra?.tokenBaseDecimal ?? 9);
    const quoteDecimals = Number(metadata.extra?.tokenQuoteDecimal ?? 9);
    const baseReserve =
      Number(metadata.baseReserve) / Math.pow(10, baseDecimals);
    const quoteReserve =
      Number(metadata.quoteReserve) / Math.pow(10, quoteDecimals);

    let message =
      `<i>Your Pool Details\n\n` +
      `Pool:</i>\n<pre>${poolAddr}</pre>\n` +
      `<i>User:</i>\n<pre>${userPubKeyStr}</pre>\n\n` +
      `<i>Pool Info:\n` +
      `• Base Reserve: ${baseReserve.toLocaleString()} tokens\n` +
      `• Quote Reserve: ${quoteReserve.toLocaleString()} tokens\n` +
      `• Active Bin: ${activeBin}\n` +
      `• Trade Fee: ${metadata.tradeFee}%\n\n`;

    let keyboard = [];

    if (positions.length === 0) {
      message +=
        `Status: No liquidity positions found\n\n` +
        `You haven't added liquidity to this pool yet.</i>`;

      keyboard = [
        [
          {
            text: 'Add Liquidity',
            callback_data: 'liquidity:add',
          },
        ],
        [
          {
            text: 'Refresh',
            callback_data: 'mypools:refresh',
          },
        ],
      ];
    } else {
      message += `Your Positions (${positions.length} found):\n\n`;

      positions.forEach((position, index) => {
        const relativeLower = position.lowerBinId - activeBin;
        const relativeUpper = position.upperBinId - activeBin;
        const isInRange =
          activeBin >= position.lowerBinId && activeBin <= position.upperBinId;
        const status = isInRange ? 'Active' : 'Out of Range';

        message +=
          `Position ${index + 1}: ${status}\n` +
          `• Bin Range: [${position.lowerBinId}, ${position.upperBinId}]\n` +
          `• Relative to Active: [${relativeLower}, ${relativeUpper}]\n` +
          `• Position Mint:</i>\n<pre>${position.positionMint}</pre>\n\n<i>`;
      });

      message += `</i>`;

      keyboard = [
        [
          {
            text: 'Add Liquidity',
            callback_data: 'liquidity:add',
          },
          {
            text: 'Remove Liquidity',
            callback_data: 'liquidity:remove',
          },
        ],
        [
          {
            text: 'Refresh',
            callback_data: 'mypools:refresh',
          },
        ],
      ];
    }

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard },
    });
  } catch (err) {
    console.error('showMyPoolsData error:', err);
    await ctx.reply(
      `<i>Error loading pool data: ${String((err as Error)?.message ?? err)}</i>`,
      { parse_mode: 'HTML' },
    );
  }
}

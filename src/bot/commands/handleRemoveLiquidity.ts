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
    const parts = ctx.message?.text?.trim().split(/\s+/) || [];
    if (parts.length < 3) {
      await ctx.reply(
        `❌ Invalid format!\n\n**Required:** \`binRangeLower binRangeUpper userPublicKey\`\n**Example:** \`-3 3 YOUR_WALLET_ADDRESS\``,
        { parse_mode: 'Markdown' },
      );
      return;
    }

    const binRangeLower = parseInt(parts[0]);
    const binRangeUpper = parseInt(parts[1]);
    const userPubKeyStr = parts[2].trim();

    // Validate inputs
    if (
      isNaN(binRangeLower) ||
      isNaN(binRangeUpper) ||
      binRangeLower >= binRangeUpper
    ) {
      await ctx.reply('❌ Invalid bin range. Lower must be less than upper.');
      return;
    }

    let userPub: PublicKey;
    let pair: PublicKey;
    try {
      userPub = new PublicKey(userPubKeyStr);
      pair = new PublicKey(poolAddress);
    } catch {
      await ctx.reply('❌ Invalid wallet address or pool address.');
      return;
    }

    await ctx.reply('🔄 Building remove liquidity transaction...');

    // Get pool metadata and pair info
    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);
    const pairInfo = await liquidityBookServices.getPairAccount(pair);
    const activeId = pairInfo.activeId;

    // Calculate absolute bin range
    const absoluteRangeLower = activeId + binRangeLower;
    const absoluteRangeUpper = activeId + binRangeUpper;

    // Get user positions
    const positions = await liquidityBookServices.getUserPositions({
      payer: userPub,
      pair,
    });

    if (positions.length === 0) {
      await ctx.reply('❌ No liquidity positions found in this pool.');
      return;
    }

    // Filter positions that overlap with the requested range
    const positionsToRemove = positions.filter((position: PositionInfo) => {
      return !(
        position.upperBinId < absoluteRangeLower ||
        position.lowerBinId > absoluteRangeUpper
      );
    });

    if (positionsToRemove.length === 0) {
      await ctx.reply(
        `❌ No positions found in the specified range [${binRangeLower}, ${binRangeUpper}].\n\n` +
          `Your positions are in different bins. Use /mypools to check your current positions.`,
      );
      return;
    }

    // Prepare position list for removal
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

    // Build remove liquidity transactions
    const tokenX = new PublicKey(metadata.baseMint);
    const tokenY = new PublicKey(metadata.quoteMint);

    const { txs, txCreateAccount, txCloseAccount } =
      await liquidityBookServices.removeMultipleLiquidity({
        maxPositionList,
        payer: userPub,
        type: RemoveLiquidityType.Both, // Remove both tokens
        pair,
        tokenMintX: tokenX,
        tokenMintY: tokenY,
        activeId,
      });

    // For simplicity, we'll send the main removal transaction
    let transactionToSend: Transaction;

    if (txs.length > 0) {
      transactionToSend = txs[0];
    } else {
      await ctx.reply('❌ No valid transaction to send.');
      return;
    }

    // Set transaction properties
    transactionToSend.recentBlockhash = blockhash;
    transactionToSend.feePayer = userPub;

    // Serialize transaction
    const serialized = transactionToSend.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    const base64Tx = Buffer.from(serialized).toString('base64');

    const userId = ctx.from?.id.toString() || '';
    const chatId = ctx.chat?.id.toString() || '';

    // Build frontend URL
    const frontendUrl = 'http://localhost:5173';
    const txParams = new URLSearchParams({
      tx: base64Tx,
      pool: poolAddress,
      userId,
      chatId,
    });
    const txUrl = `${frontendUrl}/?${txParams.toString()}`;

    const message =
      `**Remove Liquidity Transaction Built**\n\n` +
      `**Pool:** \`${poolAddress}\`\n` +
      `**Wallet:** \`${userPubKeyStr}\`\n\n` +
      `**Details:**\n` +
      `• Bin Range: [${binRangeLower}, ${binRangeUpper}]\n` +
      `• Active Bin: ${activeId}\n` +
      `• Absolute Range: [${absoluteRangeLower}, ${absoluteRangeUpper}]\n` +
      `• Positions to Remove: ${positionsToRemove.length}\n\n` +
      `**Transaction URL:**\n\`${txUrl}\``;

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔐 Sign and Send Transaction',
              url: txUrl,
            },
          ],
          [
            {
              text: '🔙 Back to My Pools',
              callback_data: 'mypools:refresh',
            },
          ],
        ],
      },
    });

    // Store pending transaction info
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
      `❌ Error building remove liquidity transaction: ${String((err as Error)?.message ?? err)}`,
    );
  }
}

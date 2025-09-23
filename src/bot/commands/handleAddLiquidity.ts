import type { MyContext } from '@/types';
import { humanToBN } from '@/utils';
import {
  findPosition,
  getBinRange,
  getMaxBinArray,
  getMaxPosition,
  LiquidityShape,
  type LiquidityBookServices,
} from '@saros-finance/dlmm-sdk';
import { PublicKey, Transaction, Keypair } from '@solana/web3.js';

export async function handleAddLiquidityRequest(
  ctx: MyContext,
  poolAddress: string,
  liquidityBookServices: LiquidityBookServices,
) {
  try {
    // @ts-ignore
    const parts = ctx.message?.text?.trim().split(/\s+/) || [];
    if (parts.length < 5) {
      await ctx.reply(
        `<i>Invalid format!\n\nRequired:\n<pre>baseAmount quoteAmount binRangeLower binRangeUpper userPublicKey</pre>\nExample:\n<pre>10 10 -5 5 YOUR_WALLET_ADDRESS</pre></i>`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    const baseAmount = parseFloat(parts[0]);
    const quoteAmount = parseFloat(parts[1]);
    const binRangeLower = parseInt(parts[2]);
    const binRangeUpper = parseInt(parts[3]);
    const userPubKeyStr = parts[4].trim();
    const userPubKey = new PublicKey(userPubKeyStr);

    if (
      isNaN(baseAmount) ||
      isNaN(quoteAmount) ||
      baseAmount <= 0 ||
      quoteAmount <= 0
    ) {
      await ctx.reply('<i>Please provide valid positive amounts.</i>', {
        parse_mode: 'HTML',
      });
      return;
    }
    if (
      isNaN(binRangeLower) ||
      isNaN(binRangeUpper) ||
      binRangeLower >= binRangeUpper
    ) {
      await ctx.reply(
        '<i>Invalid bin range. Lower must be less than upper.</i>',
        { parse_mode: 'HTML' },
      );
      return;
    }

    await ctx.reply('<i>Building add liquidity transaction...</i>', {
      parse_mode: 'HTML',
    });

    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);
    const tokenX = metadata.baseMint;
    const tokenY = metadata.quoteMint;
    const pair = new PublicKey(metadata.poolAddress);
    const shape = LiquidityShape.Spot;
    const binRange = [binRangeLower, binRangeUpper] as [number, number];

    if (
      !metadata.extra?.tokenBaseDecimal ||
      !metadata.extra?.tokenQuoteDecimal
    ) {
      await ctx.reply(
        '<i>Pool metadata is missing required decimal information.</i>',
        { parse_mode: 'HTML' },
      );
      return;
    }

    const positions = await liquidityBookServices.getUserPositions({
      payer: userPubKey,
      pair,
    });
    const pairInfo = await liquidityBookServices.getPairAccount(pair);
    const activeBin = pairInfo.activeId;

    const connection = liquidityBookServices.connection;
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();

    let currentBlockhash = blockhash;
    let currentLastValidBlockHeight = lastValidBlockHeight;

    const maxPositionList = getMaxPosition(
      [binRange[0], binRange[1]],
      activeBin,
    );
    const maxLiqDistribution = createUniformDistribution(binRange);
    const binArrayList = getMaxBinArray(binRange, activeBin);

    const allTxs: Transaction[] = [];
    const createPositionTxs: Transaction[] = [];
    const addLiquidityTxs: Transaction[] = [];
    const initialTransaction = new Transaction();

    await Promise.all(
      binArrayList.map(async (item) => {
        await liquidityBookServices.getBinArray({
          binArrayIndex: item.binArrayLowerIndex,
          pair,
          payer: userPubKey,
          transaction: initialTransaction as any,
        });
        await liquidityBookServices.getBinArray({
          binArrayIndex: item.binArrayUpperIndex,
          pair,
          payer: userPubKey,
          transaction: initialTransaction as any,
        });
      }),
    );

    await Promise.all(
      [tokenX, tokenY].map(async (token) => {
        await liquidityBookServices.getPairVaultInfo({
          payer: userPubKey,
          transaction: initialTransaction as any,
          tokenAddress: new PublicKey(token),
          pair,
        });
        await liquidityBookServices.getUserVaultInfo({
          payer: userPubKey,
          tokenAddress: new PublicKey(token),
          transaction: initialTransaction as any,
        });
      }),
    );

    if (initialTransaction.instructions.length > 0) {
      initialTransaction.recentBlockhash = currentBlockhash;
      initialTransaction.feePayer = userPubKey;
      allTxs.push(initialTransaction);
    }

    const maxLiquidityDistributions = await Promise.all(
      maxPositionList.map(async (item) => {
        const {
          range: relativeBinRange,
          binLower,
          binUpper,
        } = getBinRange(item, activeBin);
        const currentPosition = positions.find(findPosition(item, activeBin));

        if (
          !relativeBinRange ||
          binLower === undefined ||
          binUpper === undefined
        ) {
          throw new Error(
            `Invalid bin range for position: ${JSON.stringify(item)}`,
          );
        }

        const rangeLower = relativeBinRange[0]!;
        const rangeUpper = relativeBinRange[1]!;
        const liquidityDistribution = maxLiqDistribution.filter(
          (li) =>
            li.relativeBinId >= rangeLower && li.relativeBinId <= rangeUpper,
        );

        const binArray = binArrayList.find(
          (ba) =>
            ba.binArrayLowerIndex * 256 <= binLower &&
            (ba.binArrayUpperIndex + 1) * 256 > binUpper,
        );

        if (!binArray) {
          throw new Error(
            `No bin array found for range [${binLower}, ${binUpper}]`,
          );
        }

        const binArrayLower = await liquidityBookServices.getBinArray({
          binArrayIndex: binArray.binArrayLowerIndex,
          pair,
          payer: userPubKey,
        });
        const binArrayUpper = await liquidityBookServices.getBinArray({
          binArrayIndex: binArray.binArrayUpperIndex,
          pair,
          payer: userPubKey,
        });

        if (!currentPosition) {
          const createPositionTx = new Transaction();
          const positionMint = Keypair.generate();

          await liquidityBookServices.createPosition({
            pair,
            payer: userPubKey,
            relativeBinIdLeft: rangeLower,
            relativeBinIdRight: rangeUpper,
            binArrayIndex: binArray.binArrayLowerIndex,
            positionMint: positionMint.publicKey,
            transaction: createPositionTx as any,
          });

          createPositionTx.feePayer = userPubKey;
          createPositionTx.recentBlockhash = currentBlockhash;

          createPositionTxs.push(createPositionTx);

          return {
            positionMint: positionMint.publicKey.toString(),
            liquidityDistribution,
            binArrayLower: binArrayLower.toString(),
            binArrayUpper: binArrayUpper.toString(),
            needsPositionCreation: true,
          };
        }

        return {
          positionMint: currentPosition.positionMint,
          liquidityDistribution,
          binArrayLower: binArrayLower.toString(),
          binArrayUpper: binArrayUpper.toString(),
          needsPositionCreation: false,
        };
      }),
    );

    await Promise.all(
      maxLiquidityDistributions.map(async (item) => {
        const {
          binArrayLower,
          binArrayUpper,
          liquidityDistribution,
          positionMint,
        } = item;
        const addLiquidityTx = new Transaction();

        await liquidityBookServices.addLiquidityIntoPosition({
          amountX: humanToBN(
            baseAmount.toString(),
            metadata.extra.tokenBaseDecimal,
          ),
          amountY: humanToBN(
            quoteAmount.toString(),
            metadata.extra.tokenQuoteDecimal,
          ),
          binArrayLower: new PublicKey(binArrayLower),
          binArrayUpper: new PublicKey(binArrayUpper),
          liquidityDistribution,
          pair,
          positionMint: new PublicKey(positionMint),
          payer: userPubKey,
          transaction: addLiquidityTx as any,
        });

        addLiquidityTx.recentBlockhash = currentBlockhash;
        addLiquidityTx.feePayer = userPubKey;
        addLiquidityTxs.push(addLiquidityTx);
      }),
    );

    const serializedInitialTxs = allTxs.map((tx) =>
      tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
    );
    const serializedCreatePositionTxs = createPositionTxs.map((tx) =>
      tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
    );
    const serializedAddLiquidityTxs = addLiquidityTxs.map((tx) =>
      tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
    );

    const base64InitialTxs = serializedInitialTxs.map((s) =>
      Buffer.from(s).toString('base64'),
    );
    const base64CreatePositionTxs = serializedCreatePositionTxs.map((s) =>
      Buffer.from(s).toString('base64'),
    );
    const base64AddLiquidityTxs = serializedAddLiquidityTxs.map((s) =>
      Buffer.from(s).toString('base64'),
    );

    const userId = ctx.from?.id.toString() || '';
    const chatId = ctx.chat?.id.toString() || '';
    const frontendUrl = process.env.frontendUrl;

    let firstTx = '';
    let txType = '';

    if (base64InitialTxs.length > 0) {
      firstTx = base64InitialTxs[0]!;
      txType = 'initial';
    } else if (base64CreatePositionTxs.length > 0) {
      firstTx = base64CreatePositionTxs[0]!;
      txType = 'createPosition';
    } else if (base64AddLiquidityTxs.length > 0) {
      firstTx = base64AddLiquidityTxs[0]!;
      txType = 'addLiquidity';
    } else {
      throw new Error('No transactions were generated');
    }

    const txParams = new URLSearchParams({
      tx: firstTx,
      pool: poolAddress,
      userId,
      chatId,
      txType,
      totalTxs: (
        base64InitialTxs.length +
        base64CreatePositionTxs.length +
        base64AddLiquidityTxs.length
      ).toString(),
    });
    const txUrl = `${frontendUrl}/?${txParams.toString()}`;

    const message =
      `<i>Add Liquidity Transaction Built\n\n` +
      `Pool: <pre>${poolAddress}</pre>\n` +
      `Wallet: <pre>${userPubKeyStr}</pre>\n\n` +
      `Amounts: ${baseAmount} base + ${quoteAmount} quote\n` +
      `Range: [${binRangeLower}, ${binRangeUpper}] (Active: ${activeBin})\n` +
      `Transactions: ${allTxs.length} tx${allTxs.length > 1 ? 's' : ''} ready\n\n</i>`;

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Pay for Transaction',
              url: txUrl,
            },
          ],
          [{ text: 'Back to My Pools', callback_data: 'mypools:refresh' }],
        ],
      },
    });

    if (!ctx.session) ctx.session = {};
    ctx.session.pendingTransaction = {
      poolAddress,
      userId,
      chatId,
      timestamp: Date.now(),
      type: 'add_liquidity',
    };
  } catch (err) {
    console.error('Add liquidity error:', err);
    await ctx.reply(
      `<i>Error building add liquidity transaction: ${String(
        (err as Error)?.message ?? err,
      )}</i>`,
      { parse_mode: 'HTML' },
    );
  }
}

function createUniformDistribution(relativeRange: [number, number]) {
  const distribution = [];
  const totalBins = relativeRange[1] - relativeRange[0] + 1;
  const perBin = 100 / totalBins;

  for (let i = relativeRange[0]; i <= relativeRange[1]; i++) {
    distribution.push({
      relativeBinId: i,
      distributionX: perBin,
      distributionY: perBin,
    });
  }
  return distribution;
}

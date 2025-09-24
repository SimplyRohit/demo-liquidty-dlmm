// import type { MyContext } from '@/types';
// import { humanToBN } from '@/utils';
// import {
//   createUniformDistribution,
//   findPosition,
//   getBinRange,
//   getMaxBinArray,
//   getMaxPosition,
//   LiquidityShape,
//   type LiquidityBookServices,
// } from '@saros-finance/dlmm-sdk';
// import { PublicKey, Transaction, Keypair } from '@solana/web3.js';
// import bs58 from 'bs58';

// interface TransactionBundle {
//   transaction: string;
//   type: 'initial' | 'createPosition' | 'addLiquidity';
//   requiredSigners?: string[];
// }

// export async function handleAddLiquidityRequest(
//   ctx: MyContext,
//   poolAddress: string,
//   liquidityBookServices: LiquidityBookServices,
// ) {
//   try {
//     const parts = ctx.message?.text?.trim().split(/\s+/) || [];
//     if (parts.length < 5) {
//       await ctx.reply(
//         `<i>Invalid format!</i>\n\n<b>Required:</b> <code>baseAmount quoteAmount binRangeLower binRangeUpper userPublicKey</code>\n<b>Example:</b> <code>10 10 -5 5 YOUR_WALLET_ADDRESS</code>`,
//         { parse_mode: 'HTML' },
//       );
//       return;
//     }

//     const baseAmount = parseFloat(parts[0]);
//     const quoteAmount = parseFloat(parts[1]);
//     const binRangeLower = parseInt(parts[2]);
//     const binRangeUpper = parseInt(parts[3]);
//     const userPubKeyStr = parts[4].trim();
//     const userPubKey = new PublicKey(userPubKeyStr);

//     if (
//       isNaN(baseAmount) ||
//       isNaN(quoteAmount) ||
//       baseAmount <= 0 ||
//       quoteAmount <= 0
//     ) {
//       await ctx.reply('<i>Please provide valid positive amounts.</i>', {
//         parse_mode: 'HTML',
//       });
//       return;
//     }
//     if (
//       isNaN(binRangeLower) ||
//       isNaN(binRangeUpper) ||
//       binRangeLower >= binRangeUpper
//     ) {
//       await ctx.reply(
//         '<i>Invalid bin range. Lower must be less than upper.</i>',
//         { parse_mode: 'HTML' },
//       );
//       return;
//     }

//     await ctx.reply('<i>Building add liquidity transaction...</i>', {
//       parse_mode: 'HTML',
//     });

//     const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);
//     const tokenX = metadata.baseMint;
//     const tokenY = metadata.quoteMint;
//     const pair = new PublicKey(metadata.poolAddress);
//     const shape = LiquidityShape.Spot;
//     const binRange = [binRangeLower, binRangeUpper] as [number, number];

//     if (
//       !metadata.extra?.tokenBaseDecimal ||
//       !metadata.extra?.tokenQuoteDecimal
//     ) {
//       await ctx.reply(
//         '<i>Pool metadata is missing required decimal information.</i>',
//         { parse_mode: 'HTML' },
//       );
//       return;
//     }

//     const positions = await liquidityBookServices.getUserPositions({
//       payer: userPubKey,
//       pair,
//     });
//     const pairInfo = await liquidityBookServices.getPairAccount(pair);
//     const activeBin = pairInfo.activeId;

//     const connection = liquidityBookServices.connection;
//     const { blockhash, lastValidBlockHeight } =
//       await connection.getLatestBlockhash();

//     let currentBlockhash = blockhash;
//     let currentLastValidBlockHeight = lastValidBlockHeight;

//     const maxPositionList = getMaxPosition(
//       [binRange[0], binRange[1]],
//       activeBin,
//     );
//     const maxLiqDistribution = createUniformDistribution({ shape, binRange });
//     const binArrayList = getMaxBinArray(binRange, activeBin);

//     const allTxs: Transaction[] = [];
//     const txsCreatePosition: Transaction[] = [];
//     const transactionBundles: TransactionBundle[] = [];
//     const generatedKeypairs: { [key: string]: string } = {};

//     const initialTransaction = new Transaction();

//     await Promise.all(
//       binArrayList.map(async (item) => {
//         await liquidityBookServices.getBinArray({
//           binArrayIndex: item.binArrayLowerIndex,
//           pair,
//           payer: userPubKey,
//           transaction: initialTransaction as any,
//         });
//         await liquidityBookServices.getBinArray({
//           binArrayIndex: item.binArrayUpperIndex,
//           pair,
//           payer: userPubKey,
//           transaction: initialTransaction as any,
//         });
//       }),
//     );

//     await Promise.all(
//       [tokenX, tokenY].map(async (token) => {
//         await liquidityBookServices.getPairVaultInfo({
//           payer: userPubKey,
//           transaction: initialTransaction as any,
//           tokenAddress: new PublicKey(token),
//           pair,
//         });
//         await liquidityBookServices.getUserVaultInfo({
//           payer: userPubKey,
//           tokenAddress: new PublicKey(token),
//           transaction: initialTransaction as any,
//         });
//       }),
//     );

//     if (initialTransaction.instructions.length > 0) {
//       initialTransaction.recentBlockhash = currentBlockhash;
//       initialTransaction.feePayer = userPubKey;
//       allTxs.push(initialTransaction);

//       const serialized = initialTransaction.serialize({
//         requireAllSignatures: false,
//         verifySignatures: false,
//       });

//       transactionBundles.push({
//         transaction: Buffer.from(serialized).toString('base64'),
//         type: 'initial',
//       });
//     }

//     const maxLiquidityDistributions = await Promise.all(
//       maxPositionList.map(async (item) => {
//         const {
//           range: relativeBinRange,
//           binLower,
//           binUpper,
//         } = getBinRange(item, activeBin);
//         const currentPosition = positions.find(findPosition(item, activeBin));

//         if (
//           !relativeBinRange ||
//           binLower === undefined ||
//           binUpper === undefined
//         ) {
//           throw new Error(
//             `Invalid bin range for position: ${JSON.stringify(item)}`,
//           );
//         }

//         const rangeLower = relativeBinRange[0]!;
//         const rangeUpper = relativeBinRange[1]!;

//         // Fix: Use the same approach as the working example
//         const findStartIndex = maxLiqDistribution.findIndex(
//           (item) => item.relativeBinId === rangeLower,
//         );
//         const startIndex = findStartIndex === -1 ? 0 : findStartIndex;

//         const findEndIndex = maxLiqDistribution.findIndex(
//           (item) => item.relativeBinId === rangeUpper,
//         );
//         const endIndex =
//           findEndIndex === -1 ? maxLiqDistribution.length : findEndIndex + 1;

//         const liquidityDistribution = maxLiqDistribution.slice(
//           startIndex,
//           endIndex,
//         );

//         const binArray = binArrayList.find(
//           (ba) =>
//             ba.binArrayLowerIndex * 256 <= binLower &&
//             (ba.binArrayUpperIndex + 1) * 256 > binUpper,
//         );

//         if (!binArray) {
//           throw new Error(
//             `No bin array found for range [${binLower}, ${binUpper}]`,
//           );
//         }

//         const binArrayLower = await liquidityBookServices.getBinArray({
//           binArrayIndex: binArray.binArrayLowerIndex,
//           pair,
//           payer: userPubKey,
//         });
//         const binArrayUpper = await liquidityBookServices.getBinArray({
//           binArrayIndex: binArray.binArrayUpperIndex,
//           pair,
//           payer: userPubKey,
//         });

//         if (!currentPosition) {
//           const createPositionTx = new Transaction();
//           const positionMint = Keypair.generate();
//           const positionPrivateKey = bs58.encode(positionMint.secretKey);

//           // Store generated keypair
//           generatedKeypairs[positionMint.publicKey.toString()] =
//             positionPrivateKey;

//           await liquidityBookServices.createPosition({
//             pair,
//             payer: userPubKey,
//             relativeBinIdLeft: rangeLower,
//             relativeBinIdRight: rangeUpper,
//             binArrayIndex: binArray.binArrayLowerIndex,
//             positionMint: positionMint.publicKey,
//             transaction: createPositionTx as any,
//           });

//           createPositionTx.feePayer = userPubKey;
//           createPositionTx.recentBlockhash = currentBlockhash;

//           txsCreatePosition.push(createPositionTx);
//           allTxs.push(createPositionTx);

//           const createPositionSerialized = createPositionTx.serialize({
//             requireAllSignatures: false,
//             verifySignatures: false,
//           });

//           transactionBundles.push({
//             transaction: Buffer.from(createPositionSerialized).toString(
//               'base64',
//             ),
//             type: 'createPosition',
//             requiredSigners: [positionPrivateKey],
//           });

//           return {
//             positionMint: positionMint.publicKey.toString(),
//             liquidityDistribution,
//             binArrayLower: binArrayLower.toString(),
//             binArrayUpper: binArrayUpper.toString(),
//             needsPositionCreation: true,
//           };
//         }

//         return {
//           positionMint: currentPosition.positionMint,
//           liquidityDistribution,
//           binArrayLower: binArrayLower.toString(),
//           binArrayUpper: binArrayUpper.toString(),
//           needsPositionCreation: false,
//         };
//       }),
//     );

//     await Promise.all(
//       maxLiquidityDistributions.map(async (item) => {
//         const {
//           binArrayLower,
//           binArrayUpper,
//           liquidityDistribution,
//           positionMint,
//         } = item;
//         const addLiquidityTx = new Transaction();

//         await liquidityBookServices.addLiquidityIntoPosition({
//           amountX: humanToBN(
//             baseAmount.toString(),
//             metadata.extra.tokenBaseDecimal,
//           ),
//           amountY: humanToBN(
//             quoteAmount.toString(),
//             metadata.extra.tokenQuoteDecimal,
//           ),
//           binArrayLower: new PublicKey(binArrayLower),
//           binArrayUpper: new PublicKey(binArrayUpper),
//           liquidityDistribution,
//           pair,
//           positionMint: new PublicKey(positionMint),
//           payer: userPubKey,
//           transaction: addLiquidityTx as any,
//         });

//         addLiquidityTx.recentBlockhash = currentBlockhash;
//         addLiquidityTx.feePayer = userPubKey;
//         allTxs.push(addLiquidityTx);

//         const addLiquiditySerialized = addLiquidityTx.serialize({
//           requireAllSignatures: false,
//           verifySignatures: false,
//         });

//         transactionBundles.push({
//           transaction: Buffer.from(addLiquiditySerialized).toString('base64'),
//           type: 'addLiquidity',
//         });
//       }),
//     );

//     // Prepare transaction data for frontend
//     const userId = ctx.from?.id.toString() || '';
//     const chatId = ctx.chat?.id.toString() || '';
//     const frontendUrl = process.env.frontendUrl || 'http://localhost:3001';

//     const transactionData = {
//       transactions: transactionBundles,
//       generatedKeypairs,
//       poolAddress,
//       userId,
//       chatId,
//       metadata: {
//         baseAmount,
//         quoteAmount,
//         binRange,
//         activeBin,
//         totalTransactions: transactionBundles.length,
//         hasExistingPosition: false,
//       },
//     };

//     const encodedData = Buffer.from(JSON.stringify(transactionData)).toString(
//       'base64',
//     );
//     const txUrl = `${frontendUrl}/?data=${encodedData}`;

//     const message =
//       `<i>Add Liquidity Transaction Built</i>\n\n` +
//       `<i>Pool:</i> <code>${poolAddress.slice(0, 8)}...${poolAddress.slice(-8)}</code>\n` +
//       `<i>Wallet:</i> <code>${userPubKeyStr.slice(0, 8)}...${userPubKeyStr.slice(-8)}</code>\n\n` +
//       `<i>Amounts:</i> ${baseAmount} base + ${quoteAmount} quote\n` +
//       `<i>Range:</i> [${binRangeLower}, ${binRangeUpper}] (Active: ${activeBin})\n` +
//       `<i>Status:</i> Creating new position and adding liquidity\n` +
//       `<i>Transactions:</i> ${transactionBundles.length} transaction${transactionBundles.length > 1 ? 's' : ''} ready`;

//     await ctx.reply(message, {
//       parse_mode: 'HTML',
//       reply_markup: {
//         inline_keyboard: [
//           [
//             {
//               text: 'Pay for Transaction',
//               url: txUrl,
//             },
//           ],
//           [{ text: 'Back to My Pools', callback_data: 'mypools:refresh' }],
//         ],
//       },
//     });

//     if (!ctx.session) ctx.session = {};
//     ctx.session.pendingTransaction = {
//       poolAddress,
//       userId,
//       chatId,
//       timestamp: Date.now(),
//       type: 'add_liquidity',
//     };
//   } catch (err) {
//     console.error('Add liquidity error:', err);
//     await ctx.reply(
//       `<i>Error building add liquidity transaction: ${String((err as Error)?.message ?? err)}</i>`,
//       { parse_mode: 'HTML' },
//     );
//   }
// }

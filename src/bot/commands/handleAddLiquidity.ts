import type { MyContext } from "@/types";
import { convertBalanceToWei, humanToBN } from "@/utils";
import { BN} from "@coral-xyz/anchor";
import {
  findPosition,
  getBinRange,
  getMaxBinArray,
  getMaxPosition,
  LiquidityShape,
  type LiquidityBookServices,
} from "@saros-finance/dlmm-sdk";
import { PublicKey, Transaction, Keypair } from "@solana/web3.js";

export async function handleAddLiquidityRequest(
  ctx: MyContext,
  poolAddress: string,
  liquidityBookServices: LiquidityBookServices
) {
  try {
    // @ts-ignore
    const parts = ctx.message?.text?.trim().split(/\s+/) || [];
    if (parts.length < 5) {
      await ctx.reply(
        `❌ Invalid format!\n\n**Required:** \`baseAmount quoteAmount binRangeLower binRangeUpper userPublicKey\`\n**Example:** \`10 10 -5 5 YOUR_WALLET_ADDRESS\``,
        { parse_mode: "Markdown" }
      );
      return;
    }

    const baseAmount = parseFloat(parts[0]);
    const quoteAmount = parseFloat(parts[1]);
    const binRangeLower = parseInt(parts[2]);
    const binRangeUpper = parseInt(parts[3]);
    const userPubKeyStr = parts[4].trim();
    const userPubKey = new PublicKey(userPubKeyStr);

    if (isNaN(baseAmount) || isNaN(quoteAmount) || baseAmount <= 0 || quoteAmount <= 0) {
      await ctx.reply("❌ Please provide valid positive amounts.");
      return;
    }
    if (isNaN(binRangeLower) || isNaN(binRangeUpper) || binRangeLower >= binRangeUpper) {
      await ctx.reply("❌ Invalid bin range. Lower must be less than upper.");
      return;
    }

    await ctx.reply("🔄 Building add liquidity transaction...");

    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);
    const tokenX = metadata.baseMint;
    const tokenY = metadata.quoteMint;
    const pair = new PublicKey(metadata.poolAddress);
    const shape = LiquidityShape.Spot;
    const binRange = [binRangeLower, binRangeUpper] as [number, number];

    // Validate metadata has required properties
    if (!metadata.extra?.tokenBaseDecimal || !metadata.extra?.tokenQuoteDecimal) {
      await ctx.reply("❌ Pool metadata is missing required decimal information.");
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

    const maxPositionList = getMaxPosition([binRange[0], binRange[1]], activeBin);
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
      })
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
      })
    );

    if (initialTransaction.instructions.length > 0) {
      initialTransaction.recentBlockhash = currentBlockhash;
      initialTransaction.feePayer = userPubKey;
      allTxs.push(initialTransaction);
    }

    const maxLiquidityDistributions = await Promise.all(
      maxPositionList.map(async (item) => {
        const { range: relativeBinRange, binLower, binUpper } = getBinRange(item, activeBin);
        const currentPosition = positions.find(findPosition(item, activeBin));

        if (!relativeBinRange || binLower === undefined || binUpper === undefined) {
          throw new Error(`Invalid bin range for position: ${JSON.stringify(item)}`);
        }

        const rangeLower = relativeBinRange[0]!;
        const rangeUpper = relativeBinRange[1]!;
        const liquidityDistribution = maxLiqDistribution.filter(
          (li) =>
            li.relativeBinId >= rangeLower &&
            li.relativeBinId <= rangeUpper
        );

        const binArray = binArrayList.find(
          (ba) =>
            ba.binArrayLowerIndex * 256 <= binLower &&
            (ba.binArrayUpperIndex + 1) * 256 > binUpper
        );
        
        if (!binArray) {
          throw new Error(`No bin array found for range [${binLower}, ${binUpper}]`);
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
      })
    );

    await Promise.all(
      maxLiquidityDistributions.map(async (item) => {
        const { binArrayLower, binArrayUpper, liquidityDistribution, positionMint, needsPositionCreation } = item;
        const addLiquidityTx = new Transaction();

        await liquidityBookServices.addLiquidityIntoPosition({
          amountX: humanToBN(baseAmount.toString(), metadata.extra.tokenBaseDecimal),
          amountY: humanToBN(quoteAmount.toString(), metadata.extra.tokenQuoteDecimal),
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
      })
    );

    // Serialize all transaction types
    const serializedInitialTxs = allTxs.map((tx) =>
      tx.serialize({ requireAllSignatures: false, verifySignatures: false })
    );
    const serializedCreatePositionTxs = createPositionTxs.map((tx) =>
      tx.serialize({ requireAllSignatures: false, verifySignatures: false })
    );
    const serializedAddLiquidityTxs = addLiquidityTxs.map((tx) =>
      tx.serialize({ requireAllSignatures: false, verifySignatures: false })
    );

    const base64InitialTxs = serializedInitialTxs.map((s) => Buffer.from(s).toString("base64"));
    const base64CreatePositionTxs = serializedCreatePositionTxs.map((s) => Buffer.from(s).toString("base64"));
    const base64AddLiquidityTxs = serializedAddLiquidityTxs.map((s) => Buffer.from(s).toString("base64"));

    const userId = ctx.from?.id.toString() || "";
    const chatId = ctx.chat?.id.toString() || "";
    const frontendUrl = "http://localhost:3001";
    
    // Determine which transaction to send first
    let firstTx = "";
    let txType = "";
    
    if (base64InitialTxs.length > 0) {
      firstTx = base64InitialTxs[0];
      txType = "initial";
    } else if (base64CreatePositionTxs.length > 0) {
      firstTx = base64CreatePositionTxs[0];
      txType = "createPosition";
    } else if (base64AddLiquidityTxs.length > 0) {
      firstTx = base64AddLiquidityTxs[0];
      txType = "addLiquidity";
    } else {
      throw new Error("No transactions were generated");
    }
    
    const txParams = new URLSearchParams({
      tx: firstTx,
      pool: poolAddress,
      userId,
      chatId,
      txType,
      totalTxs: (base64InitialTxs.length + base64CreatePositionTxs.length + base64AddLiquidityTxs.length).toString(),
    });
    const txUrl = `${frontendUrl}/?${txParams.toString()}`;

    const message =
      `✅ **Add Liquidity Transaction Built**\n\n` +
      `**Pool:** \`${poolAddress.slice(0, 8)}...${poolAddress.slice(-8)}\`\n` +
      `**Wallet:** \`${userPubKeyStr.slice(0, 8)}...${userPubKeyStr.slice(-8)}\`\n\n` +
      `**Amounts:** ${baseAmount} base + ${quoteAmount} quote\n` +
      `**Range:** [${binRangeLower}, ${binRangeUpper}] (Active: ${activeBin})\n` +
      `**Transactions:** ${allTxs.length} tx${allTxs.length > 1 ? 's' : ''} ready\n\n` +
      `**Transaction URL:**\n\`${txUrl}\``;

    await ctx.reply(message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "🔙 Back to My Pools", callback_data: "mypools:refresh" }]],
      },
    });

    if (!ctx.session) ctx.session = {};
    ctx.session.pendingTransaction = {
      poolAddress,
      userId,
      chatId,
      timestamp: Date.now(),
      type: "add_liquidity",
    };
  } catch (err) {
    console.error("Add liquidity error:", err);
    await ctx.reply(
      `❌ Error building add liquidity transaction: ${String((err as Error)?.message ?? err)}`
    );
  }
}

function createUniformDistribution(binRange: [number, number]) {
  const distribution = [];
  const totalBins = binRange[1] - binRange[0] + 1;
  const distributionPerBin = 100 / totalBins; // equal %
  for (let i = binRange[0]; i <= binRange[1]; i++) {
    distribution.push({ 
      relativeBinId: i, 
      distributionX: distributionPerBin,
      distributionY: distributionPerBin
    });
  }
  return distribution;
}

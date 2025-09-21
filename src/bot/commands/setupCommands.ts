import { Telegraf } from "telegraf";
import { PublicKey } from "@solana/web3.js";
import { BIN_STEP_CONFIGS, type LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import { PoolController } from "../controllers/PoolController";
import { startQuoteProcess } from "./startQuoteProcess";
import { startSwapProcess } from "./startSwapProcess";
import { handleSwapRequest } from "./handleSwapRequest";
import { handleQuoteRequest } from "./handleQuoteRequest";
import type { MyContext } from "@/types";
import { handleRemoveLiquidityRequest } from "./handleRemoveLiquidity";
import { handleAddLiquidityRequest } from "./handleAddLiquidity";

export function setupCommands(
  bot: Telegraf<MyContext>,
  liquidityBookServices: LiquidityBookServices
) {
  const poolController = new PoolController(liquidityBookServices);


  bot.command("pools", async (ctx) => {

    try {
      const userId = ctx.from?.id.toString() || "unknown";
      if (!poolController.checkRateLimit(userId)) {
        await ctx.reply(
          "⚠️ Rate limit exceeded. Please wait a moment before trying again."
        );
        return;
      }

      if (!ctx.session) ctx.session = {};
      if (!ctx.session.markets || ctx.session.markets.length === 0) {
        await ctx.reply("🔄 Fetching pools from Saros DLMM...");
        ctx.session.markets = await liquidityBookServices.fetchPoolAddresses();
        ctx.session.lastFetchedAt = Date.now();
        ctx.session.currentPage = 1;
      }

      await poolController.showPoolList(ctx, ctx.session.currentPage ?? 1);
    } catch (err) {
      console.error("/pools error", err);
      await ctx.reply(
        `❌ Error fetching pools: ${String((err as Error)?.message ?? err)}`
      );
    }
  });

  bot.command("pool", async (ctx) => {
    try {
      const userId = ctx.from?.id.toString() || "unknown";

      if (!poolController.checkRateLimit(userId)) {
        await ctx.reply(
          "⚠️ Rate limit exceeded. Please wait a moment before trying again."
        );
        return;
      }

      const parts = (ctx.message?.text ?? "").trim().split(/\s+/);
      if (parts.length < 2) {
        await ctx.reply(
          "❌ **Usage:** `/pool <poolAddress>`\n\n" +
            "**Example:** `/pool 9P3N4QxjMumpTNNdvaNNskXu2t7VHMMXtePQB72kkSAk`\n\n" +
            "💡 Use `/pools` to see all available pools first.",
          { parse_mode: "Markdown" }
        );
        return;
      }

      const poolAddress = parts[1]!.trim();

      try {
        new PublicKey(poolAddress);
      } catch {
        await ctx.reply("❌ Invalid pool address format provided.");
        return;
      }

      await poolController.showPoolDetails(ctx, poolAddress, "direct");
    } catch (err) {
      console.error("/pool error", err);
      await ctx.reply(
        `❌ Error fetching pool details: ${String((err as Error)?.message ?? err)}`
      );
    }
  });


  bot.command("createpool", async (ctx) => {
    try {
      const parts = (ctx.message?.text ?? "").trim().split(/\s+/);
      if (parts.length < 7) {
        await ctx.reply(
          "Usage: /createpool <tokenXMint> <tokenYMint> <tokenXDecimals> <tokenYDecimals> <ratePrice> <payerPublicKey> [binStep]\n" +
            "Example: /createpool EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v So11111111111111111111111111111111111111112 6 9 1.0 YOUR_WALLET_ADDRESS 25\n\n" +
            "Available bin steps: " +
            BIN_STEP_CONFIGS.map((c) => c.binStep).join(", ")
        );
        return;
      }

      const connection = liquidityBookServices.connection;
      // @ts-ignore krde bhai ignoreeee
      const tokenXMint = parts[1].trim();
      // @ts-ignore krde bhai ignoreeee
      const tokenYMint = parts[2].trim();
      // @ts-ignore krde bhai ignoreeee
      const tokenXDecimals = parseInt(parts[3]);
      // @ts-ignore krde bhai ignoreeee
      const tokenYDecimals = parseInt(parts[4]);
      // @ts-ignore krde bhai ignoreeee
      const ratePrice = parseFloat(parts[5]);
      // @ts-ignore krde bhai ignoreeee

      const payerPublicKeyStr = parts[6].trim();
      const binStep = parts[7] ? parseInt(parts[7]) : 25;

      // Validate token mint addresses
      let tokenXPubKey: PublicKey;
      let tokenYPubKey: PublicKey;
      let payerPubKey: PublicKey;

      try {
        tokenXPubKey = new PublicKey(tokenXMint);
        tokenYPubKey = new PublicKey(tokenYMint);
        payerPubKey = new PublicKey(payerPublicKeyStr);
      } catch {
        await ctx.reply(
          "❌ Invalid token mint addresses or payer public key provided."
        );
        return;
      }

      if (isNaN(tokenXDecimals) || isNaN(tokenYDecimals) || isNaN(ratePrice)) {
        await ctx.reply("❌ Invalid decimals or rate price provided.");
        return;
      }

      if (tokenXDecimals < 0 || tokenYDecimals < 0 || ratePrice <= 0) {
        await ctx.reply(
          "❌ Decimals must be non-negative and rate price must be positive."
        );
        return;
      }

      const validBinStep = BIN_STEP_CONFIGS.find((c) => c.binStep === binStep);
      if (!validBinStep) {
        await ctx.reply(
          `❌ Invalid bin step. Valid options: ${BIN_STEP_CONFIGS.map((c) => c.binStep).join(", ")}`
        );
        return;
      }

      if (tokenXMint === tokenYMint) {
        await ctx.reply("❌ Token X and Token Y cannot be the same.");
        return;
      }

      await ctx.reply("🔄 Creating pool transaction...");

      try {
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash({
            commitment: "confirmed",
          });

        const { tx } = await liquidityBookServices.createPairWithConfig({
          tokenBase: {
            mintAddress: tokenXMint,
            decimal: tokenXDecimals,
          },
          tokenQuote: {
            mintAddress: tokenYMint,
            decimal: tokenYDecimals,
          },
          ratePrice,
          binStep,
          payer: payerPubKey,
        });

        tx.recentBlockhash = blockhash;
        tx.feePayer = payerPubKey;

        const serialized = tx.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        });
        const base64Tx = Buffer.from(serialized).toString("base64");

        const userId = ctx.from?.id.toString() || "";
        const chatId = ctx.chat?.id.toString() || "";
        const poolIndex = ctx.session?.selectedPoolIndex ?? -1;

        if (!ctx.session) ctx.session = {};
        // @ts-ignore ignoree krde bhaai
        ctx.session.pendingTransaction = {
          poolAddress: payerPublicKeyStr,
          poolIndex,
          userId: ctx.from?.id.toString() || "",
          chatId: ctx.chat?.id.toString() || "",
          timestamp: Date.now(),
        };

        const frontendUrl = "http://localhost:5173";
        const txParams = new URLSearchParams({
          tx: base64Tx,
          pool: payerPublicKeyStr,
          userId: userId,
          chatId: chatId,
        });

        const txUrl = `${frontendUrl}/?${txParams.toString()}`;

        let tokenXSymbol = "TOKEN_X";
        let tokenYSymbol = "TOKEN_Y";

        const successMessage =
          `**Pool Creation Transaction Built Successfully!**\n\n` +
          `**Pool Configuration:**\n` +
          `• Pair: ${tokenXSymbol}-${tokenYSymbol}\n` +
          `• Token X: \`${tokenXMint}\` (${tokenXDecimals} decimals)\n` +
          `• Token Y: \`${tokenYMint}\` (${tokenYDecimals} decimals)\n` +
          `• Rate Price: ${ratePrice}\n` +
          `• Bin Step: ${binStep}\n` +
          // @ts-ignore krde bhai ignoreeee

          `• Fee Rate: ${validBinStep.feeRate}%\n\n` +
          `**Transaction Details:**\n` +
          `• Payer: \`${payerPublicKeyStr}\`\n` +
          `• Blockhash: \`${blockhash}\`\n\n` +
          `**Unsigned Transaction (Base64):**\n` +
          `Transaction URL: \n\`${txUrl})\`\n\n`;

        await ctx.reply(successMessage, {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Copy Transaction",
                  url: `https://solscan.io/tx/${base64Tx}`,
                },
              ],
            ],
          },
        });
      } catch (error) {
        console.error("Pool creation error:", error);

        let errorMessage = "❌ Error creating pool transaction: ";
        // @ts-ignore krde bhai ignoreeee

        if (error.message?.includes("already exists")) {
          errorMessage += "A pool with these parameters already exists.";
          // @ts-ignore krde bhai ignoreeee
        } else if (error.message?.includes("insufficient")) {
          errorMessage += "Insufficient balance for transaction fees.";
          // @ts-ignore krde bhai ignoreeee
        } else if (error.message?.includes("invalid")) {
          errorMessage += "Invalid pool parameters provided.";
        } else {
          errorMessage += String((error as Error)?.message ?? error);
        }

        await ctx.reply(errorMessage);
      }
    } catch (err) {
      console.error("/createpool error", err);
      await ctx.reply(
        `❌ Error processing create pool command: ${String((err as Error)?.message ?? err)}`
      );
    }
  });


  async function showMyPoolsData(ctx: MyContext, liquidityBookServices: LiquidityBookServices) {
  try {
    const poolAddr = ctx.session?.selectedPool;
    const userPubKeyStr = ctx.session?.userPublicKey;

    if (!poolAddr || !userPubKeyStr) {
      await ctx.reply("❌ Session data missing. Please use /mypools command again.");
      return;
    }

    await ctx.reply("🔄 Loading your pool information...");

    const userPub = new PublicKey(userPubKeyStr);
    const pair = new PublicKey(poolAddr);

    // Get pool metadata
    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddr);
    
    // Get user positions
    const positions = await liquidityBookServices.getUserPositions({
      payer: userPub,
      pair,
    });

    // Get pair info for active bin
    const pairInfo = await liquidityBookServices.getPairAccount(pair);
    const activeBin = pairInfo.activeId;

    const baseDecimals = Number(metadata.extra?.tokenBaseDecimal ?? 9);
    const quoteDecimals = Number(metadata.extra?.tokenQuoteDecimal ?? 9);
    const baseReserve = Number(metadata.baseReserve) / Math.pow(10, baseDecimals);
    const quoteReserve = Number(metadata.quoteReserve) / Math.pow(10, quoteDecimals);

    let message = `**Your Pool Details**\n\n`;
    message += `**Pool:** \`${poolAddr}\`\n`;
    message += `**User:** \`${userPubKeyStr}\`\n\n`;
    message += `**Pool Info:**\n`;
    message += `• Base Reserve: ${baseReserve.toLocaleString()} tokens\n`;
    message += `• Quote Reserve: ${quoteReserve.toLocaleString()} tokens\n`;
    message += `• Active Bin: ${activeBin}\n`;
    message += `• Trade Fee: ${metadata.tradeFee}%\n\n`;

    let keyboard = [];

    if (positions.length === 0) {
      message += `**Status:** No liquidity positions found\n\n`;
      message += `You haven't added liquidity to this pool yet.`;
      
      keyboard = [
        [
          {
            text: "➕ Add Liquidity",
            callback_data: "liquidity:add",
          },
        ],
        [
          {
            text: "🔄 Refresh",
            callback_data: "mypools:refresh",
          },
        ],
      ];
    } else {
      message += `**Your Positions (${positions.length} found):**\n\n`;
      
      positions.forEach((position, index) => {
        const relativeLower = position.lowerBinId - activeBin;
        const relativeUpper = position.upperBinId - activeBin;
        
        message += `**Position ${index + 1}:**\n`;
        message += `• Bin Range: [${position.lowerBinId}, ${position.upperBinId}]\n`;
        message += `• Relative to Active: [${relativeLower}, ${relativeUpper}]\n`;
        message += `• Position Mint: \`${position.positionMint}\`\n\n`;
      });

      keyboard = [
        [
          {
            text: "➕ Add Liquidity",
            callback_data: "liquidity:add",
          },
          {
            text: "➖ Remove Liquidity",
            callback_data: "liquidity:remove",
          },
        ],
        [
          {
            text: "🔄 Refresh",
            callback_data: "mypools:refresh",
          },
        ],
      ];
    }

    await ctx.reply(message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  } catch (err) {
    console.error("showMyPoolsData error:", err);
    await ctx.reply(
      `❌ Error loading pool data: ${String((err as Error)?.message ?? err)}`
    );
  }
}

async function refreshMyPools(ctx: MyContext, liquidityBookServices: LiquidityBookServices) {
  try {
    await ctx.editMessageText("🔄 Refreshing pool data...");
    await showMyPoolsData(ctx, liquidityBookServices);
  } catch (err) {
    await ctx.reply(`❌ Error refreshing: ${String((err as Error)?.message ?? err)}`);
  }
}

async function startAddLiquidityProcess(ctx: MyContext) {
  try {
    const poolAddress = ctx.session?.selectedPool;
    const userPubKey = ctx.session?.userPublicKey;

    if (!poolAddress || !userPubKey) {
      await ctx.reply("❌ Session data missing. Please use /mypools command again.");
      return;
    }

    const message =
      `**Add Liquidity**\n\n` +
      `Pool: \`${poolAddress}\`\n` +
      `User: \`${userPubKey}\`\n\n` +
      `Please send the amounts and bin range:\n\n` +
      `**Format:** \`baseAmount quoteAmount binRangeLower binRangeUpper userPublicKey\`\n` +
      `**Example:** \`10 10 -5 5 ${userPubKey}\`\n\n` +
      `This will add 10 base tokens and 10 quote tokens in bins from -5 to +5 relative to active bin.`;

    await ctx.reply(message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "❌ Cancel",
              callback_data: "mypools:refresh",
            },
          ],
        ],
      },
    });

    if (!ctx.session) ctx.session = {};
    ctx.session.awaitingAddLiquidity = true;
  } catch (err) {
    console.error("startAddLiquidityProcess error:", err);
    await ctx.reply("❌ Error starting add liquidity process. Please try again.");
  }
}

async function startRemoveLiquidityProcess(ctx: MyContext) {
  try {
    const poolAddress = ctx.session?.selectedPool;
    const userPubKey = ctx.session?.userPublicKey;

    if (!poolAddress || !userPubKey) {
      await ctx.reply("❌ Session data missing. Please use /mypools command again.");
      return;
    }

    const message =
      `**Remove Liquidity**\n\n` +
      `Pool: \`${poolAddress}\`\n` +
      `User: \`${userPubKey}\`\n\n` +
      `Please send the bin range to remove from:\n\n` +
      `**Format:** \`binRangeLower binRangeUpper userPublicKey\`\n` +
      `**Example:** \`-3 3 ${userPubKey}\`\n\n` +
      `This will remove liquidity from bins -3 to +3 relative to active bin.`;

    await ctx.reply(message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "❌ Cancel",
              callback_data: "mypools:refresh",
            },
          ],
        ],
      },
    });

    if (!ctx.session) ctx.session = {};
    ctx.session.awaitingRemoveLiquidity = true;
  } catch (err) {
    console.error("startRemoveLiquidityProcess error:", err);
    await ctx.reply("❌ Error starting remove liquidity process. Please try again.");
  }
}

  bot.command("binsteps", async (ctx) => {
    try {
      const binStepInfo = BIN_STEP_CONFIGS.map(
        // @ts-ignore krde bhai ignoreeee

        (config) => `• **${config.binStep}**: ${config.feeRate}% fee rate`
      ).join("\n");

      await ctx.reply(
        `📊 **Available Bin Steps:**\n\n` +
          binStepInfo +
          "\n\n" +
          `💡 **What is Bin Step?**\n` +
          `Bin step determines the price increment between bins and the fee rate:\n` +
          `• Lower bin step = smaller price increments, lower fees\n` +
          `• Higher bin step = larger price increments, higher fees\n\n` +
          { parse_mode: "Markdown" }
      );
    } catch (err) {
      console.error("/binsteps error", err);
      await ctx.reply("❌ Error fetching bin step information.");
    }
  });


  bot.command("mypools", async (ctx) => {
      try {
        const parts = (ctx.message?.text ?? "").trim().split(/\s+/);
        if (parts.length < 3) {
          await ctx.reply(
            "Usage: /mypools <poolAddress> <userPublicKey>\n" +
              "Example: /mypools 9P3N4QxjMumpTNNdvaNNskXu2t7VHMMXtePQB72kkSAk YourPublicKey"
          );
          return;
        }
  // @ts-ignore krde bhai ignoreeee
        const poolAddr = parts[1].trim();
        // @ts-ignore krde bhai ignoreeee
  
        const userPubKeyStr = parts[2].trim();
  
        let userPub: PublicKey;
        let pair: PublicKey;
        
        try {
          userPub = new PublicKey(userPubKeyStr);
          pair = new PublicKey(poolAddr);
        } catch {
          await ctx.reply("❌ Invalid pool address or public key provided.");
          return;
        }
  
        // Store in session
        if (!ctx.session) ctx.session = {};
        ctx.session.selectedPool = poolAddr;
        ctx.session.userPublicKey = userPubKeyStr;
  
        await showMyPoolsData(ctx, liquidityBookServices);
      } catch (err) {
        console.error("/mypools error", err);
        await ctx.reply(
          `❌ Error fetching pool data: ${String((err as Error)?.message ?? err)}`
        );
      }
    });
  

  bot.on("callback_query", async (ctx) => {
    try {
      // @ts-ignore good shot bhaiya
      const data = ctx.callbackQuery?.data;
      if (!data) return;

      const userId = ctx.from?.id.toString() || "unknown";

      if (!poolController.checkRateLimit(userId)) {
        await ctx.answerCbQuery("Rate limit exceeded. Please wait.");
        return;
      }

      await ctx.answerCbQuery();

      if (data.startsWith("pool:")) {
        const [, action] = data.split(":");

        if (action === "refresh") {
          await ctx.editMessageText("♻️ Refreshing all pools...");
          ctx.session = {};
          ctx.session.markets =
            await liquidityBookServices.fetchPoolAddresses();
          ctx.session.lastFetchedAt = Date.now();
          ctx.session.currentPage = 1;
          await poolController.showPoolList(ctx, 1);
          return;
        }

        const page = parseInt(action, 10);
        if (!isNaN(page)) {
          ctx.session!.currentPage = page;
          await poolController.showPoolList(ctx, page);
        }
      }

      if (data.startsWith("market:")) {
        const [, poolIndex] = data.split(":");
        const index = parseInt(poolIndex, 10);
        const poolAddress = ctx.session?.markets?.[index];
        if (poolAddress) {
          await poolController.showPoolDetails(ctx, poolAddress, "list", index);
        }
      }

      if (data.startsWith("action:")) {
        const [, action, poolIndex] = data.split(":");
        const poolAddress =
          parseInt(poolIndex) === -1
            ? ctx.session?.selectedPool
            : ctx.session?.markets?.[parseInt(poolIndex)];

        if (!poolAddress) {
          await ctx.reply("❌ Invalid pool selection.");
          return;
        }

        if (!ctx.session) ctx.session = {};
        ctx.session.selectedPool = poolAddress;
        ctx.session.selectedPoolIndex = parseInt(poolIndex);

        switch (action) {
          case "quote":
            await startQuoteProcess(ctx, poolAddress, liquidityBookServices);
            break;
          case "swap":
            await startSwapProcess(ctx, poolAddress);
            break;
        }
      }

      if (data.startsWith("liquidity:")) {
        const [, action] = data.split(":");
        
        if (action === "add") {
          await startAddLiquidityProcess(ctx);
        } else if (action === "remove") {
          await startRemoveLiquidityProcess(ctx);
        }
      }

      if (data === "mypools:refresh") {
        await refreshMyPools(ctx, liquidityBookServices);
      }

      if (data === "back_to_pools") {
        await poolController.showPoolList(ctx, ctx.session?.currentPage ?? 1);
      }

      if (data === "view_all_pools") {
        if (!ctx.session) ctx.session = {};
        if (!ctx.session.markets || ctx.session.markets.length === 0) {
          await ctx.editMessageText("🔄 Fetching pools from Saros DLMM...");
          ctx.session.markets =
            await liquidityBookServices.fetchPoolAddresses();
          ctx.session.lastFetchedAt = Date.now();
          ctx.session.currentPage = 1;
        }
        await poolController.showPoolList(ctx, ctx.session.currentPage ?? 1);
      }
    } catch (err) {
      console.error("callback_query error", err);
      try {
        await ctx.answerCbQuery("❌ Error handling action");
      } catch {}
    }
  });

  bot.on("text", async (ctx) => {
       if (!ctx.session || !ctx.session.selectedPool) return;

    if (ctx.session.awaitingQuote ) {
      await handleQuoteRequest(
        ctx,
        ctx.session.selectedPool,
        liquidityBookServices
      );
      ctx.session.awaitingQuote = false;
      return;
    }
     if (ctx.session.awaitingAddLiquidity) {
      await handleAddLiquidityRequest(ctx, ctx.session.selectedPool, liquidityBookServices);
      ctx.session.awaitingAddLiquidity = false;
      return;
    }

    if (ctx.session.awaitingRemoveLiquidity) {
      await handleRemoveLiquidityRequest(ctx, ctx.session.selectedPool, liquidityBookServices);
      ctx.session.awaitingRemoveLiquidity = false;
      return;
    }

    if (ctx.session.awaitingSwap ) {
      await handleSwapRequest(
        ctx,
        ctx.session.selectedPool,
        liquidityBookServices
      );
      ctx.session.awaitingSwap = false;
      return;
    }
  });
}

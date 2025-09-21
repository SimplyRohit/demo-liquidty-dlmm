import { Telegraf } from "telegraf";
import {
  LiquidityBookServices,
  BIN_STEP_CONFIGS,
} from "@saros-finance/dlmm-sdk";
import { PublicKey } from "@solana/web3.js";
import type { MyContext } from "../../types";

export function setupLiquidityCommands(
  bot: Telegraf<MyContext>,
  liquidityBookServices: LiquidityBookServices
) {
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
}

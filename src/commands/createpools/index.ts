import { Telegraf } from "telegraf";
import { LiquidityBookServices, BIN_STEP_CONFIGS } from "@saros-finance/dlmm-sdk";
import { PublicKey } from "@solana/web3.js";
import type { MyContext } from "../../types";

export function setupLiquidityCommands(bot: Telegraf<MyContext>, liquidityBookServices: LiquidityBookServices) {
  
  bot.command("createpool", async (ctx) => {
    try {
      const parts = (ctx.message?.text ?? "").trim().split(/\s+/);
      if (parts.length < 7) {
        await ctx.reply(
          "Usage: /createpool <tokenXMint> <tokenYMint> <tokenXDecimals> <tokenYDecimals> <ratePrice> <payerPublicKey> [binStep]\n" +
          "Example: /createpool EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v So11111111111111111111111111111111111111112 6 9 1.0 YOUR_WALLET_ADDRESS 25\n\n" +
          "Available bin steps: " + BIN_STEP_CONFIGS.map(c => c.binStep).join(", ")
        );
        return;
      }
      
      const connection = liquidityBookServices.connection;
      const tokenXMint = parts[1].trim();
      const tokenYMint = parts[2].trim();
      const tokenXDecimals = parseInt(parts[3]);
      const tokenYDecimals = parseInt(parts[4]);
      const ratePrice = parseFloat(parts[5]);
      const payerPublicKeyStr = parts[6].trim();
      const binStep = parts[7] ? parseInt(parts[7]) : 25; // Default bin step

      // Validate token mint addresses
      let tokenXPubKey: PublicKey;
      let tokenYPubKey: PublicKey;
      let payerPubKey: PublicKey;

      try {
        tokenXPubKey = new PublicKey(tokenXMint);
        tokenYPubKey = new PublicKey(tokenYMint);
        payerPubKey = new PublicKey(payerPublicKeyStr);
      } catch {
        await ctx.reply("❌ Invalid token mint addresses or payer public key provided.");
        return;
      }

      if (isNaN(tokenXDecimals) || isNaN(tokenYDecimals) || isNaN(ratePrice)) {
        await ctx.reply("❌ Invalid decimals or rate price provided.");
        return;
      }

      if (tokenXDecimals < 0 || tokenYDecimals < 0 || ratePrice <= 0) {
        await ctx.reply("❌ Decimals must be non-negative and rate price must be positive.");
        return;
      }

      // Check if bin step is valid
      const validBinStep = BIN_STEP_CONFIGS.find(c => c.binStep === binStep);
      if (!validBinStep) {
        await ctx.reply(`❌ Invalid bin step. Valid options: ${BIN_STEP_CONFIGS.map(c => c.binStep).join(", ")}`);
        return;
      }

      // Check if tokens are the same
      if (tokenXMint === tokenYMint) {
        await ctx.reply("❌ Token X and Token Y cannot be the same.");
        return;
      }

      await ctx.reply("🔄 Creating pool transaction...");

      try {
        // Get latest blockhash
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash({
          commitment: "confirmed",
        });

        // Create the pool transaction
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

        // Set transaction properties
        tx.recentBlockhash = blockhash;
        tx.feePayer = payerPubKey;

        // Serialize the transaction
        const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        const base64Tx = Buffer.from(serialized).toString("base64");

        // Get token information for better display
        const [tokenXResponse, tokenYResponse] = await Promise.all([
          fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${tokenXMint}`).catch(() => null),
          fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${tokenYMint}`).catch(() => null)
        ]);

        let tokenXSymbol = "TOKEN_X";
        let tokenYSymbol = "TOKEN_Y";

        if (tokenXResponse && tokenYResponse) {
          const tokenXData = (await tokenXResponse.json())[0];
          const tokenYData = (await tokenYResponse.json())[0];
          if (tokenXData) tokenXSymbol = tokenXData.symbol;
          if (tokenYData) tokenYSymbol = tokenYData.symbol;
        }

        const successMessage = 
          `✅ **Pool Creation Transaction Built Successfully!**\n\n` +
          
          `📊 **Pool Configuration:**\n` +
          `• Pair: ${tokenXSymbol}-${tokenYSymbol}\n` +
          `• Token X: \`${tokenXMint.slice(0, 8)}...${tokenXMint.slice(-4)}\` (${tokenXDecimals} decimals)\n` +
          `• Token Y: \`${tokenYMint.slice(0, 8)}...${tokenYMint.slice(-4)}\` (${tokenYDecimals} decimals)\n` +
          `• Rate Price: ${ratePrice}\n` +
          `• Bin Step: ${binStep}\n` +
          `• Fee Rate: ${validBinStep.feeRate}%\n\n` +
          
          `👤 **Transaction Details:**\n` +
          `• Payer: \`${payerPublicKeyStr.slice(0, 8)}...${payerPublicKeyStr.slice(-4)}\`\n` +
          `• Blockhash: \`${blockhash.slice(0, 8)}...${blockhash.slice(-4)}\`\n\n` +
          
          `🔐 **Unsigned Transaction (Base64):**\n` +
          `\`\`\`\n${base64Tx}\n\`\`\`\n\n` +
          
          `💡 **Next Steps:**\n` +
          `1. Copy the transaction above\n` +
          `2. Sign it with your wallet (must be the payer address)\n` +
          `3. Submit to the Solana network\n` +
          `4. Wait for confirmation\n\n` +
          
          `⚠️ **Important Notes:**\n` +
          `• Make sure you have enough SOL for transaction fees\n` +
          `• The payer wallet must sign this transaction\n` +
          `• Pool creation may take a few moments to confirm\n` +
          `• Save the pool address after successful creation`;

        await ctx.reply(successMessage, { parse_mode: 'Markdown' });

      } catch (error) {
        console.error("Pool creation error:", error);
        
        let errorMessage = "❌ Error creating pool transaction: ";
        
        if (error.message?.includes("already exists")) {
          errorMessage += "A pool with these parameters already exists.";
        } else if (error.message?.includes("insufficient")) {
          errorMessage += "Insufficient balance for transaction fees.";
        } else if (error.message?.includes("invalid")) {
          errorMessage += "Invalid pool parameters provided.";
        } else {
          errorMessage += String((error as Error)?.message ?? error);
        }
        
        await ctx.reply(errorMessage);
      }

    } catch (err) {
      console.error("/createpool error", err);
      await ctx.reply(`❌ Error processing create pool command: ${String((err as Error)?.message ?? err)}`);
    }
  });

  // Helper command to show available bin steps
  bot.command("binsteps", async (ctx) => {
    try {
      const binStepInfo = BIN_STEP_CONFIGS.map(config => 
        `• **${config.binStep}**: ${config.feeRate}% fee rate`
      ).join('\n');

      await ctx.reply(
        `📊 **Available Bin Steps:**\n\n` +
        binStepInfo + '\n\n' +
        `💡 **What is Bin Step?**\n` +
        `Bin step determines the price increment between bins and the fee rate:\n` +
        `• Lower bin step = smaller price increments, lower fees\n` +
        `• Higher bin step = larger price increments, higher fees\n\n` +
        `**Common choices:**\n` +
        `• 25: For stable pairs (low volatility)\n` +
        `• 100: For moderate volatility pairs\n` +
        `• 500+: For high volatility pairs`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error("/binsteps error", err);
      await ctx.reply("❌ Error fetching bin step information.");
    }
  });

  

}
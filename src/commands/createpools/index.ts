import { Telegraf } from "telegraf";
import { LiquidityBookServices, BIN_STEP_CONFIGS } from "@saros-finance/dlmm-sdk";
import { PublicKey } from "@solana/web3.js";
import type { MyContext } from "../../types";

export function setupLiquidityCommands(bot: Telegraf<MyContext>, liquidityBookServices: LiquidityBookServices) {
  
  bot.command("createpool", async (ctx) => {
    try {
      const parts = (ctx.message?.text ?? "").trim().split(/\s+/);
      if (parts.length < 6) {
        await ctx.reply(
          "Usage: /createpool <tokenXMint> <tokenYMint> <tokenXDecimals> <tokenYDecimals> <ratePrice> [binStep]\n" +
          "Example: /createpool EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v So11111111111111111111111111111111111111112 6 9 1.0 25\n\n" +
          "Available bin steps: " + BIN_STEP_CONFIGS.map(c => c.binStep).join(", ")
        );
        return;
      }

      const tokenXMint = parts[1].trim();
      const tokenYMint = parts[2].trim();
      const tokenXDecimals = parseInt(parts[3]);
      const tokenYDecimals = parseInt(parts[4]);
      const ratePrice = parseFloat(parts[5]);
      const binStep = parts[6] ? parseInt(parts[6]) : 25; // Default bin step

      // Validate inputs
      try {
        new PublicKey(tokenXMint);
        new PublicKey(tokenYMint);
      } catch {
        await ctx.reply("Invalid token mint addresses provided.");
        return;
      }

      if (isNaN(tokenXDecimals) || isNaN(tokenYDecimals) || isNaN(ratePrice)) {
        await ctx.reply("Invalid decimals or rate price provided.");
        return;
      }

      // Check if bin step is valid
      const validBinStep = BIN_STEP_CONFIGS.find(c => c.binStep === binStep);
      if (!validBinStep) {
        await ctx.reply(`Invalid bin step. Valid options: ${BIN_STEP_CONFIGS.map(c => c.binStep).join(", ")}`);
        return;
      }

      await ctx.reply(
        `Creating pool transaction:\n\n` +
        `Token X: ${tokenXMint} (${tokenXDecimals} decimals)\n` +
        `Token Y: ${tokenYMint} (${tokenYDecimals} decimals)\n` +
        `Rate Price: ${ratePrice}\n` +
        `Bin Step: ${binStep}\n\n` +
        `This will generate an unsigned transaction that you need to sign with your wallet.\n` +
        `Note: You need to provide a payer public key to generate the actual transaction.`
      );

    } catch (err) {
      console.error("/createpool error", err);
      await ctx.reply(`Error creating pool: ${String((err as Error)?.message ?? err)}`);
    }
  });

  
}
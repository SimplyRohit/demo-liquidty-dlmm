import { Telegraf } from "telegraf";
import { LiquidityBookServices, type PoolMetadata, BIN_STEP_CONFIGS } from "@saros-finance/dlmm-sdk";
import { PublicKey } from "@solana/web3.js";
import {
  LiquidityShape,
  PositionInfo,
  RemoveLiquidityType,
} from "@saros-finance/dlmm-sdk/types/services";
import { createUniformDistribution } from "@saros-finance/dlmm-sdk/utils";
import type { MyContext } from "../types";
import { convertBalanceToWei } from "../utils";

export function setupLiquidityCommands(bot: Telegraf<MyContext>, liquidityBookServices: LiquidityBookServices) {
  
  // CREATE POOL COMMAND
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

  // ADD LIQUIDITY COMMAND
  bot.command("addliquidity", async (ctx) => {
    try {
      const parts = (ctx.message?.text ?? "").trim().split(/\s+/);
      if (parts.length < 7) {
        await ctx.reply(
          "Usage: /addliquidity <poolAddress> <amountX> <amountY> <userPublicKey> <binRangeLower> <binRangeUpper>\n" +
          "Example: /addliquidity TWsCCbfzVj1198WvL8D8KxfYyWbqVz5Y2nbHJVhHNav 10 10 YourPublicKey -10 10"
        );
        return;
      }

      const poolAddr = parts[1].trim();
      const amountX = parseFloat(parts[2]);
      const amountY = parseFloat(parts[3]);
      const userPubKeyStr = parts[4].trim();
      const binRangeLower = parseInt(parts[5]);
      const binRangeUpper = parseInt(parts[6]);

      let userPub: PublicKey;
      try {
        userPub = new PublicKey(userPubKeyStr);
      } catch {
        await ctx.reply("Invalid public key provided.");
        return;
      }

      if (isNaN(amountX) || isNaN(amountY) || isNaN(binRangeLower) || isNaN(binRangeUpper)) {
        await ctx.reply("Invalid amount or bin range values provided.");
        return;
      }

      let metadata: PoolMetadata;
      try {
        metadata = await liquidityBookServices.fetchPoolMetadata(poolAddr);
      } catch (err) {
        await ctx.reply(`Error fetching metadata for ${poolAddr}: ${String((err as Error)?.message ?? err)}`);
        return;
      }

      const baseDecimals = Number(metadata.extra?.tokenBaseDecimal ?? 9);
      const quoteDecimals = Number(metadata.extra?.tokenQuoteDecimal ?? 9);

      // Get pair info for active bin
      const pair = new PublicKey(poolAddr);
      const pairInfo = await liquidityBookServices.getPairAccount(pair);
      const activeBin = pairInfo.activeId;

      // Check if user has existing positions
      const positions = await liquidityBookServices.getUserPositions({
        payer: userPub,
        pair,
      });

      await ctx.reply(
        `Add Liquidity Setup:\n` +
        `Pool: ${poolAddr}\n` +
        `Amount X: ${amountX} (${baseDecimals} decimals)\n` +
        `Amount Y: ${amountY} (${quoteDecimals} decimals)\n` +
        `Relative Bin Range: [${binRangeLower}, ${binRangeUpper}]\n` +
        `Active Bin: ${activeBin}\n` +
        `Actual Bin Range: [${activeBin + binRangeLower}, ${activeBin + binRangeUpper}]\n` +
        `User: ${userPubKeyStr}\n` +
        `Existing Positions: ${positions.length}\n\n` +
        `This operation requires multiple transactions:\n` +
        `1. Initialize bin arrays if needed\n` +
        `2. Create position if it doesn't exist\n` +
        `3. Add liquidity to the position\n\n` +
        `To execute this, you would need to sign these transactions with your wallet.`
      );

      // Show liquidity distribution info
      const shape = LiquidityShape.Spot; // Default to spot distribution
      const binRange = [binRangeLower, binRangeUpper] as [number, number];
      const liquidityDistribution = createUniformDistribution({
        shape,
        binRange,
      });

      await ctx.reply(
        `Liquidity Distribution:\n` +
        `Shape: ${shape}\n` +
        `Total Bins: ${liquidityDistribution.length}\n` +
        `Distribution: Uniform across range\n\n` +
        `Amounts will be converted to:\n` +
        `X: ${Number(convertBalanceToWei(amountX, baseDecimals))} base units\n` +
        `Y: ${Number(convertBalanceToWei(amountY, quoteDecimals))} quote units`
      );

    } catch (err) {
      console.error("/addliquidity error", err);
      await ctx.reply(`Error setting up add liquidity: ${String((err as Error)?.message ?? err)}`);
    }
  });

  // REMOVE LIQUIDITY COMMAND
  bot.command("removeliquidity", async (ctx) => {
    try {
      const parts = (ctx.message?.text ?? "").trim().split(/\s+/);
      if (parts.length < 5) {
        await ctx.reply(
          "Usage: /removeliquidity <poolAddress> <userPublicKey> <binRangeLower> <binRangeUpper> [type]\n" +
          "Type options: both (default), x, y\n" +
          "Example: /removeliquidity TWsCCbfzVj1198WvL8D8KxfYyWbqVz5Y2nbHJVhHNav YourPublicKey -3 3 both"
        );
        return;
      }

      const poolAddr = parts[1].trim();
      const userPubKeyStr = parts[2].trim();
      const binRangeLower = parseInt(parts[3]);
      const binRangeUpper = parseInt(parts[4]);
      const typeStr = parts[5]?.toLowerCase() || "both";

      let userPub: PublicKey;
      try {
        userPub = new PublicKey(userPubKeyStr);
      } catch {
        await ctx.reply("Invalid public key provided.");
        return;
      }

      if (isNaN(binRangeLower) || isNaN(binRangeUpper)) {
        await ctx.reply("Invalid bin range values provided.");
        return;
      }

      // Map type string to enum
      let removeType;
      switch (typeStr) {
        case "x":
          removeType = RemoveLiquidityType.X;
          break;
        case "y":
          removeType = RemoveLiquidityType.Y;
          break;
        case "both":
        default:
          removeType = RemoveLiquidityType.Both;
      }

      const pair = new PublicKey(poolAddr);
      
      // Get user positions
      const positions = await liquidityBookServices.getUserPositions({
        payer: userPub,
        pair,
      });

      if (positions.length === 0) {
        await ctx.reply("No positions found for this user in this pool.");
        return;
      }

      // Get pair info for active bin
      const pairInfo = await liquidityBookServices.getPairAccount(pair);
      const activeBin = pairInfo.activeId;
      
      const range = [activeBin + binRangeLower, activeBin + binRangeUpper] as [number, number];

      // Filter positions that overlap with the specified range
      const relevantPositions = positions.filter((position: PositionInfo) => {
        return !(position.upperBinId < range[0] || position.lowerBinId > range[1]);
      });

      if (relevantPositions.length === 0) {
        await ctx.reply(
          `No positions found in the specified range [${range[0]}, ${range[1]}].\n\n` +
          `Your positions:\n` +
          positions.map((p: PositionInfo, i: number) => 
            `${i + 1}. Bins [${p.lowerBinId}, ${p.upperBinId}] - Position: ${p.position.toString()}`
          ).join('\n')
        );
        return;
      }

      await ctx.reply(
        `Remove Liquidity Setup:\n` +
        `Pool: ${poolAddr}\n` +
        `User: ${userPubKeyStr}\n` +
        `Relative Range: [${binRangeLower}, ${binRangeUpper}]\n` +
        `Actual Range: [${range[0]}, ${range[1]}]\n` +
        `Active Bin: ${activeBin}\n` +
        `Remove Type: ${typeStr.toUpperCase()}\n` +
        `Relevant Positions: ${relevantPositions.length}\n\n` +
        `Positions to remove from:\n` +
        relevantPositions.map((p: PositionInfo, i: number) => 
          `${i + 1}. Bins [${p.lowerBinId}, ${p.upperBinId}] - Mint: ${p.positionMint}`
        ).join('\n') +
        `\n\nThis will generate unsigned transactions that need to be signed with your wallet.`
      );

    } catch (err) {
      console.error("/removeliquidity error", err);
      await ctx.reply(`Error setting up remove liquidity: ${String((err as Error)?.message ?? err)}`);
    }
  });
}
import { Telegraf } from "telegraf";
import { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import { PublicKey } from "@solana/web3.js";
import { PositionInfo } from "@saros-finance/dlmm-sdk/types/services";
import type { MyContext } from "../types";

export function setupUserCommands(bot: Telegraf<MyContext>, liquidityBookServices: LiquidityBookServices) {
  
  bot.command("userpositions", async (ctx) => {
    try {
      const parts = (ctx.message?.text ?? "").trim().split(/\s+/);
      if (parts.length < 3) {
        await ctx.reply(
          "Usage: /userpositions <poolAddress> <userPublicKey>\n" +
          "Example: /userpositions TWsCCbfzVj1198WvL8D8KxfYyWbqVz5Y2nbHJVhHNav YourPublicKey"
        );
        return;
      }

      const poolAddr = parts[1].trim();
      const userPubKeyStr = parts[2].trim();

      let userPub: PublicKey;
      try {
        userPub = new PublicKey(userPubKeyStr);
      } catch {
        await ctx.reply("Invalid public key provided.");
        return;
      }

      const pair = new PublicKey(poolAddr);
      
      // Get user positions
      const positions = await liquidityBookServices.getUserPositions({
        payer: userPub,
        pair,
      });

      if (positions.length === 0) {
        await ctx.reply(`No positions found for user ${userPubKeyStr} in pool ${poolAddr}.`);
        return;
      }

      // Get pair info for active bin context
      const pairInfo = await liquidityBookServices.getPairAccount(pair);
      const activeBin = pairInfo.activeId;

      const positionInfo = positions.map((position: PositionInfo, index: number) => {
        const relativeLower = position.lowerBinId - activeBin;
        const relativeUpper = position.upperBinId - activeBin;
        
        return `Position ${index + 1}:
  Mint: ${position.positionMint}
  Bin Range: [${position.lowerBinId}, ${position.upperBinId}]
  Relative to Active (${activeBin}): [${relativeLower}, ${relativeUpper}]
  Position Account: ${position.position.toString()}`;
      }).join('\n\n');

      await ctx.reply(
        `User Positions for ${userPubKeyStr}\n` +
        `Pool: ${poolAddr}\n` +
        `Active Bin: ${activeBin}\n` +
        `Total Positions: ${positions.length}\n\n` +
        positionInfo
      );

    } catch (err) {
      console.error("/userpositions error", err);
      await ctx.reply(`Error fetching user positions: ${String((err as Error)?.message ?? err)}`);
    }
  });
}
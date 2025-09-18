import type { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import type { MyContext } from "../../types";
import { startQuoteProcess } from "./startQuoteProcess";
import { startSwapProcess } from "./startSwapProcess";
import { startAddLiquidityProcess } from "./startAddLiquidityProcess";

export async function handleMarketAction(
  ctx: MyContext,
  action: string,
  poolIndex: number,
  liquidityBookServices: LiquidityBookServices
) {
  const poolAddress =
    poolIndex === -1
      ? ctx.session?.selectedPool // Direct pool access via /pool command
      : ctx.session?.markets?.[poolIndex]; // Pool from list

  if (!poolAddress) {
    await ctx.reply("❌ Invalid pool selection.");
    return;
  }

  // Store the selected pool for future operations
  if (!ctx.session) ctx.session = {};
  ctx.session.selectedPool = poolAddress;
  ctx.session.selectedPoolIndex = poolIndex;

  switch (action) {
    case "quote":
      await startQuoteProcess(
        ctx as MyContext,
        poolAddress as string,
        liquidityBookServices as LiquidityBookServices
      );
      break;

    case "swap":
      await startSwapProcess(ctx, poolAddress, liquidityBookServices);
      break;

    case "add_liquidity":
      await startAddLiquidityProcess(ctx, poolAddress, liquidityBookServices);
      break;

    case "remove_liquidity":
      await ctx.reply(
        "➖ *Remove Liquidity*\n\n" +
          "This feature will help you remove your liquidity from the pool.\n" +
          "You'll receive both tokens based on your pool share.\n\n" +
          `Pool: \`${poolAddress}\`\n\n` +
          "💡 *Coming soon!* This feature is under development.",
        { parse_mode: "Markdown" }
      );
      break;

    default:
      await ctx.reply("❌ Unknown action.");
  }
}

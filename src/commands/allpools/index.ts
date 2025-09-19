import { Telegraf } from "telegraf";
import { PublicKey } from "@solana/web3.js";
import type { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import type { MyContext } from "../../types";
import { PoolController } from "../../controllers/PoolController";
import { startQuoteProcess } from "./startQuoteProcess";
import { startSwapProcess } from "./startSwapProcess";
import { startAddLiquidityProcess } from "./startAddLiquidityProcess";
import { handleSwapRequest } from "./handleSwapRequest";
import { handleAddLiquidityRequest } from "./handleAddLiquidityRequest";
import { handleQuoteRequest } from "./handleQuoteRequest";

export function setupPoolCommands(
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
            await startSwapProcess(ctx, poolAddress, liquidityBookServices);
            break;
          case "add_liquidity":
            await startAddLiquidityProcess(
              ctx,
              poolAddress,
              liquidityBookServices
            );
            break;
        }
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
    if (!ctx.session) return;

    if (ctx.session.awaitingQuote && ctx.session.selectedPool) {
      await handleQuoteRequest(
        ctx,
        ctx.session.selectedPool,
        liquidityBookServices
      );
      ctx.session.awaitingQuote = false;
      return;
    }

    if (ctx.session.awaitingSwap && ctx.session.selectedPool) {
      await handleSwapRequest(
        ctx,
        ctx.session.selectedPool,
        liquidityBookServices
      );
      ctx.session.awaitingSwap = false;
      return;
    }

    if (ctx.session.awaitingAddLiquidity && ctx.session.selectedPool) {
      await handleAddLiquidityRequest(
        ctx,
        ctx.session.selectedPool,
        liquidityBookServices
      );
      ctx.session.awaitingAddLiquidity = false;
      return;
    }
  });
}

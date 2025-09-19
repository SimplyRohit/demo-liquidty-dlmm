import { Telegraf } from "telegraf";
import { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import { PublicKey } from "@solana/web3.js";
import { showMarketDetails } from "./showMarketDetails";
import { handleSwapRequest } from "./handleSwapRequest";
import { handleAddLiquidityRequest } from "./handleAddLiquidityRequest";
import { sendPoolMetadataPage } from "./sendPoolMetadataPage";
import { handleQuoteRequest } from "./handleQuoteRequest";
import { handleMarketAction } from "./handleMarketAction";
import { showSpecificPoolDetails } from "./showSpecificPoolDetails";
import type { MyContext } from "../../types";
import type { CallbackQuery } from "telegraf/types";

const rateLimits = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 10000;
const MAX_REQUESTS_PER_MINUTE = 10;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimits.get(userId);
  if (!userLimit || now > userLimit.resetTime) {
    rateLimits.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (userLimit.count >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }
  userLimit.count++;
  return true;
}

export function setupPoolCommands(bot: Telegraf<MyContext>, liquidityBookServices: LiquidityBookServices) {
  bot.command("pools", async (ctx) => {
    try {
      const userId = ctx.from?.id.toString() || 'unknown'
      if (!checkRateLimit(userId)) {
        await ctx.reply("⚠️ Rate limit exceeded. Please wait a moment before trying again.");
        return;
      }
      if (!ctx.session) ctx.session = {};
      if (!ctx.session.markets || ctx.session.markets.length === 0) {
        await ctx.reply("🔄 Fetching pools from Saros DLMM...");
        ctx.session.markets = await liquidityBookServices.fetchPoolAddresses();
        console.log(ctx.session.markets[275] , ctx.session.markets[276])
        ctx.session.lastFetchedAt = Date.now();
        ctx.session.currentPage = 1;
      }
      await sendPoolMetadataPage(ctx, ctx.session.currentPage ?? 1, liquidityBookServices);
    } catch (err) {
      console.error("/pools error", err);
      await ctx.reply(
        `❌ Error fetching pools: ${String((err as Error)?.message ?? err)}`
      );
    }
  });

  bot.command("pool", async (ctx) => {
    try {
      const userId = ctx.from?.id.toString() || 'unknown';
      if (!checkRateLimit(userId)) {
        await ctx.reply("⚠️ Rate limit exceeded. Please wait a moment before trying again.");
        return;
      }
      const parts = (ctx.message?.text ?? "").trim().split(/\s+/);
      if (parts.length < 2) {
        await ctx.reply(
          "❌ **Usage:** `/pool <poolAddress>`\n\n" +
          "**Example:** `/pool 9P3N4QxjMumpTNNdvaNNskXu2t7VHMMXtePQB72kkSAk`\n\n" +
          "💡 Use `/pools` to see all available pools first.",
          { parse_mode: 'Markdown' }
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

      await showSpecificPoolDetails(ctx, poolAddress, liquidityBookServices);

    } catch (err) {
      console.error("/pool error", err);
      await ctx.reply(
        `❌ Error fetching pool details: ${String((err as Error)?.message ?? err)}`
      );
    }
  });

  bot.on("callback_query", async (ctx) => {
    try {
    const data = (ctx.callbackQuery as CallbackQuery.DataQuery).data;
      if (!data) return;

      const userId = ctx.from?.id.toString() || 'unknown';
      
      if (!checkRateLimit(userId)) {
        await ctx.answerCbQuery("Rate limit exceeded. Please wait.");
        return;
      }

      await ctx.answerCbQuery();

      if (data.startsWith("pool:")) {
        const [, action] = data.split(":");
        
        if (action === "refresh") {
          await ctx.editMessageText("♻️ Refreshing all pools...");
          ctx.session = {};
          ctx.session.markets = await liquidityBookServices.fetchPoolAddresses();
          ctx.session.lastFetchedAt = Date.now();
          ctx.session.currentPage = 1;
          await sendPoolMetadataPage(ctx, 1, liquidityBookServices);
          return;
        }

        const page = parseInt(action!, 10);
        if (!isNaN(page)) {
          ctx.session!.currentPage = page;
          await sendPoolMetadataPage(ctx, page, liquidityBookServices);
        }
      }

      if (data.startsWith("market:")) {
        const [, poolIndex] = data.split(":");
        const index = parseInt(poolIndex!, 10);
        await showMarketDetails(ctx, index, liquidityBookServices);
      }

      if (data.startsWith("action:")) {
        const [, action, poolIndex] = data.split(":");
        await handleMarketAction(ctx, action!, parseInt(poolIndex!), liquidityBookServices);
      }

      if (data === "back_to_pools") {
        await sendPoolMetadataPage(ctx, ctx.session?.currentPage ?? 1, liquidityBookServices);
      }

      if (data === "view_all_pools") {
        if (!ctx.session) ctx.session = {};
        if (!ctx.session.markets || ctx.session.markets.length === 0) {
          await ctx.editMessageText("🔄 Fetching pools from Saros DLMM...");
          ctx.session.markets = await liquidityBookServices.fetchPoolAddresses();
          ctx.session.lastFetchedAt = Date.now();
          ctx.session.currentPage = 1;
        }
        await sendPoolMetadataPage(ctx, ctx.session.currentPage ?? 1, liquidityBookServices);
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
      await handleQuoteRequest(ctx, ctx.session.selectedPool, liquidityBookServices);
      ctx.session.awaitingQuote = false;
      return;
    }
      if (ctx.session.awaitingSwap && ctx.session.selectedPool) {
      await handleSwapRequest(ctx, ctx.session.selectedPool, liquidityBookServices);
      ctx.session.awaitingSwap = false;
      return;
    }

    if (ctx.session.awaitingAddLiquidity && ctx.session.selectedPool) {
      await handleAddLiquidityRequest(ctx, ctx.session.selectedPool, liquidityBookServices);
      ctx.session.awaitingAddLiquidity = false;
      return;
    }
  });
}












   




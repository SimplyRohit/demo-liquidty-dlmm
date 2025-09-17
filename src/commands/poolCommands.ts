import { Telegraf } from "telegraf";
import { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import type { MyContext } from "../types";

export function setupPoolCommands(bot: Telegraf<MyContext>, liquidityBookServices: LiquidityBookServices) {
  
  bot.command("pool", async (ctx) => {
    try {
      if (!ctx.session) ctx.session = {};
      if (!ctx.session.markets || ctx.session.markets.length === 0) {
        await ctx.reply("Fetching pools from Saros DLMM...");
        ctx.session.markets = await liquidityBookServices.fetchPoolAddresses();
        ctx.session.lastFetchedAt = Date.now();
        ctx.session.currentPage = 1;
      }
      await sendPoolMetadataPage(ctx, ctx.session.currentPage ?? 1, liquidityBookServices);
    } catch (err) {
      console.error("/pool error", err);
      await ctx.reply(
        `Error fetching pools metadata: ${String((err as Error)?.message ?? err)}`
      );
    }
  });

  bot.on("callback_query", async (ctx) => {
    try {
      const data = ctx.callbackQuery?.data;
      if (!data || (!data.startsWith("pool:") && !data.startsWith("markets:")))
        return;

      await ctx.answerCbQuery();
      const [, action] = data.split(":");

      if (data.startsWith("pool:")) {
        if (action === "refresh") {
          await ctx.editMessageText("♻️ Refreshing all pools...");
          ctx.session = {};
          ctx.session.markets = await liquidityBookServices.fetchPoolAddresses();
          ctx.session.lastFetchedAt = Date.now();
          ctx.session.currentPage = 1;
          await sendPoolMetadataPage(ctx, 1, liquidityBookServices);
          return;
        }

        const page = parseInt(action, 10);
        if (!isNaN(page)) {
          ctx.session!.currentPage = page;
          await sendPoolMetadataPage(ctx, page, liquidityBookServices);
        }
      }
    } catch (err) {
      console.error("callback_query error", err);
      try {
        await ctx.answerCbQuery("Error handling action");
      } catch {}
    }
  });
}

async function sendPoolMetadataPage(ctx: MyContext, page: number, liquidityBookServices: LiquidityBookServices) {
  if (!ctx.session) ctx.session = {};
  const markets = ctx.session.markets ?? [];
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(markets.length / pageSize));
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;
  ctx.session.currentPage = page;
  const start = (page - 1) * pageSize;
  const items = markets.slice(start, start + pageSize);
  
  if (items.length === 0) {
    await ctx.reply("No pools on this page.");
    return;
  }
  
  await ctx.reply(
    `Fetching metadata for pools (Page ${page}/${totalPages})...`
  );
  
  const results = await Promise.all(
    items.map(async (address: any) => {
      try {
        const metadata = await liquidityBookServices.fetchPoolMetadata(address);
        const jsonData = JSON.stringify(metadata, null, 2);
        return jsonData;
      } catch (err) {
        return `Pool: ${address}\n⚠️ Error fetching metadata`;
      }
    })
  );

  const text = results.join("\n-----------------\n");
  const buttons: any[] = [];
  
  if (page > 1)
    buttons.push({ text: "⬅️ Prev", callback_data: `pool:${page - 1}` });
  if (page < totalPages)
    buttons.push({ text: "➡️ Next", callback_data: `pool:${page + 1}` });
  buttons.push({ text: "♻️ Refresh", callback_data: "pool:refresh" });

  await ctx.reply(text, { reply_markup: { inline_keyboard: [buttons] } });
}
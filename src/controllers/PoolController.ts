import type { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import type { MyContext } from "../types";
import { PoolService } from "../services/PoolService";
import { MessageFormatter } from "../services/MessageFormatter";
import { RateLimitService } from "../services/RateLimitService";

export class PoolController {
  private poolService: PoolService;
  private rateLimitService: RateLimitService;

  constructor(private liquidityBookServices: LiquidityBookServices) {
    this.poolService = new PoolService(liquidityBookServices);
    this.rateLimitService = new RateLimitService();
  }

  async showPoolList(ctx: MyContext, page: number = 1) {
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
      await ctx.reply("❌ No pools found on this page.");
      return;
    }

    await this.updateMessage(
      ctx,
      `🔄 Loading pool data (Page ${page}/${totalPages})...`
    );

    const results = await Promise.all(
      items.map(async (address: string, index: number) => {
        try {
          const poolData = await this.poolService.fetchPoolData(address);
          const poolNumber = start + index + 1;
          return MessageFormatter.formatPoolSummary(poolData, poolNumber);
        } catch (err) {
          const poolNumber = start + index + 1;
          return `${poolNumber}. ⚠️ *Error loading pool*\n🏦 \`${address.slice(0, 8)}...${address.slice(-4)}\``;
        }
      })
    );
    const text =
      "```\n" +
      `Saros Pools (Page ${page}/${totalPages})\n\n` +
      results.join("\n\n") +
      `\n\nTotal Pools: ${markets.length}` +
      "```";

    const keyboard = this.createPoolListKeyboard(
      items,
      page,
      totalPages,
      start
    );

    await this.updateMessage(ctx, text, {
      parse_mode: "MarkdownV2",
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  async showPoolDetails(
    ctx: MyContext,
    poolAddress: string,
    source: "list" | "direct",
    poolIndex?: number
  ) {
    try {
      await this.updateMessage(ctx, "🔄 Loading pool details...");

      const poolData = await this.poolService.fetchPoolData(poolAddress);
      if (!ctx.session) ctx.session = {};
      ctx.session.selectedPool = poolAddress;
      ctx.session.selectedPoolIndex = poolIndex ?? -1;

      const detailText = MessageFormatter.formatPoolDetails(poolData);
      const keyboard = this.createPoolDetailKeyboard(source, poolIndex);

      await this.updateMessage(ctx, `${detailText}`, {
        parse_mode: "MarkdownV2",
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch (err) {
      console.error("Error showing pool details:", err);
      if (
        //@ts-ignore ignoree krde bhaai
        err.message?.includes("Pool not found") ||
        //@ts-ignore ignoree krde bhaai
        err.message?.includes("Invalid pool")
      ) {
        await ctx.reply(
          "❌ Pool not found or invalid pool address.\n\n💡 Use `/pools` to see all available pools."
        );
      } else {
        await ctx.reply(
          `❌ Error loading pool details: ${String((err as Error)?.message ?? err)}`
        );
      }
    }
  }

  private createPoolListKeyboard(
    items: string[],
    page: number,
    totalPages: number,
    start: number
  ) {
    const selectionButtons = [];
    const navigationButtons = [];

    for (let i = 0; i < items.length; i++) {
      const poolNumber = start + i + 1;
      const globalIndex = start + i;
      selectionButtons.push({
        text: `${poolNumber}`,
        callback_data: `market:${globalIndex}`,
      });
    }

    if (page > 1) {
      navigationButtons.push({
        text: "Prev",
        callback_data: `pool:${page - 1}`,
      });
    }
    if (page < totalPages) {
      navigationButtons.push({
        text: "Next",
        callback_data: `pool:${page + 1}`,
      });
    }
    navigationButtons.push({
      text: "Refresh",
      callback_data: "pool:refresh",
    });

    const keyboard = [];
    if (selectionButtons.length > 0) {
      for (let i = 0; i < selectionButtons.length; i += 5) {
        keyboard.push(selectionButtons.slice(i, i + 5));
      }
    }
    if (navigationButtons.length > 0) {
      keyboard.push(navigationButtons);
    }

    return keyboard;
  }

  private createPoolDetailKeyboard(
    source: "list" | "direct",
    poolIndex?: number
  ) {
    const baseButtons = [
      [
        {
          text: "Get Quote",
          callback_data: `action:quote:${poolIndex ?? -1}`,
        },
        {
          text: "Build Swap",
          callback_data: `action:swap:${poolIndex ?? -1}`,
        },
      ],
      [
        {
          text: "Add Liquidity",
          callback_data: `action:add_liquidity:${poolIndex ?? -1}`,
        },
      ],
    ];

    if (source === "list") {
      baseButtons.push([
        { text: "Back to Pools", callback_data: "back_to_pools" },
      ]);
    } else {
      baseButtons.push([
        { text: "View All Pools", callback_data: "view_all_pools" },
      ]);
    }

    return baseButtons;
  }

  private async updateMessage(ctx: MyContext, text: string, extra?: any) {
    try {
      await ctx.editMessageText(text, extra);
    } catch {
      await ctx.reply(text, extra);
    }
  }

  checkRateLimit(userId: string): boolean {
    return this.rateLimitService.checkRateLimit(userId);
  }
}

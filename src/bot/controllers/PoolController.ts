import { MyContext } from '@/types';
import { formatPoolSummary } from '../services/MessageFormatter';
import { createRateLimiter } from '../services/RateLimitService';
import { LiquidityBookServices } from '@saros-finance/dlmm-sdk';

export function createPoolFunctions(
  liquidityBookServices: LiquidityBookServices,
) {
  const rateLimiter = createRateLimiter();

  async function showPoolList(ctx: MyContext, page: number = 1) {
    if (!ctx.session) ctx.session = {};
    const markets = ctx.session.markets ?? [];
    const pageSize = 5;
    const totalPages = Math.max(1, Math.ceil(markets.length / pageSize));

    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    ctx.session.currentPage = page;

    const start = (page - 1) * pageSize;
    const items = markets.slice(start, start + pageSize);
    if (items.length === 0)
      return ctx.reply('<i>No pools found on this page.</i>', {
        parse_mode: 'HTML',
      });

    await updateMessage(
      ctx,
      `<i>Loading pool data (Page ${page}/${totalPages})...</i>`,
      { parse_mode: 'HTML' },
    );

    const results = await Promise.all(
      items.map(async (address, index) => {
        try {
          const poolData =
            await liquidityBookServices.fetchPoolMetadata(address);
          return formatPoolSummary(poolData, start + index + 1);
        } catch {
          return `<i>${start + index + 1}.Error loading pool\n ${address}`;
        }
      }),
    );

    const keyboard = createPoolListKeyboard(items, page, totalPages, start);
    const text =
      `<i>Saros Pools (Page ${page}/${totalPages})\n\n` +
      `${results.join('\n\n')}\n` +
      `Total Pools: ${markets.length}</i>`;
    await updateMessage(ctx, text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  async function showPoolDetails(
    ctx: MyContext,
    poolAddress: string,
    source: 'list' | 'direct',
    poolIndex?: number,
  ) {
    try {
      await updateMessage(ctx, '<i>Loading pool details...</i>', {
        parse_mode: 'HTML',
      });
      const poolData =
        await liquidityBookServices.fetchPoolMetadata(poolAddress);

      if (!ctx.session) ctx.session = {};
      ctx.session.selectedPool = poolAddress;
      ctx.session.selectedPoolIndex = poolIndex ?? -1;

      const text = formatPoolSummary(poolData);
      const keyboard = createPoolDetailKeyboard(source, poolIndex);

      await updateMessage(ctx, `<i>${text}</i>`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch (err) {
      console.error('Error showing pool details:', err);
      if (
        // @ts-ignore krde igore
        err.message?.includes('Pool not found') ||
        // @ts-ignore krde igore

        err.message?.includes('Invalid pool')
      ) {
        await ctx.reply(
          '<i>Pool not found or invalid pool address.\n\n Use /pools to see all available pools.</i>',
        );
      } else {
        await ctx.reply(
          // @ts-ignore krde igore
          ` <i>Error loading pool details: ${String(err.message ?? err)}</i>`,
          {
            parse_mode: 'HTML',
          },
        );
      }
    }
  }

  function checkRateLimit(userId: string): boolean {
    return rateLimiter.checkRateLimit(userId);
  }

  function createPoolListKeyboard(
    items: string[],
    page: number,
    totalPages: number,
    start: number,
  ) {
    const selectionButtons = items.map((_, i) => ({
      text: `${start + i + 1}`,
      callback_data: `market:${start + i}`,
    }));

    const navigationButtons: any[] = [];
    if (page > 1)
      navigationButtons.push({
        text: 'Prev',
        callback_data: `pool:${page - 1}`,
      });
    if (page < totalPages)
      navigationButtons.push({
        text: 'Next',
        callback_data: `pool:${page + 1}`,
      });
    navigationButtons.push({ text: 'Refresh', callback_data: 'pool:refresh' });

    const keyboard: any[] = [];
    for (let i = 0; i < selectionButtons.length; i += 5)
      keyboard.push(selectionButtons.slice(i, i + 5));
    if (navigationButtons.length > 0) keyboard.push(navigationButtons);
    return keyboard;
  }

  function createPoolDetailKeyboard(
    source: 'list' | 'direct',
    poolIndex?: number,
  ) {
    const baseButtons = [
      [
        { text: 'Get Quote', callback_data: `action:quote:${poolIndex ?? -1}` },
        { text: 'Build Swap', callback_data: `action:swap:${poolIndex ?? -1}` },
      ],
    ];

    if (source === 'list')
      baseButtons.push([
        { text: 'Back to Pools', callback_data: 'back_to_pools' },
      ]);
    else
      baseButtons.push([
        { text: 'View All Pools', callback_data: 'view_all_pools' },
      ]);

    return baseButtons;
  }

  async function updateMessage(ctx: MyContext, text: string, extra?: any) {
    try {
      await ctx.editMessageText(text, extra);
    } catch {
      await ctx.reply(text, extra);
    }
  }

  return { showPoolList, showPoolDetails, checkRateLimit };
}

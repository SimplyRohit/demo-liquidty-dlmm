import { Telegraf } from 'telegraf';
import { PublicKey } from '@solana/web3.js';
import {
  BIN_STEP_CONFIGS,
  LiquidityBookServices,
} from '@saros-finance/dlmm-sdk';
import { startQuoteProcess } from './startQuoteProcess';
import { startSwapProcess } from './startSwapProcess';
import { handleSwapRequest } from './handleSwapRequest';
import { handleQuoteRequest } from './handleQuoteRequest';
import { MyContext } from '../../types';
import { handleRemoveLiquidityRequest } from './handleRemoveLiquidity';
import { handleAddLiquidityRequest } from './handleAddLiquidity';
import { showMyPoolsData } from './showMyPoolsData';
import { startAddLiquidityProcess } from './startAddLiquidityProcess';
import { startRemoveLiquidityProcess } from './startRemoveLiquidityProcess';
import { createPoolFunctions } from '../controllers/PoolController';
import { handleCreatePool } from './createPool';

export function setupCommands(
  bot: Telegraf<MyContext>,
  liquidityBookServices: LiquidityBookServices,
) {
  const poolFunctions = createPoolFunctions(liquidityBookServices);

  bot.start(async (ctx) => {
    await ctx.reply(`<i>Welcome to the Saros DLMM Bot!</i>`, {
      parse_mode: 'HTML',
    });
  });

  bot.command('pools', async (ctx) => {
    try {
      if (!ctx.session) ctx.session = {};
      if (!ctx.session.markets || ctx.session.markets.length === 0) {
        await ctx.reply('<i>Fetching pools from Saros DLMM...</i>', {
          parse_mode: 'HTML',
        });
        ctx.session.markets = await liquidityBookServices.fetchPoolAddresses();
        ctx.session.lastFetchedAt = Date.now();
        ctx.session.currentPage = 1;
      }
      await poolFunctions.showPoolList(ctx, ctx.session.currentPage ?? 1);
    } catch (err) {
      console.error('/pools error', err);
      await ctx.reply(
        `<i>Error fetching pools: ${String((err as Error)?.message ?? err)}</i>`,
        { parse_mode: 'HTML' },
      );
    }
  });

  bot.command('pool', async (ctx) => {
    try {
      const parts = (ctx.message?.text ?? '').trim().split(/\s+/);
      if (parts.length < 2) {
        await ctx.reply('<i>Usage: /pool poolAddress </i>', {
          parse_mode: 'HTML',
        });
        return;
      }
      const poolAddress = parts[1]!.trim();

      try {
        new PublicKey(poolAddress);
      } catch {
        await ctx.reply('<i>Invalid pool address format provided.</i>', {
          parse_mode: 'HTML',
        });
        return;
      }

      await poolFunctions.showPoolDetails(ctx, poolAddress, 'direct');
    } catch (err) {
      console.error('/pool error', err);
      await ctx.reply(
        `<i>Error fetching pools: ${String((err as Error)?.message ?? err)}</i>`,
        { parse_mode: 'HTML' },
      );
    }
  });

  bot.command('createpool', async (ctx) => {
    await handleCreatePool(ctx, liquidityBookServices);
  });

  async function refreshMyPools(
    ctx: MyContext,
    liquidityBookServices: LiquidityBookServices,
  ) {
    try {
      await ctx.editMessageText('<i>Refreshing pool data...</i>', {
        parse_mode: 'HTML',
      });
      await showMyPoolsData(ctx, liquidityBookServices);
    } catch (err) {
      await ctx.reply(
        `<i>Error refreshing: ${String((err as Error)?.message ?? err)}</i>`,
        { parse_mode: 'HTML' },
      );
    }
  }

  bot.command('binsteps', async (ctx) => {
    try {
      const binStepInfo = BIN_STEP_CONFIGS.map(
        (config) => `${config.binStep} `,
      ).join(', ');

      await ctx.reply(`<i>Available Bin Steps :\n${binStepInfo}\n\n</i>`, {
        parse_mode: 'HTML',
      });
    } catch (err) {
      console.error('/binsteps error', err);
      await ctx.reply('<i>Error fetching bin step information.</i>', {
        parse_mode: 'HTML',
      });
    }
  });

  bot.command('mypools', async (ctx) => {
    try {
      const parts = (ctx.message?.text ?? '').trim().split(/\s+/);
      if (parts.length < 3) {
        await ctx.reply(
          '<i>Usage: /mypools <poolAddress> <userPublicKey>\n' +
            'Example: /mypools 9P3N4QxjMumpTNNdvaNNskXu2t7VHMMXtePQB72kkSAk YourPublicKey</i>',
          { parse_mode: 'HTML' },
        );
        return;
      }
      const poolAddr = parts[1]!.trim();
      const userPubKeyStr = parts[2]!.trim();
      let userPub: PublicKey;
      let pair: PublicKey;
      try {
        userPub = new PublicKey(userPubKeyStr);
        pair = new PublicKey(poolAddr);
      } catch {
        await ctx.reply('<i>Invalid pool address or public key provided.</i>', {
          parse_mode: 'HTML',
        });
        return;
      }
      if (!ctx.session) ctx.session = {};
      ctx.session.selectedPool = poolAddr;
      ctx.session.userPublicKey = userPubKeyStr;

      await showMyPoolsData(ctx, liquidityBookServices);
    } catch (err) {
      console.error('/mypools error', err);
      await ctx.reply(
        `<i>Error fetching pool data : ${String((err as Error)?.message ?? err)}</i>`,
        { parse_mode: 'HTML' },
      );
    }
  });

  bot.on('callback_query', async (ctx) => {
    try {
      if (!('data' in ctx.callbackQuery)) return;
      const data = ctx.callbackQuery.data;

      await ctx.answerCbQuery();

      if (data.startsWith('pool:')) {
        const [, action] = data.split(':');
        if (action === 'refresh') {
          await ctx.editMessageText('<i>Refreshing all pools...</i>', {
            parse_mode: 'HTML',
          });
          ctx.session = {};
          ctx.session.markets =
            await liquidityBookServices.fetchPoolAddresses();
          ctx.session.lastFetchedAt = Date.now();
          ctx.session.currentPage = 1;
          await poolFunctions.showPoolList(ctx, 1);
          return;
        }

        const page = parseInt(action!, 10);
        if (!isNaN(page)) {
          ctx.session!.currentPage = page;
          await poolFunctions.showPoolList(ctx, page);
        }
      }

      if (data.startsWith('market:')) {
        const [, poolIndex] = data.split(':');
        const index = parseInt(poolIndex!, 10);
        const poolAddress = ctx.session?.markets?.[index];
        if (poolAddress) {
          await poolFunctions.showPoolDetails(ctx, poolAddress, 'list', index);
        }
      }

      if (data.startsWith('action:')) {
        const [, action, poolIndex] = data.split(':');
        const poolAddress =
          parseInt(poolIndex!) === -1
            ? ctx.session?.selectedPool
            : ctx.session?.markets?.[parseInt(poolIndex!)];

        if (!poolAddress) {
          await ctx.reply('<i>Invalid pool selection.</i>', {
            parse_mode: 'HTML',
          });
          return;
        }

        if (!ctx.session) ctx.session = {};
        ctx.session.selectedPool = poolAddress;
        ctx.session.selectedPoolIndex = parseInt(poolIndex!);

        switch (action) {
          case 'quote':
            await startQuoteProcess(ctx, poolAddress, liquidityBookServices);
            break;
          case 'swap':
            await startSwapProcess(ctx, poolAddress);
            break;
        }
      }

      if (data.startsWith('liquidity:')) {
        const [, action] = data.split(':');

        if (action === 'add') {
          await startAddLiquidityProcess(ctx);
        } else if (action === 'remove') {
          await startRemoveLiquidityProcess(ctx);
        }
      }

      if (data === 'mypools:refresh') {
        await refreshMyPools(ctx, liquidityBookServices);
      }

      if (data === 'back_to_pools') {
        await poolFunctions.showPoolList(ctx, ctx.session?.currentPage ?? 1);
      }

      if (data === 'view_all_pools') {
        if (!ctx.session) ctx.session = {};
        if (!ctx.session.markets || ctx.session.markets.length === 0) {
          await ctx.editMessageText(
            '<i>Fetching pools from Saros DLMM...</i>',
            {
              parse_mode: 'HTML',
            },
          );
          ctx.session.markets =
            await liquidityBookServices.fetchPoolAddresses();
          ctx.session.lastFetchedAt = Date.now();
          ctx.session.currentPage = 1;
        }
        await poolFunctions.showPoolList(ctx, ctx.session.currentPage ?? 1);
      }
    } catch (err) {
      console.error('callback_query error', err);
      try {
        await ctx.answerCbQuery('<i>Error handling action<i/>', {
          // @ts-ignore krde
          parse_mode: 'HTML',
        });
      } catch {}
    }
  });

  bot.on('text', async (ctx) => {
    if (!ctx.session || !ctx.session.selectedPool) return;

    if (ctx.session.awaitingQuote) {
      await handleQuoteRequest(
        ctx,
        ctx.session.selectedPool,
        liquidityBookServices,
      );
      ctx.session.awaitingQuote = false;
      return;
    }
    if (ctx.session.awaitingAddLiquidity) {
      await handleAddLiquidityRequest(
        ctx,
        ctx.session.selectedPool,
        liquidityBookServices,
      );
      ctx.session.awaitingAddLiquidity = false;
      return;
    }

    if (ctx.session.awaitingRemoveLiquidity) {
      await handleRemoveLiquidityRequest(
        ctx,
        ctx.session.selectedPool,
        liquidityBookServices,
      );
      ctx.session.awaitingRemoveLiquidity = false;
      return;
    }

    if (ctx.session.awaitingSwap) {
      await handleSwapRequest(
        ctx,
        ctx.session.selectedPool,
        liquidityBookServices,
      );
      ctx.session.awaitingSwap = false;
      return;
    }
  });
}

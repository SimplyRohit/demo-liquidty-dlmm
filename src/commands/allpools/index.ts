import { Telegraf } from "telegraf";
import { LiquidityBookServices, type PoolMetadata } from "@saros-finance/dlmm-sdk";
import { PublicKey, Transaction } from "@solana/web3.js";
import type { MyContext } from "../types";

// Rate limiting
const rateLimits = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 30;

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

  // Command to show all pools
  bot.command("pools", async (ctx) => {
    try {
      const userId = ctx.from?.id.toString() || 'unknown';
      
      if (!checkRateLimit(userId)) {
        await ctx.reply("⚠️ Rate limit exceeded. Please wait a moment before trying again.");
        return;
      }

      if (!ctx.session) ctx.session = {};
      if (!ctx.session.markets || ctx.session.markets.length === 0) {
        await ctx.reply("🔄 Fetching pools from Saros DLMM...");
        ctx.session.markets = await liquidityBookServices.fetchPoolAddresses();
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

  // Command to show specific pool details
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

      const poolAddress = parts[1].trim();

      // Validate pool address format
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
      const data = ctx.callbackQuery?.data;
      if (!data) return;

      const userId = ctx.from?.id.toString() || 'unknown';
      
      if (!checkRateLimit(userId)) {
        await ctx.answerCbQuery("Rate limit exceeded. Please wait.");
        return;
      }

      await ctx.answerCbQuery();

      // Handle pool navigation
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

        const page = parseInt(action, 10);
        if (!isNaN(page)) {
          ctx.session!.currentPage = page;
          await sendPoolMetadataPage(ctx, page, liquidityBookServices);
        }
      }

      // Handle market selection
      if (data.startsWith("market:")) {
        const [, poolIndex] = data.split(":");
        const index = parseInt(poolIndex, 10);
        await showMarketDetails(ctx, index, liquidityBookServices);
      }

      // Handle market actions
      if (data.startsWith("action:")) {
        const [, action, poolIndex] = data.split(":");
        await handleMarketAction(ctx, action, parseInt(poolIndex), liquidityBookServices);
      }

      // Handle back to pools
      if (data === "back_to_pools") {
        await sendPoolMetadataPage(ctx, ctx.session?.currentPage ?? 1, liquidityBookServices);
      }

      // Handle view all pools (from specific pool details)
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

  // Handle text messages for quote and swap operations
  bot.on("text", async (ctx) => {
    if (!ctx.session) return;

    // Handle quote requests
    if (ctx.session.awaitingQuote && ctx.session.selectedPool) {
      await handleQuoteRequest(ctx, ctx.session.selectedPool, liquidityBookServices);
      ctx.session.awaitingQuote = false;
      return;
    }

    // Handle add liquidity requests
    if (ctx.session.awaitingAddLiquidity && ctx.session.selectedPool) {
      await handleAddLiquidityRequest(ctx, ctx.session.selectedPool, liquidityBookServices);
      ctx.session.awaitingAddLiquidity = false;
      return;
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
    await ctx.reply("❌ No pools found on this page.");
    return;
  }

  await ctx.editMessageText(
    `🔄 Loading pool data (Page ${page}/${totalPages})...`
  ).catch(() => {
    ctx.reply(`🔄 Loading pool data (Page ${page}/${totalPages})...`);
  });

  const results = await Promise.all(
    items.map(async (address: string, index: number) => {
      try {
        const metadata = await liquidityBookServices.fetchPoolMetadata(address);
        
        // Fetch token data with error handling
        const [baseTokenResponse, quoteTokenResponse] = await Promise.all([
          fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.baseMint}`).catch(() => null),
          fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.quoteMint}`).catch(() => null)
        ]);

        if (!baseTokenResponse || !quoteTokenResponse) {
          throw new Error("Failed to fetch token data");
        }

        const baseTokenData = (await baseTokenResponse.json())[0];
        const quoteTokenData = (await quoteTokenResponse.json())[0];

        if (!baseTokenData || !quoteTokenData) {
          throw new Error("Invalid token data");
        }

        // Calculate actual token amounts
        const baseAmount = metadata.baseReserve / Math.pow(10, metadata.extra?.tokenBaseDecimal || baseTokenData.decimals);
        const quoteAmount = metadata.quoteReserve / Math.pow(10, metadata.extra?.tokenQuoteDecimal || quoteTokenData.decimals);

        // Calculate liquidity
        const baseValue = baseAmount * (baseTokenData.usdPrice || 0);
        const quoteValue = quoteAmount * (quoteTokenData.usdPrice || 0);
        const totalLiquidity = baseValue + quoteValue;

        // Calculate exchange rate
        const exchangeRate = baseAmount > 0 ? (quoteAmount / baseAmount) : 0;

        // Calculate volume (using base token volume as proxy)
        const volume24h = (baseTokenData.stats24h?.buyVolume || 0) + (baseTokenData.stats24h?.sellVolume || 0);

        // Calculate trade fee
        const tradeFeePercent = metadata.tradeFee || 0;

        const poolNumber = start + index + 1;
        const globalIndex = start + index;

        return (
          `${poolNumber}. 📊 *${baseTokenData.symbol}-${quoteTokenData.symbol}*\n` +
          `💧 *Liquidity:* $${totalLiquidity.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n` +
          `🔄 *Rate:* 1 ${baseTokenData.symbol} = ${exchangeRate.toFixed(6)} ${quoteTokenData.symbol}\n` +
          `📈 *Volume (24h):* $${volume24h.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n` +
          `💰 *Trade Fee:* ${tradeFeePercent}%\n` +
          `🏦 *Pool:* \`${address.slice(0, 8)}...${address.slice(-4)}\``
        );

      } catch (err) {
        const poolNumber = start + index + 1;
        return `${poolNumber}. ⚠️ *Error loading pool*\n🏦 \`${address.slice(0, 8)}...${address.slice(-4)}\``;
      }
    })
  );

  const text = `🏊‍♂️ *Saros Pools (Page ${page}/${totalPages})*\n\n` + 
               results.join("\n\n─────────────────\n\n") +
               `\n\n📊 Total Pools: ${markets.length}`;

  // Create navigation buttons
  const navigationButtons = [];
  const selectionButtons = [];

  // Add pool selection buttons (1-5)
  for (let i = 0; i < items.length; i++) {
    const poolNumber = start + i + 1;
    const globalIndex = start + i;
    selectionButtons.push({
      text: `${poolNumber}`,
      callback_data: `market:${globalIndex}`
    });
  }

  // Add navigation buttons
  if (page > 1) {
    navigationButtons.push({ text: "⬅️ Prev", callback_data: `pool:${page - 1}` });
  }
  if (page < totalPages) {
    navigationButtons.push({ text: "Next ➡️", callback_data: `pool:${page + 1}` });
  }
  navigationButtons.push({ text: "♻️ Refresh", callback_data: "pool:refresh" });

  const keyboard = [];
  if (selectionButtons.length > 0) {
    // Split selection buttons into rows of 5
    for (let i = 0; i < selectionButtons.length; i += 5) {
      keyboard.push(selectionButtons.slice(i, i + 5));
    }
  }
  if (navigationButtons.length > 0) {
    keyboard.push(navigationButtons);
  }

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard }
  }).catch(async () => {
    await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  });
}

async function showSpecificPoolDetails(ctx: MyContext, poolAddress: string, liquidityBookServices: LiquidityBookServices) {
  try {
    await ctx.reply("🔄 Loading pool details...");

    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);
    
    const [baseTokenResponse, quoteTokenResponse] = await Promise.all([
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.baseMint}`).catch(() => null),
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.quoteMint}`).catch(() => null)
    ]);

    if (!baseTokenResponse || !quoteTokenResponse) {
      await ctx.reply("❌ Error fetching token information.");
      return;
    }

    const baseTokenData = (await baseTokenResponse.json())[0];
    const quoteTokenData = (await quoteTokenResponse.json())[0];

    if (!baseTokenData || !quoteTokenData) {
      await ctx.reply("❌ Invalid token data received.");
      return;
    }

    // Store pool for future operations
    if (!ctx.session) ctx.session = {};
    ctx.session.selectedPool = poolAddress;
    ctx.session.selectedPoolIndex = -1; // Special index for direct pool access

    // Calculate detailed metrics
    const baseAmount = metadata.baseReserve / Math.pow(10, metadata.extra?.tokenBaseDecimal || baseTokenData.decimals);
    const quoteAmount = metadata.quoteReserve / Math.pow(10, metadata.extra?.tokenQuoteDecimal || quoteTokenData.decimals);
    
    const baseValue = baseAmount * (baseTokenData.usdPrice || 0);
    const quoteValue = quoteAmount * (quoteTokenData.usdPrice || 0);
    const totalLiquidity = baseValue + quoteValue;
    
    const exchangeRate = baseAmount > 0 ? (quoteAmount / baseAmount) : 0;
    const reverseRate = quoteAmount > 0 ? (baseAmount / quoteAmount) : 0;
    
    const volume24h = (baseTokenData.stats24h?.buyVolume || 0) + (baseTokenData.stats24h?.sellVolume || 0);
    const fees24h = volume24h * (metadata.tradeFee / 100);
    const apr = totalLiquidity > 0 ? ((fees24h * 365) / totalLiquidity) * 100 : 0;

    const detailText = 
      `🏊‍♂️ *Pool Details*\n\n` +
      `📊 *Pair:* ${baseTokenData.symbol}-${quoteTokenData.symbol}\n` +
      `🏦 *Pool Address:*\n\`${poolAddress}\`\n\n` +
      
      `💧 *Liquidity Information:*\n` +
      `• Total: $${totalLiquidity.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n` +
      `• ${baseTokenData.symbol}: ${baseAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n` +
      `• ${quoteTokenData.symbol}: ${quoteAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n\n` +
      
      `🔄 *Exchange Rates:*\n` +
      `• 1 ${baseTokenData.symbol} = ${exchangeRate.toFixed(6)} ${quoteTokenData.symbol}\n` +
      `• 1 ${quoteTokenData.symbol} = ${reverseRate.toFixed(6)} ${baseTokenData.symbol}\n\n` +
      
      `📈 *24h Statistics:*\n` +
      `• Volume: $${volume24h.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n` +
      `• Fees: $${fees24h.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n` +
      `• APR: ${apr.toFixed(2)}%\n\n` +
      
      `💰 *Trading:*\n` +
      `• Trade Fee: ${metadata.tradeFee}%\n` +
      `• ${baseTokenData.symbol} Price: $${baseTokenData.usdPrice?.toFixed(4) || 'N/A'}\n` +
      `• ${quoteTokenData.symbol} Price: $${quoteTokenData.usdPrice?.toFixed(4) || 'N/A'}\n\n` +
      
      `🔗 *Token Addresses:*\n` +
      `• ${baseTokenData.symbol}: \`${metadata.baseMint.slice(0, 8)}...${metadata.baseMint.slice(-4)}\`\n` +
      `• ${quoteTokenData.symbol}: \`${metadata.quoteMint.slice(0, 8)}...${metadata.quoteMint.slice(-4)}\``;

    const actionButtons = [
      [
        { text: "💱 Get Quote", callback_data: `action:quote:-1` },
        { text: "🔄 Build Swap", callback_data: `action:swap:-1` }
      ],
      [
        { text: "➕ Add Liquidity", callback_data: `action:add_liquidity:-1` }
      ],
      [
        { text: "🔍 View All Pools", callback_data: "view_all_pools" }
      ]
    ];

    await ctx.reply(detailText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: actionButtons }
    });

  } catch (err) {
    console.error("Error showing specific pool details:", err);
    if (err.message?.includes("Pool not found") || err.message?.includes("Invalid pool")) {
      await ctx.reply(
        "❌ Pool not found or invalid pool address.\n\n" +
        "💡 Use `/pools` to see all available pools."
      );
    } else {
      await ctx.reply(`❌ Error loading pool details: ${String((err as Error)?.message ?? err)}`);
    }
  }
}

async function showMarketDetails(ctx: MyContext, poolIndex: number, liquidityBookServices: LiquidityBookServices) {
  try {
    if (!ctx.session?.markets || poolIndex >= ctx.session.markets.length) {
      await ctx.reply("❌ Invalid pool selection.");
      return;
    }

    const poolAddress = ctx.session.markets[poolIndex];
    await ctx.editMessageText("🔄 Loading detailed market information...");

    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);
    
    const [baseTokenResponse, quoteTokenResponse] = await Promise.all([
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.baseMint}`),
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.quoteMint}`)
    ]);

    const baseTokenData = (await baseTokenResponse.json())[0];
    const quoteTokenData = (await quoteTokenResponse.json())[0];

    // Calculate detailed metrics
    const baseAmount = metadata.baseReserve / Math.pow(10, metadata.extra?.tokenBaseDecimal || baseTokenData.decimals);
    const quoteAmount = metadata.quoteReserve / Math.pow(10, metadata.extra?.tokenQuoteDecimal || quoteTokenData.decimals);
    
    const baseValue = baseAmount * (baseTokenData.usdPrice || 0);
    const quoteValue = quoteAmount * (quoteTokenData.usdPrice || 0);
    const totalLiquidity = baseValue + quoteValue;
    
    const exchangeRate = baseAmount > 0 ? (quoteAmount / baseAmount) : 0;
    const reverseRate = quoteAmount > 0 ? (baseAmount / quoteAmount) : 0;
    
    const volume24h = (baseTokenData.stats24h?.buyVolume || 0) + (baseTokenData.stats24h?.sellVolume || 0);
    const fees24h = volume24h * (metadata.tradeFee / 100);
    const apr = totalLiquidity > 0 ? ((fees24h * 365) / totalLiquidity) * 100 : 0;

    const detailText = 
      `🏊‍♂️ *Market Details*\n\n` +
      `📊 *Pair:* ${baseTokenData.symbol}-${quoteTokenData.symbol}\n` +
      `🏦 *Pool Address:*\n\`${poolAddress}\`\n\n` +
      
      `💧 *Liquidity Information:*\n` +
      `• Total: $${totalLiquidity.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n` +
      `• ${baseTokenData.symbol}: ${baseAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n` +
      `• ${quoteTokenData.symbol}: ${quoteAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n\n` +
      
      `🔄 *Exchange Rates:*\n` +
      `• 1 ${baseTokenData.symbol} = ${exchangeRate.toFixed(6)} ${quoteTokenData.symbol}\n` +
      `• 1 ${quoteTokenData.symbol} = ${reverseRate.toFixed(6)} ${baseTokenData.symbol}\n\n` +
      
      `📈 *24h Statistics:*\n` +
      `• Volume: $${volume24h.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n` +
      `• Fees: $${fees24h.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n` +
      `• APR: ${apr.toFixed(2)}%\n\n` +
      
      `💰 *Trading:*\n` +
      `• Trade Fee: ${metadata.tradeFee}%\n` +
      `• ${baseTokenData.symbol} Price: $${baseTokenData.usdPrice?.toFixed(4) || 'N/A'}\n` +
      `• ${quoteTokenData.symbol} Price: $${quoteTokenData.usdPrice?.toFixed(4) || 'N/A'}`;

    const actionButtons = [
      [
        { text: "💱 Get Quote", callback_data: `action:quote:${poolIndex}` },
        { text: "🔄 Build Swap", callback_data: `action:swap:${poolIndex}` }
      ],
      [
        { text: "➕ Add Liquidity", callback_data: `action:add_liquidity:${poolIndex}` }
      ],
      [
        { text: "🔙 Back to Pools", callback_data: "back_to_pools" }
      ]
    ];

    await ctx.editMessageText(detailText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: actionButtons }
    });

  } catch (err) {
    console.error("Error showing market details:", err);
    await ctx.reply("❌ Error loading market details. Please try again.");
  }
}

async function handleMarketAction(ctx: MyContext, action: string, poolIndex: number, liquidityBookServices: LiquidityBookServices) {
  const poolAddress = poolIndex === -1 
    ? ctx.session?.selectedPool  // Direct pool access via /pool command
    : ctx.session?.markets?.[poolIndex];  // Pool from list
  
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
      await startQuoteProcess(ctx, poolAddress, liquidityBookServices);
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
        { parse_mode: 'Markdown' }
      );
      break;

    default:
      await ctx.reply("❌ Unknown action.");
  }
}

async function startQuoteProcess(ctx: MyContext, poolAddress: string, liquidityBookServices: LiquidityBookServices) {
  try {
    // Fetch pool metadata to show token info
    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);
    
    const [baseTokenResponse, quoteTokenResponse] = await Promise.all([
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.baseMint}`).catch(() => null),
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.quoteMint}`).catch(() => null)
    ]);

    if (!baseTokenResponse || !quoteTokenResponse) {
      await ctx.reply("❌ Error fetching token information.");
      return;
    }

    const baseTokenData = (await baseTokenResponse.json())[0];
    const quoteTokenData = (await quoteTokenResponse.json())[0];

    if (!baseTokenData || !quoteTokenData) {
      await ctx.reply("❌ Invalid token data.");
      return;
    }

    await ctx.reply(
      `💱 *Get Quote*\n\n` +
      `📊 *Pool:* ${baseTokenData.symbol}-${quoteTokenData.symbol}\n` +
      `🏦 *Address:* \`${poolAddress}\`\n\n` +
      `To get a quote, please send the amount you want to swap:\n\n` +
      `*Format:* \`amount\`\n` +
      `*Example:* \`1.5\` (to swap 1.5 ${baseTokenData.symbol})\n\n` +
      `💡 *Note:* Quote will show you how many ${quoteTokenData.symbol} you'll receive`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: "🔙 Back to Market", callback_data: `market:${ctx.session?.selectedPoolIndex || 0}` }
          ]]
        }
      }
    );

    // Set the context for next message
    ctx.session!.awaitingQuote = true;

  } catch (err) {
    console.error("Error in startQuoteProcess:", err);
    await ctx.reply("❌ Error starting quote process. Please try again.");
  }
}

async function startSwapProcess(ctx: MyContext, poolAddress: string, liquidityBookServices: LiquidityBookServices) {
  try {
    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);
    
    const [baseTokenResponse, quoteTokenResponse] = await Promise.all([
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.baseMint}`).catch(() => null),
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.quoteMint}`).catch(() => null)
    ]);

    if (!baseTokenResponse || !quoteTokenResponse) {
      await ctx.reply("❌ Error fetching token information.");
      return;
    }

    const baseTokenData = (await baseTokenResponse.json())[0];
    const quoteTokenData = (await quoteTokenResponse.json())[0];

    await ctx.reply(
      `🔄 *Build Swap Transaction*\n\n` +
      `📊 *Pool:* ${baseTokenData.symbol}-${quoteTokenData.symbol}\n` +
      `🏦 *Address:* \`${poolAddress}\`\n\n` +
      `To build a swap transaction, please send:\n\n` +
      `*Format:* \`amount your_public_key\`\n` +
      `*Example:* \`1.5 YOUR_WALLET_ADDRESS\`\n\n` +
      `💡 *Note:* This will create an unsigned transaction that you can sign and execute`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: "🔙 Back to Market", callback_data: `market:${ctx.session?.selectedPoolIndex || 0}` }
          ]]
        }
      }
    );

    // Set the context for next message
    ctx.session!.awaitingSwap = true;

  } catch (err) {
    console.error("Error in startSwapProcess:", err);
    await ctx.reply("❌ Error starting swap process. Please try again.");
  }
}

async function handleQuoteRequest(ctx: MyContext, poolAddress: string, liquidityBookServices: LiquidityBookServices) {
  try {
    const amountStr = ctx.message?.text?.trim();
    if (!amountStr) {
      await ctx.reply("❌ Please provide a valid amount.");
      return;
    }

    const amountFloat = parseFloat(amountStr);
    if (isNaN(amountFloat) || amountFloat <= 0) {
      await ctx.reply("❌ Please provide a valid positive number.");
      return;
    }

    await ctx.reply("🔄 Getting quote...");

    // Fetch pool metadata
    let metadata: PoolMetadata;
    try {
      metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);
    } catch (err) {
      await ctx.reply(`❌ Error fetching pool metadata: ${String((err as Error)?.message ?? err)}`);
      return;
    }

    const baseReserve = Number(metadata.baseReserve || 0);
    const quoteReserve = Number(metadata.quoteReserve || 0);
    
    if (baseReserve === 0 || quoteReserve === 0) {
      await ctx.reply(
        `⚠️ Pool has insufficient liquidity:\n` +
        `Base Reserve: ${baseReserve}\nQuote Reserve: ${quoteReserve}\n` +
        `Cannot provide quote for this pool.`
      );
      return;
    }

    const baseDecimals = Number(metadata.extra?.tokenBaseDecimal ?? 9);
    const quoteDecimals = Number(metadata.extra?.tokenQuoteDecimal ?? 9);
    const amountBigInt = BigInt(Math.floor(amountFloat * Math.pow(10, baseDecimals)));

    let quoteData;
    let actualAmount = amountBigInt;
    let actualAmountStr = amountStr;

    try {
      quoteData = await liquidityBookServices.getQuote({
        amount: amountBigInt,
        isExactInput: true,
        swapForY: true, 
        pair: new PublicKey(poolAddress),
        tokenBase: new PublicKey(metadata.baseMint),
        tokenQuote: new PublicKey(metadata.quoteMint),
        tokenBaseDecimal: baseDecimals,
        tokenQuoteDecimal: quoteDecimals,
        slippage: 0.5, 
      });
    } catch (err: any) {
      if (err.message?.includes("too many bins")) {
        actualAmount = amountBigInt / BigInt(10);
        actualAmountStr = (amountFloat / 10).toString();
        
        try {
          quoteData = await liquidityBookServices.getQuote({
            amount: actualAmount,
            isExactInput: true,
            swapForY: true,
            pair: new PublicKey(poolAddress),
            tokenBase: new PublicKey(metadata.baseMint),
            tokenQuote: new PublicKey(metadata.quoteMint),
            tokenBaseDecimal: baseDecimals,
            tokenQuoteDecimal: quoteDecimals,
            slippage: 0.5,
          });
          
          await ctx.reply(`⚠️ Original amount too large, showing quote for reduced amount (${actualAmountStr})`);
        } catch (secondErr) {
          throw err;
        }
      } else {
        throw err;
      }
    }

    // Get token information for better display
    const [baseTokenResponse, quoteTokenResponse] = await Promise.all([
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.baseMint}`).catch(() => null),
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.quoteMint}`).catch(() => null)
    ]);

    let baseSymbol = "BASE";
    let quoteSymbol = "QUOTE";

    if (baseTokenResponse && quoteTokenResponse) {
      const baseTokenData = (await baseTokenResponse.json())[0];
      const quoteTokenData = (await quoteTokenResponse.json())[0];
      if (baseTokenData) baseSymbol = baseTokenData.symbol;
      if (quoteTokenData) quoteSymbol = quoteTokenData.symbol;
    }

    // Calculate readable amounts
    const amountOutReadable = quoteData.amountOut ? 
      (Number(quoteData.amountOut) / Math.pow(10, quoteDecimals)).toFixed(6) : 'N/A';

    await ctx.reply(
      `💱 *Quote Result*\n\n` +
      `📊 **${baseSymbol}-${quoteSymbol}** Pool\n` +
      `🏦 \`${poolAddress.slice(0, 8)}...${poolAddress.slice(-4)}\`\n\n` +
      `📥 **Input:** ${actualAmountStr} ${baseSymbol}\n` +
      `📤 **Output:** ${amountOutReadable} ${quoteSymbol}\n` +
      `💥 **Price Impact:** ${quoteData.priceImpact ?? 'N/A'}%\n` +
      `💰 **Trade Fee:** ${metadata.tradeFee}%\n\n` +
      `📊 **Pool Liquidity:**\n` +
      `• ${baseSymbol} Reserve: ${(baseReserve / Math.pow(10, baseDecimals)).toLocaleString()}\n` +
      `• ${quoteSymbol} Reserve: ${(quoteReserve / Math.pow(10, quoteDecimals)).toLocaleString()}`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Build Swap", callback_data: `action:swap:${ctx.session?.selectedPoolIndex || 0}` }],
            [{ text: "🔙 Back to Market", callback_data: `market:${ctx.session?.selectedPoolIndex || 0}` }]
          ]
        }
      }
    );

  } catch (err) {
    console.error("Quote error:", err);
    await ctx.reply(`❌ Error getting quote: ${String((err as Error)?.message ?? err)}`);
  }
}

async function handleSwapRequest(ctx: MyContext, poolAddress: string, liquidityBookServices: LiquidityBookServices) {
  try {
    const parts = ctx.message?.text?.trim().split(/\s+/) || [];
    if (parts.length < 2) {
      await ctx.reply(
        "❌ Invalid format!\n\n" +
        "*Required:* `amount your_wallet_address`\n" +
        "*Example:* `1.5 YOUR_WALLET_ADDRESS`",
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const amountStr = parts[0].trim();
    const userPubKeyStr = parts[1].trim();

    const amountFloat = parseFloat(amountStr);
    if (isNaN(amountFloat) || amountFloat <= 0) {
      await ctx.reply("❌ Please provide a valid positive amount.");
      return;
    }

    let userPub: PublicKey;
    try {
      userPub = new PublicKey(userPubKeyStr);
    } catch {
      await ctx.reply("❌ Invalid wallet address provided.");
      return;
    }

    await ctx.reply("🔄 Building swap transaction...");

    // Fetch pool metadata
    let metadata: PoolMetadata;
    try {
      metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);
    } catch (err) {
      await ctx.reply(`❌ Error fetching pool metadata: ${String((err as Error)?.message ?? err)}`);
      return;
    }

    const baseDecimals = Number(metadata.extra?.tokenBaseDecimal ?? 9);
    const quoteDecimals = Number(metadata.extra?.tokenQuoteDecimal ?? 9);
    const amountBigInt = BigInt(Math.floor(amountFloat * Math.pow(10, baseDecimals)));

    // Get quote first
    const quoteData = await liquidityBookServices.getQuote({
      amount: amountBigInt,
      isExactInput: true,
      swapForY: true,
      pair: new PublicKey(poolAddress),
      tokenBase: new PublicKey(metadata.baseMint),
      tokenQuote: new PublicKey(metadata.quoteMint),
      tokenBaseDecimal: baseDecimals,
      tokenQuoteDecimal: quoteDecimals,
      slippage: 0.5,
    });

    // Build the swap transaction
    const swapResult = await liquidityBookServices.swap({
      amount: (quoteData as any).amount ?? amountBigInt,
      tokenMintX: new PublicKey(metadata.baseMint),
      tokenMintY: new PublicKey(metadata.quoteMint),
      otherAmountOffset: (quoteData as any).otherAmountOffset ?? 0,
      isExactInput: true,
      swapForY: true,
      pair: new PublicKey(poolAddress),
      payer: userPub,
    });

    // Handle different possible return structures
    const txCandidate: any = swapResult?.tx ?? swapResult?.transaction ?? swapResult;
    if (!txCandidate || typeof txCandidate.serialize !== "function") {
      await ctx.reply("❌ SDK did not return a serializable transaction object.");
      return;
    }

    // Set recent blockhash and fee payer if not already set
    const latest = await liquidityBookServices.connection.getLatestBlockhash();
    if (!txCandidate.recentBlockhash) txCandidate.recentBlockhash = latest.blockhash;
    if (!txCandidate.feePayer) txCandidate.feePayer = userPub;

    const serialized = txCandidate.serialize({ requireAllSignatures: false, verifySignatures: false });
    const base64Tx = Buffer.from(serialized).toString("base64");

    // Get token information for better display
    const [baseTokenResponse, quoteTokenResponse] = await Promise.all([
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.baseMint}`).catch(() => null),
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.quoteMint}`).catch(() => null)
    ]);

    let baseSymbol = "BASE";
    let quoteSymbol = "QUOTE";

    if (baseTokenResponse && quoteTokenResponse) {
      const baseTokenData = (await baseTokenResponse.json())[0];
      const quoteTokenData = (await quoteTokenResponse.json())[0];
      if (baseTokenData) baseSymbol = baseTokenData.symbol;
      if (quoteTokenData) quoteSymbol = quoteTokenData.symbol;
    }

    const amountOutReadable = quoteData.amountOut ? 
      (Number(quoteData.amountOut) / Math.pow(10, quoteDecimals)).toFixed(6) : 'N/A';

    await ctx.reply(
      `✅ **Swap Transaction Built Successfully!**\n\n` +
      `📊 **Pool:** ${baseSymbol}-${quoteSymbol}\n` +
      `🏦 **Pool Address:** \`${poolAddress.slice(0, 8)}...${poolAddress.slice(-4)}\`\n` +
      `👤 **Wallet:** \`${userPubKeyStr.slice(0, 8)}...${userPubKeyStr.slice(-4)}\`\n\n` +
      `📥 **Input:** ${amountStr} ${baseSymbol}\n` +
      `📤 **Expected Output:** ${amountOutReadable} ${quoteSymbol}\n` +
      `💥 **Price Impact:** ${quoteData.priceImpact ?? 'N/A'}%\n\n` +
      `🔐 **Transaction (Base64):**\n\`\`\`\n${base64Tx}\n\`\`\`\n\n` +
      `💡 **Next Steps:**\n` +
      `1. Copy the transaction above\n` +
      `2. Sign it with your wallet\n` +
      `3. Submit to the network`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "💱 Get New Quote", callback_data: `action:quote:${ctx.session?.selectedPoolIndex || 0}` }],
            [{ text: "🔙 Back to Market", callback_data: `market:${ctx.session?.selectedPoolIndex || 0}` }]
          ]
        }
      }
    );

  } catch (err) {
    console.error("Swap build error:", err);
    await ctx.reply(`❌ Error building swap transaction: ${String((err as Error)?.message ?? err)}`);
  }
}

async function startAddLiquidityProcess(ctx: MyContext, poolAddress: string, liquidityBookServices: LiquidityBookServices) {
  try {
    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);
    
    const [baseTokenResponse, quoteTokenResponse] = await Promise.all([
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.baseMint}`).catch(() => null),
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.quoteMint}`).catch(() => null)
    ]);

    if (!baseTokenResponse || !quoteTokenResponse) {
      await ctx.reply("❌ Error fetching token information.");
      return;
    }

    const baseTokenData = (await baseTokenResponse.json())[0];
    const quoteTokenData = (await quoteTokenResponse.json())[0];

    await ctx.reply(
      `➕ *Add Liquidity*\n\n` +
      `📊 *Pool:* ${baseTokenData.symbol}-${quoteTokenData.symbol}\n` +
      `🏦 *Address:* \`${poolAddress}\`\n\n` +
      `To add liquidity, please send:\n\n` +
      `*Format:* \`amountX amountY your_wallet_address binRangeLower binRangeUpper\`\n` +
      `*Example:* \`10 10 YOUR_WALLET_ADDRESS -10 10\`\n\n` +
      `**Parameters:**\n` +
      `• amountX: Amount of ${baseTokenData.symbol} to add\n` +
      `• amountY: Amount of ${quoteTokenData.symbol} to add\n` +
      `• wallet: Your wallet address\n` +
      `• binRangeLower: Lower bin range (e.g., -10)\n` +
      `• binRangeUpper: Upper bin range (e.g., 10)\n\n` +
      `💡 *Note:* This will create unsigned transactions for you to sign`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: "🔙 Back to Market", callback_data: `market:${ctx.session?.selectedPoolIndex || 0}` }
          ]]
        }
      }
    );

    // Set the context for next message
    ctx.session!.awaitingAddLiquidity = true;

  } catch (err) {
    console.error("Error in startAddLiquidityProcess:", err);
    await ctx.reply("❌ Error starting add liquidity process. Please try again.");
  }
}

async function handleAddLiquidityRequest(ctx: MyContext, poolAddress: string, liquidityBookServices: LiquidityBookServices) {
  try {
    const parts = ctx.message?.text?.trim().split(/\s+/) || [];
    if (parts.length < 5) {
      await ctx.reply(
        "❌ Invalid format!\n\n" +
        "*Required:* `amountX amountY wallet_address binRangeLower binRangeUpper`\n" +
        "*Example:* `10 10 YOUR_WALLET_ADDRESS -10 10`",
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const amountXStr = parts[0].trim();
    const amountYStr = parts[1].trim();
    const userPubKeyStr = parts[2].trim();
    const binRangeLower = parseInt(parts[3]);
    const binRangeUpper = parseInt(parts[4]);

    const amountX = parseFloat(amountXStr);
    const amountY = parseFloat(amountYStr);

    if (isNaN(amountX) || isNaN(amountY) || amountX <= 0 || amountY <= 0) {
      await ctx.reply("❌ Please provide valid positive amounts.");
      return;
    }

    if (isNaN(binRangeLower) || isNaN(binRangeUpper)) {
      await ctx.reply("❌ Please provide valid bin range values.");
      return;
    }

    let userPub: PublicKey;
    try {
      userPub = new PublicKey(userPubKeyStr);
    } catch {
      await ctx.reply("❌ Invalid wallet address provided.");
      return;
    }

    await ctx.reply("🔄 Building add liquidity transactions...");

    // Fetch pool metadata
    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);
    const pair = new PublicKey(poolAddress);

    // Get token information
    const [baseTokenResponse, quoteTokenResponse] = await Promise.all([
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.baseMint}`).catch(() => null),
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.quoteMint}`).catch(() => null)
    ]);

    let baseSymbol = "BASE";
    let quoteSymbol = "QUOTE";
    let baseDecimals = Number(metadata.extra?.tokenBaseDecimal ?? 9);
    let quoteDecimals = Number(metadata.extra?.tokenQuoteDecimal ?? 9);

    if (baseTokenResponse && quoteTokenResponse) {
      const baseTokenData = (await baseTokenResponse.json())[0];
      const quoteTokenData = (await quoteTokenResponse.json())[0];
      if (baseTokenData) {
        baseSymbol = baseTokenData.symbol;
        baseDecimals = baseTokenData.decimals;
      }
      if (quoteTokenData) {
        quoteSymbol = quoteTokenData.symbol;
        quoteDecimals = quoteTokenData.decimals;
      }
    }

    // Get pair info for active bin
    const pairInfo = await liquidityBookServices.getPairAccount(pair);
    const activeBin = pairInfo.activeId;

    // Check if user has existing positions
    const positions = await liquidityBookServices.getUserPositions({
      payer: userPub,
      pair,
    });

    // Convert amounts to wei (smallest unit)
    const convertBalanceToWei = (amount: number, decimals: number): bigint => {
      return BigInt(Math.floor(amount * Math.pow(10, decimals)));
    };

    const amountXWei = Number(convertBalanceToWei(amountX, baseDecimals));
    const amountYWei = Number(convertBalanceToWei(amountY, quoteDecimals));

    const actualBinRange = [activeBin + binRangeLower, activeBin + binRangeUpper];

    // Create a mock transaction array (in real implementation, this would create actual transactions)
    const transactionSteps = [
      "1. Initialize bin arrays if needed",
      "2. Create position if it doesn't exist", 
      "3. Add liquidity to the position"
    ];

    const liquidityInfo = 
      `➕ **Add Liquidity Transaction Ready**\n\n` +
      `📊 **Pool:** ${baseSymbol}-${quoteSymbol}\n` +
      `🏦 **Pool Address:** \`${poolAddress.slice(0, 8)}...${poolAddress.slice(-4)}\`\n` +
      `👤 **Wallet:** \`${userPubKeyStr.slice(0, 8)}...${userPubKeyStr.slice(-4)}\`\n\n` +
      
      `💰 **Liquidity Amounts:**\n` +
      `• ${baseSymbol}: ${amountX} (${amountXWei} base units)\n` +
      `• ${quoteSymbol}: ${amountY} (${amountYWei} quote units)\n\n` +
      
      `🎯 **Position Details:**\n` +
      `• Active Bin: ${activeBin}\n` +
      `• Relative Range: [${binRangeLower}, ${binRangeUpper}]\n` +
      `• Actual Bin Range: [${actualBinRange[0]}, ${actualBinRange[1]}]\n` +
      `• Existing Positions: ${positions.length}\n\n` +
      
      `🔄 **Transaction Steps:**\n` +
      transactionSteps.map(step => `${step}`).join('\n') + '\n\n' +
      
      `⚠️ **Important Notes:**\n` +
      `• Multiple transactions may be required\n` +
      `• Each transaction needs to be signed separately\n` +
      `• Ensure you have sufficient token balances\n` +
      `• Gas fees will apply to each transaction\n\n` +
      
      `💡 **Next Steps:**\n` +
      `In a full implementation, you would:\n` +
      `1. Receive unsigned transactions\n` +
      `2. Sign them with your wallet\n` +
      `3. Submit to the Solana network\n\n` +
      
      `🚧 **Implementation Status:**\n` +
      `This is a preview of the add liquidity process. The actual transaction building requires additional SDK integration for:\n` +
      `• Bin array initialization\n` +
      `• Position creation/management\n` +
      `• Liquidity distribution calculations`;

    await ctx.reply(liquidityInfo, { 
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "💱 Get Quote Instead", callback_data: `action:quote:${ctx.session?.selectedPoolIndex || 0}` }],
          [{ text: "🔙 Back to Market", callback_data: `market:${ctx.session?.selectedPoolIndex || 0}` }]
        ]
      }
    });

  } catch (err) {
    console.error("Add liquidity error:", err);
    await ctx.reply(`❌ Error building add liquidity transactions: ${String((err as Error)?.message ?? err)}`);
  }
}
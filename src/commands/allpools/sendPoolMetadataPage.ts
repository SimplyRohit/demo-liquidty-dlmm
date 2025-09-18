import type { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import type { MyContext } from "../../types";

export async function sendPoolMetadataPage(ctx: MyContext, page: number, liquidityBookServices: LiquidityBookServices) {
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
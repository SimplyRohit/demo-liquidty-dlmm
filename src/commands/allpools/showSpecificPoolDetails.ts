import type { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import type { MyContext } from "../../types";

export async function showSpecificPoolDetails(
  ctx: MyContext,
  poolAddress: string,
  liquidityBookServices: LiquidityBookServices
) {
  try {
    await ctx.reply("🔄 Loading pool details...");

    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);

    const [baseTokenResponse, quoteTokenResponse] = await Promise.all([
      fetch(
        `https://lite-api.jup.ag/ultra/v1/search?query=${metadata.baseMint}`
      ).catch(() => null),
      fetch(
        `https://lite-api.jup.ag/ultra/v1/search?query=${metadata.quoteMint}`
      ).catch(() => null),
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
    const baseAmount =
      metadata.baseReserve /
      Math.pow(10, metadata.extra?.tokenBaseDecimal || baseTokenData.decimals);
    const quoteAmount =
      metadata.quoteReserve /
      Math.pow(
        10,
        metadata.extra?.tokenQuoteDecimal || quoteTokenData.decimals
      );

    const baseValue = baseAmount * (baseTokenData.usdPrice || 0);
    const quoteValue = quoteAmount * (quoteTokenData.usdPrice || 0);
    const totalLiquidity = baseValue + quoteValue;

    const exchangeRate = baseAmount > 0 ? quoteAmount / baseAmount : 0;
    const reverseRate = quoteAmount > 0 ? baseAmount / quoteAmount : 0;

    const volume24h =
      (baseTokenData.stats24h?.buyVolume || 0) +
      (baseTokenData.stats24h?.sellVolume || 0);
    const fees24h = volume24h * (metadata.tradeFee / 100);
    const apr =
      totalLiquidity > 0 ? ((fees24h * 365) / totalLiquidity) * 100 : 0;

    const detailText =
      `🏊‍♂️ *Pool Details*\n\n` +
      `📊 *Pair:* ${baseTokenData.symbol}-${quoteTokenData.symbol}\n` +
      `🏦 *Pool Address:*\n\`${poolAddress}\`\n\n` +
      `💧 *Liquidity Information:*\n` +
      `• Total: $${totalLiquidity.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}\n` +
      `• ${baseTokenData.symbol}: ${baseAmount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}\n` +
      `• ${quoteTokenData.symbol}: ${quoteAmount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}\n\n` +
      `🔄 *Exchange Rates:*\n` +
      `• 1 ${baseTokenData.symbol} = ${exchangeRate.toFixed(6)} ${
        quoteTokenData.symbol
      }\n` +
      `• 1 ${quoteTokenData.symbol} = ${reverseRate.toFixed(6)} ${
        baseTokenData.symbol
      }\n\n` +
      `📈 *24h Statistics:*\n` +
      `• Volume: $${volume24h.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}\n` +
      `• Fees: $${fees24h.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}\n` +
      `• APR: ${apr.toFixed(2)}%\n\n` +
      `💰 *Trading:*\n` +
      `• Trade Fee: ${metadata.tradeFee}%\n` +
      `• ${baseTokenData.symbol} Price: $${baseTokenData.usdPrice?.toFixed(4) ||
        "N/A"}\n` +
      `• ${quoteTokenData.symbol} Price: $${quoteTokenData.usdPrice?.toFixed(
        4
      ) || "N/A"}\n\n` +
      `🔗 *Token Addresses:*\n` +
      `• ${baseTokenData.symbol}: \`${metadata.baseMint.slice(
        0,
        8
      )}...${metadata.baseMint.slice(-4)}\`\n` +
      `• ${quoteTokenData.symbol}: \`${metadata.quoteMint.slice(
        0,
        8
      )}...${metadata.quoteMint.slice(-4)}\``;

    const actionButtons = [
      [
        { text: "💱 Get Quote", callback_data: `action:quote:-1` },
        { text: "🔄 Build Swap", callback_data: `action:swap:-1` },
      ],
      [{ text: "➕ Add Liquidity", callback_data: `action:add_liquidity:-1` }],
      [{ text: "🔍 View All Pools", callback_data: "view_all_pools" }],
    ];

    await ctx.reply(detailText, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: actionButtons },
    });
  } catch (err) {
    console.error("Error showing specific pool details:", err);
    if (
      err.message?.includes("Pool not found") ||
      err.message?.includes("Invalid pool")
    ) {
      await ctx.reply(
        "❌ Pool not found or invalid pool address.\n\n" +
          "💡 Use `/pools` to see all available pools."
      );
    } else {
      await ctx.reply(
        `❌ Error loading pool details: ${String(
          (err as Error)?.message ?? err
        )}`
      );
    }
  }
}

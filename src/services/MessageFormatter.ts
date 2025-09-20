import type { PoolData } from "../types";

export class MessageFormatter {
  static formatPoolSummary(poolData: PoolData, index?: number): string {
    const { baseToken, quoteToken, metrics, metadata } = poolData;

    const baseIsUnknown = baseToken.symbol === "UNKNOWN";
    const quoteIsUnknown = quoteToken.symbol === "UNKNOWN";

    const baseSymbol = baseIsUnknown
      ? "No data available (devnet)"
      : baseToken.symbol;

    const quoteSymbol = quoteIsUnknown
      ? "No data available (devnet)"
      : quoteToken.symbol;

    const liquidity = metrics.totalLiquidity
      ? `$${metrics.totalLiquidity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "No data available (devnet)";

    const rate =
      !baseIsUnknown && !quoteIsUnknown
        ? `1 ${baseToken.symbol} = ${metrics.exchangeRate.toFixed(6)} ${quoteToken.symbol}`
        : "No data available (devnet)";

    const volume =
      !baseIsUnknown && !quoteIsUnknown
        ? `$${metrics.volume24h.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "No data available (devnet)";

    return (
      `${index ? `${index}. ` : ""}\n` +
      `Pool: ${metadata.poolAddress}\n` +
      `Base Mint: \n${metadata.baseMint}\n` +
      `Quote Mint: \n${metadata.quoteMint}\n` +
      `Token: ${baseSymbol}-${quoteSymbol}\n` +
      `Liquidity: ${liquidity}\n` +
      `Rate: ${rate}\n` +
      `Volume(24h): ${volume}\n` +
      `Trade Fee: ${metadata.tradeFee}%`
    );
  }

  static formatPoolDetails(poolData: PoolData): string {
    const { baseToken, quoteToken, metrics, metadata } = poolData;

    const baseIsUnknown = baseToken.symbol === "UNKNOWN";
    const quoteIsUnknown = quoteToken.symbol === "UNKNOWN";

    const baseSymbol = baseIsUnknown
      ? "No data available (devnet)"
      : baseToken.symbol;

    const quoteSymbol = quoteIsUnknown
      ? "No data available (devnet)"
      : quoteToken.symbol;

    let liquidityInfo: string;
    if (baseIsUnknown || quoteIsUnknown) {
      const baseReserve =
        Number(metadata.baseReserve) / 10 ** metadata.extra.tokenBaseDecimal;
      const quoteReserve =
        Number(metadata.quoteReserve) / 10 ** metadata.extra.tokenQuoteDecimal;

      liquidityInfo =
        `• Total: No data available (devnet)\n` +
        `• Base: ${baseReserve.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
        `• Quote: ${quoteReserve.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else {
      const baseReserve =
        Number(metadata.baseReserve) / 10 ** metadata.extra.tokenBaseDecimal;
      const quoteReserve =
        Number(metadata.quoteReserve) / 10 ** metadata.extra.tokenQuoteDecimal;

      liquidityInfo =
        `• Total: $${metrics.totalLiquidity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
        `• ${baseToken.symbol}: ${baseReserve.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
        `• ${quoteToken.symbol}: ${quoteReserve.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    const stats =
      baseIsUnknown || quoteIsUnknown
        ? `• Volume: No data available (devnet)\n` +
          `• Fees: No data available (devnet)\n` +
          `• APR: No data available (devnet)`
        : `• Volume: $${metrics.volume24h.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
          `• Fees: $${metrics.fees24h.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
          `• APR: ${metrics.apr.toFixed(2)}%`;

    const trading =
      `• Trade Fee: ${metadata.tradeFee}%\n` +
      `• ${baseIsUnknown ? `Base: No price available` : `${baseToken.symbol} Price: $${baseToken.usdPrice?.toFixed(4) || "N/A"}`}\n` +
      `• ${quoteIsUnknown ? `Quote: No price available` : `${quoteToken.symbol} Price: $${quoteToken.usdPrice?.toFixed(4) || "N/A"}`}`;

    const tokenAddresses =
      `• Base: \`${metadata.baseMint}\`\n` +
      `• Quote: \`${metadata.quoteMint}\``;

    return (
      "```\n" +
      `Pool Details*\n\n` +
      `Base Mint: \n${metadata.baseMint}\n` +
      `Quote Mint: \n${metadata.quoteMint}\n` +
      `Pair: ${baseSymbol}-${quoteSymbol}\n` +
      `Pool Address:\n\`${metadata.poolAddress}\`\n\n` +
      `Liquidity Information:\n${liquidityInfo}\n\n` +
      `24h Statistics:\n${stats}\n\n` +
      `Trading:*\n${trading}\n\n` +
      `Token Addresses:\n${tokenAddresses}\n\n` +
      "```"
    );
  }
}

import type { PoolData } from "../types";

export class MessageFormatter {
  static formatPoolSummary(poolData: PoolData, index?: number): string {
    const { baseToken, quoteToken, metrics, address } = poolData;

    return (
      `${baseToken.symbol}-${quoteToken.symbol}*\n` +
      `Liquidity: $${metrics.totalLiquidity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
      `Rate: 1 ${baseToken.symbol} = ${metrics.exchangeRate.toFixed(6)} ${quoteToken.symbol}\n` +
      `Volume(24h): $${metrics.volume24h.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
      `Trade Fee: ${poolData.metadata.tradeFee}%\n` +
      `Pool: ${address}`
    );
  }

  static formatPoolDetails(poolData: PoolData): string {
    const { baseToken, quoteToken, metrics, address, metadata } = poolData;

    return (
      `🏊‍♂️ *Pool Details*\n\n` +
      `📊 *Pair:* ${baseToken.symbol}-${quoteToken.symbol}\n` +
      `🏦 *Pool Address:*\n\`${address}\`\n\n` +
      `💧 *Liquidity Information:*\n` +
      `• Total: $${metrics.totalLiquidity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
      `• ${baseToken.symbol}: ${metrics.baseAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
      `• ${quoteToken.symbol}: ${metrics.quoteAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n` +
      `🔄 *Exchange Rates:*\n` +
      `• 1 ${baseToken.symbol} = ${metrics.exchangeRate.toFixed(6)} ${quoteToken.symbol}\n` +
      `• 1 ${quoteToken.symbol} = ${metrics.reverseRate.toFixed(6)} ${baseToken.symbol}\n\n` +
      `📈 *24h Statistics:*\n` +
      `• Volume: $${metrics.volume24h.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
      `• Fees: $${metrics.fees24h.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
      `• APR: ${metrics.apr.toFixed(2)}%\n\n` +
      `💰 *Trading:*\n` +
      `• Trade Fee: ${metadata.tradeFee}%\n` +
      `• ${baseToken.symbol} Price: $${baseToken.usdPrice?.toFixed(4) || "N/A"}\n` +
      `• ${quoteToken.symbol} Price: $${quoteToken.usdPrice?.toFixed(4) || "N/A"}\n\n` +
      `🔗 *Token Addresses:*\n` +
      `• ${baseToken.symbol}: \`${baseToken.mint.slice(0, 8)}...${baseToken.mint.slice(-4)}\`\n` +
      `• ${quoteToken.symbol}: \`${quoteToken.mint.slice(0, 8)}...${quoteToken.mint.slice(-4)}\``
    );
  }
}

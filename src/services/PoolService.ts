import type { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import type { PoolData, PoolMetrics, TokenInfo } from "../types";

export class PoolService {
  constructor(private liquidityBookServices: LiquidityBookServices) {}

  async fetchPoolData(poolAddress: string): Promise<PoolData> {
    const metadata =
      await this.liquidityBookServices.fetchPoolMetadata(poolAddress);

    const [baseToken, quoteToken] = await Promise.all([
      this.fetchTokenInfo(metadata.baseMint),
      this.fetchTokenInfo(metadata.quoteMint),
    ]);

    const metrics = this.calculatePoolMetrics(metadata, baseToken, quoteToken);

    return {
      address: poolAddress,
      metadata,
      baseToken,
      quoteToken,
      metrics,
    };
  }

  private async fetchTokenInfo(mint: string): Promise<TokenInfo> {
    try {
      const response = await fetch(
        `https://lite-api.jup.ag/ultra/v1/search?query=${mint}`
      );
      const data = await response.json();
      const tokenData = data[0];

      return {
        symbol: tokenData?.symbol || "UNKNOWN",
        mint,
        decimals: tokenData?.decimals || 9,
        usdPrice: tokenData?.usdPrice || 0,
        stats24h: tokenData?.stats24h,
      };
    } catch {
      return {
        symbol: "UNKNOWN",
        mint,
        decimals: 9,
        usdPrice: 0,
      };
    }
  }

  private calculatePoolMetrics(
    metadata: any,
    baseToken: TokenInfo,
    quoteToken: TokenInfo
  ): PoolMetrics {
    const baseDecimals = metadata.extra?.tokenBaseDecimal || baseToken.decimals;
    const quoteDecimals =
      metadata.extra?.tokenQuoteDecimal || quoteToken.decimals;

    const baseAmount = metadata.baseReserve / Math.pow(10, baseDecimals);
    const quoteAmount = metadata.quoteReserve / Math.pow(10, quoteDecimals);

    const baseValue = baseAmount * baseToken.usdPrice;
    const quoteValue = quoteAmount * quoteToken.usdPrice;
    const totalLiquidity = baseValue + quoteValue;

    const exchangeRate = baseAmount > 0 ? quoteAmount / baseAmount : 0;
    const reverseRate = quoteAmount > 0 ? baseAmount / quoteAmount : 0;

    const volume24h =
      (baseToken.stats24h?.buyVolume || 0) +
      (baseToken.stats24h?.sellVolume || 0);
    const fees24h = volume24h * (metadata.tradeFee / 100);
    const apr =
      totalLiquidity > 0 ? ((fees24h * 365) / totalLiquidity) * 100 : 0;

    return {
      baseAmount,
      quoteAmount,
      totalLiquidity,
      exchangeRate,
      reverseRate,
      volume24h,
      fees24h,
      apr,
    };
  }
}

import type {
  LiquidityBookServices,
  PoolMetadata,
} from "@saros-finance/dlmm-sdk";

export class PoolService {
  constructor(private liquidityBookServices: LiquidityBookServices) {}

  async fetchPoolData(
    poolAddress: string
  ): Promise<{ metadata: PoolMetadata; address: string }> {
    const metadata =
      await this.liquidityBookServices.fetchPoolMetadata(poolAddress);

    return {
      address: poolAddress,
      metadata,
    };
  }
}

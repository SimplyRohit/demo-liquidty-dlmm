import type { PoolMetadata } from "@saros-finance/dlmm-sdk";

export class MessageFormatter {
  static formatPoolSummary(poolData: PoolMetadata, index?: number): string {
    const baseReserve =
      Number(poolData.baseReserve) /
      Math.pow(10, poolData.extra?.tokenBaseDecimal || 9);
    const quoteReserve =
      Number(poolData.quoteReserve) /
      Math.pow(10, poolData.extra?.tokenQuoteDecimal || 9);
    const rate =
      baseReserve > 0 ? (quoteReserve / baseReserve).toFixed(6) : "0";
    return (
      `${index === undefined ? "" : index + "."}\n` +
      `Address:\n\`${poolData.poolAddress}\`\n` +
      `BaseMint :\n\`${poolData.baseMint}\`\n` +
      `QuoteMint:\n\`${poolData.quoteMint}\`\n` +
      `Base: ${baseReserve.toLocaleString()} tokens\n` +
      `Quote: ${quoteReserve.toLocaleString()} tokens\n` +
      `Rate: 1 base = ${rate} quote\n` +
      `Fee: ${poolData.tradeFee}%`
    );
  }
}

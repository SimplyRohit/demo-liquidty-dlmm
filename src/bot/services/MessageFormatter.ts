import { PoolMetadata } from '@saros-finance/dlmm-sdk';

export function formatPoolSummary(
  poolData: PoolMetadata,
  index?: number,
): string {
  const baseReserve =
    Number(poolData.baseReserve) /
    Math.pow(10, poolData.extra?.tokenBaseDecimal || 9);
  const quoteReserve =
    Number(poolData.quoteReserve) /
    Math.pow(10, poolData.extra?.tokenQuoteDecimal || 9);
  const rate = baseReserve > 0 ? (quoteReserve / baseReserve).toFixed(6) : '0';

  return (
    `${index ? index + '.' : ''}\n` +
    `Address:\n` +
    `<pre>${poolData.poolAddress}</pre>\n` +
    `BaseMint:\n` +
    `<pre>${poolData.baseMint}</pre>\n` +
    `QuoteMint:\n` +
    `<pre>${poolData.quoteMint}</pre>\n` +
    `Base: ${baseReserve.toLocaleString()} tokens\n` +
    `Quote: ${quoteReserve.toLocaleString()} tokens\n` +
    `Rate: 1 base = ${rate} quote\n` +
    `Fee: ${poolData.tradeFee}%\n`
  );
}

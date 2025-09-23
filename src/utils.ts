import { BN } from '@coral-xyz/anchor';
import bigDecimal from 'js-big-decimal';

export function humanToBN(amount: string, decimals: number): BN {
  const [whole, fraction = ''] = amount.split('.');
  const wholeBN = new BN(whole).mul(new BN(10).pow(new BN(decimals)));
  const fractionBN = new BN(fraction.padEnd(decimals, '0').slice(0, decimals));
  return wholeBN.add(fractionBN);
}

export const convertBalanceToWei = (strValue: number, iDecimal: number = 9) => {
  if (strValue === 0) return 0;
  try {
    const multiplyNum = new bigDecimal(Math.pow(10, iDecimal));
    const convertValue = new bigDecimal(Number(strValue));
    const result = multiplyNum.multiply(convertValue);
    return result.getValue();
  } catch {
    return 0;
  }
};

export function formatTokenAmount(
  amount: string | number,
  decimals: number,
): string {
  const amountNum = typeof amount === 'string' ? parseFloat(amount) : amount;
  return (amountNum / Math.pow(10, decimals)).toFixed(6);
}

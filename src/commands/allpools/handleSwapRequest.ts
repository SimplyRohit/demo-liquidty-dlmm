import type {
  LiquidityBookServices,
  PoolMetadata,
} from "@saros-finance/dlmm-sdk";
import type { MyContext } from "../../types";
import { PublicKey } from "@solana/web3.js";

function escapeMdV2(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

export async function handleSwapRequest(
  ctx: MyContext,
  poolAddress: string,
  liquidityBookServices: LiquidityBookServices
) {
  try {
    //@ts-ignore ignoree krde bhaai
    const parts = ctx.message?.text?.trim().split(/\s+/) || [];
    if (parts.length < 2) {
      await ctx.reply(
        `❌ Invalid format!\n\n*Required:* \`amount your_wallet_address\`\n*Example:* \`1.5 YOUR_WALLET_ADDRESS\``,
        { parse_mode: "MarkdownV2" }
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

    const metadata: PoolMetadata =
      await liquidityBookServices.fetchPoolMetadata(poolAddress);

    const baseDecimals = Number(metadata.extra?.tokenBaseDecimal ?? 9);
    const quoteDecimals = Number(metadata.extra?.tokenQuoteDecimal ?? 9);
    const amountBigInt = BigInt(
      Math.floor(amountFloat * Math.pow(10, baseDecimals))
    );

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

    const swapResult = await liquidityBookServices.swap({
      hook: new PublicKey(liquidityBookServices.hooksConfig),
      amount: (quoteData as any).amount ?? amountBigInt,
      tokenMintX: new PublicKey(metadata.baseMint),
      tokenMintY: new PublicKey(metadata.quoteMint),
      otherAmountOffset: (quoteData as any).otherAmountOffset ?? 0,
      isExactInput: true,
      swapForY: true,
      pair: new PublicKey(poolAddress),
      payer: userPub,
    });

    const txCandidate: any =
      //@ts-ignore ignoree krde bhaai
      swapResult?.tx ?? swapResult?.transaction ?? swapResult;
    if (!txCandidate || typeof txCandidate.serialize !== "function") {
      await ctx.reply(
        "❌ SDK did not return a serializable transaction object."
      );
      return;
    }

    const latest = await liquidityBookServices.connection.getLatestBlockhash();
    if (!txCandidate.recentBlockhash)
      txCandidate.recentBlockhash = latest.blockhash;
    if (!txCandidate.feePayer) txCandidate.feePayer = userPub;

    const serialized = txCandidate.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const base64Tx = Buffer.from(serialized).toString("base64");

    const escapedPool = escapeMdV2(poolAddress);
    const escapedUser = escapeMdV2(userPubKeyStr);
    const amountOutReadable = quoteData.amountOut
      ? (Number(quoteData.amountOut) / Math.pow(10, quoteDecimals)).toFixed(6)
      : "N/A";

    const txUrl = `http://localhost:5173/?tx=${encodeURIComponent(base64Tx)}`;

    await ctx.reply(
      `${escapeMdV2("Swap Transaction Built Successfully!")}\n\n` +
        `${escapeMdV2("Pool: BASE-QUOTE")}\n` +
        `Pool Address: \`${escapedPool}\`\n` +
        `Wallet: \`${escapedUser}\`\n\n` +
        `${escapeMdV2(`Input: ${amountStr} BASE`)}` +
        `${escapeMdV2(`Expected Output: ${amountOutReadable} QUOTE`)}` +
        `${escapeMdV2(`Price Impact: ${quoteData.priceImpact ?? "N/A"}%`)}\n\n` +
        `Transaction: \n\`\`\`\n${txUrl}\n\`\`\`\n\n`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "💱 Get New Quote",
                callback_data: `action:quote:${ctx.session?.selectedPoolIndex || 0}`,
              },
            ],
            [
              {
                text: "🔙 Back to Market",
                callback_data: `market:${ctx.session?.selectedPoolIndex || 0}`,
              },
            ],
          ],
        },
      }
    );
  } catch (err) {
    console.error("Swap error:", err);
    await ctx.reply(
      `❌ Error building swap transaction: ${String((err as Error)?.message ?? err)}`
    );
  }
}

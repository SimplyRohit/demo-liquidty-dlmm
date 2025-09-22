import type {
  LiquidityBookServices,
  PoolMetadata,
} from "@saros-finance/dlmm-sdk";
import { PublicKey } from "@solana/web3.js";
import type { MyContext } from "@/types";

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

    const amountOutReadable = quoteData.amountOut
      ? (Number(quoteData.amountOut) / Math.pow(10, quoteDecimals)).toFixed(6)
      : "N/A";

    const userId = ctx.from?.id.toString() || "";
    const chatId = ctx.chat?.id.toString() || "";

    const poolIndex = ctx.session?.selectedPoolIndex ?? -1;

    if (!ctx.session) ctx.session = {};
    // @ts-ignore ignoree krde bhaai
    ctx.session.pendingTransaction = {
      poolAddress,
      poolIndex,
      userId: ctx.from?.id.toString() || "",
      chatId: ctx.chat?.id.toString() || "",
      timestamp: Date.now(),
    };

    const frontendUrl = "http://localhost:3001";
    const txParams = new URLSearchParams({
      tx: base64Tx,
      pool: poolAddress,
      userId: userId,
      chatId: chatId,
    });
    const txUrl = `${frontendUrl}/?${txParams.toString()}`;

    await ctx.reply(
      `Swap Transaction Built Successfully\n\n` +
        `Pool Address: \n\`${poolAddress}\`\n\n` +
        `Wallet: \`\n${userPubKeyStr}\`\n\n` +
        `Input: ${amountStr} BASE` +
        `Expected Output: ${amountOutReadable} QUOTE` +
        `Price Impact: ${quoteData.priceImpact ?? "N/A"}%\n\n` +
        `Transaction URL: \n\`${txUrl})\`\n\n`,
      {
        parse_mode: "Markdown",

        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Sign and Send Transaction",
                url: "https://google.com",
              },

              {
                text: "Get New Quote",
                callback_data: `action:quote:${ctx.session?.selectedPoolIndex || 0}`,
              },
            ],
            [
              {
                text: "Back to Market",
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

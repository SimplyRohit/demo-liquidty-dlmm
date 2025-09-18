import type { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import type { MyContext } from "../../types";

export async function handleSwapRequest(ctx: MyContext, poolAddress: string, liquidityBookServices: LiquidityBookServices) {
  try {
    const parts = ctx.message?.text?.trim().split(/\s+/) || [];
    if (parts.length < 2) {
      await ctx.reply(
        "❌ Invalid format!\n\n" +
        "*Required:* `amount your_wallet_address`\n" +
        "*Example:* `1.5 YOUR_WALLET_ADDRESS`",
        { parse_mode: 'Markdown' }
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

    // Fetch pool metadata
    let metadata: PoolMetadata;
    try {
      metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);
    } catch (err) {
      await ctx.reply(`❌ Error fetching pool metadata: ${String((err as Error)?.message ?? err)}`);
      return;
    }

    const baseDecimals = Number(metadata.extra?.tokenBaseDecimal ?? 9);
    const quoteDecimals = Number(metadata.extra?.tokenQuoteDecimal ?? 9);
    const amountBigInt = BigInt(Math.floor(amountFloat * Math.pow(10, baseDecimals)));

    // Get quote first
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

    // Build the swap transaction
    const swapResult = await liquidityBookServices.swap({
      amount: (quoteData as any).amount ?? amountBigInt,
      tokenMintX: new PublicKey(metadata.baseMint),
      tokenMintY: new PublicKey(metadata.quoteMint),
      otherAmountOffset: (quoteData as any).otherAmountOffset ?? 0,
      isExactInput: true,
      swapForY: true,
      pair: new PublicKey(poolAddress),
      payer: userPub,
    });

    // Handle different possible return structures
    const txCandidate: any = swapResult?.tx ?? swapResult?.transaction ?? swapResult;
    if (!txCandidate || typeof txCandidate.serialize !== "function") {
      await ctx.reply("❌ SDK did not return a serializable transaction object.");
      return;
    }

    // Set recent blockhash and fee payer if not already set
    const latest = await liquidityBookServices.connection.getLatestBlockhash();
    if (!txCandidate.recentBlockhash) txCandidate.recentBlockhash = latest.blockhash;
    if (!txCandidate.feePayer) txCandidate.feePayer = userPub;

    const serialized = txCandidate.serialize({ requireAllSignatures: false, verifySignatures: false });
    const base64Tx = Buffer.from(serialized).toString("base64");

    // Get token information for better display
    const [baseTokenResponse, quoteTokenResponse] = await Promise.all([
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.baseMint}`).catch(() => null),
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.quoteMint}`).catch(() => null)
    ]);

    let baseSymbol = "BASE";
    let quoteSymbol = "QUOTE";

    if (baseTokenResponse && quoteTokenResponse) {
      const baseTokenData = (await baseTokenResponse.json())[0];
      const quoteTokenData = (await quoteTokenResponse.json())[0];
      if (baseTokenData) baseSymbol = baseTokenData.symbol;
      if (quoteTokenData) quoteSymbol = quoteTokenData.symbol;
    }

    const amountOutReadable = quoteData.amountOut ? 
      (Number(quoteData.amountOut) / Math.pow(10, quoteDecimals)).toFixed(6) : 'N/A';

    await ctx.reply(
      `✅ **Swap Transaction Built Successfully!**\n\n` +
      `📊 **Pool:** ${baseSymbol}-${quoteSymbol}\n` +
      `🏦 **Pool Address:** \`${poolAddress.slice(0, 8)}...${poolAddress.slice(-4)}\`\n` +
      `👤 **Wallet:** \`${userPubKeyStr.slice(0, 8)}...${userPubKeyStr.slice(-4)}\`\n\n` +
      `📥 **Input:** ${amountStr} ${baseSymbol}\n` +
      `📤 **Expected Output:** ${amountOutReadable} ${quoteSymbol}\n` +
      `💥 **Price Impact:** ${quoteData.priceImpact ?? 'N/A'}%\n\n` +
      `🔐 **Transaction (Base64):**\n\`\`\`\n${base64Tx}\n\`\`\`\n\n` +
      `💡 **Next Steps:**\n` +
      `1. Copy the transaction above\n` +
      `2. Sign it with your wallet\n` +
      `3. Submit to the network`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "💱 Get New Quote", callback_data: `action:quote:${ctx.session?.selectedPoolIndex || 0}` }],
            [{ text: "🔙 Back to Market", callback_data: `market:${ctx.session?.selectedPoolIndex || 0}` }]
          ]
        }
      }
    );

  } catch (err) {
    console.error("Swap build error:", err);
    await ctx.reply(`❌ Error building swap transaction: ${String((err as Error)?.message ?? err)}`);
  }
}

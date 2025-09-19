import type { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import type { MyContext } from "../../types";
import { PublicKey } from "@solana/web3.js";

export async function handleAddLiquidityRequest(ctx: MyContext, poolAddress: string, liquidityBookServices: LiquidityBookServices) {
  try {
    const parts = ctx.message?.text?.trim().split(/\s+/) || [];
    if (parts.length < 5) {
      await ctx.reply(
        "❌ Invalid format!\n\n" +
        "*Required:* `amountX amountY wallet_address binRangeLower binRangeUpper`\n" +
        "*Example:* `10 10 YOUR_WALLET_ADDRESS -10 10`",
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const amountXStr = parts[0].trim();
    const amountYStr = parts[1].trim();
    const userPubKeyStr = parts[2].trim();
    const binRangeLower = parseInt(parts[3]);
    const binRangeUpper = parseInt(parts[4]);

    const amountX = parseFloat(amountXStr);
    const amountY = parseFloat(amountYStr);

    if (isNaN(amountX) || isNaN(amountY) || amountX <= 0 || amountY <= 0) {
      await ctx.reply("❌ Please provide valid positive amounts.");
      return;
    }

    if (isNaN(binRangeLower) || isNaN(binRangeUpper)) {
      await ctx.reply("❌ Please provide valid bin range values.");
      return;
    }

    let userPub: PublicKey;
    try {
      userPub = new PublicKey(userPubKeyStr);
    } catch {
      await ctx.reply("❌ Invalid wallet address provided.");
      return;
    }

    await ctx.reply("🔄 Building add liquidity transactions...");

    // Fetch pool metadata
    const metadata = await liquidityBookServices.fetchPoolMetadata(poolAddress);
    const pair = new PublicKey(poolAddress);

    // Get token information
    const [baseTokenResponse, quoteTokenResponse] = await Promise.all([
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.baseMint}`).catch(() => null),
      fetch(`https://lite-api.jup.ag/ultra/v1/search?query=${metadata.quoteMint}`).catch(() => null)
    ]);

    let baseSymbol = "BASE";
    let quoteSymbol = "QUOTE";
    let baseDecimals = Number(metadata.extra?.tokenBaseDecimal ?? 9);
    let quoteDecimals = Number(metadata.extra?.tokenQuoteDecimal ?? 9);

    if (baseTokenResponse && quoteTokenResponse) {
      const baseTokenData = (await baseTokenResponse.json())[0];
      const quoteTokenData = (await quoteTokenResponse.json())[0];
      if (baseTokenData) {
        baseSymbol = baseTokenData.symbol;
        baseDecimals = baseTokenData.decimals;
      }
      if (quoteTokenData) {
        quoteSymbol = quoteTokenData.symbol;
        quoteDecimals = quoteTokenData.decimals;
      }
    }

    // Get pair info for active bin
    const pairInfo = await liquidityBookServices.getPairAccount(pair);
    const activeBin = pairInfo.activeId;

    // Check if user has existing positions
    const positions = await liquidityBookServices.getUserPositions({
      payer: userPub,
      pair,
    });

    // Convert amounts to wei (smallest unit)
    const convertBalanceToWei = (amount: number, decimals: number): bigint => {
      return BigInt(Math.floor(amount * Math.pow(10, decimals)));
    };

    const amountXWei = Number(convertBalanceToWei(amountX, baseDecimals));
    const amountYWei = Number(convertBalanceToWei(amountY, quoteDecimals));

    const actualBinRange = [activeBin + binRangeLower, activeBin + binRangeUpper];

    // Create a mock transaction array (in real implementation, this would create actual transactions)
    const transactionSteps = [
      "1. Initialize bin arrays if needed",
      "2. Create position if it doesn't exist", 
      "3. Add liquidity to the position"
    ];

    const liquidityInfo = 
      `➕ **Add Liquidity Transaction Ready**\n\n` +
      `📊 **Pool:** ${baseSymbol}-${quoteSymbol}\n` +
      `🏦 **Pool Address:** \`${poolAddress.slice(0, 8)}...${poolAddress.slice(-4)}\`\n` +
      `👤 **Wallet:** \`${userPubKeyStr.slice(0, 8)}...${userPubKeyStr.slice(-4)}\`\n\n` +
      
      `💰 **Liquidity Amounts:**\n` +
      `• ${baseSymbol}: ${amountX} (${amountXWei} base units)\n` +
      `• ${quoteSymbol}: ${amountY} (${amountYWei} quote units)\n\n` +
      
      `🎯 **Position Details:**\n` +
      `• Active Bin: ${activeBin}\n` +
      `• Relative Range: [${binRangeLower}, ${binRangeUpper}]\n` +
      `• Actual Bin Range: [${actualBinRange[0]}, ${actualBinRange[1]}]\n` +
      `• Existing Positions: ${positions.length}\n\n` +
      
      `🔄 **Transaction Steps:**\n` +
      transactionSteps.map(step => `${step}`).join('\n') + '\n\n' +
      
      `⚠️ **Important Notes:**\n` +
      `• Multiple transactions may be required\n` +
      `• Each transaction needs to be signed separately\n` +
      `• Ensure you have sufficient token balances\n` +
      `• Gas fees will apply to each transaction\n\n` +
      
      `💡 **Next Steps:**\n` +
      `In a full implementation, you would:\n` +
      `1. Receive unsigned transactions\n` +
      `2. Sign them with your wallet\n` +
      `3. Submit to the Solana network\n\n` +
      
      `🚧 **Implementation Status:**\n` +
      `This is a preview of the add liquidity process. The actual transaction building requires additional SDK integration for:\n` +
      `• Bin array initialization\n` +
      `• Position creation/management\n` +
      `• Liquidity distribution calculations`;

    await ctx.reply(liquidityInfo, { 
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "💱 Get Quote Instead", callback_data: `action:quote:${ctx.session?.selectedPoolIndex || 0}` }],
          [{ text: "🔙 Back to Market", callback_data: `market:${ctx.session?.selectedPoolIndex || 0}` }]
        ]
      }
    });

  } catch (err) {
    console.error("Add liquidity error:", err);
    await ctx.reply(`❌ Error building add liquidity transactions: ${String((err as Error)?.message ?? err)}`);
  }
}
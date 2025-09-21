import { serve } from "bun";
import index from "./index.html";
import { Telegraf, session } from "telegraf";
import { LiquidityBookServices, MODE } from "@saros-finance/dlmm-sdk";
import { TxResultSchema, type MyContext } from "./types";
import { setupCommands } from "./bot/commands/setupCommands";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("NO TELEGRAM_BOT_TOKEN in env");
  process.exit(1);
}

const liquidityBookServices = new LiquidityBookServices({ mode: MODE.DEVNET });
const bot = new Telegraf<MyContext>(BOT_TOKEN);
bot.use(session());
const pendingTransactions = new Map<
  string,
  {
    userId: string;
    chatId: string;
    poolAddress: string;
    timestamp: number;
  }
>();

const server = serve({
  routes: {
    "/": index,
    "/health": new Response("OK"),
    "/webhook/transaction-result": {
      POST: async (req: Request) => {
        try {
          const body = TxResultSchema.parse(await req.json());
          const { status, txId, errorMessage, poolAddress, userId, chatId } =
            body;

          if (chatId) {
            let message = "";

            if (status === true && txId) {
              message =
                `✅ **Transaction Successful!**\n\n` +
                `**Pool:** \`${poolAddress}\`\n` +
                `**Transaction ID:** \`${txId}\`\n\n` +
                `[View on Solscan](https://solscan.io/tx/${txId}?cluster=devnet)\n\n` +
                `Your swap has been executed successfully!`;
            } else {
              message =
                `❌ **Transaction Failed**\n\n` +
                `**Pool:** \`${poolAddress}\`\n` +
                `**Error:** ${errorMessage || "Unknown error occurred"}\n\n` +
                `Please check your wallet balance and try again.`;
            }

            await bot.telegram.sendMessage(chatId, message, {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  status === true
                    ? [
                      {
                        text: "🔍 View Transaction",
                        url: `https://solscan.io/tx/${txId}?cluster=devnet`,
                      },
                    ]
                    : [],
                  [
                    {
                      text: "🔙 Back to Pool",
                      callback_data: `market:${pendingTransactions.get(userId!)?.poolAddress || "0"}`,
                    },
                  ],
                  [
                    {
                      text: "📊 View All Pools",
                      callback_data: "view_all_pools",
                    },
                  ],
                ].filter((row) => row.length > 0),
              },
            });

            pendingTransactions.delete(userId!);
          }
          return new Response(JSON.stringify({ status: 200 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })

        } catch (err) {
          console.error("Webhook error:", err);
          return new Response(JSON.stringify({ status: 500 }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          })

        }
      },
    },
  },


  fetch() {
    return new Response("Not Found", { status: 404 });
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);


setupCommands(bot, liquidityBookServices);

bot.telegram.setMyCommands([
  { command: "pools", description: "View all pools with pagination" },
  { command: "pool", description: "/pool <pooladdress>" },
  {
    command: "createpool",
    description:
      "/createpool <tokenXMint> <tokenYMint> <tokenXDecimals> <tokenYDecimals> <ratePrice> [binStep] - Create new pool",
  },
  {
    command: "mypools",
    description: "/mypools <poolAddress> <userPublicKey> - View Your Pools",
  },
]);

bot.catch((err) => {
  console.error("Bot error:", err);
});

bot.start(async (ctx) => {
  await ctx.reply(`Welcome to the Saros DLMM Bot!`);
});


(async () => {
  console.log("Launching bot...");
  await bot.launch();
  console.log("Bot launched.");
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
})();

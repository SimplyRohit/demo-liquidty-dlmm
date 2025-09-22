import { serve } from "bun";
import index from "./index.html";
import { TxResultSchema } from "./types";
import { createBot, pendingTransactions } from "./bot-server";


const bot = createBot();

export function createServer() {
  return serve({
    routes: {
      "/": index,
      "/health": new Response("OK"),
      "/webhook/transaction-result": {
        POST: async (req: Request) => {
          try {
            const body = TxResultSchema.parse(await req.json());
            const {
              status,
              txId,
              errorMessage,
              poolAddress,
              userId,
              chatId,
            } = body;

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
                        text: "Back to Pool",
                        callback_data: `market:${pendingTransactions.get(userId!)
                          ?.poolAddress || "0"}`,
                      },
                    ],
                    [
                      {
                        text: "View All Pools",
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
            });
          } catch (err) {
            console.error("Webhook error:", err);
            return new Response(JSON.stringify({ status: 500 }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
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
}

export function startServer() {
  const server = createServer();
  console.log(`HTTP Server running at ${server.url}`);
  return server;
}
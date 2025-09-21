import { Telegraf, session } from "telegraf";
import { LiquidityBookServices, MODE } from "@saros-finance/dlmm-sdk";
import { setupLiquidityCommands } from "./commands/createpools/index";
import { setupUserCommands } from "./commands/mypools/index";
import { setupPoolCommands } from "./commands/allpools/index";
import type { MyContext } from "./types";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("NO TELEGRAM_BOT_TOKEN in env");
  process.exit(1);
}

const liquidityBookServices = new LiquidityBookServices({ mode: MODE.DEVNET });
const bot = new Telegraf<MyContext>(BOT_TOKEN);
bot.use(session());

const PORT = "3001";
Bun.serve({
  port: PORT,
  routes: {
    "/health": async () => {
      return Response.json("im okaay bro thanks");
    },
    "/webhook/transaction-result": async (req) => {
      console.log("Received transaction result webhook");

      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        });
      }

      if (req.method !== "POST") {
        return new Response(
          JSON.stringify({ success: false, error: "Method Not Allowed" }),
          {
            status: 405,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
          }
        );
      }

      try {
        const body = await req.json();

        // @ts-ignore
        const { success, txId, error, poolAddress, userId, chatId } = body;
        console.log("Received transaction result:", body);

        return new Response(
          JSON.stringify({ success: true, message: "Notification sent" }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
          }
        );
      } catch (err: any) {
        console.error("Webhook error:", err);
        return new Response(
          JSON.stringify({ success: false, error: err.message }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
          }
        );
      }
    },
  },
  async fetch(req) {
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🚀 Webhook server running on http://localhost:${PORT}`);

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

bot.start(async (ctx) => {
  await ctx.reply(`Welcome to the Saros DLMM Bot!`);
});

setupLiquidityCommands(bot, liquidityBookServices);
setupUserCommands(bot, liquidityBookServices);
setupPoolCommands(bot, liquidityBookServices);

bot.catch((err) => {
  console.error("Bot error:", err);
});

(async () => {
  console.log("Launching bot...");
  await bot.launch();
  console.log("Bot launched.");
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
})();

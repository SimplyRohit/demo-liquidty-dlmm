import { Telegraf, session } from "telegraf";
import { LiquidityBookServices, MODE } from "@saros-finance/dlmm-sdk";
import { type MyContext } from "./types";
import { setupCommands } from "./bot/commands/setupCommands";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("NO TELEGRAM_BOT_TOKEN in env");
  process.exit(1);
}

export const pendingTransactions = new Map<
  string,
  {
    userId: string;
    chatId: string;
    poolAddress: string;
    timestamp: number;
  }
>();

export function createBot() {
  const liquidityBookServices = new LiquidityBookServices({ mode: MODE.DEVNET });
  const bot = new Telegraf<MyContext>(BOT_TOKEN!);
  
  bot.use(session());
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

  return bot;
}

export function startBot() {
  const bot = createBot();
  console.log("Launching Telegram bot...");
  bot.launch();
  console.log("Bot launched successfully!");
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
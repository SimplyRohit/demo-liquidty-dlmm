import { Telegraf, session } from "telegraf";
import { LiquidityBookServices, MODE } from "@saros-finance/dlmm-sdk";
import type { MyContext } from "./types";
import { setupLiquidityCommands } from "./commands/createpools/index";
import { setupUserCommands } from "./commands/mypools/index";
import { setupPoolCommands } from "./commands/allpools/index";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("NO TELEGRAM_BOT_TOKEN in env");
  process.exit(1);
}

const liquidityBookServices = new LiquidityBookServices({ mode: MODE.DEVNET });
const bot = new Telegraf<MyContext>(BOT_TOKEN);
bot.use(session());

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

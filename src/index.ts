import { Telegraf, session } from "telegraf";
import { LiquidityBookServices, MODE } from "@saros-finance/dlmm-sdk";
import type { MyContext } from "./types";
import { setupPoolCommands } from "./commands/poolCommands";
import { setupQuoteCommands } from "./commands/quoteCommands";
import { setupSwapCommands } from "./commands/swapCommands";
import { setupLiquidityCommands } from "./commands/liquidityCommands";
import { setupUserCommands } from "./commands/userCommands";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("NO TELEGRAM_BOT_TOKEN in env");
  process.exit(1);
}

const SAROS_MODE = (process.env.SAROS_MODE || "DEVNET").toUpperCase();
const MODE_CHOICE = SAROS_MODE === "MAINNET" ? MODE.MAINNET : MODE.DEVNET;
const liquidityBookServices = new LiquidityBookServices({ mode: MODE_CHOICE });

const bot = new Telegraf<MyContext>(BOT_TOKEN);
bot.use(session());

await bot.telegram.setMyCommands([
  { command: "start", description: "Welcome message" },
  { command: "help", description: "Show all commands" },
  { command: "pool", description: "List pools with pagination" },
  { command: "quote", description: "Get a quote for a swap" },
  { command: "buildswap", description: "Build unsigned swap transaction" },
]);

bot.start(async (ctx) => {
  await ctx.reply(`Welcome to the Saros DLMM Bot! 
Available commands:
/pool - View all pools with pagination
/quote <poolAddress> <amount> - Get swap quote
/buildswap <poolAddress> <amount> <userPublicKey> - Build swap transaction
/createpool <tokenXMint> <tokenYMint> <tokenXDecimals> <tokenYDecimals> <ratePrice> [binStep] - Create new pool
/addliquidity <poolAddress> <amountX> <amountY> <userPublicKey> <binRangeLower> <binRangeUpper> - Add liquidity
/removeliquidity <poolAddress> <userPublicKey> <binRangeLower> <binRangeUpper> [type] - Remove liquidity
/userpositions <poolAddress> <userPublicKey> - View user positions`);
});

setupPoolCommands(bot, liquidityBookServices);
setupQuoteCommands(bot, liquidityBookServices);
setupSwapCommands(bot, liquidityBookServices);
setupLiquidityCommands(bot, liquidityBookServices);
setupUserCommands(bot, liquidityBookServices);

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
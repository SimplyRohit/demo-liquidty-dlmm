# Saros DLMM DEMO

This is a Telegram bot for interacting with the Saros DLMM (Dynamic Liquidity Market Maker) on the Solana blockchain. The bot provides a simple interface for managing liquidity pools, swapping tokens, and getting quotes.

## Features

- **Create Liquidity Pools:** Create new liquidity pools for any token pair.
- **Manage Liquidity:** Add and remove liquidity from your pools.
- **Swap Tokens:** Swap tokens with the best possible rates.
- **Get Quotes:** Get real-time quotes for token swaps.
- **View Pool Data:** View detailed information about your liquidity pools.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed on your machine.
- A Telegram bot token.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/saros-dlmm-tgbot.git
   ```
2. Install the dependencies:
   ```bash
   bun install
   ```
3. Create a `.env` file in the root directory and add your Telegram bot token:
   ```
   BOT_TOKEN=your-telegram-bot-token
   ```
4. Start the bot:
   ```bash
   bun dev
   ```

## Technologies Used

- [Bun](https://bun.sh/): A fast all-in-one JavaScript runtime.
- [TypeScript](https://www.typescriptlang.org/): A typed superset of JavaScript.
- [React](https://react.dev/): A JavaScript library for building user interfaces.
- [Tailwind CSS](https://tailwindcss.com/): A utility-first CSS framework.
- [Grammy](https://grammy.dev/): A framework for building Telegram bots.
- [Saros DLMM SDK](https://github.com/saros-finance/saros-dlmm-sdk): The official SDK for interacting with the Saros DLMM protocol.
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/): The official library for interacting with the Solana blockchain.

## Project Structure

```
.
├── src
│   ├── bot
│   │   ├── commands
│   │   ├── controllers
│   │   └── services
│   ├── bot-server.ts
│   ├── frontend.tsx
│   ├── http-server.ts
│   ├── index.css
│   ├── index.html
│   ├── index.tsx
│   ├── types.ts
│   └── utils.ts
├── build.ts
├── bun.lockb
├── package.json
└── tsconfig.json
```

- **`src/bot`**: Contains the logic for the Telegram bot.
  - **`commands`**: Defines the bot's commands.
  - **`controllers`**: Handles the business logic for the bot's commands.
  - **`services`**: Provides services for interacting with the Saros DLMM and other external APIs.
- **`src/frontend.tsx`**: The main entry point for the React frontend.
- **`src/http-server.ts`**: A simple HTTP server for serving the frontend.
- **`build.ts`**: The build script for the project.

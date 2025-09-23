import { serve } from 'bun';
import index from './index.html';
import { TxResultSchema } from './types';
import { createBot, pendingTransactions } from './bot-server';

const bot = createBot();

export function createServer() {
  return serve({
    routes: {
      '/': index,
      '/health': new Response('OK'),
      '/webhook/transaction-result': {
        POST: async (req: Request) => {
          try {
            const body = TxResultSchema.parse(await req.json());
            const { status, txId, errorMessage, poolAddress, userId, chatId } =
              body;

            if (chatId) {
              let message = '';

              if (status === true && txId) {
                message =
                  `<i>Transaction Successful!\n\n` +
                  `Pool: <pre>${poolAddress}</pre>\n` +
                  `Transaction ID: <pre>${txId}</pre>\n\n` +
                  `Your swap has been executed successfully!</i>`;
              } else {
                message =
                  `<i>Transaction Successful!\n\n` +
                  `Pool: <pre>${poolAddress}</pre>\n` +
                  `Error : ${errorMessage || 'Unknown error occurred'}\n\n` +
                  `Please check your wallet balance and try again.</i>`;
              }

              await bot.telegram.sendMessage(chatId, message, {
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [
                    status === true
                      ? [
                          {
                            text: 'View Transaction',
                            url: `https://explorer.solana.com/tx/${txId}?cluster=devnet`,
                          },
                        ]
                      : [],
                  ],
                },
              });

              pendingTransactions.delete(userId!);
            }

            return new Response(JSON.stringify({ status: 200 }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          } catch (err) {
            console.error('Webhook error:', err);
            return new Response(JSON.stringify({ status: 500 }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        },
      },
    },

    fetch() {
      return new Response('Not Found', { status: 404 });
    },
    development: process.env.NODE_ENV !== 'production' && {
      hmr: true,
      console: true,
    },
  });
}

export function startServer() {
  const server = createServer();
  console.log(`HTTP Server running at ${server.url}`);
}

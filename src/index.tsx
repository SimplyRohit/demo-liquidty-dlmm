import { startBot } from './bot-server';
import { startServer } from './http-server';

(() => {
  try {
    startServer();
    startBot();
    console.log('Both HTTP server and Telegram bot are running!');
    const shutdown = (signal: string) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      process.exit(0);
    };
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    console.error('Failed to start services:', error);
    process.exit(1);
  }
})();

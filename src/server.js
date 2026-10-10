'use strict';
const config = require('./config');
const logger = require('./utils/logger');
const { connectDB, disconnectDB } = require('./config/db');
const { createApp } = require('./app');

async function main() {
  await connectDB(config.mongoUri);
  const server = createApp().listen(config.port, () => logger.info(`Liquid+ API listening on :${config.port}`));

  const shutdown = (signal) => {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});

require('dotenv').config();
const logger = require('./utils/logger');
const { sequelize, syncModels } = require('./models');
const { testConnection } = require('./config/database');
const { bot } = require('./bots/user-bot');
const { adminBot } = require('./bots/admin-bot');

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    // Ignore Telegram "message is not modified" errors as they're non-critical
    if (reason && reason.message && reason.message.includes('message is not modified')) {
      logger.debug('Ignored Telegram "message not modified" error');
      return;
    }
    
    logger.error('Unhandled Promise Rejection:', reason);
  });

// Initialize exchange rates
const ExchangeRate = require('./models/ExchangeRate');

// Main application startup
async function main() {
  logger.info('Hive Exchange Bot starting up...');
  
  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    logger.error('Failed to connect to the database. Exiting...');
    process.exit(1);
  }
  
  // Sync database models
  try {
    await syncModels();
    logger.info('Database models synchronized successfully');
  } catch (error) {
    logger.error('Failed to synchronize database models:', error);
    process.exit(1);
  }
  
  // Initialize exchange rates if not exists
  try {
    await ExchangeRate.getCurrentRates();
    logger.info('Exchange rates initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize exchange rates:', error);
  }
  
  // Start bots
  logger.info('Starting user bot...');
  // Bot polling is already started in bot module
  
  logger.info('Starting admin bot...');
  // Admin bot polling is already started in admin-bot module
  
  logger.info('Hive Exchange Bot is now online!');
  
  // Handle application shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down Hive Exchange Bot...');
  
  // Stop bot polling
  bot.stopPolling();
  adminBot.stopPolling();
  
  // Close database connection
  await sequelize.close();
  
  logger.info('Shutdown complete. Goodbye!');
  process.exit(0);
}

// Start the application
main().catch(error => {
  logger.error('Fatal error during startup:', error);
  process.exit(1);
});
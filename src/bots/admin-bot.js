const TelegramBot = require('node-telegram-bot-api');
const Decimal = require('decimal.js');

const config = require('../config/config');
const logger = require('../utils/logger');
const validation = require('../utils/validation');
const { formatUSDT, formatFiat, formatStatus, createTransactionSummary } = require('../utils/format');

const User = require('../models/User');
const Transaction = require('../models/Transaction');
const ExchangeRate = require('../models/ExchangeRate');
const SystemMetric = require('../models/SystemMetric');

const blockchainService = require('../services/blockchain');
const exchangeService = require('../services/exchange');
const metricsService = require('../services/metrics');

// Create bot instance
const adminBot = new TelegramBot(config.adminTelegramToken, { polling: true });

// Helper function to create inline keyboard markup
function createInlineKeyboardMarkup(buttons) {
  return {
    reply_markup: {
      inline_keyboard: buttons
    }
  };
}

// Helper function to create admin menu
function createAdminMenu() {
  return createInlineKeyboardMarkup([
    [{ text: '📊 System Overview', callback_data: 'system_overview' }],
    [{ text: '💱 Exchange Requests', callback_data: 'exchange_requests' }],
    [{ text: '💰 Wallet Balance', callback_data: 'wallet_balance' }],
    [{ text: '⚙️ Exchange Rates', callback_data: 'exchange_rates' }]
  ]);
}

// Verify if message is from admin
function isAdmin(chatId) {
  return chatId.toString() === config.adminChatId;
}

// Command: /start
adminBot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id.toString();
  
  if (!isAdmin(chatId)) {
    return adminBot.sendMessage(chatId, '⛔ You are not authorized to use this bot.');
  }
  
  adminBot.sendMessage(chatId, `
👨‍💼 *Hive Exchange Admin Panel* 👨‍💼

Welcome to the administration interface for Hive Exchange Bot.

🔧 *Available Commands:*
/start - Show this welcome message
/system - View system overview
/exchanges - View pending exchange requests
/rate_usd [value] - Update USD exchange rate
/rate_uah [value] - Update UAH exchange rate
/fee [value] - Update withdrawal fee
/complete_exchange [id] - Complete an exchange transaction
/reject_exchange [id] - Reject an exchange transaction
/find_user [chatId] - Find user by chat ID
/find_tx [id] - Find transaction by ID

Select an option from the menu below:
  `, {
    parse_mode: 'Markdown',
    ...createAdminMenu()
  });
});

// Command: /system
adminBot.onText(/\/system/, async (msg) => {
  const chatId = msg.chat.id.toString();
  
  if (!isAdmin(chatId)) {
    return adminBot.sendMessage(chatId, '⛔ You are not authorized to use this bot.');
  }
  
  try {
    // Get system metrics
    const overview = await metricsService.getSystemOverview();
    const walletBalance = await blockchainService.getWalletBalance();
    const rates = await ExchangeRate.getCurrentRates();
    
    adminBot.sendMessage(chatId, `
📊 *System Overview*

👥 *Users:*
- Total: ${overview.users.total}
- New (24h): ${overview.users.new24h}
- New (7d): ${overview.users.new7d}
- New (30d): ${overview.users.new30d}

💰 *Transaction Volume:*
- Daily: ${formatUSDT(overview.volume.daily)} USDT
- Weekly: ${formatUSDT(overview.volume.weekly)} USDT

💱 *Exchange Requests:*
- Pending: ${overview.pendingExchanges}

💵 *Exchange Rates:*
- USD: ${rates.rateUSD}
- UAH: ${rates.rateUAH}

🏦 *Wallet Balance:*
- USDT: ${formatUSDT(walletBalance)}

📝 *System Configuration:*
- Withdrawal Fee: ${config.transactions.withdrawalFee} USDT
- Min Confirmations: ${config.transactions.minConfirmations}
    `, {
      parse_mode: 'Markdown',
      ...createAdminMenu()
    });
  } catch (error) {
    logger.error(`Error getting system overview for admin:`, error);
    adminBot.sendMessage(chatId, '❌ An error occurred while fetching system overview.');
  }
});

// Command: /exchanges
adminBot.onText(/\/exchanges/, async (msg) => {
  const chatId = msg.chat.id.toString();
  
  if (!isAdmin(chatId)) {
    return adminBot.sendMessage(chatId, '⛔ You are not authorized to use this bot.');
  }
  
  try {
    // Get pending exchange requests
    const pendingExchanges = await exchangeService.getPendingExchangeRequests();
    
    if (pendingExchanges.length === 0) {
      return adminBot.sendMessage(chatId, '📝 No pending exchange requests.', createAdminMenu());
    }
    
    // Create exchange requests message
    let message = '💱 *Pending Exchange Requests*\n\n';
    
    for (const item of pendingExchanges) {
      const { transaction, user } = item;
      
      message += `*ID #${transaction.id}*\n`;
      message += `User: ${user.username || 'No username'} (${user.chatId})\n`;
      message += `Amount: ${formatUSDT(transaction.amount)} USDT\n`;
      message += `Fiat: ${formatFiat(transaction.fiatAmount)} ${transaction.fiatType}\n`;
      message += `Requested: ${new Date(transaction.createdAt).toLocaleString()}\n`;
      message += `Commands: /complete_exchange ${transaction.id} | /reject_exchange ${transaction.id}\n\n`;
    }
    
    adminBot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      ...createAdminMenu()
    });
  } catch (error) {
    logger.error(`Error fetching exchange requests for admin:`, error);
    adminBot.sendMessage(chatId, '❌ An error occurred while fetching exchange requests.');
  }
});

// Command: /rate_usd [value]
adminBot.onText(/\/rate_usd (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  
  if (!isAdmin(chatId)) {
    return adminBot.sendMessage(chatId, '⛔ You are not authorized to use this bot.');
  }
  
  const rateUSD = match[1];
  
  try {
    // Validate rate
    if (!validation.isValidAmount(rateUSD)) {
      return adminBot.sendMessage(chatId, '❌ Invalid rate format. Please enter a positive number.');
    }
    
    // Update exchange rate
    await ExchangeRate.updateRates({ rateUSD });
    
    adminBot.sendMessage(chatId, `✅ USD exchange rate updated to ${rateUSD}`);
  } catch (error) {
    logger.error(`Error updating USD rate:`, error);
    adminBot.sendMessage(chatId, '❌ An error occurred while updating USD rate.');
  }
});

// Command: /rate_uah [value]
adminBot.onText(/\/rate_uah (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  
  if (!isAdmin(chatId)) {
    return adminBot.sendMessage(chatId, '⛔ You are not authorized to use this bot.');
  }
  
  const rateUAH = match[1];
  
  try {
    // Validate rate
    if (!validation.isValidAmount(rateUAH)) {
      return adminBot.sendMessage(chatId, '❌ Invalid rate format. Please enter a positive number.');
    }
    
    // Update exchange rate
    await ExchangeRate.updateRates({ rateUAH });
    
    adminBot.sendMessage(chatId, `✅ UAH exchange rate updated to ${rateUAH}`);
  } catch (error) {
    logger.error(`Error updating UAH rate:`, error);
    adminBot.sendMessage(chatId, '❌ An error occurred while updating UAH rate.');
  }
});

// Command: /fee [value]
adminBot.onText(/\/fee (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  
  if (!isAdmin(chatId)) {
    return adminBot.sendMessage(chatId, '⛔ You are not authorized to use this bot.');
  }
  
  const fee = match[1];
  
  try {
    // Validate fee
    if (!validation.isValidAmount(fee)) {
      return adminBot.sendMessage(chatId, '❌ Invalid fee format. Please enter a positive number.');
    }
    
    // Update config (normally would be persisted to database in production)
    config.transactions.withdrawalFee = parseFloat(fee);
    
    adminBot.sendMessage(chatId, `✅ Withdrawal fee updated to ${fee} USDT`);
  } catch (error) {
    logger.error(`Error updating withdrawal fee:`, error);
    adminBot.sendMessage(chatId, '❌ An error occurred while updating withdrawal fee.');
  }
});

// Command: /complete_exchange [id]
adminBot.onText(/\/complete_exchange (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  
  if (!isAdmin(chatId)) {
    return adminBot.sendMessage(chatId, '⛔ You are not authorized to use this bot.');
  }
  
  const transactionId = match[1];
  
  try {
    // Get additional notes if provided
    const parts = msg.text.split(' ');
    let adminNotes = '';
    
    if (parts.length > 2) {
      // Extract notes after the transaction ID
      adminNotes = parts.slice(2).join(' ');
    }
    
    // Complete exchange transaction
    const result = await exchangeService.completeExchangeTransaction(transactionId, adminNotes);
    
    if (!result.success) {
      return adminBot.sendMessage(chatId, `❌ Failed to complete exchange: ${result.error}`);
    }
    
    // Get transaction details
    const transaction = result.transaction;
    const user = await User.findByPk(transaction.chatId);
    
    // Notify admin
    adminBot.sendMessage(chatId, `
✅ *Exchange Completed*

ID: #${transaction.id}
User: ${user.username || 'No username'} (${user.chatId})
Amount: ${formatUSDT(transaction.amount)} USDT
Fiat: ${formatFiat(transaction.fiatAmount)} ${transaction.fiatType}
Completed: ${new Date().toLocaleString()}
    `, { parse_mode: 'Markdown' });
    
    // Notify user
    const userBot = new TelegramBot(config.telegramToken, { polling: false });
    
    userBot.sendMessage(transaction.chatId, `
✅ *Exchange Completed*

Your exchange request has been processed:

💰 Amount: ${formatUSDT(transaction.amount)} USDT
💵 Fiat: ${formatFiat(transaction.fiatAmount)} ${transaction.fiatType}
🧾 Transaction ID: #${transaction.id}
📅 Completed: ${new Date().toLocaleString()}

Thank you for using Hive Exchange Bot!
    `, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error(`Error completing exchange transaction:`, error);
    adminBot.sendMessage(chatId, '❌ An error occurred while completing the exchange.');
  }
});

// Command: /reject_exchange [id]
adminBot.onText(/\/reject_exchange (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  
  if (!isAdmin(chatId)) {
    return adminBot.sendMessage(chatId, '⛔ You are not authorized to use this bot.');
  }
  
  const transactionId = match[1];
  
  try {
    // Get rejection reason if provided
    const parts = msg.text.split(' ');
    let rejectionReason = 'Exchange request was rejected by the administrator.';
    
    if (parts.length > 2) {
      // Extract reason after the transaction ID
      rejectionReason = parts.slice(2).join(' ');
    }
    
    // Find transaction
    const transaction = await Transaction.findByPk(transactionId);
    
    if (!transaction) {
      return adminBot.sendMessage(chatId, '❌ Transaction not found.');
    }
    
    if (transaction.type !== 'exchange') {
      return adminBot.sendMessage(chatId, '❌ Not an exchange transaction.');
    }
    
    if (transaction.status !== 'pending') {
      return adminBot.sendMessage(chatId, `❌ Transaction is not pending, current status: ${transaction.status}`);
    }
    
    // Update transaction
    transaction.status = 'failed';
    transaction.adminNotes = rejectionReason;
    await transaction.save();
    
    // Get user
    const user = await User.findByPk(transaction.chatId);
    
    // Notify admin
    adminBot.sendMessage(chatId, `
❌ *Exchange Rejected*

ID: #${transaction.id}
User: ${user.username || 'No username'} (${user.chatId})
Amount: ${formatUSDT(transaction.amount)} USDT
Fiat: ${formatFiat(transaction.fiatAmount)} ${transaction.fiatType}
Reason: ${rejectionReason}
    `, { parse_mode: 'Markdown' });
    
    // Notify user
    const userBot = new TelegramBot(config.telegramToken, { polling: false });
    
    userBot.sendMessage(transaction.chatId, `
❌ *Exchange Rejected*

Your exchange request has been rejected:

💰 Amount: ${formatUSDT(transaction.amount)} USDT
💵 Fiat: ${formatFiat(transaction.fiatAmount)} ${transaction.fiatType}
🧾 Transaction ID: #${transaction.id}
❓ Reason: ${rejectionReason}

Please contact support if you have any questions.
    `, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error(`Error rejecting exchange transaction:`, error);
    adminBot.sendMessage(chatId, '❌ An error occurred while rejecting the exchange.');
  }
});

// Command: /find_user [chatId]
adminBot.onText(/\/find_user (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  
  if (!isAdmin(chatId)) {
    return adminBot.sendMessage(chatId, '⛔ You are not authorized to use this bot.');
  }
  
  const userChatId = match[1];
  
  try {
    // Find user
    const user = await User.findByPk(userChatId);
    
    if (!user) {
      return adminBot.sendMessage(chatId, '❌ User not found.');
    }
    
    // Get user balance
    const balance = await Transaction.getUserBalance(userChatId);
    
    // Get user's recent transactions
    const transactions = await Transaction.getUserHistory(userChatId, 5);
    
    // Create user info message
    let message = `
👤 *User Information*

Chat ID: ${user.chatId}
Username: ${user.username || 'Not set'}
Registered: ${new Date(user.createdAt).toLocaleString()}
Last Active: ${new Date(user.updatedAt).toLocaleString()}
Balance: ${formatUSDT(balance)} USDT
    `;
    
    if (transactions.length > 0) {
      message += `\n📝 *Recent Transactions:*\n\n`;
      
      for (const tx of transactions) {
        message += `ID: #${tx.id}\n`;
        message += `Type: ${tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}\n`;
        message += `Amount: ${formatUSDT(tx.amount)} USDT\n`;
        message += `Status: ${formatStatus(tx.status)}\n`;
        message += `Date: ${new Date(tx.createdAt).toLocaleString()}\n\n`;
      }
    } else {
      message += '\nNo transaction history found.';
    }
    
    adminBot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error(`Error finding user:`, error);
    adminBot.sendMessage(chatId, '❌ An error occurred while finding the user.');
  }
});

// Command: /find_tx [id]
adminBot.onText(/\/find_tx (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  
  if (!isAdmin(chatId)) {
    return adminBot.sendMessage(chatId, '⛔ You are not authorized to use this bot.');
  }
  
  const transactionId = match[1];
  
  try {
    // Find transaction
    const transaction = await Transaction.findByPk(transactionId);
    
    if (!transaction) {
      return adminBot.sendMessage(chatId, '❌ Transaction not found.');
    }
    
    // Find associated user
    const user = await User.findByPk(transaction.chatId);
    
    // Create transaction details message
    let message = `
🧾 *Transaction #${transaction.id}*

Type: ${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
Status: ${formatStatus(transaction.status)}
Amount: ${formatUSDT(transaction.amount)} USDT
    `;
    
    if (transaction.fiatAmount) {
      message += `Fiat: ${formatFiat(transaction.fiatAmount)} ${transaction.fiatType}\n`;
    }
    
    if (transaction.walletAddress) {
      message += `Wallet: \`${transaction.walletAddress}\`\n`;
    }
    
    if (transaction.txHash) {
      message += `TX Hash: \`${transaction.txHash}\`\n`;
    }
    
    if (transaction.fee) {
      message += `Fee: ${formatUSDT(transaction.fee)} USDT\n`;
    }
    
    message += `\n👤 *User Information*\n`;
    message += `Chat ID: ${user.chatId}\n`;
    message += `Username: ${user.username || 'Not set'}\n`;
    
    message += `\n📅 *Timestamps*\n`;
    message += `Created: ${new Date(transaction.createdAt).toLocaleString()}\n`;
    message += `Updated: ${new Date(transaction.updatedAt).toLocaleString()}\n`;
    
    if (transaction.completedAt) {
      message += `Completed: ${new Date(transaction.completedAt).toLocaleString()}\n`;
    }
    
    if (transaction.adminNotes) {
      message += `\n📝 *Admin Notes*\n${transaction.adminNotes}\n`;
    }
    
    // Add action buttons if pending exchange
    if (transaction.type === 'exchange' && transaction.status === 'pending') {
      message += `\nActions: /complete_exchange ${transaction.id} | /reject_exchange ${transaction.id}`;
    }
    
    adminBot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error(`Error finding transaction:`, error);
    adminBot.sendMessage(chatId, '❌ An error occurred while finding the transaction.');
  }
});

// Handle callback queries (inline keyboard buttons)
adminBot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id.toString();
  const data = query.data;
  
  if (!isAdmin(chatId)) {
    adminBot.answerCallbackQuery(query.id, '⛔ You are not authorized to use this bot.');
    return;
  }
  
  // Acknowledge the callback query
  adminBot.answerCallbackQuery(query.id);
  
  try {
    switch (data) {
      case 'system_overview':
        // Get system metrics
        const overview = await metricsService.getSystemOverview();
        const walletBalance = await blockchainService.getWalletBalance();
        const rates = await ExchangeRate.getCurrentRates();
        
        adminBot.editMessageText(`
📊 *System Overview*

👥 *Users:*
- Total: ${overview.users.total}
- New (24h): ${overview.users.new24h}
- New (7d): ${overview.users.new7d}
- New (30d): ${overview.users.new30d}

💰 *Transaction Volume:*
- Daily: ${formatUSDT(overview.volume.daily)} USDT
- Weekly: ${formatUSDT(overview.volume.weekly)} USDT

💱 *Exchange Requests:*
- Pending: ${overview.pendingExchanges}

💵 *Exchange Rates:*
- USD: ${rates.rateUSD}
- UAH: ${rates.rateUAH}

🏦 *Wallet Balance:*
- USDT: ${formatUSDT(walletBalance)}

📝 *System Configuration:*
- Withdrawal Fee: ${config.transactions.withdrawalFee} USDT
- Min Confirmations: ${config.transactions.minConfirmations}
        `, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'Markdown',
          ...createAdminMenu()
        });
        break;
        
      case 'exchange_requests':
        // Get pending exchange requests
        const pendingExchanges = await exchangeService.getPendingExchangeRequests();
        
        if (pendingExchanges.length === 0) {
          adminBot.editMessageText('📝 No pending exchange requests.', {
            chat_id: chatId,
            message_id: query.message.message_id,
            ...createAdminMenu()
          });
          break;
        }
        
        // Create exchange requests message
        let message = '💱 *Pending Exchange Requests*\n\n';
        
        for (const item of pendingExchanges) {
          const { transaction, user } = item;
          
          message += `*ID #${transaction.id}*\n`;
          message += `User: ${user.username || 'No username'} (${user.chatId})\n`;
          message += `Amount: ${formatUSDT(transaction.amount)} USDT\n`;
          message += `Fiat: ${formatFiat(transaction.fiatAmount)} ${transaction.fiatType}\n`;
          message += `Requested: ${new Date(transaction.createdAt).toLocaleString()}\n`;
          message += `Commands: /complete_exchange ${transaction.id} | /reject_exchange ${transaction.id}\n\n`;
        }
        
        adminBot.editMessageText(message, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'Markdown',
          ...createAdminMenu()
        });
        break;
        
      case 'wallet_balance':
        // Get wallet balance
        const balance = await blockchainService.getWalletBalance();
        
        adminBot.editMessageText(`
🏦 *Wallet Balance*

💰 USDT: ${formatUSDT(balance)}

📝 *Deposit Address:*
\`${config.blockchain.depositAddress}\`
        `, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'Markdown',
          ...createAdminMenu()
        });
        break;
        
      case 'exchange_rates':
        // Get current exchange rates
        const currentRates = await ExchangeRate.getCurrentRates();
        
        adminBot.editMessageText(`
💵 *Exchange Rates*

Current Rates:
- 1 USDT = ${currentRates.rateUSD} USD
- 1 USDT = ${currentRates.rateUAH} UAH

To update rates, use:
/rate_usd [value] - Update USD rate
/rate_uah [value] - Update UAH rate
        `, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'Markdown',
          ...createAdminMenu()
        });
        break;
    }
  } catch (error) {
    // Handle message not modified error gracefully
    if (error.message && error.message.includes('message is not modified')) {
      logger.debug(`Ignored message not modified error for admin callback ${data}`);
    } else {
      logger.error(`Error handling admin callback query ${data}:`, error);
      adminBot.sendMessage(chatId, '❌ An error occurred. Please try again later.');
    }
  }
});

// Export the admin bot
module.exports = { adminBot };
const TelegramBot = require('node-telegram-bot-api');
const Decimal = require('decimal.js');

const config = require('../config/config');
const logger = require('../utils/logger');
const validation = require('../utils/validation');
const { formatUSDT, formatFiat, formatStatus, createTransactionSummary } = require('../utils/format');

const User = require('../models/User');
const Transaction = require('../models/Transaction');
const ExchangeRate = require('../models/ExchangeRate');

const blockchainService = require('../services/blockchain');
const exchangeService = require('../services/exchange');

// Create bot instance
const bot = new TelegramBot(config.telegramToken, { polling: true });

// Admin bot for notifications
const adminBot = new TelegramBot(config.adminTelegramToken, { polling: false });

// Map to store deposit requests by chatId
const depositRequests = new Map();

// Helper function to create inline keyboard markup
function createInlineKeyboardMarkup(buttons) {
  return {
    reply_markup: {
      inline_keyboard: buttons
    }
  };
}

// Helper function to create main menu
function createMainMenu() {
  return createInlineKeyboardMarkup([
    [{ text: '💰 Balance', callback_data: 'balance' }],
    [{ text: '📥 Deposit', callback_data: 'deposit' }, { text: '📤 Withdraw', callback_data: 'withdraw' }],
    [{ text: '💱 Exchange', callback_data: 'exchange' }],
    [{ text: '📊 Transaction History', callback_data: 'history' }]
  ]);
}

// Helper function to register user
async function registerUser(msg) {
  const chatId = msg.chat.id.toString();
  const username = msg.from.username || null;
  
  try {
    const user = await User.findOrCreateUser(chatId, username);
    logger.info(`User registered or updated: ${chatId}, username: ${username}`);
    return user;
  } catch (error) {
    logger.error(`Error registering user ${chatId}:`, error);
    throw error;
  }
}

// Helper function to check if user exists
async function ensureUserExists(chatId) {
  const user = await User.findByPk(chatId);
  return !!user;
}

// Helper function to handle errors
function handleError(chatId, error) {
  logger.error(`Error for user ${chatId}:`, error);
  bot.sendMessage(chatId, '❌ An error occurred. Please try again later.');
}

// Command: /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id.toString();
  
  try {
    await registerUser(msg);
    
    const welcomeMessage = `
🎉 *Welcome to Hive Exchange Bot!* 🎉

I'll help you deposit, withdraw, and exchange your USDT (BEP-20) cryptocurrency.

👉 *Available Commands:*
/start - Show this welcome message
/balance - Check your current balance
/deposit - Start a deposit process
/withdraw amount,walletAddress - Withdraw USDT to external wallet
/exchange amount,fiatType - Exchange USDT to USD or UAH
/history - View your transaction history

You can also use the menu below to navigate:
    `;
    
    bot.sendMessage(chatId, welcomeMessage, {
      parse_mode: 'Markdown',
      ...createMainMenu()
    });
  } catch (error) {
    handleError(chatId, error);
  }
});

// Command: /balance
bot.onText(/\/balance/, async (msg) => {
  const chatId = msg.chat.id.toString();
  
  try {
    if (!await ensureUserExists(chatId)) {
      await registerUser(msg);
    }
    
    const balance = await Transaction.getUserBalance(chatId);
    
    bot.sendMessage(chatId, `💰 *Your Current Balance*\n\n${formatUSDT(balance)} USDT`, {
      parse_mode: 'Markdown',
      ...createMainMenu()
    });
  } catch (error) {
    handleError(chatId, error);
  }
});

// Command: /deposit
bot.onText(/\/deposit/, async (msg) => {
  const chatId = msg.chat.id.toString();
  
  try {
    if (!await ensureUserExists(chatId)) {
      await registerUser(msg);
    }
    
    // Generate random amount for deposit identification
    const randomAmount = (Math.floor(Math.random() * 10000) / 10000).toFixed(4);
    const depositAmount = new Decimal(msg.text.split(' ')[1] || '10').plus(randomAmount).toFixed(6);
    
    // Store deposit request
    depositRequests.set(chatId, {
      amount: depositAmount,
      timestamp: Date.now()
    });
    
    const depositMessage = `
📥 *USDT Deposit Instructions*

1️⃣ Send *exactly* ${depositAmount} USDT (BEP-20) to:
\`${config.blockchain.depositAddress}\`

2️⃣ After sending, copy your transaction hash (TX ID) from your wallet or blockchain explorer

3️⃣ Confirm your deposit by sending:
\`/confirm YOUR_TX_HASH\`

⚠️ *Important Notes:*
- Only send USDT on the BSC (BNB Smart Chain) network!
- Send *exactly* ${depositAmount} USDT - no more, no less
- Wait for at least 5 confirmations before confirming
- Deposit requests expire after 24 hours
    `;
    
    bot.sendMessage(chatId, depositMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Back to Menu', callback_data: 'start' }]
        ]
      }
    });
  } catch (error) {
    handleError(chatId, error);
  }
});

// Command: /confirm <txHash>
bot.onText(/\/confirm (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  const txHash = match[1];
  
  try {
    if (!await ensureUserExists(chatId)) {
      await registerUser(msg);
    }
    
    // Validate transaction hash format
    if (!validation.isValidTxHash(txHash)) {
      return bot.sendMessage(chatId, '❌ Invalid transaction hash format. Please check and try again.');
    }
    
    // Check if there's an active deposit request
    const depositRequest = depositRequests.get(chatId);
    if (!depositRequest) {
      return bot.sendMessage(chatId, '❌ No active deposit request found. Please start a new deposit with /deposit.');
    }
    
    // Check if deposit request has expired (24 hours)
    if (Date.now() - depositRequest.timestamp > 24 * 60 * 60 * 1000) {
      depositRequests.delete(chatId);
      return bot.sendMessage(chatId, '❌ Deposit request has expired. Please start a new deposit with /deposit.');
    }
    
    // Send processing message
    const processingMsg = await bot.sendMessage(chatId, '⏳ Verifying your transaction. This may take a few moments...');
    
    // Verify transaction
    const verificationResult = await blockchainService.verifyDepositTransaction(txHash, depositRequest.amount);
    
    if (!verificationResult.verified) {
      return bot.sendMessage(chatId, `❌ Verification failed: ${verificationResult.reason}`);
    }
    
    // Create deposit transaction
    const transaction = await Transaction.createDeposit(chatId, depositRequest.amount);
    
    // Update transaction with verification details
    transaction.txHash = txHash;
    transaction.status = 'completed';
    transaction.completedAt = new Date();
    transaction.confirmations = verificationResult.confirmations;
    await transaction.save();
    
    // Clear deposit request
    depositRequests.delete(chatId);
    
    // Get updated balance
    const balance = await Transaction.getUserBalance(chatId);
    
    // Send success message
    bot.sendMessage(chatId, `
✅ *Deposit Verified Successfully!*

💰 Amount: ${formatUSDT(transaction.amount)} USDT
🧾 Transaction ID: #${transaction.id}
🔗 TX Hash: \`${txHash}\`
📊 New Balance: ${formatUSDT(balance)} USDT

Thank you for using Hive Exchange Bot!
    `, {
      parse_mode: 'Markdown',
      ...createMainMenu()
    });
    
    // Log successful deposit
    logger.info(`Deposit verified for user ${chatId}: ${formatUSDT(transaction.amount)} USDT, TX: ${txHash}`);
  } catch (error) {
    handleError(chatId, error);
  }
});

// Command: /withdraw amount,walletAddress
bot.onText(/\/withdraw (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  const command = match[1];
  
  try {
    if (!await ensureUserExists(chatId)) {
      await registerUser(msg);
    }
    
    // Parse withdraw command
    const parsed = validation.parseWithdrawCommand(command);
    if (!parsed) {
      return bot.sendMessage(chatId, '❌ Invalid format. Use: /withdraw amount,walletAddress');
    }
    
    const { amount, address } = parsed;
    
    // Check user balance
    const balance = await Transaction.getUserBalance(chatId);
    const withdrawalFee = config.transactions.withdrawalFee;
    const totalAmount = new Decimal(amount).plus(withdrawalFee);
    
    if (new Decimal(balance).lessThan(totalAmount)) {
      return bot.sendMessage(chatId, `
❌ *Insufficient Balance*

Requested amount: ${formatUSDT(amount)} USDT
Network fee: ${withdrawalFee} USDT
Total needed: ${totalAmount.toFixed(6)} USDT
Your balance: ${formatUSDT(balance)} USDT
      `, { parse_mode: 'Markdown' });
    }
    
    // Create withdrawal transaction
    const transaction = await Transaction.createWithdrawal(chatId, amount, address, withdrawalFee);
    
    // Process withdrawal
    const processingMsg = await bot.sendMessage(chatId, '⏳ Processing your withdrawal. This may take a few moments...');
    
    const result = await blockchainService.processWithdrawal(transaction);
    
    if (!result.success) {
      return bot.sendMessage(chatId, `❌ Withdrawal failed: ${result.error}`);
    }
    
    // Get updated balance
    const newBalance = await Transaction.getUserBalance(chatId);
    
    // Send success message
    bot.sendMessage(chatId, `
✅ *Withdrawal Successful!*

💰 Amount: ${formatUSDT(amount)} USDT
📬 Address: \`${address}\`
🔗 TX Hash: \`${result.txHash}\`
💸 Fee: ${withdrawalFee} USDT
📊 New Balance: ${formatUSDT(newBalance)} USDT

Thank you for using Hive Exchange Bot!
    `, {
      parse_mode: 'Markdown',
      ...createMainMenu()
    });
    
    // Log successful withdrawal
    logger.info(`Withdrawal processed for user ${chatId}: ${formatUSDT(amount)} USDT to ${address}, TX: ${result.txHash}`);
  } catch (error) {
    handleError(chatId, error);
  }
});

// Command: /exchange amount,fiatType
bot.onText(/\/exchange (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  const command = match[1];
  
  try {
    if (!await ensureUserExists(chatId)) {
      await registerUser(msg);
    }
    
    // Parse exchange command
    const parsed = validation.parseExchangeCommand(command);
    if (!parsed) {
      return bot.sendMessage(chatId, '❌ Invalid format. Use: /exchange amount,fiatType (USD or UAH)');
    }
    
    const { amount, fiatType } = parsed;
    
    // Process exchange request
    const result = await exchangeService.processExchangeRequest(chatId, amount, fiatType);
    
    if (!result.success) {
      return bot.sendMessage(chatId, `❌ Exchange request failed: ${result.error}`);
    }
    
    // Get user for notification
    const user = await User.findByPk(chatId);
    
    // Send confirmation to user
    bot.sendMessage(chatId, `
💱 *Exchange Request Submitted*

💰 Amount: ${formatUSDT(amount)} USDT
💵 Fiat: ${formatFiat(result.fiatAmount)} ${fiatType}
🧾 Transaction ID: #${result.transaction.id}
⏳ Status: Pending admin approval

Our team will process your request shortly. 
You'll receive a notification when it's completed.
    `, {
      parse_mode: 'Markdown',
      ...createMainMenu()
    });
    
    // Notify admin
    const adminNotification = exchangeService.formatAdminExchangeNotification(
      result.transaction,
      user
    );
    
    adminBot.sendMessage(config.adminChatId, adminNotification, {
      parse_mode: 'Markdown'
    });
    
    // Log exchange request
    logger.info(`Exchange request created for user ${chatId}: ${formatUSDT(amount)} USDT to ${formatFiat(result.fiatAmount)} ${fiatType}`);
  } catch (error) {
    handleError(chatId, error);
  }
});

// Command: /history
bot.onText(/\/history/, async (msg) => {
  const chatId = msg.chat.id.toString();
  
  try {
    if (!await ensureUserExists(chatId)) {
      await registerUser(msg);
    }
    
    // Get user transaction history
    const transactions = await Transaction.getUserHistory(chatId, 5);
    
    if (transactions.length === 0) {
      return bot.sendMessage(chatId, '📝 You have no transaction history yet.', createMainMenu());
    }
    
    // Create history message
    let historyMessage = '📝 *Your Recent Transactions*\n\n';
    
    for (const tx of transactions) {
      historyMessage += `${createTransactionSummary(tx)}\n`;
    }
    
    historyMessage += '\nShowing last 5 transactions.';
    
    bot.sendMessage(chatId, historyMessage, {
      parse_mode: 'Markdown',
      ...createMainMenu()
    });
  } catch (error) {
    handleError(chatId, error);
  }
});

// Handle callback queries (inline keyboard buttons)
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id.toString();
  const data = query.data;
  
  try {
    if (!await ensureUserExists(chatId)) {
      await registerUser(query.message);
    }
    
    // Acknowledge the callback query
    bot.answerCallbackQuery(query.id);
    
    switch (data) {
      case 'start':
        // Show welcome message again
        const welcomeMessage = `
🎉 *Welcome to Hive Exchange Bot!* 🎉

I'll help you deposit, withdraw, and exchange your USDT (BEP-20) cryptocurrency.

Select an option from the menu below:
        `;
        
        bot.editMessageText(welcomeMessage, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'Markdown',
          ...createMainMenu()
        });
        break;
        
      case 'balance':
        // Show user balance
        const balance = await Transaction.getUserBalance(chatId);
        
        bot.editMessageText(`💰 *Your Current Balance*\n\n${formatUSDT(balance)} USDT`, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'Markdown',
          ...createMainMenu()
        });
        break;
        
      case 'deposit':
        // Start deposit process
        const randomAmount = (Math.floor(Math.random() * 10000) / 10000).toFixed(4);
        const depositAmount = new Decimal('10').plus(randomAmount).toFixed(6);
        
        // Store deposit request
        depositRequests.set(chatId, {
          amount: depositAmount,
          timestamp: Date.now()
        });
        
        const depositMessage = `
📥 *USDT Deposit Instructions*

1️⃣ Send *exactly* ${depositAmount} USDT (BEP-20) to:
\`${config.blockchain.depositAddress}\`

2️⃣ After sending, copy your transaction hash (TX ID) from your wallet or blockchain explorer

3️⃣ Confirm your deposit by sending:
\`/confirm YOUR_TX_HASH\`

⚠️ *Important Notes:*
- Only send USDT on the BSC (BNB Smart Chain) network!
- Send *exactly* ${depositAmount} USDT - no more, no less
- Wait for at least 5 confirmations before confirming
- Deposit requests expire after 24 hours
        `;
        
        bot.editMessageText(depositMessage, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Menu', callback_data: 'start' }]
            ]
          }
        });
        break;
        
      case 'withdraw':
        // Show withdrawal instructions
        const withdrawMessage = `
📤 *USDT Withdrawal*

To withdraw USDT, use the following command:
\`/withdraw amount,walletAddress\`

*Example:*
\`/withdraw 50,0x1234...5678\`

⚠️ *Important Notes:*
- Withdrawal fee: ${config.transactions.withdrawalFee} USDT
- Only BEP-20 addresses are supported
- Double-check your wallet address before confirming
        `;
        
        bot.editMessageText(withdrawMessage, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Menu', callback_data: 'start' }]
            ]
          }
        });
        break;
        
      case 'exchange':
        // Show exchange options
        const rates = await ExchangeRate.getCurrentRates();
        
        const exchangeMessage = `
💱 *Exchange USDT to Fiat*

Current Exchange Rates:
- 1 USDT = ${rates.rateUSD} USD
- 1 USDT = ${rates.rateUAH} UAH

To exchange USDT, use the following command:
\`/exchange amount,fiatType\`

*Examples:*
\`/exchange 100,USD\`
\`/exchange 50,UAH\`

⚠️ *Important Notes:*
- Exchanges are processed manually by our administrators
- You'll receive a notification when your exchange is completed
- Make sure you have sufficient balance before requesting an exchange
        `;
        
        bot.editMessageText(exchangeMessage, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Menu', callback_data: 'start' }]
            ]
          }
        });
        break;
        
      case 'history':
        // Show transaction history
        const transactions = await Transaction.getUserHistory(chatId, 5);
        
        if (transactions.length === 0) {
          bot.editMessageText('📝 You have no transaction history yet.', {
            chat_id: chatId,
            message_id: query.message.message_id,
            ...createMainMenu()
          });
          break;
        }
        
        // Create history message
        let historyMessage = '📝 *Your Recent Transactions*\n\n';
        
        for (const tx of transactions) {
          historyMessage += `${createTransactionSummary(tx)}\n`;
        }
        
        historyMessage += '\nShowing last 5 transactions.';
        
        bot.editMessageText(historyMessage, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'Markdown',
          ...createMainMenu()
        });
        break;
    }
} catch (error) {
    // Handle message not modified error gracefully
    if (error.message && error.message.includes('message is not modified')) {
      logger.debug(`Ignored message not modified error for callback ${data}`);
    } else {
      logger.error(`Error handling callback query ${data} for user ${chatId}:`, error);
      bot.sendMessage(chatId, '❌ An error occurred. Please try again later.');
    }
  }
});

// Export the bot
module.exports = { bot };
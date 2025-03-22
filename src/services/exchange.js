const Decimal = require('decimal.js');
const config = require('../config/config');
const logger = require('../utils/logger');
const Transaction = require('../models/Transaction');
const ExchangeRate = require('../models/ExchangeRate');
const User = require('../models/User');
const { formatUSDT, formatFiat, createTransactionSummary } = require('../utils/format');

/**
 * Process exchange request
 * @param {string} chatId - User chat ID
 * @param {string} amount - USDT amount
 * @param {string} fiatType - Fiat currency type
 * @returns {Promise<Object>} - Processing result
 */
async function processExchangeRequest(chatId, amount, fiatType) {
  try {
    logger.info(`Processing exchange request for user ${chatId}: ${amount} USDT to ${fiatType}`);
    
    // Get user
    const user = await User.findByPk(chatId);
    if (!user) {
      return {
        success: false,
        error: 'User not found'
      };
    }
    
    // Get current balance
    const balance = await Transaction.getUserBalance(chatId);
    const amountDecimal = new Decimal(amount);
    
    // Verify sufficient balance
    if (amountDecimal.greaterThan(balance)) {
      return {
        success: false,
        error: `Insufficient balance. Available: ${formatUSDT(balance)} USDT`
      };
    }
    
    // Get current exchange rates
    const rates = await ExchangeRate.getCurrentRates();
    const rate = fiatType === 'USD' ? rates.rateUSD : rates.rateUAH;
    
    // Calculate fiat amount
    const fiatAmount = amountDecimal.times(rate).toFixed(2);
    
    // Create exchange transaction
    const transaction = await Transaction.createExchange(chatId, amount, fiatAmount, fiatType);
    
    logger.info(`Exchange request created: ${transaction.id}`);
    
    return {
      success: true,
      transaction,
      fiatAmount
    };
  } catch (error) {
    logger.error(`Error processing exchange request for user ${chatId}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Complete exchange transaction (admin action)
 * @param {number} transactionId - Transaction ID
 * @param {string} adminNotes - Admin notes
 * @returns {Promise<Object>} - Processing result
 */
async function completeExchangeTransaction(transactionId, adminNotes = '') {
  try {
    logger.info(`Completing exchange transaction: ${transactionId}`);
    
    // Find transaction
    const transaction = await Transaction.findByPk(transactionId);
    
    if (!transaction) {
      return {
        success: false,
        error: 'Transaction not found'
      };
    }
    
    if (transaction.type !== 'exchange') {
      return {
        success: false,
        error: 'Not an exchange transaction'
      };
    }
    
    if (transaction.status !== 'pending') {
      return {
        success: false,
        error: `Transaction is not pending, current status: ${transaction.status}`
      };
    }
    
    // Update transaction
    transaction.status = 'completed';
    transaction.completedAt = new Date();
    if (adminNotes) {
      transaction.adminNotes = adminNotes;
    }
    
    await transaction.save();
    
    logger.info(`Exchange transaction completed: ${transactionId}`);
    
    return {
      success: true,
      transaction
    };
  } catch (error) {
    logger.error(`Error completing exchange transaction ${transactionId}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get pending exchange requests
 * @returns {Promise<Array>} - Array of pending exchange requests
 */
async function getPendingExchangeRequests() {
  try {
    const pendingExchanges = await Transaction.findAll({
      where: {
        type: 'exchange',
        status: 'pending'
      },
      order: [['createdAt', 'ASC']]
    });
    
    // Fetch user data for each transaction
    const results = [];
    for (const tx of pendingExchanges) {
      const user = await User.findByPk(tx.chatId);
      results.push({
        transaction: tx,
        user
      });
    }
    
    return results;
  } catch (error) {
    logger.error('Error fetching pending exchange requests:', error);
    throw error;
  }
}

/**
 * Format exchange notification for admin
 * @param {Object} transaction - Transaction object
 * @param {Object} user - User object
 * @returns {string} - Formatted notification
 */
function formatAdminExchangeNotification(transaction, user) {
  let message = `💱 *NEW EXCHANGE REQUEST*\n\n`;
  message += `*Transaction ID:* #${transaction.id}\n`;
  message += `*User:* ${user.username || 'No username'} (ID: ${user.chatId})\n`;
  message += `*Amount:* ${formatUSDT(transaction.amount)} USDT\n`;
  message += `*Fiat:* ${formatFiat(transaction.fiatAmount)} ${transaction.fiatType}\n`;
  message += `*Requested:* ${new Date(transaction.createdAt).toLocaleString()}\n\n`;
  
  message += `Use these commands to process:\n`;
  message += `/complete_exchange ${transaction.id} - Mark as completed\n`;
  message += `/reject_exchange ${transaction.id} - Reject this exchange\n`;
  
  return message;
}

module.exports = {
  processExchangeRequest,
  completeExchangeTransaction,
  getPendingExchangeRequests,
  formatAdminExchangeNotification
};
const Decimal = require('decimal.js');

/**
 * Format USDT amount with 6 decimal places
 * @param {string|number} amount - Amount to format
 * @returns {string} - Formatted amount
 */
function formatUSDT(amount) {
  try {
    const decimal = new Decimal(amount);
    return decimal.toFixed(6);
  } catch (error) {
    return '0.000000';
  }
}

/**
 * Format fiat amount with 2 decimal places
 * @param {string|number} amount - Amount to format
 * @returns {string} - Formatted amount
 */
function formatFiat(amount) {
  try {
    const decimal = new Decimal(amount);
    return decimal.toFixed(2);
  } catch (error) {
    return '0.00';
  }
}

/**
 * Format date to readable string
 * @param {Date} date - Date to format
 * @returns {string} - Formatted date string
 */
function formatDate(date) {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });
}

/**
 * Format transaction status with emoji
 * @param {string} status - Transaction status
 * @returns {string} - Formatted status with emoji
 */
function formatStatus(status) {
  const statusMap = {
    'pending': '⏳ Pending',
    'completed': '✅ Completed',
    'failed': '❌ Failed',
    'processing': '🔄 Processing'
  };
  
  return statusMap[status] || status;
}

/**
 * Create a transaction summary message
 * @param {Object} transaction - Transaction object
 * @returns {string} - Formatted transaction summary
 */
function createTransactionSummary(transaction) {
  let summary = `🧾 *Transaction #${transaction.id}*\n`;
  summary += `Type: ${transaction.type === 'deposit' ? '📥 Deposit' : transaction.type === 'withdrawal' ? '📤 Withdrawal' : '💱 Exchange'}\n`;
  summary += `Status: ${formatStatus(transaction.status)}\n`;
  summary += `Amount: ${formatUSDT(transaction.amount)} USDT\n`;
  
  if (transaction.type === 'exchange') {
    summary += `Fiat: ${formatFiat(transaction.fiatAmount)} ${transaction.fiatType}\n`;
  }
  
  if (transaction.txHash) {
    summary += `TX Hash: \`${transaction.txHash}\`\n`;
  }
  
  if (transaction.walletAddress && transaction.type === 'withdrawal') {
    summary += `Wallet: \`${transaction.walletAddress}\`\n`;
  }
  
  summary += `Date: ${formatDate(transaction.createdAt)}\n`;
  
  return summary;
}

module.exports = {
  formatUSDT,
  formatFiat,
  formatDate,
  formatStatus,
  createTransactionSummary
};
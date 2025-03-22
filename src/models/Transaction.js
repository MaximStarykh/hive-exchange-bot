const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const Decimal = require('decimal.js');

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: 'Unique identifier (primary key)'
  },
  type: {
    type: DataTypes.ENUM('deposit', 'withdrawal', 'exchange'),
    allowNull: false,
    comment: 'Transaction type (deposit, withdrawal, exchange)'
  },
  chatId: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: "Associated user's Telegram chat ID"
  },
  amount: {
    type: DataTypes.DECIMAL(24, 6),
    allowNull: false,
    comment: 'USDT amount'
  },
  fiatAmount: {
    type: DataTypes.DECIMAL(24, 2),
    allowNull: true,
    comment: 'Equivalent fiat amount (for exchanges)'
  },
  fiatType: {
    type: DataTypes.ENUM('USD', 'UAH'),
    allowNull: true,
    comment: 'Fiat currency type (USD/UAH)'
  },
  walletAddress: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'External wallet address (for withdrawals)'
  },
  txHash: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Blockchain transaction hash'
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'failed', 'processing'),
    allowNull: false,
    defaultValue: 'pending',
    comment: 'Transaction status'
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: 'Creation timestamp'
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: 'Last update timestamp'
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Transaction completion timestamp'
  },
  fee: {
    type: DataTypes.DECIMAL(24, 6),
    allowNull: true,
    comment: 'Transaction fee amount'
  },
  confirmations: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Number of blockchain confirmations (for deposits)'
  },
  paymentDetails: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'JSON field storing payment method details for exchanges'
  },
  adminNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Administrative notes regarding the transaction'
  }
}, {
  tableName: 'transactions',
  timestamps: true
});

/**
 * Calculate user balance based on transaction history
 * @param {string} chatId - Telegram chat ID
 * @returns {Promise<string>} - User balance as string
 */
Transaction.getUserBalance = async function(chatId) {
  // Get all completed deposits
  const deposits = await this.findAll({
    where: {
      chatId,
      type: 'deposit',
      status: 'completed'
    },
    attributes: ['amount']
  });
  
  // Get all completed withdrawals
  const withdrawals = await this.findAll({
    where: {
      chatId,
      type: 'withdrawal',
      status: ['completed', 'pending', 'processing']
    },
    attributes: ['amount']
  });
  
  // Get all completed exchanges
  const exchanges = await this.findAll({
    where: {
      chatId,
      type: 'exchange',
      status: ['completed', 'pending', 'processing']
    },
    attributes: ['amount']
  });
  
  // Calculate total deposits
  const totalDeposits = deposits.reduce((sum, tx) => {
    return sum.plus(tx.amount);
  }, new Decimal(0));
  
  // Calculate total withdrawals
  const totalWithdrawals = withdrawals.reduce((sum, tx) => {
    return sum.plus(tx.amount);
  }, new Decimal(0));
  
  // Calculate total exchanges
  const totalExchanges = exchanges.reduce((sum, tx) => {
    return sum.plus(tx.amount);
  }, new Decimal(0));
  
  // Calculate balance
  const balance = totalDeposits.minus(totalWithdrawals).minus(totalExchanges);
  
  // Ensure balance is not negative
  return balance.lessThan(0) ? '0.000000' : balance.toFixed(6);
};

/**
 * Get user transaction history
 * @param {string} chatId - Telegram chat ID
 * @param {number} limit - Maximum number of transactions to return
 * @returns {Promise<Array>} - Array of transactions
 */
Transaction.getUserHistory = async function(chatId, limit = 10) {
  return await this.findAll({
    where: { chatId },
    order: [['createdAt', 'DESC']],
    limit
  });
};

/**
 * Get pending transactions of a specific type
 * @param {string} type - Transaction type
 * @returns {Promise<Array>} - Array of pending transactions
 */
Transaction.getPendingByType = async function(type) {
  return await this.findAll({
    where: {
      type,
      status: 'pending'
    },
    order: [['createdAt', 'ASC']]
  });
};

/**
 * Create a deposit transaction
 * @param {string} chatId - Telegram chat ID
 * @param {string} amount - USDT amount
 * @returns {Promise<Object>} - Created transaction
 */
Transaction.createDeposit = async function(chatId, amount) {
  return await this.create({
    type: 'deposit',
    chatId,
    amount,
    status: 'pending'
  });
};

/**
 * Create a withdrawal transaction
 * @param {string} chatId - Telegram chat ID
 * @param {string} amount - USDT amount
 * @param {string} walletAddress - Recipient wallet address
 * @param {string} fee - Transaction fee
 * @returns {Promise<Object>} - Created transaction
 */
Transaction.createWithdrawal = async function(chatId, amount, walletAddress, fee) {
  return await this.create({
    type: 'withdrawal',
    chatId,
    amount,
    walletAddress,
    fee,
    status: 'pending'
  });
};

/**
 * Create an exchange transaction
 * @param {string} chatId - Telegram chat ID
 * @param {string} amount - USDT amount
 * @param {string} fiatAmount - Fiat amount
 * @param {string} fiatType - Fiat currency type
 * @returns {Promise<Object>} - Created transaction
 */
Transaction.createExchange = async function(chatId, amount, fiatAmount, fiatType) {
  return await this.create({
    type: 'exchange',
    chatId,
    amount,
    fiatAmount,
    fiatType,
    status: 'pending'
  });
};

module.exports = Transaction;
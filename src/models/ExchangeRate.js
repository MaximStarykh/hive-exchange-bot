const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const config = require('../config/config');

const ExchangeRate = sequelize.define('ExchangeRate', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: false,
    defaultValue: 1,
    comment: 'Fixed ID (1)'
  },
  rateUSD: {
    type: DataTypes.DECIMAL(24, 6),
    allowNull: false,
    defaultValue: config.defaultRates.usd,
    comment: 'USDT to USD conversion rate'
  },
  rateUAH: {
    type: DataTypes.DECIMAL(24, 6),
    allowNull: false,
    defaultValue: config.defaultRates.uah,
    comment: 'USDT to UAH conversion rate'
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
  }
}, {
  tableName: 'exchange_rates',
  timestamps: true
});

/**
 * Get current exchange rates
 * @returns {Promise<Object>} - Current exchange rates
 */
ExchangeRate.getCurrentRates = async function() {
  let rates = await this.findByPk(1);
  
  if (!rates) {
    // Initialize with default rates if not exists
    rates = await this.create({
      id: 1,
      rateUSD: config.defaultRates.usd,
      rateUAH: config.defaultRates.uah
    });
  }
  
  return rates;
};

/**
 * Update exchange rates
 * @param {Object} newRates - New exchange rates
 * @returns {Promise<Object>} - Updated exchange rates
 */
ExchangeRate.updateRates = async function(newRates) {
  const rates = await this.findByPk(1);
  
  if (rates) {
    if (newRates.rateUSD) rates.rateUSD = newRates.rateUSD;
    if (newRates.rateUAH) rates.rateUAH = newRates.rateUAH;
    await rates.save();
    return rates;
  } else {
    return await this.create({
      id: 1,
      rateUSD: newRates.rateUSD || config.defaultRates.usd,
      rateUAH: newRates.rateUAH || config.defaultRates.uah
    });
  }
};

/**
 * Convert USDT amount to fiat currency
 * @param {string} amount - USDT amount
 * @param {string} fiatType - Fiat currency type
 * @returns {Promise<string>} - Fiat amount
 */
ExchangeRate.convertToFiat = async function(amount, fiatType) {
  const rates = await this.getCurrentRates();
  const rate = fiatType === 'USD' ? rates.rateUSD : rates.rateUAH;
  
  return (parseFloat(amount) * parseFloat(rate)).toFixed(2);
};

module.exports = ExchangeRate;
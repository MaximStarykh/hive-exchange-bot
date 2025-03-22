const { sequelize } = require('../config/database');
const User = require('./User');
const Transaction = require('./Transaction');
const ExchangeRate = require('./ExchangeRate');
const SystemMetric = require('./SystemMetric');

// Define relationships
User.hasMany(Transaction, { foreignKey: 'chatId' });
Transaction.belongsTo(User, { foreignKey: 'chatId' });

// Sync models with database
async function syncModels() {
  try {
    // Force true to recreate all tables
    await sequelize.sync({ force: true });
    console.log('Database models synchronized successfully');
    return true;
  } catch (error) {
    console.error('Failed to synchronize database models:', error);
    throw error;
  }
}

module.exports = {
  sequelize,
  User,
  Transaction,
  ExchangeRate,
  SystemMetric,
  syncModels // Make sure syncModels is properly exported
};
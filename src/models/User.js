const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  chatId: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false,
    unique: true,
    comment: 'Telegram chat ID (primary key)'
  },
  username: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Telegram username'
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: 'Registration timestamp'
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: 'Last activity timestamp'
  }
}, {
  tableName: 'users',
  timestamps: true
});

/**
 * Find or create a user by chat ID
 * @param {string} chatId - Telegram chat ID
 * @param {string} username - Telegram username
 * @returns {Promise<Object>} - User object
 */
User.findOrCreateUser = async function(chatId, username) {
  const [user, created] = await this.findOrCreate({
    where: { chatId },
    defaults: { username }
  });
  
  // Update username if changed
  if (!created && user.username !== username && username) {
    user.username = username;
    await user.save();
  }
  
  return user;
};

module.exports = User;
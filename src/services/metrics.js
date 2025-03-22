const { Op } = require('sequelize');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const SystemMetric = require('../models/SystemMetric');
const logger = require('../utils/logger');
const Decimal = require('decimal.js');

/**
 * Calculate daily transaction volume
 * @param {Date} date - Date to calculate volume for
 * @returns {Promise<Object>} - Volume data
 */
async function calculateDailyVolume(date = new Date()) {
  try {
    // Format date to YYYY-MM-DD
    const dateStr = date.toISOString().split('T')[0];
    
    // Get start and end of day
    const startOfDay = new Date(dateStr);
    const endOfDay = new Date(dateStr);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Get all completed transactions for the day
    const transactions = await Transaction.findAll({
      where: {
        status: 'completed',
        completedAt: {
          [Op.between]: [startOfDay, endOfDay]
        }
      }
    });
    
    // Calculate volume by type
    const volumeByType = {
      deposit: new Decimal(0),
      withdrawal: new Decimal(0),
      exchange: new Decimal(0)
    };
    
    let totalVolume = new Decimal(0);
    
    transactions.forEach(tx => {
      const amount = new Decimal(tx.amount);
      volumeByType[tx.type] = volumeByType[tx.type].plus(amount);
      totalVolume = totalVolume.plus(amount);
    });
    
    // Convert to strings
    const result = {
      date: dateStr,
      total: totalVolume.toString(),
      deposit: volumeByType.deposit.toString(),
      withdrawal: volumeByType.withdrawal.toString(),
      exchange: volumeByType.exchange.toString(),
      count: transactions.length
    };
    
    // Record metric
    await SystemMetric.recordDailyVolume(
      dateStr,
      result.total,
      {
        deposit: result.deposit,
        withdrawal: result.withdrawal,
        exchange: result.exchange,
        count: result.count
      }
    );
    
    return result;
  } catch (error) {
    logger.error('Error calculating daily volume:', error);
    throw error;
  }
}

/**
 * Get user count metrics
 * @returns {Promise<Object>} - User count data
 */
async function getUserCountMetrics() {
  try {
    // Get total users
    const totalUsers = await User.count();
    
    // Get new users in last 24 hours
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);
    
    const newUsers24h = await User.count({
      where: {
        createdAt: {
          [Op.gte]: last24Hours
        }
      }
    });
    
    // Get new users in last 7 days
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);
    
    const newUsers7d = await User.count({
      where: {
        createdAt: {
          [Op.gte]: last7Days
        }
      }
    });
    
    // Get new users in last 30 days
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);
    
    const newUsers30d = await User.count({
      where: {
        createdAt: {
          [Op.gte]: last30Days
        }
      }
    });
    
    const result = {
      total: totalUsers,
      new24h: newUsers24h,
      new7d: newUsers7d,
      new30d: newUsers30d
    };
    
    // Record metric
    const today = new Date().toISOString().split('T')[0];
    await SystemMetric.recordUserCount(today, totalUsers);
    
    return result;
  } catch (error) {
    logger.error('Error calculating user metrics:', error);
    throw error;
  }
}

/**
 * Get volume metrics for a specific period
 * @param {number} days - Number of days to look back
 * @returns {Promise<Array>} - Volume metrics
 */
async function getVolumeMetricsForPeriod(days) {
  try {
    return await SystemMetric.getMetricsForPeriod('daily_volume', days);
  } catch (error) {
    logger.error(`Error getting volume metrics for ${days} days:`, error);
    throw error;
  }
}

/**
 * Get system overview metrics
 * @returns {Promise<Object>} - System overview
 */
async function getSystemOverview() {
  try {
    // Get volume metrics
    const dailyVolume = await calculateDailyVolume();
    const volumeMetrics7d = await getVolumeMetricsForPeriod(7);
    const volume7d = volumeMetrics7d.reduce((sum, metric) => {
      return sum.plus(metric.metricValue);
    }, new Decimal(0)).toString();
    
    // Get user metrics
    const userMetrics = await getUserCountMetrics();
    
    // Get pending exchanges
    const pendingExchanges = await Transaction.count({
      where: {
        type: 'exchange',
        status: 'pending'
      }
    });
    
    return {
      users: userMetrics,
      volume: {
        daily: dailyVolume.total,
        weekly: volume7d
      },
      pendingExchanges
    };
  } catch (error) {
    logger.error('Error getting system overview:', error);
    throw error;
  }
}

module.exports = {
  calculateDailyVolume,
  getUserCountMetrics,
  getVolumeMetricsForPeriod,
  getSystemOverview
};
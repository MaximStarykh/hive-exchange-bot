const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../config/database');

const SystemMetric = sequelize.define('SystemMetric', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: 'Unique identifier (primary key)'
  },
  metricType: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Type of metric (daily_volume, user_count, etc.)'
  },
  metricDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Date of measurement'
  },
  metricValue: {
    type: DataTypes.DECIMAL(24, 6),
    allowNull: false,
    comment: 'Numerical value'
  },
  metricData: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'JSON field with detailed breakdown'
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
  tableName: 'system_metrics',
  timestamps: true
});

/**
 * Record daily transaction volume
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {number} volume - Transaction volume
 * @param {Object} breakdown - Volume breakdown by type
 * @returns {Promise<Object>} - Created or updated metric
 */
SystemMetric.recordDailyVolume = async function(date, volume, breakdown = {}) {
  const [metric, created] = await this.findOrCreate({
    where: {
      metricType: 'daily_volume',
      metricDate: date
    },
    defaults: {
      metricValue: volume,
      metricData: breakdown
    }
  });
  
  if (!created) {
    metric.metricValue = volume;
    metric.metricData = breakdown;
    await metric.save();
  }
  
  return metric;
};

/**
 * Record user count
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {number} count - User count
 * @returns {Promise<Object>} - Created or updated metric
 */
SystemMetric.recordUserCount = async function(date, count) {
  const [metric, created] = await this.findOrCreate({
    where: {
      metricType: 'user_count',
      metricDate: date
    },
    defaults: {
      metricValue: count
    }
  });
  
  if (!created) {
    metric.metricValue = count;
    await metric.save();
  }
  
  return metric;
};

/**
 * Get metrics for a specific period
 * @param {string} metricType - Type of metric
 * @param {number} days - Number of days to look back
 * @returns {Promise<Array>} - Array of metrics
 */
SystemMetric.getMetricsForPeriod = async function(metricType, days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  
  return await this.findAll({
    where: {
      metricType,
      metricDate: {
        [Op.gte]: date.toISOString().split('T')[0]
      }
    },
    order: [['metricDate', 'ASC']]
  });
};

module.exports = SystemMetric;
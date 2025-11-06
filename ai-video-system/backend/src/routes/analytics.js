const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { query: dbQuery } = require('../database/connection');
const { catchAsync, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { createRateLimit } = require('../middleware/auth');
const { cache } = require('../services/redis');
const logger = require('../utils/logger');

const router = express.Router();

// Rate limiting for analytics endpoints
const analyticsRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // limit each user to 30 requests per minute
  message: 'Too many analytics requests, please try again later.'
});

// Validation rules
const trackEventValidation = [
  body('event_type').isIn(['user_login', 'project_created', 'video_generated', 'asset_uploaded', 'export_completed']).withMessage('Invalid event type'),
  body('event_data').optional().isObject().withMessage('Event data must be an object'),
  body('session_id').optional().isString().withMessage('Session ID must be a string')
];

// Track an analytics event
router.post('/track', analyticsRateLimit, trackEventValidation, catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const userId = req.user ? req.user.id : null;
  const { event_type, event_data, session_id } = req.body;

  // Track event
  await dbQuery(`
    INSERT INTO analytics (user_id, event_type, event_data, session_id, ip_address, user_agent, timestamp)
    VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
  `, [
    userId,
    event_type,
    JSON.stringify(event_data || {}),
    session_id,
    req.ip,
    req.get('User-Agent')
  ]);

  res.json({
    status: 'success',
    message: 'Event tracked successfully'
  });
}));

// Get user analytics overview
router.get('/overview', analyticsRateLimit, catchAsync(async (req, res) => {
  const userId = req.user.id;
  const days = parseInt(req.query.days) || 30;

  // Try to get from cache first
  const cacheKey = `analytics_overview:${userId}:${days}`;
  let overview = await cache.get(cacheKey);

  if (!overview) {
    // Get user analytics overview
    const result = await dbQuery(`
      SELECT 
        COUNT(*) as total_events,
        COUNT(DISTINCT DATE(timestamp)) as active_days,
        COUNT(DISTINCT session_id) as total_sessions,
        MIN(timestamp) as first_event,
        MAX(timestamp) as last_event
      FROM analytics
      WHERE user_id = $1 AND timestamp >= CURRENT_DATE - INTERVAL '${days} days'
    `, [userId]);

    // Get event type breakdown
    const eventTypesResult = await dbQuery(`
      SELECT event_type, COUNT(*) as count
      FROM analytics
      WHERE user_id = $1 AND timestamp >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY event_type
      ORDER BY count DESC
    `, [userId]);

    // Get daily activity
    const dailyActivityResult = await dbQuery(`
      SELECT 
        DATE(timestamp) as date,
        COUNT(*) as events,
        COUNT(DISTINCT session_id) as sessions
      FROM analytics
      WHERE user_id = $1 AND timestamp >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
    `, [userId]);

    overview = {
      summary: result.rows[0],
      eventTypes: eventTypesResult.rows,
      dailyActivity: dailyActivityResult.rows
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, overview, 300);
  }

  res.json({
    status: 'success',
    data: {
      overview
    }
  });
}));

// Get project analytics
router.get('/projects', analyticsRateLimit, catchAsync(async (req, res) => {
  const userId = req.user.id;
  const days = parseInt(req.query.days) || 30;

  // Try to get from cache first
  const cacheKey = `analytics_projects:${userId}:${days}`;
  let projectAnalytics = await cache.get(cacheKey);

  if (!projectAnalytics) {
    // Get project analytics
    const result = await dbQuery(`
      SELECT 
        p.id,
        p.title,
        COUNT(DISTINCT a.id) as total_events,
        COUNT(DISTINCT DATE(a.timestamp)) as active_days,
        MAX(a.timestamp) as last_activity,
        COUNT(DISTINCT CASE WHEN a.event_type = 'video_generated' THEN a.id END) as videos_generated,
        COUNT(DISTINCT CASE WHEN a.event_type = 'asset_uploaded' THEN a.id END) as assets_uploaded
      FROM projects p
      LEFT JOIN analytics a ON p.id = (a.event_data->>'projectId')::uuid
      WHERE p.user_id = $1 AND (a.timestamp >= CURRENT_DATE - INTERVAL '${days} days' OR a.timestamp IS NULL)
      GROUP BY p.id, p.title
      ORDER BY p.updated_at DESC
    `, [userId]);

    projectAnalytics = result.rows;

    // Cache for 5 minutes
    await cache.set(cacheKey, projectAnalytics, 300);
  }

  res.json({
    status: 'success',
    data: {
      projects: projectAnalytics
    }
  });
}));

// Get usage statistics
router.get('/usage', analyticsRateLimit, catchAsync(async (req, res) => {
  const userId = req.user.id;
  const days = parseInt(req.query.days) || 30;

  // Try to get from cache first
  const cacheKey = `analytics_usage:${userId}:${days}`;
  let usageStats = await cache.get(cacheKey);

  if (!usageStats) {
    // Get usage statistics
    const result = await dbQuery(`
      SELECT 
        resource_type,
        SUM(resource_amount) as total_amount,
        COUNT(*) as usage_count,
        AVG(resource_amount) as avg_amount,
        MIN(resource_amount) as min_amount,
        MAX(resource_amount) as max_amount
      FROM usage_logs
      WHERE user_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY resource_type
      ORDER BY total_amount DESC
    `, [userId]);

    // Get daily usage
    const dailyUsageResult = await dbQuery(`
      SELECT 
        DATE(created_at) as date,
        resource_type,
        SUM(resource_amount) as total_amount
      FROM usage_logs
      WHERE user_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY DATE(created_at), resource_type
      ORDER BY date DESC, total_amount DESC
    `, [userId]);

    usageStats = {
      summary: result.rows,
      dailyUsage: dailyUsageResult.rows
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, usageStats, 300);
  }

  res.json({
    status: 'success',
    data: {
      usage: usageStats
    }
  });
}));

// Get system analytics (admin only)
router.get('/system', analyticsRateLimit, catchAsync(async (req, res) => {
  const userId = req.user.id;
  const days = parseInt(req.query.days) || 30;

  // Check if user is admin
  const userResult = await dbQuery(
    'SELECT subscription_tier FROM users WHERE id = $1',
    [userId]
  );

  if (userResult.rows.length === 0 || userResult.rows[0].subscription_tier !== 'enterprise') {
    throw new ValidationError('Access denied');
  }

  // Try to get from cache first
  const cacheKey = `analytics_system:${days}`;
  let systemAnalytics = await cache.get(cacheKey);

  if (!systemAnalytics) {
    // Get system analytics
    const result = await dbQuery(`
      SELECT 
        COUNT(DISTINCT user_id) as total_users,
        COUNT(*) as total_events,
        COUNT(DISTINCT DATE(timestamp)) as active_days,
        COUNT(DISTINCT session_id) as total_sessions
      FROM analytics
      WHERE timestamp >= CURRENT_DATE - INTERVAL '${days} days'
    `);

    // Get event type breakdown
    const eventTypesResult = await dbQuery(`
      SELECT event_type, COUNT(*) as count
      FROM analytics
      WHERE timestamp >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY event_type
      ORDER BY count DESC
    `);

    // Get daily activity
    const dailyActivityResult = await dbQuery(`
      SELECT 
        DATE(timestamp) as date,
        COUNT(*) as events,
        COUNT(DISTINCT user_id) as active_users,
        COUNT(DISTINCT session_id) as sessions
      FROM analytics
      WHERE timestamp >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
    `);

    // Get top users
    const topUsersResult = await dbQuery(`
      SELECT 
        u.id,
        u.name,
        u.email,
        COUNT(a.id) as events,
        COUNT(DISTINCT DATE(a.timestamp)) as active_days
      FROM users u
      LEFT JOIN analytics a ON u.id = a.user_id AND a.timestamp >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY u.id, u.name, u.email
      ORDER BY events DESC
      LIMIT 10
    `);

    systemAnalytics = {
      summary: result.rows[0],
      eventTypes: eventTypesResult.rows,
      dailyActivity: dailyActivityResult.rows,
      topUsers: topUsersResult.rows
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, systemAnalytics, 300);
  }

  res.json({
    status: 'success',
    data: {
      system: systemAnalytics
    }
  });
}));

// Get performance metrics
router.get('/performance', analyticsRateLimit, catchAsync(async (req, res) => {
  const userId = req.user.id;
  const days = parseInt(req.query.days) || 7;

  // Check if user is admin
  const userResult = await dbQuery(
    'SELECT subscription_tier FROM users WHERE id = $1',
    [userId]
  );

  if (userResult.rows.length === 0 || userResult.rows[0].subscription_tier !== 'enterprise') {
    throw new ValidationError('Access denied');
  }

  // Try to get from cache first
  const cacheKey = `analytics_performance:${days}`;
  let performanceMetrics = await cache.get(cacheKey);

  if (!performanceMetrics) {
    // Get render job performance
    const renderPerformanceResult = await dbQuery(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_processing_time
      FROM render_jobs
      WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    // Get asset upload performance
    const assetPerformanceResult = await dbQuery(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_uploads,
        AVG(file_size) as avg_file_size,
        SUM(file_size) as total_storage
      FROM assets
      WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    performanceMetrics = {
      renderPerformance: renderPerformanceResult.rows,
      assetPerformance: assetPerformanceResult.rows
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, performanceMetrics, 300);
  }

  res.json({
    status: 'success',
    data: {
      performance: performanceMetrics
    }
  });
}));

// Export analytics data
router.get('/export', analyticsRateLimit, catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { format = 'json', type = 'overview', days = 30 } = req.query;

  if (!['json', 'csv'].includes(format)) {
    throw new ValidationError('Invalid format. Must be json or csv');
  }

  if (!['overview', 'projects', 'usage'].includes(type)) {
    throw new ValidationError('Invalid type. Must be overview, projects, or usage');
  }

  // Get data based on type
  let data;
  switch (type) {
    case 'overview':
      data = await dbQuery(`
        SELECT 
          event_type,
          event_data,
          session_id,
          ip_address,
          user_agent,
          timestamp
        FROM analytics
        WHERE user_id = $1 AND timestamp >= CURRENT_DATE - INTERVAL '${days} days'
        ORDER BY timestamp DESC
      `, [userId]);
      break;

    case 'projects':
      data = await dbQuery(`
        SELECT 
          p.id,
          p.title,
          p.status,
          p.created_at,
          p.updated_at,
          COUNT(a.id) as asset_count,
          COUNT(rj.id) as render_count
        FROM projects p
        LEFT JOIN assets a ON p.id = a.project_id
        LEFT JOIN render_jobs rj ON p.id = rj.project_id
        WHERE p.user_id = $1 AND p.created_at >= CURRENT_DATE - INTERVAL '${days} days'
        GROUP BY p.id, p.title, p.status, p.created_at, p.updated_at
        ORDER BY p.created_at DESC
      `, [userId]);
      break;

    case 'usage':
      data = await dbQuery(`
        SELECT 
          resource_type,
          resource_amount,
          metadata,
          created_at
        FROM usage_logs
        WHERE user_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
        ORDER BY created_at DESC
      `, [userId]);
      break;
  }

  // Format response based on format
  if (format === 'csv') {
    // Convert to CSV
    const csv = convertToCSV(data.rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="analytics-${type}-${days}days.csv"`);
    res.send(csv);
  } else {
    res.json({
      status: 'success',
      data: {
        type,
        days,
        records: data.rows.length,
        data: data.rows
      }
    });
  }

  // Log export
  logger.logUserActivity(userId, 'analytics_exported', {
    type,
    format,
    days,
    recordCount: data.rows.length,
    ip: req.ip
  });
}));

// Helper function to convert data to CSV
function convertToCSV(data) {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');

  const csvRows = data.map(row => {
    return headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(',');
  });

  return [csvHeaders, ...csvRows].join('\n');
}

module.exports = router;
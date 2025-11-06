const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../database/connection');
const { catchAsync, ValidationError, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');
const { createRateLimit } = require('../middleware/auth');
const { cache } = require('../services/redis');
const logger = require('../utils/logger');

const router = express.Router();

// Rate limiting for user profile updates
const profileUpdateRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each user to 10 profile updates per hour
  message: 'Too many profile updates, please try again later.'
});

// Validation rules
const updateProfileValidation = [
  body('name').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('avatar_url').optional().isURL().withMessage('Avatar URL must be a valid URL'),
  body('preferences').optional().isObject().withMessage('Preferences must be an object')
];

const updatePreferencesValidation = [
  body('preferences').isObject().withMessage('Preferences must be an object')
];

// Get current user profile
router.get('/profile', catchAsync(async (req, res) => {
  const userId = req.user.id;

  // Try to get from cache first
  const cacheKey = `user_profile:${userId}`;
  let userProfile = await cache.get(cacheKey);

  if (!userProfile) {
    // Get user profile from database
    const result = await query(`
      SELECT u.id, u.email, u.name, u.avatar_url, u.subscription_tier, 
             u.credits_remaining, u.is_verified, u.last_login, u.created_at,
             up.preferences_data
      FROM users u
      LEFT JOIN user_preferences up ON u.id = up.user_id
      WHERE u.id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    userProfile = result.rows[0];
    
    // Cache for 15 minutes
    await cache.set(cacheKey, userProfile, 900);
  }

  res.json({
    status: 'success',
    data: {
      user: userProfile
    }
  });
}));

// Update user profile
router.put('/profile', profileUpdateRateLimit, updateProfileValidation, catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const userId = req.user.id;
  const { name, avatar_url } = req.body;

  // Update user profile
  const updateFields = [];
  const updateValues = [];
  let paramIndex = 1;

  if (name !== undefined) {
    updateFields.push(`name = $${paramIndex++}`);
    updateValues.push(name);
  }

  if (avatar_url !== undefined) {
    updateFields.push(`avatar_url = $${paramIndex++}`);
    updateValues.push(avatar_url);
  }

  if (updateFields.length === 0) {
    throw new ValidationError('No fields to update');
  }

  updateValues.push(userId);

  const result = await query(`
    UPDATE users 
    SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = $${paramIndex}
    RETURNING id, email, name, avatar_url, subscription_tier, credits_remaining, is_verified, updated_at
  `, updateValues);

  if (result.rows.length === 0) {
    throw new NotFoundError('User');
  }

  const updatedUser = result.rows[0];

  // Clear cache
  await cache.del(`user_profile:${userId}`);

  // Log profile update
  logger.logUserActivity(userId, 'profile_updated', {
    fields: Object.keys(req.body),
    ip: req.ip
  });

  res.json({
    status: 'success',
    message: 'Profile updated successfully',
    data: {
      user: updatedUser
    }
  });
}));

// Update user preferences
router.put('/preferences', updatePreferencesValidation, catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const userId = req.user.id;
  const { preferences } = req.body;

  // Update user preferences
  const result = await query(`
    INSERT INTO user_preferences (user_id, preferences_data, updated_at)
    VALUES ($1, $2, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id) 
    DO UPDATE SET preferences_data = $2, updated_at = CURRENT_TIMESTAMP
    RETURNING user_id, preferences_data, updated_at
  `, [userId, preferences]);

  // Clear cache
  await cache.del(`user_profile:${userId}`);

  // Log preferences update
  logger.logUserActivity(userId, 'preferences_updated', {
    ip: req.ip
  });

  res.json({
    status: 'success',
    message: 'Preferences updated successfully',
    data: {
      preferences: result.rows[0].preferences_data
    }
  });
}));

// Get user statistics
router.get('/stats', catchAsync(async (req, res) => {
  const userId = req.user.id;

  // Try to get from cache first
  const cacheKey = `user_stats:${userId}`;
  let userStats = await cache.get(cacheKey);

  if (!userStats) {
    // Get user statistics from database
    const result = await query(`
      SELECT 
        (SELECT COUNT(*) FROM projects WHERE user_id = $1) as total_projects,
        (SELECT COUNT(*) FROM assets WHERE user_id = $1) as total_assets,
        (SELECT COUNT(*) FROM render_jobs WHERE user_id = $1 AND status = 'completed') as completed_renders,
        (SELECT COUNT(*) FROM render_jobs WHERE user_id = $1 AND status = 'processing') as processing_renders,
        (SELECT COALESCE(SUM(file_size), 0) FROM assets WHERE user_id = $1) as total_storage_used,
        (SELECT COUNT(*) FROM collaborations WHERE user_id = $1) as collaborations_count
    `, [userId]);

    userStats = result.rows[0];
    
    // Cache for 5 minutes
    await cache.set(cacheKey, userStats, 300);
  }

  res.json({
    status: 'success',
    data: {
      stats: userStats
    }
  });
}));

// Get user activity log
router.get('/activity', catchAsync(async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  // Get user activity from analytics table
  const result = await query(`
    SELECT event_type, event_data, timestamp, ip_address, user_agent
    FROM analytics
    WHERE user_id = $1
    ORDER BY timestamp DESC
    LIMIT $2 OFFSET $3
  `, [userId, limit, offset]);

  // Get total count for pagination
  const countResult = await query(
    'SELECT COUNT(*) as total FROM analytics WHERE user_id = $1',
    [userId]
  );

  const total = parseInt(countResult.rows[0].total);
  const totalPages = Math.ceil(total / limit);

  res.json({
    status: 'success',
    data: {
      activities: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  });
}));

// Delete user account
router.delete('/account', catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { password } = req.body;

  if (!password) {
    throw new ValidationError('Password is required to delete account');
  }

  // Verify password
  const userResult = await query(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId]
  );

  if (userResult.rows.length === 0) {
    throw new NotFoundError('User');
  }

  const bcrypt = require('bcryptjs');
  const isPasswordValid = await bcrypt.compare(password, userResult.rows[0].password_hash);
  
  if (!isPasswordValid) {
    throw new ValidationError('Invalid password');
  }

  // Delete user account (cascade will handle related records)
  await query('DELETE FROM users WHERE id = $1', [userId]);

  // Clear all user-related cache
  await cache.del(`user_profile:${userId}`);
  await cache.del(`user_stats:${userId}`);

  // Log account deletion
  logger.logUserActivity(userId, 'account_deleted', {
    ip: req.ip
  });

  res.json({
    status: 'success',
    message: 'Account deleted successfully'
  });
}));

module.exports = router;
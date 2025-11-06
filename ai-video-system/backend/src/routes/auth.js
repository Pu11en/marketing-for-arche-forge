const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../database/connection');
const { catchAsync, ValidationError, UnauthorizedError, ConflictError } = require('../middleware/errorHandler');
const { createRateLimit } = require('../middleware/auth');
const { cache, session } = require('../services/redis');
const logger = require('../utils/logger');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/email');

const router = express.Router();

// Rate limiting for auth routes
const authRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.'
});

const registerRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // limit each IP to 3 registrations per hour
  message: 'Too many registration attempts, please try again later.'
});

// Validation rules
const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters')
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required')
];

const resetPasswordValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required')
];

const newPasswordValidation = [
  body('token').notEmpty().withMessage('Reset token required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
];

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Register new user
router.post('/register', registerRateLimit, registerValidation, catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { email, password, name } = req.body;

  // Check if user already exists
  const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existingUser.rows.length > 0) {
    throw new ConflictError('User with this email already exists');
  }

  // Hash password
  const saltRounds = 12;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  // Create user in transaction
  const result = await transaction(async (client) => {
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, name, is_verified) 
       VALUES ($1, $2, $3, false) 
       RETURNING id, email, name, subscription_tier, credits_remaining, created_at`,
      [email, passwordHash, name]
    );

    const user = userResult.rows[0];

    // Create user preferences
    await client.query(
      'INSERT INTO user_preferences (user_id, preferences_data) VALUES ($1, $2)',
      [user.id, JSON.stringify({
        theme: 'light',
        language: 'en',
        notifications: {
          email: true,
          push: true,
          marketing: false
        },
        privacy: {
          profileVisibility: 'public',
          activityVisibility: 'private'
        }
      })]
    );

    // Create free subscription
    await client.query(
      `INSERT INTO subscriptions (user_id, tier, status, current_period_start, current_period_end) 
       VALUES ($1, 'free', 'active', NOW(), NOW() + INTERVAL '1 year')`,
      [user.id]
    );

    return user;
  });

  // Generate verification token
  const verificationToken = generateToken(result.id);
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

  // Send verification email
  try {
    await sendVerificationEmail(email, name, verificationUrl);
  } catch (emailError) {
    logger.error('Failed to send verification email:', emailError);
    // Don't fail registration if email fails
  }

  // Log user registration
  logger.logUserActivity(result.id, 'user_registered', {
    email,
    name,
    ip: req.ip
  });

  // Generate auth token
  const token = generateToken(result.id);

  // Cache user session
  await session.set(token, {
    userId: result.id,
    email: result.email,
    name: result.name,
    subscriptionTier: result.subscription_tier,
    creditsRemaining: result.credits_remaining
  });

  res.status(201).json({
    status: 'success',
    message: 'User registered successfully. Please check your email for verification.',
    data: {
      user: {
        id: result.id,
        email: result.email,
        name: result.name,
        subscriptionTier: result.subscription_tier,
        creditsRemaining: result.credits_remaining,
        isVerified: false
      },
      token
    }
  });
}));

// Login user
router.post('/login', authRateLimit, loginValidation, catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { email, password } = req.body;

  // Get user from database
  const result = await query(
    'SELECT id, email, password_hash, name, subscription_tier, credits_remaining, is_verified, last_login FROM users WHERE email = $1',
    [email]
  );

  if (result.rows.length === 0) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const user = result.rows[0];

  // Check password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Generate auth token
  const token = generateToken(user.id);

  // Update last login
  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  // Cache user session
  await session.set(token, {
    userId: user.id,
    email: user.email,
    name: user.name,
    subscriptionTier: user.subscription_tier,
    creditsRemaining: user.credits_remaining
  });

  // Log user login
  logger.logUserActivity(user.id, 'user_login', {
    email,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.json({
    status: 'success',
    message: 'Login successful',
    data: {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscriptionTier: user.subscription_tier,
        creditsRemaining: user.credits_remaining,
        isVerified: user.is_verified
      },
      token
    }
  });
}));

// Logout user
router.post('/logout', catchAsync(async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    // Remove session from cache
    await session.del(token);
  }

  res.json({
    status: 'success',
    message: 'Logout successful'
  });
}));

// Refresh token
router.post('/refresh', catchAsync(async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    throw new UnauthorizedError('Token required');
  }

  // Verify token
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  
  // Get fresh user data
  const result = await query(
    'SELECT id, email, name, subscription_tier, credits_remaining, is_verified FROM users WHERE id = $1',
    [decoded.userId]
  );

  if (result.rows.length === 0) {
    throw new UnauthorizedError('User not found');
  }

  const user = result.rows[0];

  // Generate new token
  const newToken = generateToken(user.id);

  // Update session cache
  await session.set(newToken, {
    userId: user.id,
    email: user.email,
    name: user.name,
    subscriptionTier: user.subscription_tier,
    creditsRemaining: user.credits_remaining
  });

  // Remove old session
  await session.del(token);

  res.json({
    status: 'success',
    message: 'Token refreshed successfully',
    data: {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscriptionTier: user.subscription_tier,
        creditsRemaining: user.credits_remaining,
        isVerified: user.is_verified
      },
      token: newToken
    }
  });
}));

// Verify email
router.post('/verify-email', catchAsync(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    throw new ValidationError('Verification token required');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Update user verification status
    const result = await query(
      'UPDATE users SET is_verified = true WHERE id = $1 RETURNING id, email, name',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      throw new ValidationError('Invalid verification token');
    }

    const user = result.rows[0];

    // Log email verification
    logger.logUserActivity(user.id, 'email_verified', {
      email: user.email
    });

    res.json({
      status: 'success',
      message: 'Email verified successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          isVerified: true
        }
      }
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      throw new ValidationError('Invalid or expired verification token');
    }
    throw error;
  }
}));

// Request password reset
router.post('/forgot-password', authRateLimit, resetPasswordValidation, catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { email } = req.body;

  // Get user from database
  const result = await query('SELECT id, name FROM users WHERE email = $1', [email]);

  if (result.rows.length === 0) {
    // Don't reveal that user doesn't exist
    return res.json({
      status: 'success',
      message: 'If an account with that email exists, a password reset link has been sent.'
    });
  }

  const user = result.rows[0];

  // Generate reset token
  const resetToken = generateToken(user.id);
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  // Store reset token in cache with 1 hour expiry
  await cache.set(`reset_token:${user.id}`, resetToken, 3600);

  // Send password reset email
  try {
    await sendPasswordResetEmail(email, user.name, resetUrl);
  } catch (emailError) {
    logger.error('Failed to send password reset email:', emailError);
    // Don't reveal that email failed
  }

  // Log password reset request
  logger.logUserActivity(user.id, 'password_reset_requested', {
    email,
    ip: req.ip
  });

  res.json({
    status: 'success',
    message: 'If an account with that email exists, a password reset link has been sent.'
  });
}));

// Reset password
router.post('/reset-password', newPasswordValidation, catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { token, password } = req.body;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify reset token from cache
    const cachedToken = await cache.get(`reset_token:${decoded.userId}`);
    if (!cachedToken || cachedToken !== token) {
      throw new ValidationError('Invalid or expired reset token');
    }

    // Hash new password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Update password
    const result = await query(
      'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, email, name',
      [passwordHash, decoded.userId]
    );

    if (result.rows.length === 0) {
      throw new ValidationError('Invalid reset token');
    }

    const user = result.rows[0];

    // Clear reset token
    await cache.del(`reset_token:${decoded.userId}`);

    // Clear all sessions for this user (force re-login)
    // In a real implementation, you might want to track all active sessions

    // Log password reset
    logger.logUserActivity(user.id, 'password_reset_completed', {
      email: user.email,
      ip: req.ip
    });

    res.json({
      status: 'success',
      message: 'Password reset successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      }
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      throw new ValidationError('Invalid or expired reset token');
    }
    throw error;
  }
}));

module.exports = router;
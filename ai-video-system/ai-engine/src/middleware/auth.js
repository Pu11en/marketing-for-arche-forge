const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { cache } = require('../services/redis');

/**
 * Authentication middleware
 * Verifies JWT token and sets user in request
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : null;
    
    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Access token is required',
        error: {
          code: 'MISSING_TOKEN',
          details: 'No token provided in Authorization header'
        }
      });
    }
    
    // Check if token is blacklisted
    const isBlacklisted = await cache.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        status: 'error',
        message: 'Token has been revoked',
        error: {
          code: 'TOKEN_REVOKED',
          details: 'Token is no longer valid'
        }
      });
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE
    });
    
    // Check if user exists and is active
    const { query } = require('../database/connection');
    const userResult = await query(
      'SELECT id, email, subscription_tier, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        status: 'error',
        message: 'User not found',
        error: {
          code: 'USER_NOT_FOUND',
          details: 'The user associated with this token no longer exists'
        }
      });
    }
    
    const user = userResult.rows[0];
    
    if (!user.is_active) {
      return res.status(401).json({
        status: 'error',
        message: 'User account is inactive',
        error: {
          code: 'USER_INACTIVE',
          details: 'User account has been deactivated'
        }
      });
    }
    
    // Set user in request
    req.user = {
      id: user.id,
      email: user.email,
      subscriptionTier: user.subscription_tier
    };
    
    // Cache user session
    await cache.set(`session:${token}`, req.user, 3600); // 1 hour
    
    logger.debug('User authenticated successfully', {
      userId: user.id,
      email: user.email
    });
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token',
        error: {
          code: 'INVALID_TOKEN',
          details: error.message
        }
      });
    }
    
    logger.error('Authentication error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Authentication failed',
      error: {
        code: 'AUTH_ERROR',
        details: 'An error occurred during authentication'
      }
    });
  }
};

/**
 * Optional authentication middleware
 * Allows requests without token but sets user if token is present
 */
const optionalAuth = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : null;
    
    if (!token) {
      // No token provided, continue without authentication
      return next();
    }
    
    // Check if token is blacklisted
    const isBlacklisted = await cache.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        status: 'error',
        message: 'Token has been revoked',
        error: {
          code: 'TOKEN_REVOKED',
          details: 'Token is no longer valid'
        }
      });
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE
    });
    
    // Check if user exists and is active
    const { query } = require('../database/connection');
    const userResult = await query(
      'SELECT id, email, subscription_tier, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
      // User not found or inactive, continue without authentication
      return next();
    }
    
    const user = userResult.rows[0];
    
    // Set user in request
    req.user = {
      id: user.id,
      email: user.email,
      subscriptionTier: user.subscription_tier
    };
    
    // Cache user session
    await cache.set(`session:${token}`, req.user, 3600); // 1 hour
    
    logger.debug('User optionally authenticated', {
      userId: user.id,
      email: user.email
    });
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      // Invalid token, continue without authentication
      return next();
    }
    
    logger.error('Optional authentication error:', error);
    // Continue without authentication on other errors
    next();
  }
};

/**
 * Role-based authorization middleware
 * @param {Array} allowedRoles - Array of allowed subscription tiers
 * @returns {Function} Middleware function
 */
const authorizeRoles = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
        error: {
          code: 'AUTH_REQUIRED',
          details: 'You must be authenticated to access this resource'
        }
      });
    }
    
    const userRole = req.user.subscriptionTier;
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        status: 'error',
        message: 'Insufficient permissions',
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          details: `Your subscription tier (${userRole}) does not allow access to this resource`,
          requiredRoles: allowedRoles
        }
      });
    }
    
    logger.debug('User authorized', {
      userId: req.user.id,
      role: userRole,
      allowedRoles
    });
    
    next();
  };
};

/**
 * Rate limiting middleware
 * @param {number} maxRequests - Maximum requests per window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Function} Middleware function
 */
const rateLimit = (maxRequests, windowMs) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const key = req.user ? req.user.id : req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old entries
    for (const [userKey, userRequests] of requests.entries()) {
      const validRequests = userRequests.filter(time => time > windowStart);
      if (validRequests.length === 0) {
        requests.delete(userKey);
      } else {
        requests.set(userKey, validRequests);
      }
    }
    
    // Get current user requests
    const userRequests = requests.get(key) || [];
    userRequests.push(now);
    requests.set(key, userRequests);
    
    // Check rate limit
    const recentRequests = userRequests.filter(time => time > windowStart);
    if (recentRequests.length > maxRequests) {
      return res.status(429).json({
        status: 'error',
        message: 'Too many requests',
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          details: `Maximum ${maxRequests} requests per ${windowMs/1000} seconds exceeded`,
          retryAfter: Math.ceil(windowMs / 1000)
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id
        }
      });
    }
    
    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': Math.max(0, maxRequests - recentRequests.length),
      'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
    });
    
    next();
  };
};

/**
 * API key authentication middleware
 * For service-to-service communication
 */
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({
        status: 'error',
        message: 'API key is required',
        error: {
          code: 'MISSING_API_KEY',
          details: 'X-API-Key header is required'
        }
      });
    }
    
    // Check if API key is valid
    const { query } = require('../database/connection');
    const keyResult = await query(
      'SELECT id, name, permissions FROM api_keys WHERE key = $1 AND is_active = true',
      [apiKey]
    );
    
    if (keyResult.rows.length === 0) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid API key',
        error: {
          code: 'INVALID_API_KEY',
          details: 'The provided API key is not valid or has been deactivated'
        }
      });
    }
    
    const apiKeyData = keyResult.rows[0];
    
    // Set API key info in request
    req.apiKey = {
      id: apiKeyData.id,
      name: apiKeyData.name,
      permissions: apiKeyData.permissions
    };
    
    logger.debug('API key authenticated', {
      keyId: apiKeyData.id,
      keyName: apiKeyData.name
    });
    
    next();
  } catch (error) {
    logger.error('API key authentication error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'API key authentication failed',
      error: {
        code: 'API_KEY_AUTH_ERROR',
        details: 'An error occurred during API key authentication'
      }
    });
  }
};

/**
 * Revoke token (blacklist)
 * @param {string} token - JWT token to revoke
 * @returns {Promise<void>}
 */
const revokeToken = async (token) => {
  try {
    // Add token to blacklist with expiration
    const decoded = jwt.decode(token);
    const expirationTime = decoded.exp * 1000; // Convert to milliseconds
    
    const ttl = Math.max(0, expirationTime - Date.now());
    await cache.set(`blacklist:${token}`, true, Math.ceil(ttl / 1000));
    
    logger.info('Token revoked', { token: token.substring(0, 10) + '...' });
  } catch (error) {
    logger.error('Token revocation failed:', error);
    throw error;
  }
};

/**
 * Check if user has specific permission
 * @param {Object} req - Request object
 * @param {string} permission - Permission to check
 * @returns {boolean} Whether user has permission
 */
const hasPermission = (req, permission) => {
  if (!req.user) return false;
  
  const rolePermissions = {
    free: ['read', 'create_basic'],
    basic: ['read', 'create_basic', 'create_standard'],
    premium: ['read', 'create_basic', 'create_standard', 'create_advanced', 'batch_process'],
    enterprise: ['read', 'create_basic', 'create_standard', 'create_advanced', 'batch_process', 'api_access', 'custom_models']
  };
  
  const userPermissions = rolePermissions[req.user.subscriptionTier] || [];
  return userPermissions.includes(permission);
};

/**
 * Generate JWT token
 * @param {Object} user - User object
 * @param {string} expiresIn - Token expiration time
 * @returns {string} JWT token
 */
const generateToken = (user, expiresIn = '24h') => {
  const payload = {
    userId: user.id,
    email: user.email,
    subscriptionTier: user.subscriptionTier
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn,
    algorithm: 'HS256',
    issuer: process.env.JWT_ISSUER,
    audience: process.env.JWT_AUDIENCE
  });
};

/**
 * Refresh JWT token
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<Object>} New tokens
 */
const refreshToken = async (refreshToken) => {
  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE
    });
    
    // Get user from database
    const { query } = require('../database/connection');
    const userResult = await query(
      'SELECT id, email, subscription_tier, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
      throw new Error('User not found or inactive');
    }
    
    const user = userResult.rows[0];
    
    // Generate new tokens
    const accessToken = generateToken(user, '15m');
    const newRefreshToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_REFRESH_SECRET,
      {
        expiresIn: '7d',
        algorithm: 'HS256',
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE
      }
    );
    
    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900 // 15 minutes
    };
  } catch (error) {
    logger.error('Token refresh failed:', error);
    throw new Error('Invalid refresh token');
  }
};

module.exports = {
  authenticateToken,
  optionalAuth,
  authorizeRoles,
  rateLimit,
  authenticateApiKey,
  revokeToken,
  hasPermission,
  generateToken,
  refreshToken
};
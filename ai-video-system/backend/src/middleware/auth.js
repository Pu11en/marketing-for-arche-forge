const jwt = require('jsonwebtoken');
const { query } = require('../database/connection');
const logger = require('../utils/logger');
const { rateLimit } = require('../services/redis');

// JWT Authentication Middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const result = await query(
      'SELECT id, email, name, subscription_tier, credits_remaining, is_verified FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid token - user not found' });
    }

    const user = result.rows[0];
    
    // Check if user is verified
    if (!user.is_verified) {
      return res.status(403).json({ error: 'Email not verified' });
    }

    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    } else {
      logger.error('Authentication error:', error);
      return res.status(500).json({ error: 'Authentication failed' });
    }
  }
};

// Optional Authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const result = await query(
      'SELECT id, email, name, subscription_tier, credits_remaining, is_verified FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length > 0) {
      req.user = result.rows[0];
    } else {
      req.user = null;
    }

    next();
  } catch (error) {
    // For optional auth, we don't fail on token errors
    req.user = null;
    next();
  }
};

// Subscription Tier Check Middleware
const requireSubscription = (requiredTier) => {
  const tierHierarchy = {
    'free': 0,
    'basic': 1,
    'pro': 2,
    'enterprise': 3
  };

  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userTier = req.user.subscription_tier;
    const requiredLevel = tierHierarchy[requiredTier];
    const userLevel = tierHierarchy[userTier];

    if (userLevel < requiredLevel) {
      return res.status(403).json({ 
        error: `This feature requires a ${requiredTier} subscription or higher`,
        currentTier: userTier,
        requiredTier
      });
    }

    next();
  };
};

// Credits Check Middleware
const requireCredits = (amount) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.credits_remaining < amount) {
      return res.status(402).json({ 
        error: 'Insufficient credits',
        required: amount,
        available: req.user.credits_remaining
      });
    }

    next();
  };
};

// Rate Limiting Middleware
const createRateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // limit each IP to 100 requests per windowMs
    message = 'Too many requests from this IP, please try again later.',
    skipSuccessfulRequests = false
  } = options;

  return async (req, res, next) => {
    try {
      const identifier = req.user ? `user:${req.user.id}` : req.ip;
      const key = `rate_limit:${identifier}:${req.route?.path || req.path}`;
      
      const result = await rateLimit.check(identifier, max, Math.ceil(windowMs / 1000));
      
      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': max,
        'X-RateLimit-Remaining': result.remaining,
        'X-RateLimit-Reset': new Date(result.resetTime).toISOString()
      });

      if (!result.allowed) {
        logger.logSecurityEvent('rate_limit_exceeded', 'medium', {
          identifier,
          path: req.path,
          method: req.method
        });
        
        return res.status(429).json({ 
          error: message,
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
        });
      }

      next();
    } catch (error) {
      logger.error('Rate limiting error:', error);
      next(); // Continue on error to not break the application
    }
  };
};

// API Key Authentication (for external services)
const authenticateAPIKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    // In a real implementation, you would validate against a database
    // For now, we'll use environment variables for service keys
    const validKeys = {
      'ai-engine': process.env.AI_ENGINE_API_KEY,
      'render-service': process.env.RENDER_SERVICE_API_KEY
    };

    const serviceName = Object.keys(validKeys).find(key => validKeys[key] === apiKey);
    
    if (!serviceName) {
      logger.logSecurityEvent('invalid_api_key', 'high', {
        apiKey: apiKey.substring(0, 8) + '...',
        ip: req.ip
      });
      
      return res.status(401).json({ error: 'Invalid API key' });
    }

    req.service = serviceName;
    next();
  } catch (error) {
    logger.error('API key authentication error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

// Project Access Check Middleware
const requireProjectAccess = async (req, res, next) => {
  try {
    const projectId = req.params.projectId || req.params.id;
    
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID required' });
    }

    // Check if user owns the project or has collaboration access
    const result = await query(`
      SELECT p.id, p.user_id as owner_id, c.role, c.user_id as collaborator_id
      FROM projects p
      LEFT JOIN collaborations c ON p.id = c.project_id AND c.user_id = $1
      WHERE p.id = $2
    `, [req.user.id, projectId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = result.rows[0];
    
    // Check if user is owner or collaborator
    const isOwner = project.owner_id === req.user.id;
    const isCollaborator = project.collaborator_id === req.user.id;
    
    if (!isOwner && !isCollaborator) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    // Add project access info to request
    req.projectAccess = {
      isOwner,
      role: isOwner ? 'owner' : project.role
    };

    next();
  } catch (error) {
    logger.error('Project access check error:', error);
    return res.status(500).json({ error: 'Access check failed' });
  }
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireSubscription,
  requireCredits,
  createRateLimit,
  authenticateAPIKey,
  requireProjectAccess
};
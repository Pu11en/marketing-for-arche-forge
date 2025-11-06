const logger = require('../utils/logger');

/**
 * Global error handling middleware
 * Handles all errors that occur in the application
 */
const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error('Unhandled error occurred:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    requestId: req.id
  });

  // Default error response
  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let errorMessage = 'An internal server error occurred';
  let errorDetails = err.message;

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    errorMessage = 'Validation failed';
    errorDetails = err.details || err.message;
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
    errorMessage = 'Authentication required';
    errorDetails = err.message;
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403;
    errorCode = 'FORBIDDEN';
    errorMessage = 'Access forbidden';
    errorDetails = err.message;
  } else if (err.name === 'NotFoundError') {
    statusCode = 404;
    errorCode = 'NOT_FOUND';
    errorMessage = 'Resource not found';
    errorDetails = err.message;
  } else if (err.name === 'ConflictError') {
    statusCode = 409;
    errorCode = 'CONFLICT';
    errorMessage = 'Resource conflict';
    errorDetails = err.message;
  } else if (err.name === 'TooManyRequestsError') {
    statusCode = 429;
    errorCode = 'RATE_LIMIT_EXCEEDED';
    errorMessage = 'Too many requests';
    errorDetails = err.message;
  } else if (err.name === 'ServiceUnavailableError') {
    statusCode = 503;
    errorCode = 'SERVICE_UNAVAILABLE';
    errorMessage = 'Service temporarily unavailable';
    errorDetails = err.message;
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    errorMessage = 'Invalid authentication token';
    errorDetails = err.message;
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'TOKEN_EXPIRED';
    errorMessage = 'Authentication token has expired';
    errorDetails = err.message;
  } else if (err.code === 'LIMIT_EXCEEDED') {
    statusCode = 429;
    errorCode = 'RATE_LIMIT_EXCEEDED';
    errorMessage = 'Rate limit exceeded';
    errorDetails = err.message;
  } else if (err.code === 'ECONNREFUSED') {
    statusCode = 503;
    errorCode = 'SERVICE_UNAVAILABLE';
    errorMessage = 'External service unavailable';
    errorDetails = 'Unable to connect to external service';
  } else if (err.code === 'ETIMEDOUT') {
    statusCode = 504;
    errorCode = 'GATEWAY_TIMEOUT';
    errorMessage = 'Request timeout';
    errorDetails = 'External service request timed out';
  }

  // Handle database errors
  if (err.code && err.code.startsWith('23')) {
    // PostgreSQL constraint violation
    statusCode = 400;
    errorCode = 'CONSTRAINT_VIOLATION';
    errorMessage = 'Database constraint violation';
    errorDetails = getPostgresErrorMessage(err.code);
  } else if (err.code && err.code.startsWith('28')) {
    // PostgreSQL authentication error
    statusCode = 401;
    errorCode = 'DATABASE_AUTH_ERROR';
    errorMessage = 'Database authentication failed';
    errorDetails = getPostgresErrorMessage(err.code);
  } else if (err.code && err.code.startsWith('53')) {
    // PostgreSQL connection error
    statusCode = 503;
    errorCode = 'DATABASE_CONNECTION_ERROR';
    errorMessage = 'Database connection failed';
    errorDetails = getPostgresErrorMessage(err.code);
  }

  // Handle Redis errors
  if (err.code === 'ECONNREFUSED' && err.message.includes('Redis')) {
    statusCode = 503;
    errorCode = 'REDIS_CONNECTION_ERROR';
    errorMessage = 'Cache service unavailable';
    errorDetails = 'Unable to connect to Redis cache';
  }

  // Handle AI provider errors
  if (err.provider) {
    statusCode = 502;
    errorCode = 'AI_PROVIDER_ERROR';
    errorMessage = 'AI service error';
    errorDetails = `${err.provider}: ${err.message}`;
  }

  // Handle queue errors
  if (err.queue) {
    statusCode = 503;
    errorCode = 'QUEUE_ERROR';
    errorMessage = 'Job queue error';
    errorDetails = `${err.queue}: ${err.message}`;
  }

  // Handle worker errors
  if (err.worker) {
    statusCode = 503;
    errorCode = 'WORKER_ERROR';
    errorMessage = 'Worker process error';
    errorDetails = `Worker ${err.worker}: ${err.message}`;
  }

  // Don't send error details in production
  if (process.env.NODE_ENV === 'production') {
    errorDetails = statusCode >= 500 ? 'Internal server error' : errorDetails;
  }

  // Send error response
  res.status(statusCode).json({
    status: 'error',
    message: errorMessage,
    error: {
      code: errorCode,
      details: errorDetails,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.id,
      path: req.path,
      method: req.method
    }
  });
};

/**
 * Get PostgreSQL error message from error code
 * @param {string} code - PostgreSQL error code
 * @returns {string} Human readable error message
 */
function getPostgresErrorMessage(code) {
  const errorMessages = {
    '23505': 'Unique constraint violation',
    '23502': 'Not null violation',
    '23503': 'Foreign key violation',
    '23514': 'Check constraint violation',
    '23502': 'Not null violation',
    '28000': 'Invalid authorization specification',
    '28P01': 'Invalid password',
    '08001': 'SQL client unable to establish SQL connection',
    '08003': 'Connection does not exist',
    '08004': 'SQL server rejected establishment of SQL connection',
    '08006': 'Connection failure',
    '08007': 'Transaction resolution unknown',
    '08P01': 'SQL client unable to establish SQL connection'
  };
  
  return errorMessages[code] || `Database error (${code})`;
}

/**
 * Create custom error classes
 */
class ValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

class UnauthorizedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
  }
}

class TooManyRequestsError extends Error {
  constructor(message, retryAfter = null) {
    super(message);
    this.name = 'TooManyRequestsError';
    this.retryAfter = retryAfter;
  }
}

class ServiceUnavailableError extends Error {
  constructor(message, retryAfter = null) {
    super(message);
    this.name = 'ServiceUnavailableError';
    this.retryAfter = retryAfter;
  }
}

class AIProviderError extends Error {
  constructor(provider, message, code = null) {
    super(message);
    this.name = 'AIProviderError';
    this.provider = provider;
    this.code = code;
  }
}

class QueueError extends Error {
  constructor(queue, message, code = null) {
    super(message);
    this.name = 'QueueError';
    this.queue = queue;
    this.code = code;
  }
}

class WorkerError extends Error {
  constructor(worker, message, code = null) {
    super(message);
    this.name = 'WorkerError';
    this.worker = worker;
    this.code = code;
  }
}

/**
 * Async error wrapper for promises
 * @param {Function} fn - Function to wrap
 * @returns {Function} Wrapped function
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Handle uncaught promise rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', {
    reason: reason.toString(),
    promise: promise.toString(),
    stack: reason.stack
  });
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', {
    error: error.message,
    stack: error.stack
  });
  
  // Give time for logging before exit
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

module.exports = {
  errorHandler,
  asyncHandler,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError,
  ServiceUnavailableError,
  AIProviderError,
  QueueError,
  WorkerError
};
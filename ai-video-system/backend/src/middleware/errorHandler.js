const logger = require('../utils/logger');

// Custom error classes
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400);
    this.details = details;
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409);
  }
}

class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429);
  }
}

// Database error handler
const handleDatabaseError = (error) => {
  logger.error('Database error:', error);

  // PostgreSQL error codes
  switch (error.code) {
    case '23505': // Unique violation
      return new ConflictError('Resource already exists');
    case '23503': // Foreign key violation
      return new ValidationError('Referenced resource does not exist');
    case '23502': // Not null violation
      return new ValidationError('Required field is missing');
    case '23514': // Check violation
      return new ValidationError('Data validation failed');
    case '42P01': // Undefined table
      return new AppError('Database schema error', 500);
    case '42703': // Undefined column
      return new AppError('Database schema error', 500);
    case '28P01': // Invalid password
      return new AppError('Database connection error', 500);
    case 'ECONNREFUSED':
      return new AppError('Database connection refused', 503);
    default:
      return new AppError('Database operation failed', 500);
  }
};

// JWT error handler
const handleJWTError = (error) => {
  if (error.name === 'JsonWebTokenError') {
    return new UnauthorizedError('Invalid token');
  } else if (error.name === 'TokenExpiredError') {
    return new UnauthorizedError('Token expired');
  } else if (error.name === 'NotBeforeError') {
    return new UnauthorizedError('Token not active');
  }
  return new UnauthorizedError('Authentication failed');
};

// Multer error handler (file uploads)
const handleMulterError = (error) => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return new ValidationError('File too large');
  } else if (error.code === 'LIMIT_FILE_COUNT') {
    return new ValidationError('Too many files');
  } else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return new ValidationError('Unexpected file field');
  }
  return new ValidationError('File upload failed');
};

// Redis error handler
const handleRedisError = (error) => {
  logger.error('Redis error:', error);
  
  if (error.code === 'ECONNREFUSED') {
    return new AppError('Cache service unavailable', 503);
  } else if (error.code === 'ENOTFOUND') {
    return new AppError('Cache service not found', 503);
  }
  return new AppError('Cache operation failed', 500);
};

// AWS S3 error handler
const handleAWSError = (error) => {
  logger.error('AWS S3 error:', error);
  
  if (error.code === 'NoSuchKey') {
    return new NotFoundError('File');
  } else if (error.code === 'AccessDenied') {
    return new ForbiddenError('File access denied');
  } else if (error.code === 'InvalidBucketName') {
    return new ValidationError('Invalid bucket configuration');
  } else if (error.code === 'NetworkingError') {
    return new AppError('Storage service unavailable', 503);
  }
  return new AppError('Storage operation failed', 500);
};

// AI service error handler
const handleAIServiceError = (error) => {
  logger.error('AI service error:', error);
  
  if (error.response) {
    const status = error.response.status;
    if (status === 401) {
      return new AppError('AI service authentication failed', 500);
    } else if (status === 429) {
      return new TooManyRequestsError('AI service rate limit exceeded');
    } else if (status === 402) {
      return new AppError('AI service payment required', 402);
    } else if (status >= 500) {
      return new AppError('AI service temporarily unavailable', 503);
    }
  }
  return new AppError('AI service operation failed', 500);
};

// Main error handling middleware
const errorHandler = (error, req, res, next) => {
  let err = error;

  // Convert known errors to AppError instances
  if (error.name === 'ValidationError' && error.details) {
    err = new ValidationError(error.message, error.details);
  } else if (error.name === 'CastError') {
    err = new ValidationError('Invalid data format');
  } else if (error.name === 'SyntaxError' && error.type === 'entity.parse.failed') {
    err = new ValidationError('Invalid JSON format');
  } else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    err = handleJWTError(error);
  } else if (error.code && error.code.startsWith('23')) {
    err = handleDatabaseError(error);
  } else if (error.code && ['LIMIT_FILE_SIZE', 'LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE'].includes(error.code)) {
    err = handleMulterError(error);
  } else if (error.code && ['ECONNREFUSED', 'ENOTFOUND'].includes(error.code)) {
    err = handleRedisError(error);
  } else if (error.code && ['NoSuchKey', 'AccessDenied', 'InvalidBucketName', 'NetworkingError'].includes(error.code)) {
    err = handleAWSError(error);
  } else if (error.response || error.code === 'EAI_AGAIN') {
    err = handleAIServiceError(error);
  } else if (!(error instanceof AppError)) {
    err = new AppError(error.message || 'Something went wrong', 500);
  }

  // Log error details
  const logData = {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user ? req.user.id : null
  };

  if (err.statusCode >= 500) {
    logger.error('Server Error:', logData);
  } else {
    logger.warn('Client Error:', logData);
  }

  // Send error response
  const response = {
    status: err.status || 'error',
    message: err.message
  };

  // Add validation details if available
  if (err instanceof ValidationError && err.details) {
    response.errors = err.details;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(err.statusCode || 500).json(response);
};

// Async error wrapper
const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler
const notFound = (req, res, next) => {
  const err = new NotFoundError(`Route ${req.originalUrl}`);
  next(err);
};

module.exports = {
  errorHandler,
  catchAsync,
  notFound,
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  TooManyRequestsError
};
const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define which level to log based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'warn';
};

// Define format for logs
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`,
  ),
);

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }),
  
  // File transport for errors
  new winston.transports.File({
    filename: path.join(__dirname, '../../logs/error.log'),
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }),
  
  // File transport for all logs
  new winston.transports.File({
    filename: path.join(__dirname, '../../logs/combined.log'),
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }),
];

// Create the logger
const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
  exitOnError: false,
});

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Add request logging middleware
logger.httpLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const message = `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`;
    
    if (res.statusCode >= 400) {
      logger.warn(message);
    } else {
      logger.http(message);
    }
  });
  
  next();
};

// Add error logging helper
logger.logError = (error, context = {}) => {
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    ...context
  };
  
  logger.error('Application Error', errorInfo);
};

// Add performance logging helper
logger.logPerformance = (operation, duration, metadata = {}) => {
  const perfInfo = {
    operation,
    duration: `${duration}ms`,
    ...metadata
  };
  
  logger.info('Performance Metric', perfInfo);
};

// Add user activity logging helper
logger.logUserActivity = (userId, activity, metadata = {}) => {
  const activityInfo = {
    userId,
    activity,
    timestamp: new Date().toISOString(),
    ...metadata
  };
  
  logger.info('User Activity', activityInfo);
};

// Add security event logging helper
logger.logSecurityEvent = (event, severity, metadata = {}) => {
  const securityInfo = {
    securityEvent: event,
    severity,
    timestamp: new Date().toISOString(),
    ...metadata
  };
  
  if (severity === 'high') {
    logger.error('Security Event', securityInfo);
  } else {
    logger.warn('Security Event', securityInfo);
  }
};

// Add API request logging helper
logger.logAPIRequest = (req, res, responseTime) => {
  const apiInfo = {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    userId: req.user ? req.user.id : null
  };
  
  logger.http('API Request', apiInfo);
};

// Add database query logging helper
logger.logQuery = (query, params, duration) => {
  const queryInfo = {
    query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
    params: params ? JSON.stringify(params).substring(0, 100) : null,
    duration: `${duration}ms`
  };
  
  logger.debug('Database Query', queryInfo);
};

// Add AI service logging helper
logger.logAIService = (service, operation, input, output, duration) => {
  const aiInfo = {
    service,
    operation,
    inputSize: input ? JSON.stringify(input).length : 0,
    outputSize: output ? JSON.stringify(output).length : 0,
    duration: `${duration}ms`
  };
  
  logger.info('AI Service Call', aiInfo);
};

module.exports = logger;
const redis = require('redis');
const logger = require('../utils/logger');

let client;

const connectRedis = async () => {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    client = redis.createClient({
      url: redisUrl,
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          logger.error('Redis server connection refused');
          return new Error('Redis server connection refused');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          logger.error('Redis retry time exhausted');
          return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
          logger.error('Redis retry attempts exhausted');
          return undefined;
        }
        // reconnect after
        return Math.min(options.attempt * 100, 3000);
      }
    });

    client.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    client.on('connect', () => {
      logger.info('Redis Client Connected');
    });

    client.on('ready', () => {
      logger.info('Redis Client Ready');
    });

    client.on('end', () => {
      logger.info('Redis Client Disconnected');
    });

    await client.connect();
    logger.info('Redis connected successfully');
    return client;
  } catch (error) {
    logger.error('Redis connection failed:', error);
    throw error;
  }
};

const getClient = () => {
  if (!client) {
    throw new Error('Redis not initialized. Call connectRedis() first.');
  }
  return client;
};

// Cache utilities
const cache = {
  async get(key) {
    try {
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  },

  async set(key, value, ttl = 3600) {
    try {
      await client.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  },

  async del(key) {
    try {
      await client.del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  },

  async exists(key) {
    try {
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  },

  async increment(key, amount = 1) {
    try {
      return await client.incrBy(key, amount);
    } catch (error) {
      logger.error('Cache increment error:', error);
      return 0;
    }
  },

  async expire(key, ttl) {
    try {
      await client.expire(key, ttl);
      return true;
    } catch (error) {
      logger.error('Cache expire error:', error);
      return false;
    }
  }
};

// Session utilities
const session = {
  async set(sessionId, data, ttl = 86400) {
    const key = `session:${sessionId}`;
    return await cache.set(key, data, ttl);
  },

  async get(sessionId) {
    const key = `session:${sessionId}`;
    return await cache.get(key);
  },

  async del(sessionId) {
    const key = `session:${sessionId}`;
    return await cache.del(key);
  },

  async refresh(sessionId, ttl = 86400) {
    const key = `session:${sessionId}`;
    return await cache.expire(key, ttl);
  }
};

// Rate limiting utilities
const rateLimit = {
  async check(identifier, limit, window) {
    const key = `rate_limit:${identifier}`;
    const current = await cache.increment(key);
    
    if (current === 1) {
      await cache.expire(key, window);
    }
    
    return {
      allowed: current <= limit,
      remaining: Math.max(0, limit - current),
      resetTime: Date.now() + (window * 1000)
    };
  }
};

// Queue utilities for job processing
const queue = {
  async add(queueName, jobData, options = {}) {
    try {
      const jobId = await client.lPush(
        `queue:${queueName}`,
        JSON.stringify({ ...jobData, timestamp: Date.now() })
      );
      
      if (options.delay) {
        await client.expire(`queue:${queueName}`, Math.ceil(options.delay / 1000));
      }
      
      return jobId;
    } catch (error) {
      logger.error('Queue add error:', error);
      throw error;
    }
  },

  async getNext(queueName) {
    try {
      const result = await client.brPop(`queue:${queueName}`, 10); // 10 second timeout
      if (result) {
        return JSON.parse(result.element);
      }
      return null;
    } catch (error) {
      logger.error('Queue get next error:', error);
      return null;
    }
  },

  async getSize(queueName) {
    try {
      return await client.lLen(`queue:${queueName}`);
    } catch (error) {
      logger.error('Queue get size error:', error);
      return 0;
    }
  }
};

module.exports = {
  connectRedis,
  getClient,
  cache,
  session,
  rateLimit,
  queue
};
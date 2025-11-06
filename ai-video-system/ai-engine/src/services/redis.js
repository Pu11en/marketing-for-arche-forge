const Redis = require('redis');
const logger = require('../utils/logger');

// Redis client instances
let redisClient = null;
let redisSubscriber = null;

/**
 * Connect to Redis
 * @returns {Promise<Object>} Redis client
 */
const connectRedis = async () => {
  try {
    if (redisClient && redisClient.isOpen) {
      logger.info('Redis client already connected');
      return redisClient;
    }

    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: process.env.REDIS_DB || 0,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000,
      // Enable offline queue
      offlineQueue: true
    };

    // Create main Redis client
    redisClient = Redis.createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port,
        connectTimeout: redisConfig.connectTimeout,
        keepAlive: redisConfig.keepAlive
      },
      password: redisConfig.password,
      database: redisConfig.db
    });

    // Create subscriber client for pub/sub
    redisSubscriber = Redis.createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port,
        connectTimeout: redisConfig.connectTimeout,
        keepAlive: redisConfig.keepAlive
      },
      password: redisConfig.password,
      database: redisConfig.db
    });

    // Event handlers for main client
    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis client error:', err);
    });

    redisClient.on('end', () => {
      logger.warn('Redis client connection ended');
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });

    // Event handlers for subscriber client
    redisSubscriber.on('connect', () => {
      logger.info('Redis subscriber connected');
    });

    redisSubscriber.on('error', (err) => {
      logger.error('Redis subscriber error:', err);
    });

    // Connect both clients
    await redisClient.connect();
    await redisSubscriber.connect();

    // Test connection
    await redisClient.ping();
    
    logger.info('Redis connected successfully', {
      host: redisConfig.host,
      port: redisConfig.port,
      database: redisConfig.db
    });

    return redisClient;
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
};

/**
 * Get Redis client
 * @returns {Object} Redis client
 */
const getClient = () => {
  if (!redisClient || !redisClient.isOpen) {
    throw new Error('Redis not connected. Call connectRedis() first.');
  }
  return redisClient;
};

/**
 * Get Redis subscriber
 * @returns {Object} Redis subscriber client
 */
const getSubscriber = () => {
  if (!redisSubscriber || !redisSubscriber.isOpen) {
    throw new Error('Redis subscriber not connected. Call connectRedis() first.');
  }
  return redisSubscriber;
};

/**
 * Cache service wrapper
 */
const cache = {
  /**
   * Set cache value
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<string>} Redis response
   */
  set: async (key, value, ttl = 3600) => {
    try {
      const client = getClient();
      const serializedValue = typeof value === 'object' ? JSON.stringify(value) : value;
      
      if (ttl > 0) {
        return await client.setEx(key, ttl, serializedValue);
      } else {
        return await client.set(key, serializedValue);
      }
    } catch (error) {
      logger.error('Cache set error:', { key, error: error.message });
      throw error;
    }
  },

  /**
   * Get cache value
   * @param {string} key - Cache key
   * @param {boolean} parseJson - Whether to parse JSON
   * @returns {Promise<any>} Cached value
   */
  get: async (key, parseJson = true) => {
    try {
      const client = getClient();
      const value = await client.get(key);
      
      if (value === null) {
        return null;
      }
      
      return parseJson ? JSON.parse(value) : value;
    } catch (error) {
      logger.error('Cache get error:', { key, error: error.message });
      return null;
    }
  },

  /**
   * Delete cache key
   * @param {string} key - Cache key
   * @returns {Promise<number>} Number of deleted keys
   */
  del: async (key) => {
    try {
      const client = getClient();
      return await client.del(key);
    } catch (error) {
      logger.error('Cache delete error:', { key, error: error.message });
      throw error;
    }
  },

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} Whether key exists
   */
  exists: async (key) => {
    try {
      const client = getClient();
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', { key, error: error.message });
      return false;
    }
  },

  /**
   * Set cache with expiration only if key doesn't exist
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>} Whether key was set
   */
  setNX: async (key, value, ttl = 3600) => {
    try {
      const client = getClient();
      const serializedValue = typeof value === 'object' ? JSON.stringify(value) : value;
      
      const result = await client.setNX(key, serializedValue);
      if (result && ttl > 0) {
        await client.expire(key, ttl);
      }
      
      return result;
    } catch (error) {
      logger.error('Cache setNX error:', { key, error: error.message });
      throw error;
    }
  },

  /**
   * Increment cache value
   * @param {string} key - Cache key
   * @param {number} amount - Amount to increment
   * @returns {Promise<number>} New value
   */
  incr: async (key, amount = 1) => {
    try {
      const client = getClient();
      return await client.incrBy(key, amount);
    } catch (error) {
      logger.error('Cache increment error:', { key, error: error.message });
      throw error;
    }
  },

  /**
   * Get cache TTL
   * @param {string} key - Cache key
   * @returns {Promise<number>} TTL in seconds
   */
  ttl: async (key) => {
    try {
      const client = getClient();
      return await client.ttl(key);
    } catch (error) {
      logger.error('Cache TTL error:', { key, error: error.message });
      return -1;
    }
  }
};

/**
 * Pub/Sub service wrapper
 */
const pubsub = {
  /**
   * Publish message to channel
   * @param {string} channel - Channel name
   * @param {any} message - Message to publish
   * @returns {Promise<number>} Number of subscribers
   */
  publish: async (channel, message) => {
    try {
      const client = getClient();
      const serializedMessage = typeof message === 'object' ? JSON.stringify(message) : message;
      return await client.publish(channel, serializedMessage);
    } catch (error) {
      logger.error('Pub/Sub publish error:', { channel, error: error.message });
      throw error;
    }
  },

  /**
   * Subscribe to channel
   * @param {string} channel - Channel name
   * @param {Function} callback - Message callback
   * @returns {Promise<void>}
   */
  subscribe: async (channel, callback) => {
    try {
      const subscriber = getSubscriber();
      
      await subscriber.subscribe(channel, (message) => {
        try {
          const parsedMessage = JSON.parse(message);
          callback(parsedMessage);
        } catch (parseError) {
          // If parsing fails, send raw message
          callback(message);
        }
      });
      
      logger.info(`Subscribed to channel: ${channel}`);
    } catch (error) {
      logger.error('Pub/Sub subscribe error:', { channel, error: error.message });
      throw error;
    }
  },

  /**
   * Unsubscribe from channel
   * @param {string} channel - Channel name
   * @returns {Promise<void>}
   */
  unsubscribe: async (channel) => {
    try {
      const subscriber = getSubscriber();
      await subscriber.unsubscribe(channel);
      logger.info(`Unsubscribed from channel: ${channel}`);
    } catch (error) {
      logger.error('Pub/Sub unsubscribe error:', { channel, error: error.message });
      throw error;
    }
  }
};

/**
 * Get Redis health status
 * @returns {Promise<Object>} Health status
 */
const getHealthStatus = async () => {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return { status: 'disconnected', error: 'Client not connected' };
    }

    const start = Date.now();
    await redisClient.ping();
    const responseTime = Date.now() - start;
    
    const info = await redisClient.info('memory');
    const memoryInfo = {};
    info.split('\r\n').forEach(line => {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        memoryInfo[key] = value;
      }
    });
    
    return {
      status: 'connected',
      responseTime: `${responseTime}ms`,
      memory: {
        used: memoryInfo.used_memory_human,
        peak: memoryInfo.used_memory_peak_human,
        rss: memoryInfo.used_memory_rss_human
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message
    };
  }
};

/**
 * Close Redis connections
 * @returns {Promise<void>}
 */
const closeRedis = async () => {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
      redisClient = null;
      logger.info('Redis client closed');
    }
    
    if (redisSubscriber && redisSubscriber.isOpen) {
      await redisSubscriber.quit();
      redisSubscriber = null;
      logger.info('Redis subscriber closed');
    }
  } catch (error) {
    logger.error('Error closing Redis connections:', error);
    throw error;
  }
};

module.exports = {
  connectRedis,
  getClient,
  getSubscriber,
  cache,
  pubsub,
  getHealthStatus,
  closeRedis
};
const Queue = require('bull');
const { getClient, cache } = require('./redis');
const logger = require('../utils/logger');
const cron = require('node-cron');

// Queue instances for different priorities
const queues = {};
const priorityQueues = {
  high: {},
  normal: {},
  low: {}
};

// Job type definitions
const JOB_TYPES = {
  VIDEO_GENERATION: 'video-generation',
  SCRIPT_GENERATION: 'script-generation',
  SCENE_CREATION: 'scene-creation',
  AUDIO_SYNTHESIS: 'audio-synthesis',
  IMAGE_GENERATION: 'image-generation',
  WORLD_BUILDING: 'world-building',
  CONTENT_ANALYSIS: 'content-analysis',
  VIDEO_COMPOSITION: 'video-composition',
  PERSONALIZATION: 'personalization',
  AI_PROCESSING: 'ai-processing'
};

// Subscription priority levels
const SUBSCRIPTION_PRIORITY = {
  free: 1,
  basic: 2,
  pro: 3,
  enterprise: 4
};

// Queue configuration
const queueConfig = {
  defaultJobOptions: {
    removeOnComplete: 10, // Keep last 10 completed jobs
    removeOnFail: 50, // Keep last 50 failed jobs
    attempts: 3, // Default retry attempts
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  },
  settings: {
    stalledInterval: 30 * 1000, // 30 seconds
    maxStalledCount: 1,
    lockDuration: 30000 // 30 seconds
  }
};

// Concurrent job limits per user/type
const CONCURRENT_LIMITS = {
  user: {
    free: 1,
    basic: 2,
    pro: 5,
    enterprise: 10
  },
  type: {
    [JOB_TYPES.VIDEO_GENERATION]: 2,
    [JOB_TYPES.SCRIPT_GENERATION]: 5,
    [JOB_TYPES.SCENE_CREATION]: 3,
    [JOB_TYPES.AUDIO_SYNTHESIS]: 3,
    [JOB_TYPES.IMAGE_GENERATION]: 5,
    [JOB_TYPES.WORLD_BUILDING]: 2,
    [JOB_TYPES.CONTENT_ANALYSIS]: 10,
    [JOB_TYPES.VIDEO_COMPOSITION]: 1,
    [JOB_TYPES.PERSONALIZATION]: 5,
    [JOB_TYPES.AI_PROCESSING]: 3
  }
};

// Job statistics tracking
let jobStats = {
  total: 0,
  completed: 0,
  failed: 0,
  active: 0,
  delayed: 0,
  waiting: 0,
  byType: {},
  byUser: {},
  byPriority: {
    high: 0,
    normal: 0,
    low: 0
  }
};

// Performance metrics
let performanceMetrics = {
  avgProcessingTime: 0,
  totalProcessingTime: 0,
  jobsProcessed: 0,
  queueUtilization: 0,
  errorRate: 0
};

// Recurring jobs registry
const recurringJobs = new Map();

// Job dependencies registry
const jobDependencies = new Map();

/**
 * Initialize job queues with priority support
 * @returns {Promise<void>}
 */
const initializeQueues = async () => {
  try {
    const redisClient = getClient();
    
    // Create queues for each job type and priority
    for (const jobType of Object.values(JOB_TYPES)) {
      for (const priority of ['high', 'normal', 'low']) {
        const queueName = `${jobType}:${priority}`;
        const queue = new Queue(queueName, {
          redis: {
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
            db: process.env.REDIS_DB || 0
          },
          ...queueConfig,
          defaultJobOptions: {
            ...queueConfig.defaultJobOptions,
            priority: priority === 'high' ? 10 : priority === 'normal' ? 5 : 1
          }
        });
        
        // Set up event listeners
        setupQueueListeners(queue, jobType, priority);
        
        priorityQueues[priority][jobType] = queue;
        
        if (!queues[jobType]) {
          queues[jobType] = [];
        }
        queues[jobType].push(queue);
        
        logger.info(`Queue initialized: ${queueName}`);
      }
    }
    
    // Start performance monitoring
    startPerformanceMonitoring();
    
    // Start job history cleanup
    startJobHistoryCleanup();
    
    logger.info('All job queues initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize job queues:', error);
    throw error;
  }
};

/**
 * Set up event listeners for a queue
 * @param {Queue} queue - Bull queue instance
 * @param {string} jobType - Job type name
 * @param {string} priority - Priority level
 */
const setupQueueListeners = (queue, jobType, priority) => {
  // Job completed
  queue.on('completed', async (job, result) => {
    const duration = Date.now() - job.timestamp;
    
    logger.info(`Job completed in ${jobType}:${priority}`, {
      jobId: job.id,
      queueType: jobType,
      priority,
      duration,
      result: typeof result === 'object' ? 'Object' : result
    });
    
    // Update statistics
    updateJobStats('completed', jobType, job.data.userId, priority);
    updatePerformanceMetrics(duration, true);
    
    // Cache job result
    await cacheJobResult(job.id, result);
    
    // Process dependent jobs
    await processDependentJobs(job.id);
    
    // Check user concurrent limits
    await checkUserConcurrentLimits(job.data.userId);
    
    // Publish completion event
    publishJobEvent(jobType, 'completed', {
      jobId: job.id,
      data: job.data,
      result,
      duration,
      priority
    });
    
    // Record job history
    await recordJobHistory(job, 'completed', result);
  });
  
  // Job failed
  queue.on('failed', async (job, err) => {
    const duration = Date.now() - job.timestamp;
    
    logger.error(`Job failed in ${jobType}:${priority}`, {
      jobId: job.id,
      queueType: jobType,
      priority,
      error: err.message,
      stack: err.stack,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts
    });
    
    // Update statistics
    updateJobStats('failed', jobType, job.data.userId, priority);
    updatePerformanceMetrics(duration, false);
    
    // Publish failure event
    publishJobEvent(jobType, 'failed', {
      jobId: job.id,
      data: job.data,
      error: err.message,
      attempts: job.attemptsMade,
      priority
    });
    
    // Record job history
    await recordJobHistory(job, 'failed', { error: err.message });
  });
  
  // Job stalled
  queue.on('stalled', (job) => {
    logger.warn(`Job stalled in ${jobType}:${priority}`, {
      jobId: job.id,
      queueType: jobType,
      priority,
      attempts: job.attemptsMade
    });
  });
  
  // Job progress
  queue.on('progress', async (job, progress) => {
    logger.debug(`Job progress in ${jobType}:${priority}`, {
      jobId: job.id,
      queueType: jobType,
      priority,
      progress: `${progress}%`
    });
    
    // Update job progress in cache
    await updateJobProgress(job.id, progress);
    
    // Publish progress event
    publishJobEvent(jobType, 'progress', {
      jobId: job.id,
      data: job.data,
      progress,
      priority
    });
  });
  
  // Queue error
  queue.on('error', (err) => {
    logger.error(`Queue error in ${jobType}:${priority}`, {
      queueType: jobType,
      priority,
      error: err.message,
      stack: err.stack
    });
  });
  
  // Queue waiting
  queue.on('waiting', (jobId) => {
    logger.debug(`Job waiting in ${jobType}:${priority}`, {
      jobId,
      queueType: jobType,
      priority
    });
  });
  
  // Queue active
  queue.on('active', async (job) => {
    logger.info(`Job active in ${jobType}:${priority}`, {
      jobId: job.id,
      queueType: jobType,
      priority,
      data: job.data
    });
    
    // Update statistics
    updateJobStats('active', jobType, job.data.userId, priority);
    
    // Record job history
    await recordJobHistory(job, 'active');
  });
};

/**
 * Add job to appropriate priority queue
 * @param {string} jobType - Job type
 * @param {Object} data - Job data
 * @param {Object} options - Job options
 * @returns {Promise<Job>} Bull job instance
 */
const addJob = async (jobType, data, options = {}) => {
  try {
    // Validate job type
    if (!Object.values(JOB_TYPES).includes(jobType)) {
      throw new Error(`Invalid job type: ${jobType}`);
    }
    
    // Determine priority based on subscription level or explicit option
    const userSubscription = data.userSubscription || 'free';
    const priority = options.priority || getPriorityFromSubscription(userSubscription);
    
    // Check concurrent limits
    await checkConcurrentLimits(jobType, data.userId, userSubscription);
    
    // Check dependencies
    if (options.dependencies && options.dependencies.length > 0) {
      await checkJobDependencies(options.dependencies);
    }
    
    const queue = priorityQueues[priority][jobType];
    if (!queue) {
      throw new Error(`Queue not found: ${jobType}:${priority}`);
    }
    
    const jobOptions = {
      ...queueConfig.defaultJobOptions,
      ...options,
      priority: priority === 'high' ? 10 : priority === 'normal' ? 5 : 1,
      // Add metadata
      metadata: {
        jobType,
        priority,
        userSubscription,
        createdAt: new Date().toISOString(),
        ...options.metadata
      }
    };
    
    const job = await queue.add(data, jobOptions);
    
    // Register dependencies if any
    if (options.dependencies && options.dependencies.length > 0) {
      jobDependencies.set(job.id, options.dependencies);
    }
    
    // Update statistics
    updateJobStats('total', jobType, data.userId, priority);
    
    logger.info(`Job added to ${jobType}:${priority}`, {
      jobId: job.id,
      jobType,
      priority,
      data: typeof data === 'object' ? 'Object' : data,
      options: jobOptions
    });
    
    return job;
  } catch (error) {
    logger.error(`Failed to add job to ${jobType}:`, error);
    throw error;
  }
};

/**
 * Add delayed job
 * @param {string} jobType - Job type
 * @param {Object} data - Job data
 * @param {number} delay - Delay in milliseconds
 * @param {Object} options - Job options
 * @returns {Promise<Job>} Bull job instance
 */
const addDelayedJob = async (jobType, data, delay, options = {}) => {
  const jobOptions = {
    ...options,
    delay
  };
  
  return addJob(jobType, data, jobOptions);
};

/**
 * Add recurring job
 * @param {string} jobType - Job type
 * @param {Object} data - Job data
 * @param {string} cronExpression - Cron expression
 * @param {Object} options - Job options
 * @returns {Promise<string>} Recurring job ID
 */
const addRecurringJob = async (jobType, data, cronExpression, options = {}) => {
  try {
    const recurringJobId = `recurring:${jobType}:${Date.now()}`;
    
    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }
    
    // Store recurring job info
    recurringJobs.set(recurringJobId, {
      jobType,
      data,
      cronExpression,
      options,
      createdAt: new Date().toISOString(),
      lastRun: null,
      nextRun: getNextRunTime(cronExpression)
    });
    
    // Schedule the recurring job
    const task = cron.schedule(cronExpression, async () => {
      try {
        await addJob(jobType, data, options);
        
        // Update last run time
        const recurringJob = recurringJobs.get(recurringJobId);
        if (recurringJob) {
          recurringJob.lastRun = new Date().toISOString();
          recurringJob.nextRun = getNextRunTime(cronExpression);
        }
        
        logger.info(`Recurring job executed: ${recurringJobId}`);
      } catch (error) {
        logger.error(`Failed to execute recurring job ${recurringJobId}:`, error);
      }
    }, {
      scheduled: true
    });
    
    recurringJobs.get(recurringJobId).task = task;
    
    logger.info(`Recurring job scheduled: ${recurringJobId}`, {
      jobType,
      cronExpression,
      nextRun: recurringJobs.get(recurringJobId).nextRun
    });
    
    return recurringJobId;
  } catch (error) {
    logger.error(`Failed to add recurring job:`, error);
    throw error;
  }
};

/**
 * Remove recurring job
 * @param {string} recurringJobId - Recurring job ID
 * @returns {Promise<boolean>} Whether job was removed
 */
const removeRecurringJob = async (recurringJobId) => {
  try {
    const recurringJob = recurringJobs.get(recurringJobId);
    if (!recurringJob) {
      return false;
    }
    
    // Stop the cron task
    if (recurringJob.task) {
      recurringJob.task.stop();
    }
    
    // Remove from registry
    recurringJobs.delete(recurringJobId);
    
    logger.info(`Recurring job removed: ${recurringJobId}`);
    return true;
  } catch (error) {
    logger.error(`Failed to remove recurring job ${recurringJobId}:`, error);
    throw error;
  }
};

/**
 * Get job by ID
 * @param {string} jobType - Job type
 * @param {string} jobId - Job ID
 * @returns {Promise<Job|null>} Bull job instance
 */
const getJob = async (jobType, jobId) => {
  try {
    const typeQueues = queues[jobType];
    if (!typeQueues) {
      throw new Error(`Queue not found: ${jobType}`);
    }
    
    // Search for job in all priority queues
    for (const queue of typeQueues) {
      const job = await queue.getJob(jobId);
      if (job) {
        return job;
      }
    }
    
    return null;
  } catch (error) {
    logger.error(`Failed to get job from ${jobType}:`, error);
    throw error;
  }
};

/**
 * Get queue statistics
 * @param {string} jobType - Job type (optional)
 * @returns {Promise<Object>} Queue statistics
 */
const getQueueStats = async (jobType = null) => {
  try {
    const stats = {
      total: 0,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      byPriority: {
        high: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
        normal: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
        low: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }
      }
    };
    
    const queueTypes = jobType ? [jobType] : Object.keys(queues);
    
    for (const type of queueTypes) {
      const typeQueues = queues[type];
      if (!typeQueues) continue;
      
      for (const priority of ['high', 'normal', 'low']) {
        const queue = priorityQueues[priority][type];
        if (!queue) continue;
        
        const waiting = await queue.getWaiting();
        const active = await queue.getActive();
        const completed = await queue.getCompleted();
        const failed = await queue.getFailed();
        const delayed = await queue.getDelayed();
        
        stats.waiting += waiting.length;
        stats.active += active.length;
        stats.completed += completed.length;
        stats.failed += failed.length;
        stats.delayed += delayed.length;
        
        stats.byPriority[priority].waiting += waiting.length;
        stats.byPriority[priority].active += active.length;
        stats.byPriority[priority].completed += completed.length;
        stats.byPriority[priority].failed += failed.length;
        stats.byPriority[priority].delayed += delayed.length;
      }
    }
    
    stats.total = stats.waiting + stats.active + stats.completed + stats.failed + stats.delayed;
    
    return stats;
  } catch (error) {
    logger.error('Failed to get queue stats:', error);
    throw error;
  }
};

/**
 * Get job statistics
 * @returns {Object} Job statistics
 */
const getJobStats = () => {
  return {
    ...jobStats,
    performanceMetrics,
    recurringJobs: recurringJobs.size,
    pendingDependencies: jobDependencies.size
  };
};

/**
 * Get user job history
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Job history
 */
const getUserJobHistory = async (userId, options = {}) => {
  try {
    const { limit = 50, offset = 0, status, jobType } = options;
    
    // Get from cache first
    const cacheKey = `job_history:${userId}:${JSON.stringify(options)}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Query from Redis (simplified implementation)
    const history = [];
    
    // In a real implementation, this would query a database
    // For now, return empty array
    await cache.set(cacheKey, history, 300); // Cache for 5 minutes
    
    return history;
  } catch (error) {
    logger.error(`Failed to get user job history for ${userId}:`, error);
    return [];
  }
};

/**
 * Pause queue
 * @param {string} jobType - Job type
 * @param {string} priority - Priority level (optional)
 * @returns {Promise<void>}
 */
const pauseQueue = async (jobType, priority = null) => {
  try {
    if (priority) {
      const queue = priorityQueues[priority][jobType];
      if (!queue) {
        throw new Error(`Queue not found: ${jobType}:${priority}`);
      }
      await queue.pause();
      logger.info(`Queue paused: ${jobType}:${priority}`);
    } else {
      const typeQueues = queues[jobType];
      if (!typeQueues) {
        throw new Error(`Queue not found: ${jobType}`);
      }
      
      for (const queue of typeQueues) {
        await queue.pause();
      }
      logger.info(`All queues paused: ${jobType}`);
    }
  } catch (error) {
    logger.error(`Failed to pause queue ${jobType}:`, error);
    throw error;
  }
};

/**
 * Resume queue
 * @param {string} jobType - Job type
 * @param {string} priority - Priority level (optional)
 * @returns {Promise<void>}
 */
const resumeQueue = async (jobType, priority = null) => {
  try {
    if (priority) {
      const queue = priorityQueues[priority][jobType];
      if (!queue) {
        throw new Error(`Queue not found: ${jobType}:${priority}`);
      }
      await queue.resume();
      logger.info(`Queue resumed: ${jobType}:${priority}`);
    } else {
      const typeQueues = queues[jobType];
      if (!typeQueues) {
        throw new Error(`Queue not found: ${jobType}`);
      }
      
      for (const queue of typeQueues) {
        await queue.resume();
      }
      logger.info(`All queues resumed: ${jobType}`);
    }
  } catch (error) {
    logger.error(`Failed to resume queue ${jobType}:`, error);
    throw error;
  }
};

/**
 * Clear queue
 * @param {string} jobType - Job type
 * @param {string} priority - Priority level (optional)
 * @returns {Promise<void>}
 */
const clearQueue = async (jobType, priority = null) => {
  try {
    if (priority) {
      const queue = priorityQueues[priority][jobType];
      if (!queue) {
        throw new Error(`Queue not found: ${jobType}:${priority}`);
      }
      
      await queue.clean(0, 'completed');
      await queue.clean(0, 'failed');
      await queue.clean(0, 'waiting');
      await queue.clean(0, 'delayed');
      
      logger.info(`Queue cleared: ${jobType}:${priority}`);
    } else {
      const typeQueues = queues[jobType];
      if (!typeQueues) {
        throw new Error(`Queue not found: ${jobType}`);
      }
      
      for (const queue of typeQueues) {
        await queue.clean(0, 'completed');
        await queue.clean(0, 'failed');
        await queue.clean(0, 'waiting');
        await queue.clean(0, 'delayed');
      }
      logger.info(`All queues cleared: ${jobType}`);
    }
  } catch (error) {
    logger.error(`Failed to clear queue ${jobType}:`, error);
    throw error;
  }
};

/**
 * Remove job
 * @param {string} jobType - Job type
 * @param {string} jobId - Job ID
 * @returns {Promise<boolean>} Whether job was removed
 */
const removeJob = async (jobType, jobId) => {
  try {
    const job = await getJob(jobType, jobId);
    if (job) {
      await job.remove();
      logger.info(`Job removed from ${jobType}`, { jobId, jobType });
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error(`Failed to remove job from ${jobType}:`, error);
    throw error;
  }
};

/**
 * Retry job
 * @param {string} jobType - Job type
 * @param {string} jobId - Job ID
 * @returns {Promise<boolean>} Whether job was retried
 */
const retryJob = async (jobType, jobId) => {
  try {
    const job = await getJob(jobType, jobId);
    if (job && (await job.isFailed())) {
      await job.retry();
      logger.info(`Job retried in ${jobType}`, { jobId, jobType });
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error(`Failed to retry job in ${jobType}:`, error);
    throw error;
  }
};

/**
 * Get queue health status
 * @returns {Promise<Object>} Health status
 */
const getQueueHealth = async () => {
  try {
    const stats = await getQueueStats();
    const health = {
      status: 'healthy',
      queues: {},
      summary: {
        totalJobs: stats.total,
        activeJobs: stats.active,
        failedJobs: stats.failed,
        errorRate: 0
      }
    };
    
    // Check each queue type
    for (const jobType of Object.keys(queues)) {
      const typeQueues = queues[jobType];
      health.queues[jobType] = {};
      
      for (const priority of ['high', 'normal', 'low']) {
        const queue = priorityQueues[priority][jobType];
        if (queue) {
          const waiting = await queue.getWaiting();
          const active = await queue.getActive();
          const failed = await queue.getFailed();
          
          health.queues[jobType][priority] = {
            waiting: waiting.length,
            active: active.length,
            failed: failed.length,
            status: failed.length > 10 ? 'unhealthy' : 'healthy'
          };
        }
      }
    }
    
    // Calculate overall error rate
    const totalCompleted = stats.completed;
    const totalFailed = stats.failed;
    health.summary.errorRate = totalCompleted > 0 ? (totalFailed / (totalCompleted + totalFailed)) * 100 : 0;
    
    // Determine overall status
    if (health.summary.errorRate > 20 || health.summary.activeJobs > 100) {
      health.status = 'degraded';
    }
    if (health.summary.errorRate > 50 || health.summary.activeJobs > 200) {
      health.status = 'unhealthy';
    }
    
    return health;
  } catch (error) {
    logger.error('Failed to get queue health:', error);
    return {
      status: 'error',
      error: error.message
    };
  }
};

/**
 * Get performance metrics
 * @returns {Object} Performance metrics
 */
const getPerformanceMetrics = () => {
  return {
    ...performanceMetrics,
    queueUtilization: (jobStats.active / (jobStats.total || 1)) * 100,
    errorRate: (jobStats.failed / (jobStats.completed || 1)) * 100,
    avgWaitTime: performanceMetrics.avgProcessingTime * 0.3, // Estimate
    throughput: jobStats.completed / ((Date.now() - performanceMetrics.startTime) / 1000 / 60) || 0 // Jobs per minute
  };
};

/**
 * Get queue instance
 * @param {string} jobType - Job type
 * @param {string} priority - Priority level
 * @returns {Queue} Bull queue instance
 */
const getQueue = (jobType, priority = 'normal') => {
  const queue = priorityQueues[priority][jobType];
  if (!queue) {
    throw new Error(`Queue not found: ${jobType}:${priority}`);
  }
  return queue;
};

/**
 * Close all queues
 * @returns {Promise<void>}
 */
const closeQueues = async () => {
  try {
    // Stop all recurring jobs
    for (const [id, recurringJob] of recurringJobs.entries()) {
      if (recurringJob.task) {
        recurringJob.task.stop();
      }
    }
    recurringJobs.clear();
    
    // Close all queues
    const closePromises = [];
    for (const jobType of Object.keys(queues)) {
      const typeQueues = queues[jobType];
      for (const queue of typeQueues) {
        closePromises.push(queue.close());
      }
    }
    
    await Promise.all(closePromises);
    
    logger.info('All job queues closed');
  } catch (error) {
    logger.error('Failed to close job queues:', error);
    throw error;
  }
};

// Helper functions

/**
 * Get priority from subscription level
 * @param {string} subscription - Subscription level
 * @returns {string} Priority level
 */
const getPriorityFromSubscription = (subscription) => {
  const level = SUBSCRIPTION_PRIORITY[subscription] || 1;
  if (level >= 4) return 'high';
  if (level >= 2) return 'normal';
  return 'low';
};

/**
 * Check concurrent limits
 * @param {string} jobType - Job type
 * @param {string} userId - User ID
 * @param {string} subscription - Subscription level
 */
const checkConcurrentLimits = async (jobType, userId, subscription) => {
  try {
    // Check user limit
    const userLimit = CONCURRENT_LIMITS.user[subscription] || 1;
    const userActiveJobs = await getUserActiveJobs(userId);
    
    if (userActiveJobs >= userLimit) {
      throw new Error(`User concurrent job limit exceeded: ${userActiveJobs}/${userLimit}`);
    }
    
    // Check type limit
    const typeLimit = CONCURRENT_LIMITS.type[jobType] || 5;
    const typeActiveJobs = await getTypeActiveJobs(jobType);
    
    if (typeActiveJobs >= typeLimit) {
      throw new Error(`Job type concurrent limit exceeded: ${typeActiveJobs}/${typeLimit}`);
    }
  } catch (error) {
    logger.error('Concurrent limit check failed:', error);
    throw error;
  }
};

/**
 * Get user active jobs count
 * @param {string} userId - User ID
 * @returns {Promise<number>} Active jobs count
 */
const getUserActiveJobs = async (userId) => {
  try {
    let count = 0;
    
    for (const jobType of Object.keys(queues)) {
      const typeQueues = queues[jobType];
      for (const queue of typeQueues) {
        const active = await queue.getActive();
        count += active.filter(job => job.data.userId === userId).length;
      }
    }
    
    return count;
  } catch (error) {
    logger.error('Failed to get user active jobs:', error);
    return 0;
  }
};

/**
 * Get type active jobs count
 * @param {string} jobType - Job type
 * @returns {Promise<number>} Active jobs count
 */
const getTypeActiveJobs = async (jobType) => {
  try {
    let count = 0;
    const typeQueues = queues[jobType];
    
    if (typeQueues) {
      for (const queue of typeQueues) {
        const active = await queue.getActive();
        count += active.length;
      }
    }
    
    return count;
  } catch (error) {
    logger.error('Failed to get type active jobs:', error);
    return 0;
  }
};

/**
 * Check user concurrent limits and process waiting jobs
 * @param {string} userId - User ID
 */
const checkUserConcurrentLimits = async (userId) => {
  try {
    // This would typically trigger processing of waiting jobs
    // Implementation depends on specific requirements
    logger.debug(`Checking concurrent limits for user: ${userId}`);
  } catch (error) {
    logger.error('Failed to check user concurrent limits:', error);
  }
};

/**
 * Check job dependencies
 * @param {Array} dependencies - Array of job IDs
 */
const checkJobDependencies = async (dependencies) => {
  try {
    for (const depJobId of dependencies) {
      // Check if dependency job exists and is completed
      // This is a simplified implementation
      logger.debug(`Checking job dependency: ${depJobId}`);
    }
  } catch (error) {
    logger.error('Failed to check job dependencies:', error);
    throw error;
  }
};

/**
 * Process dependent jobs
 * @param {string} completedJobId - Completed job ID
 */
const processDependentJobs = async (completedJobId) => {
  try {
    // Find jobs that depend on this job
    for (const [jobId, dependencies] of jobDependencies.entries()) {
      if (dependencies.includes(completedJobId)) {
        // Remove completed job from dependencies
        const index = dependencies.indexOf(completedJobId);
        dependencies.splice(index, 1);
        
        // If all dependencies are met, process the job
        if (dependencies.length === 0) {
          jobDependencies.delete(jobId);
          // Trigger job processing
          logger.debug(`All dependencies met for job: ${jobId}`);
        }
      }
    }
  } catch (error) {
    logger.error('Failed to process dependent jobs:', error);
  }
};

/**
 * Update job statistics
 * @param {string} status - Job status
 * @param {string} jobType - Job type
 * @param {string} userId - User ID
 * @param {string} priority - Priority level
 */
const updateJobStats = (status, jobType, userId, priority) => {
  // Initialize counters if needed
  if (!jobStats.byType[jobType]) {
    jobStats.byType[jobType] = { total: 0, completed: 0, failed: 0, active: 0 };
  }
  if (!jobStats.byUser[userId]) {
    jobStats.byUser[userId] = { total: 0, completed: 0, failed: 0, active: 0 };
  }
  
  // Update counters
  switch (status) {
    case 'total':
      jobStats.total++;
      jobStats.byType[jobType].total++;
      jobStats.byUser[userId].total++;
      jobStats.byPriority[priority]++;
      break;
    case 'completed':
      jobStats.completed++;
      jobStats.byType[jobType].completed++;
      jobStats.byUser[userId].completed++;
      break;
    case 'failed':
      jobStats.failed++;
      jobStats.byType[jobType].failed++;
      jobStats.byUser[userId].failed++;
      break;
    case 'active':
      jobStats.active++;
      jobStats.byType[jobType].active++;
      jobStats.byUser[userId].active++;
      break;
  }
};

/**
 * Update performance metrics
 * @param {number} duration - Job duration in milliseconds
 * @param {boolean} success - Whether job was successful
 */
const updatePerformanceMetrics = (duration, success) => {
  performanceMetrics.totalProcessingTime += duration;
  performanceMetrics.jobsProcessed++;
  
  if (success) {
    performanceMetrics.avgProcessingTime = performanceMetrics.totalProcessingTime / performanceMetrics.jobsProcessed;
  } else {
    // Track error rate
    const totalJobs = performanceMetrics.jobsProcessed;
    const failedJobs = totalJobs - (performanceMetrics.jobsProcessed * (1 - performanceMetrics.errorRate / 100));
    performanceMetrics.errorRate = (failedJobs / totalJobs) * 100;
  }
};

/**
 * Cache job result
 * @param {string} jobId - Job ID
 * @param {any} result - Job result
 */
const cacheJobResult = async (jobId, result) => {
  try {
    const cacheKey = `job_result:${jobId}`;
    await cache.set(cacheKey, result, 3600); // Cache for 1 hour
  } catch (error) {
    logger.error('Failed to cache job result:', error);
  }
};

/**
 * Update job progress
 * @param {string} jobId - Job ID
 * @param {number} progress - Progress percentage
 */
const updateJobProgress = async (jobId, progress) => {
  try {
    const cacheKey = `job_progress:${jobId}`;
    await cache.set(cacheKey, progress, 3600); // Cache for 1 hour
  } catch (error) {
    logger.error('Failed to update job progress:', error);
  }
};

/**
 * Get job progress
 * @param {string} jobId - Job ID
 * @returns {Promise<number>} Progress percentage
 */
const getJobProgress = async (jobId) => {
  try {
    const cacheKey = `job_progress:${jobId}`;
    const progress = await cache.get(cacheKey);
    return progress || 0;
  } catch (error) {
    logger.error('Failed to get job progress:', error);
    return 0;
  }
};

/**
 * Get cached job result
 * @param {string} jobId - Job ID
 * @returns {Promise<any>} Job result
 */
const getCachedJobResult = async (jobId) => {
  try {
    const cacheKey = `job_result:${jobId}`;
    return await cache.get(cacheKey);
  } catch (error) {
    logger.error('Failed to get cached job result:', error);
    return null;
  }
};

/**
 * Record job history
 * @param {Job} job - Bull job instance
 * @param {string} status - Job status
 * @param {any} result - Job result (optional)
 */
const recordJobHistory = async (job, status, result = null) => {
  try {
    const historyEntry = {
      jobId: job.id,
      jobType: job.data.jobType,
      userId: job.data.userId,
      status,
      timestamp: new Date().toISOString(),
      duration: Date.now() - job.timestamp,
      result: result || null
    };
    
    // In a real implementation, this would store to a database
    // For now, we'll just log it
    logger.debug('Job history recorded:', historyEntry);
  } catch (error) {
    logger.error('Failed to record job history:', error);
  }
};

/**
 * Publish job event to Redis pub/sub
 * @param {string} queueType - Queue type
 * @param {string} event - Event type
 * @param {Object} data - Event data
 */
const publishJobEvent = async (queueType, event, data) => {
  try {
    const { pubsub } = require('./redis');
    await pubsub.publish(`jobs:${queueType}`, {
      event,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to publish job event:', error);
  }
};

/**
 * Get next run time from cron expression
 * @param {string} cronExpression - Cron expression
 * @returns {string} Next run time ISO string
 */
const getNextRunTime = (cronExpression) => {
  try {
    // This is a simplified implementation
    // In a real implementation, you'd use a proper cron parser
    const now = new Date();
    const nextRun = new Date(now.getTime() + 60000); // Add 1 minute for demo
    return nextRun.toISOString();
  } catch (error) {
    logger.error('Failed to get next run time:', error);
    return new Date().toISOString();
  }
};

/**
 * Start performance monitoring
 */
const startPerformanceMonitoring = () => {
  performanceMetrics.startTime = Date.now();
  
  setInterval(() => {
    // Update queue utilization
    performanceMetrics.queueUtilization = (jobStats.active / (jobStats.total || 1)) * 100;
    
    // Log performance metrics
    logger.debug('Performance metrics:', performanceMetrics);
  }, 60000); // Update every minute
};

/**
 * Start job history cleanup
 */
const startJobHistoryCleanup = () => {
  // Run cleanup daily
  cron.schedule('0 0 * * *', async () => {
    try {
      logger.info('Starting job history cleanup');
      
      // In a real implementation, this would clean up old records from database
      // For now, we'll just log it
      logger.info('Job history cleanup completed');
    } catch (error) {
      logger.error('Job history cleanup failed:', error);
    }
  });
};

module.exports = {
  initializeQueues,
  addJob,
  addDelayedJob,
  addRecurringJob,
  removeRecurringJob,
  getJob,
  getQueueStats,
  getJobStats,
  getUserJobHistory,
  pauseQueue,
  resumeQueue,
  clearQueue,
  removeJob,
  retryJob,
  getQueueHealth,
  getPerformanceMetrics,
  getJobProgress,
  getCachedJobResult,
  getQueue,
  closeQueues,
  JOB_TYPES,
  SUBSCRIPTION_PRIORITY
};
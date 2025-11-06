const express = require('express');
const router = express.Router();
const Joi = require('joi');
const {
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
  JOB_TYPES,
  SUBSCRIPTION_PRIORITY
} = require('../services/jobQueue');
const { authenticateToken } = require('../middleware/auth');
const { validateRequest, validateQuery, validateParams, jobSchemas, querySchemas, paramSchemas } = require('../middleware/validation');
const logger = require('../utils/logger');

/**
 * Job Queue API Routes
 * Provides REST API for interacting with the job queue system
 */

// Job schemas for validation
const jobSchemas = {
  videoGeneration: {
    type: 'object',
    required: ['userId', 'projectId', 'script', 'scenes'],
    properties: {
      userId: { type: 'string' },
      projectId: { type: 'string' },
      script: { type: 'object' },
      scenes: { type: 'array' },
      options: { type: 'object' },
      priority: { type: 'string', enum: ['high', 'normal', 'low'] },
      userSubscription: { type: 'string', enum: ['free', 'basic', 'pro', 'enterprise'] }
    }
  },
  scriptGeneration: {
    type: 'object',
    required: ['userId', 'projectId', 'prompt'],
    properties: {
      userId: { type: 'string' },
      projectId: { type: 'string' },
      prompt: { type: 'string' },
      options: { type: 'object' },
      priority: { type: 'string', enum: ['high', 'normal', 'low'] },
      userSubscription: { type: 'string', enum: ['free', 'basic', 'pro', 'enterprise'] }
    }
  },
  sceneCreation: {
    type: 'object',
    required: ['userId', 'projectId', 'scene', 'script'],
    properties: {
      userId: { type: 'string' },
      projectId: { type: 'string' },
      scene: { type: 'object' },
      script: { type: 'string' },
      options: { type: 'object' },
      priority: { type: 'string', enum: ['high', 'normal', 'low'] },
      userSubscription: { type: 'string', enum: ['free', 'basic', 'pro', 'enterprise'] }
    }
  },
  audioSynthesis: {
    type: 'object',
    required: ['userId', 'projectId', 'text'],
    properties: {
      userId: { type: 'string' },
      projectId: { type: 'string' },
      text: { type: 'string' },
      options: { type: 'object' },
      priority: { type: 'string', enum: ['high', 'normal', 'low'] },
      userSubscription: { type: 'string', enum: ['free', 'basic', 'pro', 'enterprise'] }
    }
  },
  imageGeneration: {
    type: 'object',
    required: ['userId', 'projectId', 'prompt'],
    properties: {
      userId: { type: 'string' },
      projectId: { type: 'string' },
      prompt: { type: 'string' },
      options: { type: 'object' },
      priority: { type: 'string', enum: ['high', 'normal', 'low'] },
      userSubscription: { type: 'string', enum: ['free', 'basic', 'pro', 'enterprise'] }
    }
  },
  worldBuilding: {
    type: 'object',
    required: ['userId', 'projectId', 'concept'],
    properties: {
      userId: { type: 'string' },
      projectId: { type: 'string' },
      concept: { type: 'string' },
      options: { type: 'object' },
      priority: { type: 'string', enum: ['high', 'normal', 'low'] },
      userSubscription: { type: 'string', enum: ['free', 'basic', 'pro', 'enterprise'] }
    }
  },
  contentAnalysis: {
    type: 'object',
    required: ['userId', 'projectId', 'content', 'type'],
    properties: {
      userId: { type: 'string' },
      projectId: { type: 'string' },
      content: { type: 'string' },
      type: { type: 'string', enum: ['script', 'image', 'video', 'text'] },
      options: { type: 'object' },
      priority: { type: 'string', enum: ['high', 'normal', 'low'] },
      userSubscription: { type: 'string', enum: ['free', 'basic', 'pro', 'enterprise'] }
    }
  },
  videoComposition: {
    type: 'object',
    required: ['userId', 'projectId', 'scenes', 'script'],
    properties: {
      userId: { type: 'string' },
      projectId: { type: 'string' },
      scenes: { type: 'array' },
      script: { type: 'object' },
      options: { type: 'object' },
      priority: { type: 'string', enum: ['high', 'normal', 'low'] },
      userSubscription: { type: 'string', enum: ['free', 'basic', 'pro', 'enterprise'] }
    }
  },
  personalization: {
    type: 'object',
    required: ['userId', 'projectId', 'content', 'personalization'],
    properties: {
      userId: { type: 'string' },
      projectId: { type: 'string' },
      content: { type: 'object' },
      personalization: { type: 'object' },
      options: { type: 'object' },
      priority: { type: 'string', enum: ['high', 'normal', 'low'] },
      userSubscription: { type: 'string', enum: ['free', 'basic', 'pro', 'enterprise'] }
    }
  }
};

/**
 * POST /api/jobs/video-generation
 * Create a new video generation job
 */
router.post('/video-generation', authenticateToken, validateRequest(jobSchemas.videoGeneration), async (req, res) => {
  try {
    const job = await addJob(JOB_TYPES.VIDEO_GENERATION, req.body, {
      priority: req.body.priority,
      userSubscription: req.body.userSubscription || 'free'
    });
    
    res.status(201).json({
      success: true,
      data: {
        jobId: job.id,
        jobType: JOB_TYPES.VIDEO_GENERATION,
        status: 'queued',
        createdAt: job.timestamp
      }
    });
  } catch (error) {
    logger.error('Failed to create video generation job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/jobs/script-generation
 * Create a new script generation job
 */
router.post('/script-generation', authenticateToken, validateRequest(jobSchemas.scriptGeneration), async (req, res) => {
  try {
    const job = await addJob(JOB_TYPES.SCRIPT_GENERATION, req.body, {
      priority: req.body.priority,
      userSubscription: req.body.userSubscription || 'free'
    });
    
    res.status(201).json({
      success: true,
      data: {
        jobId: job.id,
        jobType: JOB_TYPES.SCRIPT_GENERATION,
        status: 'queued',
        createdAt: job.timestamp
      }
    });
  } catch (error) {
    logger.error('Failed to create script generation job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/jobs/scene-creation
 * Create a new scene creation job
 */
router.post('/scene-creation', authenticateToken, validateRequest(jobSchemas.sceneCreation), async (req, res) => {
  try {
    const job = await addJob(JOB_TYPES.SCENE_CREATION, req.body, {
      priority: req.body.priority,
      userSubscription: req.body.userSubscription || 'free'
    });
    
    res.status(201).json({
      success: true,
      data: {
        jobId: job.id,
        jobType: JOB_TYPES.SCENE_CREATION,
        status: 'queued',
        createdAt: job.timestamp
      }
    });
  } catch (error) {
    logger.error('Failed to create scene creation job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/jobs/audio-synthesis
 * Create a new audio synthesis job
 */
router.post('/audio-synthesis', authenticateToken, validateRequest(jobSchemas.audioSynthesis), async (req, res) => {
  try {
    const job = await addJob(JOB_TYPES.AUDIO_SYNTHESIS, req.body, {
      priority: req.body.priority,
      userSubscription: req.body.userSubscription || 'free'
    });
    
    res.status(201).json({
      success: true,
      data: {
        jobId: job.id,
        jobType: JOB_TYPES.AUDIO_SYNTHESIS,
        status: 'queued',
        createdAt: job.timestamp
      }
    });
  } catch (error) {
    logger.error('Failed to create audio synthesis job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/jobs/image-generation
 * Create a new image generation job
 */
router.post('/image-generation', authenticateToken, validateRequest(jobSchemas.imageGeneration), async (req, res) => {
  try {
    const job = await addJob(JOB_TYPES.IMAGE_GENERATION, req.body, {
      priority: req.body.priority,
      userSubscription: req.body.userSubscription || 'free'
    });
    
    res.status(201).json({
      success: true,
      data: {
        jobId: job.id,
        jobType: JOB_TYPES.IMAGE_GENERATION,
        status: 'queued',
        createdAt: job.timestamp
      }
    });
  } catch (error) {
    logger.error('Failed to create image generation job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/jobs/world-building
 * Create a new world building job
 */
router.post('/world-building', authenticateToken, validateRequest(jobSchemas.worldBuilding), async (req, res) => {
  try {
    const job = await addJob(JOB_TYPES.WORLD_BUILDING, req.body, {
      priority: req.body.priority,
      userSubscription: req.body.userSubscription || 'free'
    });
    
    res.status(201).json({
      success: true,
      data: {
        jobId: job.id,
        jobType: JOB_TYPES.WORLD_BUILDING,
        status: 'queued',
        createdAt: job.timestamp
      }
    });
  } catch (error) {
    logger.error('Failed to create world building job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/jobs/content-analysis
 * Create a new content analysis job
 */
router.post('/content-analysis', authenticateToken, validateRequest(jobSchemas.contentAnalysis), async (req, res) => {
  try {
    const job = await addJob(JOB_TYPES.CONTENT_ANALYSIS, req.body, {
      priority: req.body.priority,
      userSubscription: req.body.userSubscription || 'free'
    });
    
    res.status(201).json({
      success: true,
      data: {
        jobId: job.id,
        jobType: JOB_TYPES.CONTENT_ANALYSIS,
        status: 'queued',
        createdAt: job.timestamp
      }
    });
  } catch (error) {
    logger.error('Failed to create content analysis job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/jobs/video-composition
 * Create a new video composition job
 */
router.post('/video-composition', authenticateToken, validateRequest(jobSchemas.videoComposition), async (req, res) => {
  try {
    const job = await addJob(JOB_TYPES.VIDEO_COMPOSITION, req.body, {
      priority: req.body.priority,
      userSubscription: req.body.userSubscription || 'free'
    });
    
    res.status(201).json({
      success: true,
      data: {
        jobId: job.id,
        jobType: JOB_TYPES.VIDEO_COMPOSITION,
        status: 'queued',
        createdAt: job.timestamp
      }
    });
  } catch (error) {
    logger.error('Failed to create video composition job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/jobs/personalization
 * Create a new personalization job
 */
router.post('/personalization', authenticateToken, validateRequest(jobSchemas.personalization), async (req, res) => {
  try {
    const job = await addJob(JOB_TYPES.PERSONALIZATION, req.body, {
      priority: req.body.priority,
      userSubscription: req.body.userSubscription || 'free'
    });
    
    res.status(201).json({
      success: true,
      data: {
        jobId: job.id,
        jobType: JOB_TYPES.PERSONALIZATION,
        status: 'queued',
        createdAt: job.timestamp
      }
    });
  } catch (error) {
    logger.error('Failed to create personalization job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/jobs/delayed
 * Create a delayed job
 */
router.post('/delayed', authenticateToken, async (req, res) => {
  try {
    const { jobType, data, delay, options } = req.body;
    
    if (!Object.values(JOB_TYPES).includes(jobType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job type'
      });
    }
    
    if (!delay || delay < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid delay'
      });
    }
    
    const job = await addDelayedJob(jobType, data, delay, options);
    
    res.status(201).json({
      success: true,
      data: {
        jobId: job.id,
        jobType,
        status: 'delayed',
        delay,
        createdAt: job.timestamp
      }
    });
  } catch (error) {
    logger.error('Failed to create delayed job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/jobs/recurring
 * Create a recurring job
 */
router.post('/recurring', authenticateToken, async (req, res) => {
  try {
    const { jobType, data, cronExpression, options } = req.body;
    
    if (!Object.values(JOB_TYPES).includes(jobType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job type'
      });
    }
    
    if (!cronExpression) {
      return res.status(400).json({
        success: false,
        error: 'Cron expression is required'
      });
    }
    
    const recurringJobId = await addRecurringJob(jobType, data, cronExpression, options);
    
    res.status(201).json({
      success: true,
      data: {
        recurringJobId,
        jobType,
        cronExpression,
        status: 'scheduled'
      }
    });
  } catch (error) {
    logger.error('Failed to create recurring job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/jobs/recurring/:recurringJobId
 * Remove a recurring job
 */
router.delete('/recurring/:recurringJobId', authenticateToken, async (req, res) => {
  try {
    const { recurringJobId } = req.params;
    
    const removed = await removeRecurringJob(recurringJobId);
    
    if (!removed) {
      return res.status(404).json({
        success: false,
        error: 'Recurring job not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        recurringJobId,
        status: 'removed'
      }
    });
  } catch (error) {
    logger.error('Failed to remove recurring job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/jobs/:jobType/:jobId
 * Get job details
 */
router.get('/:jobType/:jobId', authenticateToken, async (req, res) => {
  try {
    const { jobType, jobId } = req.params;
    
    if (!Object.values(JOB_TYPES).includes(jobType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job type'
      });
    }
    
    const job = await getJob(jobType, jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    const progress = await getJobProgress(jobId);
    const result = await getCachedJobResult(jobId);
    
    res.json({
      success: true,
      data: {
        jobId: job.id,
        jobType,
        status: await job.getState(),
        progress,
        data: job.data,
        result,
        createdAt: job.timestamp,
        processedAt: job.processedOn,
        finishedAt: job.finishedOn,
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts
      }
    });
  } catch (error) {
    logger.error('Failed to get job details:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/jobs/:jobType/:jobId/progress
 * Get job progress
 */
router.get('/:jobType/:jobId/progress', authenticateToken, async (req, res) => {
  try {
    const { jobType, jobId } = req.params;
    
    if (!Object.values(JOB_TYPES).includes(jobType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job type'
      });
    }
    
    const progress = await getJobProgress(jobId);
    
    res.json({
      success: true,
      data: {
        jobId,
        jobType,
        progress
      }
    });
  } catch (error) {
    logger.error('Failed to get job progress:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/jobs/:jobType/:jobId/result
 * Get job result
 */
router.get('/:jobType/:jobId/result', authenticateToken, async (req, res) => {
  try {
    const { jobType, jobId } = req.params;
    
    if (!Object.values(JOB_TYPES).includes(jobType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job type'
      });
    }
    
    const result = await getCachedJobResult(jobId);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Job result not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        jobId,
        jobType,
        result
      }
    });
  } catch (error) {
    logger.error('Failed to get job result:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/jobs/:jobType/:jobId
 * Remove a job
 */
router.delete('/:jobType/:jobId', authenticateToken, async (req, res) => {
  try {
    const { jobType, jobId } = req.params;
    
    if (!Object.values(JOB_TYPES).includes(jobType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job type'
      });
    }
    
    const removed = await removeJob(jobType, jobId);
    
    if (!removed) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        jobId,
        jobType,
        status: 'removed'
      }
    });
  } catch (error) {
    logger.error('Failed to remove job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/jobs/:jobType/:jobId/retry
 * Retry a failed job
 */
router.post('/:jobType/:jobId/retry', authenticateToken, async (req, res) => {
  try {
    const { jobType, jobId } = req.params;
    
    if (!Object.values(JOB_TYPES).includes(jobType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job type'
      });
    }
    
    const retried = await retryJob(jobType, jobId);
    
    if (!retried) {
      return res.status(404).json({
        success: false,
        error: 'Job not found or not failed'
      });
    }
    
    res.json({
      success: true,
      data: {
        jobId,
        jobType,
        status: 'retried'
      }
    });
  } catch (error) {
    logger.error('Failed to retry job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/jobs/user/:userId/history
 * Get user job history
 */
router.get('/user/:userId/history', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0, status, jobType } = req.query;
    
    const history = await getUserJobHistory(userId, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      status,
      jobType
    });
    
    res.json({
      success: true,
      data: {
        userId,
        history,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: history.length
        }
      }
    });
  } catch (error) {
    logger.error('Failed to get user job history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/jobs/stats
 * Get job statistics
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await getJobStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get job statistics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/jobs/queues/stats
 * Get queue statistics
 */
router.get('/queues/stats', authenticateToken, async (req, res) => {
  try {
    const { jobType } = req.query;
    
    const stats = await getQueueStats(jobType);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get queue statistics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/jobs/health
 * Get queue health status
 */
router.get('/health', authenticateToken, async (req, res) => {
  try {
    const health = await getQueueHealth();
    
    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error('Failed to get queue health:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/jobs/performance
 * Get performance metrics
 */
router.get('/performance', authenticateToken, async (req, res) => {
  try {
    const metrics = await getPerformanceMetrics();
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    logger.error('Failed to get performance metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/jobs/queues/:jobType/pause
 * Pause queue
 */
router.post('/queues/:jobType/pause', authenticateToken, async (req, res) => {
  try {
    const { jobType } = req.params;
    const { priority } = req.body;
    
    if (!Object.values(JOB_TYPES).includes(jobType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job type'
      });
    }
    
    await pauseQueue(jobType, priority);
    
    res.json({
      success: true,
      data: {
        jobType,
        priority,
        status: 'paused'
      }
    });
  } catch (error) {
    logger.error('Failed to pause queue:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/jobs/queues/:jobType/resume
 * Resume queue
 */
router.post('/queues/:jobType/resume', authenticateToken, async (req, res) => {
  try {
    const { jobType } = req.params;
    const { priority } = req.body;
    
    if (!Object.values(JOB_TYPES).includes(jobType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job type'
      });
    }
    
    await resumeQueue(jobType, priority);
    
    res.json({
      success: true,
      data: {
        jobType,
        priority,
        status: 'resumed'
      }
    });
  } catch (error) {
    logger.error('Failed to resume queue:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/jobs/queues/:jobType/clear
 * Clear queue
 */
router.delete('/queues/:jobType/clear', authenticateToken, async (req, res) => {
  try {
    const { jobType } = req.params;
    const { priority } = req.body;
    
    if (!Object.values(JOB_TYPES).includes(jobType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job type'
      });
    }
    
    await clearQueue(jobType, priority);
    
    res.json({
      success: true,
      data: {
        jobType,
        priority,
        status: 'cleared'
      }
    });
  } catch (error) {
    logger.error('Failed to clear queue:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/jobs/types
 * Get available job types
 */
router.get('/types', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        jobTypes: Object.values(JOB_TYPES),
        subscriptionPriorities: SUBSCRIPTION_PRIORITY
      }
    });
  } catch (error) {
    logger.error('Failed to get job types:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
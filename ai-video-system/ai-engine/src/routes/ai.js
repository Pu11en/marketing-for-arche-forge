const express = require('express');
const router = express.Router();
const videoGenerationService = require('../services/videoGeneration');
const worldBuildingService = require('../services/worldBuilding');
const personalizationService = require('../services/personalization');
const contentAnalysisService = require('../services/contentAnalysis');
const { addJob } = require('../services/jobQueue');
const logger = require('../utils/logger');

/**
 * Generate video from text prompt
 * POST /api/ai/generate/video
 */
router.post('/generate/video', async (req, res) => {
  try {
    const { prompt, settings = {}, userId, projectId } = req.body;
    
    // Validate required fields
    if (!prompt) {
      return res.status(400).json({
        status: 'error',
        message: 'Prompt is required',
        error: {
          code: 'MISSING_PROMPT',
          field: 'prompt'
        }
      });
    }
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required',
        error: {
          code: 'MISSING_USER_ID',
          field: 'userId'
        }
      });
    }
    
    // Add job to queue
    const job = await addJob('video-generation', {
      prompt,
      settings,
      userId,
      projectId
    });
    
    logger.info('Video generation job queued', {
      jobId: job.id,
      userId,
      projectId
    });
    
    res.status(202).json({
      status: 'success',
      message: 'Video generation job queued successfully',
      data: {
        jobId: job.id,
        status: 'queued',
        estimatedTime: '5-10 minutes'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  } catch (error) {
    logger.error('Video generation request failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to queue video generation job',
      error: {
        code: 'GENERATION_FAILED',
        details: error.message
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  }
});

/**
 * Get video generation job status
 * GET /api/ai/generate/status/:jobId
 */
router.get('/generate/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    if (!jobId) {
      return res.status(400).json({
        status: 'error',
        message: 'Job ID is required',
        error: {
          code: 'MISSING_JOB_ID',
          field: 'jobId'
        }
      });
    }
    
    // Get job status
    const jobStatus = await videoGenerationService.getJobStatus(jobId);
    
    if (!jobStatus) {
      return res.status(404).json({
        status: 'error',
        message: 'Job not found',
        error: {
          code: 'JOB_NOT_FOUND',
          details: `No job found with ID: ${jobId}`
        }
      });
    }
    
    res.json({
      status: 'success',
      message: 'Job status retrieved successfully',
      data: {
        jobId: jobStatus.id,
        status: jobStatus.status,
        progress: jobStatus.progress,
        resultUrl: jobStatus.result_url,
        errorMessage: jobStatus.error_message,
        createdAt: jobStatus.created_at,
        startedAt: jobStatus.started_at,
        completedAt: jobStatus.completed_at
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  } catch (error) {
    logger.error('Get job status failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve job status',
      error: {
        code: 'STATUS_RETRIEVAL_FAILED',
        details: error.message
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  }
});

/**
 * Cancel video generation job
 * DELETE /api/ai/generate/status/:jobId
 */
router.delete('/generate/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    if (!jobId) {
      return res.status(400).json({
        status: 'error',
        message: 'Job ID is required',
        error: {
          code: 'MISSING_JOB_ID',
          field: 'jobId'
        }
      });
    }
    
    // Cancel job
    const success = await videoGenerationService.cancelJob(jobId);
    
    if (!success) {
      return res.status(404).json({
        status: 'error',
        message: 'Job not found or cannot be cancelled',
        error: {
          code: 'JOB_NOT_CANCELLABLE',
          details: `Job ${jobId} cannot be cancelled`
        }
      });
    }
    
    res.json({
      status: 'success',
      message: 'Job cancelled successfully',
      data: {
        jobId,
        status: 'cancelled'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  } catch (error) {
    logger.error('Cancel job failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to cancel job',
      error: {
        code: 'CANCELLATION_FAILED',
        details: error.message
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  }
});

/**
 * Generate 3D world
 * POST /api/ai/generate/world
 */
router.post('/generate/world', async (req, res) => {
  try {
    const { description, settings = {}, userId, projectId } = req.body;
    
    // Validate required fields
    if (!description) {
      return res.status(400).json({
        status: 'error',
        message: 'World description is required',
        error: {
          code: 'MISSING_DESCRIPTION',
          field: 'description'
        }
      });
    }
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required',
        error: {
          code: 'MISSING_USER_ID',
          field: 'userId'
        }
      });
    }
    
    // Add job to queue
    const job = await addJob('world-building', {
      description,
      settings,
      userId,
      projectId
    });
    
    logger.info('World building job queued', {
      jobId: job.id,
      userId,
      projectId
    });
    
    res.status(202).json({
      status: 'success',
      message: 'World building job queued successfully',
      data: {
        jobId: job.id,
        status: 'queued',
        estimatedTime: '3-8 minutes'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  } catch (error) {
    logger.error('World building request failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to queue world building job',
      error: {
        code: 'WORLD_BUILDING_FAILED',
        details: error.message
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  }
});

/**
 * Analyze content
 * POST /api/ai/analyze/content
 */
router.post('/analyze/content', async (req, res) => {
  try {
    const { contentType, contentUrl, contentData, settings = {}, userId, projectId } = req.body;
    
    // Validate required fields
    if (!contentType) {
      return res.status(400).json({
        status: 'error',
        message: 'Content type is required',
        error: {
          code: 'MISSING_CONTENT_TYPE',
          field: 'contentType'
        }
      });
    }
    
    if (!contentUrl && !contentData) {
      return res.status(400).json({
        status: 'error',
        message: 'Either content URL or content data is required',
        error: {
          code: 'MISSING_CONTENT',
          field: 'contentUrl/contentData'
        }
      });
    }
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required',
        error: {
          code: 'MISSING_USER_ID',
          field: 'userId'
        }
      });
    }
    
    // Validate content type
    const validTypes = ['image', 'video', 'text', 'audio'];
    if (!validTypes.includes(contentType)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid content type',
        error: {
          code: 'INVALID_CONTENT_TYPE',
          details: `Valid types: ${validTypes.join(', ')}`
        }
      });
    }
    
    // Add job to queue
    const job = await addJob('content-analysis', {
      contentType,
      contentUrl,
      contentData,
      settings,
      userId,
      projectId
    });
    
    logger.info('Content analysis job queued', {
      jobId: job.id,
      contentType,
      userId,
      projectId
    });
    
    res.status(202).json({
      status: 'success',
      message: 'Content analysis job queued successfully',
      data: {
        jobId: job.id,
        status: 'queued',
        estimatedTime: '1-5 minutes'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  } catch (error) {
    logger.error('Content analysis request failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to queue content analysis job',
      error: {
        code: 'ANALYSIS_FAILED',
        details: error.message
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  }
});

/**
 * Get personalized recommendations
 * POST /api/ai/personalize/recommendations
 */
router.post('/personalize/recommendations', async (req, res) => {
  try {
    const { userId, context = 'video_creation' } = req.body;
    
    // Validate required fields
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required',
        error: {
          code: 'MISSING_USER_ID',
          field: 'userId'
        }
      });
    }
    
    // Get personalized recommendations
    const recommendations = await personalizationService.getPersonalizedRecommendations(userId, context);
    
    res.json({
      status: 'success',
      message: 'Personalized recommendations retrieved successfully',
      data: {
        recommendations,
        context,
        userId
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  } catch (error) {
    logger.error('Get recommendations failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve personalized recommendations',
      error: {
        code: 'RECOMMENDATIONS_FAILED',
        details: error.message
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  }
});

/**
 * Learn user preferences
 * POST /api/ai/personalize/learn
 */
router.post('/personalize/learn', async (req, res) => {
  try {
    const { userId, behaviorData } = req.body;
    
    // Validate required fields
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required',
        error: {
          code: 'MISSING_USER_ID',
          field: 'userId'
        }
      });
    }
    
    if (!behaviorData) {
      return res.status(400).json({
        status: 'error',
        message: 'Behavior data is required',
        error: {
          code: 'MISSING_BEHAVIOR_DATA',
          field: 'behaviorData'
        }
      });
    }
    
    // Learn user preferences
    const userProfile = await personalizationService.learnUserPreferences(userId, behaviorData);
    
    res.json({
      status: 'success',
      message: 'User preferences learned successfully',
      data: {
        userProfile,
        updatedFields: Object.keys(behaviorData)
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  } catch (error) {
    logger.error('Learn preferences failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to learn user preferences',
      error: {
        code: 'LEARNING_FAILED',
        details: error.message
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  }
});

/**
 * Get available AI models
 * GET /api/ai/models
 */
router.get('/models', async (req, res) => {
  try {
    const models = {
      textGeneration: [
        {
          id: 'gpt-4',
          name: 'GPT-4',
          provider: 'OpenAI',
          capabilities: ['text', 'code', 'analysis'],
          maxTokens: 8192,
          cost: '0.03/1K tokens'
        },
        {
          id: 'gpt-3.5-turbo',
          name: 'GPT-3.5 Turbo',
          provider: 'OpenAI',
          capabilities: ['text', 'code'],
          maxTokens: 4096,
          cost: '0.002/1K tokens'
        }
      ],
      imageGeneration: [
        {
          id: 'dall-e-3',
          name: 'DALL-E 3',
          provider: 'OpenAI',
          capabilities: ['image', 'editing'],
          maxResolution: '1024x1024',
          cost: '0.04/image'
        },
        {
          id: 'stable-diffusion-xl',
          name: 'Stable Diffusion XL',
          provider: 'Stability AI',
          capabilities: ['image', 'editing'],
          maxResolution: '1024x1024',
          cost: '0.02/image'
        }
      ],
      voiceSynthesis: [
        {
          id: 'eleven-multilingual-v2',
          name: 'Eleven Multilingual v2',
          provider: 'ElevenLabs',
          capabilities: ['speech', 'cloning'],
          languages: 29,
          cost: '0.30/1K characters'
        }
      ],
      videoGeneration: [
        {
          id: 'replicate-video',
          name: 'Replicate Video',
          provider: 'Replicate',
          capabilities: ['video', 'animation'],
          maxDuration: '10 seconds',
          cost: '0.05/second'
        }
      ]
    };
    
    res.json({
      status: 'success',
      message: 'AI models retrieved successfully',
      data: models,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  } catch (error) {
    logger.error('Get models failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve AI models',
      error: {
        code: 'MODELS_RETRIEVAL_FAILED',
        details: error.message
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  }
});

/**
 * Get AI engine health status
 * GET /api/ai/health
 */
router.get('/health', async (req, res) => {
  try {
    const { getHealthStatus: getDbHealth } = require('../database/connection');
    const { getHealthStatus: getRedisHealth } = require('../services/redis');
    const { getAllQueueStats } = require('../services/jobQueue');
    const { getWorkerStats } = require('../services/workerPool');
    
    // Get health status of all components
    const [dbHealth, redisHealth, queueStats, workerStats] = await Promise.all([
      getDbHealth(),
      getRedisHealth(),
      getAllQueueStats(),
      getWorkerStats()
    ]);
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      components: {
        database: dbHealth,
        redis: redisHealth,
        queues: queueStats,
        workers: workerStats
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: '1.0.0'
    };
    
    // Determine overall health
    if (dbHealth.status !== 'connected' || redisHealth.status !== 'connected') {
      health.status = 'degraded';
    }
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json({
      status: 'success',
      message: `AI Engine is ${health.status}`,
      data: health,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: {
        code: 'HEALTH_CHECK_FAILED',
        details: error.message
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  }
});

module.exports = router;
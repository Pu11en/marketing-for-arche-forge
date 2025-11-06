const Joi = require('joi');
const logger = require('../utils/logger');

/**
 * Validation middleware for API requests
 * Uses Joi schemas to validate request bodies
 */

/**
 * Validate request using Joi schema
 * @param {Object} schema - Joi validation schema
 * @returns {Function} Express middleware function
 */
const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: true
    });

    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');
      
      logger.warn('Validation error:', {
        url: req.url,
        method: req.method,
        body: req.body,
        error: errorMessage
      });
      
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    // Replace request body with validated and sanitized data
    req.body = value;
    next();
  };
};

/**
 * Validate query parameters
 * @param {Object} schema - Joi validation schema
 * @returns {Function} Express middleware function
 */
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: true
    });

    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');
      
      logger.warn('Query validation error:', {
        url: req.url,
        method: req.method,
        query: req.query,
        error: errorMessage
      });
      
      return res.status(400).json({
        success: false,
        error: 'Query validation failed',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    // Replace request query with validated and sanitized data
    req.query = value;
    next();
  };
};

/**
 * Validate URL parameters
 * @param {Object} schema - Joi validation schema
 * @returns {Function} Express middleware function
 */
const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: true
    });

    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');
      
      logger.warn('Params validation error:', {
        url: req.url,
        method: req.method,
        params: req.params,
        error: errorMessage
      });
      
      return res.status(400).json({
        success: false,
        error: 'Parameter validation failed',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    // Replace request params with validated and sanitized data
    req.params = value;
    next();
  };
};

// Common validation schemas
const commonSchemas = {
  // UUID validation
  uuid: Joi.string().uuid().required(),
  
  // Optional UUID
  optionalUuid: Joi.string().uuid().optional(),
  
  // Pagination
  pagination: {
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0)
  },
  
  // Job status
  jobStatus: Joi.string().valid(
    'queued',
    'waiting',
    'active',
    'completed',
    'failed',
    'delayed',
    'paused',
    'stuck',
    'cancelled'
  ).optional(),
  
  // Priority levels
  priority: Joi.string().valid('high', 'normal', 'low').optional(),
  
  // Subscription levels
  subscription: Joi.string().valid('free', 'basic', 'pro', 'enterprise').optional(),
  
  // Date range
  dateRange: {
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).optional()
  }
};

// Job-specific validation schemas
const jobSchemas = {
  // Video generation job
  videoGeneration: Joi.object({
    userId: commonSchemas.uuid,
    projectId: commonSchemas.uuid,
    prompt: Joi.string().min(1).max(1000).required(),
    script: Joi.object().optional(),
    scenes: Joi.array().items(Joi.object()).optional(),
    settings: Joi.object({
      style: Joi.string().optional(),
      duration: Joi.number().integer().min(1).max(300).optional(),
      tone: Joi.string().optional(),
      voiceId: Joi.string().optional(),
      imageModel: Joi.string().valid('stable-diffusion', 'dall-e').optional(),
      visualStyle: Joi.string().optional(),
      transitionType: Joi.string().optional(),
      quality: Joi.string().valid('low', 'medium', 'high').optional(),
      resolution: Joi.string().valid('720p', '1080p', '4k').optional()
    }).optional(),
    priority: commonSchemas.priority,
    userSubscription: commonSchemas.subscription
  }),
  
  // Script generation job
  scriptGeneration: Joi.object({
    userId: commonSchemas.uuid,
    projectId: commonSchemas.uuid,
    prompt: Joi.string().min(1).max(2000).required(),
    options: Joi.object({
      model: Joi.string().optional(),
      maxTokens: Joi.number().integer().min(1).max(4000).optional(),
      temperature: Joi.number().min(0).max(2).optional(),
      systemPrompt: Joi.string().optional(),
      style: Joi.string().optional(),
      duration: Joi.number().integer().min(1).max(300).optional(),
      tone: Joi.string().optional()
    }).optional(),
    priority: commonSchemas.priority,
    userSubscription: commonSchemas.subscription
  }),
  
  // Scene creation job
  sceneCreation: Joi.object({
    userId: commonSchemas.uuid,
    projectId: commonSchemas.uuid,
    scene: Joi.object().required(),
    script: Joi.string().min(1).max(5000).required(),
    options: Joi.object({
      width: Joi.number().integer().min(256).max(2048).optional(),
      height: Joi.number().integer().min(256).max(2048).optional(),
      steps: Joi.number().integer().min(10).max(100).optional(),
      cfgScale: Joi.number().min(1).max(20).optional(),
      stylePreset: Joi.string().optional(),
      includeAudio: Joi.boolean().optional(),
      voiceId: Joi.string().optional(),
      modelId: Joi.string().optional(),
      voiceSettings: Joi.object().optional()
    }).optional(),
    priority: commonSchemas.priority,
    userSubscription: commonSchemas.subscription
  }),
  
  // Audio synthesis job
  audioSynthesis: Joi.object({
    userId: commonSchemas.uuid,
    projectId: commonSchemas.uuid,
    text: Joi.string().min(1).max(5000).required(),
    options: Joi.object({
      voiceId: Joi.string().optional(),
      modelId: Joi.string().optional(),
      voiceSettings: Joi.object({
        stability: Joi.number().min(0).max(1).optional(),
        similarity_boost: Joi.number().min(0).max(1).optional(),
        style: Joi.number().min(0).max(1).optional(),
        use_speaker_boost: Joi.boolean().optional()
      }).optional()
    }).optional(),
    priority: commonSchemas.priority,
    userSubscription: commonSchemas.subscription
  }),
  
  // Image generation job
  imageGeneration: Joi.object({
    userId: commonSchemas.uuid,
    projectId: commonSchemas.uuid,
    prompt: Joi.string().min(1).max(1000).required(),
    options: Joi.object({
      negativePrompt: Joi.string().max(1000).optional(),
      width: Joi.number().integer().min(256).max(2048).optional(),
      height: Joi.number().integer().min(256).max(2048).optional(),
      samples: Joi.number().integer().min(1).max(10).optional(),
      steps: Joi.number().integer().min(10).max(100).optional(),
      cfgScale: Joi.number().min(1).max(20).optional(),
      stylePreset: Joi.string().optional(),
      quality: Joi.string().valid('standard', 'hd').optional(),
      style: Joi.string().valid('natural', 'vivid').optional(),
      size: Joi.string().valid('256x256', '512x512', '1024x1024', '1792x1024', '1024x1792').optional()
    }).optional(),
    priority: commonSchemas.priority,
    userSubscription: commonSchemas.subscription
  }),
  
  // World building job
  worldBuilding: Joi.object({
    userId: commonSchemas.uuid,
    projectId: commonSchemas.uuid,
    concept: Joi.string().min(1).max(1000).required(),
    options: Joi.object({
      width: Joi.number().integer().min(256).max(2048).optional(),
      height: Joi.number().integer().min(256).max(2048).optional(),
      steps: Joi.number().integer().min(10).max(100).optional(),
      cfgScale: Joi.number().min(1).max(20).optional(),
      stylePreset: Joi.string().optional()
    }).optional(),
    priority: commonSchemas.priority,
    userSubscription: commonSchemas.subscription
  }),
  
  // Content analysis job
  contentAnalysis: Joi.object({
    userId: commonSchemas.uuid,
    projectId: commonSchemas.uuid,
    content: Joi.string().min(1).max(10000).required(),
    type: Joi.string().valid('script', 'image', 'video', 'text').required(),
    options: Joi.object({
      extractScenes: Joi.boolean().optional(),
      extractTiming: Joi.boolean().optional(),
      extractVisuals: Joi.boolean().optional(),
      prompt: Joi.string().max(1000).optional(),
      maxTokens: Joi.number().integer().min(1).max(4000).optional(),
      temperature: Joi.number().min(0).max(2).optional()
    }).optional(),
    priority: commonSchemas.priority,
    userSubscription: commonSchemas.subscription
  }),
  
  // Video composition job
  videoComposition: Joi.object({
    userId: commonSchemas.uuid,
    projectId: commonSchemas.uuid,
    scenes: Joi.array().items(Joi.object()).min(1).required(),
    script: Joi.object().required(),
    options: Joi.object({
      outputFormat: Joi.string().valid('mp4', 'webm', 'avi').optional(),
      quality: Joi.string().valid('low', 'medium', 'high').optional(),
      resolution: Joi.string().valid('720p', '1080p', '4k').optional(),
      frameRate: Joi.number().integer().min(24).max(60).optional(),
      bitrate: Joi.number().integer().min(1000).max(50000).optional()
    }).optional(),
    priority: commonSchemas.priority,
    userSubscription: commonSchemas.subscription
  }),
  
  // Personalization job
  personalization: Joi.object({
    userId: commonSchemas.uuid,
    projectId: commonSchemas.uuid,
    content: Joi.object().required(),
    personalization: Joi.object().required(),
    options: Joi.object({
      intensity: Joi.number().min(0).max(1).optional(),
      preserveOriginal: Joi.boolean().optional(),
      aspects: Joi.array().items(Joi.string()).optional()
    }).optional(),
    priority: commonSchemas.priority,
    userSubscription: commonSchemas.subscription
  }),
  
  // Delayed job
  delayedJob: Joi.object({
    jobType: Joi.string().valid(
      'video-generation',
      'script-generation',
      'scene-creation',
      'audio-synthesis',
      'image-generation',
      'world-building',
      'content-analysis',
      'video-composition',
      'personalization',
      'ai-processing'
    ).required(),
    data: Joi.object().required(),
    delay: Joi.number().integer().min(0).max(86400000).required(), // Max 24 hours
    options: Joi.object().optional()
  }),
  
  // Recurring job
  recurringJob: Joi.object({
    jobType: Joi.string().valid(
      'video-generation',
      'script-generation',
      'scene-creation',
      'audio-synthesis',
      'image-generation',
      'world-building',
      'content-analysis',
      'video-composition',
      'personalization',
      'ai-processing'
    ).required(),
    data: Joi.object().required(),
    cronExpression: Joi.string().required(),
    options: Joi.object().optional()
  })
};

// Query parameter schemas
const querySchemas = {
  // Pagination with optional filters
  paginationWithFilters: Joi.object({
    ...commonSchemas.pagination,
    status: commonSchemas.jobStatus,
    jobType: Joi.string().valid(
      'video-generation',
      'script-generation',
      'scene-creation',
      'audio-synthesis',
      'image-generation',
      'world-building',
      'content-analysis',
      'video-composition',
      'personalization',
      'ai-processing'
    ).optional(),
    priority: commonSchemas.priority,
    userSubscription: commonSchemas.subscription,
    ...commonSchemas.dateRange
  }),
  
  // Job history query
  jobHistory: Joi.object({
    ...commonSchemas.pagination,
    status: commonSchemas.jobStatus,
    jobType: Joi.string().optional(),
    ...commonSchemas.dateRange
  })
};

// Parameter schemas
const paramSchemas = {
  // UUID parameter
  uuid: Joi.object({
    id: commonSchemas.uuid
  }),
  
  // Job type and ID
  jobTypeAndId: Joi.object({
    jobType: Joi.string().valid(
      'video-generation',
      'script-generation',
      'scene-creation',
      'audio-synthesis',
      'image-generation',
      'world-building',
      'content-analysis',
      'video-composition',
      'personalization',
      'ai-processing'
    ).required(),
    jobId: commonSchemas.uuid
  }),
  
  // User ID
  userId: Joi.object({
    userId: commonSchemas.uuid
  }),
  
  // Queue management
  queueManagement: Joi.object({
    jobType: Joi.string().valid(
      'video-generation',
      'script-generation',
      'scene-creation',
      'audio-synthesis',
      'image-generation',
      'world-building',
      'content-analysis',
      'video-composition',
      'personalization',
      'ai-processing'
    ).required()
  })
};

module.exports = {
  validateRequest,
  validateQuery,
  validateParams,
  commonSchemas,
  jobSchemas,
  querySchemas,
  paramSchemas
};
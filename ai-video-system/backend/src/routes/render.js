const express = require('express');
const { body, validationResult } = require('express-validator');
const { query: dbQuery, transaction } = require('../database/connection');
const { catchAsync, ValidationError, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');
const { createRateLimit, requireProjectAccess, requireCredits } = require('../middleware/auth');
const { cache, queue } = require('../services/redis');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Rate limiting for render job creation
const renderCreateRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each user to 10 render jobs per hour
  message: 'Too many render jobs created, please try again later.'
});

// Validation rules
const createRenderJobValidation = [
  body('settings').isObject().withMessage('Settings must be an object'),
  body('settings.resolution').optional().isIn(['720p', '1080p', '4k']).withMessage('Invalid resolution'),
  body('settings.fps').optional().isInt({ min: 24, max: 60 }).withMessage('FPS must be between 24 and 60'),
  body('settings.format').optional().isIn(['mp4', 'webm', 'gif']).withMessage('Invalid format'),
  body('settings.quality').optional().isIn(['low', 'medium', 'high', 'ultra']).withMessage('Invalid quality'),
  body('settings.duration').optional().isInt({ min: 1, max: 600 }).withMessage('Duration must be between 1 and 600 seconds')
];

// Create a new render job
router.post('/:projectId', requireProjectAccess, requireCredits(10), renderCreateRateLimit, createRenderJobValidation, catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const projectId = req.params.projectId;
  const userId = req.user.id;
  const { settings } = req.body;

  // Check if user has permission to render
  if (req.projectAccess.role === 'viewer') {
    throw new ForbiddenError('You do not have permission to render this project');
  }

  // Check if there's already a render job in progress for this project
  const existingJob = await dbQuery(
    'SELECT id FROM render_jobs WHERE project_id = $1 AND status IN ($2, $3)',
    [projectId, 'queued', 'processing']
  );

  if (existingJob.rows.length > 0) {
    throw new ValidationError('A render job is already in progress for this project');
  }

  // Get project details
  const projectResult = await dbQuery(
    'SELECT title, settings FROM projects WHERE id = $1',
    [projectId]
  );

  if (projectResult.rows.length === 0) {
    throw new NotFoundError('Project');
  }

  const project = projectResult.rows[0];

  // Create render job
  const result = await transaction(async (client) => {
    // Create render job record
    const jobResult = await client.query(`
      INSERT INTO render_jobs (project_id, user_id, status, settings)
      VALUES ($1, $2, 'queued', $3)
      RETURNING id, project_id, user_id, status, settings, created_at
    `, [projectId, userId, settings]);

    const job = jobResult.rows[0];

    // Deduct credits from user
    await client.query(
      'UPDATE users SET credits_remaining = credits_remaining - 10 WHERE id = $1',
      [userId]
    );

    // Log usage
    await client.query(`
      INSERT INTO usage_logs (user_id, resource_type, resource_amount, metadata)
      VALUES ($1, 'video_generation', 10, $2)
    `, [userId, JSON.stringify({ renderJobId: job.id, projectId })]);

    return job;
  });

  const renderJob = result;

  // Add job to render queue
  await queue.add('render', {
    jobId: renderJob.id,
    projectId,
    userId,
    settings,
    projectTitle: project.title,
    projectSettings: project.settings
  }, {
    delay: 0,
    priority: 'normal'
  });

  // Log render job creation
  logger.logUserActivity(userId, 'render_job_created', {
    renderJobId: renderJob.id,
    projectId,
    settings,
    ip: req.ip
  });

  // Clear cache
  await cache.del(`project_renders:${projectId}:${userId}`);

  res.status(201).json({
    status: 'success',
    message: 'Render job created successfully',
    data: {
      renderJob
    }
  });
}));

// Get all render jobs for a user
router.get('/', catchAsync(async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const status = req.query.status;
  const projectId = req.query.project_id;

  // Build query conditions
  let whereConditions = ['rj.user_id = $1'];
  let queryParams = [userId];
  let paramIndex = 2;

  if (status) {
    whereConditions.push(`rj.status = $${paramIndex++}`);
    queryParams.push(status);
  }

  if (projectId) {
    whereConditions.push(`rj.project_id = $${paramIndex++}`);
    queryParams.push(projectId);
  }

  // Get render jobs with project info
  const result = await dbQuery(`
    SELECT 
      rj.id, rj.project_id, rj.status, rj.progress, rj.settings, 
      rj.result_url, rj.error_message, rj.started_at, rj.completed_at, rj.created_at,
      p.title as project_title, p.thumbnail_url as project_thumbnail
    FROM render_jobs rj
    JOIN projects p ON rj.project_id = p.id
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY rj.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `, [...queryParams, limit, offset]);

  // Get total count for pagination
  const countResult = await dbQuery(`
    SELECT COUNT(*) as total
    FROM render_jobs rj
    WHERE ${whereConditions.join(' AND ')}
  `, queryParams);

  const total = parseInt(countResult.rows[0].total);
  const totalPages = Math.ceil(total / limit);

  res.json({
    status: 'success',
    data: {
      renderJobs: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  });
}));

// Get a specific render job
router.get('/:id', catchAsync(async (req, res) => {
  const renderJobId = req.params.id;
  const userId = req.user.id;

  // Get render job with project info
  const result = await dbQuery(`
    SELECT 
      rj.id, rj.project_id, rj.user_id, rj.status, rj.progress, rj.settings, 
      rj.result_url, rj.error_message, rj.started_at, rj.completed_at, rj.created_at,
      p.title as project_title, p.thumbnail_url as project_thumbnail,
      c.role as user_role
    FROM render_jobs rj
    JOIN projects p ON rj.project_id = p.id
    LEFT JOIN collaborations c ON rj.project_id = c.project_id AND c.user_id = $1
    WHERE rj.id = $2 AND (rj.user_id = $1 OR c.user_id IS NOT NULL)
  `, [userId, renderJobId]);

  if (result.rows.length === 0) {
    throw new NotFoundError('Render job');
  }

  const renderJob = result.rows[0];

  res.json({
    status: 'success',
    data: {
      renderJob
    }
  });
}));

// Cancel a render job
router.post('/:id/cancel', catchAsync(async (req, res) => {
  const renderJobId = req.params.id;
  const userId = req.user.id;

  // Get render job
  const jobResult = await dbQuery(
    'SELECT user_id, status FROM render_jobs WHERE id = $1',
    [renderJobId]
  );

  if (jobResult.rows.length === 0) {
    throw new NotFoundError('Render job');
  }

  const job = jobResult.rows[0];

  if (job.user_id !== userId) {
    throw new ForbiddenError('You can only cancel your own render jobs');
  }

  if (job.status !== 'queued' && job.status !== 'processing') {
    throw new ValidationError('Cannot cancel a render job that is not in progress');
  }

  // Update render job status
  const result = await dbQuery(`
    UPDATE render_jobs 
    SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING id, status, completed_at
  `, [renderJobId]);

  // Refund credits
  await dbQuery(
    'UPDATE users SET credits_remaining = credits_remaining + 10 WHERE id = $1',
    [userId]
  );

  // Log refund
  await dbQuery(`
    INSERT INTO usage_logs (user_id, resource_type, resource_amount, metadata)
    VALUES ($1, 'video_generation', -10, $2)
  `, [userId, JSON.stringify({ renderJobId, refund: true })]);

  // Log cancellation
  logger.logUserActivity(userId, 'render_job_cancelled', {
    renderJobId,
    ip: req.ip
  });

  // Clear cache
  await cache.del(`render_job:${renderJobId}:${userId}`);

  res.json({
    status: 'success',
    message: 'Render job cancelled successfully',
    data: {
      renderJob: result.rows[0]
    }
  });
}));

// Retry a failed render job
router.post('/:id/retry', requireCredits(10), catchAsync(async (req, res) => {
  const renderJobId = req.params.id;
  const userId = req.user.id;

  // Get render job
  const jobResult = await dbQuery(`
    SELECT rj.id, rj.project_id, rj.user_id, rj.status, rj.settings, rj.error_message,
           p.title as project_title, p.settings as project_settings
    FROM render_jobs rj
    JOIN projects p ON rj.project_id = p.id
    WHERE rj.id = $1
  `, [renderJobId]);

  if (jobResult.rows.length === 0) {
    throw new NotFoundError('Render job');
  }

  const job = jobResult.rows[0];

  if (job.user_id !== userId) {
    throw new ForbiddenError('You can only retry your own render jobs');
  }

  if (job.status !== 'failed') {
    throw new ValidationError('Can only retry failed render jobs');
  }

  // Create new render job
  const result = await transaction(async (client) => {
    // Create new render job record
    const newJobResult = await client.query(`
      INSERT INTO render_jobs (project_id, user_id, status, settings)
      VALUES ($1, $2, 'queued', $3)
      RETURNING id, project_id, user_id, status, settings, created_at
    `, [job.project_id, userId, job.settings]);

    const newJob = newJobResult.rows[0];

    // Log usage
    await client.query(`
      INSERT INTO usage_logs (user_id, resource_type, resource_amount, metadata)
      VALUES ($1, 'video_generation', 10, $2)
    `, [userId, JSON.stringify({ renderJobId: newJob.id, projectId: job.project_id, retry: true })]);

    return newJob;
  });

  const newRenderJob = result;

  // Add job to render queue
  await queue.add('render', {
    jobId: newRenderJob.id,
    projectId: job.project_id,
    userId,
    settings: job.settings,
    projectTitle: job.project_title,
    projectSettings: job.project_settings,
    retryOf: renderJobId
  }, {
    delay: 0,
    priority: 'normal'
  });

  // Log retry
  logger.logUserActivity(userId, 'render_job_retried', {
    originalRenderJobId: renderJobId,
    newRenderJobId: newRenderJob.id,
    projectId: job.project_id,
    ip: req.ip
  });

  // Clear cache
  await cache.del(`render_job:${renderJobId}:${userId}`);

  res.status(201).json({
    status: 'success',
    message: 'Render job retry created successfully',
    data: {
      renderJob: newRenderJob
    }
  });
}));

// Get render job progress
router.get('/:id/progress', catchAsync(async (req, res) => {
  const renderJobId = req.params.id;
  const userId = req.user.id;

  // Try to get from cache first
  const cacheKey = `render_progress:${renderJobId}`;
  let progress = await cache.get(cacheKey);

  if (!progress) {
    // Get render job from database
    const result = await dbQuery(`
      SELECT status, progress, error_message, started_at, completed_at
      FROM render_jobs
      WHERE id = $1 AND user_id = $2
    `, [renderJobId, userId]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Render job');
    }

    progress = {
      status: result.rows[0].status,
      progress: result.rows[0].progress,
      error_message: result.rows[0].error_message,
      started_at: result.rows[0].started_at,
      completed_at: result.rows[0].completed_at
    };

    // Cache for 30 seconds
    await cache.set(cacheKey, progress, 30);
  }

  res.json({
    status: 'success',
    data: {
      progress
    }
  });
}));

// Get render queue status
router.get('/queue/status', catchAsync(async (req, res) => {
  const userId = req.user.id;

  // Get queue size
  const queueSize = await queue.getSize('render');

  // Get user's position in queue
  const userJobs = await dbQuery(`
    SELECT id, created_at, status
    FROM render_jobs
    WHERE user_id = $1 AND status IN ('queued', 'processing')
    ORDER BY created_at ASC
  `, [userId]);

  // Calculate estimated wait time (rough estimate)
  const avgRenderTime = 300; // 5 minutes average
  const estimatedWaitTime = userJobs.length > 0 ? (queueSize - userJobs.length + 1) * avgRenderTime : 0;

  res.json({
    status: 'success',
    data: {
      queueSize,
      userJobs: userJobs.length,
      estimatedWaitTime,
      userJobs: userJobs.map(job => ({
        id: job.id,
        status: job.status,
        createdAt: job.created_at
      }))
    }
  });
}));

module.exports = router;
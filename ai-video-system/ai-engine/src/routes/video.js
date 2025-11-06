const express = require('express');
const router = express.Router();
const videoGenerationService = require('../services/videoGeneration');
const { addJob, getJob } = require('../services/jobQueue');
const logger = require('../utils/logger');

/**
 * Generate video from text prompt
 * POST /api/video/generate
 */
router.post('/generate', async (req, res) => {
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
    
    // Validate prompt length
    if (prompt.length > 1000) {
      return res.status(400).json({
        status: 'error',
        message: 'Prompt too long (max 1000 characters)',
        error: {
          code: 'PROMPT_TOO_LONG',
          field: 'prompt'
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
      projectId,
      promptLength: prompt.length
    });
    
    res.status(202).json({
      status: 'success',
      message: 'Video generation job queued successfully',
      data: {
        jobId: job.id,
        status: 'queued',
        estimatedTime: estimateGenerationTime(settings),
        queuePosition: await getQueuePosition('video-generation')
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
 * GET /api/video/status/:jobId
 */
router.get('/status/:jobId', async (req, res) => {
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
    
    // Get queue position if still queued
    let queuePosition = null;
    if (jobStatus.status === 'queued') {
      queuePosition = await getQueuePosition('video-generation', jobId);
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
        completedAt: jobStatus.completed_at,
        queuePosition,
        estimatedTimeRemaining: estimateTimeRemaining(jobStatus)
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
 * DELETE /api/video/status/:jobId
 */
router.delete('/status/:jobId', async (req, res) => {
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
    
    // Check if job can be cancelled
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
    
    if (jobStatus.status === 'completed') {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot cancel completed job',
        error: {
          code: 'JOB_ALREADY_COMPLETED',
          details: 'Job has already completed'
        }
      });
    }
    
    if (jobStatus.status === 'processing') {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot cancel job that is currently processing',
        error: {
          code: 'JOB_ALREADY_PROCESSING',
          details: 'Job is currently being processed'
        }
      });
    }
    
    // Cancel job
    const success = await videoGenerationService.cancelJob(jobId);
    
    if (!success) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to cancel job',
        error: {
          code: 'CANCELLATION_FAILED',
          details: 'Job could not be cancelled'
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
 * Retry failed video generation job
 * POST /api/video/retry/:jobId
 */
router.post('/retry/:jobId', async (req, res) => {
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
    
    // Check if job can be retried
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
    
    if (jobStatus.status !== 'failed') {
      return res.status(400).json({
        status: 'error',
        message: 'Can only retry failed jobs',
        error: {
          code: 'JOB_NOT_FAILED',
          details: `Job status is: ${jobStatus.status}`
        }
      });
    }
    
    // Retry job
    const newJob = await videoGenerationService.retryJob(jobId);
    
    if (!newJob) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to retry job',
        error: {
          code: 'RETRY_FAILED',
          details: 'Job could not be retried'
        }
      });
    }
    
    logger.info('Video generation job retried', {
      originalJobId: jobId,
      newJobId: newJob.id
    });
    
    res.status(202).json({
      status: 'success',
      message: 'Job retry queued successfully',
      data: {
        originalJobId: jobId,
        newJobId: newJob.id,
        status: 'queued',
        estimatedTime: estimateGenerationTime(newJob.settings)
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  } catch (error) {
    logger.error('Retry job failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retry job',
      error: {
        code: 'RETRY_FAILED',
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
 * Get video generation queue status
 * GET /api/video/queue
 */
router.get('/queue', async (req, res) => {
  try {
    const { getQueueStats } = require('../services/jobQueue');
    const queueStats = await getQueueStats('video-generation');
    
    res.json({
      status: 'success',
      message: 'Queue status retrieved successfully',
      data: {
        queueType: 'video-generation',
        ...queueStats,
        estimatedWaitTime: estimateWaitTime(queueStats.waiting)
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  } catch (error) {
    logger.error('Get queue status failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve queue status',
      error: {
        code: 'QUEUE_STATUS_FAILED',
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
 * Get user's video generation history
 * GET /api/video/history
 */
router.get('/history', async (req, res) => {
  try {
    const { userId } = req.query;
    const { query } = require('../database/connection');
    
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
    
    // Get user's video generation history
    const result = await query(
      `SELECT id, status, progress, result_url, error_message, created_at, started_at, completed_at
       FROM render_jobs 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [userId]
    );
    
    res.json({
      status: 'success',
      message: 'Video generation history retrieved successfully',
      data: {
        jobs: result.rows,
        total: result.rows.length
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  } catch (error) {
    logger.error('Get video history failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve video generation history',
      error: {
        code: 'HISTORY_RETRIEVAL_FAILED',
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
 * Estimate video generation time based on settings
 * @param {Object} settings - Generation settings
 * @returns {string} Estimated time
 */
function estimateGenerationTime(settings) {
  const baseTime = 5; // Base time in minutes
  
  let multiplier = 1;
  
  // Adjust for quality
  if (settings.quality === 'high') multiplier *= 1.5;
  if (settings.quality === 'ultra') multiplier *= 2;
  
  // Adjust for duration
  if (settings.duration && settings.duration > 30) multiplier *= 1.5;
  if (settings.duration && settings.duration > 60) multiplier *= 2;
  
  // Adjust for complexity
  if (settings.complexity === 'complex') multiplier *= 1.3;
  if (settings.complexity === 'advanced') multiplier *= 1.6;
  
  const estimatedMinutes = Math.round(baseTime * multiplier);
  return `${estimatedMinutes}-${estimatedMinutes + 2} minutes`;
}

/**
 * Estimate time remaining for job
 * @param {Object} jobStatus - Job status
 * @returns {string} Estimated time remaining
 */
function estimateTimeRemaining(jobStatus) {
  if (jobStatus.status === 'completed') return '0 minutes';
  if (jobStatus.status === 'failed') return 'N/A';
  if (jobStatus.status === 'queued') return '5-10 minutes';
  
  const progress = jobStatus.progress || 0;
  if (progress === 0) return '5-10 minutes';
  
  const remainingPercent = 100 - progress;
  const estimatedMinutes = Math.round((remainingPercent / 100) * 8);
  return `${estimatedMinutes} minutes`;
}

/**
 * Get queue position for job
 * @param {string} queueType - Queue type
 * @param {string} jobId - Job ID (optional)
 * @returns {Promise<number>} Queue position
 */
async function getQueuePosition(queueType, jobId = null) {
  try {
    const { getQueue } = require('../services/jobQueue');
    const queue = getQueue(queueType);
    const waiting = await queue.getWaiting();
    
    if (jobId) {
      const jobIndex = waiting.findIndex(job => job.id === jobId);
      return jobIndex >= 0 ? jobIndex + 1 : 0;
    }
    
    return waiting.length;
  } catch (error) {
    logger.error('Get queue position failed:', error);
    return 0;
  }
}

/**
 * Estimate wait time based on queue length
 * @param {number} queueLength - Number of jobs in queue
 * @returns {string} Estimated wait time
 */
function estimateWaitTime(queueLength) {
  if (queueLength === 0) return 'No wait';
  if (queueLength <= 3) return '1-2 minutes';
  if (queueLength <= 10) return '3-5 minutes';
  if (queueLength <= 20) return '5-10 minutes';
  return '10+ minutes';
}

module.exports = router;
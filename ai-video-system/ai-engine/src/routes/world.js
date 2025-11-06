const express = require('express');
const router = express.Router();
const worldBuildingService = require('../services/worldBuilding');
const { addJob } = require('../services/jobQueue');
const logger = require('../utils/logger');

/**
 * Generate 3D world from description
 * POST /api/world/generate
 */
router.post('/generate', async (req, res) => {
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
    
    // Validate description length
    if (description.length > 2000) {
      return res.status(400).json({
        status: 'error',
        message: 'Description too long (max 2000 characters)',
        error: {
          code: 'DESCRIPTION_TOO_LONG',
          field: 'description'
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
      projectId,
      descriptionLength: description.length
    });
    
    res.status(202).json({
      status: 'success',
      message: 'World building job queued successfully',
      data: {
        jobId: job.id,
        status: 'queued',
        estimatedTime: estimateWorldBuildingTime(settings),
        queuePosition: await getQueuePosition('world-building')
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
 * Get world building job status
 * GET /api/world/status/:jobId
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
    const jobStatus = await worldBuildingService.getJobStatus(jobId);
    
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
      queuePosition = await getQueuePosition('world-building', jobId);
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
 * Cancel world building job
 * DELETE /api/world/status/:jobId
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
    const jobStatus = await worldBuildingService.getJobStatus(jobId);
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
    const success = await worldBuildingService.cancelJob(jobId);
    
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
 * Get world building queue status
 * GET /api/world/queue
 */
router.get('/queue', async (req, res) => {
  try {
    const { getQueueStats } = require('../services/jobQueue');
    const queueStats = await getQueueStats('world-building');
    
    res.json({
      status: 'success',
      message: 'Queue status retrieved successfully',
      data: {
        queueType: 'world-building',
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
 * Get user's world building history
 * GET /api/world/history
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
    
    // Get user's world building history
    const result = await query(
      `SELECT id, status, progress, result_url, error_message, created_at, started_at, completed_at
       FROM world_jobs 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [userId]
    );
    
    res.json({
      status: 'success',
      message: 'World building history retrieved successfully',
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
    logger.error('Get world history failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve world building history',
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
 * Get world building templates
 * GET /api/world/templates
 */
router.get('/templates', async (req, res) => {
  try {
    const templates = [
      {
        id: 'fantasy_forest',
        name: 'Fantasy Forest',
        description: 'A mystical forest with ancient trees and magical creatures',
        category: 'fantasy',
        preview: '/templates/fantasy_forest.jpg',
        settings: {
          artStyle: 'fantasy',
          scale: 'medium',
          mood: 'mysterious'
        }
      },
      {
        id: 'modern_city',
        name: 'Modern City',
        description: 'A bustling metropolis with skyscrapers and busy streets',
        category: 'urban',
        preview: '/templates/modern_city.jpg',
        settings: {
          artStyle: 'realistic',
          scale: 'large',
          mood: 'energetic'
        }
      },
      {
        id: 'peaceful_beach',
        name: 'Peaceful Beach',
        description: 'A serene beach with crystal clear water and white sand',
        category: 'nature',
        preview: '/templates/peaceful_beach.jpg',
        settings: {
          artStyle: 'realistic',
          scale: 'small',
          mood: 'peaceful'
        }
      },
      {
        id: 'sci_fi_station',
        name: 'Space Station',
        description: 'A futuristic space station orbiting Earth',
        category: 'sci-fi',
        preview: '/templates/sci_fi_station.jpg',
        settings: {
          artStyle: 'sci-fi',
          scale: 'medium',
          mood: 'dramatic'
        }
      }
    ];
    
    res.json({
      status: 'success',
      message: 'World building templates retrieved successfully',
      data: {
        templates,
        total: templates.length
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  } catch (error) {
    logger.error('Get templates failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve world building templates',
      error: {
        code: 'TEMPLATES_RETRIEVAL_FAILED',
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
 * Estimate world building time based on settings
 * @param {Object} settings - Generation settings
 * @returns {string} Estimated time
 */
function estimateWorldBuildingTime(settings) {
  const baseTime = 3; // Base time in minutes
  
  let multiplier = 1;
  
  // Adjust for scale
  if (settings.scale === 'large') multiplier *= 1.5;
  if (settings.scale === 'epic') multiplier *= 2;
  
  // Adjust for complexity
  if (settings.complexity === 'complex') multiplier *= 1.3;
  if (settings.complexity === 'advanced') multiplier *= 1.6;
  
  // Adjust for art style
  if (settings.artStyle === 'realistic') multiplier *= 1.2;
  if (settings.artStyle === 'fantasy') multiplier *= 1.1;
  
  const estimatedMinutes = Math.round(baseTime * multiplier);
  return `${estimatedMinutes}-${estimatedMinutes + 3} minutes`;
}

/**
 * Estimate time remaining for job
 * @param {Object} jobStatus - Job status
 * @returns {string} Estimated time remaining
 */
function estimateTimeRemaining(jobStatus) {
  if (jobStatus.status === 'completed') return '0 minutes';
  if (jobStatus.status === 'failed') return 'N/A';
  if (jobStatus.status === 'queued') return '3-8 minutes';
  
  const progress = jobStatus.progress || 0;
  if (progress === 0) return '3-8 minutes';
  
  const remainingPercent = 100 - progress;
  const estimatedMinutes = Math.round((remainingPercent / 100) * 6);
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
  if (queueLength <= 2) return '1-2 minutes';
  if (queueLength <= 5) return '2-4 minutes';
  if (queueLength <= 10) return '4-8 minutes';
  return '8+ minutes';
}

module.exports = router;
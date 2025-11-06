const express = require('express');
const router = express.Router();
const contentAnalysisService = require('../services/contentAnalysis');
const { addJob } = require('../services/jobQueue');
const logger = require('../utils/logger');

/**
 * Analyze content (image, video, text, audio)
 * POST /api/analysis/analyze
 */
router.post('/analyze', async (req, res) => {
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
    
    // Validate content size if URL provided
    if (contentUrl && contentUrl.length > 2048) {
      return res.status(400).json({
        status: 'error',
        message: 'Content URL too long (max 2048 characters)',
        error: {
          code: 'URL_TOO_LONG',
          field: 'contentUrl'
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
      projectId,
      hasUrl: !!contentUrl,
      hasData: !!contentData
    });
    
    res.status(202).json({
      status: 'success',
      message: 'Content analysis job queued successfully',
      data: {
        jobId: job.id,
        status: 'queued',
        estimatedTime: estimateAnalysisTime(contentType, settings),
        queuePosition: await getQueuePosition('content-analysis')
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
 * Get content analysis job status
 * GET /api/analysis/status/:jobId
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
    const jobStatus = await contentAnalysisService.getJobStatus(jobId);
    
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
      queuePosition = await getQueuePosition('content-analysis', jobId);
    }
    
    res.json({
      status: 'success',
      message: 'Job status retrieved successfully',
      data: {
        jobId: jobStatus.id,
        status: jobStatus.status,
        progress: jobStatus.progress,
        result: jobStatus.result,
        errorMessage: jobStatus.error_message,
        contentType: jobStatus.content_type,
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
 * Cancel content analysis job
 * DELETE /api/analysis/status/:jobId
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
    const jobStatus = await contentAnalysisService.getJobStatus(jobId);
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
    const success = await contentAnalysisService.cancelJob(jobId);
    
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
 * Get content analysis queue status
 * GET /api/analysis/queue
 */
router.get('/queue', async (req, res) => {
  try {
    const { getQueueStats } = require('../services/jobQueue');
    const queueStats = await getQueueStats('content-analysis');
    
    res.json({
      status: 'success',
      message: 'Queue status retrieved successfully',
      data: {
        queueType: 'content-analysis',
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
 * Get user's content analysis history
 * GET /api/analysis/history
 */
router.get('/history', async (req, res) => {
  try {
    const { userId, contentType, limit = 50, offset = 0 } = req.query;
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
    
    // Build query
    let whereClause = 'WHERE user_id = $1';
    let queryParams = [userId];
    
    if (contentType) {
      whereClause += ' AND content_type = $2';
      queryParams.push(contentType);
    }
    
    // Get user's content analysis history
    const result = await query(
      `SELECT id, content_type, content_url, status, progress, result, error_message, created_at, started_at, completed_at
       FROM analysis_jobs 
       ${whereClause}
       ORDER BY created_at DESC 
       LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`,
      [...queryParams, parseInt(limit), parseInt(offset)]
    );
    
    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM analysis_jobs ${whereClause}`,
      queryParams
    );
    
    res.json({
      status: 'success',
      message: 'Content analysis history retrieved successfully',
      data: {
        jobs: result.rows,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: parseInt(countResult.rows[0].total),
          hasMore: (parseInt(offset) + result.rows.length) < parseInt(countResult.rows[0].total)
        }
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  } catch (error) {
    logger.error('Get analysis history failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve content analysis history',
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
 * Get content analysis result
 * GET /api/analysis/result/:jobId
 */
router.get('/result/:jobId', async (req, res) => {
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
    
    // Get job status with result
    const jobStatus = await contentAnalysisService.getJobStatus(jobId);
    
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
    
    if (jobStatus.status !== 'completed') {
      return res.status(400).json({
        status: 'error',
        message: 'Job has not completed yet',
        error: {
          code: 'JOB_NOT_COMPLETED',
          details: `Job status is: ${jobStatus.status}`
        }
      });
    }
    
    res.json({
      status: 'success',
      message: 'Analysis result retrieved successfully',
      data: {
        jobId: jobStatus.id,
        contentType: jobStatus.content_type,
        result: jobStatus.result,
        completedAt: jobStatus.completed_at
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  } catch (error) {
    logger.error('Get analysis result failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve analysis result',
      error: {
        code: 'RESULT_RETRIEVAL_FAILED',
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
 * Get supported analysis types
 * GET /api/analysis/types
 */
router.get('/types', async (req, res) => {
  try {
    const types = [
      {
        type: 'image',
        name: 'Image Analysis',
        description: 'Analyze images for objects, scenes, styles, and quality',
        features: [
          'Object recognition',
          'Scene understanding',
          'Style analysis',
          'Quality assessment',
          'Color analysis'
        ],
        supportedFormats: ['JPEG', 'PNG', 'GIF', 'WebP'],
        maxFileSize: '10MB',
        estimatedTime: '30 seconds - 2 minutes'
      },
      {
        type: 'video',
        name: 'Video Analysis',
        description: 'Analyze videos for scenes, motion, and quality',
        features: [
          'Scene detection',
          'Motion analysis',
          'Object tracking',
          'Quality assessment',
          'Key frame extraction'
        ],
        supportedFormats: ['MP4', 'AVI', 'MOV', 'WebM'],
        maxFileSize: '100MB',
        estimatedTime: '2-10 minutes'
      },
      {
        type: 'text',
        name: 'Text Analysis',
        description: 'Analyze text for sentiment, topics, and entities',
        features: [
          'Sentiment analysis',
          'Topic extraction',
          'Entity recognition',
          'Style analysis',
          'Language detection'
        ],
        supportedFormats: ['TXT', 'PDF', 'DOCX'],
        maxFileSize: '5MB',
        estimatedTime: '10-30 seconds'
      },
      {
        type: 'audio',
        name: 'Audio Analysis',
        description: 'Analyze audio for speech, emotions, and quality',
        features: [
          'Speech recognition',
          'Emotion detection',
          'Audio classification',
          'Quality assessment',
          'Speaker identification'
        ],
        supportedFormats: ['MP3', 'WAV', 'M4A', 'OGG'],
        maxFileSize: '25MB',
        estimatedTime: '1-5 minutes'
      }
    ];
    
    res.json({
      status: 'success',
      message: 'Analysis types retrieved successfully',
      data: {
        types,
        total: types.length
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id
      }
    });
  } catch (error) {
    logger.error('Get analysis types failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve analysis types',
      error: {
        code: 'TYPES_RETRIEVAL_FAILED',
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
 * Estimate analysis time based on content type and settings
 * @param {string} contentType - Content type
 * @param {Object} settings - Analysis settings
 * @returns {string} Estimated time
 */
function estimateAnalysisTime(contentType, settings) {
  const baseTimes = {
    image: '30 seconds - 2 minutes',
    video: '2-10 minutes',
    text: '10-30 seconds',
    audio: '1-5 minutes'
  };
  
  let baseTime = baseTimes[contentType] || '1-5 minutes';
  
  // Adjust for detailed analysis
  if (settings.detailed === true) {
    if (contentType === 'image') baseTime = '2-5 minutes';
    if (contentType === 'video') baseTime = '5-15 minutes';
    if (contentType === 'text') baseTime = '30 seconds - 1 minute';
    if (contentType === 'audio') baseTime = '3-8 minutes';
  }
  
  return baseTime;
}

/**
 * Estimate time remaining for job
 * @param {Object} jobStatus - Job status
 * @returns {string} Estimated time remaining
 */
function estimateTimeRemaining(jobStatus) {
  if (jobStatus.status === 'completed') return '0 seconds';
  if (jobStatus.status === 'failed') return 'N/A';
  if (jobStatus.status === 'queued') return estimateAnalysisTime(jobStatus.content_type, {});
  
  const progress = jobStatus.progress || 0;
  if (progress === 0) return estimateAnalysisTime(jobStatus.content_type, {});
  
  const remainingPercent = 100 - progress;
  const estimatedSeconds = Math.round((remainingPercent / 100) * 120); // 2 minutes base
  return `${estimatedSeconds} seconds`;
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
  if (queueLength <= 3) return '30 seconds - 1 minute';
  if (queueLength <= 10) return '1-3 minutes';
  if (queueLength <= 20) return '3-5 minutes';
  return '5+ minutes';
}

module.exports = router;
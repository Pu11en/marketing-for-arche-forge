const express = require('express');
const router = express.Router();
const contentAnalysisService = require('../services/contentAnalysis');
const { authenticate } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const logger = require('../utils/logger');

/**
 * Content Analysis API Routes
 */

/**
 * POST /api/content-analysis/analyze
 * Analyze content (image, video, text, audio)
 */
router.post('/analyze', authenticate, validateRequest({
  contentType: { type: 'string', required: true, enum: ['image', 'video', 'text', 'audio'] },
  contentUrl: { type: 'string', required: false },
  contentData: { type: 'object', required: false },
  analysisLevel: { type: 'string', enum: ['basic', 'standard', 'comprehensive'], default: 'standard' },
  useWorkerPool: { type: 'boolean', default: true },
  projectId: { type: 'string', required: false }
}), async (req, res) => {
  try {
    const { contentType, contentUrl, contentData, analysisLevel, useWorkerPool, projectId } = req.body;
    
    const job = await contentAnalysisService.analyzeContent({
      contentType,
      contentUrl,
      contentData,
      analysisLevel,
      useWorkerPool,
      userId: req.user.id,
      projectId
    });
    
    res.status(202).json({
      success: true,
      data: {
        jobId: job.id,
        status: job.status,
        message: 'Content analysis started'
      }
    });
  } catch (error) {
    logger.error('Content analysis request failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/content-analysis/job/:jobId
 * Get analysis job status
 */
router.get('/job/:jobId', authenticate, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const job = await contentAnalysisService.getJobStatus(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Analysis job not found'
      });
    }
    
    // Check if user owns this job
    if (job.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    res.json({
      success: true,
      data: job
    });
  } catch (error) {
    logger.error('Get job status failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/content-analysis/job/:jobId/cancel
 * Cancel analysis job
 */
router.post('/job/:jobId/cancel', authenticate, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Check if job exists and user owns it
    const job = await contentAnalysisService.getJobStatus(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Analysis job not found'
      });
    }
    
    if (job.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    const success = await contentAnalysisService.cancelJob(jobId);
    
    res.json({
      success,
      message: success ? 'Analysis job cancelled' : 'Failed to cancel job'
    });
  } catch (error) {
    logger.error('Cancel job failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/content-analysis/embedding
 * Generate content embedding for similarity matching
 */
router.post('/embedding', authenticate, validateRequest({
  contentType: { type: 'string', required: true, enum: ['image', 'video', 'text', 'audio'] },
  contentUrl: { type: 'string', required: false },
  contentData: { type: 'object', required: false },
  analysisResult: { type: 'object', required: true }
}), async (req, res) => {
  try {
    const { contentType, contentUrl, contentData, analysisResult } = req.body;
    
    const embedding = await contentAnalysisService.generateContentEmbedding({
      contentType,
      contentUrl,
      contentData,
      analysisResult
    });
    
    res.json({
      success: true,
      data: embedding
    });
  } catch (error) {
    logger.error('Content embedding generation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/content-analysis/cross-modal
 * Perform cross-modal analysis between different content types
 */
router.post('/cross-modal', authenticate, validateRequest({
  contentItems: { 
    type: 'array', 
    required: true,
    items: {
      type: 'object',
      properties: {
        contentType: { type: 'string', enum: ['image', 'video', 'text', 'audio'] },
        contentUrl: { type: 'string' },
        contentData: { type: 'object' },
        analysisResult: { type: 'object' }
      }
    }
  }
}), async (req, res) => {
  try {
    const { contentItems, options } = req.body;
    
    const result = await contentAnalysisService.performCrossModalAnalysis(contentItems, options);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Cross-modal analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/content-analysis/batch
 * Process batch of content items for analysis
 */
router.post('/batch', authenticate, validateRequest({
  contentBatch: { 
    type: 'array', 
    required: true,
    items: {
      type: 'object',
      properties: {
        contentType: { type: 'string', enum: ['image', 'video', 'text', 'audio'] },
        contentUrl: { type: 'string' },
        contentData: { type: 'object' },
        userId: { type: 'string' },
        projectId: { type: 'string' }
      }
    }
  },
  analysisLevel: { type: 'string', enum: ['basic', 'standard', 'comprehensive'], default: 'standard' },
  priority: { type: 'string', enum: ['low', 'normal', 'high'], default: 'normal' }
}), async (req, res) => {
  try {
    const { contentBatch, analysisLevel, priority } = req.body;
    
    // Validate that all items belong to the authenticated user
    for (const item of contentBatch) {
      if (item.userId && item.userId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied for one or more items'
        });
      }
    }
    
    // Set userId for all items to authenticated user
    const batchWithUser = contentBatch.map(item => ({
      ...item,
      userId: req.user.id
    }));
    
    const result = await contentAnalysisService.processBatchAnalysis(batchWithUser, {
      analysisLevel,
      priority
    });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Batch analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/content-analysis/quality
 * Detect content quality and appropriateness
 */
router.post('/quality', authenticate, validateRequest({
  contentType: { type: 'string', required: true, enum: ['image', 'video', 'text', 'audio'] },
  analysisResult: { type: 'object', required: true },
  options: { 
    type: 'object',
    properties: {
      strictness: { type: 'string', enum: ['lenient', 'standard', 'strict'], default: 'standard' }
    }
  }
}), async (req, res) => {
  try {
    const { contentType, analysisResult, options } = req.body;
    
    const assessment = await contentAnalysisService.detectContentQualityAndAppropriateness({
      contentType,
      analysisResult,
      options
    });
    
    res.json({
      success: true,
      data: assessment
    });
  } catch (error) {
    logger.error('Content quality assessment failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/content-analysis/metadata
 * Extract metadata for search and recommendation
 */
router.post('/metadata', authenticate, validateRequest({
  contentType: { type: 'string', required: true, enum: ['image', 'video', 'text', 'audio'] },
  analysisResult: { type: 'object', required: true },
  options: { 
    type: 'object',
    properties: {
      includeEmbeddings: { type: 'boolean', default: true },
      includeTags: { type: 'boolean', default: true }
    }
  }
}), async (req, res) => {
  try {
    const { contentType, analysisResult, options } = req.body;
    
    const metadata = await contentAnalysisService.extractMetadataForSearchAndRecommendation({
      contentType,
      analysisResult,
      options
    });
    
    res.json({
      success: true,
      data: metadata
    });
  } catch (error) {
    logger.error('Metadata extraction failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/content-analysis/export/:jobId
 * Export analysis data in various formats
 */
router.get('/export/:jobId', authenticate, validateRequest({
  format: { type: 'string', enum: ['json', 'csv', 'xml'], default: 'json' },
  options: { type: 'object' }
}, 'query'), async (req, res) => {
  try {
    const { jobId } = req.params;
    const { format, options } = req.query;
    
    // Check if job exists and user owns it
    const job = await contentAnalysisService.getJobStatus(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Analysis job not found'
      });
    }
    
    if (job.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    const exportResult = await contentAnalysisService.exportAnalysisData({
      jobId,
      format,
      options: options ? JSON.parse(options) : {}
    });
    
    // Set appropriate headers for file download
    res.setHeader('Content-Type', exportResult.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
    
    res.send(exportResult.data);
  } catch (error) {
    logger.error('Analysis data export failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/content-analysis/similar/:embeddingId
 * Find similar content based on embedding
 */
router.get('/similar/:embeddingId', authenticate, async (req, res) => {
  try {
    const { embeddingId } = req.params;
    const { limit = 10, threshold = 0.7 } = req.query;
    
    // This would typically query the database for similar embeddings
    // For now, return a placeholder response
    const similarContent = await contentAnalysisService.findSimilarContent(embeddingId, {
      limit: parseInt(limit),
      threshold: parseFloat(threshold)
    });
    
    res.json({
      success: true,
      data: similarContent
    });
  } catch (error) {
    logger.error('Similar content search failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/content-analysis/stats
 * Get content analysis statistics
 */
router.get('/stats', authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    const { timeframe = '30d', contentType } = req.query;
    
    const stats = await contentAnalysisService.getAnalysisStats(userId, {
      timeframe,
      contentType
    });
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Get analysis stats failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
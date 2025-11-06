const express = require('express');
const { body, validationResult } = require('express-validator');
const personalizationService = require('../services/personalization');
const { catchAsync, ValidationError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

// Validation rules
const learnPreferencesValidation = [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('behaviorData').isObject().withMessage('Behavior data must be an object')
];

const updateProfileValidation = [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('patterns').isObject().withMessage('Patterns must be an object')
];

const recommendationsValidation = [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('context').isIn(['video_creation', 'content_discovery', 'feature_discovery', 'style_discovery']).withMessage('Invalid context')
];

const feedbackValidation = [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('feedback').isObject().withMessage('Feedback must be an object')
];

const generationParamsValidation = [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('context').isObject().withMessage('Context must be an object')
];

const uiSettingsValidation = [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('context').isObject().withMessage('Context must be an object')
];

const privacyValidation = [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('options').isObject().withMessage('Options must be an object')
];

// Learn user preferences from behavior
router.post('/learn-preferences', learnPreferencesValidation, catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { userId, behaviorData } = req.body;

  // Learn preferences from behavior
  const updatedProfile = await personalizationService.learnUserPreferences(userId, behaviorData);

  res.json({
    status: 'success',
    message: 'User preferences learned successfully',
    data: {
      profile: updatedProfile
    }
  });
}));

// Get user profile
router.get('/profile/:userId', catchAsync(async (req, res) => {
  const { userId } = req.params;

  // Get user profile
  const profile = await personalizationService.getUserProfile(userId);

  res.json({
    status: 'success',
    data: {
      profile
    }
  });
}));

// Update user profile
router.put('/profile', updateProfileValidation, catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { userId, patterns } = req.body;

  // Update user profile
  const updatedProfile = await personalizationService.updateUserProfile(userId, patterns);

  res.json({
    status: 'success',
    message: 'User profile updated successfully',
    data: {
      profile: updatedProfile
    }
  });
}));

// Get personalized recommendations
router.post('/recommendations', recommendationsValidation, catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { userId, context, options = {} } = req.body;

  // Get personalized recommendations
  const recommendations = await personalizationService.getPersonalizedRecommendations(userId, context, options);

  res.json({
    status: 'success',
    data: {
      recommendations,
      count: recommendations.length
    }
  });
}));

// Track recommendation interaction
router.post('/track-interaction', catchAsync(async (req, res) => {
  const { userId, recommendationId, action, metadata = {} } = req.body;

  // Track interaction
  await personalizationService.trackRecommendationInteraction(userId, recommendationId, action, metadata);

  res.json({
    status: 'success',
    message: 'Interaction tracked successfully'
  });
}));

// Get personalized content generation parameters
router.post('/generation-params', generationParamsValidation, catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { userId, context } = req.body;

  // Get personalized generation parameters
  const parameters = await personalizationService.getPersonalizedGenerationParameters(userId, context);

  res.json({
    status: 'success',
    data: {
      parameters
    }
  });
}));

// Get adaptive UI settings
router.post('/ui-settings', uiSettingsValidation, catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { userId, context } = req.body;

  // Get adaptive UI settings
  const settings = await personalizationService.getAdaptiveUISettings(userId, context);

  res.json({
    status: 'success',
    data: {
      settings
    }
  });
}));

// Get workflow optimizations
router.get('/workflow-optimizations/:userId', catchAsync(async (req, res) => {
  const { userId } = req.params;

  // Get workflow optimizations
  const optimizations = await personalizationService.getWorkflowOptimizations(userId);

  res.json({
    status: 'success',
    data: {
      optimizations
    }
  });
}));

// Get real-time updates
router.get('/realtime-updates/:userId', catchAsync(async (req, res) => {
  const { userId } = req.params;

  // Get real-time updates
  const updates = await personalizationService.getRealtimeUpdates(userId);

  res.json({
    status: 'success',
    data: {
      updates
    }
  });
}));

// Update session data
router.post('/session-data', catchAsync(async (req, res) => {
  const { userId, sessionData } = req.body;

  // Update session data
  personalizationService.updateSessionData(userId, sessionData);

  res.json({
    status: 'success',
    message: 'Session data updated successfully'
  });
}));

// Get personalization metrics
router.get('/metrics/:userId', catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { timeframe = '30d' } = req.query;

  // Get personalization metrics
  const metrics = await personalizationService.getPersonalizationMetrics(userId, { timeframe });

  res.json({
    status: 'success',
    data: {
      metrics
    }
  });
}));

// Collect user feedback
router.post('/feedback', feedbackValidation, catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { userId, feedback } = req.body;

  // Collect feedback
  await personalizationService.collectUserFeedback(userId, feedback);

  res.json({
    status: 'success',
    message: 'Feedback collected successfully'
  });
}));

// Ensure privacy compliance
router.post('/privacy', privacyValidation, catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { userId, options } = req.body;

  // Handle privacy compliance
  if (options.exportData) {
    const userData = await personalizationService.ensurePrivacyCompliance(userId, options);
    
    res.json({
      status: 'success',
      data: {
        userData
      }
    });
  } else {
    await personalizationService.ensurePrivacyCompliance(userId, options);
    
    res.json({
      status: 'success',
      message: 'Privacy settings applied successfully'
    });
  }
}));

// Integrate content analysis
router.post('/integrate-content-analysis', catchAsync(async (req, res) => {
  const { userId, contentAnalysis } = req.body;

  // Integrate content analysis
  await personalizationService.integrateContentAnalysis(userId, contentAnalysis);

  res.json({
    status: 'success',
    message: 'Content analysis integrated successfully'
  });
}));

// Integrate with video generation
router.post('/integrate-video-generation', catchAsync(async (req, res) => {
  const { userId, generationParams } = req.body;

  // Integrate with video generation
  const enhancedParams = await personalizationService.integrateWithVideoGeneration(userId, generationParams);

  res.json({
    status: 'success',
    data: {
      enhancedParams
    }
  });
}));

// Get user segment
router.get('/segment/:userId', catchAsync(async (req, res) => {
  const { userId } = req.params;

  // Get user profile to determine segment
  const userProfile = await personalizationService.getUserProfile(userId);
  
  // Update user segment
  await personalizationService.updateUserSegment(userId, userProfile);
  
  // Get segment from service
  const segment = personalizationService.userSegments.get(userId);

  res.json({
    status: 'success',
    data: {
      segment
    }
  });
}));

// Get template recommendations
router.get('/template-recommendations/:userId', catchAsync(async (req, res) => {
  const { userId } = req.params;

  // Get template recommendations
  const recommendations = await personalizationService.getTemplateRecommendations(userId);

  res.json({
    status: 'success',
    data: {
      recommendations
    }
  });
}));

// Get style recommendations
router.get('/style-recommendations/:userId', catchAsync(async (req, res) => {
  const { userId } = req.params;

  // Get user profile
  const userProfile = await personalizationService.getUserProfile(userId);
  
  // Get style recommendations
  const recommendations = await personalizationService.getStyleRecommendationsML(userProfile);

  res.json({
    status: 'success',
    data: {
      recommendations
    }
  });
}));

// Get feature recommendations
router.get('/feature-recommendations/:userId', catchAsync(async (req, res) => {
  const { userId } = req.params;

  // Get user profile
  const userProfile = await personalizationService.getUserProfile(userId);
  
  // Get user segment
  const userSegment = personalizationService.userSegments.get(userId);
  
  // Get feature recommendations
  const recommendations = await personalizationService.getFeatureRecommendationsML(userProfile, userSegment);

  res.json({
    status: 'success',
    data: {
      recommendations
    }
  });
}));

// Get collaborative filtering recommendations
router.get('/collaborative-recommendations/:userId', catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { context = 'video_creation' } = req.query;

  // Get collaborative filtering recommendations
  const recommendations = await personalizationService.getCollaborativeFilteringRecommendations(userId, context);

  res.json({
    status: 'success',
    data: {
      recommendations
    }
  });
}));

// Get content-based recommendations
router.get('/content-based-recommendations/:userId', catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { context = 'content_discovery' } = req.query;

  // Get content-based recommendations
  const recommendations = await personalizationService.getContentBasedRecommendations(userId, context);

  res.json({
    status: 'success',
    data: {
      recommendations
    }
  });
}));

// Get context-aware recommendations
router.get('/context-aware-recommendations/:userId', catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { context = 'video_creation', device = 'desktop' } = req.query;

  // Get context-aware recommendations
  const recommendations = await personalizationService.getContextAwareRecommendations(userId, context, { device });

  res.json({
    status: 'success',
    data: {
      recommendations
    }
  });
}));

// Get A/B test results
router.get('/ab-test-results/:userId', catchAsync(async (req, res) => {
  const { userId } = req.params;

  // Get user's A/B test results
  const result = await query(
    `SELECT 
       abt.test_id,
       abt.test_name,
       abt.context,
       uat.test_group,
       atr.click_count,
       atr.convert_count,
       atr.impression_count
     FROM user_ab_tests uat
     JOIN ab_tests abt ON uat.test_id = abt.test_id
     LEFT JOIN ab_test_results atr ON uat.test_id = atr.test_id AND uat.test_group = atr.test_group
     WHERE uat.user_id = $1 AND abt.status = 'active'`,
    [userId]
  );

  res.json({
    status: 'success',
    data: {
      testResults: result.rows
    }
  });
}));

// Health check for personalization service
router.get('/health', catchAsync(async (req, res) => {
  const health = {
    status: 'OK',
    service: 'Personalization Service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    metrics: {
      activeProfiles: personalizationService.userProfiles.size,
      activeSegments: personalizationService.userSegments.size,
      eventBufferSize: personalizationService.eventBuffer.length,
      realtimeUpdates: personalizationService.realtimeUpdates.size,
      sessionDataSize: personalizationService.sessionData.size
    }
  };

  res.json(health);
}));

module.exports = router;
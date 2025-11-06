const logger = require('../utils/logger');
const { query } = require('../database/connection');
const { cache } = require('./redis');
const contentAnalysisService = require('./contentAnalysis');
const aiProviders = require('./aiProviders');
const crypto = require('crypto');

class PersonalizationService {
  constructor() {
    this.userProfiles = new Map();
    this.stylePreferences = new Map();
    this.contentHistory = new Map();
    this.mlModels = new Map();
    this.userSegments = new Map();
    this.abTests = new Map();
    this.eventBuffer = [];
    this.realtimeUpdates = new Map();
    this.sessionData = new Map();
    
    // Initialize ML models
    this.initializeMLModels();
    
    // Start event processing
    this.startEventProcessing();
    
    // Start A/B test evaluation
    this.startABTestEvaluation();
  }

  /**
   * Initialize machine learning models
   */
  async initializeMLModels() {
    try {
      // Initialize preference prediction model
      this.mlModels.set('preferencePrediction', {
        type: 'neural_network',
        features: ['user_actions', 'content_features', 'temporal_patterns'],
        model: null, // Will be loaded or trained
        lastUpdated: null
      });

      // Initialize user segmentation model
      this.mlModels.set('userSegmentation', {
        type: 'clustering',
        algorithm: 'kmeans',
        features: ['behavior_patterns', 'preferences', 'usage_frequency'],
        model: null,
        clusters: 5,
        lastUpdated: null
      });

      // Initialize collaborative filtering model
      this.mlModels.set('collaborativeFiltering', {
        type: 'matrix_factorization',
        algorithm: 'svd',
        dimensions: 50,
        model: null,
        lastUpdated: null
      });

      // Load existing models if available
      await this.loadMLModels();
      
      logger.info('ML models initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize ML models:', error);
    }
  }

  /**
   * Load existing ML models from database
   */
  async loadMLModels() {
    try {
      const result = await query('SELECT * FROM ml_models WHERE active = true');
      
      for (const row of result.rows) {
        const model = this.mlModels.get(row.model_type);
        if (model) {
          model.model = JSON.parse(row.model_data);
          model.lastUpdated = row.updated_at;
          logger.info(`Loaded ${row.model_type} model`);
        }
      }
    } catch (error) {
      logger.warn('Failed to load ML models:', error);
    }
  }

  /**
   * Learn user preferences from behavior
   * @param {string} userId - User ID
   * @param {Object} behaviorData - User behavior data
   * @returns {Promise<Object>} Updated user profile
   */
  async learnUserPreferences(userId, behaviorData) {
    try {
      logger.info('Learning user preferences', { userId, behaviorData });

      // Get current user profile
      let userProfile = await this.getUserProfile(userId);
      
      // Track user behavior for learning
      await this.trackUserBehavior(userId, behaviorData);
      
      // Analyze behavior patterns with enhanced ML
      const patterns = await this.analyzeBehaviorPatternsML(behaviorData, userProfile);
      
      // Update user profile with new insights
      userProfile = await this.updateUserProfile(userId, patterns);
      
      // Update user segment
      await this.updateUserSegment(userId, userProfile);
      
      // Cache updated profile
      await this.cacheUserProfile(userId, userProfile);
      
      // Trigger real-time updates
      await this.triggerRealtimeUpdate(userId, patterns);
      
      logger.info('User preferences updated', { userId, patterns });
      return userProfile;
    } catch (error) {
      logger.error('Failed to learn user preferences:', error);
      throw error;
    }
  }

  /**
   * Track user behavior for learning
   * @param {string} userId - User ID
   * @param {Object} behaviorData - User behavior data
   */
  async trackUserBehavior(userId, behaviorData) {
    try {
      const events = [];
      
      // Process different types of behavior
      if (behaviorData.actions) {
        behaviorData.actions.forEach(action => {
          events.push({
            userId,
            type: 'user_action',
            data: action,
            timestamp: new Date(),
            sessionId: behaviorData.sessionId
          });
        });
      }
      
      if (behaviorData.projects) {
        behaviorData.projects.forEach(project => {
          events.push({
            userId,
            type: 'project_activity',
            data: project,
            timestamp: new Date(),
            sessionId: behaviorData.sessionId
          });
        });
      }
      
      if (behaviorData.feedback) {
        behaviorData.feedback.forEach(feedback => {
          events.push({
            userId,
            type: 'user_feedback',
            data: feedback,
            timestamp: new Date(),
            sessionId: behaviorData.sessionId
          });
        });
      }
      
      // Add events to buffer for processing
      this.eventBuffer.push(...events);
      
      // Store in database for persistence
      await this.storeBehaviorEvents(events);
      
    } catch (error) {
      logger.error('Failed to track user behavior:', error);
    }
  }

  /**
   * Store behavior events in database
   * @param {Array} events - Array of behavior events
   */
  async storeBehaviorEvents(events) {
    try {
      for (const event of events) {
        await query(
          `INSERT INTO user_behavior_events (user_id, event_type, event_data, timestamp, session_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [event.userId, event.type, JSON.stringify(event.data), event.timestamp, event.sessionId]
        );
      }
    } catch (error) {
      logger.error('Failed to store behavior events:', error);
    }
  }

  /**
   * Analyze behavior patterns using ML
   * @param {Object} behaviorData - User behavior data
   * @param {Object} userProfile - Current user profile
   * @returns {Object} Analyzed patterns
   */
  async analyzeBehaviorPatternsML(behaviorData, userProfile) {
    try {
      // Use ML models for enhanced pattern analysis
      const preferenceModel = this.mlModels.get('preferencePrediction');
      
      let patterns = {
        visualStyle: this.analyzeVisualStyle(behaviorData, userProfile),
        contentPreferences: this.analyzeContentPreferences(behaviorData, userProfile),
        timingPatterns: this.analyzeTimingPatterns(behaviorData, userProfile),
        interactionPatterns: this.analyzeInteractionPatterns(behaviorData, userProfile),
        qualityPreferences: this.analyzeQualityPreferences(behaviorData, userProfile)
      };

      // Apply ML predictions if model is available
      if (preferenceModel.model) {
        const mlPredictions = await this.predictPreferencesML(behaviorData, userProfile);
        patterns = this.mergePatternsWithML(patterns, mlPredictions);
      }

      return patterns;
    } catch (error) {
      logger.error('Failed to analyze behavior patterns with ML:', error);
      // Fallback to basic analysis
      return {
        visualStyle: this.analyzeVisualStyle(behaviorData, userProfile),
        contentPreferences: this.analyzeContentPreferences(behaviorData, userProfile),
        timingPatterns: this.analyzeTimingPatterns(behaviorData, userProfile),
        interactionPatterns: this.analyzeInteractionPatterns(behaviorData, userProfile),
        qualityPreferences: this.analyzeQualityPreferences(behaviorData, userProfile)
      };
    }
  }

  /**
   * Predict preferences using ML
   * @param {Object} behaviorData - User behavior data
   * @param {Object} userProfile - Current user profile
   * @returns {Object} ML predictions
   */
  async predictPreferencesML(behaviorData, userProfile) {
    try {
      // Extract features for ML model
      const features = this.extractFeatures(behaviorData, userProfile);
      
      // Use AI providers for prediction
      const predictionPrompt = `
        Based on the following user behavior data and profile, predict the user's preferences:
        
        Behavior Data: ${JSON.stringify(behaviorData)}
        Current Profile: ${JSON.stringify(userProfile)}
        Extracted Features: ${JSON.stringify(features)}
        
        Predict the following preferences with confidence scores (0-1):
        1. Visual style preference
        2. Content category preferences
        3. Quality preference
        4. Interaction style preference
        5. Timing preferences
        
        Format as JSON with confidence scores.
      `;
      
      const result = await aiProviders.openaiGenerateText({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an ML prediction expert for user preferences. Provide accurate predictions with confidence scores.'
          },
          {
            role: 'user',
            content: predictionPrompt
          }
        ],
        maxTokens: 1000,
        temperature: 0.2
      });
      
      return JSON.parse(result.content);
    } catch (error) {
      logger.error('Failed to predict preferences with ML:', error);
      return {};
    }
  }

  /**
   * Extract features for ML models
   * @param {Object} behaviorData - User behavior data
   * @param {Object} userProfile - Current user profile
   * @returns {Object} Extracted features
   */
  extractFeatures(behaviorData, userProfile) {
    const features = {
      user_actions: behaviorData.actions?.length || 0,
      project_count: behaviorData.projects?.length || 0,
      feedback_count: behaviorData.feedback?.length || 0,
      session_duration: behaviorData.sessionDuration || 0,
      subscription_tier: userProfile.subscriptionTier || 'free',
      account_age: this.calculateAccountAge(userProfile.createdAt),
      last_activity: userProfile.lastActivity || null
    };
    
    // Add action type distribution
    if (behaviorData.actions) {
      const actionTypes = {};
      behaviorData.actions.forEach(action => {
        actionTypes[action.type] = (actionTypes[action.type] || 0) + 1;
      });
      features.action_distribution = actionTypes;
    }
    
    // Add project features
    if (behaviorData.projects) {
      const projectFeatures = {
        total_duration: behaviorData.projects.reduce((sum, p) => sum + (p.duration || 0), 0),
        avg_quality: behaviorData.projects.reduce((sum, p) => sum + (p.quality || 0), 0) / behaviorData.projects.length,
        style_diversity: new Set(behaviorData.projects.map(p => p.visualStyle)).size
      };
      features.project_features = projectFeatures;
    }
    
    return features;
  }

  /**
   * Calculate account age in days
   * @param {string} createdAt - Account creation date
   * @returns {number} Account age in days
   */
  calculateAccountAge(createdAt) {
    if (!createdAt) return 0;
    const created = new Date(createdAt);
    const now = new Date();
    return Math.floor((now - created) / (1000 * 60 * 60 * 24));
  }

  /**
   * Merge patterns with ML predictions
   * @param {Object} patterns - Analyzed patterns
   * @param {Object} mlPredictions - ML predictions
   * @returns {Object} Merged patterns
   */
  mergePatternsWithML(patterns, mlPredictions) {
    const merged = { ...patterns };
    
    // Merge visual style predictions
    if (mlPredictions.visualStyle) {
      merged.visualStyle = {
        ...patterns.visualStyle,
        mlPrediction: mlPredictions.visualStyle,
        confidence: (patterns.visualStyle.confidence + mlPredictions.visualStyle.confidence) / 2
      };
    }
    
    // Merge content preferences
    if (mlPredictions.contentPreferences) {
      merged.contentPreferences = {
        ...patterns.contentPreferences,
        mlPrediction: mlPredictions.contentPreferences
      };
    }
    
    // Merge other predictions
    if (mlPredictions.qualityPreference) {
      merged.qualityPreferences = {
        ...patterns.qualityPreferences,
        mlPrediction: mlPredictions.qualityPreference
      };
    }
    
    return merged;
  }

  /**
   * Update user segment based on profile
   * @param {string} userId - User ID
   * @param {Object} userProfile - User profile
   */
  async updateUserSegment(userId, userProfile) {
    try {
      const segmentationModel = this.mlModels.get('userSegmentation');
      
      let segment;
      if (segmentationModel.model) {
        segment = await this.predictUserSegmentML(userProfile);
      } else {
        segment = this.predictUserSegmentRuleBased(userProfile);
      }
      
      // Store segment
      this.userSegments.set(userId, segment);
      
      // Update in database
      await query(
        `INSERT INTO user_segments (user_id, segment_type, segment_data, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id) 
         DO UPDATE SET segment_type = $2, segment_data = $3, updated_at = NOW()`,
        [userId, segment.type, JSON.stringify(segment)]
      );
      
      logger.info('User segment updated', { userId, segment });
    } catch (error) {
      logger.error('Failed to update user segment:', error);
    }
  }

  /**
   * Predict user segment using ML
   * @param {Object} userProfile - User profile
   * @returns {Object} Predicted segment
   */
  async predictUserSegmentML(userProfile) {
    try {
      const features = this.extractSegmentationFeatures(userProfile);
      
      const prompt = `
        Based on the following user profile features, predict the user segment:
        
        Features: ${JSON.stringify(features)}
        
        Available segments:
        1. Power Users - High activity, advanced features, premium tier
        2. Regular Users - Moderate activity, standard features
        3. Casual Users - Low activity, basic features
        4. Content Creators - Focus on creation, high output
        5. Collaborators - High collaboration activity
        
        Return the most appropriate segment with confidence score.
      `;
      
      const result = await aiProviders.openaiGenerateText({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in user segmentation. Analyze user profiles and assign appropriate segments.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        maxTokens: 500,
        temperature: 0.1
      });
      
      const prediction = JSON.parse(result.content);
      return {
        type: prediction.segment,
        confidence: prediction.confidence,
        features: features,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to predict user segment with ML:', error);
      return this.predictUserSegmentRuleBased(userProfile);
    }
  }

  /**
   * Predict user segment using rule-based approach
   * @param {Object} userProfile - User profile
   * @returns {Object} Predicted segment
   */
  predictUserSegmentRuleBased(userProfile) {
    const features = this.extractSegmentationFeatures(userProfile);
    
    let segment = 'Regular Users';
    let confidence = 0.7;
    
    if (features.subscription_tier === 'premium' && features.activity_score > 0.8) {
      segment = 'Power Users';
      confidence = 0.9;
    } else if (features.activity_score < 0.3) {
      segment = 'Casual Users';
      confidence = 0.8;
    } else if (features.creation_score > 0.7) {
      segment = 'Content Creators';
      confidence = 0.8;
    } else if (features.collaboration_score > 0.7) {
      segment = 'Collaborators';
      confidence = 0.8;
    }
    
    return {
      type: segment,
      confidence,
      features,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Extract features for segmentation
   * @param {Object} userProfile - User profile
   * @returns {Object} Segmentation features
   */
  extractSegmentationFeatures(userProfile) {
    return {
      subscription_tier: userProfile.subscriptionTier || 'free',
      activity_score: this.calculateActivityScore(userProfile),
      creation_score: this.calculateCreationScore(userProfile),
      collaboration_score: this.calculateCollaborationScore(userProfile),
      account_age: this.calculateAccountAge(userProfile.createdAt),
      avg_session_duration: userProfile.interactionPatterns?.sessionDuration || 0
    };
  }

  /**
   * Calculate activity score
   * @param {Object} userProfile - User profile
   * @returns {number} Activity score (0-1)
   */
  calculateActivityScore(userProfile) {
    const frequency = userProfile.interactionPatterns?.frequency || 'weekly';
    const sessionDuration = userProfile.interactionPatterns?.sessionDuration || 30;
    
    let score = 0.5;
    
    if (frequency === 'daily') score += 0.3;
    else if (frequency === 'weekly') score += 0.2;
    else if (frequency === 'monthly') score += 0.1;
    
    if (sessionDuration > 60) score += 0.2;
    else if (sessionDuration > 30) score += 0.1;
    
    return Math.min(score, 1.0);
  }

  /**
   * Calculate creation score
   * @param {Object} userProfile - User profile
   * @returns {number} Creation score (0-1)
   */
  calculateCreationScore(userProfile) {
    // This would typically be calculated from actual project data
    // For now, use a placeholder calculation
    return userProfile.learningData?.preferredFormats?.includes('tutorial') ? 0.7 : 0.4;
  }

  /**
   * Calculate collaboration score
   * @param {Object} userProfile - User profile
   * @returns {number} Collaboration score (0-1)
   */
  calculateCollaborationScore(userProfile) {
    const collaborationStyle = userProfile.interactionPatterns?.collaborationStyle || 'independent';
    
    switch (collaborationStyle) {
      case 'collaborator': return 0.9;
      case 'sharer': return 0.7;
      case 'balanced': return 0.5;
      case 'independent': return 0.2;
      default: return 0.3;
    }
  }

  /**
   * Get user profile
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User profile
   */
  async getUserProfile(userId) {
    try {
      // Try cache first
      const cached = await cache.get(`user_profile:${userId}`);
      if (cached) {
        return cached;
      }

      // Get from database
      const result = await query(
        `SELECT up.preferences_data, u.created_at, u.subscription_tier
         FROM user_preferences up
         JOIN users u ON up.user_id = u.id
         WHERE up.user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        // Create default profile
        return await this.createDefaultProfile(userId);
      }

      const profile = {
        ...result.rows[0].preferences_data,
        subscriptionTier: result.rows[0].subscription_tier,
        createdAt: result.rows[0].created_at
      };

      // Cache profile
      await this.cacheUserProfile(userId, profile);
      
      return profile;
    } catch (error) {
      logger.error('Failed to get user profile:', error);
      throw error;
    }
  }

  /**
   * Create default user profile
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Default profile
   */
  async createDefaultProfile(userId) {
    const defaultProfile = {
      visualStyle: 'modern',
      colorPalette: 'vibrant',
      pacing: 'medium',
      musicStyle: 'upbeat',
      voicePreference: 'professional',
      contentCategories: ['technology', 'business', 'education'],
      qualityPreference: 'high',
      lengthPreference: 30,
      frequency: 'weekly',
      interactionPatterns: {
        peakHours: [9, 10, 11, 14, 15, 16],
        preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        sessionDuration: 45,
        collaborationStyle: 'independent'
      },
      learningData: {
        preferredFormats: ['tutorial', 'example', 'template'],
        feedbackResponses: ['positive', 'constructive'],
        adaptationSpeed: 'medium',
        adaptationHistory: []
      },
      personalizationSettings: {
        enabled: true,
        privacyLevel: 'standard',
        dataSharing: false,
        abTestParticipation: true
      }
    };

    // Save to database
    await query(
      `INSERT INTO user_preferences (user_id, preferences_data, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (user_id) 
       DO UPDATE SET preferences_data = $2, updated_at = NOW()`,
      [userId, JSON.stringify(defaultProfile)]
    );

    return defaultProfile;
  }

  /**
   * Analyze visual style preferences
   * @param {Object} behaviorData - User behavior data
   * @param {Object} userProfile - Current user profile
   * @returns {Object} Visual style analysis
   */
  analyzeVisualStyle(behaviorData, userProfile) {
    const { actions, projects, feedback } = behaviorData;
    
    // Analyze project visual choices
    const styleCounts = {};
    const colorCounts = {};
    
    projects.forEach(project => {
      if (project.visualStyle) {
        styleCounts[project.visualStyle] = (styleCounts[project.visualStyle] || 0) + 1;
      }
      if (project.colorPalette) {
        colorCounts[project.colorPalette] = (colorCounts[project.colorPalette] || 0) + 1;
      }
    });

    // Analyze feedback patterns
    const feedbackPatterns = feedback.filter(f => f.type === 'visual');
    const positiveFeedback = feedbackPatterns.filter(f => f.sentiment === 'positive');
    
    // Determine preferred style
    const preferredStyle = Object.keys(styleCounts).reduce((a, b) => 
      styleCounts[a] > styleCounts[b] ? a : b
    );
    
    const preferredColors = Object.keys(colorCounts).reduce((a, b) => 
      colorCounts[a] > colorCounts[b] ? a : b
    );

    return {
      preferredStyle: preferredStyle || userProfile.visualStyle,
      preferredColors: preferredColors || userProfile.colorPalette,
      confidence: this.calculateConfidence(styleCounts, colorCounts, feedbackPatterns),
      adaptations: this.suggestStyleAdaptations(preferredStyle, positiveFeedback)
    };
  }

  /**
   * Analyze content preferences
   * @param {Object} behaviorData - User behavior data
   * @param {Object} userProfile - Current user profile
   * @returns {Object} Content preference analysis
   */
  analyzeContentPreferences(behaviorData, userProfile) {
    const { actions, projects, searches } = behaviorData;
    
    // Analyze content categories
    const categoryCounts = {};
    const topicCounts = {};
    
    projects.forEach(project => {
      if (project.category) {
        categoryCounts[project.category] = (categoryCounts[project.category] || 0) + 1;
      }
      if (project.topics) {
        project.topics.forEach(topic => {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        });
      }
    });

    // Analyze search patterns
    const searchPatterns = searches || [];
    const searchTerms = searchPatterns.map(s => s.query).flat();
    const termCounts = {};
    searchTerms.forEach(term => {
      termCounts[term] = (termCounts[term] || 0) + 1;
    });

    // Determine preferences
    const preferredCategories = Object.keys(categoryCounts).reduce((a, b) => 
      categoryCounts[a] > categoryCounts[b] ? a : b
    );
    
    const trendingTopics = Object.keys(termCounts)
      .sort((a, b) => termCounts[b] - termCounts[a])
      .slice(0, 10);

    return {
      preferredCategories: preferredCategories || userProfile.contentCategories,
      trendingTopics,
      contentLength: this.analyzeContentLength(projects),
      complexity: this.analyzeComplexity(projects),
      adaptations: this.suggestContentAdaptations(preferredCategories, trendingTopics)
    };
  }

  /**
   * Analyze timing patterns
   * @param {Object} behaviorData - User behavior data
   * @param {Object} userProfile - Current user profile
   * @returns {Object} Timing pattern analysis
   */
  analyzeTimingPatterns(behaviorData, userProfile) {
    const { actions, sessions } = behaviorData;
    
    // Analyze session times
    const hourCounts = {};
    const dayCounts = {};
    const sessionDurations = [];
    
    sessions.forEach(session => {
      const hour = new Date(session.startTime).getHours();
      const day = new Date(session.startTime).getDay();
      
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      dayCounts[day] = (dayCounts[day] || 0) + 1;
      
      if (session.duration) {
        sessionDurations.push(session.duration);
      }
    });

    // Calculate patterns
    const peakHours = Object.keys(hourCounts)
      .sort((a, b) => hourCounts[b] - hourCounts[a])
      .slice(0, 3)
      .map(h => parseInt(h));
    
    const preferredDays = Object.keys(dayCounts)
      .sort((a, b) => dayCounts[b] - dayCounts[a])
      .slice(0, 3)
      .map(d => ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][d]);
    
    const avgSessionDuration = sessionDurations.length > 0 
      ? sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length 
      : userProfile.interactionPatterns?.sessionDuration || 45;

    return {
      peakHours,
      preferredDays,
      avgSessionDuration,
      frequency: this.calculateFrequency(sessions),
      adaptations: this.suggestTimingAdaptations(peakHours, avgSessionDuration)
    };
  }

  /**
   * Analyze interaction patterns
   * @param {Object} behaviorData - User behavior data
   * @param {Object} userProfile - Current user profile
   * @returns {Object} Interaction pattern analysis
   */
  analyzeInteractionPatterns(behaviorData, userProfile) {
    const { actions, feedback } = behaviorData;
    
    // Analyze action types
    const actionCounts = {};
    actions.forEach(action => {
      actionCounts[action.type] = (actionCounts[action.type] || 0) + 1;
    });

    // Analyze feature usage
    const featureUsage = {};
    actions.forEach(action => {
      if (action.feature) {
        featureUsage[action.feature] = (featureUsage[action.feature] || 0) + 1;
      }
    });

    // Analyze feedback responses
    const feedbackResponses = feedback.filter(f => f.type === 'interaction');
    const responsePatterns = feedbackResponses.map(f => f.response);

    return {
      preferredActions: Object.keys(actionCounts).reduce((a, b) => 
        actionCounts[a] > actionCounts[b] ? a : b
      ),
      featureUsage,
      feedbackResponsiveness: this.calculateResponsiveness(feedbackResponses),
      collaborationStyle: this.analyzeCollaborationStyle(actions),
      adaptations: this.suggestInteractionAdaptations(actionCounts, featureUsage)
    };
  }

  /**
   * Analyze quality preferences
   * @param {Object} behaviorData - User behavior data
   * @param {Object} userProfile - Current user profile
   * @returns {Object} Quality preference analysis
   */
  analyzeQualityPreferences(behaviorData, userProfile) {
    const { actions, projects, exports } = behaviorData;
    
    // Analyze export quality choices
    const qualityCounts = {};
    const formatCounts = {};
    
    exports.forEach(exportData => {
      if (exportData.quality) {
        qualityCounts[exportData.quality] = (qualityCounts[exportData.quality] || 0) + 1;
      }
      if (exportData.format) {
        formatCounts[exportData.format] = (formatCounts[exportData.format] || 0) + 1;
      }
    });

    // Analyze project settings
    const projectSettings = projects.map(p => p.settings || {});
    const avgRenderTime = projectSettings.reduce((sum, s) => sum + (s.renderTime || 0), 0) / projectSettings.length;

    return {
      preferredQuality: Object.keys(qualityCounts).reduce((a, b) => 
        qualityCounts[a] > qualityCounts[b] ? a : b
      ) || userProfile.qualityPreference,
      preferredFormats: Object.keys(formatCounts),
      avgRenderTime,
      performanceTolerance: this.calculatePerformanceTolerance(actions, avgRenderTime),
      adaptations: this.suggestQualityAdaptations(qualityCounts, avgRenderTime)
    };
  }

  /**
   * Calculate confidence score for preferences
   * @param {Object} styleCounts - Style counts
   * @param {Object} colorCounts - Color counts
   * @param {Array} feedback - Feedback data
   * @returns {number} Confidence score (0-1)
   */
  calculateConfidence(styleCounts, colorCounts, feedback) {
    const totalChoices = Object.values(styleCounts).reduce((a, b) => a + b, 0);
    const maxChoices = Math.max(...Object.values(styleCounts));
    
    const consistencyScore = maxChoices > 0 ? maxChoices / totalChoices : 0;
    
    const positiveFeedbackRatio = feedback.length > 0 
      ? feedback.filter(f => f.sentiment === 'positive').length / feedback.length 
      : 0.5;
    
    return (consistencyScore + positiveFeedbackRatio) / 2;
  }

  /**
   * Suggest style adaptations
   * @param {string} preferredStyle - Preferred style
   * @param {Array} positiveFeedback - Positive feedback
   * @returns {Array} Suggested adaptations
   */
  suggestStyleAdaptations(preferredStyle, positiveFeedback) {
    const adaptations = [];
    
    // Analyze feedback for style suggestions
    const styleFeedback = positiveFeedback.filter(f => f.aspect === 'style');
    const commonThemes = styleFeedback.map(f => f.theme).filter((theme, index, arr) => arr.indexOf(theme) === index);
    
    if (commonThemes.includes('minimalist') && preferredStyle !== 'minimalist') {
      adaptations.push({
        type: 'style_variation',
        suggestion: 'minimal',
        reason: 'Positive feedback on minimalist elements'
      });
    }
    
    if (commonThemes.includes('cinematic') && preferredStyle !== 'cinematic') {
      adaptations.push({
        type: 'style_variation',
        suggestion: 'cinematic',
        reason: 'Positive feedback on cinematic elements'
      });
    }
    
    return adaptations;
  }

  /**
   * Analyze content length preferences
   * @param {Array} projects - User projects
   * @returns {Object} Content length analysis
   */
  analyzeContentLength(projects) {
    const lengths = projects.map(p => p.duration || 0);
    
    if (lengths.length === 0) return { preferred: 30, range: 'short' };
    
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const range = avgLength < 20 ? 'short' : avgLength < 60 ? 'medium' : 'long';
    
    return {
      preferred: Math.round(avgLength),
      range,
      distribution: this.calculateDistribution(lengths)
    };
  }

  /**
   * Analyze content complexity
   * @param {Array} projects - User projects
   * @returns {Object} Complexity analysis
   */
  analyzeComplexity(projects) {
    const complexities = projects.map(p => {
      // Calculate complexity based on various factors
      let complexity = 0;
      
      if (p.settings?.advancedFeatures) complexity += p.settings.advancedFeatures.length * 2;
      if (p.settings?.transitions) complexity += p.settings.transitions.length;
      if (p.settings?.effects) complexity += p.settings.effects.length;
      if (p.settings?.layers) complexity += p.settings.layers.length * 3;
      
      return complexity;
    });
    
    if (complexities.length === 0) return { preferred: 'medium', trend: 'stable' };
    
    const avgComplexity = complexities.reduce((a, b) => a + b, 0) / complexities.length;
    const trend = this.calculateTrend(complexities);
    
    const preferred = avgComplexity < 10 ? 'simple' : avgComplexity < 25 ? 'medium' : 'complex';
    
    return {
      preferred,
      trend,
      score: Math.round(avgComplexity)
    };
  }

  /**
   * Calculate frequency of sessions
   * @param {Array} sessions - User sessions
   * @returns {string} Frequency category
   */
  calculateFrequency(sessions) {
    if (sessions.length === 0) return 'weekly';
    
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const weeklySessions = sessions.filter(s => new Date(s.startTime) > oneWeekAgo).length;
    const monthlySessions = sessions.filter(s => new Date(s.startTime) > oneMonthAgo).length;
    
    if (weeklySessions >= 3) return 'daily';
    if (weeklySessions >= 1) return 'weekly';
    if (monthlySessions >= 1) return 'monthly';
    return 'occasional';
  }

  /**
   * Calculate responsiveness to feedback
   * @param {Array} responses - Feedback responses
   * @returns {number} Responsiveness score
   */
  calculateResponsiveness(responses) {
    if (responses.length === 0) return 0.5;
    
    const responsiveResponses = responses.filter(r => 
      r.includes('thank') || r.includes('helpful') || r.includes('useful')
    ).length;
    
    return responsiveResponses / responses.length;
  }

  /**
   * Analyze collaboration style
   * @param {Array} actions - User actions
   * @returns {string} Collaboration style
   */
  analyzeCollaborationStyle(actions) {
    const collaborationActions = actions.filter(a => 
      a.type === 'collaboration' || a.feature?.includes('share')
    );
    
    if (collaborationActions.length === 0) return 'independent';
    
    const sharingActions = collaborationActions.filter(a => a.type === 'share').length;
    const editingActions = collaborationActions.filter(a => a.type === 'collaborative_edit').length;
    
    if (sharingActions > editingActions) return 'sharer';
    if (editingActions > sharingActions) return 'collaborator';
    return 'balanced';
  }

  /**
   * Calculate performance tolerance
   * @param {Array} actions - User actions
   * @param {number} avgRenderTime - Average render time
   * @returns {string} Performance tolerance
   */
  calculatePerformanceTolerance(actions, avgRenderTime) {
    const qualityActions = actions.filter(a => a.quality);
    
    if (qualityActions.length === 0) return 'medium';
    
    const highQualityCount = qualityActions.filter(a => a.quality === 'high' || a.quality === 'ultra').length;
    const qualityRatio = highQualityCount / qualityActions.length;
    
    if (avgRenderTime > 120 && qualityRatio > 0.7) return 'patient';
    if (avgRenderTime < 30 && qualityRatio < 0.3) return 'fast';
    return 'balanced';
  }

  /**
   * Calculate distribution of values
   * @param {Array} values - Array of values
   * @returns {Object} Distribution statistics
   */
  calculateDistribution(values) {
    if (values.length === 0) return { min: 0, max: 0, median: 0, std: 0 };
    
    const sorted = [...values].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const median = sorted[Math.floor(sorted.length / 2)];
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    
    return { min, max, median, mean, std };
  }

  /**
   * Calculate trend in data
   * @param {Array} values - Array of values over time
   * @returns {string} Trend direction
   */
  calculateTrend(values) {
    if (values.length < 2) return 'stable';
    
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    const change = (secondAvg - firstAvg) / firstAvg;
    
    if (change > 0.1) return 'increasing';
    if (change < -0.1) return 'decreasing';
    return 'stable';
  }

  /**
   * Update user profile with new patterns
   * @param {string} userId - User ID
   * @param {Object} patterns - Analyzed patterns
   * @returns {Promise<Object>} Updated profile
   */
  async updateUserProfile(userId, patterns) {
    try {
      // Get current profile
      const currentProfile = await this.getUserProfile(userId);
      
      // Update profile with new insights
      const updatedProfile = {
        ...currentProfile,
        visualStyle: patterns.visualStyle.preferredStyle || currentProfile.visualStyle,
        colorPalette: patterns.visualStyle.preferredColors || currentProfile.colorPalette,
        contentCategories: Array.isArray(patterns.contentPreferences.preferredCategories) 
          ? patterns.contentPreferences.preferredCategories 
          : currentProfile.contentCategories,
        qualityPreference: patterns.qualityPreferences.preferredQuality || currentProfile.qualityPreference,
        lengthPreference: patterns.contentLength?.preferred || currentProfile.lengthPreference,
        interactionPatterns: {
          ...currentProfile.interactionPatterns,
          peakHours: patterns.timingPatterns.peakHours || currentProfile.interactionPatterns.peakHours,
          preferredDays: patterns.timingPatterns.preferredDays || currentProfile.interactionPatterns.preferredDays,
          sessionDuration: patterns.timingPatterns.avgSessionDuration || currentProfile.interactionPatterns.sessionDuration,
          collaborationStyle: patterns.interactionPatterns.collaborationStyle || currentProfile.interactionPatterns.collaborationStyle
        },
        learningData: {
          ...currentProfile.learningData,
          preferredStyle: patterns.visualStyle.preferredStyle || currentProfile.learningData.preferredStyle,
          preferredQuality: patterns.qualityPreferences.preferredQuality || currentProfile.learningData.preferredQuality,
          adaptationHistory: [
            ...(currentProfile.learningData?.adaptationHistory || []),
            {
              timestamp: new Date().toISOString(),
              patterns,
              confidence: patterns.visualStyle.confidence || 0.5
            }
          ]
        }
      };

      // Save to database
      await query(
        `UPDATE user_preferences 
         SET preferences_data = $1, updated_at = NOW()
         WHERE user_id = $2`,
        [JSON.stringify(updatedProfile), userId]
      );

      return updatedProfile;
    } catch (error) {
      logger.error('Failed to update user profile:', error);
      throw error;
    }
  }

  /**
   * Cache user profile
   * @param {string} userId - User ID
   * @param {Object} profile - User profile
   */
  async cacheUserProfile(userId, profile) {
    await cache.set(`user_profile:${userId}`, profile, 3600); // 1 hour TTL
  }

  /**
   * Get personalized recommendations using hybrid approach
   * @param {string} userId - User ID
   * @param {string} context - Recommendation context
   * @param {Object} options - Additional options
   * @returns {Promise<Array>} Personalized recommendations
   */
  async getPersonalizedRecommendations(userId, context, options = {}) {
    try {
      const userProfile = await this.getUserProfile(userId);
      const userSegment = this.userSegments.get(userId);
      
      const recommendations = [];
      
      // Get collaborative filtering recommendations
      const collaborativeRecs = await this.getCollaborativeFilteringRecommendations(userId, context);
      recommendations.push(...collaborativeRecs);
      
      // Get content-based recommendations
      const contentBasedRecs = await this.getContentBasedRecommendations(userId, context);
      recommendations.push(...contentBasedRecs);
      
      // Get context-aware recommendations
      const contextRecs = await this.getContextAwareRecommendations(userId, context, options);
      recommendations.push(...contextRecs);
      
      // Get template recommendations
      if (context === 'video_creation') {
        const templateRecs = await this.getTemplateRecommendations(userId);
        recommendations.push(...templateRecs);
      }
      
      // Get style recommendations
      if (context === 'video_creation' || context === 'style_discovery') {
        const styleRecs = await this.getStyleRecommendationsML(userProfile);
        recommendations.push(...styleRecs);
      }
      
      // Get feature recommendations
      if (context === 'feature_discovery') {
        const featureRecs = await this.getFeatureRecommendationsML(userProfile, userSegment);
        recommendations.push(...featureRecs);
      }
      
      // Merge and rank recommendations
      const mergedRecommendations = this.mergeAndRankRecommendations(recommendations);
      
      // Apply A/B testing if enabled
      const finalRecommendations = await this.applyABTesting(userId, mergedRecommendations, context);
      
      return finalRecommendations.slice(0, options.limit || 10);
    } catch (error) {
      logger.error('Failed to get personalized recommendations:', error);
      throw error;
    }
  }

  /**
   * Get collaborative filtering recommendations
   * @param {string} userId - User ID
   * @param {string} context - Recommendation context
   * @returns {Promise<Array>} Collaborative filtering recommendations
   */
  async getCollaborativeFilteringRecommendations(userId, context) {
    try {
      const collaborativeModel = this.mlModels.get('collaborativeFiltering');
      
      if (!collaborativeModel.model) {
        return [];
      }
      
      // Find similar users
      const similarUsers = await this.findSimilarUsers(userId);
      
      // Get recommendations based on similar users' preferences
      const recommendations = [];
      
      for (const similarUser of similarUsers) {
        const userProfile = await this.getUserProfile(similarUser.userId);
        
        // Add their preferences as recommendations
        if (context === 'video_creation') {
          recommendations.push({
            type: 'collaborative_style',
            suggestion: userProfile.visualStyle,
            reason: `Users like you prefer ${userProfile.visualStyle} style`,
            confidence: similarUser.similarity * 0.8,
            source: 'collaborative_filtering'
          });
        }
      }
      
      return recommendations;
    } catch (error) {
      logger.error('Failed to get collaborative filtering recommendations:', error);
      return [];
    }
  }

  /**
   * Find similar users for collaborative filtering
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Similar users with similarity scores
   */
  async findSimilarUsers(userId) {
    try {
      const userProfile = await this.getUserProfile(userId);
      
      // Get all user profiles for comparison
      const result = await query(
        `SELECT user_id, preferences_data FROM user_preferences WHERE user_id != $1`,
        [userId]
      );
      
      const similarities = [];
      
      for (const row of result.rows) {
        const otherProfile = row.preferences_data;
        const similarity = this.calculateUserSimilarity(userProfile, otherProfile);
        
        if (similarity > 0.5) {
          similarities.push({
            userId: row.user_id,
            similarity
          });
        }
      }
      
      // Sort by similarity and return top matches
      return similarities.sort((a, b) => b.similarity - a.similarity).slice(0, 10);
    } catch (error) {
      logger.error('Failed to find similar users:', error);
      return [];
    }
  }

  /**
   * Calculate similarity between two users
   * @param {Object} profile1 - First user profile
   * @param {Object} profile2 - Second user profile
   * @returns {number} Similarity score (0-1)
   */
  calculateUserSimilarity(profile1, profile2) {
    let similarity = 0;
    let factors = 0;
    
    // Compare visual style
    if (profile1.visualStyle && profile2.visualStyle) {
      similarity += profile1.visualStyle === profile2.visualStyle ? 1 : 0;
      factors++;
    }
    
    // Compare content categories
    if (profile1.contentCategories && profile2.contentCategories) {
      const commonCategories = profile1.contentCategories.filter(cat => 
        profile2.contentCategories.includes(cat)
      );
      similarity += commonCategories.length / Math.max(profile1.contentCategories.length, profile2.contentCategories.length);
      factors++;
    }
    
    // Compare quality preference
    if (profile1.qualityPreference && profile2.qualityPreference) {
      similarity += profile1.qualityPreference === profile2.qualityPreference ? 1 : 0;
      factors++;
    }
    
    return factors > 0 ? similarity / factors : 0;
  }

  /**
   * Get content-based recommendations
   * @param {string} userId - User ID
   * @param {string} context - Recommendation context
   * @returns {Promise<Array>} Content-based recommendations
   */
  async getContentBasedRecommendations(userId, context) {
    try {
      const userProfile = await this.getUserProfile(userId);
      const recommendations = [];
      
      // Get user's content history
      const contentHistory = await this.getUserContentHistory(userId);
      
      // Analyze content preferences
      const contentAnalysis = await this.analyzeUserContent(contentHistory);
      
      // Generate recommendations based on content analysis
      if (context === 'content_discovery') {
        recommendations.push(...this.generateContentRecommendations(contentAnalysis, userProfile));
      }
      
      return recommendations;
    } catch (error) {
      logger.error('Failed to get content-based recommendations:', error);
      return [];
    }
  }

  /**
   * Get user's content history
   * @param {string} userId - User ID
   * @returns {Promise<Array>} User's content history
   */
  async getUserContentHistory(userId) {
    try {
      const result = await query(
        `SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [userId]
      );
      
      return result.rows;
    } catch (error) {
      logger.error('Failed to get user content history:', error);
      return [];
    }
  }

  /**
   * Analyze user's content
   * @param {Array} contentHistory - User's content history
   * @returns {Promise<Object>} Content analysis
   */
  async analyzeUserContent(contentHistory) {
    try {
      const analysis = {
        styles: {},
        categories: {},
        topics: {},
        quality: {},
        length: []
      };
      
      for (const content of contentHistory) {
        // Analyze style
        if (content.settings?.visualStyle) {
          const style = content.settings.visualStyle;
          analysis.styles[style] = (analysis.styles[style] || 0) + 1;
        }
        
        // Analyze category
        if (content.category) {
          const category = content.category;
          analysis.categories[category] = (analysis.categories[category] || 0) + 1;
        }
        
        // Analyze topics
        if (content.topics) {
          content.topics.forEach(topic => {
            analysis.topics[topic] = (analysis.topics[topic] || 0) + 1;
          });
        }
        
        // Analyze quality
        if (content.settings?.quality) {
          const quality = content.settings.quality;
          analysis.quality[quality] = (analysis.quality[quality] || 0) + 1;
        }
        
        // Analyze length
        if (content.duration) {
          analysis.length.push(content.duration);
        }
      }
      
      return analysis;
    } catch (error) {
      logger.error('Failed to analyze user content:', error);
      return {};
    }
  }

  /**
   * Generate content recommendations
   * @param {Object} contentAnalysis - Content analysis
   * @param {Object} userProfile - User profile
   * @returns {Array} Content recommendations
   */
  generateContentRecommendations(contentAnalysis, userProfile) {
    const recommendations = [];
    
    // Recommend trending topics in preferred categories
    const trendingTopics = [
      { category: 'technology', topics: ['AI', 'machine learning', 'automation'] },
      { category: 'business', topics: ['productivity', 'marketing', 'innovation'] },
      { category: 'education', topics: ['tutorials', 'how-to', 'explanations'] }
    ];
    
    Object.keys(contentAnalysis.categories).forEach(category => {
      const trending = trendingTopics.find(t => t.category === category);
      if (trending) {
        trending.topics.forEach(topic => {
          recommendations.push({
            type: 'content',
            suggestion: topic,
            category,
            reason: `Trending in ${category}`,
            confidence: 0.7,
            source: 'content_based'
          });
        });
      }
    });
    
    return recommendations;
  }

  /**
   * Get context-aware recommendations
   * @param {string} userId - User ID
   * @param {string} context - Recommendation context
   * @param {Object} options - Additional options
   * @returns {Promise<Array>} Context-aware recommendations
   */
  async getContextAwareRecommendations(userId, context, options) {
    try {
      const userProfile = await this.getUserProfile(userId);
      const sessionData = this.sessionData.get(userId);
      const recommendations = [];
      
      // Time-based recommendations
      const currentHour = new Date().getHours();
      const isPeakHour = userProfile.interactionPatterns?.peakHours?.includes(currentHour);
      
      if (context === 'video_creation' && isPeakHour) {
        recommendations.push({
          type: 'contextual',
          suggestion: 'quick_template',
          reason: 'Quick creation during your peak hours',
          confidence: 0.8,
          source: 'context_aware'
        });
      }
      
      // Session-based recommendations
      if (sessionData && sessionData.duration > 30) {
        recommendations.push({
          type: 'contextual',
          suggestion: 'advanced_features',
          reason: 'You might want to try advanced features in this extended session',
          confidence: 0.7,
          source: 'context_aware'
        });
      }
      
      // Device-based recommendations
      if (options.device === 'mobile') {
        recommendations.push({
          type: 'contextual',
          suggestion: 'mobile_optimized_template',
          reason: 'Optimized for mobile editing',
          confidence: 0.9,
          source: 'context_aware'
        });
      }
      
      return recommendations;
    } catch (error) {
      logger.error('Failed to get context-aware recommendations:', error);
      return [];
    }
  }

  /**
   * Get template recommendations
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Template recommendations
   */
  async getTemplateRecommendations(userId) {
    try {
      const userProfile = await this.getUserProfile(userId);
      const recommendations = [];
      
      // Get available templates
      const templates = await this.getAvailableTemplates();
      
      // Filter and rank templates based on user preferences
      const rankedTemplates = templates.map(template => {
        let score = 0;
        
        // Score based on style match
        if (template.style === userProfile.visualStyle) {
          score += 0.3;
        }
        
        // Score based on category match
        if (template.category && userProfile.contentCategories.includes(template.category)) {
          score += 0.3;
        }
        
        // Score based on complexity match
        const userComplexity = userProfile.learningData?.preferredComplexity || 'medium';
        if (template.complexity === userComplexity) {
          score += 0.2;
        }
        
        // Score based on usage popularity
        score += template.popularity * 0.2;
        
        return {
          ...template,
          personalizationScore: score
        };
      });
      
      // Sort by personalization score and return top recommendations
      rankedTemplates.sort((a, b) => b.personalizationScore - a.personalizationScore);
      
      rankedTemplates.slice(0, 5).forEach(template => {
        recommendations.push({
          type: 'template',
          suggestion: template.id,
          name: template.name,
          reason: `Matches your ${template.style} style and ${template.category} interests`,
          confidence: template.personalizationScore,
          source: 'template_recommendation'
        });
      });
      
      return recommendations;
    } catch (error) {
      logger.error('Failed to get template recommendations:', error);
      return [];
    }
  }

  /**
   * Get available templates
   * @returns {Promise<Array>} Available templates
   */
  async getAvailableTemplates() {
    try {
      const result = await query(
        `SELECT * FROM templates WHERE active = true ORDER BY popularity DESC`
      );
      
      return result.rows;
    } catch (error) {
      logger.error('Failed to get available templates:', error);
      return [];
    }
  }

  /**
   * Get style recommendations using ML
   * @param {Object} userProfile - User profile
   * @returns {Promise<Array>} Style recommendations
   */
  async getStyleRecommendationsML(userProfile) {
    try {
      const recommendations = [];
      
      // Use AI to generate style recommendations
      const prompt = `
        Based on the following user profile, recommend 3 visual styles that would appeal to this user:
        
        User Profile:
        - Current Style: ${userProfile.visualStyle}
        - Color Palette: ${userProfile.colorPalette}
        - Content Categories: ${userProfile.contentCategories.join(', ')}
        - Quality Preference: ${userProfile.qualityPreference}
        - Interaction Patterns: ${JSON.stringify(userProfile.interactionPatterns)}
        
        Recommend styles that are:
        1. Similar to their current preferences
        2. Complementary to their style
        3. Trending in their content categories
        
        Format as JSON array with style, reason, and confidence score.
      `;
      
      const result = await aiProviders.openaiGenerateText({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in visual design and user preferences. Provide personalized style recommendations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        maxTokens: 800,
        temperature: 0.3
      });
      
      const styleRecs = JSON.parse(result.content);
      
      styleRecs.forEach(rec => {
        recommendations.push({
          type: 'style',
          suggestion: rec.style,
          reason: rec.reason,
          confidence: rec.confidence,
          source: 'ml_style_recommendation'
        });
      });
      
      return recommendations;
    } catch (error) {
      logger.error('Failed to get ML style recommendations:', error);
      return this.getStyleRecommendations(userProfile);
    }
  }

  /**
   * Get style recommendations based on user profile (fallback)
   * @param {Object} userProfile - User profile
   * @returns {Array} Style recommendations
   */
  getStyleRecommendations(userProfile) {
    const recommendations = [];
    
    // Recommend complementary styles
    const styleComplements = {
      modern: ['minimalist', 'cinematic'],
      minimalist: ['modern', 'elegant'],
      cinematic: ['dramatic', 'epic'],
      cartoon: ['playful', 'colorful'],
      fantasy: ['magical', 'mythical']
    };
    
    const currentStyle = userProfile.visualStyle;
    const complements = styleComplements[currentStyle] || [];
    
    complements.forEach(style => {
      recommendations.push({
        type: 'style',
        suggestion: style,
        reason: `Complements your preferred ${currentStyle} style`,
        confidence: 0.8,
        source: 'rule_based'
      });
    });
    
    return recommendations;
  }

  /**
   * Get feature recommendations using ML
   * @param {Object} userProfile - User profile
   * @param {Object} userSegment - User segment
   * @returns {Promise<Array>} Feature recommendations
   */
  async getFeatureRecommendationsML(userProfile, userSegment) {
    try {
      const recommendations = [];
      
      // Use AI to generate feature recommendations
      const prompt = `
        Based on the following user profile and segment, recommend 3 features that would benefit this user:
        
        User Profile:
        ${JSON.stringify(userProfile)}
        
        User Segment:
        ${JSON.stringify(userSegment)}
        
        Recommend features that:
        1. Match their skill level and usage patterns
        2. Address potential pain points
        3. Enhance their workflow efficiency
        
        Format as JSON array with feature, reason, and confidence score.
      `;
      
      const result = await aiProviders.openaiGenerateText({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in user experience and feature recommendation. Provide personalized feature suggestions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        maxTokens: 800,
        temperature: 0.3
      });
      
      const featureRecs = JSON.parse(result.content);
      
      featureRecs.forEach(rec => {
        recommendations.push({
          type: 'feature',
          suggestion: rec.feature,
          reason: rec.reason,
          confidence: rec.confidence,
          source: 'ml_feature_recommendation'
        });
      });
      
      return recommendations;
    } catch (error) {
      logger.error('Failed to get ML feature recommendations:', error);
      return this.getFeatureRecommendations(userProfile);
    }
  }

  /**
   * Get feature recommendations based on user profile (fallback)
   * @param {Object} userProfile - User profile
   * @returns {Array} Feature recommendations
   */
  getFeatureRecommendations(userProfile) {
    const recommendations = [];
    
    // Recommend features based on usage patterns
    if (userProfile.interactionPatterns.collaborationStyle === 'collaborator') {
      recommendations.push({
        type: 'feature',
        suggestion: 'real-time_collaboration',
        reason: 'Based on your collaborative workflow',
        confidence: 0.9,
        source: 'rule_based'
      });
    }
    
    if (userProfile.qualityPreference === 'high') {
      recommendations.push({
        type: 'feature',
        suggestion: 'advanced_rendering',
        reason: 'For higher quality output',
        confidence: 0.8,
        source: 'rule_based'
      });
    }
    
    if (userProfile.interactionPatterns.avgSessionDuration > 60) {
      recommendations.push({
        type: 'feature',
        suggestion: 'project_templates',
        reason: 'To speed up your workflow',
        confidence: 0.7,
        source: 'rule_based'
      });
    }
    
    return recommendations;
  }

  /**
   * Merge and rank recommendations
   * @param {Array} recommendations - Array of recommendations
   * @returns {Array} Merged and ranked recommendations
   */
  mergeAndRankRecommendations(recommendations) {
    // Group by suggestion to avoid duplicates
    const grouped = {};
    
    recommendations.forEach(rec => {
      const key = `${rec.type}:${rec.suggestion}`;
      if (!grouped[key]) {
        grouped[key] = {
          ...rec,
          sources: [],
          combinedConfidence: 0
        };
      }
      
      grouped[key].sources.push(rec.source);
      grouped[key].combinedConfidence += rec.confidence;
    });
    
    // Calculate average confidence and sort
    const merged = Object.values(grouped).map(rec => ({
      ...rec,
      confidence: rec.combinedConfidence / rec.sources.length
    }));
    
    return merged.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Apply A/B testing to recommendations
   * @param {string} userId - User ID
   * @param {Array} recommendations - Recommendations
   * @param {string} context - Recommendation context
   * @returns {Promise<Array>} Recommendations with A/B testing applied
   */
  async applyABTesting(userId, recommendations, context) {
    try {
      const userProfile = await this.getUserProfile(userId);
      
      if (!userProfile.personalizationSettings?.abTestParticipation) {
        return recommendations;
      }
      
      // Get active A/B tests for this context
      const activeTests = await this.getActiveABTests(context);
      
      for (const test of activeTests) {
        // Check if user is in test group
        const testGroup = await this.getUserTestGroup(userId, test.id);
        
        if (testGroup) {
          // Apply test variation to recommendations
          recommendations = this.applyTestVariation(recommendations, test, testGroup);
        }
      }
      
      return recommendations;
    } catch (error) {
      logger.error('Failed to apply A/B testing:', error);
      return recommendations;
    }
  }

  /**
   * Get active A/B tests
   * @param {string} context - Recommendation context
   * @returns {Promise<Array>} Active A/B tests
   */
  async getActiveABTests(context) {
    try {
      const result = await query(
        `SELECT * FROM ab_tests WHERE status = 'active' AND context = $1`,
        [context]
      );
      
      return result.rows;
    } catch (error) {
      logger.error('Failed to get active A/B tests:', error);
      return [];
    }
  }

  /**
   * Get user's test group
   * @param {string} userId - User ID
   * @param {string} testId - Test ID
   * @returns {Promise<string|null>} Test group
   */
  async getUserTestGroup(userId, testId) {
    try {
      const result = await query(
        `SELECT test_group FROM user_ab_tests WHERE user_id = $1 AND test_id = $2`,
        [userId, testId]
      );
      
      return result.rows.length > 0 ? result.rows[0].test_group : null;
    } catch (error) {
      logger.error('Failed to get user test group:', error);
      return null;
    }
  }

  /**
   * Apply test variation to recommendations
   * @param {Array} recommendations - Recommendations
   * @param {Object} test - A/B test
   * @param {string} testGroup - Test group
   * @returns {Array} Modified recommendations
   */
  applyTestVariation(recommendations, test, testGroup) {
    try {
      const variation = test.variations.find(v => v.group === testGroup);
      
      if (!variation) {
        return recommendations;
      }
      
      // Apply variation logic based on test type
      switch (test.type) {
        case 'ranking':
          return this.applyRankingVariation(recommendations, variation);
        case 'diversity':
          return this.applyDiversityVariation(recommendations, variation);
        case 'novelty':
          return this.applyNoveltyVariation(recommendations, variation);
        default:
          return recommendations;
      }
    } catch (error) {
      logger.error('Failed to apply test variation:', error);
      return recommendations;
    }
  }

  /**
   * Apply ranking variation
   * @param {Array} recommendations - Recommendations
   * @param {Object} variation - Test variation
   * @returns {Array} Modified recommendations
   */
  applyRankingVariation(recommendations, variation) {
    // Modify ranking based on variation parameters
    const factor = variation.parameters.confidence_factor || 1.0;
    
    return recommendations.map(rec => ({
      ...rec,
      confidence: Math.min(rec.confidence * factor, 1.0)
    })).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Apply diversity variation
   * @param {Array} recommendations - Recommendations
   * @param {Object} variation - Test variation
   * @returns {Array} Modified recommendations
   */
  applyDiversityVariation(recommendations, variation) {
    // Ensure diversity in recommendation types
    const maxPerType = variation.parameters.max_per_type || 3;
    const typeCounts = {};
    
    const filtered = recommendations.filter(rec => {
      typeCounts[rec.type] = (typeCounts[rec.type] || 0) + 1;
      return typeCounts[rec.type] <= maxPerType;
    });
    
    return filtered;
  }

  /**
   * Apply novelty variation
   * @param {Array} recommendations - Recommendations
   * @param {Object} variation - Test variation
   * @returns {Array} Modified recommendations
   */
  applyNoveltyVariation(recommendations, variation) {
    // Boost novel recommendations
    const noveltyBoost = variation.parameters.novelty_boost || 0.2;
    
    return recommendations.map(rec => {
      let confidence = rec.confidence;
      
      if (rec.source === 'collaborative_filtering' || rec.source === 'ml_style_recommendation') {
        confidence = Math.min(confidence + noveltyBoost, 1.0);
      }
      
      return { ...rec, confidence };
    }).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Track user interaction with recommendations
   * @param {string} userId - User ID
   * @param {string} recommendationId - Recommendation ID
   * @param {string} action - User action (click, dismiss, convert)
   * @param {Object} metadata - Additional metadata
   */
  async trackRecommendationInteraction(userId, recommendationId, action, metadata = {}) {
    try {
      await query(
        `INSERT INTO recommendation_interactions (user_id, recommendation_id, action, metadata, timestamp)
         VALUES ($1, $2, $3, $4, NOW())`,
        [userId, recommendationId, action, JSON.stringify(metadata)]
      );
      
      // Update A/B test results if applicable
      await this.updateABTestResults(userId, recommendationId, action);
      
      logger.info('Recommendation interaction tracked', { userId, recommendationId, action });
    } catch (error) {
      logger.error('Failed to track recommendation interaction:', error);
    }
  }

  /**
   * Update A/B test results
   * @param {string} userId - User ID
   * @param {string} recommendationId - Recommendation ID
   * @param {string} action - User action
   */
  async updateABTestResults(userId, recommendationId, action) {
    try {
      // Get test information for this recommendation
      const result = await query(
        `SELECT test_id, test_group FROM recommendation_interactions ri
         JOIN user_ab_tests uat ON ri.user_id = uat.user_id
         WHERE ri.recommendation_id = $1 AND ri.user_id = $2
         ORDER BY ri.timestamp DESC LIMIT 1`,
        [recommendationId, userId]
      );
      
      if (result.rows.length > 0) {
        const { testId, testGroup } = result.rows[0];
        
        // Update test metrics
        await query(
          `UPDATE ab_test_results 
           SET ${action}_count = ${action}_count + 1, updated_at = NOW()
           WHERE test_id = $1 AND test_group = $2`,
          [testId, testGroup]
        );
      }
    } catch (error) {
      logger.error('Failed to update A/B test results:', error);
    }
  }

  /**
   * Get personalized content generation parameters
   * @param {string} userId - User ID
   * @param {Object} context - Generation context
   * @returns {Promise<Object>} Personalized parameters
   */
  async getPersonalizedGenerationParameters(userId, context) {
    try {
      const userProfile = await this.getUserProfile(userId);
      const userSegment = this.userSegments.get(userId);
      
      const parameters = {
        // Visual parameters
        visualStyle: userProfile.visualStyle,
        colorPalette: userProfile.colorPalette,
        quality: userProfile.qualityPreference,
        
        // Content parameters
        length: userProfile.lengthPreference,
        pacing: userProfile.pacing,
        musicStyle: userProfile.musicStyle,
        voicePreference: userProfile.voicePreference,
        
        // Technical parameters
        renderingSettings: this.getPersonalizedRenderingSettings(userProfile),
        optimizationSettings: this.getPersonalizedOptimizationSettings(userProfile, userSegment)
      };
      
      // Apply context-specific adjustments
      if (context.purpose === 'social_media') {
        parameters.length = Math.min(parameters.length, 30);
        parameters.format = 'square';
      } else if (context.purpose === 'presentation') {
        parameters.pacing = 'measured';
        parameters.voicePreference = 'professional';
      }
      
      // Apply device-specific adjustments
      if (context.device === 'mobile') {
        parameters.renderingSettings.quality = 'medium';
        parameters.optimizationSettings.speed = 'fast';
      }
      
      return parameters;
    } catch (error) {
      logger.error('Failed to get personalized generation parameters:', error);
      throw error;
    }
  }

  /**
   * Get personalized rendering settings
   * @param {Object} userProfile - User profile
   * @returns {Object} Rendering settings
   */
  getPersonalizedRenderingSettings(userProfile) {
    return {
      quality: userProfile.qualityPreference,
      resolution: userProfile.qualityPreference === 'ultra' ? '4k' : '1080p',
      frameRate: userProfile.interactionPatterns?.collaborationStyle === 'collaborator' ? 30 : 60,
      compression: userProfile.qualityPreference === 'high' ? 'low' : 'medium'
    };
  }

  /**
   * Get personalized optimization settings
   * @param {Object} userProfile - User profile
   * @param {Object} userSegment - User segment
   * @returns {Object} Optimization settings
   */
  getPersonalizedOptimizationSettings(userProfile, userSegment) {
    const settings = {
      speed: 'balanced',
      priority: 'normal'
    };
    
    // Adjust based on user segment
    if (userSegment?.type === 'Power Users') {
      settings.priority = 'high';
    } else if (userSegment?.type === 'Casual Users') {
      settings.speed = 'fast';
    }
    
    // Adjust based on performance tolerance
    if (userProfile.qualityPreferences?.performanceTolerance === 'fast') {
      settings.speed = 'fast';
    } else if (userProfile.qualityPreferences?.performanceTolerance === 'patient') {
      settings.speed = 'quality';
    }
    
    return settings;
  }

  /**
   * Get adaptive UI settings
   * @param {string} userId - User ID
   * @param {Object} context - UI context
   * @returns {Promise<Object>} Adaptive UI settings
   */
  async getAdaptiveUISettings(userId, context) {
    try {
      const userProfile = await this.getUserProfile(userId);
      const sessionData = this.sessionData.get(userId);
      
      const settings = {
        layout: 'default',
        density: 'comfortable',
        features: {
          advanced_panel: false,
          quick_actions: true,
          tutorials: false,
          shortcuts: false
        }
      };
      
      // Adapt based on user segment
      const userSegment = this.userSegments.get(userId);
      if (userSegment?.type === 'Power Users') {
        settings.features.advanced_panel = true;
        settings.features.shortcuts = true;
        settings.density = 'compact';
      } else if (userSegment?.type === 'Casual Users') {
        settings.features.tutorials = true;
        settings.density = 'spacious';
      }
      
      // Adapt based on session duration
      if (sessionData && sessionData.duration > 60) {
        settings.features.quick_actions = true;
      }
      
      // Adapt based on device
      if (context.device === 'mobile') {
        settings.layout = 'mobile';
        settings.density = 'comfortable';
      }
      
      return settings;
    } catch (error) {
      logger.error('Failed to get adaptive UI settings:', error);
      throw error;
    }
  }

  /**
   * Get user-specific workflow optimizations
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Workflow optimizations
   */
  async getWorkflowOptimizations(userId) {
    try {
      const userProfile = await this.getUserProfile(userId);
      const userSegment = this.userSegments.get(userId);
      
      const optimizations = {
        shortcuts: [],
        automation: [],
        templates: [],
        integrations: []
      };
      
      // Generate shortcuts based on frequent actions
      const frequentActions = await this.getFrequentActions(userId);
      frequentActions.forEach(action => {
        optimizations.shortcuts.push({
          action: action.type,
          shortcut: this.generateShortcut(action),
          frequency: action.count
        });
      });
      
      // Generate automation suggestions
      if (userProfile.interactionPatterns.collaborationStyle === 'collaborator') {
        optimizations.automation.push({
          type: 'auto_share',
          description: 'Automatically share projects with team'
        });
      }
      
      // Suggest templates based on usage patterns
      const usedTemplates = await this.getUsedTemplates(userId);
      if (usedTemplates.length > 0) {
        optimizations.templates.push({
          type: 'recent_templates',
          templates: usedTemplates.slice(0, 5)
        });
      }
      
      return optimizations;
    } catch (error) {
      logger.error('Failed to get workflow optimizations:', error);
      throw error;
    }
  }

  /**
   * Get frequent actions for user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Frequent actions
   */
  async getFrequentActions(userId) {
    try {
      const result = await query(
        `SELECT event_data->>'type' as action_type, COUNT(*) as count
         FROM user_behavior_events
         WHERE user_id = $1 AND event_type = 'user_action'
         GROUP BY event_data->>'type'
         ORDER BY count DESC
         LIMIT 10`,
        [userId]
      );
      
      return result.rows.map(row => ({
        type: row.action_type,
        count: parseInt(row.count)
      }));
    } catch (error) {
      logger.error('Failed to get frequent actions:', error);
      return [];
    }
  }

  /**
   * Generate shortcut for action
   * @param {Object} action - Action object
   * @returns {string} Shortcut combination
   */
  generateShortcut(action) {
    const shortcuts = {
      'create_project': 'Ctrl+N',
      'save_project': 'Ctrl+S',
      'export_video': 'Ctrl+E',
      'undo': 'Ctrl+Z',
      'redo': 'Ctrl+Y'
    };
    
    return shortcuts[action.type] || 'Ctrl+?';
  }

  /**
   * Get used templates for user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Used templates
   */
  async getUsedTemplates(userId) {
    try {
      const result = await query(
        `SELECT DISTINCT template_id, COUNT(*) as usage_count
         FROM projects
         WHERE user_id = $1 AND template_id IS NOT NULL
         GROUP BY template_id
         ORDER BY usage_count DESC
         LIMIT 10`,
        [userId]
      );
      
      return result.rows;
    } catch (error) {
      logger.error('Failed to get used templates:', error);
      return [];
    }
  }

  /**
   * Trigger real-time update
   * @param {string} userId - User ID
   * @param {Object} patterns - Updated patterns
   */
  async triggerRealtimeUpdate(userId, patterns) {
    try {
      const update = {
        userId,
        timestamp: new Date().toISOString(),
        patterns,
        type: 'preference_update'
      };
      
      // Store real-time update
      this.realtimeUpdates.set(userId, update);
      
      // Cache for real-time access
      await cache.set(`realtime_update:${userId}`, update, 300); // 5 minutes TTL
      
      // Notify connected clients if WebSocket is available
      if (global.io) {
        global.io.to(`user:${userId}`).emit('preference_update', update);
      }
      
      logger.info('Real-time update triggered', { userId });
    } catch (error) {
      logger.error('Failed to trigger real-time update:', error);
    }
  }

  /**
   * Get real-time updates for user
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Real-time update
   */
  async getRealtimeUpdates(userId) {
    try {
      // Try cache first
      const cached = await cache.get(`realtime_update:${userId}`);
      if (cached) {
        return cached;
      }
      
      // Fallback to memory
      return this.realtimeUpdates.get(userId) || null;
    } catch (error) {
      logger.error('Failed to get real-time updates:', error);
      return null;
    }
  }

  /**
   * Update session data
   * @param {string} userId - User ID
   * @param {Object} sessionData - Session data
   */
  updateSessionData(userId, sessionData) {
    try {
      const currentSession = this.sessionData.get(userId) || {
        startTime: new Date(),
        actions: [],
        duration: 0
      };
      
      // Update session data
      const updatedSession = {
        ...currentSession,
        ...sessionData,
        lastUpdate: new Date(),
        duration: sessionData.duration || currentSession.duration
      };
      
      this.sessionData.set(userId, updatedSession);
      
      logger.debug('Session data updated', { userId });
    } catch (error) {
      logger.error('Failed to update session data:', error);
    }
  }

  /**
   * Get personalization performance metrics
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Performance metrics
   */
  async getPersonalizationMetrics(userId, options = {}) {
    try {
      const { timeframe = '30d' } = options;
      const dateRange = this.calculateDateRange(timeframe);
      
      // Get recommendation performance
      const recommendationResult = await query(
        `SELECT 
           COUNT(*) as total_recommendations,
           COUNT(CASE WHEN action = 'click' THEN 1 END) as clicks,
           COUNT(CASE WHEN action = 'convert' THEN 1 END) as conversions,
           AVG(CASE WHEN action = 'click' THEN 
             EXTRACT(EPOCH FROM (timestamp - created_at)) / 60 
           END) as avg_time_to_click
         FROM recommendation_interactions ri
         JOIN recommendations r ON ri.recommendation_id = r.id
         WHERE ri.user_id = $1 AND ri.timestamp BETWEEN $2 AND $3`,
        [userId, dateRange.start, dateRange.end]
      );
      
      // Get user satisfaction metrics
      const satisfactionResult = await query(
        `SELECT 
           AVG(rating) as avg_rating,
           COUNT(*) as total_ratings
         FROM user_feedback
         WHERE user_id = $1 AND created_at BETWEEN $2 AND $3`,
        [userId, dateRange.start, dateRange.end]
      );
      
      // Get engagement metrics
      const engagementResult = await query(
        `SELECT 
           COUNT(DISTINCT session_id) as sessions,
           AVG(session_duration) as avg_session_duration,
           COUNT(*) as total_actions
         FROM user_behavior_events
         WHERE user_id = $1 AND timestamp BETWEEN $2 AND $3`,
        [userId, dateRange.start, dateRange.end]
      );
      
      const recMetrics = recommendationResult.rows[0];
      const satMetrics = satisfactionResult.rows[0];
      const engMetrics = engagementResult.rows[0];
      
      return {
        timeframe,
        recommendations: {
          total: parseInt(recMetrics.total_recommendations) || 0,
          clicks: parseInt(recMetrics.clicks) || 0,
          conversions: parseInt(recMetrics.conversions) || 0,
          ctr: recMetrics.total_recommendations > 0 
            ? (recMetrics.clicks / recMetrics.total_recommendations) * 100 
            : 0,
          conversionRate: recMetrics.clicks > 0 
            ? (recMetrics.conversions / recMetrics.clicks) * 100 
            : 0,
          avgTimeToClick: parseFloat(recMetrics.avg_time_to_click) || 0
        },
        satisfaction: {
          avgRating: parseFloat(satMetrics.avg_rating) || 0,
          totalRatings: parseInt(satMetrics.total_ratings) || 0
        },
        engagement: {
          sessions: parseInt(engMetrics.sessions) || 0,
          avgSessionDuration: parseFloat(engMetrics.avg_session_duration) || 0,
          totalActions: parseInt(engMetrics.total_actions) || 0
        }
      };
    } catch (error) {
      logger.error('Failed to get personalization metrics:', error);
      throw error;
    }
  }

  /**
   * Calculate date range based on timeframe
   * @param {string} timeframe - Timeframe string
   * @returns {Object} Date range with start and end
   */
  calculateDateRange(timeframe) {
    const now = new Date();
    const end = now.toISOString();
    
    let start;
    const value = parseInt(timeframe);
    
    if (timeframe.endsWith('d')) {
      start = new Date(now.getTime() - (value * 24 * 60 * 60 * 1000));
    } else if (timeframe.endsWith('h')) {
      start = new Date(now.getTime() - (value * 60 * 60 * 1000));
    } else if (timeframe.endsWith('m')) {
      start = new Date(now.getTime() - (value * 60 * 1000));
    } else {
      // Default to 30 days
      start = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    }
    
    return {
      start: start.toISOString(),
      end
    };
  }

  /**
   * Start event processing loop
   */
  startEventProcessing() {
    setInterval(async () => {
      if (this.eventBuffer.length > 0) {
        const events = this.eventBuffer.splice(0, 100); // Process in batches
        await this.processEventBatch(events);
      }
    }, 5000); // Process every 5 seconds
  }

  /**
   * Process batch of events
   * @param {Array} events - Array of events
   */
  async processEventBatch(events) {
    try {
      // Group events by user
      const userEvents = {};
      events.forEach(event => {
        if (!userEvents[event.userId]) {
          userEvents[event.userId] = [];
        }
        userEvents[event.userId].push(event);
      });
      
      // Process events for each user
      for (const [userId, events] of Object.entries(userEvents)) {
        await this.processUserEvents(userId, events);
      }
      
      logger.debug('Processed event batch', { eventCount: events.length });
    } catch (error) {
      logger.error('Failed to process event batch:', error);
    }
  }

  /**
   * Process events for a specific user
   * @param {string} userId - User ID
   * @param {Array} events - Array of events
   */
  async processUserEvents(userId, events) {
    try {
      // Update session data
      const sessionEvents = events.filter(e => e.sessionId);
      if (sessionEvents.length > 0) {
        const sessionId = sessionEvents[0].sessionId;
        const sessionDuration = this.calculateSessionDuration(sessionEvents);
        
        this.updateSessionData(userId, {
          sessionId,
          duration: sessionDuration,
          actions: events
        });
      }
      
      // Trigger real-time updates for significant events
      const significantEvents = events.filter(e => 
        e.type === 'user_feedback' || 
        (e.type === 'user_action' && ['project_created', 'video_exported'].includes(e.data.type))
      );
      
      if (significantEvents.length > 0) {
        await this.triggerRealtimeUpdate(userId, {
          type: 'significant_activity',
          events: significantEvents
        });
      }
    } catch (error) {
      logger.error('Failed to process user events:', error);
    }
  }

  /**
   * Calculate session duration from events
   * @param {Array} events - Array of events
   * @returns {number} Session duration in seconds
   */
  calculateSessionDuration(events) {
    if (events.length === 0) return 0;
    
    const timestamps = events.map(e => new Date(e.timestamp));
    const start = Math.min(...timestamps);
    const end = Math.max(...timestamps);
    
    return Math.floor((end - start) / 1000);
  }

  /**
   * Start A/B test evaluation
   */
  startABTestEvaluation() {
    setInterval(async () => {
      await this.evaluateABTests();
    }, 60000 * 60); // Evaluate every hour
  }

  /**
   * Evaluate A/B tests
   */
  async evaluateABTests() {
    try {
      const activeTests = await query(
        `SELECT * FROM ab_tests WHERE status = 'active'`
      );
      
      for (const test of activeTests.rows) {
        await this.evaluateABTest(test);
      }
    } catch (error) {
      logger.error('Failed to evaluate A/B tests:', error);
    }
  }

  /**
   * Evaluate individual A/B test
   * @param {Object} test - A/B test
   */
  async evaluateABTest(test) {
    try {
      // Get test results
      const result = await query(
        `SELECT test_group, 
           SUM(click_count) as clicks,
           SUM(convert_count) as conversions,
           SUM(impression_count) as impressions
         FROM ab_test_results
         WHERE test_id = $1
         GROUP BY test_group`,
        [test.id]
      );
      
      // Calculate statistical significance
      const evaluation = this.calculateTestSignificance(result.rows, test.goal);
      
      // Update test status if significant
      if (evaluation.significant) {
        await query(
          `UPDATE ab_tests 
           SET status = 'completed', 
               winning_group = $1,
               confidence = $2,
               completed_at = NOW()
           WHERE id = $3`,
          [evaluation.winner, evaluation.confidence, test.id]
        );
        
        logger.info('A/B test completed', { 
          testId: test.id, 
          winner: evaluation.winner,
          confidence: evaluation.confidence
        });
      }
    } catch (error) {
      logger.error('Failed to evaluate A/B test:', error);
    }
  }

  /**
   * Calculate statistical significance for A/B test
   * @param {Array} results - Test results
   * @param {string} goal - Test goal
   * @returns {Object} Significance evaluation
   */
  calculateTestSignificance(results, goal) {
    // Simplified significance calculation
    // In production, use proper statistical tests like chi-square or t-test
    
    if (results.length < 2) {
      return { significant: false };
    }
    
    let winner = null;
    let maxConversionRate = 0;
    
    results.forEach(result => {
      const conversionRate = result.impressions > 0 
        ? (result.conversions / result.impressions) * 100 
        : 0;
      
      if (conversionRate > maxConversionRate) {
        maxConversionRate = conversionRate;
        winner = result.test_group;
      }
    });
    
    // Simple significance check (in production, use proper statistical test)
    const confidence = maxConversionRate > 5 ? 0.95 : 0.5;
    
    return {
      significant: confidence > 0.8,
      winner,
      confidence
    };
  }

  /**
   * Collect user feedback
   * @param {string} userId - User ID
   * @param {Object} feedback - Feedback data
   */
  async collectUserFeedback(userId, feedback) {
    try {
      await query(
        `INSERT INTO user_feedback (user_id, feedback_type, feedback_data, rating, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [userId, feedback.type, JSON.stringify(feedback.data), feedback.rating]
      );
      
      // Update personalization model based on feedback
      await this.updatePersonalizationFromFeedback(userId, feedback);
      
      logger.info('User feedback collected', { userId, feedback });
    } catch (error) {
      logger.error('Failed to collect user feedback:', error);
    }
  }

  /**
   * Update personalization based on feedback
   * @param {string} userId - User ID
   * @param {Object} feedback - Feedback data
   */
  async updatePersonalizationFromFeedback(userId, feedback) {
    try {
      const userProfile = await this.getUserProfile(userId);
      
      // Update profile based on feedback
      if (feedback.type === 'recommendation') {
        // Update recommendation preferences
        if (feedback.data.rating < 3) {
          // Negative feedback - adjust preferences
          userProfile.learningData.feedbackResponses.push('negative');
        } else {
          // Positive feedback - reinforce preferences
          userProfile.learningData.feedbackResponses.push('positive');
        }
      }
      
      // Save updated profile
      await this.updateUserProfile(userId, {
        visualStyle: { preferredStyle: userProfile.visualStyle },
        contentPreferences: { preferredCategories: userProfile.contentCategories },
        qualityPreferences: { preferredQuality: userProfile.qualityPreference },
        timingPatterns: userProfile.interactionPatterns,
        interactionPatterns: userProfile.interactionPatterns
      });
      
    } catch (error) {
      logger.error('Failed to update personalization from feedback:', error);
    }
  }

  /**
   * Ensure privacy compliance
   * @param {string} userId - User ID
   * @param {Object} options - Privacy options
   */
  async ensurePrivacyCompliance(userId, options) {
    try {
      const userProfile = await this.getUserProfile(userId);
      const privacyLevel = userProfile.personalizationSettings?.privacyLevel || 'standard';
      
      // Apply privacy settings based on level
      switch (privacyLevel) {
        case 'strict':
          // Limit data collection and usage
          await this.applyStrictPrivacy(userId);
          break;
        case 'standard':
          // Default privacy settings
          await this.applyStandardPrivacy(userId);
          break;
        case 'permissive':
          // Allow more data usage for better personalization
          await this.applyPermissivePrivacy(userId);
          break;
      }
      
      // Handle data deletion requests
      if (options.deleteData) {
        await this.deleteUserData(userId);
      }
      
      // Handle data export requests
      if (options.exportData) {
        return await this.exportUserData(userId);
      }
      
    } catch (error) {
      logger.error('Failed to ensure privacy compliance:', error);
      throw error;
    }
  }

  /**
   * Apply strict privacy settings
   * @param {string} userId - User ID
   */
  async applyStrictPrivacy(userId) {
    try {
      // Disable personalized recommendations
      await query(
        `UPDATE user_preferences 
         SET preferences_data = jsonb_set(
           jsonb_set(preferences_data, '{personalizationSettings,enabled}', 'false'::jsonb),
           '{personalizationSettings,dataSharing}', 'false'::jsonb
         )
         WHERE user_id = $1`,
        [userId]
      );
      
      // Clear behavior history
      await query(
        `DELETE FROM user_behavior_events WHERE user_id = $1`,
        [userId]
      );
      
    } catch (error) {
      logger.error('Failed to apply strict privacy:', error);
    }
  }

  /**
   * Apply standard privacy settings
   * @param {string} userId - User ID
   */
  async applyStandardPrivacy(userId) {
    try {
      // Enable personalization but limit data sharing
      await query(
        `UPDATE user_preferences 
         SET preferences_data = jsonb_set(
           jsonb_set(preferences_data, '{personalizationSettings,enabled}', 'true'::jsonb),
           '{personalizationSettings,dataSharing}', 'false'::jsonb
         )
         WHERE user_id = $1`,
        [userId]
      );
      
    } catch (error) {
      logger.error('Failed to apply standard privacy:', error);
    }
  }

  /**
   * Apply permissive privacy settings
   * @param {string} userId - User ID
   */
  async applyPermissivePrivacy(userId) {
    try {
      // Enable all personalization features
      await query(
        `UPDATE user_preferences 
         SET preferences_data = jsonb_set(
           jsonb_set(preferences_data, '{personalizationSettings,enabled}', 'true'::jsonb),
           '{personalizationSettings,dataSharing}', 'true'::jsonb
         )
         WHERE user_id = $1`,
        [userId]
      );
      
    } catch (error) {
      logger.error('Failed to apply permissive privacy:', error);
    }
  }

  /**
   * Delete user data
   * @param {string} userId - User ID
   */
  async deleteUserData(userId) {
    try {
      // Delete behavior events
      await query(`DELETE FROM user_behavior_events WHERE user_id = $1`, [userId]);
      
      // Delete recommendation interactions
      await query(`DELETE FROM recommendation_interactions WHERE user_id = $1`, [userId]);
      
      // Delete user feedback
      await query(`DELETE FROM user_feedback WHERE user_id = $1`, [userId]);
      
      // Delete user segments
      await query(`DELETE FROM user_segments WHERE user_id = $1`, [userId]);
      
      // Clear cached data
      await cache.del(`user_profile:${userId}`);
      await cache.del(`realtime_update:${userId}`);
      
      // Clear in-memory data
      this.userProfiles.delete(userId);
      this.userSegments.delete(userId);
      this.realtimeUpdates.delete(userId);
      this.sessionData.delete(userId);
      
      logger.info('User data deleted', { userId });
    } catch (error) {
      logger.error('Failed to delete user data:', error);
    }
  }

  /**
   * Export user data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User data export
   */
  async exportUserData(userId) {
    try {
      const userProfile = await this.getUserProfile(userId);
      const userSegment = this.userSegments.get(userId);
      
      // Get behavior events
      const behaviorResult = await query(
        `SELECT * FROM user_behavior_events WHERE user_id = $1 ORDER BY timestamp DESC`,
        [userId]
      );
      
      // Get recommendation interactions
      const recommendationResult = await query(
        `SELECT * FROM recommendation_interactions WHERE user_id = $1 ORDER BY timestamp DESC`,
        [userId]
      );
      
      // Get user feedback
      const feedbackResult = await query(
        `SELECT * FROM user_feedback WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
      );
      
      return {
        userProfile,
        userSegment,
        behaviorEvents: behaviorResult.rows,
        recommendationInteractions: recommendationResult.rows,
        feedback: feedbackResult.rows,
        exportedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to export user data:', error);
      throw error;
    }
  }

  /**
   * Integration with content analysis service
   * @param {string} userId - User ID
   * @param {Object} contentAnalysis - Content analysis results
   */
  async integrateContentAnalysis(userId, contentAnalysis) {
    try {
      // Update user preferences based on content analysis
      const userProfile = await this.getUserProfile(userId);
      
      // Extract insights from content analysis
      const insights = this.extractContentInsights(contentAnalysis);
      
      // Update profile with insights
      const updatedProfile = {
        ...userProfile,
        contentInsights: {
          ...userProfile.contentInsights,
          ...insights,
          lastUpdated: new Date().toISOString()
        }
      };
      
      await this.updateUserProfile(userId, {
        visualStyle: { preferredStyle: updatedProfile.visualStyle },
        contentPreferences: { preferredCategories: updatedProfile.contentCategories },
        qualityPreferences: { preferredQuality: updatedProfile.qualityPreference },
        timingPatterns: updatedProfile.interactionPatterns,
        interactionPatterns: updatedProfile.interactionPatterns
      });
      
      logger.info('Content analysis integrated', { userId });
    } catch (error) {
      logger.error('Failed to integrate content analysis:', error);
    }
  }

  /**
   * Extract insights from content analysis
   * @param {Object} contentAnalysis - Content analysis results
   * @returns {Object} Extracted insights
   */
  extractContentInsights(contentAnalysis) {
    const insights = {};
    
    // Extract style preferences
    if (contentAnalysis.styleAnalysis) {
      insights.stylePreferences = {
        artStyle: contentAnalysis.styleAnalysis.artStyle,
        colorPalette: contentAnalysis.styleAnalysis.dominantColors,
        mood: contentAnalysis.styleAnalysis.mood
      };
    }
    
    // Extract content preferences
    if (contentAnalysis.topicExtraction) {
      insights.contentPreferences = {
        topics: contentAnalysis.topicExtraction.mainTopics?.map(t => t.topic),
        categories: contentAnalysis.topicExtraction.categories
      };
    }
    
    // Extract quality preferences
    if (contentAnalysis.qualityAssessment) {
      insights.qualityPreferences = {
        preferredQuality: contentAnalysis.qualityAssessment.overall > 0.8 ? 'high' : 'medium',
        technicalPreferences: {
          resolution: contentAnalysis.qualityAssessment.technicalDetails?.resolution,
          format: contentAnalysis.qualityAssessment.technicalDetails?.format
        }
      };
    }
    
    return insights;
  }

  /**
   * Integration with video generation pipeline
   * @param {string} userId - User ID
   * @param {Object} generationParams - Generation parameters
   * @returns {Promise<Object>} Enhanced generation parameters
   */
  async integrateWithVideoGeneration(userId, generationParams) {
    try {
      // Get personalized parameters
      const personalizedParams = await this.getPersonalizedGenerationParameters(userId, {
        purpose: generationParams.purpose || 'general',
        device: generationParams.device || 'desktop'
      });
      
      // Merge with provided parameters
      const enhancedParams = {
        ...generationParams,
        ...personalizedParams,
        personalizationApplied: true
      };
      
      // Track generation for learning
      await this.trackVideoGeneration(userId, enhancedParams);
      
      return enhancedParams;
    } catch (error) {
      logger.error('Failed to integrate with video generation:', error);
      return generationParams;
    }
  }

  /**
   * Track video generation for learning
   * @param {string} userId - User ID
   * @param {Object} generationParams - Generation parameters
   */
  async trackVideoGeneration(userId, generationParams) {
    try {
      await query(
        `INSERT INTO video_generation_tracking (user_id, generation_params, created_at)
         VALUES ($1, $2, NOW())`,
        [userId, JSON.stringify(generationParams)]
      );
      
      logger.debug('Video generation tracked', { userId });
    } catch (error) {
      logger.error('Failed to track video generation:', error);
    }
  }
}

module.exports = new PersonalizationService();
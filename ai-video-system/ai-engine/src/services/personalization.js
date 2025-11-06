const logger = require('../utils/logger');
const { query } = require('../database/connection');
const { cache } = require('../services/redis');

class PersonalizationService {
  constructor() {
    this.userProfiles = new Map();
    this.stylePreferences = new Map();
    this.contentHistory = new Map();
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
      
      // Analyze behavior patterns
      const patterns = this.analyzeBehaviorPatterns(behaviorData, userProfile);
      
      // Update user profile with new insights
      userProfile = await this.updateUserProfile(userId, patterns);
      
      // Cache updated profile
      await this.cacheUserProfile(userId, userProfile);
      
      logger.info('User preferences updated', { userId, patterns });
      return userProfile;
    } catch (error) {
      logger.error('Failed to learn user preferences:', error);
      throw error;
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
        sessionDuration: 45
      },
      learningData: {
        preferredFormats: ['tutorial', 'example', 'template'],
        feedbackResponses: ['positive', 'constructive'],
        adaptationSpeed: 'medium'
      }
    };

    // Save to database
    await query(
      `UPDATE user_preferences 
       SET preferences_data = $1, updated_at = NOW()
       WHERE user_id = $2`,
      [JSON.stringify(defaultProfile), userId]
    );

    return defaultProfile;
  }

  /**
   * Analyze behavior patterns
   * @param {Object} behaviorData - User behavior data
   * @param {Object} userProfile - Current user profile
   * @returns {Object} Analyzed patterns
   */
  analyzeBehaviorPatterns(behaviorData, userProfile) {
    const patterns = {
      visualStyle: this.analyzeVisualStyle(behaviorData, userProfile),
      contentPreferences: this.analyzeContentPreferences(behaviorData, userProfile),
      timingPatterns: this.analyzeTimingPatterns(behaviorData, userProfile),
      interactionPatterns: this.analyzeInteractionPatterns(behaviorData, userProfile),
      qualityPreferences: this.analyzeQualityPreferences(behaviorData, userProfile)
    };

    return patterns;
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
    
    exports.forEach(export => {
      if (export.quality) {
        qualityCounts[export.quality] = (qualityCounts[export.quality] || 0) + 1;
      }
      if (export.format) {
        formatCounts[export.format] = (formatCounts[export.format] || 0) + 1;
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
    
    if (commonThemes.includes('minimalist') && preferredStyle !== 'minimal') {
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
        visualStyle: patterns.visualStyle.preferredStyle,
        colorPalette: patterns.visualStyle.preferredColors,
        contentCategories: patterns.contentPreferences.preferredCategories,
        qualityPreference: patterns.qualityPreferences.preferredQuality,
        lengthPreference: patterns.contentLength.preferred,
        interactionPatterns: {
          ...currentProfile.interactionPatterns,
          peakHours: patterns.timingPatterns.peakHours,
          preferredDays: patterns.timingPatterns.preferredDays,
          sessionDuration: patterns.timingPatterns.avgSessionDuration,
          collaborationStyle: patterns.interactionPatterns.collaborationStyle
        },
        learningData: {
          ...currentProfile.learningData,
          preferredStyle: patterns.visualStyle.preferredStyle,
          preferredQuality: patterns.qualityPreferences.preferredQuality,
          adaptationHistory: [
            ...(currentProfile.learningData?.adaptationHistory || []),
            {
              timestamp: new Date().toISOString(),
              patterns,
              confidence: patterns.visualStyle.confidence
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
   * Get personalized recommendations
   * @param {string} userId - User ID
   * @param {string} context - Recommendation context
   * @returns {Promise<Array>} Personalized recommendations
   */
  async getPersonalizedRecommendations(userId, context) {
    try {
      const userProfile = await this.getUserProfile(userId);
      
      const recommendations = [];
      
      // Style recommendations
      if (context === 'video_creation') {
        recommendations.push(...this.getStyleRecommendations(userProfile));
      }
      
      // Content recommendations
      if (context === 'content_discovery') {
        recommendations.push(...this.getContentRecommendations(userProfile));
      }
      
      // Feature recommendations
      if (context === 'feature_discovery') {
        recommendations.push(...this.getFeatureRecommendations(userProfile));
      }
      
      return recommendations;
    } catch (error) {
      logger.error('Failed to get personalized recommendations:', error);
      throw error;
    }
  }

  /**
   * Get style recommendations based on user profile
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
        confidence: 0.8
      });
    });
    
    return recommendations;
  }

  /**
   * Get content recommendations based on user profile
   * @param {Object} userProfile - User profile
   * @returns {Array} Content recommendations
   */
  getContentRecommendations(userProfile) {
    const recommendations = [];
    
    // Recommend trending topics in preferred categories
    const trendingTopics = [
      { category: 'technology', topics: ['AI', 'machine learning', 'automation'] },
      { category: 'business', topics: ['productivity', 'marketing', 'innovation'] },
      { category: 'education', topics: ['tutorials', 'how-to', 'explanations'] }
    ];
    
    userProfile.contentCategories.forEach(category => {
      const trending = trendingTopics.find(t => t.category === category);
      if (trending) {
        trending.topics.forEach(topic => {
          recommendations.push({
            type: 'content',
            suggestion: topic,
            category,
            reason: `Trending in ${category}`,
            confidence: 0.7
          });
        });
      }
    });
    
    return recommendations;
  }

  /**
   * Get feature recommendations based on user profile
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
        confidence: 0.9
      });
    }
    
    if (userProfile.qualityPreference === 'high') {
      recommendations.push({
        type: 'feature',
        suggestion: 'advanced_rendering',
        reason: 'For higher quality output',
        confidence: 0.8
      });
    }
    
    if (userProfile.interactionPatterns.avgSessionDuration > 60) {
      recommendations.push({
        type: 'feature',
        suggestion: 'project_templates',
        reason: 'To speed up your workflow',
        confidence: 0.7
      });
    }
    
    return recommendations;
  }
}

module.exports = new PersonalizationService();
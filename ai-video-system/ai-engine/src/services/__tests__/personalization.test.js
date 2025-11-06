const personalizationService = require('../personalization');
const { query } = require('../../database/connection');

describe('Personalization Service', () => {
  beforeEach(async () => {
    // Clean up test data before each test
    await query('DELETE FROM user_behavior_events WHERE user_id LIKE $1', ['test_%']);
    await query('DELETE FROM user_segments WHERE user_id LIKE $1', ['test_%']);
    await query('DELETE FROM recommendations WHERE user_id LIKE $1', ['test_%']);
    await query('DELETE FROM recommendation_interactions WHERE user_id LIKE $1', ['test_%']);
    await query('DELETE FROM user_feedback WHERE user_id LIKE $1', ['test_%']);
  });

  describe('User Profile Management', () => {
    test('should create default profile for new user', async () => {
      const userId = 'test_user_new';
      
      const profile = await personalizationService.getUserProfile(userId);
      
      expect(profile).toBeDefined();
      expect(profile.visualStyle).toBe('modern');
      expect(profile.colorPalette).toBe('vibrant');
      expect(profile.contentCategories).toContain('technology');
      expect(profile.qualityPreference).toBe('high');
    });

    test('should learn user preferences from behavior', async () => {
      const userId = 'test_user_learn';
      const behaviorData = {
        actions: [
          { type: 'project_created', feature: 'video_editor' },
          { type: 'template_used', feature: 'modern_template' }
        ],
        projects: [
          { visualStyle: 'modern', category: 'business', duration: 30 }
        ],
        feedback: [
          { type: 'visual', sentiment: 'positive', aspect: 'style' }
        ]
      };

      const updatedProfile = await personalizationService.learnUserPreferences(userId, behaviorData);
      
      expect(updatedProfile).toBeDefined();
      expect(updatedProfile.visualStyle).toBe('modern');
    });

    test('should update user profile with patterns', async () => {
      const userId = 'test_user_update';
      const patterns = {
        visualStyle: {
          preferredStyle: 'cinematic',
          preferredColors: 'dramatic',
          confidence: 0.8
        },
        contentPreferences: {
          preferredCategories: ['education'],
          trendingTopics: ['tutorials', 'how-to']
        }
      };

      const updatedProfile = await personalizationService.updateUserProfile(userId, patterns);
      
      expect(updatedProfile.visualStyle).toBe('cinematic');
      expect(updatedProfile.contentCategories).toContain('education');
    });
  });

  describe('User Segmentation', () => {
    test('should segment user based on profile', async () => {
      const userId = 'test_user_segment';
      const userProfile = {
        subscriptionTier: 'premium',
        interactionPatterns: {
          frequency: 'daily',
          sessionDuration: 90
        }
      };

      await personalizationService.updateUserSegment(userId, userProfile);
      const segment = personalizationService.userSegments.get(userId);
      
      expect(segment).toBeDefined();
      expect(segment.type).toBe('Power Users');
      expect(segment.confidence).toBeGreaterThan(0.8);
    });

    test('should predict user segment using ML', async () => {
      const userId = 'test_user_ml_segment';
      const userProfile = {
        subscriptionTier: 'free',
        interactionPatterns: {
          frequency: 'weekly',
          sessionDuration: 30
        }
      };

      const segment = await personalizationService.predictUserSegmentML(userProfile);
      
      expect(segment).toBeDefined();
      expect(segment.type).toBeOneOf(['Power Users', 'Regular Users', 'Casual Users', 'Content Creators', 'Collaborators']);
      expect(segment.confidence).toBeGreaterThan(0);
    });
  });

  describe('Recommendations', () => {
    test('should get personalized recommendations', async () => {
      const userId = 'test_user_recommendations';
      const context = 'video_creation';

      const recommendations = await personalizationService.getPersonalizedRecommendations(userId, context);
      
      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);
    });

    test('should get collaborative filtering recommendations', async () => {
      const userId = 'test_user_collaborative';
      const context = 'video_creation';

      const recommendations = await personalizationService.getCollaborativeFilteringRecommendations(userId, context);
      
      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);
    });

    test('should get content-based recommendations', async () => {
      const userId = 'test_user_content';
      const context = 'content_discovery';

      const recommendations = await personalizationService.getContentBasedRecommendations(userId, context);
      
      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);
    });

    test('should get template recommendations', async () => {
      const userId = 'test_user_templates';

      const recommendations = await personalizationService.getTemplateRecommendations(userId);
      
      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations[0].type).toBe('template');
    });

    test('should merge and rank recommendations', async () => {
      const recommendations = [
        { type: 'style', suggestion: 'modern', confidence: 0.8, source: 'collaborative_filtering' },
        { type: 'style', suggestion: 'modern', confidence: 0.6, source: 'content_based' },
        { type: 'template', suggestion: 'business', confidence: 0.9, source: 'template_recommendation' }
      ];

      const merged = personalizationService.mergeAndRankRecommendations(recommendations);
      
      expect(merged).toBeDefined();
      expect(merged.length).toBe(2); // Should deduplicate style recommendations
      expect(merged[0].confidence).toBe(0.7); // Average confidence for style
      expect(merged[1].confidence).toBe(0.9); // Template recommendation
    });
  });

  describe('A/B Testing', () => {
    test('should apply A/B testing to recommendations', async () => {
      const userId = 'test_user_ab';
      const recommendations = [
        { type: 'style', suggestion: 'modern', confidence: 0.8, source: 'collaborative_filtering' }
      ];
      const context = 'video_creation';

      // Mock user profile with A/B test participation
      jest.spyOn(personizationService, 'getUserProfile').mockResolvedValue({
        personalizationSettings: { abTestParticipation: true }
      });

      const result = await personalizationService.applyABTesting(userId, recommendations, context);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    test('should calculate test significance', () => {
      const results = [
        { test_group: 'control', clicks: 100, impressions: 1000, conversions: 10 },
        { test_group: 'variant_a', clicks: 120, impressions: 1000, conversions: 15 }
      ];

      const evaluation = personalizationService.calculateTestSignificance(results, 'click_through_rate');
      
      expect(evaluation).toBeDefined();
      expect(evaluation.winner).toBe('variant_a');
    });
  });

  describe('Personalization Features', () => {
    test('should get personalized generation parameters', async () => {
      const userId = 'test_user_generation';
      const context = {
        purpose: 'social_media',
        device: 'mobile'
      };

      const parameters = await personalizationService.getPersonalizedGenerationParameters(userId, context);
      
      expect(parameters).toBeDefined();
      expect(parameters.visualStyle).toBeDefined();
      expect(parameters.quality).toBeDefined();
      expect(parameters.length).toBeDefined();
      expect(parameters.renderingSettings).toBeDefined();
      expect(parameters.optimizationSettings).toBeDefined();
    });

    test('should get adaptive UI settings', async () => {
      const userId = 'test_user_ui';
      const context = {
        device: 'mobile'
      };

      const settings = await personalizationService.getAdaptiveUISettings(userId, context);
      
      expect(settings).toBeDefined();
      expect(settings.layout).toBeDefined();
      expect(settings.density).toBeDefined();
      expect(settings.features).toBeDefined();
    });

    test('should get workflow optimizations', async () => {
      const userId = 'test_user_workflow';

      const optimizations = await personalizationService.getWorkflowOptimizations(userId);
      
      expect(optimizations).toBeDefined();
      expect(optimizations.shortcuts).toBeDefined();
      expect(optimizations.automation).toBeDefined();
      expect(optimizations.templates).toBeDefined();
    });
  });

  describe('Event Tracking', () => {
    test('should track user behavior', async () => {
      const userId = 'test_user_tracking';
      const behaviorData = {
        actions: [
          { type: 'project_created', feature: 'video_editor' }
        ],
        sessionId: 'test_session_123'
      };

      await personalizationService.trackUserBehavior(userId, behaviorData);
      
      // Verify events were stored
      const result = await query(
        'SELECT COUNT(*) as count FROM user_behavior_events WHERE user_id = $1',
        [userId]
      );
      
      expect(parseInt(result.rows[0].count)).toBeGreaterThan(0);
    });

    test('should track recommendation interactions', async () => {
      const userId = 'test_user_interaction';
      const recommendationId = 'test_rec_123';
      const action = 'click';

      await personalizationService.trackRecommendationInteraction(userId, recommendationId, action);
      
      // Verify interaction was tracked
      const result = await query(
        'SELECT COUNT(*) as count FROM recommendation_interactions WHERE user_id = $1 AND recommendation_id = $2',
        [userId, recommendationId]
      );
      
      expect(parseInt(result.rows[0].count)).toBe(1);
    });
  });

  describe('Privacy & Compliance', () => {
    test('should apply strict privacy settings', async () => {
      const userId = 'test_user_privacy';

      await personalizationService.applyStrictPrivacy(userId);
      
      // Verify privacy settings were applied
      const result = await query(
        "SELECT preferences_data->'personalizationSettings' as settings FROM user_preferences WHERE user_id = $1",
        [userId]
      );
      
      if (result.rows.length > 0) {
        const settings = result.rows[0].settings;
        expect(settings.enabled).toBe(false);
        expect(settings.dataSharing).toBe(false);
      }
    });

    test('should export user data', async () => {
      const userId = 'test_user_export';

      const userData = await personalizationService.exportUserData(userId);
      
      expect(userData).toBeDefined();
      expect(userData.userProfile).toBeDefined();
      expect(userData.behaviorEvents).toBeDefined();
      expect(userData.recommendationInteractions).toBeDefined();
      expect(userData.feedback).toBeDefined();
      expect(userData.exportedAt).toBeDefined();
    });

    test('should delete user data', async () => {
      const userId = 'test_user_delete';

      await personalizationService.deleteUserData(userId);
      
      // Verify data was deleted
      const behaviorResult = await query(
        'SELECT COUNT(*) as count FROM user_behavior_events WHERE user_id = $1',
        [userId]
      );
      
      const feedbackResult = await query(
        'SELECT COUNT(*) as count FROM user_feedback WHERE user_id = $1',
        [userId]
      );
      
      expect(parseInt(behaviorResult.rows[0].count)).toBe(0);
      expect(parseInt(feedbackResult.rows[0].count)).toBe(0);
    });
  });

  describe('Integration', () => {
    test('should integrate content analysis', async () => {
      const userId = 'test_user_integration';
      const contentAnalysis = {
        styleAnalysis: {
          artStyle: 'cinematic',
          dominantColors: ['#000000', '#FFFFFF'],
          mood: 'dramatic'
        },
        topicExtraction: {
          mainTopics: [{ topic: 'technology' }],
          categories: ['Technology', 'Business']
        },
        qualityAssessment: {
          overall: 0.9,
          technicalDetails: {
            resolution: '4k',
            format: 'MP4'
          }
        }
      };

      await personalizationService.integrateContentAnalysis(userId, contentAnalysis);
      
      // Verify integration
      const profile = await personalizationService.getUserProfile(userId);
      expect(profile.contentInsights).toBeDefined();
      expect(profile.contentInsights.stylePreferences).toBeDefined();
    });

    test('should integrate with video generation', async () => {
      const userId = 'test_user_video_integration';
      const generationParams = {
        purpose: 'social_media',
        device: 'mobile'
      };

      const enhancedParams = await personalizationService.integrateWithVideoGeneration(userId, generationParams);
      
      expect(enhancedParams).toBeDefined();
      expect(enhancedParams.personalizationApplied).toBe(true);
      expect(enhancedParams.visualStyle).toBeDefined();
      expect(enhancedParams.renderingSettings).toBeDefined();
    });
  });

  describe('Real-time Updates', () => {
    test('should trigger real-time updates', async () => {
      const userId = 'test_user_realtime';
      const patterns = {
        visualStyle: {
          preferredStyle: 'modern',
          confidence: 0.8
        }
      };

      await personalizationService.triggerRealtimeUpdate(userId, patterns);
      
      // Verify update was stored
      const update = await personalizationService.getRealtimeUpdates(userId);
      
      expect(update).toBeDefined();
      expect(update.userId).toBe(userId);
      expect(update.type).toBe('preference_update');
    });

    test('should update session data', () => {
      const userId = 'test_user_session';
      const sessionData = {
        sessionId: 'session_123',
        duration: 45,
        actions: [{ type: 'project_created' }]
      };

      personalizationService.updateSessionData(userId, sessionData);
      
      // Verify session data was updated
      const storedSession = personalizationService.sessionData.get(userId);
      
      expect(storedSession).toBeDefined();
      expect(storedSession.sessionId).toBe('session_123');
      expect(storedSession.duration).toBe(45);
    });
  });

  describe('Performance Metrics', () => {
    test('should get personalization metrics', async () => {
      const userId = 'test_user_metrics';
      const options = {
        timeframe: '30d'
      };

      const metrics = await personalizationService.getPersonalizationMetrics(userId, options);
      
      expect(metrics).toBeDefined();
      expect(metrics.timeframe).toBe('30d');
      expect(metrics.recommendations).toBeDefined();
      expect(metrics.satisfaction).toBeDefined();
      expect(metrics.engagement).toBeDefined();
    });
  });
});
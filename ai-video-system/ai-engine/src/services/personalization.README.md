# Personalization Service

The Personalization Service provides comprehensive user personalization capabilities for the AI Video System. It learns from user behavior, provides personalized recommendations, and adapts the user experience based on individual preferences and patterns.

## Features

### 1. User Preference Learning
- **Behavior Tracking**: Tracks user interactions, project activities, and feedback
- **Pattern Analysis**: Analyzes user behavior patterns using ML models
- **Preference Updates**: Continuously updates user profiles based on new data
- **Cross-Session Persistence**: Maintains preferences across user sessions

### 2. Machine Learning Models
- **Preference Prediction**: Neural network model for predicting user preferences
- **User Segmentation**: K-means clustering for user segmentation
- **Collaborative Filtering**: Matrix factorization for recommendation systems
- **Model Persistence**: Saves and loads trained models from database

### 3. Recommendation Systems
- **Collaborative Filtering**: Recommendations based on similar users
- **Content-Based Filtering**: Recommendations based on content analysis
- **Hybrid Approach**: Combines multiple recommendation strategies
- **Context-Aware**: Adapts recommendations based on current context

### 4. Personalization Features
- **Template Recommendations**: Suggests templates based on user preferences
- **Style Recommendations**: Recommends visual styles using ML
- **Feature Recommendations**: Suggests features based on usage patterns
- **Adaptive UI**: Adjusts interface based on user behavior

### 5. A/B Testing Framework
- **Test Management**: Creates and manages A/B tests
- **User Assignment**: Assigns users to test groups
- **Result Tracking**: Tracks test performance metrics
- **Statistical Analysis**: Evaluates test significance

### 6. Privacy & Compliance
- **Privacy Levels**: Strict, standard, and permissive privacy settings
- **Data Control**: User control over data collection and usage
- **Data Export**: Export user data on request
- **Data Deletion**: Complete data deletion on request

## API Endpoints

### User Profile Management
- `POST /api/personalization/learn-preferences` - Learn from user behavior
- `GET /api/personalization/profile/:userId` - Get user profile
- `PUT /api/personalization/profile` - Update user profile

### Recommendations
- `POST /api/personalization/recommendations` - Get personalized recommendations
- `POST /api/personalization/track-interaction` - Track recommendation interaction
- `GET /api/personalization/template-recommendations/:userId` - Get template recommendations
- `GET /api/personalization/style-recommendations/:userId` - Get style recommendations
- `GET /api/personalization/feature-recommendations/:userId` - Get feature recommendations

### Personalization Features
- `POST /api/personalization/generation-params` - Get personalized generation parameters
- `POST /api/personalization/ui-settings` - Get adaptive UI settings
- `GET /api/personalization/workflow-optimizations/:userId` - Get workflow optimizations
- `GET /api/personalization/realtime-updates/:userId` - Get real-time updates

### Analytics & Feedback
- `GET /api/personalization/metrics/:userId` - Get personalization metrics
- `POST /api/personalization/feedback` - Collect user feedback
- `POST /api/personalization/session-data` - Update session data

### Integration
- `POST /api/personalization/integrate-content-analysis` - Integrate content analysis
- `POST /api/personalization/integrate-video-generation` - Integrate with video generation

### Privacy
- `POST /api/personalization/privacy` - Manage privacy settings

### Health Check
- `GET /api/personalization/health` - Service health check

## Usage Examples

### Learning User Preferences
```javascript
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
  ],
  sessionId: 'session_123'
};

const response = await fetch('/api/personalization/learn-preferences', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user_123',
    behaviorData
  })
});
```

### Getting Personalized Recommendations
```javascript
const response = await fetch('/api/personalization/recommendations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user_123',
    context: 'video_creation',
    options: {
      limit: 10,
      device: 'desktop'
    }
  })
});

const { recommendations } = await response.json();
```

### Getting Personalized Generation Parameters
```javascript
const response = await fetch('/api/personalization/generation-params', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user_123',
    context: {
      purpose: 'social_media',
      device: 'mobile'
    }
  })
});

const { parameters } = await response.json();
```

## Database Schema

The personalization service uses the following database tables:

- `user_behavior_events` - Stores user behavior events
- `ml_models` - Stores trained ML models
- `user_segments` - Stores user segment assignments
- `recommendations` - Stores recommendation data
- `recommendation_interactions` - Tracks recommendation interactions
- `ab_tests` - Stores A/B test configurations
- `user_ab_tests` - Stores user test assignments
- `ab_test_results` - Stores test results
- `user_feedback` - Stores user feedback
- `video_generation_tracking` - Tracks video generation for learning

## Configuration

### Environment Variables
- `PERSONALIZATION_ML_ENABLED` - Enable ML features (default: true)
- `PERSONALIZATION_AB_TESTING_ENABLED` - Enable A/B testing (default: true)
- `PERSONALIZATION_REALTIME_ENABLED` - Enable real-time updates (default: true)
- `PERSONALIZATION_CACHE_TTL` - Cache TTL in seconds (default: 3600)

### ML Model Configuration
```javascript
const mlConfig = {
  preferencePrediction: {
    type: 'neural_network',
    features: ['user_actions', 'content_features', 'temporal_patterns']
  },
  userSegmentation: {
    type: 'clustering',
    algorithm: 'kmeans',
    clusters: 5
  },
  collaborativeFiltering: {
    type: 'matrix_factorization',
    algorithm: 'svd',
    dimensions: 50
  }
};
```

## Performance Considerations

### Caching
- User profiles are cached for 1 hour
- Recommendations are cached for 30 minutes
- Real-time updates are cached for 5 minutes

### Batch Processing
- Behavior events are processed in batches of 100
- A/B test results are evaluated every hour
- ML models are retrained daily

### Scalability
- Horizontal scaling through Redis clustering
- Database connection pooling
- Asynchronous event processing

## Privacy & Security

### Data Protection
- All personal data is encrypted at rest
- API endpoints use HTTPS
- User consent required for data collection

### Compliance
- GDPR compliant data handling
- CCPA compliant privacy controls
- Data retention policies enforced

## Monitoring & Analytics

### Metrics
- Recommendation click-through rate
- User satisfaction scores
- A/B test performance
- Model accuracy metrics

### Logging
- Structured logging with correlation IDs
- Performance metrics tracking
- Error tracking and alerting

## Integration Points

### Content Analysis Service
- Receives content analysis results
- Updates user preferences based on content insights
- Provides content-based recommendations

### Video Generation Service
- Provides personalized generation parameters
- Tracks generation outcomes for learning
- Optimizes generation based on user preferences

### User Management Service
- Syncs user profile data
- Handles user authentication
- Manages user permissions

## Troubleshooting

### Common Issues

1. **Recommendations Not Updating**
   - Check if behavior events are being tracked
   - Verify ML models are trained
   - Check cache settings

2. **A/B Tests Not Working**
   - Verify test configuration
   - Check user assignment logic
   - Validate result tracking

3. **Performance Issues**
   - Check database connection pool
   - Verify Redis configuration
   - Monitor batch processing

### Debug Mode
Enable debug mode by setting:
```javascript
process.env.PERSONALIZATION_DEBUG = 'true';
```

This provides detailed logging and performance metrics.

## Future Enhancements

### Planned Features
- Deep learning model integration
- Real-time collaborative filtering
- Advanced privacy controls
- Multi-armed bandit testing
- Cross-platform personalization

### Performance Improvements
- GPU acceleration for ML models
- Distributed recommendation computing
- Advanced caching strategies
- Database query optimization
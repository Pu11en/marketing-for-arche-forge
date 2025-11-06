# Job Queue System

A comprehensive Redis-based job queue system for the AI video generation platform, supporting priority queues, job dependencies, delayed jobs, recurring jobs, and advanced monitoring.

## Features

### Core Features
- **Redis-based Queue Management**: Uses Bull queue with Redis backend for reliable job processing
- **Priority Queues**: Three priority levels (high, normal, low) with automatic prioritization
- **Job Dependencies**: Support for jobs that depend on other jobs to complete first
- **Delayed Jobs**: Schedule jobs to run after a specified delay
- **Recurring Jobs**: Schedule jobs to run repeatedly using cron expressions
- **Job Progress Tracking**: Real-time progress updates for long-running jobs
- **Result Caching**: Automatic caching of job results for performance

### Advanced Features
- **Concurrent Job Limits**: Per-user and per-job-type concurrent limits
- **Subscription-based Prioritization**: Automatic priority based on user subscription level
- **Queue Statistics**: Comprehensive statistics and monitoring
- **Health Checks**: Queue health monitoring with automatic alerts
- **Performance Metrics**: Detailed performance tracking and analysis
- **Job History**: Complete audit log of all job status changes
- **Error Handling**: Advanced error handling with exponential backoff retries

## Job Types

The system supports the following job types:

1. **Video Generation** (`video-generation`)
   - Complete video generation from script to final video
   - Includes scene generation, asset creation, and composition

2. **Script Generation** (`script-generation`)
   - AI-powered script generation from prompts
   - Supports various styles and formats

3. **Scene Creation** (`scene-creation`)
   - Individual scene generation with visuals and audio
   - Supports custom styling and effects

4. **Audio Synthesis** (`audio-synthesis`)
   - Text-to-speech generation using ElevenLabs
   - Multiple voice options and settings

5. **Image Generation** (`image-generation`)
   - AI image generation using Stability AI or DALL-E
   - Various styles and quality options

6. **World Building** (`world-building`)
   - World concept generation for video contexts
   - Includes visual and thematic elements

7. **Content Analysis** (`content-analysis`)
   - Analysis of scripts, images, videos, and text
   - Extracts insights and metadata

8. **Video Composition** (`video-composition`)
   - Combines scenes, assets, and audio into final video
   - Supports various formats and quality settings

9. **Personalization** (`personalization`)
   - Applies user-specific personalization to content
   - Configurable intensity and aspects

10. **AI Processing** (`ai-processing`)
    - Generic AI task processing
    - Supports multiple AI providers

## API Endpoints

### Job Management
- `POST /api/jobs/{jobType}` - Create new job
- `GET /api/jobs/{jobType}/{jobId}` - Get job details
- `GET /api/jobs/{jobType}/{jobId}/progress` - Get job progress
- `GET /api/jobs/{jobType}/{jobId}/result` - Get job result
- `DELETE /api/jobs/{jobType}/{jobId}` - Remove job
- `POST /api/jobs/{jobType}/{jobId}/retry` - Retry failed job

### Special Job Types
- `POST /api/jobs/delayed` - Create delayed job
- `POST /api/jobs/recurring` - Create recurring job
- `DELETE /api/jobs/recurring/{recurringJobId}` - Remove recurring job

### User Management
- `GET /api/jobs/user/{userId}/history` - Get user job history

### Queue Management
- `GET /api/jobs/stats` - Get job statistics
- `GET /api/jobs/queues/stats` - Get queue statistics
- `GET /api/jobs/health` - Get queue health
- `GET /api/jobs/performance` - Get performance metrics
- `POST /api/jobs/queues/{jobType}/pause` - Pause queue
- `POST /api/jobs/queues/{jobType}/resume` - Resume queue
- `DELETE /api/jobs/queues/{jobType}/clear` - Clear queue

### System Information
- `GET /api/jobs/types` - Get available job types

## Usage Examples

### Creating a Video Generation Job
```javascript
const response = await fetch('/api/jobs/video-generation', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    userId: 'user-123',
    projectId: 'project-456',
    prompt: 'Create a video about AI technology',
    script: { /* script data */ },
    scenes: [ /* scene data */ ],
    options: {
      quality: 'high',
      resolution: '1080p',
      style: 'modern'
    },
    priority: 'high',
    userSubscription: 'pro'
  })
});
```

### Creating a Delayed Job
```javascript
const response = await fetch('/api/jobs/delayed', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    jobType: 'image-generation',
    data: {
      userId: 'user-123',
      projectId: 'project-456',
      prompt: 'Generate an image of a sunset',
      options: {
        width: 1024,
        height: 768
      }
    },
    delay: 300000 // 5 minutes in milliseconds
  })
});
```

### Creating a Recurring Job
```javascript
const response = await fetch('/api/jobs/recurring', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    jobType: 'content-analysis',
    data: {
      userId: 'user-123',
      projectId: 'project-456',
      content: 'Analyze this content',
      type: 'text'
    },
    cronExpression: '0 0 * * *', // Daily at midnight
    options: {
      skipCache: true
    }
  })
});
```

## Configuration

### Environment Variables
- `REDIS_HOST` - Redis server host (default: localhost)
- `REDIS_PORT` - Redis server port (default: 6379)
- `REDIS_PASSWORD` - Redis server password (optional)
- `REDIS_DB` - Redis database number (default: 0)

### Queue Configuration
```javascript
const queueConfig = {
  defaultJobOptions: {
    removeOnComplete: 10, // Keep last 10 completed jobs
    removeOnFail: 50, // Keep last 50 failed jobs
    attempts: 3, // Default retry attempts
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  },
  settings: {
    stalledInterval: 30 * 1000, // 30 seconds
    maxStalledCount: 1,
    lockDuration: 30000 // 30 seconds
  }
};
```

### Concurrent Limits
```javascript
const CONCURRENT_LIMITS = {
  user: {
    free: 1,
    basic: 2,
    pro: 5,
    enterprise: 10
  },
  type: {
    'video-generation': 2,
    'script-generation': 5,
    'scene-creation': 3,
    'audio-synthesis': 3,
    'image-generation': 5,
    'world-building': 2,
    'content-analysis': 10,
    'video-composition': 1,
    'personalization': 5,
    'ai-processing': 3
  }
};
```

## Monitoring and Health

### Queue Health
The system provides comprehensive health monitoring:
- Queue status (healthy, degraded, unhealthy, error)
- Active job counts
- Failed job rates
- Error rates and trends

### Performance Metrics
- Average processing time
- Queue utilization
- Error rates
- Throughput (jobs per minute)
- Wait times

### Statistics
- Total jobs by type and status
- User-specific statistics
- Priority distribution
- Historical trends

## Error Handling

### Retry Logic
- Exponential backoff with configurable delays
- Maximum retry attempts per job type
- Circuit breaker pattern for failed providers
- Dead letter queue for failed jobs

### Error Categories
- Temporary errors (retriable)
- Permanent errors (not retriable)
- Rate limit errors (delayed retry)
- Provider errors (circuit breaker)

## Database Schema

The system uses several database tables for tracking:

### render_jobs
- Main job tracking table
- Extended with queue integration columns
- Includes metadata and performance data

### job_history
- Complete audit log of status changes
- Tracks all job state transitions
- Used for analytics and debugging

### job_dependencies
- Manages job dependencies
- Ensures proper execution order
- Supports complex dependency graphs

### recurring_jobs
- Tracks recurring/scheduled jobs
- Cron expression management
- Execution history and statistics

### job_performance_metrics
- Aggregated performance data
- Daily statistics by job type
- Used for monitoring and optimization

## Security

### Authentication
- All endpoints require JWT authentication
- User-specific job access controls
- Project-based permissions

### Validation
- Comprehensive input validation
- SQL injection prevention
- Rate limiting per user

### Data Protection
- Encrypted sensitive data
- Secure file handling
- Audit logging

## Best Practices

### Job Design
- Keep jobs small and focused
- Use appropriate job types
- Set realistic timeouts
- Handle errors gracefully

### Performance
- Monitor queue lengths
- Optimize job processing time
- Use result caching effectively
- Scale workers appropriately

### Reliability
- Implement proper error handling
- Use job dependencies correctly
- Monitor system health
- Plan for failures

## Troubleshooting

### Common Issues
1. **Jobs stuck in "waiting" state**
   - Check Redis connection
   - Verify worker processes
   - Check queue configuration

2. **High failure rates**
   - Review error logs
   - Check provider health
   - Verify input data

3. **Slow processing**
   - Monitor resource usage
   - Check worker concurrency
   - Review job complexity

### Debugging
- Enable debug logging
- Use job history for tracing
- Monitor queue statistics
- Check performance metrics

## Integration

### Worker Pool
The job queue integrates with the worker pool system:
- Automatic worker scaling
- Load balancing
- Resource management
- Health monitoring

### AI Providers
Seamless integration with AI providers:
- Automatic failover
- Rate limiting
- Cost tracking
- Performance monitoring

### Storage
Integration with storage systems:
- Result file storage
- Temporary file management
- Cleanup automation
- Access control

## Future Enhancements

Planned improvements:
- Webhook support for job completion
- Advanced scheduling options
- Job templates
- Bulk job operations
- Real-time notifications
- Advanced analytics dashboard
- Custom job types
- Geographic distribution
- Multi-tenant support
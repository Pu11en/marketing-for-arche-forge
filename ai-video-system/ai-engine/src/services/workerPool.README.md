# Worker Pool System

The enhanced worker pool system provides efficient, scalable, and resource-aware task processing for the AI video system. It manages multiple worker processes with different specializations, intelligent load balancing, and comprehensive monitoring.

## Features

### 1. Worker Pool Management
- **Dynamic Worker Creation**: Automatically creates workers based on load and configuration
- **Worker Destruction**: Gracefully terminates idle workers to conserve resources
- **Worker Types**: Specialized workers for different AI tasks
- **Health Monitoring**: Continuous health checks with automatic recovery
- **Resource Limits**: Configurable CPU, memory, and GPU limits per worker type

### 2. Worker Types

#### Video Generation Workers
- **Resource Weight**: Heavy
- **Max Concurrent**: 1
- **Memory Limit**: 4096 MB
- **CPU Threshold**: 80%
- **GPU Required**: Yes
- **Timeout**: 10 minutes

#### Audio Synthesis Workers
- **Resource Weight**: Medium
- **Max Concurrent**: 3
- **Memory Limit**: 2048 MB
- **CPU Threshold**: 70%
- **GPU Required**: No
- **Timeout**: 3 minutes

#### Image Generation Workers
- **Resource Weight**: Medium
- **Max Concurrent**: 2
- **Memory Limit**: 3072 MB
- **CPU Threshold**: 75%
- **GPU Required**: Yes
- **Timeout**: 5 minutes

#### Text Processing Workers
- **Resource Weight**: Light
- **Max Concurrent**: 10
- **Memory Limit**: 512 MB
- **CPU Threshold**: 60%
- **GPU Required**: No
- **Timeout**: 1 minute

#### World Building Workers
- **Resource Weight**: Heavy
- **Max Concurrent**: 1
- **Memory Limit**: 4096 MB
- **CPU Threshold**: 85%
- **GPU Required**: Yes
- **Timeout**: 8 minutes

#### Content Analysis Workers
- **Resource Weight**: Light
- **Max Concurrent**: 8
- **Memory Limit**: 1024 MB
- **CPU Threshold**: 65%
- **GPU Required**: No
- **Timeout**: 2 minutes

### 3. Load Balancing
- **Intelligent Job Distribution**: Routes tasks to appropriate worker types
- **Queue-based Load Balancing**: Priority queues for each worker type
- **Priority-based Assignment**: Higher priority tasks get processed first
- **Worker Specialization**: Workers specialized for specific task types
- **Auto-scaling**: Dynamic scaling based on queue length and processing time

### 4. Resource Management
- **CPU Usage Monitoring**: Real-time CPU usage tracking per worker
- **Memory Usage Monitoring**: Memory consumption tracking with limits
- **GPU Resource Allocation**: GPU usage tracking for intensive tasks
- **Concurrent Job Limits**: Configurable limits per worker type
- **Worker Isolation**: Sandboxed worker environments
- **Resource Cleanup**: Automatic cleanup after job completion

### 5. Monitoring & Management
- **Real-time Status**: Live worker status and performance metrics
- **Performance Metrics**: Task completion times, success rates, and throughput
- **Event Logging**: Comprehensive event logging for debugging
- **Error Tracking**: Detailed error tracking and alerting
- **Health Checks**: Periodic health assessments
- **Statistics Dashboard**: Aggregate statistics and health indicators

### 6. Integration
- **Job Queue Integration**: Seamless integration with Bull job queue system
- **AI Providers Service**: Connection to AI provider services
- **Redis Coordination**: Distributed coordination via Redis pub/sub
- **Existing Job Processors**: Support for existing job processor functions

## API Endpoints

### Get Worker Pool Statistics
```
GET /api/workers/stats
```

Returns comprehensive statistics about the worker pool including:
- Total, available, and busy workers
- Task completion and failure counts
- Average task processing times
- Statistics by worker type

### Get Worker Pool Status
```
GET /api/workers/status
```

Returns detailed status including:
- Worker pool statistics
- Queue information
- Resource usage data
- Configuration details

### Get Worker Types
```
GET /api/workers/types
```

Returns configuration for all worker types including:
- Resource requirements
- Concurrency limits
- Timeout settings
- GPU requirements

### Execute Task
```
POST /api/workers/execute
```

Executes a task directly through the worker pool.

**Request Body:**
```json
{
  "type": "video_generation",
  "data": {
    "scene": { "id": "scene-1" },
    "script": "Sample script",
    "options": { "quality": "high" }
  },
  "options": {
    "priority": 1,
    "timeout": 300000
  }
}
```

### Scale Workers
```
POST /api/workers/scale/:type
```

Manually scale workers for a specific type.

**Request Body:**
```json
{
  "action": "up|down",
  "count": 2
}
```

### Restart Worker
```
POST /api/workers/restart/:workerId
```

Restarts a specific worker instance.

### Get Worker Health
```
GET /api/workers/health
```

Returns health status for all workers including:
- Overall health status
- Per-type health indicators
- Error rates and performance metrics
- Queue lengths and wait times

### Get Queue Information
```
GET /api/workers/queues
```

Returns detailed queue information including:
- Queue lengths by type
- Task details and priorities
- Wait times

### Get Resource Usage
```
GET /api/workers/resources
```

Returns current resource usage including:
- CPU, memory, and GPU usage per worker
- Average usage across all workers
- Resource utilization trends

## Configuration

### Environment Variables
- `MAX_WORKERS`: Maximum number of workers (default: CPU count)
- `MIN_WORKERS`: Minimum number of workers (default: 2)
- `WORKER_TIMEOUT`: Default worker timeout in milliseconds (default: 300000)
- `REDIS_HOST`: Redis server host (default: localhost)
- `REDIS_PORT`: Redis server port (default: 6379)
- `REDIS_PASSWORD`: Redis server password (optional)
- `INSTANCE_ID`: Unique instance identifier for coordination

### Worker Pool Configuration
```javascript
const POOL_CONFIG = {
  maxWorkers: process.env.MAX_WORKERS || os.cpus().length,
  minWorkers: process.env.MIN_WORKERS || 2,
  workerTimeout: process.env.WORKER_TIMEOUT || 300000,
  maxRetries: 3,
  retryDelay: 1000,
  healthCheckInterval: 30000,
  scalingInterval: 60000,
  resourceMonitorInterval: 10000,
  gracefulShutdownTimeout: 30000
};
```

## Usage Examples

### Basic Task Execution
```javascript
const { workerPool } = require('./services/workerPool');

// Execute a video generation task
const result = await workerPool.executeTask('video_generation', {
  scene: { id: 'scene-1' },
  script: 'Sample script content',
  options: { quality: 'high', resolution: '1080p' }
});

console.log('Task completed:', result);
```

### Monitoring Worker Pool
```javascript
// Get current statistics
const stats = workerPool.getWorkerStats();
console.log('Total workers:', stats.total);
console.log('Available workers:', stats.available);
console.log('Tasks completed:', stats.tasksCompleted);

// Get detailed status
const status = workerPool.getPoolStatus();
console.log('Queue lengths:', status.queues);
console.log('Resource usage:', status.resources);
```

### Scaling Workers
```javascript
// Scale up video generation workers
await fetch('/api/workers/scale/video_generation', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'up',
    count: 2
  })
});

// Scale down text processing workers
await fetch('/api/workers/scale/text_processing', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'down',
    count: 3
  })
});
```

## Event System

The worker pool emits various events for monitoring and coordination:

### Worker Events
- `worker_created`: New worker created
- `worker_ready`: Worker initialized and ready
- `worker_error`: Worker encountered an error
- `worker_exited`: Worker process exited
- `worker_health`: Worker health status update

### Task Events
- `task_assigned`: Task assigned to worker
- `task_completed`: Task completed successfully
- `task_failed`: Task failed with error

### Pool Events
- `scale_up`: Workers scaled up
- `scale_down`: Workers scaled down
- `pool_status`: Pool status update

### Redis Events
All events are published to Redis pub/sub for distributed coordination:
```javascript
// Subscribe to worker pool events
await pubsub.subscribe('worker_pool_events', (message) => {
  console.log('Worker pool event:', message.event, message.data);
});
```

## Error Handling

### Worker Failures
- Automatic worker restart on failures
- Task retry with exponential backoff
- Error logging and alerting
- Graceful degradation

### Resource Exhaustion
- Resource threshold monitoring
- Automatic worker scaling
- Load shedding for overloaded workers
- Resource cleanup on failure

### Timeouts
- Configurable timeouts per task type
- Automatic task cancellation on timeout
- Worker restart on stuck tasks
- Timeout event logging

## Performance Optimization

### Resource Efficiency
- Worker pooling to reduce creation overhead
- Intelligent task routing
- Resource-based scaling decisions
- Memory and CPU optimization

### Throughput Optimization
- Concurrent task processing
- Priority-based scheduling
- Load balancing across workers
- Queue optimization

### Latency Reduction
- Worker pre-warming
- Task caching
- Fast worker selection
- Optimized communication

## Monitoring and Debugging

### Health Monitoring
- Periodic health checks
- Resource usage tracking
- Performance metrics collection
- Error rate monitoring

### Debugging Tools
- Detailed event logging
- Worker state inspection
- Task tracing
- Performance profiling

### Metrics Collection
- Task completion times
- Success/failure rates
- Resource utilization
- Queue lengths and wait times

## Security Considerations

### Worker Isolation
- Sandboxed worker environments
- Resource limits enforcement
- Secure inter-process communication
- Input validation

### Resource Protection
- Memory usage limits
- CPU usage throttling
- GPU resource management
- Disk space monitoring

## Deployment

### Production Deployment
- Configure appropriate worker limits
- Set up monitoring and alerting
- Configure Redis clustering
- Enable graceful shutdown

### Scaling Considerations
- Horizontal scaling with multiple instances
- Load balancer configuration
- Redis coordination setup
- Resource allocation planning

## Troubleshooting

### Common Issues

#### Workers Not Starting
- Check Redis connection
- Verify environment variables
- Check resource availability
- Review log files

#### High Memory Usage
- Monitor worker memory limits
- Check for memory leaks
- Adjust worker configuration
- Scale workers appropriately

#### Task Timeouts
- Review timeout configurations
- Check worker performance
- Monitor resource usage
- Optimize task processing

#### Poor Performance
- Monitor resource utilization
- Check worker distribution
- Review task priorities
- Optimize worker configuration

### Debug Commands
```bash
# Check worker pool status
curl http://localhost:3002/api/workers/status

# Get worker statistics
curl http://localhost:3002/api/workers/stats

# Check worker health
curl http://localhost:3002/api/workers/health

# Monitor resource usage
curl http://localhost:3002/api/workers/resources
```

## Contributing

When contributing to the worker pool system:

1. Follow the existing code patterns
2. Add comprehensive tests
3. Update documentation
4. Consider performance implications
5. Ensure error handling is robust

## License

This worker pool system is part of the AI video system and follows the same licensing terms.
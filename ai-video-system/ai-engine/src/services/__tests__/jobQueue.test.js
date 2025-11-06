const { 
  initializeQueues, 
  addJob, 
  addDelayedJob, 
  addRecurringJob, 
  removeRecurringJob,
  getJob,
  getQueueStats,
  getJobStats,
  getQueueHealth,
  getPerformanceMetrics,
  closeQueues,
  JOB_TYPES 
} = require('../jobQueue');

// Mock Redis for testing
jest.mock('../redis', () => ({
  getClient: jest.fn(() => ({
    ping: jest.fn().mockResolvedValue('PONG'),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1)
  })),
  cache: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1)
  },
  pubsub: {
    publish: jest.fn().mockResolvedValue(1),
    subscribe: jest.fn()
  }
}));

describe('Job Queue System', () => {
  beforeAll(async () => {
    // Initialize queues for testing
    await initializeQueues();
  });

  afterAll(async () => {
    // Clean up after tests
    await closeQueues();
  });

  describe('Job Creation', () => {
    test('should create a video generation job', async () => {
      const jobData = {
        userId: 'test-user-123',
        projectId: 'test-project-456',
        prompt: 'Test video generation',
        script: { scenes: [] },
        scenes: [],
        options: {
          quality: 'high',
          resolution: '1080p'
        }
      };

      const job = await addJob(JOB_TYPES.VIDEO_GENERATION, jobData);

      expect(job).toBeDefined();
      expect(job.id).toBeDefined();
      expect(job.data).toEqual(jobData);
    });

    test('should create a script generation job', async () => {
      const jobData = {
        userId: 'test-user-123',
        projectId: 'test-project-456',
        prompt: 'Generate a script about AI',
        options: {
          model: 'gpt-4',
          maxTokens: 1000
        }
      };

      const job = await addJob(JOB_TYPES.SCRIPT_GENERATION, jobData);

      expect(job).toBeDefined();
      expect(job.id).toBeDefined();
      expect(job.data).toEqual(jobData);
    });

    test('should create a delayed job', async () => {
      const jobData = {
        userId: 'test-user-123',
        projectId: 'test-project-456',
        prompt: 'Delayed job test'
      };

      const job = await addDelayedJob(JOB_TYPES.IMAGE_GENERATION, jobData, 5000);

      expect(job).toBeDefined();
      expect(job.id).toBeDefined();
      expect(job.opts.delay).toBe(5000);
    });

    test('should create a recurring job', async () => {
      const jobData = {
        userId: 'test-user-123',
        projectId: 'test-project-456',
        prompt: 'Recurring job test'
      };

      const recurringJobId = await addRecurringJob(
        JOB_TYPES.CONTENT_ANALYSIS, 
        jobData, 
        '0 */5 * * * *' // Every 5 minutes
      );

      expect(recurringJobId).toBeDefined();
      expect(typeof recurringJobId).toBe('string');
    });
  });

  describe('Job Retrieval', () => {
    test('should retrieve a job by ID', async () => {
      const jobData = {
        userId: 'test-user-123',
        projectId: 'test-project-456',
        prompt: 'Test job retrieval'
      };

      const createdJob = await addJob(JOB_TYPES.SCENE_CREATION, jobData);
      const retrievedJob = await getJob(JOB_TYPES.SCENE_CREATION, createdJob.id);

      expect(retrievedJob).toBeDefined();
      expect(retrievedJob.id).toBe(createdJob.id);
      expect(retrievedJob.data).toEqual(jobData);
    });
  });

  describe('Queue Statistics', () => {
    test('should get queue statistics', async () => {
      const stats = await getQueueStats();

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('waiting');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('delayed');
      expect(stats).toHaveProperty('byPriority');
    });

    test('should get job statistics', () => {
      const stats = getJobStats();

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('byType');
      expect(stats).toHaveProperty('byUser');
      expect(stats).toHaveProperty('byPriority');
    });
  });

  describe('Queue Health', () => {
    test('should get queue health status', async () => {
      const health = await getQueueHealth();

      expect(health).toBeDefined();
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('queues');
      expect(health).toHaveProperty('summary');
      expect(['healthy', 'degraded', 'unhealthy', 'error']).toContain(health.status);
    });
  });

  describe('Performance Metrics', () => {
    test('should get performance metrics', () => {
      const metrics = getPerformanceMetrics();

      expect(metrics).toBeDefined();
      expect(metrics).toHaveProperty('avgProcessingTime');
      expect(metrics).toHaveProperty('totalProcessingTime');
      expect(metrics).toHaveProperty('jobsProcessed');
      expect(metrics).toHaveProperty('queueUtilization');
      expect(metrics).toHaveProperty('errorRate');
      expect(metrics).toHaveProperty('throughput');
    });
  });

  describe('Job Types', () => {
    test('should have all required job types', () => {
      expect(JOB_TYPES.VIDEO_GENERATION).toBe('video-generation');
      expect(JOB_TYPES.SCRIPT_GENERATION).toBe('script-generation');
      expect(JOB_TYPES.SCENE_CREATION).toBe('scene-creation');
      expect(JOB_TYPES.AUDIO_SYNTHESIS).toBe('audio-synthesis');
      expect(JOB_TYPES.IMAGE_GENERATION).toBe('image-generation');
      expect(JOB_TYPES.WORLD_BUILDING).toBe('world-building');
      expect(JOB_TYPES.CONTENT_ANALYSIS).toBe('content-analysis');
      expect(JOB_TYPES.VIDEO_COMPOSITION).toBe('video-composition');
      expect(JOB_TYPES.PERSONALIZATION).toBe('personalization');
      expect(JOB_TYPES.AI_PROCESSING).toBe('ai-processing');
    });
  });

  describe('Recurring Job Management', () => {
    test('should remove a recurring job', async () => {
      const jobData = {
        userId: 'test-user-123',
        projectId: 'test-project-456',
        prompt: 'Test recurring job removal'
      };

      const recurringJobId = await addRecurringJob(
        JOB_TYPES.AUDIO_SYNTHESIS, 
        jobData, 
        '0 */10 * * * *' // Every 10 minutes
      );

      const removed = await removeRecurringJob(recurringJobId);

      expect(removed).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid job type', async () => {
      const jobData = {
        userId: 'test-user-123',
        projectId: 'test-project-456',
        prompt: 'Test error handling'
      };

      await expect(
        addJob('invalid-job-type', jobData)
      ).rejects.toThrow('Invalid job type: invalid-job-type');
    });

    test('should handle missing required fields', async () => {
      const invalidJobData = {
        userId: 'test-user-123'
        // Missing required fields
      };

      await expect(
        addJob(JOB_TYPES.VIDEO_GENERATION, invalidJobData)
      ).rejects.toThrow();
    });
  });
});
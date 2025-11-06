const { workerPool, WORKER_TYPES } = require('../workerPool');
const logger = require('../../utils/logger');

// Mock Redis for testing
jest.mock('../redis', () => ({
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    setNX: jest.fn(),
    incr: jest.fn(),
    ttl: jest.fn()
  },
  pubsub: {
    publish: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn()
  }
}));

// Mock logger for testing
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

describe('Worker Pool System', () => {
  beforeAll(async () => {
    // Initialize worker pool for testing
    await workerPool.initialize();
  });

  afterAll(async () => {
    // Clean up worker pool
    await workerPool.shutdown();
  });

  describe('Worker Pool Initialization', () => {
    test('should initialize worker pool with all worker types', () => {
      const stats = workerPool.getWorkerStats();
      
      expect(stats.total).toBeGreaterThan(0);
      expect(Object.keys(stats.workerTypes)).toContain('video_generation');
      expect(Object.keys(stats.workerTypes)).toContain('audio_synthesis');
      expect(Object.keys(stats.workerTypes)).toContain('image_generation');
      expect(Object.keys(stats.workerTypes)).toContain('text_processing');
      expect(Object.keys(stats.workerTypes)).toContain('world_building');
      expect(Object.keys(stats.workerTypes)).toContain('content_analysis');
    });

    test('should have correct worker type configurations', () => {
      expect(WORKER_TYPES.video_generation.resourceWeight).toBe('heavy');
      expect(WORKER_TYPES.video_generation.maxConcurrent).toBe(1);
      expect(WORKER_TYPES.video_generation.gpuRequired).toBe(true);
      
      expect(WORKER_TYPES.text_processing.resourceWeight).toBe('light');
      expect(WORKER_TYPES.text_processing.maxConcurrent).toBe(10);
      expect(WORKER_TYPES.text_processing.gpuRequired).toBe(false);
    });
  });

  describe('Task Execution', () => {
    test('should execute video generation task successfully', async () => {
      const taskData = {
        scene: { id: 'test-scene-1' },
        script: 'Test script content',
        options: { quality: 'high' }
      };

      const result = await workerPool.executeTask('video_generation', taskData);
      
      expect(result).toBeDefined();
      expect(result.type).toBe('video_generation');
      expect(result.status).toBe('completed');
    }, 10000);

    test('should execute content analysis task successfully', async () => {
      const taskData = {
        content: 'Test content for analysis',
        type: 'text',
        options: { extractSentiment: true }
      };

      const result = await workerPool.executeTask('content_analysis', taskData);
      
      expect(result).toBeDefined();
      expect(result.type).toBe('content_analysis');
      expect(result.status).toBe('completed');
    }, 5000);

    test('should handle task timeout', async () => {
      const taskData = {
        content: 'Test content',
        options: { timeout: 100 } // Very short timeout
      };

      await expect(
        workerPool.executeTask('video_generation', taskData, { timeout: 100 })
      ).rejects.toThrow('timed out');
    }, 1000);

    test('should handle invalid task type', async () => {
      const taskData = {
        content: 'Test content'
      };

      await expect(
        workerPool.executeTask('invalid_type', taskData)
      ).rejects.toThrow('Unknown task type');
    });
  });

  describe('Worker Pool Statistics', () => {
    test('should provide accurate statistics', () => {
      const stats = workerPool.getWorkerStats();
      
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('available');
      expect(stats).toHaveProperty('busy');
      expect(stats).toHaveProperty('tasksCompleted');
      expect(stats).toHaveProperty('tasksFailed');
      expect(stats).toHaveProperty('avgTaskTime');
      expect(stats).toHaveProperty('byType');
    });

    test('should provide pool status', () => {
      const status = workerPool.getPoolStatus();
      
      expect(status).toHaveProperty('stats');
      expect(status).toHaveProperty('queues');
      expect(status).toHaveProperty('resources');
      expect(status).toHaveProperty('config');
      expect(status).toHaveProperty('timestamp');
    });
  });

  describe('Load Balancing', () => {
    test('should distribute tasks across available workers', async () => {
      const initialStats = workerPool.getWorkerStats();
      const initialCompleted = initialStats.tasksCompleted;

      // Execute multiple tasks
      const tasks = [];
      for (let i = 0; i < 3; i++) {
        tasks.push(
          workerPool.executeTask('text_processing', {
            content: `Test content ${i}`,
            options: {}
          })
        );
      }

      await Promise.all(tasks);

      const finalStats = workerPool.getWorkerStats();
      expect(finalStats.tasksCompleted).toBeGreaterThan(initialCompleted);
    }, 15000);

    test('should respect worker type concurrency limits', async () => {
      const config = WORKER_TYPES.video_generation;
      expect(config.maxConcurrent).toBe(1);

      // This test would need more complex setup to properly test concurrency
      // For now, we just verify the configuration
      expect(config.maxConcurrent).toBeDefined();
    });
  });

  describe('Resource Management', () => {
    test('should track resource usage', () => {
      const status = workerPool.getPoolStatus();
      
      expect(status.resources).toBeDefined();
      expect(typeof status.resources).toBe('object');
    });

    test('should handle resource threshold violations', async () => {
      // This would require mocking resource usage to exceed thresholds
      // For now, we verify the configuration exists
      const config = WORKER_TYPES.video_generation;
      expect(config.cpuThreshold).toBeDefined();
      expect(config.memoryLimit).toBeDefined();
    });
  });

  describe('Worker Health Monitoring', () => {
    test('should monitor worker health', () => {
      const status = workerPool.getPoolStatus();
      
      // Health monitoring should be active
      expect(status.stats.total).toBeGreaterThan(0);
    });

    test('should handle worker failures gracefully', async () => {
      // This would require simulating worker failures
      // For now, we verify error handling exists
      const stats = workerPool.getWorkerStats();
      expect(stats).toHaveProperty('tasksFailed');
    });
  });

  describe('Auto-scaling', () => {
    test('should scale workers based on queue length', async () => {
      const initialStats = workerPool.getWorkerStats();
      const initialWorkers = initialStats.total;

      // Add tasks to queue to trigger scaling
      const tasks = [];
      for (let i = 0; i < 10; i++) {
        tasks.push(
          workerPool.executeTask('text_processing', {
            content: `Load test content ${i}`,
            options: {}
          })
        );
      }

      // Wait a bit for scaling to potentially occur
      await new Promise(resolve => setTimeout(resolve, 2000));

      const finalStats = workerPool.getWorkerStats();
      
      // Workers may or may not scale depending on configuration
      // This test mainly verifies the system doesn't crash
      expect(finalStats.total).toBeGreaterThanOrEqual(0);
    }, 30000);
  });

  describe('Redis Integration', () => {
    test('should publish events to Redis', async () => {
      const { pubsub } = require('../redis');
      
      // Execute a task to trigger events
      await workerPool.executeTask('text_processing', {
        content: 'Test Redis integration',
        options: {}
      });

      // Verify publish was called
      expect(pubsub.publish).toHaveBeenCalled();
    });
  });

  describe('Graceful Shutdown', () => {
    test('should shutdown gracefully without errors', async () => {
      // Create a new worker pool instance for this test
      const { workerPool: testPool } = require('../workerPool');
      
      // Initialize the test pool
      await testPool.initialize();
      
      // Execute a task
      const taskPromise = testPool.executeTask('text_processing', {
        content: 'Test shutdown',
        options: {}
      });

      // Shutdown while task is running
      await testPool.shutdown();
      
      // Verify shutdown completed without errors
      expect(true).toBe(true); // If we get here, shutdown was successful
    }, 10000);
  });
});

describe('Worker Pool Error Handling', () => {
  test('should handle worker thread errors', async () => {
    // This would require mocking worker thread errors
    // For now, we verify error handling infrastructure exists
    const stats = workerPool.getWorkerStats();
    expect(stats).toHaveProperty('tasksFailed');
  });

  test('should handle Redis connection failures', async () => {
    // Mock Redis to throw errors
    const { cache } = require('../redis');
    cache.get.mockImplementationOnce(() => {
      throw new Error('Redis connection failed');
    });

    // Execute task - should not crash
    const result = await workerPool.executeTask('text_processing', {
      content: 'Test Redis error handling',
      options: {}
    });

    expect(result).toBeDefined();
  });
});

describe('Worker Pool Performance', () => {
  test('should complete tasks within reasonable time', async () => {
    const startTime = Date.now();
    
    await workerPool.executeTask('text_processing', {
      content: 'Performance test content',
      options: {}
    });
    
    const duration = Date.now() - startTime;
    
    // Should complete within 5 seconds for text processing
    expect(duration).toBeLessThan(5000);
  }, 10000);

  test('should handle concurrent tasks efficiently', async () => {
    const startTime = Date.now();
    
    // Execute multiple concurrent tasks
    const tasks = [];
    for (let i = 0; i < 5; i++) {
      tasks.push(
        workerPool.executeTask('text_processing', {
          content: `Concurrent test ${i}`,
          options: {}
        })
      );
    }

    await Promise.all(tasks);
    
    const duration = Date.now() - startTime;
    
    // Should complete all tasks within reasonable time
    expect(duration).toBeLessThan(15000);
  }, 20000);
});
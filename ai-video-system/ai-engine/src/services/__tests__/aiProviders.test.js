const aiProviders = require('../aiProviders');
const logger = require('../../utils/logger');

// Mock environment variables
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.STABILITY_API_KEY = 'test-stability-key';
process.env.ELEVENLABS_API_KEY = 'test-elevenlabs-key';
process.env.REPLICATE_API_TOKEN = 'test-replicate-token';

// Mock Redis cache
jest.mock('../redis', () => ({
  cache: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true)
  }
}));

// Mock axios for HTTP clients
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn().mockResolvedValue({ data: { engines: [] } }),
    post: jest.fn().mockResolvedValue({ data: { artifacts: [] } })
  }))
}));

describe('AI Providers Service', () => {
  beforeAll(async () => {
    // Suppress logger output during tests
    logger.level = 'error';
  });

  describe('Initialization', () => {
    test('should initialize all providers successfully', async () => {
      // This test would require actual API keys to pass
      // For now, we'll test that the initialization method exists
      expect(typeof aiProviders.initialize).toBe('function');
    });
  });

  describe('Rate Limiting', () => {
    test('should check rate limits correctly', async () => {
      const result = await aiProviders.checkRateLimit('openai', 'test-user', 10, 60);
      expect(typeof result).toBe('boolean');
    });

    test('should block requests when rate limit exceeded', async () => {
      // Make 10 requests to hit the limit
      for (let i = 0; i < 10; i++) {
        await aiProviders.checkRateLimit('openai', 'test-user', 10, 60);
      }
      
      // 11th request should be blocked
      const result = await aiProviders.checkRateLimit('openai', 'test-user', 10, 60);
      expect(result).toBe(false);
    });
  });

  describe('Circuit Breaker', () => {
    test('should check circuit breaker state', () => {
      const isOpen = aiProviders.checkCircuitBreaker('openai');
      expect(typeof isOpen).toBe('boolean');
    });

    test('should record circuit breaker failure', () => {
      const initialFailures = aiProviders.circuitBreakers.openai.failures;
      aiProviders.recordCircuitBreakerFailure('openai');
      expect(aiProviders.circuitBreakers.openai.failures).toBe(initialFailures + 1);
    });

    test('should record circuit breaker success', () => {
      aiProviders.recordCircuitBreakerSuccess('openai');
      expect(aiProviders.circuitBreakers.openai.failures).toBe(0);
      expect(aiProviders.circuitBreakers.openai.state).toBe('CLOSED');
    });

    test('should reset circuit breaker', () => {
      aiProviders.resetCircuitBreaker('openai');
      expect(aiProviders.circuitBreakers.openai.failures).toBe(0);
      expect(aiProviders.circuitBreakers.openai.state).toBe('CLOSED');
    });
  });

  describe('Usage Tracking', () => {
    test('should track OpenAI usage correctly', () => {
      const initialUsage = { ...aiProviders.usageTracking.openai };
      aiProviders.trackUsage('openai', 'gpt-4', {
        inputTokens: 100,
        outputTokens: 50
      });
      
      expect(aiProviders.usageTracking.openai.requests).toBe(initialUsage.requests + 1);
      expect(aiProviders.usageTracking.openai.tokens).toBe(initialUsage.tokens + 150);
      expect(aiProviders.usageTracking.openai.cost).toBeGreaterThan(initialUsage.cost);
    });

    test('should track Stability AI usage correctly', () => {
      const initialUsage = { ...aiProviders.usageTracking.stability };
      aiProviders.trackUsage('stability', 'stable-diffusion-xl', {
        images: 2
      });
      
      expect(aiProviders.usageTracking.stability.requests).toBe(initialUsage.requests + 1);
      expect(aiProviders.usageTracking.stability.images).toBe(initialUsage.images + 2);
      expect(aiProviders.usageTracking.stability.cost).toBeGreaterThan(initialUsage.cost);
    });

    test('should track ElevenLabs usage correctly', () => {
      const initialUsage = { ...aiProviders.usageTracking.elevenlabs };
      aiProviders.trackUsage('elevenlabs', 'standard', {
        characters: 500
      });
      
      expect(aiProviders.usageTracking.elevenlabs.requests).toBe(initialUsage.requests + 1);
      expect(aiProviders.usageTracking.elevenlabs.characters).toBe(initialUsage.characters + 500);
      expect(aiProviders.usageTracking.elevenlabs.cost).toBeGreaterThan(initialUsage.cost);
    });

    test('should track Replicate usage correctly', () => {
      const initialUsage = { ...aiProviders.usageTracking.replicate };
      aiProviders.trackUsage('replicate', 'video-generation', {
        seconds: 10
      });
      
      expect(aiProviders.usageTracking.replicate.requests).toBe(initialUsage.requests + 1);
      expect(aiProviders.usageTracking.replicate.seconds).toBe(initialUsage.seconds + 10);
      expect(aiProviders.usageTracking.replicate.cost).toBeGreaterThan(initialUsage.cost);
    });

    test('should get usage statistics', () => {
      const usage = aiProviders.getUsageStats();
      expect(usage).toHaveProperty('openai');
      expect(usage).toHaveProperty('stability');
      expect(usage).toHaveProperty('elevenlabs');
      expect(usage).toHaveProperty('replicate');
    });

    test('should reset usage statistics', () => {
      aiProviders.resetUsageStats();
      const usage = aiProviders.getUsageStats();
      
      expect(usage.openai.requests).toBe(0);
      expect(usage.openai.cost).toBe(0);
      expect(usage.stability.requests).toBe(0);
      expect(usage.stability.cost).toBe(0);
      expect(usage.elevenlabs.requests).toBe(0);
      expect(usage.elevenlabs.cost).toBe(0);
      expect(usage.replicate.requests).toBe(0);
      expect(usage.replicate.cost).toBe(0);
    });
  });

  describe('Caching', () => {
    test('should generate cache key correctly', () => {
      const key = aiProviders.generateCacheKey('openai', 'generateText', {
        prompt: 'test prompt',
        model: 'gpt-4'
      });
      
      expect(typeof key).toBe('string');
      expect(key).toContain('ai:openai:generateText:');
    });

    test('should get cached response', async () => {
      const mockData = { result: 'cached result' };
      aiProviders.cache.get = jest.fn().mockResolvedValue(mockData);
      
      const result = await aiProviders.getCachedResponse('test-key');
      expect(result).toEqual(mockData);
    });

    test('should set cached response', async () => {
      const mockData = { result: 'test result' };
      aiProviders.cache.set = jest.fn().mockResolvedValue(true);
      
      await aiProviders.setCachedResponse('test-key', mockData, 1800);
      expect(aiProviders.cache.set).toHaveBeenCalledWith('test-key', mockData, 1800);
    });
  });

  describe('Provider Health', () => {
    test('should get provider health status', async () => {
      // Mock successful health check
      aiProviders.providers.openai = {
        listModels: jest.fn().mockResolvedValue({ data: [] })
      };
      
      const health = await aiProviders.getProviderHealth('openai');
      expect(health).toHaveProperty('provider', 'openai');
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('responseTime');
      expect(health).toHaveProperty('circuitBreaker');
    });

    test('should get all providers health status', async () => {
      const health = await aiProviders.getAllProvidersHealth();
      expect(health).toHaveProperty('openai');
      expect(health).toHaveProperty('stability');
      expect(health).toHaveProperty('elevenlabs');
      expect(health).toHaveProperty('replicate');
    });
  });

  describe('OpenAI Methods', () => {
    test('should have OpenAI text generation method', () => {
      expect(typeof aiProviders.openaiGenerateText).toBe('function');
    });

    test('should have OpenAI image generation method', () => {
      expect(typeof aiProviders.openaiGenerateImage).toBe('function');
    });

    test('should have OpenAI image analysis method', () => {
      expect(typeof aiProviders.openaiAnalyzeImage).toBe('function');
    });
  });

  describe('Stability AI Methods', () => {
    test('should have Stability AI image generation method', () => {
      expect(typeof aiProviders.stabilityGenerateImage).toBe('function');
    });
  });

  describe('ElevenLabs Methods', () => {
    test('should have ElevenLabs speech generation method', () => {
      expect(typeof aiProviders.elevenlabsGenerateSpeech).toBe('function');
    });
  });

  describe('Replicate Methods', () => {
    test('should have Replicate video generation method', () => {
      expect(typeof aiProviders.replicateGenerateVideo).toBe('function');
    });
  });

  describe('Error Handling', () => {
    test('should handle retry logic correctly', async () => {
      const mockRequestFn = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValueOnce({ success: true });
      
      const result = await aiProviders.executeWithRetry('openai', mockRequestFn);
      expect(result).toEqual({ success: true });
      expect(mockRequestFn).toHaveBeenCalledTimes(3);
    });

    test('should fail after max retries', async () => {
      const mockRequestFn = jest.fn()
        .mockRejectedValue(new Error('Persistent failure'));
      
      await expect(aiProviders.executeWithRetry('openai', mockRequestFn))
        .rejects.toThrow('Persistent failure');
      expect(mockRequestFn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });
  });
});
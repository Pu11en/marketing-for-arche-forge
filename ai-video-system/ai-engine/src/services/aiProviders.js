const logger = require('../utils/logger');
const { cache } = require('./redis');
const axios = require('axios');
const crypto = require('crypto');

/**
 * AI Providers Service - Abstraction layer for multiple AI services
 * Provides unified interface for OpenAI, Stability AI, ElevenLabs, and Replicate
 */
class AIProvidersService {
  constructor() {
    this.providers = {
      openai: null,
      stability: null,
      elevenlabs: null,
      replicate: null
    };
    
    this.rateLimiters = {
      openai: new Map(),
      stability: new Map(),
      elevenlabs: new Map(),
      replicate: new Map()
    };
    
    this.usageTracking = {
      openai: { requests: 0, tokens: 0, cost: 0 },
      stability: { requests: 0, images: 0, cost: 0 },
      elevenlabs: { requests: 0, characters: 0, cost: 0 },
      replicate: { requests: 0, seconds: 0, cost: 0 }
    };
    
    this.circuitBreakers = {
      openai: { failures: 0, lastFailure: 0, state: 'CLOSED' },
      stability: { failures: 0, lastFailure: 0, state: 'CLOSED' },
      elevenlabs: { failures: 0, lastFailure: 0, state: 'CLOSED' },
      replicate: { failures: 0, lastFailure: 0, state: 'CLOSED' }
    };
    
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000
    };
    
    this.costRates = {
      openai: {
        'gpt-4': { input: 0.03, output: 0.06 }, // per 1K tokens
        'gpt-4-vision-preview': { input: 0.03, output: 0.06 },
        'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
        'dall-e-3': { image: 0.04 } // per image
      },
      stability: {
        'stable-diffusion-xl': { image: 0.04 } // per image
      },
      elevenlabs: {
        'standard': { characters: 0.00015 }, // per character
        'premium': { characters: 0.0003 }
      },
      replicate: {
        'video-generation': { second: 0.001 } // per second
      }
    };
  }

  /**
   * Initialize all AI providers
   */
  async initialize() {
    try {
      await this.initializeOpenAI();
      await this.initializeStabilityAI();
      await this.initializeElevenLabs();
      await this.initializeReplicate();
      
      logger.info('All AI providers initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize AI providers:', error);
      throw error;
    }
  }

  /**
   * Initialize OpenAI provider
   */
  async initializeOpenAI() {
    try {
      const { Configuration, OpenAIApi } = require('openai');
      const configuration = new Configuration({
        apiKey: process.env.OPENAI_API_KEY,
      });
      this.providers.openai = new OpenAIApi(configuration);
      
      // Test connection
      await this.providers.openai.listModels();
      
      logger.info('OpenAI provider initialized');
    } catch (error) {
      logger.error('Failed to initialize OpenAI:', error);
      throw error;
    }
  }

  /**
   * Initialize Stability AI provider
   */
  async initializeStabilityAI() {
    try {
      // Note: Using direct HTTP client as the SDK might not be available
      this.providers.stability = {
        apiKey: process.env.STABILITY_API_KEY,
        baseURL: 'https://api.stability.ai/v1',
        client: axios.create({
          baseURL: 'https://api.stability.ai/v1',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`,
            'Accept': 'application/json'
          },
          timeout: 60000
        })
      };
      
      // Test connection
      await this.providers.stability.client.get('/engines/list');
      
      logger.info('Stability AI provider initialized');
    } catch (error) {
      logger.error('Failed to initialize Stability AI:', error);
      throw error;
    }
  }

  /**
   * Initialize ElevenLabs provider
   */
  async initializeElevenLabs() {
    try {
      // Note: Using direct HTTP client as the SDK might not be available
      this.providers.elevenlabs = {
        apiKey: process.env.ELEVENLABS_API_KEY,
        baseURL: 'https://api.elevenlabs.io/v1',
        client: axios.create({
          baseURL: 'https://api.elevenlabs.io/v1',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Accept': 'application/json'
          },
          timeout: 60000
        })
      };
      
      // Test connection
      await this.providers.elevenlabs.client.get('/voices');
      
      logger.info('ElevenLabs provider initialized');
    } catch (error) {
      logger.error('Failed to initialize ElevenLabs:', error);
      throw error;
    }
  }

  /**
   * Initialize Replicate provider
   */
  async initializeReplicate() {
    try {
      // Note: Using direct HTTP client as the SDK might not be available
      this.providers.replicate = {
        apiKey: process.env.REPLICATE_API_TOKEN,
        baseURL: 'https://api.replicate.com/v1',
        client: axios.create({
          baseURL: 'https://api.replicate.com/v1',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
            'Accept': 'application/json'
          },
          timeout: 300000 // 5 minutes for long-running tasks
        })
      };
      
      // Test connection
      await this.providers.replicate.client.get('/collections');
      
      logger.info('Replicate provider initialized');
    } catch (error) {
      logger.error('Failed to initialize Replicate:', error);
      throw error;
    }
  }

  /**
   * Check rate limit for provider
   * @param {string} provider - Provider name
   * @param {string} identifier - User or API key identifier
   * @param {number} limit - Rate limit
   * @param {number} window - Time window in seconds
   * @returns {Promise<boolean>} Whether request is allowed
   */
  async checkRateLimit(provider, identifier, limit, window) {
    const key = `${provider}:${identifier}`;
    const now = Date.now();
    const windowMs = window * 1000;
    
    if (!this.rateLimiters[provider].has(key)) {
      this.rateLimiters[provider].set(key, []);
    }
    
    const requests = this.rateLimiters[provider].get(key);
    
    // Remove old requests outside the window
    const validRequests = requests.filter(timestamp => now - timestamp < windowMs);
    this.rateLimiters[provider].set(key, validRequests);
    
    // Check if under limit
    if (validRequests.length >= limit) {
      logger.warn(`Rate limit exceeded for ${provider}:${identifier}`);
      return false;
    }
    
    // Add current request
    validRequests.push(now);
    return true;
  }

  /**
   * Check circuit breaker state
   * @param {string} provider - Provider name
   * @returns {boolean} Whether circuit is open (blocking requests)
   */
  checkCircuitBreaker(provider) {
    const breaker = this.circuitBreakers[provider];
    const now = Date.now();
    const timeoutMs = 60000; // 1 minute timeout
    
    if (breaker.state === 'OPEN') {
      if (now - breaker.lastFailure > timeoutMs) {
        breaker.state = 'HALF_OPEN';
        logger.info(`Circuit breaker for ${provider} moved to HALF_OPEN`);
        return false;
      }
      return true; // Circuit is open, block request
    }
    
    return false; // Circuit is closed or half-open, allow request
  }

  /**
   * Record circuit breaker failure
   * @param {string} provider - Provider name
   */
  recordCircuitBreakerFailure(provider) {
    const breaker = this.circuitBreakers[provider];
    breaker.failures++;
    breaker.lastFailure = Date.now();
    
    if (breaker.failures >= 5) {
      breaker.state = 'OPEN';
      logger.warn(`Circuit breaker for ${provider} opened due to repeated failures`);
    }
  }

  /**
   * Record circuit breaker success
   * @param {string} provider - Provider name
   */
  recordCircuitBreakerSuccess(provider) {
    const breaker = this.circuitBreakers[provider];
    breaker.failures = 0;
    breaker.state = 'CLOSED';
  }

  /**
   * Execute request with retry logic
   * @param {string} provider - Provider name
   * @param {Function} requestFn - Request function
   * @param {Object} options - Request options
   * @returns {Promise<any>} Request result
   */
  async executeWithRetry(provider, requestFn, options = {}) {
    const maxRetries = options.maxRetries || this.retryConfig.maxRetries;
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check circuit breaker
        if (this.checkCircuitBreaker(provider)) {
          throw new Error(`Circuit breaker is open for ${provider}`);
        }
        
        const result = await requestFn();
        this.recordCircuitBreakerSuccess(provider);
        return result;
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          this.recordCircuitBreakerFailure(provider);
          throw error;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(2, attempt),
          this.retryConfig.maxDelay
        );
        
        logger.warn(`Request to ${provider} failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`, {
          error: error.message
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  /**
   * Track usage and cost for provider
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   * @param {Object} usage - Usage metrics
   */
  trackUsage(provider, model, usage) {
    const tracking = this.usageTracking[provider];
    const rates = this.costRates[provider]?.[model];
    
    if (!rates) {
      logger.warn(`No cost rates found for ${provider}:${model}`);
      return;
    }
    
    let cost = 0;
    
    if (provider === 'openai') {
      tracking.requests++;
      tracking.tokens += (usage.inputTokens || 0) + (usage.outputTokens || 0);
      cost = (usage.inputTokens || 0) * rates.input / 1000 + (usage.outputTokens || 0) * rates.output / 1000;
      if (usage.images) {
        cost += usage.images * rates.image;
      }
    } else if (provider === 'stability') {
      tracking.requests++;
      tracking.images += usage.images || 1;
      cost = (usage.images || 1) * rates.image;
    } else if (provider === 'elevenlabs') {
      tracking.requests++;
      tracking.characters += usage.characters || 0;
      cost = (usage.characters || 0) * rates.characters;
    } else if (provider === 'replicate') {
      tracking.requests++;
      tracking.seconds += usage.seconds || 0;
      cost = (usage.seconds || 0) * rates.second;
    }
    
    tracking.cost += cost;
    
    logger.debug(`Usage tracked for ${provider}:${model}`, {
      usage,
      cost: cost.toFixed(6),
      totalCost: tracking.cost.toFixed(6)
    });
  }

  /**
   * Get cached response
   * @param {string} key - Cache key
   * @returns {Promise<any>} Cached response or null
   */
  async getCachedResponse(key) {
    try {
      return await cache.get(key);
    } catch (error) {
      logger.warn('Failed to get cached response:', error);
      return null;
    }
  }

  /**
   * Set cached response
   * @param {string} key - Cache key
   * @param {any} response - Response to cache
   * @param {number} ttl - Time to live in seconds
   */
  async setCachedResponse(key, response, ttl = 3600) {
    try {
      await cache.set(key, response, ttl);
    } catch (error) {
      logger.warn('Failed to set cached response:', error);
    }
  }

  /**
   * Generate cache key for request
   * @param {string} provider - Provider name
   * @param {string} method - Method name
   * @param {Object} params - Request parameters
   * @returns {string} Cache key
   */
  generateCacheKey(provider, method, params) {
    const hash = crypto
      .createHash('md5')
      .update(JSON.stringify(params))
      .digest('hex');
    return `ai:${provider}:${method}:${hash}`;
  }

  /**
   * OpenAI: Generate text completion
   * @param {Object} params - Request parameters
   * @returns {Promise<Object>} Completion result
   */
  async openaiGenerateText(params) {
    const cacheKey = this.generateCacheKey('openai', 'generateText', params);
    const cached = await this.getCachedResponse(cacheKey);
    if (cached) return cached;

    return this.executeWithRetry('openai', async () => {
      const response = await this.providers.openai.createChatCompletion({
        model: params.model || 'gpt-4',
        messages: params.messages,
        max_tokens: params.maxTokens || 1000,
        temperature: params.temperature || 0.7,
        ...params.options
      });

      const result = {
        content: response.data.choices[0].message.content,
        usage: {
          inputTokens: response.data.usage.prompt_tokens,
          outputTokens: response.data.usage.completion_tokens,
          totalTokens: response.data.usage.total_tokens
        }
      };

      this.trackUsage('openai', params.model || 'gpt-4', result.usage);
      await this.setCachedResponse(cacheKey, result, 1800); // 30 minutes

      return result;
    });
  }

  /**
   * OpenAI: Generate image
   * @param {Object} params - Request parameters
   * @returns {Promise<Object>} Image generation result
   */
  async openaiGenerateImage(params) {
    const cacheKey = this.generateCacheKey('openai', 'generateImage', params);
    const cached = await this.getCachedResponse(cacheKey);
    if (cached) return cached;

    return this.executeWithRetry('openai', async () => {
      const response = await this.providers.openai.createImage({
        prompt: params.prompt,
        n: params.n || 1,
        size: params.size || '1024x1024',
        quality: params.quality || 'standard',
        style: params.style || 'natural'
      });

      const result = {
        images: response.data.data.map(item => ({
          url: item.url,
          revisedPrompt: item.revised_prompt
        })),
        usage: { images: params.n || 1 }
      };

      this.trackUsage('openai', 'dall-e-3', result.usage);
      await this.setCachedResponse(cacheKey, result, 3600); // 1 hour

      return result;
    });
  }

  /**
   * OpenAI: Analyze image with vision
   * @param {Object} params - Request parameters
   * @returns {Promise<Object>} Image analysis result
   */
  async openaiAnalyzeImage(params) {
    const cacheKey = this.generateCacheKey('openai', 'analyzeImage', params);
    const cached = await this.getCachedResponse(cacheKey);
    if (cached) return cached;

    return this.executeWithRetry('openai', async () => {
      const response = await this.providers.openai.createChatCompletion({
        model: 'gpt-4-vision-preview',
        messages: [
          {
            role: 'system',
            content: params.systemPrompt || 'You are an expert image analyst.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: params.prompt || 'Analyze this image'
              },
              {
                type: 'image_url',
                image_url: {
                  url: params.imageUrl
                }
              }
            ]
          }
        ],
        max_tokens: params.maxTokens || 1000,
        temperature: params.temperature || 0.3
      });

      const result = {
        content: response.data.choices[0].message.content,
        usage: {
          inputTokens: response.data.usage.prompt_tokens,
          outputTokens: response.data.usage.completion_tokens,
          totalTokens: response.data.usage.total_tokens
        }
      };

      this.trackUsage('openai', 'gpt-4-vision-preview', result.usage);
      await this.setCachedResponse(cacheKey, result, 1800); // 30 minutes

      return result;
    });
  }

  /**
   * Stability AI: Generate image
   * @param {Object} params - Request parameters
   * @returns {Promise<Object>} Image generation result
   */
  async stabilityGenerateImage(params) {
    const cacheKey = this.generateCacheKey('stability', 'generateImage', params);
    const cached = await this.getCachedResponse(cacheKey);
    if (cached) return cached;

    return this.executeWithRetry('stability', async () => {
      const engine = params.engine || 'stable-diffusion-xl-1024-v1-0';
      const response = await this.providers.stability.client.post(`/engines/${engine}/text-to-image`, {
        prompt: params.prompt,
        negative_prompt: params.negativePrompt,
        width: params.width || 1024,
        height: params.height || 1024,
        samples: params.samples || 1,
        steps: params.steps || 30,
        cfg_scale: params.cfgScale || 7.5,
        style_preset: params.stylePreset
      });

      const result = {
        images: response.data.artifacts.map(artifact => ({
          base64: artifact.base64,
          seed: artifact.seed
        })),
        usage: { images: params.samples || 1 }
      };

      this.trackUsage('stability', 'stable-diffusion-xl', result.usage);
      await this.setCachedResponse(cacheKey, result, 3600); // 1 hour

      return result;
    });
  }

  /**
   * ElevenLabs: Generate speech
   * @param {Object} params - Request parameters
   * @returns {Promise<Object>} Speech generation result
   */
  async elevenlabsGenerateSpeech(params) {
    const cacheKey = this.generateCacheKey('elevenlabs', 'generateSpeech', params);
    const cached = await this.getCachedResponse(cacheKey);
    if (cached) return cached;

    return this.executeWithRetry('elevenlabs', async () => {
      const voiceId = params.voiceId || 'rachel';
      const modelId = params.modelId || 'eleven_monolingual_v1';
      
      const response = await this.providers.elevenlabs.client.post(
        `/text-to-speech/${voiceId}`,
        {
          text: params.text,
          model_id: modelId,
          voice_settings: params.voiceSettings || {
            stability: 0.75,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true
          }
        },
        {
          responseType: 'arraybuffer'
        }
      );

      const result = {
        audio: Buffer.from(response.data, 'binary').toString('base64'),
        usage: { characters: params.text.length }
      };

      this.trackUsage('elevenlabs', 'standard', result.usage);
      // Don't cache audio responses as they're large

      return result;
    });
  }

  /**
   * Replicate: Generate video
   * @param {Object} params - Request parameters
   * @returns {Promise<Object>} Video generation result
   */
  async replicateGenerateVideo(params) {
    const cacheKey = this.generateCacheKey('replicate', 'generateVideo', params);
    const cached = await this.getCachedResponse(cacheKey);
    if (cached) return cached;

    return this.executeWithRetry('replicate', async () => {
      // Start prediction
      const prediction = await this.providers.replicate.client.post('/predictions', {
        version: params.version,
        input: params.input
      });

      const predictionId = prediction.data.id;
      let result = prediction.data;

      // Poll for completion
      while (result.status === 'starting' || result.status === 'processing') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const checkResponse = await this.providers.replicate.client.get(`/predictions/${predictionId}`);
        result = checkResponse.data;
      }

      if (result.status === 'failed') {
        throw new Error(`Replicate prediction failed: ${result.error}`);
      }

      const finalResult = {
        videoUrl: result.output[0],
        usage: { seconds: params.duration || 5 }
      };

      this.trackUsage('replicate', 'video-generation', finalResult.usage);
      await this.setCachedResponse(cacheKey, finalResult, 3600); // 1 hour

      return finalResult;
    });
  }

  /**
   * Get provider health status
   * @param {string} provider - Provider name
   * @returns {Promise<Object>} Health status
   */
  async getProviderHealth(provider) {
    try {
      const startTime = Date.now();
      
      switch (provider) {
        case 'openai':
          await this.providers.openai.listModels();
          break;
        case 'stability':
          await this.providers.stability.client.get('/engines/list');
          break;
        case 'elevenlabs':
          await this.providers.elevenlabs.client.get('/voices');
          break;
        case 'replicate':
          await this.providers.replicate.client.get('/collections');
          break;
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }
      
      const responseTime = Date.now() - startTime;
      const breaker = this.circuitBreakers[provider];
      
      return {
        provider,
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        circuitBreaker: breaker.state,
        failures: breaker.failures
      };
    } catch (error) {
      return {
        provider,
        status: 'unhealthy',
        error: error.message,
        circuitBreaker: this.circuitBreakers[provider].state
      };
    }
  }

  /**
   * Get all providers health status
   * @returns {Promise<Object>} All providers health status
   */
  async getAllProvidersHealth() {
    const health = {};
    
    for (const provider of Object.keys(this.providers)) {
      health[provider] = await this.getProviderHealth(provider);
    }
    
    return health;
  }

  /**
   * Get usage statistics
   * @param {string} provider - Provider name (optional)
   * @returns {Object} Usage statistics
   */
  getUsageStats(provider = null) {
    if (provider) {
      return this.usageTracking[provider] || {};
    }
    return this.usageTracking;
  }

  /**
   * Reset usage statistics
   * @param {string} provider - Provider name (optional)
   */
  resetUsageStats(provider = null) {
    if (provider) {
      this.usageTracking[provider] = {
        requests: 0,
        tokens: 0,
        images: 0,
        characters: 0,
        seconds: 0,
        cost: 0
      };
    } else {
      for (const p of Object.keys(this.usageTracking)) {
        this.usageTracking[p] = {
          requests: 0,
          tokens: 0,
          images: 0,
          characters: 0,
          seconds: 0,
          cost: 0
        };
      }
    }
  }

  /**
   * Reset circuit breaker
   * @param {string} provider - Provider name
   */
  resetCircuitBreaker(provider) {
    this.circuitBreakers[provider] = {
      failures: 0,
      lastFailure: 0,
      state: 'CLOSED'
    };
    logger.info(`Circuit breaker reset for ${provider}`);
  }
}

module.exports = new AIProvidersService();
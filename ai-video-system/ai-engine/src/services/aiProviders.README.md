# AI Providers Service

The AI Providers service is a comprehensive abstraction layer that provides a unified interface for interacting with multiple AI service providers including OpenAI, Stability AI, ElevenLabs, and Replicate.

## Features

- **Provider Abstraction**: Unified interface for multiple AI providers
- **Error Handling**: Comprehensive error handling with retry logic
- **Rate Limiting**: Built-in rate limiting to prevent API abuse
- **Circuit Breaker**: Automatic failover when providers are experiencing issues
- **Caching**: Intelligent caching to reduce API calls and improve performance
- **Usage Tracking**: Detailed tracking of API usage and costs
- **Monitoring**: Health checks and monitoring capabilities

## Supported Providers

### OpenAI
- Text generation (GPT-4, GPT-3.5-turbo)
- Image generation (DALL-E 3)
- Image analysis (GPT-4 Vision)

### Stability AI
- Image generation (Stable Diffusion XL)

### ElevenLabs
- Text-to-speech synthesis

### Replicate
- Video generation and other ML models

## Usage

### Initialization

The service is automatically initialized when the AI engine starts. Make sure you have the required environment variables set:

```bash
OPENAI_API_KEY=your-openai-api-key
STABILITY_API_KEY=your-stability-api-key
ELEVENLABS_API_KEY=your-elevenlabs-api-key
REPLICATE_API_TOKEN=your-replicate-api-token
```

### Direct Usage

```javascript
const aiProviders = require('./services/aiProviders');

// Generate text with OpenAI
const textResult = await aiProviders.openaiGenerateText({
  model: 'gpt-4',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello, how are you?' }
  ],
  maxTokens: 1000,
  temperature: 0.7
});

// Generate image with Stability AI
const imageResult = await aiProviders.stabilityGenerateImage({
  prompt: 'A beautiful sunset over mountains',
  width: 1024,
  height: 1024,
  steps: 30,
  cfgScale: 7.5
});

// Generate speech with ElevenLabs
const speechResult = await aiProviders.elevenlabsGenerateSpeech({
  text: 'Hello, this is a test of the voice synthesis.',
  voiceId: 'rachel',
  modelId: 'eleven_monolingual_v1'
});

// Generate video with Replicate
const videoResult = await aiProviders.replicateGenerateVideo({
  version: 'model-version-id',
  input: {
    prompt: 'A person walking in a park',
    duration: 5
  }
});
```

### HTTP API Usage

The service also exposes HTTP endpoints through the `/api/ai-providers` route:

#### Health Checks
```bash
# Get health of all providers
GET /api/ai-providers/health

# Get health of specific provider
GET /api/ai-providers/health/openai
```

#### Usage Statistics
```bash
# Get usage for all providers
GET /api/ai-providers/usage

# Get usage for specific provider
GET /api/ai-providers/usage/openai

# Reset usage statistics
POST /api/ai-providers/usage/reset
POST /api/ai-providers/usage/reset/openai
```

#### Direct API Calls
```bash
# OpenAI text generation
POST /api/ai-providers/openai/text
{
  "messages": [...],
  "model": "gpt-4",
  "maxTokens": 1000,
  "temperature": 0.7
}

# OpenAI image generation
POST /api/ai-providers/openai/image
{
  "prompt": "A beautiful landscape",
  "size": "1024x1024",
  "quality": "hd"
}

# Stability AI image generation
POST /api/ai-providers/stability/image
{
  "prompt": "A futuristic city",
  "width": 1024,
  "height": 1024,
  "steps": 30
}

# ElevenLabs speech generation
POST /api/ai-providers/elevenlabs/speech
{
  "text": "Hello world",
  "voiceId": "rachel"
}

# Replicate video generation
POST /api/ai-providers/replicate/video
{
  "version": "model-version",
  "input": { ... }
}
```

## Configuration

### Rate Limiting

Each provider has configurable rate limits:

```javascript
// Check rate limit (returns boolean)
const allowed = await aiProviders.checkRateLimit(
  'openai',           // provider
  'user-123',         // identifier (user ID, API key, etc.)
  100,                // limit (requests)
  60                  // window (seconds)
);
```

### Circuit Breaker

The circuit breaker automatically opens when a provider fails repeatedly:

```javascript
// Check if circuit is open
const isOpen = aiProviders.checkCircuitBreaker('openai');

// Reset circuit breaker manually
aiProviders.resetCircuitBreaker('openai');
```

### Usage Tracking

Track API usage and costs:

```javascript
// Get usage statistics
const usage = aiProviders.getUsageStats();
console.log(usage.openai.cost); // Total cost for OpenAI

// Reset usage statistics
aiProviders.resetUsageStats(); // All providers
aiProviders.resetUsageStats('openai'); // Specific provider
```

### Caching

The service automatically caches responses to improve performance:

```javascript
// Cache keys are generated automatically
const key = aiProviders.generateCacheKey('openai', 'generateText', params);

// Manual cache operations
const cached = await aiProviders.getCachedResponse(key);
await aiProviders.setCachedResponse(key, response, 3600); // 1 hour TTL
```

## Error Handling

The service includes comprehensive error handling:

1. **Automatic Retries**: Failed requests are retried with exponential backoff
2. **Circuit Breaker**: Automatically stops sending requests to failing providers
3. **Graceful Degradation**: Falls back to alternative providers when possible
4. **Detailed Logging**: All errors are logged with context

## Cost Tracking

The service tracks costs for each provider based on usage:

- **OpenAI**: Tracked by tokens and images
- **Stability AI**: Tracked by images generated
- **ElevenLabs**: Tracked by characters synthesized
- **Replicate**: Tracked by seconds of video generated

Cost rates are configured in the service and can be updated as pricing changes.

## Monitoring

### Health Checks

Each provider has a health check endpoint that verifies connectivity and response times:

```javascript
const health = await aiProviders.getProviderHealth('openai');
// Returns: { provider, status, responseTime, circuitBreaker, failures }
```

### Metrics

The service provides detailed metrics for monitoring:

- Request counts per provider
- Success/failure rates
- Response times
- Circuit breaker states
- Usage statistics
- Cost tracking

## Testing

Run the test suite:

```bash
npm test -- aiProviders.test.js
```

The test suite covers:
- Provider initialization
- Rate limiting
- Circuit breaker functionality
- Usage tracking
- Caching
- Error handling
- API methods

## Best Practices

1. **Use Caching**: The service automatically caches responses, but you can implement additional caching at the application level
2. **Monitor Usage**: Regularly check usage statistics to manage costs
3. **Handle Failures**: Always handle potential failures and implement fallbacks
4. **Rate Limiting**: Implement client-side rate limiting to prevent API abuse
5. **Circuit Breakers**: Monitor circuit breaker states and implement appropriate fallbacks

## Troubleshooting

### Common Issues

1. **API Key Errors**: Ensure all required environment variables are set
2. **Rate Limiting**: Check if you're hitting API limits
3. **Circuit Breaker**: Reset if a provider is incorrectly marked as down
4. **Cache Issues**: Clear cache if you're getting stale responses

### Debug Mode

Enable debug logging:

```javascript
logger.level = 'debug';
```

This will provide detailed logs for all AI provider operations.
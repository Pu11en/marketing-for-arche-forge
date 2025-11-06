const express = require('express');
const router = express.Router();
const aiProviders = require('../services/aiProviders');
const logger = require('../utils/logger');

/**
 * Get health status of all AI providers
 */
router.get('/health', async (req, res) => {
  try {
    const health = await aiProviders.getAllProvidersHealth();
    res.json({
      success: true,
      data: health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get AI providers health:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get health status of specific AI provider
 */
router.get('/health/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const health = await aiProviders.getProviderHealth(provider);
    res.json({
      success: true,
      data: health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Failed to get ${req.params.provider} health:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get usage statistics for all providers
 */
router.get('/usage', async (req, res) => {
  try {
    const usage = aiProviders.getUsageStats();
    res.json({
      success: true,
      data: usage,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get usage statistics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get usage statistics for specific provider
 */
router.get('/usage/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const usage = aiProviders.getUsageStats(provider);
    res.json({
      success: true,
      data: usage,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Failed to get ${req.params.provider} usage:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Reset usage statistics for all providers
 */
router.post('/usage/reset', async (req, res) => {
  try {
    aiProviders.resetUsageStats();
    res.json({
      success: true,
      message: 'Usage statistics reset for all providers',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to reset usage statistics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Reset usage statistics for specific provider
 */
router.post('/usage/reset/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    aiProviders.resetUsageStats(provider);
    res.json({
      success: true,
      message: `Usage statistics reset for ${provider}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Failed to reset ${req.params.provider} usage:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Reset circuit breaker for specific provider
 */
router.post('/circuit-breaker/reset/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    aiProviders.resetCircuitBreaker(provider);
    res.json({
      success: true,
      message: `Circuit breaker reset for ${provider}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Failed to reset ${req.params.provider} circuit breaker:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * OpenAI: Generate text completion
 */
router.post('/openai/text', async (req, res) => {
  try {
    const { messages, model, maxTokens, temperature, options } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        error: 'Messages array is required'
      });
    }
    
    const result = await aiProviders.openaiGenerateText({
      messages,
      model,
      maxTokens,
      temperature,
      options
    });
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('OpenAI text generation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * OpenAI: Generate image
 */
router.post('/openai/image', async (req, res) => {
  try {
    const { prompt, n, size, quality, style } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }
    
    const result = await aiProviders.openaiGenerateImage({
      prompt,
      n,
      size,
      quality,
      style
    });
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('OpenAI image generation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * OpenAI: Analyze image
 */
router.post('/openai/analyze-image', async (req, res) => {
  try {
    const { imageUrl, prompt, systemPrompt, maxTokens, temperature } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: 'Image URL is required'
      });
    }
    
    const result = await aiProviders.openaiAnalyzeImage({
      imageUrl,
      prompt,
      systemPrompt,
      maxTokens,
      temperature
    });
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('OpenAI image analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Stability AI: Generate image
 */
router.post('/stability/image', async (req, res) => {
  try {
    const { prompt, negativePrompt, width, height, samples, steps, cfgScale, stylePreset } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }
    
    const result = await aiProviders.stabilityGenerateImage({
      prompt,
      negativePrompt,
      width,
      height,
      samples,
      steps,
      cfgScale,
      stylePreset
    });
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Stability AI image generation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ElevenLabs: Generate speech
 */
router.post('/elevenlabs/speech', async (req, res) => {
  try {
    const { text, voiceId, modelId, voiceSettings } = req.body;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required'
      });
    }
    
    const result = await aiProviders.elevenlabsGenerateSpeech({
      text,
      voiceId,
      modelId,
      voiceSettings
    });
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('ElevenLabs speech generation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Replicate: Generate video
 */
router.post('/replicate/video', async (req, res) => {
  try {
    const { version, input, duration } = req.body;
    
    if (!version || !input) {
      return res.status(400).json({
        success: false,
        error: 'Version and input are required'
      });
    }
    
    const result = await aiProviders.replicateGenerateVideo({
      version,
      input,
      duration
    });
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Replicate video generation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
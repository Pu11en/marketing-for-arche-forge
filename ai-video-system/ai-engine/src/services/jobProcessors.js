const logger = require('../utils/logger');
const { workerPool } = require('./workerPool');
const aiProviders = require('./aiProviders');
const { getCachedJobResult, cacheJobResult } = require('./jobQueue');

/**
 * Job Processors - Handle processing of different job types
 * Integrates with worker pool and AI providers
 */

/**
 * Process video generation job
 * @param {Object} job - Bull job instance
 * @returns {Promise<Object>} Processing result
 */
const processVideoGeneration = async (job) => {
  const { data } = job;
  const { userId, projectId, script, scenes, options } = data;
  
  try {
    logger.info(`Processing video generation job`, {
      jobId: job.id,
      userId,
      projectId
    });
    
    // Update progress
    await job.progress(10);
    
    // Check cache first
    const cacheKey = `video_generation:${JSON.stringify({ script, scenes, options })}`;
    const cached = await getCachedJobResult(cacheKey);
    if (cached && !options.skipCache) {
      logger.info(`Using cached video generation result`, { jobId: job.id });
      return cached;
    }
    
    // Process scenes in parallel if possible
    const sceneResults = [];
    const totalScenes = scenes.length;
    
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      
      // Update progress
      await job.progress(10 + (i / totalScenes) * 60);
      
      // Generate scene content
      const sceneResult = await workerPool.executeTask('video_generation', {
        scene,
        script: script.scenes[i] || '',
        options: {
          ...options,
          sceneIndex: i
        }
      });
      
      sceneResults.push(sceneResult);
    }
    
    // Update progress
    await job.progress(80);
    
    // Compose final video
    const compositionResult = await workerPool.executeTask('video_composition', {
      scenes: sceneResults,
      script,
      options
    });
    
    // Update progress
    await job.progress(95);
    
    // Apply personalization if needed
    let finalResult = compositionResult;
    if (options.personalization) {
      finalResult = await workerPool.executeTask('personalization', {
        video: compositionResult,
        userId,
        personalization: options.personalization
      });
    }
    
    // Cache result
    await cacheJobResult(cacheKey, finalResult);
    
    // Update progress
    await job.progress(100);
    
    logger.info(`Video generation job completed`, {
      jobId: job.id,
      userId,
      projectId
    });
    
    return finalResult;
  } catch (error) {
    logger.error(`Video generation job failed`, {
      jobId: job.id,
      userId,
      projectId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Process script generation job
 * @param {Object} job - Bull job instance
 * @returns {Promise<Object>} Processing result
 */
const processScriptGeneration = async (job) => {
  const { data } = job;
  const { userId, projectId, prompt, options } = data;
  
  try {
    logger.info(`Processing script generation job`, {
      jobId: job.id,
      userId,
      projectId
    });
    
    // Update progress
    await job.progress(10);
    
    // Check cache first
    const cacheKey = `script_generation:${JSON.stringify({ prompt, options })}`;
    const cached = await getCachedJobResult(cacheKey);
    if (cached && !options.skipCache) {
      logger.info(`Using cached script generation result`, { jobId: job.id });
      return cached;
    }
    
    // Generate script using AI provider
    const scriptResult = await aiProviders.openaiGenerateText({
      model: options.model || 'gpt-4',
      messages: [
        {
          role: 'system',
          content: options.systemPrompt || 'You are an expert video script writer. Create engaging, well-structured scripts for videos.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      maxTokens: options.maxTokens || 2000,
      temperature: options.temperature || 0.7
    });
    
    // Update progress
    await job.progress(60);
    
    // Parse and structure the script
    const structuredScript = await workerPool.executeTask('content_analysis', {
      content: scriptResult.content,
      type: 'script',
      options: {
        extractScenes: true,
        extractTiming: true,
        extractVisuals: true
      }
    });
    
    // Update progress
    await job.progress(90);
    
    const result = {
      script: scriptResult.content,
      structured: structuredScript,
      usage: scriptResult.usage
    };
    
    // Cache result
    await cacheJobResult(cacheKey, result);
    
    // Update progress
    await job.progress(100);
    
    logger.info(`Script generation job completed`, {
      jobId: job.id,
      userId,
      projectId
    });
    
    return result;
  } catch (error) {
    logger.error(`Script generation job failed`, {
      jobId: job.id,
      userId,
      projectId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Process scene creation job
 * @param {Object} job - Bull job instance
 * @returns {Promise<Object>} Processing result
 */
const processSceneCreation = async (job) => {
  const { data } = job;
  const { userId, projectId, scene, script, options } = data;
  
  try {
    logger.info(`Processing scene creation job`, {
      jobId: job.id,
      userId,
      projectId
    });
    
    // Update progress
    await job.progress(10);
    
    // Check cache first
    const cacheKey = `scene_creation:${JSON.stringify({ scene, script, options })}`;
    const cached = await getCachedJobResult(cacheKey);
    if (cached && !options.skipCache) {
      logger.info(`Using cached scene creation result`, { jobId: job.id });
      return cached;
    }
    
    // Generate scene visuals
    const visualPrompts = await aiProviders.openaiGenerateText({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert visual director. Generate detailed visual descriptions for video scenes based on scripts.'
        },
        {
          role: 'user',
          content: `Script: ${script}\n\nScene: ${JSON.stringify(scene)}\n\nGenerate visual descriptions for this scene.`
        }
      ],
      maxTokens: 500,
      temperature: 0.5
    });
    
    // Update progress
    await job.progress(30);
    
    // Generate scene images
    const imagePrompts = visualPrompts.content.split('\n').filter(line => line.trim());
    const sceneImages = [];
    
    for (let i = 0; i < imagePrompts.length; i++) {
      const prompt = imagePrompts[i];
      
      // Update progress
      await job.progress(30 + (i / imagePrompts.length) * 40);
      
      const imageResult = await aiProviders.stabilityGenerateImage({
        prompt,
        width: options.width || 1024,
        height: options.height || 576,
        samples: 1,
        steps: options.steps || 30,
        cfgScale: options.cfgScale || 7.5
      });
      
      sceneImages.push(...imageResult.images);
    }
    
    // Update progress
    await job.progress(80);
    
    // Generate scene audio if needed
    let sceneAudio = null;
    if (options.includeAudio && script) {
      const audioResult = await aiProviders.elevenlabsGenerateSpeech({
        text: script,
        voiceId: options.voiceId || 'rachel',
        modelId: options.modelId || 'eleven_monolingual_v1',
        voiceSettings: options.voiceSettings
      });
      
      sceneAudio = audioResult.audio;
    }
    
    // Update progress
    await job.progress(95);
    
    const result = {
      scene,
      images: sceneImages,
      audio: sceneAudio,
      visualPrompts: visualPrompts.content
    };
    
    // Cache result
    await cacheJobResult(cacheKey, result);
    
    // Update progress
    await job.progress(100);
    
    logger.info(`Scene creation job completed`, {
      jobId: job.id,
      userId,
      projectId
    });
    
    return result;
  } catch (error) {
    logger.error(`Scene creation job failed`, {
      jobId: job.id,
      userId,
      projectId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Process audio synthesis job
 * @param {Object} job - Bull job instance
 * @returns {Promise<Object>} Processing result
 */
const processAudioSynthesis = async (job) => {
  const { data } = job;
  const { userId, projectId, text, options } = data;
  
  try {
    logger.info(`Processing audio synthesis job`, {
      jobId: job.id,
      userId,
      projectId
    });
    
    // Update progress
    await job.progress(10);
    
    // Check cache first
    const cacheKey = `audio_synthesis:${JSON.stringify({ text, options })}`;
    const cached = await getCachedJobResult(cacheKey);
    if (cached && !options.skipCache) {
      logger.info(`Using cached audio synthesis result`, { jobId: job.id });
      return cached;
    }
    
    // Generate audio using ElevenLabs
    const audioResult = await aiProviders.elevenlabsGenerateSpeech({
      text,
      voiceId: options.voiceId || 'rachel',
      modelId: options.modelId || 'eleven_monolingual_v1',
      voiceSettings: options.voiceSettings || {
        stability: 0.75,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true
      }
    });
    
    // Update progress
    await job.progress(90);
    
    const result = {
      audio: audioResult.audio,
      usage: audioResult.usage
    };
    
    // Cache result
    await cacheJobResult(cacheKey, result);
    
    // Update progress
    await job.progress(100);
    
    logger.info(`Audio synthesis job completed`, {
      jobId: job.id,
      userId,
      projectId
    });
    
    return result;
  } catch (error) {
    logger.error(`Audio synthesis job failed`, {
      jobId: job.id,
      userId,
      projectId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Process image generation job
 * @param {Object} job - Bull job instance
 * @returns {Promise<Object>} Processing result
 */
const processImageGeneration = async (job) => {
  const { data } = job;
  const { userId, projectId, prompt, options } = data;
  
  try {
    logger.info(`Processing image generation job`, {
      jobId: job.id,
      userId,
      projectId
    });
    
    // Update progress
    await job.progress(10);
    
    // Check cache first
    const cacheKey = `image_generation:${JSON.stringify({ prompt, options })}`;
    const cached = await getCachedJobResult(cacheKey);
    if (cached && !options.skipCache) {
      logger.info(`Using cached image generation result`, { jobId: job.id });
      return cached;
    }
    
    // Generate image using Stability AI
    const imageResult = await aiProviders.stabilityGenerateImage({
      prompt,
      negativePrompt: options.negativePrompt,
      width: options.width || 1024,
      height: options.height || 1024,
      samples: options.samples || 1,
      steps: options.steps || 30,
      cfgScale: options.cfgScale || 7.5,
      stylePreset: options.stylePreset
    });
    
    // Update progress
    await job.progress(90);
    
    const result = {
      images: imageResult.images,
      usage: imageResult.usage
    };
    
    // Cache result
    await cacheJobResult(cacheKey, result);
    
    // Update progress
    await job.progress(100);
    
    logger.info(`Image generation job completed`, {
      jobId: job.id,
      userId,
      projectId
    });
    
    return result;
  } catch (error) {
    logger.error(`Image generation job failed`, {
      jobId: job.id,
      userId,
      projectId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Process world building job
 * @param {Object} job - Bull job instance
 * @returns {Promise<Object>} Processing result
 */
const processWorldBuilding = async (job) => {
  const { data } = job;
  const { userId, projectId, concept, options } = data;
  
  try {
    logger.info(`Processing world building job`, {
      jobId: job.id,
      userId,
      projectId
    });
    
    // Update progress
    await job.progress(10);
    
    // Check cache first
    const cacheKey = `world_building:${JSON.stringify({ concept, options })}`;
    const cached = await getCachedJobResult(cacheKey);
    if (cached && !options.skipCache) {
      logger.info(`Using cached world building result`, { jobId: job.id });
      return cached;
    }
    
    // Generate world concept using AI
    const worldConcept = await aiProviders.openaiGenerateText({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert world builder. Create detailed, immersive worlds for video content.'
        },
        {
          role: 'user',
          content: `Create a detailed world concept based on: ${concept}`
        }
      ],
      maxTokens: 1500,
      temperature: 0.8
    });
    
    // Update progress
    await job.progress(40);
    
    // Generate world visuals
    const visualPrompts = await aiProviders.openaiGenerateText({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'Generate visual prompts for world building based on concepts.'
        },
        {
          role: 'user',
          content: `World concept: ${worldConcept.content}\n\nGenerate 5 detailed visual prompts for this world.`
        }
      ],
      maxTokens: 500,
      temperature: 0.7
    });
    
    // Update progress
    await job.progress(60);
    
    // Generate world images
    const imagePrompts = visualPrompts.content.split('\n').filter(line => line.trim());
    const worldImages = [];
    
    for (let i = 0; i < imagePrompts.length; i++) {
      const prompt = imagePrompts[i];
      
      // Update progress
      await job.progress(60 + (i / imagePrompts.length) * 30);
      
      const imageResult = await aiProviders.stabilityGenerateImage({
        prompt,
        width: options.width || 1024,
        height: options.height || 1024,
        samples: 1,
        steps: options.steps || 30,
        cfgScale: options.cfgScale || 7.5
      });
      
      worldImages.push(...imageResult.images);
    }
    
    // Update progress
    await job.progress(95);
    
    const result = {
      concept: worldConcept.content,
      images: worldImages,
      visualPrompts: visualPrompts.content
    };
    
    // Cache result
    await cacheJobResult(cacheKey, result);
    
    // Update progress
    await job.progress(100);
    
    logger.info(`World building job completed`, {
      jobId: job.id,
      userId,
      projectId
    });
    
    return result;
  } catch (error) {
    logger.error(`World building job failed`, {
      jobId: job.id,
      userId,
      projectId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Process content analysis job
 * @param {Object} job - Bull job instance
 * @returns {Promise<Object>} Processing result
 */
const processContentAnalysis = async (job) => {
  const { data } = job;
  const { userId, projectId, content, type, options } = data;
  
  try {
    logger.info(`Processing content analysis job`, {
      jobId: job.id,
      userId,
      projectId,
      type
    });
    
    // Update progress
    await job.progress(10);
    
    // Check cache first
    const cacheKey = `content_analysis:${JSON.stringify({ content, type, options })}`;
    const cached = await getCachedJobResult(cacheKey);
    if (cached && !options.skipCache) {
      logger.info(`Using cached content analysis result`, { jobId: job.id });
      return cached;
    }
    
    let analysisResult;
    
    switch (type) {
      case 'script':
        analysisResult = await analyzeScript(content, options);
        break;
      case 'image':
        analysisResult = await analyzeImage(content, options);
        break;
      case 'video':
        analysisResult = await analyzeVideo(content, options);
        break;
      case 'text':
        analysisResult = await analyzeText(content, options);
        break;
      default:
        throw new Error(`Unknown content analysis type: ${type}`);
    }
    
    // Update progress
    await job.progress(90);
    
    const result = {
      type,
      analysis: analysisResult,
      usage: analysisResult.usage || null
    };
    
    // Cache result
    await cacheJobResult(cacheKey, result);
    
    // Update progress
    await job.progress(100);
    
    logger.info(`Content analysis job completed`, {
      jobId: job.id,
      userId,
      projectId,
      type
    });
    
    return result;
  } catch (error) {
    logger.error(`Content analysis job failed`, {
      jobId: job.id,
      userId,
      projectId,
      type,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Process video composition job
 * @param {Object} job - Bull job instance
 * @returns {Promise<Object>} Processing result
 */
const processVideoComposition = async (job) => {
  const { data } = job;
  const { userId, projectId, scenes, script, options } = data;
  
  try {
    logger.info(`Processing video composition job`, {
      jobId: job.id,
      userId,
      projectId
    });
    
    // Update progress
    await job.progress(10);
    
    // Check cache first
    const cacheKey = `video_composition:${JSON.stringify({ scenes, script, options })}`;
    const cached = await getCachedJobResult(cacheKey);
    if (cached && !options.skipCache) {
      logger.info(`Using cached video composition result`, { jobId: job.id });
      return cached;
    }
    
    // Compose video using worker pool
    const compositionResult = await workerPool.executeTask('video_composition', {
      scenes,
      script,
      options: {
        ...options,
        outputFormat: options.outputFormat || 'mp4',
        quality: options.quality || 'high',
        resolution: options.resolution || '1080p'
      }
    });
    
    // Update progress
    await job.progress(90);
    
    const result = {
      video: compositionResult.video,
      metadata: compositionResult.metadata,
      duration: compositionResult.duration
    };
    
    // Cache result
    await cacheJobResult(cacheKey, result);
    
    // Update progress
    await job.progress(100);
    
    logger.info(`Video composition job completed`, {
      jobId: job.id,
      userId,
      projectId
    });
    
    return result;
  } catch (error) {
    logger.error(`Video composition job failed`, {
      jobId: job.id,
      userId,
      projectId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Process personalization job
 * @param {Object} job - Bull job instance
 * @returns {Promise<Object>} Processing result
 */
const processPersonalization = async (job) => {
  const { data } = job;
  const { userId, projectId, content, personalization, options } = data;
  
  try {
    logger.info(`Processing personalization job`, {
      jobId: job.id,
      userId,
      projectId
    });
    
    // Update progress
    await job.progress(10);
    
    // Check cache first
    const cacheKey = `personalization:${JSON.stringify({ content, personalization, options })}`;
    const cached = await getCachedJobResult(cacheKey);
    if (cached && !options.skipCache) {
      logger.info(`Using cached personalization result`, { jobId: job.id });
      return cached;
    }
    
    // Apply personalization using worker pool
    const personalizationResult = await workerPool.executeTask('personalization', {
      content,
      personalization,
      options
    });
    
    // Update progress
    await job.progress(90);
    
    const result = {
      personalized: personalizationResult.personalized,
      adjustments: personalizationResult.adjustments
    };
    
    // Cache result
    await cacheJobResult(cacheKey, result);
    
    // Update progress
    await job.progress(100);
    
    logger.info(`Personalization job completed`, {
      jobId: job.id,
      userId,
      projectId
    });
    
    return result;
  } catch (error) {
    logger.error(`Personalization job failed`, {
      jobId: job.id,
      userId,
      projectId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

// Helper functions for content analysis

/**
 * Analyze script content
 * @param {string} content - Script content
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Analysis result
 */
const analyzeScript = async (content, options) => {
  try {
    const analysis = await aiProviders.openaiGenerateText({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert script analyst. Analyze scripts for structure, pacing, dialogue quality, and visual potential.'
        },
        {
          role: 'user',
          content: `Analyze this script:\n\n${content}\n\nProvide analysis on structure, pacing, dialogue, and visual elements.`
        }
      ],
      maxTokens: 1000,
      temperature: 0.3
    });
    
    return {
      analysis: analysis.content,
      usage: analysis.usage
    };
  } catch (error) {
    logger.error('Script analysis failed:', error);
    throw error;
  }
};

/**
 * Analyze image content
 * @param {string} content - Image URL or base64
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Analysis result
 */
const analyzeImage = async (content, options) => {
  try {
    const analysis = await aiProviders.openaiAnalyzeImage({
      imageUrl: content,
      prompt: options.prompt || 'Analyze this image in detail. Describe the visual elements, composition, mood, and any notable features.',
      maxTokens: 500,
      temperature: 0.3
    });
    
    return {
      analysis: analysis.content,
      usage: analysis.usage
    };
  } catch (error) {
    logger.error('Image analysis failed:', error);
    throw error;
  }
};

/**
 * Analyze video content
 * @param {string} content - Video URL or path
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Analysis result
 */
const analyzeVideo = async (content, options) => {
  try {
    // This would typically involve video processing and frame extraction
    // For now, return a placeholder
    return {
      analysis: 'Video analysis not yet implemented',
      usage: null
    };
  } catch (error) {
    logger.error('Video analysis failed:', error);
    throw error;
  }
};

/**
 * Analyze text content
 * @param {string} content - Text content
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Analysis result
 */
const analyzeText = async (content, options) => {
  try {
    const analysis = await aiProviders.openaiGenerateText({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert text analyst. Analyze text for sentiment, readability, key themes, and engagement potential.'
        },
        {
          role: 'user',
          content: `Analyze this text:\n\n${content}\n\nProvide analysis on sentiment, readability, themes, and engagement.`
        }
      ],
      maxTokens: 500,
      temperature: 0.3
    });
    
    return {
      analysis: analysis.content,
      usage: analysis.usage
    };
  } catch (error) {
    logger.error('Text analysis failed:', error);
    throw error;
  }
};

module.exports = {
  processVideoGeneration,
  processScriptGeneration,
  processSceneCreation,
  processAudioSynthesis,
  processImageGeneration,
  processWorldBuilding,
  processContentAnalysis,
  processVideoComposition,
  processPersonalization
};
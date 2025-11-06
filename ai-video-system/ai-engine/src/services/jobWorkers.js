const logger = require('../utils/logger');
const { initializeQueues, getQueue, JOB_TYPES } = require('./jobQueue');
const { workerPool } = require('./workerPool');
const {
  processVideoGeneration,
  processScriptGeneration,
  processSceneCreation,
  processAudioSynthesis,
  processImageGeneration,
  processWorldBuilding,
  processContentAnalysis,
  processVideoComposition,
  processPersonalization
} = require('./jobProcessors');

/**
 * Job Workers - Set up workers for the job queue system
 * Connects job queues to their respective processors
 */

// Worker configuration
const WORKER_CONFIG = {
  concurrency: {
    [JOB_TYPES.VIDEO_GENERATION]: 1,
    [JOB_TYPES.SCRIPT_GENERATION]: 3,
    [JOB_TYPES.SCENE_CREATION]: 2,
    [JOB_TYPES.AUDIO_SYNTHESIS]: 3,
    [JOB_TYPES.IMAGE_GENERATION]: 5,
    [JOB_TYPES.WORLD_BUILDING]: 2,
    [JOB_TYPES.CONTENT_ANALYSIS]: 10,
    [JOB_TYPES.VIDEO_COMPOSITION]: 1,
    [JOB_TYPES.PERSONALIZATION]: 5,
    [JOB_TYPES.AI_PROCESSING]: 3
  }
};

// Worker instances
const workers = {};

/**
 * Initialize job workers
 * @returns {Promise<void>}
 */
const initializeJobWorkers = async () => {
  try {
    // Initialize queues first
    await initializeQueues();
    
    // Initialize worker pool
    await workerPool.initialize();
    
    // Set up workers for each job type and priority
    for (const jobType of Object.values(JOB_TYPES)) {
      for (const priority of ['high', 'normal', 'low']) {
        await setupWorker(jobType, priority);
      }
    }
    
    logger.info('All job workers initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize job workers:', error);
    throw error;
  }
};

/**
 * Set up worker for a specific job type and priority
 * @param {string} jobType - Job type
 * @param {string} priority - Priority level
 * @returns {Promise<void>}
 */
const setupWorker = async (jobType, priority) => {
  try {
    const queue = getQueue(jobType, priority);
    const concurrency = WORKER_CONFIG.concurrency[jobType] || 1;
    
    // Set up worker with appropriate processor
    const processor = getProcessorForJobType(jobType);
    
    const worker = queue.process(concurrency, async (job) => {
      try {
        logger.info(`Processing job ${job.id} in ${jobType}:${priority}`, {
          jobId: job.id,
          jobType,
          priority,
          data: job.data
        });
        
        // Process the job
        const result = await processor(job);
        
        logger.info(`Job ${job.id} completed successfully`, {
          jobId: job.id,
          jobType,
          priority
        });
        
        return result;
      } catch (error) {
        logger.error(`Job ${job.id} processing failed`, {
          jobId: job.id,
          jobType,
          priority,
          error: error.message,
          stack: error.stack
        });
        
        // Re-throw error to let Bull handle retries
        throw error;
      }
    });
    
    // Store worker instance
    const workerKey = `${jobType}:${priority}`;
    workers[workerKey] = worker;
    
    // Set up worker event listeners
    setupWorkerEventListeners(worker, jobType, priority);
    
    logger.info(`Worker set up for ${jobType}:${priority} with concurrency ${concurrency}`);
  } catch (error) {
    logger.error(`Failed to set up worker for ${jobType}:${priority}:`, error);
    throw error;
  }
};

/**
 * Get processor function for job type
 * @param {string} jobType - Job type
 * @returns {Function} Processor function
 */
const getProcessorForJobType = (jobType) => {
  switch (jobType) {
    case JOB_TYPES.VIDEO_GENERATION:
      return processVideoGeneration;
    case JOB_TYPES.SCRIPT_GENERATION:
      return processScriptGeneration;
    case JOB_TYPES.SCENE_CREATION:
      return processSceneCreation;
    case JOB_TYPES.AUDIO_SYNTHESIS:
      return processAudioSynthesis;
    case JOB_TYPES.IMAGE_GENERATION:
      return processImageGeneration;
    case JOB_TYPES.WORLD_BUILDING:
      return processWorldBuilding;
    case JOB_TYPES.CONTENT_ANALYSIS:
      return processContentAnalysis;
    case JOB_TYPES.VIDEO_COMPOSITION:
      return processVideoComposition;
    case JOB_TYPES.PERSONALIZATION:
      return processPersonalization;
    case JOB_TYPES.AI_PROCESSING:
      return processAIProcessing;
    default:
      throw new Error(`No processor found for job type: ${jobType}`);
  }
};

/**
 * Set up event listeners for worker
 * @param {Object} worker - Worker instance
 * @param {string} jobType - Job type
 * @param {string} priority - Priority level
 */
const setupWorkerEventListeners = (worker, jobType, priority) => {
  // Worker started
  worker.on('started', (job) => {
    logger.debug(`Worker started for job ${job.id}`, {
      jobId: job.id,
      jobType,
      priority
    });
  });
  
  // Worker completed
  worker.on('completed', (job) => {
    logger.debug(`Worker completed job ${job.id}`, {
      jobId: job.id,
      jobType,
      priority,
      duration: Date.now() - job.timestamp
    });
  });
  
  // Worker failed
  worker.on('failed', (job, err) => {
    logger.error(`Worker failed job ${job.id}`, {
      jobId: job.id,
      jobType,
      priority,
      error: err.message,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts
    });
  });
  
  // Worker stalled
  worker.on('stalled', (job) => {
    logger.warn(`Worker stalled job ${job.id}`, {
      jobId: job.id,
      jobType,
      priority,
      attempts: job.attemptsMade
    });
  });
  
  // Worker error
  worker.on('error', (err) => {
    logger.error(`Worker error in ${jobType}:${priority}`, {
      jobType,
      priority,
      error: err.message,
      stack: err.stack
    });
  });
};

/**
 * Process AI processing job (generic AI task)
 * @param {Object} job - Bull job instance
 * @returns {Promise<Object>} Processing result
 */
const processAIProcessing = async (job) => {
  const { data } = job;
  const { userId, task, provider, model, input, options } = data;
  
  try {
    logger.info(`Processing AI processing job`, {
      jobId: job.id,
      userId,
      task,
      provider,
      model
    });
    
    // Update progress
    await job.progress(10);
    
    // Route to appropriate AI provider
    let result;
    switch (provider) {
      case 'openai':
        result = await processOpenAITask(task, model, input, options);
        break;
      case 'stability':
        result = await processStabilityTask(task, model, input, options);
        break;
      case 'elevenlabs':
        result = await processElevenLabsTask(task, model, input, options);
        break;
      case 'replicate':
        result = await processReplicateTask(task, model, input, options);
        break;
      default:
        throw new Error(`Unknown AI provider: ${provider}`);
    }
    
    // Update progress
    await job.progress(100);
    
    logger.info(`AI processing job completed`, {
      jobId: job.id,
      userId,
      task,
      provider
    });
    
    return result;
  } catch (error) {
    logger.error(`AI processing job failed`, {
      jobId: job.id,
      userId,
      task,
      provider,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Process OpenAI task
 * @param {string} task - Task type
 * @param {string} model - Model name
 * @param {Object} input - Input data
 * @param {Object} options - Task options
 * @returns {Promise<Object>} Task result
 */
const processOpenAITask = async (task, model, input, options) => {
  const aiProviders = require('./aiProviders');
  
  switch (task) {
    case 'text-generation':
      return await aiProviders.openaiGenerateText({
        model,
        messages: input.messages,
        maxTokens: options.maxTokens,
        temperature: options.temperature
      });
    case 'image-generation':
      return await aiProviders.openaiGenerateImage({
        prompt: input.prompt,
        n: options.n || 1,
        size: options.size || '1024x1024',
        quality: options.quality || 'standard',
        style: options.style || 'natural'
      });
    case 'image-analysis':
      return await aiProviders.openaiAnalyzeImage({
        imageUrl: input.imageUrl,
        prompt: input.prompt,
        maxTokens: options.maxTokens,
        temperature: options.temperature
      });
    default:
      throw new Error(`Unknown OpenAI task: ${task}`);
  }
};

/**
 * Process Stability AI task
 * @param {string} task - Task type
 * @param {string} model - Model name
 * @param {Object} input - Input data
 * @param {Object} options - Task options
 * @returns {Promise<Object>} Task result
 */
const processStabilityTask = async (task, model, input, options) => {
  const aiProviders = require('./aiProviders');
  
  switch (task) {
    case 'image-generation':
      return await aiProviders.stabilityGenerateImage({
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        width: options.width || 1024,
        height: options.height || 1024,
        samples: options.samples || 1,
        steps: options.steps || 30,
        cfgScale: options.cfgScale || 7.5,
        stylePreset: options.stylePreset
      });
    default:
      throw new Error(`Unknown Stability AI task: ${task}`);
  }
};

/**
 * Process ElevenLabs task
 * @param {string} task - Task type
 * @param {string} model - Model name
 * @param {Object} input - Input data
 * @param {Object} options - Task options
 * @returns {Promise<Object>} Task result
 */
const processElevenLabsTask = async (task, model, input, options) => {
  const aiProviders = require('./aiProviders');
  
  switch (task) {
    case 'speech-generation':
      return await aiProviders.elevenlabsGenerateSpeech({
        text: input.text,
        voiceId: options.voiceId || 'rachel',
        modelId: model || 'eleven_monolingual_v1',
        voiceSettings: options.voiceSettings
      });
    default:
      throw new Error(`Unknown ElevenLabs task: ${task}`);
  }
};

/**
 * Process Replicate task
 * @param {string} task - Task type
 * @param {string} model - Model name
 * @param {Object} input - Input data
 * @param {Object} options - Task options
 * @returns {Promise<Object>} Task result
 */
const processReplicateTask = async (task, model, input, options) => {
  const aiProviders = require('./aiProviders');
  
  switch (task) {
    case 'video-generation':
      return await aiProviders.replicateGenerateVideo({
        version: model,
        input: input,
        duration: options.duration
      });
    default:
      throw new Error(`Unknown Replicate task: ${task}`);
  }
};

/**
 * Get worker statistics
 * @returns {Object} Worker statistics
 */
const getWorkerStats = () => {
  const stats = {
    totalWorkers: Object.keys(workers).length,
    workers: {}
  };
  
  for (const [key, worker] of Object.entries(workers)) {
    const [jobType, priority] = key.split(':');
    
    if (!stats.workers[jobType]) {
      stats.workers[jobType] = {};
    }
    
    stats.workers[jobType][priority] = {
      concurrency: WORKER_CONFIG.concurrency[jobType] || 1,
      status: worker.isRunning() ? 'running' : 'stopped'
    };
  }
  
  return stats;
};

/**
 * Restart worker for specific job type and priority
 * @param {string} jobType - Job type
 * @param {string} priority - Priority level
 * @returns {Promise<void>}
 */
const restartWorker = async (jobType, priority) => {
  try {
    const workerKey = `${jobType}:${priority}`;
    const worker = workers[workerKey];
    
    if (worker) {
      // Close existing worker
      await worker.close();
      delete workers[workerKey];
      
      logger.info(`Worker closed for ${jobType}:${priority}`);
    }
    
    // Set up new worker
    await setupWorker(jobType, priority);
    
    logger.info(`Worker restarted for ${jobType}:${priority}`);
  } catch (error) {
    logger.error(`Failed to restart worker for ${jobType}:${priority}:`, error);
    throw error;
  }
};

/**
 * Stop all workers
 * @returns {Promise<void>}
 */
const stopWorkers = async () => {
  try {
    logger.info('Stopping all job workers');
    
    const stopPromises = Object.values(workers).map(worker => worker.close());
    await Promise.all(stopPromises);
    
    // Clear workers registry
    Object.keys(workers).forEach(key => delete workers[key]);
    
    logger.info('All job workers stopped');
  } catch (error) {
    logger.error('Failed to stop job workers:', error);
    throw error;
  }
};

/**
 * Graceful shutdown of workers
 * @returns {Promise<void>}
 */
const gracefulShutdown = async () => {
  try {
    logger.info('Initiating graceful shutdown of job workers');
    
    // Shutdown worker pool first
    await workerPool.shutdown();
    
    // Wait for active jobs to complete or timeout
    const shutdownTimeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    // Check if any workers have active jobs
    let hasActiveJobs = false;
    for (const [key, worker] of Object.entries(workers)) {
      if (worker && worker.isRunning()) {
        hasActiveJobs = true;
        break;
      }
    }
    
    if (hasActiveJobs) {
      logger.info('Waiting for active jobs to complete...');
      
      while (Date.now() - startTime < shutdownTimeout) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if all workers are done
        let allDone = true;
        for (const [key, worker] of Object.entries(workers)) {
          if (worker && worker.isRunning()) {
            allDone = false;
            break;
          }
        }
        
        if (allDone) {
          break;
        }
      }
    }
    
    // Force stop if timeout reached
    await stopWorkers();
    
    logger.info('Graceful shutdown of job workers completed');
  } catch (error) {
    logger.error('Graceful shutdown of job workers failed:', error);
    throw error;
  }
};

module.exports = {
  initializeJobWorkers,
  getWorkerStats,
  restartWorker,
  stopWorkers,
  gracefulShutdown
};
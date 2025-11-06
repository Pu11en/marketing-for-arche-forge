const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { connectDatabase } = require('./database/connection');
const { connectRedis } = require('./services/redis');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

// Import AI services
const videoGenerationService = require('./services/videoGeneration');
const worldBuildingService = require('./services/worldBuilding');
const personalizationService = require('./services/personalization');
const contentAnalysisService = require('./services/contentAnalysis');

// Import routes
const aiRoutes = require('./routes/ai');
const videoRoutes = require('./routes/video');
const worldRoutes = require('./routes/world');
const analysisRoutes = require('./routes/analysis');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(helmet());
app.use(compression());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    service: 'AI Engine',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// API routes
app.use('/api/ai', aiRoutes);
app.use('/api/video', videoRoutes);
app.use('/api/world', worldRoutes);
app.use('/api/analysis', analysisRoutes);

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize AI services
async function initializeAIServices() {
  try {
    // Initialize OpenAI
    const { Configuration, OpenAIApi } = require('openai');
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });
    global.openai = new OpenAIApi(configuration);

    // Initialize Stability AI
    const { StabilityConfiguration, ImageGeneration } = require('@stability/stable-sdk');
    const stabilityConfig = new StabilityConfiguration({
      apiKey: process.env.STABILITY_API_KEY,
    });
    global.stability = new ImageGeneration(stabilityConfig);

    // Initialize Replicate
    const Replicate = require('replicate');
    global.replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    // Initialize ElevenLabs for voice synthesis
    const { ElevenLabsClient } = require('elevenlabs');
    global.elevenlabs = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY,
    });

    logger.info('AI services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize AI services:', error);
    throw error;
  }
}

// Initialize GPU acceleration if available
function initializeGPU() {
  try {
    const { GPU } = require('gpu.js');
    const gpu = new GPU();
    
    if (gpu.isSupported) {
      global.gpu = gpu;
      logger.info('GPU acceleration enabled');
    } else {
      logger.warn('GPU acceleration not supported, using CPU');
    }
  } catch (error) {
    logger.warn('GPU initialization failed, using CPU:', error.message);
  }
}

// Initialize worker threads for parallel processing
function initializeWorkers() {
  try {
    const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
    
    if (isMainThread) {
      // Create worker pool
      const workerPool = [];
      const numWorkers = require('os').cpus().length;
      
      for (let i = 0; i < numWorkers; i++) {
        const worker = new Worker(__filename, {
          workerData: { workerId: i }
        });
        workerPool.push(worker);
      }
      
      global.workerPool = workerPool;
      logger.info(`Initialized ${numWorkers} worker threads`);
    } else {
      // Worker thread logic
      const { workerId } = workerData;
      logger.info(`Worker ${workerId} started`);
      
      // Handle worker tasks
      parentPort.on('message', async (task) => {
        try {
          let result;
          
          switch (task.type) {
            case 'generate_video':
              result = await videoGenerationService.generateVideo(task.data);
              break;
            case 'build_world':
              result = await worldBuildingService.buildWorld(task.data);
              break;
            case 'analyze_content':
              result = await contentAnalysisService.analyzeContent(task.data);
              break;
            default:
              throw new Error(`Unknown task type: ${task.type}`);
          }
          
          parentPort.postMessage({ success: true, result, taskId: task.taskId });
        } catch (error) {
          parentPort.postMessage({ success: false, error: error.message, taskId: task.taskId });
        }
      });
    }
  } catch (error) {
    logger.warn('Worker threads initialization failed:', error.message);
  }
}

// Start server
async function startServer() {
  try {
    // Connect to database
    await connectDatabase();
    logger.info('Database connected successfully');

    // Connect to Redis
    await connectRedis();
    logger.info('Redis connected successfully');

    // Initialize AI services
    await initializeAIServices();

    // Initialize GPU acceleration
    initializeGPU();

    // Initialize worker threads
    initializeWorkers();

    // Start HTTP server
    app.listen(PORT, () => {
      logger.info(`AI Engine server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start AI Engine server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  // Close worker threads
  if (global.workerPool) {
    global.workerPool.forEach(worker => worker.terminate());
  }
  
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  // Close worker threads
  if (global.workerPool) {
    global.workerPool.forEach(worker => worker.terminate());
  }
  
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the server
if (require('worker_threads').isMainThread) {
  startServer();
}

module.exports = app;
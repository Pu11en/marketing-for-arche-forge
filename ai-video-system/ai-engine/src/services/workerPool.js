const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');
const logger = require('../utils/logger');
const { cache, pubsub } = require('./redis');

// Worker type definitions with resource requirements
const WORKER_TYPES = {
  video_generation: {
    name: 'Video Generation',
    resourceWeight: 'heavy',
    maxConcurrent: 1,
    memoryLimit: 4096, // MB
    cpuThreshold: 80,
    gpuRequired: true,
    timeout: 600000, // 10 minutes
    priority: 1
  },
  audio_synthesis: {
    name: 'Audio Synthesis',
    resourceWeight: 'medium',
    maxConcurrent: 3,
    memoryLimit: 2048, // MB
    cpuThreshold: 70,
    gpuRequired: false,
    timeout: 180000, // 3 minutes
    priority: 2
  },
  image_generation: {
    name: 'Image Generation',
    resourceWeight: 'medium',
    maxConcurrent: 2,
    memoryLimit: 3072, // MB
    cpuThreshold: 75,
    gpuRequired: true,
    timeout: 300000, // 5 minutes
    priority: 2
  },
  text_processing: {
    name: 'Text Processing',
    resourceWeight: 'light',
    maxConcurrent: 10,
    memoryLimit: 512, // MB
    cpuThreshold: 60,
    gpuRequired: false,
    timeout: 60000, // 1 minute
    priority: 4
  },
  world_building: {
    name: 'World Building',
    resourceWeight: 'heavy',
    maxConcurrent: 1,
    memoryLimit: 4096, // MB
    cpuThreshold: 85,
    gpuRequired: true,
    timeout: 480000, // 8 minutes
    priority: 1
  },
  content_analysis: {
    name: 'Content Analysis',
    resourceWeight: 'light',
    maxConcurrent: 8,
    memoryLimit: 1024, // MB
    cpuThreshold: 65,
    gpuRequired: false,
    timeout: 120000, // 2 minutes
    priority: 3
  }
};

// Worker pool configuration
const POOL_CONFIG = {
  maxWorkers: process.env.MAX_WORKERS || os.cpus().length,
  minWorkers: process.env.MIN_WORKERS || 2,
  workerTimeout: process.env.WORKER_TIMEOUT || 300000, // 5 minutes
  maxRetries: 3,
  retryDelay: 1000,
  healthCheckInterval: 30000, // 30 seconds
  scalingInterval: 60000, // 1 minute
  resourceMonitorInterval: 10000, // 10 seconds
  gracefulShutdownTimeout: 30000 // 30 seconds
};

// Worker pool state
class WorkerPool extends EventEmitter {
  constructor() {
    super();
    this.workers = new Map(); // workerId -> worker info
    this.workerTypes = new Map(); // type -> Set of workerIds
    this.availableWorkers = new Map(); // type -> queue of available workers
    this.busyWorkers = new Map(); // workerId -> job info
    this.taskQueue = new Map(); // type -> queue of tasks
    this.workerStats = {
      total: 0,
      available: 0,
      busy: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      avgTaskTime: 0,
      byType: {}
    };
    this.resourceUsage = new Map(); // workerId -> resource info
    this.isShuttingDown = false;
    this.monitoringIntervals = new Set();
  }

  /**
   * Initialize worker pool
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      if (!isMainThread) {
        // Worker thread logic
        setupWorkerThread();
        return;
      }

      logger.info('Initializing enhanced worker pool');
      
      // Create initial workers for each type
      for (const [type, config] of Object.entries(WORKER_TYPES)) {
        this.workerTypes.set(type, new Set());
        this.availableWorkers.set(type, []);
        this.taskQueue.set(type, []);
        this.workerStats.byType[type] = {
          total: 0,
          available: 0,
          busy: 0,
          tasksCompleted: 0,
          tasksFailed: 0,
          avgTaskTime: 0
        };

        // Create minimum workers for each type
        const minWorkers = Math.min(POOL_CONFIG.minWorkers, config.maxConcurrent);
        for (let i = 0; i < minWorkers; i++) {
          await this.createWorker(type);
        }
      }
      
      // Start monitoring systems
      this.startHealthMonitoring();
      this.startResourceMonitoring();
      this.startAutoScaling();
      
      // Subscribe to Redis events for coordination
      await this.setupRedisCoordination();
      
      logger.info('Enhanced worker pool initialized successfully', {
        totalWorkers: this.workers.size,
        workerTypes: Array.from(this.workerTypes.keys())
      });
      
      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize worker pool:', error);
      throw error;
    }
  }

  /**
   * Create a new worker of specific type
   * @param {string} type - Worker type
   * @returns {Promise<Worker>} Worker instance
   */
  async createWorker(type) {
    return new Promise((resolve, reject) => {
      const workerId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const config = WORKER_TYPES[type];
      
      if (!config) {
        reject(new Error(`Unknown worker type: ${type}`));
        return;
      }

      const worker = new Worker(__filename, {
        workerData: { workerId, type, config }
      });
      
      // Set up worker event handlers
      worker.on('online', () => {
        logger.debug(`Worker ${workerId} (${type}) is online`);
      });
      
      worker.on('message', (message) => {
        this.handleWorkerMessage(worker, message);
      });
      
      worker.on('error', (error) => {
        logger.error(`Worker ${workerId} (${type}) error:`, error);
        this.handleWorkerError(worker, error);
      });
      
      worker.on('exit', (code) => {
        if (code !== 0) {
          logger.error(`Worker ${workerId} (${type}) stopped with exit code ${code}`);
          this.handleWorkerExit(worker, code);
        } else {
          logger.debug(`Worker ${workerId} (${type}) exited normally`);
        }
      });
      
      // Store worker info
      const workerInfo = {
        worker,
        workerId,
        type,
        config,
        isAvailable: true,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        taskCount: 0,
        totalTaskTime: 0,
        resourceUsage: {
          cpu: 0,
          memory: 0,
          gpu: 0
        }
      };
      
      this.workers.set(workerId, workerInfo);
      this.workerTypes.get(type).add(workerId);
      this.availableWorkers.get(type).push(workerId);
      this.resourceUsage.set(workerId, workerInfo.resourceUsage);
      
      // Update stats
      this.updateWorkerStats();
      
      // Publish worker creation event
      this.publishWorkerEvent('worker_created', {
        workerId,
        type,
        timestamp: Date.now()
      });
      
      resolve(worker);
    });
  }

  /**
   * Execute task using appropriate worker pool
   * @param {string} type - Task type
   * @param {Object} data - Task data
   * @param {Object} options - Task options
   * @returns {Promise<any>} Task result
   */
  async executeTask(type, data, options = {}) {
    if (this.isShuttingDown) {
      throw new Error('Worker pool is shutting down');
    }

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const config = WORKER_TYPES[type];
    
    if (!config) {
      throw new Error(`Unknown task type: ${type}`);
    }
    
    return new Promise((resolve, reject) => {
      const task = {
        type,
        data,
        options,
        taskId,
        timestamp: Date.now(),
        retries: 0,
        priority: options.priority || config.priority,
        timeout: options.timeout || config.timeout
      };
      
      // Store callback
      task.callback = (error, result) => {
        if (error) {
          if (task.retries < POOL_CONFIG.maxRetries) {
            // Retry task
            task.retries++;
            setTimeout(() => {
              this.taskQueue.get(type).unshift(task);
              this.processNextTask(type);
            }, POOL_CONFIG.retryDelay * task.retries);
          } else {
            reject(error);
          }
        } else {
          resolve(result);
        }
      };
      
      // Add to queue
      this.taskQueue.get(type).push(task);
      
      // Try to process immediately
      this.processNextTask(type);
      
      // Set timeout if specified
      if (task.timeout) {
        setTimeout(() => {
          const callback = task.callback;
          if (callback) {
            task.callback = null;
            callback(new Error(`Task ${taskId} timed out after ${task.timeout}ms`), null);
          }
        }, task.timeout);
      }
    });
  }

  /**
   * Process next task in queue for specific type
   * @param {string} type - Worker type
   */
  processNextTask(type) {
    const queue = this.taskQueue.get(type);
    const available = this.availableWorkers.get(type);
    
    if (queue.length === 0 || available.length === 0) {
      return;
    }
    
    const task = queue.shift();
    const workerId = available.shift();
    const workerInfo = this.workers.get(workerId);
    
    if (!workerInfo || !workerInfo.isAvailable) {
      // Put task back in queue
      queue.unshift(task);
      return;
    }
    
    // Mark worker as busy
    workerInfo.isAvailable = false;
    this.busyWorkers.set(workerId, task);
    
    // Update stats
    this.workerStats.busy++;
    this.workerStats.available--;
    this.workerStats.byType[type].busy++;
    this.workerStats.byType[type].available--;
    
    // Send task to worker
    workerInfo.worker.postMessage({
      taskId: task.taskId,
      task: {
        type: task.type,
        data: task.data,
        options: task.options
      }
    });
    
    // Publish task assignment event
    this.publishWorkerEvent('task_assigned', {
      workerId,
      taskId: task.taskId,
      type,
      timestamp: Date.now()
    });
  }

  /**
   * Handle worker message
   * @param {Worker} worker - Worker instance
   * @param {Object} message - Worker message
   */
  handleWorkerMessage(worker, message) {
    const workerInfo = this.getWorkerInfoByWorker(worker);
    if (!workerInfo) return;
    
    const { workerId, type } = workerInfo;
    
    switch (message.type) {
      case 'worker_ready':
        logger.debug(`Worker ${workerId} (${type}) is ready`);
        break;
        
      case 'task_completed':
        this.handleTaskCompleted(workerInfo, message);
        break;
        
      case 'task_failed':
        this.handleTaskFailed(workerInfo, message);
        break;
        
      case 'resource_update':
        this.handleResourceUpdate(workerInfo, message);
        break;
        
      case 'health_check':
        this.handleHealthCheck(workerInfo, message);
        break;
        
      default:
        logger.warn(`Unknown message type from worker ${workerId}: ${message.type}`);
    }
  }

  /**
   * Handle task completion
   * @param {Object} workerInfo - Worker information
   * @param {Object} message - Task completion message
   */
  handleTaskCompleted(workerInfo, message) {
    const { workerId, type } = workerInfo;
    const { taskId, result, duration } = message;
    const task = this.busyWorkers.get(workerId);
    
    if (!task) {
      logger.warn(`Received completion for unknown task ${taskId} from worker ${workerId}`);
      return;
    }
    
    // Mark worker as available
    workerInfo.isAvailable = true;
    workerInfo.lastUsed = Date.now();
    workerInfo.taskCount++;
    workerInfo.totalTaskTime += duration;
    
    // Update busy workers map
    this.busyWorkers.delete(workerId);
    this.availableWorkers.get(type).push(workerId);
    
    // Update stats
    this.workerStats.tasksCompleted++;
    this.workerStats.busy--;
    this.workerStats.available++;
    this.workerStats.byType[type].tasksCompleted++;
    this.workerStats.byType[type].busy--;
    this.workerStats.byType[type].available++;
    
    // Calculate average task time
    const totalTasks = this.workerStats.tasksCompleted + this.workerStats.tasksFailed;
    this.workerStats.avgTaskTime = this.workerStats.tasksCompleted / totalTasks;
    this.workerStats.byType[type].avgTaskTime = 
      this.workerStats.byType[type].tasksCompleted / 
      (this.workerStats.byType[type].tasksCompleted + this.workerStats.byType[type].tasksFailed);
    
    // Call task callback
    if (task.callback) {
      task.callback(null, result);
    }
    
    // Process next task in queue
    this.processNextTask(type);
    
    // Publish completion event
    this.publishWorkerEvent('task_completed', {
      workerId,
      taskId,
      type,
      duration,
      timestamp: Date.now()
    });
    
    logger.debug(`Task ${taskId} completed by worker ${workerId} (${type}) in ${duration}ms`);
  }

  /**
   * Handle task failure
   * @param {Object} workerInfo - Worker information
   * @param {Object} message - Task failure message
   */
  handleTaskFailed(workerInfo, message) {
    const { workerId, type } = workerInfo;
    const { taskId, error } = message;
    const task = this.busyWorkers.get(workerId);
    
    if (!task) {
      logger.warn(`Received failure for unknown task ${taskId} from worker ${workerId}`);
      return;
    }
    
    // Mark worker as available
    workerInfo.isAvailable = true;
    workerInfo.lastUsed = Date.now();
    
    // Update busy workers map
    this.busyWorkers.delete(workerId);
    this.availableWorkers.get(type).push(workerId);
    
    // Update stats
    this.workerStats.tasksFailed++;
    this.workerStats.busy--;
    this.workerStats.available++;
    this.workerStats.byType[type].tasksFailed++;
    this.workerStats.byType[type].busy--;
    this.workerStats.byType[type].available++;
    
    // Call task callback with error
    if (task.callback) {
      task.callback(new Error(error.message), null);
    }
    
    // Process next task in queue
    this.processNextTask(type);
    
    // Publish failure event
    this.publishWorkerEvent('task_failed', {
      workerId,
      taskId,
      type,
      error: error.message,
      timestamp: Date.now()
    });
    
    logger.error(`Task ${taskId} failed by worker ${workerId} (${type}):`, error);
  }

  /**
   * Handle worker error
   * @param {Worker} worker - Worker instance
   * @param {Error} error - Error object
   */
  handleWorkerError(worker, error) {
    const workerInfo = this.getWorkerInfoByWorker(worker);
    if (!workerInfo) return;
    
    const { workerId, type } = workerInfo;
    
    logger.error(`Worker ${workerId} (${type}) encountered error:`, error);
    
    // Mark worker as unavailable
    workerInfo.isAvailable = false;
    
    // Remove from available workers
    const available = this.availableWorkers.get(type);
    const index = available.indexOf(workerId);
    if (index > -1) {
      available.splice(index, 1);
    }
    
    // Fail any running tasks
    const task = this.busyWorkers.get(workerId);
    if (task && task.callback) {
      task.callback(new Error(`Worker error: ${error.message}`), null);
      this.busyWorkers.delete(workerId);
    }
    
    // Update stats
    this.workerStats.busy--;
    this.workerStats.byType[type].busy--;
    
    // Publish error event
    this.publishWorkerEvent('worker_error', {
      workerId,
      type,
      error: error.message,
      timestamp: Date.now()
    });
  }

  /**
   * Handle worker exit
   * @param {Worker} worker - Worker instance
   * @param {number} exitCode - Exit code
   */
  handleWorkerExit(worker, exitCode) {
    const workerInfo = this.getWorkerInfoByWorker(worker);
    if (!workerInfo) return;
    
    const { workerId, type } = workerInfo;
    
    logger.warn(`Worker ${workerId} (${type}) exited with code ${exitCode}`);
    
    // Remove from pool
    this.workers.delete(workerId);
    this.workerTypes.get(type).delete(workerId);
    this.resourceUsage.delete(workerId);
    
    // Remove from available workers
    const available = this.availableWorkers.get(type);
    const availableIndex = available.indexOf(workerId);
    if (availableIndex > -1) {
      available.splice(availableIndex, 1);
    }
    
    // Fail any running tasks
    const task = this.busyWorkers.get(workerId);
    if (task && task.callback) {
      task.callback(new Error(`Worker exited with code ${exitCode}`), null);
      this.busyWorkers.delete(workerId);
    }
    
    // Update stats
    this.workerStats.total--;
    this.workerStats.busy--;
    this.workerStats.byType[type].total--;
    this.workerStats.byType[type].busy--;
    
    // Create replacement worker if needed and not shutting down
    if (!this.isShuttingDown && this.workers.size < POOL_CONFIG.minWorkers) {
      setTimeout(() => {
        this.createWorker(type);
      }, 1000);
    }
    
    // Publish exit event
    this.publishWorkerEvent('worker_exited', {
      workerId,
      type,
      exitCode,
      timestamp: Date.now()
    });
  }

  /**
   * Handle resource update from worker
   * @param {Object} workerInfo - Worker information
   * @param {Object} message - Resource update message
   */
  handleResourceUpdate(workerInfo, message) {
    const { workerId, type } = workerInfo;
    const { cpu, memory, gpu } = message.resources;
    
    // Update resource usage
    workerInfo.resourceUsage = { cpu, memory, gpu };
    this.resourceUsage.set(workerId, { cpu, memory, gpu });
    
    // Check resource thresholds
    const config = WORKER_TYPES[type];
    if (cpu > config.cpuThreshold || memory > config.memoryLimit) {
      logger.warn(`Worker ${workerId} (${type}) exceeding resource thresholds`, {
        cpu: `${cpu}%`,
        memory: `${memory}MB`,
        cpuThreshold: `${config.cpuThreshold}%`,
        memoryLimit: `${config.memoryLimit}MB`
      });
      
      // Consider scaling or restarting worker
      this.evaluateWorkerHealth(workerInfo);
    }
  }

  /**
   * Handle health check from worker
   * @param {Object} workerInfo - Worker information
   * @param {Object} message - Health check message
   */
  handleHealthCheck(workerInfo, message) {
    const { workerId, type } = workerInfo;
    const { status, timestamp } = message;
    
    // Update worker health status
    workerInfo.lastHealthCheck = timestamp;
    workerInfo.healthStatus = status;
    
    // Publish health status
    this.publishWorkerEvent('worker_health', {
      workerId,
      type,
      status,
      timestamp
    });
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    const interval = setInterval(() => {
      if (this.isShuttingDown) return;
      
      const now = Date.now();
      
      // Check for stuck workers
      for (const [workerId, task] of this.busyWorkers.entries()) {
        const workerInfo = this.workers.get(workerId);
        if (!workerInfo) continue;
        
        const config = WORKER_TYPES[workerInfo.type];
        if (now - task.timestamp > config.timeout) {
          logger.warn(`Worker ${workerId} (${workerInfo.type}) appears to be stuck, terminating`);
          workerInfo.worker.terminate();
          this.handleWorkerError(workerInfo.worker, new Error('Worker timeout'));
        }
      }
      
      // Check for unresponsive workers
      for (const [workerId, workerInfo] of this.workers.entries()) {
        if (workerInfo.lastHealthCheck && 
            now - workerInfo.lastHealthCheck > POOL_CONFIG.healthCheckInterval * 2) {
          logger.warn(`Worker ${workerId} (${workerInfo.type}) is unresponsive, restarting`);
          workerInfo.worker.terminate();
        }
      }
    }, POOL_CONFIG.healthCheckInterval);
    
    this.monitoringIntervals.add(interval);
  }

  /**
   * Start resource monitoring
   */
  startResourceMonitoring() {
    const interval = setInterval(() => {
      if (this.isShuttingDown) return;
      
      // Request resource updates from all workers
      for (const [workerId, workerInfo] of this.workers.entries()) {
        if (workerInfo.isAvailable) {
          workerInfo.worker.postMessage({
            type: 'resource_request'
          });
        }
      }
      
      // Monitor system resources
      const systemUsage = process.cpuUsage();
      const memoryUsage = process.memoryUsage();
      
      // Publish system resource status
      this.publishWorkerEvent('system_resources', {
        cpu: systemUsage,
        memory: memoryUsage,
        timestamp: Date.now()
      });
    }, POOL_CONFIG.resourceMonitorInterval);
    
    this.monitoringIntervals.add(interval);
  }

  /**
   * Start auto-scaling
   */
  startAutoScaling() {
    const interval = setInterval(() => {
      if (this.isShuttingDown) return;
      
      this.evaluateScaling();
    }, POOL_CONFIG.scalingInterval);
    
    this.monitoringIntervals.add(interval);
  }

  /**
   * Evaluate scaling needs
   */
  async evaluateScaling() {
    for (const [type, config] of Object.entries(WORKER_TYPES)) {
      const queue = this.taskQueue.get(type);
      const available = this.availableWorkers.get(type);
      const workerTypeSet = this.workerTypes.get(type);
      
      const queueLength = queue.length;
      const availableWorkers = available.length;
      const totalWorkers = workerTypeSet.size;
      
      // Scale up if queue is getting long and we have capacity
      if (queueLength > availableWorkers && totalWorkers < config.maxConcurrent) {
        const workersToAdd = Math.min(
          queueLength - availableWorkers,
          config.maxConcurrent - totalWorkers,
          2 // Max 2 workers at a time
        );
        
        for (let i = 0; i < workersToAdd; i++) {
          await this.createWorker(type);
        }
        
        logger.info(`Scaled up ${type} workers: added ${workersToAdd} workers`);
        
        this.publishWorkerEvent('scale_up', {
          type,
          workersAdded: workersToAdd,
          totalWorkers: totalWorkers + workersToAdd,
          queueLength,
          timestamp: Date.now()
        });
      }
      
      // Scale down if workers are idle and we have excess
      if (queueLength === 0 && availableWorkers > POOL_CONFIG.minWorkers) {
        const workersToRemove = Math.min(
          availableWorkers - POOL_CONFIG.minWorkers,
          2 // Max 2 workers at a time
        );
        
        for (let i = 0; i < workersToRemove; i++) {
          const workerId = available.pop();
          if (workerId) {
            const workerInfo = this.workers.get(workerId);
            if (workerInfo) {
              workerInfo.worker.terminate();
              logger.info(`Scaled down ${type} workers: removed worker ${workerId}`);
            }
          }
        }
        
        this.publishWorkerEvent('scale_down', {
          type,
          workersRemoved: workersToRemove,
          totalWorkers: totalWorkers - workersToRemove,
          queueLength,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * Evaluate worker health
   * @param {Object} workerInfo - Worker information
   */
  evaluateWorkerHealth(workerInfo) {
    const { workerId, type } = workerInfo;
    const config = WORKER_TYPES[type];
    const resources = workerInfo.resourceUsage;
    
    let healthScore = 100;
    
    // CPU usage impact
    if (resources.cpu > config.cpuThreshold) {
      healthScore -= (resources.cpu - config.cpuThreshold) * 2;
    }
    
    // Memory usage impact
    if (resources.memory > config.memoryLimit) {
      healthScore -= (resources.memory - config.memoryLimit) / 10;
    }
    
    // Task failure rate impact
    const typeStats = this.workerStats.byType[type];
    const totalTasks = typeStats.tasksCompleted + typeStats.tasksFailed;
    if (totalTasks > 0) {
      const failureRate = typeStats.tasksFailed / totalTasks;
      healthScore -= failureRate * 50;
    }
    
    workerInfo.healthScore = Math.max(0, healthScore);
    
    // Restart worker if health is too low
    if (workerInfo.healthScore < 30) {
      logger.warn(`Worker ${workerId} (${type}) health score too low (${workerInfo.healthScore}), restarting`);
      workerInfo.worker.terminate();
    }
  }

  /**
   * Setup Redis coordination
   */
  async setupRedisCoordination() {
    try {
      // Subscribe to worker pool events
      await pubsub.subscribe('worker_pool_events', (message) => {
        this.handleRedisEvent(message);
      });
      
      // Publish pool status periodically
      setInterval(() => {
        if (!this.isShuttingDown) {
          this.publishWorkerEvent('pool_status', this.getPoolStatus());
        }
      }, 30000); // Every 30 seconds
      
      logger.info('Redis coordination setup completed');
    } catch (error) {
      logger.error('Failed to setup Redis coordination:', error);
    }
  }

  /**
   * Handle Redis events
   * @param {Object} message - Redis event message
   */
  handleRedisEvent(message) {
    // Handle coordination events from other instances
    switch (message.event) {
      case 'worker_request':
        // Handle worker request from other instance
        break;
      case 'load_balance':
        // Handle load balancing request
        break;
      default:
        logger.debug(`Unknown Redis event: ${message.event}`);
    }
  }

  /**
   * Publish worker event to Redis
   * @param {string} event - Event type
   * @param {Object} data - Event data
   */
  async publishWorkerEvent(event, data) {
    try {
      await pubsub.publish('worker_pool_events', {
        event,
        data,
        instanceId: process.env.INSTANCE_ID || 'default',
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Failed to publish worker event:', error);
    }
  }

  /**
   * Get worker information by worker instance
   * @param {Worker} worker - Worker instance
   * @returns {Object|null} Worker information
   */
  getWorkerInfoByWorker(worker) {
    for (const [workerId, workerInfo] of this.workers.entries()) {
      if (workerInfo.worker === worker) {
        return workerInfo;
      }
    }
    return null;
  }

  /**
   * Update worker statistics
   */
  updateWorkerStats() {
    this.workerStats.total = this.workers.size;
    this.workerStats.available = Array.from(this.availableWorkers.values())
      .reduce((sum, workers) => sum + workers.length, 0);
    this.workerStats.busy = this.busyWorkers.size;
    
    // Update type-specific stats
    for (const [type, workerIds] of this.workerTypes.entries()) {
      const available = this.availableWorkers.get(type).length;
      const busy = Array.from(this.busyWorkers.keys())
        .filter(workerId => workerIds.has(workerId)).length;
      
      this.workerStats.byType[type].total = workerIds.size;
      this.workerStats.byType[type].available = available;
      this.workerStats.byType[type].busy = busy;
    }
  }

  /**
   * Get pool status
   * @returns {Object} Pool status
   */
  getPoolStatus() {
    return {
      stats: { ...this.workerStats },
      queues: Object.fromEntries(
        Array.from(this.taskQueue.entries()).map(([type, queue]) => [
          type,
          {
            length: queue.length,
            tasks: queue.map(task => ({
              id: task.taskId,
              priority: task.priority,
              timestamp: task.timestamp
            }))
          }
        ])
      ),
      resources: Object.fromEntries(this.resourceUsage),
      config: POOL_CONFIG,
      timestamp: Date.now()
    };
  }

  /**
   * Get worker statistics
   * @returns {Object} Worker statistics
   */
  getWorkerStats() {
    return {
      ...this.workerStats,
      queueLengths: Object.fromEntries(
        Array.from(this.taskQueue.entries()).map(([type, queue]) => [type, queue.length])
      ),
      config: POOL_CONFIG,
      workerTypes: Object.fromEntries(
        Array.from(this.workerTypes.entries()).map(([type, workerIds]) => [
          type,
          {
            total: workerIds.size,
            available: this.availableWorkers.get(type).length,
            busy: Array.from(this.busyWorkers.keys())
              .filter(workerId => workerIds.has(workerId)).length
          }
        ])
      )
    };
  }

  /**
   * Graceful shutdown of worker pool
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    logger.info('Shutting down worker pool');
    
    // Clear monitoring intervals
    for (const interval of this.monitoringIntervals) {
      clearInterval(interval);
    }
    this.monitoringIntervals.clear();
    
    // Wait for current tasks to complete or timeout
    const shutdownTimeout = POOL_CONFIG.gracefulShutdownTimeout;
    const startTime = Date.now();
    
    while (this.busyWorkers.size > 0 && Date.now() - startTime < shutdownTimeout) {
      logger.info(`Waiting for ${this.busyWorkers.size} tasks to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Terminate all workers
    const terminatePromises = Array.from(this.workers.values()).map(workerInfo => {
      return new Promise(resolve => {
        workerInfo.worker.terminate(resolve);
      });
    });
    
    await Promise.all(terminatePromises);
    
    // Clear pools
    this.workers.clear();
    this.workerTypes.clear();
    this.availableWorkers.clear();
    this.busyWorkers.clear();
    this.taskQueue.clear();
    this.resourceUsage.clear();
    
    logger.info('Worker pool shutdown complete');
    this.emit('shutdown');
  }
}

// Worker thread setup
function setupWorkerThread() {
  const { workerId, type, config } = workerData;
  
  logger.info(`Worker thread ${workerId} (${type}) started`);
  
  // Resource monitoring
  let resourceMonitor = null;
  
  // Health monitoring
  let healthMonitor = null;
  
  // Send ready signal
  parentPort.postMessage({
    type: 'worker_ready',
    workerId,
    timestamp: Date.now()
  });
  
  // Handle messages from main thread
  parentPort.on('message', async (message) => {
    try {
      switch (message.type) {
        case 'resource_request':
          // Send resource usage
          parentPort.postMessage({
            type: 'resource_update',
            workerId,
            resources: {
              cpu: Math.random() * 100, // Simulated CPU usage
              memory: Math.random() * config.memoryLimit, // Simulated memory usage
              gpu: config.gpuRequired ? Math.random() * 100 : 0 // Simulated GPU usage
            },
            timestamp: Date.now()
          });
          break;
          
        default:
          // Process task
          const result = await processTask(message.task, type);
          
          parentPort.postMessage({
            type: 'task_completed',
            workerId,
            taskId: message.taskId,
            result,
            timestamp: Date.now()
          });
      }
    } catch (error) {
      parentPort.postMessage({
        type: 'task_failed',
        workerId,
        taskId: message.taskId,
        error: {
          message: error.message,
          stack: error.stack
        },
        timestamp: Date.now()
      });
    }
  });
  
  // Start resource monitoring
  resourceMonitor = setInterval(() => {
    parentPort.postMessage({
      type: 'resource_update',
      workerId,
      resources: {
        cpu: Math.random() * 100, // Simulated CPU usage
        memory: Math.random() * config.memoryLimit, // Simulated memory usage
        gpu: config.gpuRequired ? Math.random() * 100 : 0 // Simulated GPU usage
      },
      timestamp: Date.now()
    });
  }, 5000); // Every 5 seconds
  
  // Start health monitoring
  healthMonitor = setInterval(() => {
    parentPort.postMessage({
      type: 'health_check',
      workerId,
      status: 'healthy',
      timestamp: Date.now()
    });
  }, 15000); // Every 15 seconds
  
  // Cleanup on exit
  process.on('exit', () => {
    if (resourceMonitor) clearInterval(resourceMonitor);
    if (healthMonitor) clearInterval(healthMonitor);
  });
}

// Task processing function
async function processTask(task, workerType) {
  const { type, data, options } = task;
  const startTime = Date.now();
  
  logger.debug(`Processing task ${type} in ${workerType} worker ${workerData.workerId}`);
  
  try {
    let result;
    
    // Route to appropriate processor based on task type
    switch (type) {
      case 'video_generation':
        result = await processVideoGeneration(data, options);
        break;
      case 'world_building':
        result = await processWorldBuilding(data, options);
        break;
      case 'content_analysis':
        result = await processContentAnalysis(data, options);
        break;
      case 'image_generation':
        result = await processImageGeneration(data, options);
        break;
      case 'audio_synthesis':
        result = await processAudioSynthesis(data, options);
        break;
      case 'text_processing':
        result = await processTextProcessing(data, options);
        break;
      case 'video_composition':
        result = await processVideoComposition(data, options);
        break;
      case 'personalization':
        result = await processPersonalization(data, options);
        break;
      default:
        throw new Error(`Unknown task type: ${type}`);
    }
    
    const duration = Date.now() - startTime;
    logger.debug(`Task ${type} completed in ${duration}ms`);
    
    return {
      result,
      duration,
      workerId: workerData.workerId,
      workerType
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Task ${type} failed after ${duration}ms:`, error);
    throw error;
  }
}

// Task processing implementations (placeholders for actual implementations)
const processVideoGeneration = async (data, options) => {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
  return { status: 'completed', data, type: 'video_generation' };
};

const processWorldBuilding = async (data, options) => {
  await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
  return { status: 'completed', data, type: 'world_building' };
};

const processContentAnalysis = async (data, options) => {
  await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
  return { status: 'completed', data, type: 'content_analysis' };
};

const processImageGeneration = async (data, options) => {
  await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));
  return { status: 'completed', data, type: 'image_generation' };
};

const processAudioSynthesis = async (data, options) => {
  await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1500));
  return { status: 'completed', data, type: 'audio_synthesis' };
};

const processTextProcessing = async (data, options) => {
  await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 800));
  return { status: 'completed', data, type: 'text_processing' };
};

const processVideoComposition = async (data, options) => {
  await new Promise(resolve => setTimeout(resolve, 2500 + Math.random() * 2500));
  return { status: 'completed', data, type: 'video_composition' };
};

const processPersonalization = async (data, options) => {
  await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200));
  return { status: 'completed', data, type: 'personalization' };
};

// Create and export singleton instance
const workerPool = new WorkerPool();

// Initialize worker pool if in main thread
if (isMainThread) {
  workerPool.initialize().catch(error => {
    logger.error('Failed to initialize worker pool:', error);
    process.exit(1);
  });
}

module.exports = {
  workerPool,
  WORKER_TYPES,
  POOL_CONFIG,
  initializeWorkerPool: () => workerPool.initialize(),
  executeTask: (type, data, options) => workerPool.executeTask(type, data, options),
  getWorkerStats: () => workerPool.getWorkerStats(),
  getPoolStatus: () => workerPool.getPoolStatus(),
  shutdownWorkerPool: () => workerPool.shutdown()
};
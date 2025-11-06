const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { workerPool, WORKER_TYPES } = require('../services/workerPool');

/**
 * Get worker pool statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = workerPool.getWorkerStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get worker pool stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get worker pool status
 */
router.get('/status', async (req, res) => {
  try {
    const status = workerPool.getPoolStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Failed to get worker pool status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get worker types configuration
 */
router.get('/types', async (req, res) => {
  try {
    res.json({
      success: true,
      data: WORKER_TYPES
    });
  } catch (error) {
    logger.error('Failed to get worker types:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Execute a task directly through worker pool
 */
router.post('/execute', async (req, res) => {
  try {
    const { type, data, options = {} } = req.body;
    
    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Task type is required'
      });
    }
    
    if (!WORKER_TYPES[type]) {
      return res.status(400).json({
        success: false,
        error: `Unknown task type: ${type}`
      });
    }
    
    // Execute task asynchronously
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    workerPool.executeTask(type, data, options)
      .then(result => {
        // Publish completion event
        workerPool.publishWorkerEvent('api_task_completed', {
          taskId,
          type,
          result,
          timestamp: Date.now()
        });
      })
      .catch(error => {
        // Publish error event
        workerPool.publishWorkerEvent('api_task_failed', {
          taskId,
          type,
          error: error.message,
          timestamp: Date.now()
        });
      });
    
    res.json({
      success: true,
      data: {
        taskId,
        type,
        status: 'queued',
        message: 'Task queued for execution'
      }
    });
  } catch (error) {
    logger.error('Failed to execute task:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Scale workers for a specific type
 */
router.post('/scale/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { action, count } = req.body;
    
    if (!WORKER_TYPES[type]) {
      return res.status(400).json({
        success: false,
        error: `Unknown worker type: ${type}`
      });
    }
    
    if (!action || !['up', 'down'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Action must be "up" or "down"'
      });
    }
    
    const status = workerPool.getPoolStatus();
    const currentWorkers = status.workerTypes[type].total;
    const config = WORKER_TYPES[type];
    
    let targetCount = currentWorkers;
    
    if (action === 'up') {
      targetCount = Math.min(
        currentWorkers + (count || 1),
        config.maxConcurrent
      );
    } else {
      targetCount = Math.max(
        currentWorkers - (count || 1),
        1 // Keep at least 1 worker
      );
    }
    
    if (targetCount === currentWorkers) {
      return res.json({
        success: true,
        data: {
          type,
          action: 'no_change',
          currentWorkers,
          targetCount,
          message: 'No scaling needed'
        }
      });
    }
    
    // Perform scaling
    const workersToChange = Math.abs(targetCount - currentWorkers);
    
    if (action === 'up') {
      for (let i = 0; i < workersToChange; i++) {
        await workerPool.createWorker(type);
      }
    } else {
      // Scale down by removing available workers
      const available = status.stats.available;
      const toRemove = Math.min(workersToChange, available);
      
      for (let i = 0; i < toRemove; i++) {
        const availableWorkers = workerPool.availableWorkers.get(type);
        if (availableWorkers.length > 0) {
          const workerId = availableWorkers.pop();
          const workerInfo = workerPool.workers.get(workerId);
          if (workerInfo) {
            workerInfo.worker.terminate();
          }
        }
      }
    }
    
    res.json({
      success: true,
      data: {
        type,
        action,
        workersChanged: workersToChange,
        previousWorkers: currentWorkers,
        newWorkers: targetCount,
        message: `Scaled ${action} ${type} workers by ${workersToChange}`
      }
    });
  } catch (error) {
    logger.error('Failed to scale workers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Restart a specific worker
 */
router.post('/restart/:workerId', async (req, res) => {
  try {
    const { workerId } = req.params;
    const workerInfo = workerPool.workers.get(workerId);
    
    if (!workerInfo) {
      return res.status(404).json({
        success: false,
        error: `Worker not found: ${workerId}`
      });
    }
    
    const { type } = workerInfo;
    
    // Terminate current worker
    workerInfo.worker.terminate();
    
    // Create replacement worker
    await workerPool.createWorker(type);
    
    res.json({
      success: true,
      data: {
        workerId,
        type,
        message: `Worker ${workerId} restarted successfully`
      }
    });
  } catch (error) {
    logger.error('Failed to restart worker:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get worker health information
 */
router.get('/health', async (req, res) => {
  try {
    const status = workerPool.getPoolStatus();
    const health = {
      overall: 'healthy',
      workers: {},
      summary: {
        totalWorkers: status.stats.total,
        availableWorkers: status.stats.available,
        busyWorkers: status.stats.busy,
        totalTasks: status.stats.tasksCompleted + status.stats.tasksFailed,
        completedTasks: status.stats.tasksCompleted,
        failedTasks: status.stats.tasksFailed,
        errorRate: status.stats.tasksFailed / (status.stats.tasksCompleted + status.stats.tasksFailed) * 100 || 0
      }
    };
    
    // Calculate health for each worker type
    for (const [type, config] of Object.entries(WORKER_TYPES)) {
      const typeStats = status.stats.byType[type];
      const queueLength = status.queues[type]?.length || 0;
      
      let typeHealth = 'healthy';
      
      // Check error rate
      const totalTypeTasks = typeStats.tasksCompleted + typeStats.tasksFailed;
      const errorRate = totalTypeTasks > 0 ? (typeStats.tasksFailed / totalTypeTasks) * 100 : 0;
      
      if (errorRate > 20) {
        typeHealth = 'unhealthy';
      } else if (errorRate > 10 || queueLength > 5) {
        typeHealth = 'degraded';
      }
      
      health.workers[type] = {
        status: typeHealth,
        workers: typeStats.total,
        available: typeStats.available,
        busy: typeStats.busy,
        queueLength,
        errorRate: errorRate.toFixed(2),
        avgTaskTime: typeStats.avgTaskTime
      };
    }
    
    // Determine overall health
    const unhealthyTypes = Object.values(health.workers).filter(w => w.status === 'unhealthy').length;
    const degradedTypes = Object.values(health.workers).filter(w => w.status === 'degraded').length;
    
    if (unhealthyTypes > 0) {
      health.overall = 'unhealthy';
    } else if (degradedTypes > 0) {
      health.overall = 'degraded';
    }
    
    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error('Failed to get worker health:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get queue information
 */
router.get('/queues', async (req, res) => {
  try {
    const status = workerPool.getPoolStatus();
    const queues = {};
    
    for (const [type, queueInfo] of Object.entries(status.queues)) {
      queues[type] = {
        length: queueInfo.length,
        tasks: queueInfo.tasks.map(task => ({
          id: task.id,
          priority: task.priority,
          waitTime: Date.now() - task.timestamp,
          timestamp: task.timestamp
        }))
      };
    }
    
    res.json({
      success: true,
      data: queues
    });
  } catch (error) {
    logger.error('Failed to get queue information:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get resource usage information
 */
router.get('/resources', async (req, res) => {
  try {
    const status = workerPool.getPoolStatus();
    const resources = {
      workers: {},
      summary: {
        totalWorkers: Object.keys(status.resources).length,
        avgCpuUsage: 0,
        avgMemoryUsage: 0,
        avgGpuUsage: 0
      }
    };
    
    let totalCpu = 0;
    let totalMemory = 0;
    let totalGpu = 0;
    let workerCount = 0;
    
    for (const [workerId, usage] of Object.entries(status.resources)) {
      const workerInfo = workerPool.workers.get(workerId);
      
      if (workerInfo) {
        resources.workers[workerId] = {
          type: workerInfo.type,
          cpu: usage.cpu,
          memory: usage.memory,
          gpu: usage.gpu,
          status: workerInfo.isAvailable ? 'available' : 'busy'
        };
        
        totalCpu += usage.cpu;
        totalMemory += usage.memory;
        totalGpu += usage.gpu;
        workerCount++;
      }
    }
    
    if (workerCount > 0) {
      resources.summary.avgCpuUsage = totalCpu / workerCount;
      resources.summary.avgMemoryUsage = totalMemory / workerCount;
      resources.summary.avgGpuUsage = totalGpu / workerCount;
    }
    
    res.json({
      success: true,
      data: resources
    });
  } catch (error) {
    logger.error('Failed to get resource usage:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
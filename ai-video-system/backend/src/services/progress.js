const { query } = require('../database/connection');
const { cache } = require('./redis');
const logger = require('../utils/logger');

// Progress tracking service
const progressHandler = (io, socket) => {
  const userId = socket.handshake.auth.userId;

  if (!userId) {
    socket.disconnect();
    return;
  }

  logger.info(`User ${userId} connected to progress tracking with socket ${socket.id}`);

  // Subscribe to render job progress
  socket.on('subscribe-render', async (data) => {
    try {
      const { renderJobId } = data;

      if (!renderJobId) {
        socket.emit('error', { message: 'Render job ID is required' });
        return;
      }

      // Verify user owns the render job
      const result = await query(
        'SELECT id, user_id, status FROM render_jobs WHERE id = $1',
        [renderJobId]
      );

      if (result.rows.length === 0) {
        socket.emit('error', { message: 'Render job not found' });
        return;
      }

      const renderJob = result.rows[0];

      if (renderJob.user_id !== userId) {
        socket.emit('error', { message: 'Access denied to this render job' });
        return;
      }

      // Join render job room
      socket.join(`render:${renderJobId}`);

      // Send current progress
      const progress = await getRenderProgress(renderJobId);
      socket.emit('render-progress', {
        renderJobId,
        ...progress
      });

      logger.info(`User ${userId} subscribed to render job ${renderJobId}`);

    } catch (error) {
      logger.error('Error subscribing to render job:', error);
      socket.emit('error', { message: 'Failed to subscribe to render job' });
    }
  });

  // Unsubscribe from render job progress
  socket.on('unsubscribe-render', (data) => {
    try {
      const { renderJobId } = data;

      if (!renderJobId) {
        return;
      }

      socket.leave(`render:${renderJobId}`);
      logger.info(`User ${userId} unsubscribed from render job ${renderJobId}`);

    } catch (error) {
      logger.error('Error unsubscribing from render job:', error);
    }
  });

  // Subscribe to project progress
  socket.on('subscribe-project', async (data) => {
    try {
      const { projectId } = data;

      if (!projectId) {
        socket.emit('error', { message: 'Project ID is required' });
        return;
      }

      // Verify user has access to project
      const result = await query(`
        SELECT p.id, p.user_id as owner_id, c.role, c.user_id as collaborator_id
        FROM projects p
        LEFT JOIN collaborations c ON p.id = c.project_id AND c.user_id = $1
        WHERE p.id = $2
      `, [userId, projectId]);

      if (result.rows.length === 0) {
        socket.emit('error', { message: 'Project not found' });
        return;
      }

      const project = result.rows[0];
      const isOwner = project.owner_id === userId;
      const isCollaborator = project.collaborator_id === userId;

      if (!isOwner && !isCollaborator) {
        socket.emit('error', { message: 'Access denied to this project' });
        return;
      }

      // Join project room
      socket.join(`project:${projectId}`);

      // Send current project progress
      const progress = await getProjectProgress(projectId);
      socket.emit('project-progress', {
        projectId,
        ...progress
      });

      logger.info(`User ${userId} subscribed to project ${projectId}`);

    } catch (error) {
      logger.error('Error subscribing to project:', error);
      socket.emit('error', { message: 'Failed to subscribe to project' });
    }
  });

  // Unsubscribe from project progress
  socket.on('unsubscribe-project', (data) => {
    try {
      const { projectId } = data;

      if (!projectId) {
        return;
      }

      socket.leave(`project:${projectId}`);
      logger.info(`User ${userId} unsubscribed from project ${projectId}`);

    } catch (error) {
      logger.error('Error unsubscribing from project:', error);
    }
  });

  // Get current progress for multiple items
  socket.on('get-progress', async (data) => {
    try {
      const { renderJobs, projects } = data;

      const progress = {};

      // Get render job progress
      if (renderJobs && renderJobs.length > 0) {
        progress.renderJobs = {};
        for (const renderJobId of renderJobs) {
          progress.renderJobs[renderJobId] = await getRenderProgress(renderJobId);
        }
      }

      // Get project progress
      if (projects && projects.length > 0) {
        progress.projects = {};
        for (const projectId of projects) {
          progress.projects[projectId] = await getProjectProgress(projectId);
        }
      }

      socket.emit('progress-data', progress);

    } catch (error) {
      logger.error('Error getting progress data:', error);
      socket.emit('error', { message: 'Failed to get progress data' });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    logger.info(`User ${userId} disconnected from progress tracking`);
  });
};

// Get render job progress
const getRenderProgress = async (renderJobId) => {
  try {
    // Try to get from cache first
    const cacheKey = `render_progress:${renderJobId}`;
    let progress = await cache.get(cacheKey);

    if (!progress) {
      // Get from database
      const result = await query(
        'SELECT status, progress, error_message, started_at, completed_at FROM render_jobs WHERE id = $1',
        [renderJobId]
      );

      if (result.rows.length === 0) {
        return { status: 'not_found', progress: 0 };
      }

      const renderJob = result.rows[0];
      progress = {
        status: renderJob.status,
        progress: renderJob.progress || 0,
        error_message: renderJob.error_message,
        started_at: renderJob.started_at,
        completed_at: renderJob.completed_at,
        estimated_completion: null
      };

      // Calculate estimated completion time for processing jobs
      if (renderJob.status === 'processing' && renderJob.progress > 0) {
        const elapsed = Date.now() - new Date(renderJob.started_at).getTime();
        const estimatedTotal = (elapsed / renderJob.progress) * 100;
        progress.estimated_completion = new Date(renderJob.started_at.getTime() + estimatedTotal);
      }

      // Cache for 30 seconds
      await cache.set(cacheKey, progress, 30);
    }

    return progress;

  } catch (error) {
    logger.error('Error getting render progress:', error);
    return { status: 'error', progress: 0, error: 'Failed to get progress' };
  }
};

// Update render job progress
const updateRenderProgress = async (renderJobId, progress, status = null, error = null) => {
  try {
    // Update database
    const updateFields = ['progress = $1'];
    const updateValues = [progress];
    let paramIndex = 2;

    if (status) {
      updateFields.push(`status = $${paramIndex++}`);
      updateValues.push(status);
    }

    if (error) {
      updateFields.push(`error_message = $${paramIndex++}`);
      updateValues.push(error);
    }

    if (status === 'completed') {
      updateFields.push(`completed_at = CURRENT_TIMESTAMP`);
    } else if (status === 'processing' && progress === 0) {
      updateFields.push(`started_at = CURRENT_TIMESTAMP`);
    }

    updateValues.push(renderJobId);

    await query(`
      UPDATE render_jobs 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
    `, updateValues);

    // Get updated render job
    const result = await query(
      'SELECT status, progress, error_message, started_at, completed_at FROM render_jobs WHERE id = $1',
      [renderJobId]
    );

    if (result.rows.length > 0) {
      const renderJob = result.rows[0];
      const progressData = {
        status: renderJob.status,
        progress: renderJob.progress,
        error_message: renderJob.error_message,
        started_at: renderJob.started_at,
        completed_at: renderJob.completed_at
      };

      // Update cache
      const cacheKey = `render_progress:${renderJobId}`;
      await cache.set(cacheKey, progressData, 30);

      // Broadcast to subscribers
      const io = require('../index').io;
      io.to(`render:${renderJobId}`).emit('render-progress', {
        renderJobId,
        ...progressData
      });

      logger.info(`Render job ${renderJobId} progress updated: ${progress}% (${status || renderJob.status})`);
    }

  } catch (error) {
    logger.error('Error updating render progress:', error);
  }
};

// Get project progress
const getProjectProgress = async (projectId) => {
  try {
    // Try to get from cache first
    const cacheKey = `project_progress:${projectId}`;
    let progress = await cache.get(cacheKey);

    if (!progress) {
      // Get project statistics
      const result = await query(`
        SELECT 
          (SELECT COUNT(*) FROM assets WHERE project_id = $1) as total_assets,
          (SELECT COUNT(*) FROM render_jobs WHERE project_id = $1 AND status = 'completed') as completed_renders,
          (SELECT COUNT(*) FROM render_jobs WHERE project_id = $1 AND status = 'processing') as processing_renders,
          (SELECT COUNT(*) FROM render_jobs WHERE project_id = $1 AND status = 'queued') as queued_renders,
          (SELECT COUNT(*) FROM collaborations WHERE project_id = $1) as collaborators_count
      `, [projectId]);

      const stats = result.rows[0];

      progress = {
        total_assets: stats.total_assets,
        completed_renders: stats.completed_renders,
        processing_renders: stats.processing_renders,
        queued_renders: stats.queued_renders,
        collaborators_count: stats.collaborators_count,
        last_activity: null
      };

      // Get last activity
      const lastActivityResult = await query(`
        SELECT 
          GREATEST(
            (SELECT MAX(created_at) FROM assets WHERE project_id = $1),
            (SELECT MAX(created_at) FROM render_jobs WHERE project_id = $1),
            (SELECT MAX(updated_at) FROM projects WHERE id = $1)
          ) as last_activity
      `, [projectId]);

      if (lastActivityResult.rows[0].last_activity) {
        progress.last_activity = lastActivityResult.rows[0].last_activity;
      }

      // Cache for 1 minute
      await cache.set(cacheKey, progress, 60);
    }

    return progress;

  } catch (error) {
    logger.error('Error getting project progress:', error);
    return {
      total_assets: 0,
      completed_renders: 0,
      processing_renders: 0,
      queued_renders: 0,
      collaborators_count: 0,
      last_activity: null,
      error: 'Failed to get progress'
    };
  }
};

// Update project progress
const updateProjectProgress = async (projectId) => {
  try {
    // Clear cache to force refresh
    const cacheKey = `project_progress:${projectId}`;
    await cache.del(cacheKey);

    // Get updated progress
    const progress = await getProjectProgress(projectId);

    // Broadcast to subscribers
    const io = require('../index').io;
    io.to(`project:${projectId}`).emit('project-progress', {
      projectId,
      ...progress
    });

  } catch (error) {
    logger.error('Error updating project progress:', error);
  }
};

// Get system progress (admin only)
const getSystemProgress = async () => {
  try {
    // Try to get from cache first
    const cacheKey = 'system_progress';
    let progress = await cache.get(cacheKey);

    if (!progress) {
      // Get system statistics
      const result = await query(`
        SELECT 
          (SELECT COUNT(*) FROM users WHERE is_verified = true) as total_users,
          (SELECT COUNT(*) FROM projects) as total_projects,
          (SELECT COUNT(*) FROM assets) as total_assets,
          (SELECT COUNT(*) FROM render_jobs WHERE status = 'queued') as queued_renders,
          (SELECT COUNT(*) FROM render_jobs WHERE status = 'processing') as processing_renders,
          (SELECT COUNT(*) FROM render_jobs WHERE status = 'completed') as completed_renders,
          (SELECT COUNT(*) FROM render_jobs WHERE status = 'failed') as failed_renders
      `);

      const stats = result.rows[0];

      progress = {
        total_users: stats.total_users,
        total_projects: stats.total_projects,
        total_assets: stats.total_assets,
        queued_renders: stats.queued_renders,
        processing_renders: stats.processing_renders,
        completed_renders: stats.completed_renders,
        failed_renders: stats.failed_renders,
        timestamp: new Date()
      };

      // Cache for 1 minute
      await cache.set(cacheKey, progress, 60);
    }

    return progress;

  } catch (error) {
    logger.error('Error getting system progress:', error);
    return {
      total_users: 0,
      total_projects: 0,
      total_assets: 0,
      queued_renders: 0,
      processing_renders: 0,
      completed_renders: 0,
      failed_renders: 0,
      timestamp: new Date(),
      error: 'Failed to get system progress'
    };
  }
};

// Clean up old progress data
const cleanupProgressData = async () => {
  try {
    // Clean up old render progress cache entries
    const renderKeys = await cache.getKeys('render_progress:*');
    for (const key of renderKeys) {
      const ttl = await cache.getTTL(key);
      if (ttl === -1) { // No expiration set
        await cache.expire(key, 300); // Set 5 minute expiration
      }
    }

    // Clean up old project progress cache entries
    const projectKeys = await cache.getKeys('project_progress:*');
    for (const key of projectKeys) {
      const ttl = await cache.getTTL(key);
      if (ttl === -1) { // No expiration set
        await cache.expire(key, 300); // Set 5 minute expiration
      }
    }

    logger.info('Progress data cleanup completed');

  } catch (error) {
    logger.error('Error cleaning up progress data:', error);
  }
};

// Run cleanup every 10 minutes
setInterval(cleanupProgressData, 10 * 60 * 1000);

module.exports = {
  progressHandler,
  getRenderProgress,
  updateRenderProgress,
  getProjectProgress,
  updateProjectProgress,
  getSystemProgress
};
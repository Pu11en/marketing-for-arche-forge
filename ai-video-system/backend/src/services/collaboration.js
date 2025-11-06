const { query } = require('../database/connection');
const { cache } = require('./redis');
const logger = require('../utils/logger');

// Store active project rooms and user sessions
const projectRooms = new Map();
const userSessions = new Map();

// Collaboration event handler
const collaborationHandler = (io, socket) => {
  const userId = socket.handshake.auth.userId;
  const userName = socket.handshake.auth.userName;

  if (!userId) {
    socket.disconnect();
    return;
  }

  // Store user session
  userSessions.set(socket.id, {
    userId,
    userName,
    socketId: socket.id,
    joinedProjects: new Set()
  });

  logger.info(`User ${userName} (${userId}) connected with socket ${socket.id}`);

  // Join project room
  socket.on('join-project', async (data) => {
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

      // Join socket room
      socket.join(`project:${projectId}`);

      // Update user session
      const userSession = userSessions.get(socket.id);
      userSession.joinedProjects.add(projectId);

      // Track project room
      if (!projectRooms.has(projectId)) {
        projectRooms.set(projectId, new Map());
      }

      const projectRoom = projectRooms.get(projectId);
      projectRoom.set(socket.id, {
        userId,
        userName,
        socketId: socket.id,
        role: isOwner ? 'owner' : project.role,
        cursor: { x: 0, y: 0 },
        selection: null,
        lastActivity: Date.now()
      });

      // Notify other users in the project
      socket.to(`project:${projectId}`).emit('user-joined', {
        userId,
        userName,
        role: isOwner ? 'owner' : project.role,
        socketId: socket.id
      });

      // Send current project state to the joining user
      const activeUsers = Array.from(projectRoom.values()).map(user => ({
        userId: user.userId,
        userName: user.userName,
        role: user.role,
        cursor: user.cursor,
        selection: user.selection
      }));

      socket.emit('project-joined', {
        projectId,
        activeUsers,
        userRole: isOwner ? 'owner' : project.role
      });

      // Log collaboration activity
      logger.logUserActivity(userId, 'project_joined', {
        projectId,
        role: isOwner ? 'owner' : project.role,
        socketId: socket.id
      });

    } catch (error) {
      logger.error('Error joining project:', error);
      socket.emit('error', { message: 'Failed to join project' });
    }
  });

  // Leave project room
  socket.on('leave-project', (data) => {
    try {
      const { projectId } = data;

      if (!projectId) {
        socket.emit('error', { message: 'Project ID is required' });
        return;
      }

      leaveProject(socket, projectId);

    } catch (error) {
      logger.error('Error leaving project:', error);
      socket.emit('error', { message: 'Failed to leave project' });
    }
  });

  // Handle cursor movement
  socket.on('cursor-move', (data) => {
    try {
      const { projectId, x, y } = data;

      if (!projectId) {
        return;
      }

      const projectRoom = projectRooms.get(projectId);
      if (!projectRoom) {
        return;
      }

      const user = projectRoom.get(socket.id);
      if (user) {
        user.cursor = { x, y };
        user.lastActivity = Date.now();

        // Broadcast cursor position to other users
        socket.to(`project:${projectId}`).emit('cursor-update', {
          userId,
          x,
          y
        });
      }

    } catch (error) {
      logger.error('Error handling cursor move:', error);
    }
  });

  // Handle selection change
  socket.on('selection-change', (data) => {
    try {
      const { projectId, selection } = data;

      if (!projectId) {
        return;
      }

      const projectRoom = projectRooms.get(projectId);
      if (!projectRoom) {
        return;
      }

      const user = projectRoom.get(socket.id);
      if (user) {
        user.selection = selection;
        user.lastActivity = Date.now();

        // Broadcast selection to other users
        socket.to(`project:${projectId}`).emit('selection-update', {
          userId,
          selection
        });
      }

    } catch (error) {
      logger.error('Error handling selection change:', error);
    }
  });

  // Handle edit operation
  socket.on('edit-operation', async (data) => {
    try {
      const { projectId, operation, timestamp } = data;

      if (!projectId || !operation) {
        socket.emit('error', { message: 'Project ID and operation are required' });
        return;
      }

      const projectRoom = projectRooms.get(projectId);
      if (!projectRoom) {
        socket.emit('error', { message: 'Project room not found' });
        return;
      }

      const user = projectRoom.get(socket.id);
      if (!user) {
        socket.emit('error', { message: 'User not in project room' });
        return;
      }

      // Check if user has edit permissions
      if (user.role === 'viewer') {
        socket.emit('error', { message: 'You do not have permission to edit this project' });
        return;
      }

      // Add timestamp if not provided
      const operationWithTimestamp = {
        ...operation,
        timestamp: timestamp || Date.now(),
        userId,
        userName: user.userName
      };

      // Store operation in cache for persistence
      const operationsKey = `project_operations:${projectId}`;
      await cache.listPush(operationsKey, JSON.stringify(operationWithTimestamp));
      await cache.expire(operationsKey, 3600); // Keep for 1 hour

      // Broadcast operation to other users
      socket.to(`project:${projectId}`).emit('edit-applied', operationWithTimestamp);

      // Update user activity
      user.lastActivity = Date.now();

      // Log edit operation
      logger.logUserActivity(userId, 'edit_operation', {
        projectId,
        operationType: operation.type,
        timestamp: operationWithTimestamp.timestamp
      });

    } catch (error) {
      logger.error('Error handling edit operation:', error);
      socket.emit('error', { message: 'Failed to apply edit operation' });
    }
  });

  // Handle typing indicator
  socket.on('typing-start', (data) => {
    try {
      const { projectId } = data;

      if (!projectId) {
        return;
      }

      socket.to(`project:${projectId}`).emit('user-typing', {
        userId,
        userName,
        isTyping: true
      });

    } catch (error) {
      logger.error('Error handling typing start:', error);
    }
  });

  socket.on('typing-stop', (data) => {
    try {
      const { projectId } = data;

      if (!projectId) {
        return;
      }

      socket.to(`project:${projectId}`).emit('user-typing', {
        userId,
        userName,
        isTyping: false
      });

    } catch (error) {
      logger.error('Error handling typing stop:', error);
    }
  });

  // Handle project state request
  socket.on('get-project-state', async (data) => {
    try {
      const { projectId } = data;

      if (!projectId) {
        socket.emit('error', { message: 'Project ID is required' });
        return;
      }

      // Get recent operations from cache
      const operationsKey = `project_operations:${projectId}`;
      const operations = await cache.listRange(operationsKey, 0, -1);

      socket.emit('project-state', {
        projectId,
        operations: operations.map(op => JSON.parse(op))
      });

    } catch (error) {
      logger.error('Error getting project state:', error);
      socket.emit('error', { message: 'Failed to get project state' });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    try {
      const userSession = userSessions.get(socket.id);
      
      if (userSession) {
        // Leave all joined projects
        for (const projectId of userSession.joinedProjects) {
          leaveProject(socket, projectId);
        }

        // Remove user session
        userSessions.delete(socket.id);
      }

      logger.info(`User ${userSession?.userName} (${userSession?.userId}) disconnected`);

    } catch (error) {
      logger.error('Error handling disconnect:', error);
    }
  });
};

// Helper function to leave a project
const leaveProject = (socket, projectId) => {
  const userSession = userSessions.get(socket.id);
  
  if (!userSession || !userSession.joinedProjects.has(projectId)) {
    return;
  }

  // Leave socket room
  socket.leave(`project:${projectId}`);

  // Remove from project room
  const projectRoom = projectRooms.get(projectId);
  if (projectRoom) {
    projectRoom.delete(socket.id);

    // Clean up empty project rooms
    if (projectRoom.size === 0) {
      projectRooms.delete(projectId);
    }
  }

  // Update user session
  userSession.joinedProjects.delete(projectId);

  // Notify other users
  socket.to(`project:${projectId}`).emit('user-left', {
    userId: userSession.userId,
    userName: userSession.userName
  });

  // Log collaboration activity
  logger.logUserActivity(userSession.userId, 'project_left', {
    projectId,
    socketId: socket.id
  });
};

// Clean up inactive users
const cleanupInactiveUsers = () => {
  const now = Date.now();
  const inactiveThreshold = 5 * 60 * 1000; // 5 minutes

  for (const [projectId, projectRoom] of projectRooms.entries()) {
    for (const [socketId, user] of projectRoom.entries()) {
      if (now - user.lastActivity > inactiveThreshold) {
        // Remove inactive user
        projectRoom.delete(socketId);

        // Get socket and disconnect
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect();
        }

        // Notify other users
        io.to(`project:${projectId}`).emit('user-left', {
          userId: user.userId,
          userName: user.userName
        });

        logger.info(`Inactive user ${user.userName} (${user.userId}) removed from project ${projectId}`);
      }
    }

    // Clean up empty project rooms
    if (projectRoom.size === 0) {
      projectRooms.delete(projectId);
    }
  }
};

// Run cleanup every 5 minutes
setInterval(cleanupInactiveUsers, 5 * 60 * 1000);

// Get project collaboration stats
const getProjectStats = async (projectId) => {
  try {
    const projectRoom = projectRooms.get(projectId);
    
    if (!projectRoom) {
      return {
        activeUsers: 0,
        totalOperations: 0
      };
    }

    const operationsKey = `project_operations:${projectId}`;
    const operations = await cache.listLength(operationsKey);

    return {
      activeUsers: projectRoom.size,
      totalOperations: operations
    };

  } catch (error) {
    logger.error('Error getting project stats:', error);
    return {
      activeUsers: 0,
      totalOperations: 0
    };
  }
};

// Get all active projects
const getActiveProjects = () => {
  const activeProjects = [];

  for (const [projectId, projectRoom] of projectRooms.entries()) {
    activeProjects.push({
      projectId,
      activeUsers: projectRoom.size,
      users: Array.from(projectRoom.values()).map(user => ({
        userId: user.userId,
        userName: user.userName,
        role: user.role,
        lastActivity: user.lastActivity
      }))
    });
  }

  return activeProjects;
};

module.exports = {
  collaborationHandler,
  getProjectStats,
  getActiveProjects
};
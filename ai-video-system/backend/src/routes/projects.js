const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { query: dbQuery, transaction } = require('../database/connection');
const { catchAsync, ValidationError, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');
const { createRateLimit, requireProjectAccess } = require('../middleware/auth');
const { cache } = require('../services/redis');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Rate limiting for project operations
const projectCreateRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // limit each user to 20 project creations per hour
  message: 'Too many projects created, please try again later.'
});

// Validation rules
const createProjectValidation = [
  body('title').trim().isLength({ min: 1, max: 255 }).withMessage('Title must be between 1 and 255 characters'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
  body('settings').optional().isObject().withMessage('Settings must be an object'),
  body('template_id').optional().isUUID().withMessage('Template ID must be a valid UUID')
];

const updateProjectValidation = [
  body('title').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Title must be between 1 and 255 characters'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
  body('settings').optional().isObject().withMessage('Settings must be an object'),
  body('status').optional().isIn(['draft', 'processing', 'completed', 'failed', 'archived']).withMessage('Invalid status value')
];

// Get all projects for the current user
router.get('/', catchAsync(async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const status = req.query.status;
  const search = req.query.search;

  // Build query conditions
  let whereConditions = ['p.user_id = $1'];
  let queryParams = [userId];
  let paramIndex = 2;

  if (status) {
    whereConditions.push(`p.status = $${paramIndex++}`);
    queryParams.push(status);
  }

  if (search) {
    whereConditions.push(`(p.title ILIKE $${paramIndex++} OR p.description ILIKE $${paramIndex++})`);
    queryParams.push(`%${search}%`, `%${search}%`);
  }

  // Get projects with collaboration info
  const projectsQuery = `
    SELECT 
      p.id, p.title, p.description, p.thumbnail_url, p.status, 
      p.settings, p.metadata, p.created_at, p.updated_at,
      (SELECT COUNT(*) FROM assets WHERE project_id = p.id) as asset_count,
      (SELECT COUNT(*) FROM render_jobs WHERE project_id = p.id) as render_count,
      (SELECT COUNT(*) FROM collaborations WHERE project_id = p.id) as collaborator_count
    FROM projects p
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY p.updated_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;
  
  queryParams.push(limit, offset);

  const result = await dbQuery(projectsQuery, queryParams);

  // Get total count for pagination
  const countQuery = `
    SELECT COUNT(*) as total
    FROM projects p
    WHERE ${whereConditions.join(' AND ')}
  `;
  
  const countResult = await dbQuery(countQuery, queryParams.slice(0, -2));
  const total = parseInt(countResult.rows[0].total);
  const totalPages = Math.ceil(total / limit);

  res.json({
    status: 'success',
    data: {
      projects: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  });
}));

// Get a specific project
router.get('/:id', requireProjectAccess, catchAsync(async (req, res) => {
  const projectId = req.params.id;
  const userId = req.user.id;

  // Try to get from cache first
  const cacheKey = `project:${projectId}:${userId}`;
  let project = await cache.get(cacheKey);

  if (!project) {
    // Get project with full details
    const result = await dbQuery(`
      SELECT 
        p.id, p.user_id as owner_id, p.title, p.description, p.thumbnail_url, 
        p.status, p.settings, p.metadata, p.created_at, p.updated_at,
        u.name as owner_name, u.email as owner_email,
        c.role as user_role,
        (SELECT COUNT(*) FROM assets WHERE project_id = p.id) as asset_count,
        (SELECT COUNT(*) FROM render_jobs WHERE project_id = p.id) as render_count,
        (SELECT COUNT(*) FROM collaborations WHERE project_id = p.id) as collaborator_count
      FROM projects p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN collaborations c ON p.id = c.project_id AND c.user_id = $1
      WHERE p.id = $2
    `, [userId, projectId]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Project');
    }

    project = result.rows[0];
    
    // Cache for 5 minutes
    await cache.set(cacheKey, project, 300);
  }

  res.json({
    status: 'success',
    data: {
      project,
      access: req.projectAccess
    }
  });
}));

// Create a new project
router.post('/', projectCreateRateLimit, createProjectValidation, catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const userId = req.user.id;
  const { title, description, settings, template_id } = req.body;

  // Start transaction
  const result = await transaction(async (client) => {
    let projectSettings = settings || {};

    // If template is provided, load template data
    if (template_id) {
      const templateResult = await client.query(
        'SELECT template_data FROM templates WHERE id = $1 AND is_public = true',
        [template_id]
      );

      if (templateResult.rows.length > 0) {
        projectSettings = { ...templateResult.rows[0].template_data, ...projectSettings };
      }
    }

    // Create project
    const projectResult = await client.query(`
      INSERT INTO projects (user_id, title, description, settings, metadata)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, title, description, thumbnail_url, status, settings, metadata, created_at, updated_at
    `, [userId, title, description, projectSettings, {}]);

    return projectResult.rows[0];
  });

  // Log project creation
  logger.logUserActivity(userId, 'project_created', {
    projectId: result.id,
    title: result.title,
    ip: req.ip
  });

  // Clear user projects cache
  await cache.del(`user_projects:${userId}`);

  res.status(201).json({
    status: 'success',
    message: 'Project created successfully',
    data: {
      project: result
    }
  });
}));

// Update a project
router.put('/:id', requireProjectAccess, updateProjectValidation, catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const projectId = req.params.id;
  const userId = req.user.id;
  const { title, description, settings, status } = req.body;

  // Check if user has permission to edit
  if (req.projectAccess.role === 'viewer') {
    throw new ForbiddenError('You do not have permission to edit this project');
  }

  // Update project
  const updateFields = [];
  const updateValues = [];
  let paramIndex = 1;

  if (title !== undefined) {
    updateFields.push(`title = $${paramIndex++}`);
    updateValues.push(title);
  }

  if (description !== undefined) {
    updateFields.push(`description = $${paramIndex++}`);
    updateValues.push(description);
  }

  if (settings !== undefined) {
    updateFields.push(`settings = $${paramIndex++}`);
    updateValues.push(settings);
  }

  if (status !== undefined) {
    updateFields.push(`status = $${paramIndex++}`);
    updateValues.push(status);
  }

  if (updateFields.length === 0) {
    throw new ValidationError('No fields to update');
  }

  updateValues.push(projectId);

  const result = await dbQuery(`
    UPDATE projects 
    SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = $${paramIndex}
    RETURNING id, title, description, thumbnail_url, status, settings, metadata, updated_at
  `, updateValues);

  if (result.rows.length === 0) {
    throw new NotFoundError('Project');
  }

  const updatedProject = result.rows[0];

  // Clear cache
  await cache.del(`project:${projectId}:${userId}`);

  // Log project update
  logger.logUserActivity(userId, 'project_updated', {
    projectId,
    fields: Object.keys(req.body),
    ip: req.ip
  });

  res.json({
    status: 'success',
    message: 'Project updated successfully',
    data: {
      project: updatedProject
    }
  });
}));

// Delete a project
router.delete('/:id', requireProjectAccess, catchAsync(async (req, res) => {
  const projectId = req.params.id;
  const userId = req.user.id;

  // Check if user is owner
  if (!req.projectAccess.isOwner) {
    throw new ForbiddenError('Only project owners can delete projects');
  }

  // Delete project (cascade will handle related records)
  await dbQuery('DELETE FROM projects WHERE id = $1', [projectId]);

  // Clear cache
  await cache.del(`project:${projectId}:${userId}`);
  await cache.del(`user_projects:${userId}`);

  // Log project deletion
  logger.logUserActivity(userId, 'project_deleted', {
    projectId,
    ip: req.ip
  });

  res.json({
    status: 'success',
    message: 'Project deleted successfully'
  });
}));

// Duplicate a project
router.post('/:id/duplicate', requireProjectAccess, catchAsync(async (req, res) => {
  const projectId = req.params.id;
  const userId = req.user.id;
  const { title } = req.body;

  // Get original project
  const originalResult = await dbQuery(`
    SELECT title, description, settings, metadata
    FROM projects
    WHERE id = $1
  `, [projectId]);

  if (originalResult.rows.length === 0) {
    throw new NotFoundError('Project');
  }

  const original = originalResult.rows[0];

  // Create duplicate
  const duplicateResult = await dbQuery(`
    INSERT INTO projects (user_id, title, description, settings, metadata)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, title, description, thumbnail_url, status, settings, metadata, created_at, updated_at
  `, [
    userId,
    title || `${original.title} (Copy)`,
    original.description,
    original.settings,
    { ...original.metadata, duplicated_from: projectId }
  ]);

  const duplicate = duplicateResult.rows[0];

  // Log project duplication
  logger.logUserActivity(userId, 'project_duplicated', {
    originalProjectId: projectId,
    newProjectId: duplicate.id,
    ip: req.ip
  });

  // Clear user projects cache
  await cache.del(`user_projects:${userId}`);

  res.status(201).json({
    status: 'success',
    message: 'Project duplicated successfully',
    data: {
      project: duplicate
    }
  });
}));

// Get project assets
router.get('/:id/assets', requireProjectAccess, catchAsync(async (req, res) => {
  const projectId = req.params.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const type = req.query.type;

  // Build query conditions
  let whereConditions = ['project_id = $1'];
  let queryParams = [projectId];
  let paramIndex = 2;

  if (type) {
    whereConditions.push(`type = $${paramIndex++}`);
    queryParams.push(type);
  }

  // Get assets
  const result = await dbQuery(`
    SELECT id, type, name, url, file_size, dimensions, duration, metadata, created_at
    FROM assets
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `, [...queryParams, limit, offset]);

  // Get total count for pagination
  const countResult = await dbQuery(`
    SELECT COUNT(*) as total
    FROM assets
    WHERE ${whereConditions.join(' AND ')}
  `, queryParams);

  const total = parseInt(countResult.rows[0].total);
  const totalPages = Math.ceil(total / limit);

  res.json({
    status: 'success',
    data: {
      assets: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  });
}));

// Get project render jobs
router.get('/:id/renders', requireProjectAccess, catchAsync(async (req, res) => {
  const projectId = req.params.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const status = req.query.status;

  // Build query conditions
  let whereConditions = ['project_id = $1'];
  let queryParams = [projectId];
  let paramIndex = 2;

  if (status) {
    whereConditions.push(`status = $${paramIndex++}`);
    queryParams.push(status);
  }

  // Get render jobs
  const result = await dbQuery(`
    SELECT id, status, progress, settings, result_url, error_message, 
           started_at, completed_at, created_at
    FROM render_jobs
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `, [...queryParams, limit, offset]);

  // Get total count for pagination
  const countResult = await dbQuery(`
    SELECT COUNT(*) as total
    FROM render_jobs
    WHERE ${whereConditions.join(' AND ')}
  `, queryParams);

  const total = parseInt(countResult.rows[0].total);
  const totalPages = Math.ceil(total / limit);

  res.json({
    status: 'success',
    data: {
      renders: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  });
}));

module.exports = router;
const express = require('express');
const { body, validationResult } = require('express-validator');
const { query: dbQuery, transaction } = require('../database/connection');
const { catchAsync, ValidationError, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');
const { createRateLimit } = require('../middleware/auth');
const { cache } = require('../services/redis');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Rate limiting for template creation
const templateCreateRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each user to 5 template creations per hour
  message: 'Too many templates created, please try again later.'
});

// Validation rules
const createTemplateValidation = [
  body('name').trim().isLength({ min: 1, max: 255 }).withMessage('Name must be between 1 and 255 characters'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
  body('category').optional().trim().isLength({ max: 100 }).withMessage('Category must be less than 100 characters'),
  body('template_data').isObject().withMessage('Template data is required'),
  body('is_public').optional().isBoolean().withMessage('is_public must be a boolean')
];

const updateTemplateValidation = [
  body('name').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Name must be between 1 and 255 characters'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
  body('category').optional().trim().isLength({ max: 100 }).withMessage('Category must be less than 100 characters'),
  body('template_data').optional().isObject().withMessage('Template data must be an object'),
  body('is_public').optional().isBoolean().withMessage('is_public must be a boolean')
];

// Get all templates (public and user's private templates)
router.get('/', catchAsync(async (req, res) => {
  const userId = req.user ? req.user.id : null;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const category = req.query.category;
  const search = req.query.search;
  const isPublic = req.query.is_public === 'true';

  // Try to get from cache first
  const cacheKey = `templates:${page}:${limit}:${category || 'all'}:${search || 'all'}:${isPublic}`;
  let templatesData = await cache.get(cacheKey);

  if (!templatesData) {
    // Build query conditions
    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (isPublic) {
      whereConditions.push('is_public = true');
    } else if (userId) {
      // Get public templates and user's private templates
      whereConditions.push('(is_public = true OR created_by = $1)');
      queryParams.push(userId);
      paramIndex++;
    } else {
      whereConditions.push('is_public = true');
    }

    if (category) {
      whereConditions.push(`category = $${paramIndex++}`);
      queryParams.push(category);
    }

    if (search) {
      whereConditions.push(`(name ILIKE $${paramIndex++} OR description ILIKE $${paramIndex++})`);
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    // Get templates
    const templatesQuery = `
      SELECT 
        id, name, description, category, thumbnail_url, is_public, 
        created_by, usage_count, created_at, updated_at,
        u.name as creator_name
      FROM templates t
      LEFT JOIN users u ON t.created_by = u.id
      ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''}
      ORDER BY usage_count DESC, created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    
    queryParams.push(limit, offset);

    const result = await dbQuery(templatesQuery, queryParams);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM templates t
      ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''}
    `;
    
    const countResult = await dbQuery(countQuery, queryParams.slice(0, -2));
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    templatesData = {
      templates: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, templatesData, 300);
  }

  res.json({
    status: 'success',
    data: templatesData
  });
}));

// Get a specific template
router.get('/:id', catchAsync(async (req, res) => {
  const templateId = req.params.id;
  const userId = req.user ? req.user.id : null;

  // Try to get from cache first
  const cacheKey = `template:${templateId}:${userId || 'anonymous'}`;
  let template = await cache.get(cacheKey);

  if (!template) {
    // Get template with creator info
    const result = await dbQuery(`
      SELECT 
        t.id, t.name, t.description, t.category, t.thumbnail_url, 
        t.template_data, t.is_public, t.created_by, t.usage_count, 
        t.created_at, t.updated_at,
        u.name as creator_name
      FROM templates t
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.id = $1 AND (t.is_public = true OR t.created_by = $2)
    `, [templateId, userId]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Template');
    }

    template = result.rows[0];
    
    // Cache for 10 minutes
    await cache.set(cacheKey, template, 600);
  }

  res.json({
    status: 'success',
    data: {
      template
    }
  });
}));

// Create a new template
router.post('/', templateCreateRateLimit, createTemplateValidation, catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const userId = req.user.id;
  const { name, description, category, template_data, is_public } = req.body;

  // Create template
  const result = await dbQuery(`
    INSERT INTO templates (name, description, category, template_data, is_public, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, name, description, category, thumbnail_url, is_public, created_by, usage_count, created_at, updated_at
  `, [name, description, category, template_data, is_public || false, userId]);

  const template = result.rows[0];

  // Log template creation
  logger.logUserActivity(userId, 'template_created', {
    templateId: template.id,
    name: template.name,
    isPublic: template.is_public,
    ip: req.ip
  });

  // Clear templates cache
  await cache.del('templates:*');

  res.status(201).json({
    status: 'success',
    message: 'Template created successfully',
    data: {
      template
    }
  });
}));

// Update a template
router.put('/:id', updateTemplateValidation, catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const templateId = req.params.id;
  const userId = req.user.id;
  const { name, description, category, template_data, is_public } = req.body;

  // Check if user owns the template
  const templateResult = await dbQuery(
    'SELECT created_by FROM templates WHERE id = $1',
    [templateId]
  );

  if (templateResult.rows.length === 0) {
    throw new NotFoundError('Template');
  }

  const template = templateResult.rows[0];

  if (template.created_by !== userId) {
    throw new ForbiddenError('You can only edit your own templates');
  }

  // Update template
  const updateFields = [];
  const updateValues = [];
  let paramIndex = 1;

  if (name !== undefined) {
    updateFields.push(`name = $${paramIndex++}`);
    updateValues.push(name);
  }

  if (description !== undefined) {
    updateFields.push(`description = $${paramIndex++}`);
    updateValues.push(description);
  }

  if (category !== undefined) {
    updateFields.push(`category = $${paramIndex++}`);
    updateValues.push(category);
  }

  if (template_data !== undefined) {
    updateFields.push(`template_data = $${paramIndex++}`);
    updateValues.push(template_data);
  }

  if (is_public !== undefined) {
    updateFields.push(`is_public = $${paramIndex++}`);
    updateValues.push(is_public);
  }

  if (updateFields.length === 0) {
    throw new ValidationError('No fields to update');
  }

  updateValues.push(templateId);

  const result = await dbQuery(`
    UPDATE templates 
    SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = $${paramIndex}
    RETURNING id, name, description, category, thumbnail_url, is_public, created_by, usage_count, updated_at
  `, updateValues);

  const updatedTemplate = result.rows[0];

  // Clear cache
  await cache.del(`template:${templateId}:*`);
  await cache.del('templates:*');

  // Log template update
  logger.logUserActivity(userId, 'template_updated', {
    templateId,
    fields: Object.keys(req.body),
    ip: req.ip
  });

  res.json({
    status: 'success',
    message: 'Template updated successfully',
    data: {
      template: updatedTemplate
    }
  });
}));

// Delete a template
router.delete('/:id', catchAsync(async (req, res) => {
  const templateId = req.params.id;
  const userId = req.user.id;

  // Check if user owns the template
  const templateResult = await dbQuery(
    'SELECT created_by FROM templates WHERE id = $1',
    [templateId]
  );

  if (templateResult.rows.length === 0) {
    throw new NotFoundError('Template');
  }

  const template = templateResult.rows[0];

  if (template.created_by !== userId) {
    throw new ForbiddenError('You can only delete your own templates');
  }

  // Delete template
  await dbQuery('DELETE FROM templates WHERE id = $1', [templateId]);

  // Clear cache
  await cache.del(`template:${templateId}:*`);
  await cache.del('templates:*');

  // Log template deletion
  logger.logUserActivity(userId, 'template_deleted', {
    templateId,
    ip: req.ip
  });

  res.json({
    status: 'success',
    message: 'Template deleted successfully'
  });
}));

// Use a template (increment usage count)
router.post('/:id/use', catchAsync(async (req, res) => {
  const templateId = req.params.id;
  const userId = req.user.id;

  // Check if template exists and is accessible
  const templateResult = await dbQuery(
    'SELECT id, name, is_public FROM templates WHERE id = $1 AND (is_public = true OR created_by = $2)',
    [templateId, userId]
  );

  if (templateResult.rows.length === 0) {
    throw new NotFoundError('Template');
  }

  const template = templateResult.rows[0];

  // Increment usage count
  await dbQuery(
    'UPDATE templates SET usage_count = usage_count + 1 WHERE id = $1',
    [templateId]
  );

  // Log template usage
  logger.logUserActivity(userId, 'template_used', {
    templateId,
    templateName: template.name,
    ip: req.ip
  });

  // Clear cache
  await cache.del(`template:${templateId}:*`);

  res.json({
    status: 'success',
    message: 'Template usage recorded successfully'
  });
}));

// Get template categories
router.get('/categories/list', catchAsync(async (req, res) => {
  // Try to get from cache first
  const cacheKey = 'template_categories';
  let categories = await cache.get(cacheKey);

  if (!categories) {
    // Get all unique categories
    const result = await dbQuery(`
      SELECT category, COUNT(*) as count
      FROM templates
      WHERE category IS NOT NULL AND is_public = true
      GROUP BY category
      ORDER BY count DESC, category ASC
    `);

    categories = result.rows;
    
    // Cache for 1 hour
    await cache.set(cacheKey, categories, 3600);
  }

  res.json({
    status: 'success',
    data: {
      categories
    }
  });
}));

// Get popular templates
router.get('/popular/list', catchAsync(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  // Try to get from cache first
  const cacheKey = `popular_templates:${limit}`;
  let popularTemplates = await cache.get(cacheKey);

  if (!popularTemplates) {
    // Get most used templates
    const result = await dbQuery(`
      SELECT 
        id, name, description, category, thumbnail_url, usage_count, created_by,
        u.name as creator_name
      FROM templates t
      LEFT JOIN users u ON t.created_by = u.id
      WHERE is_public = true
      ORDER BY usage_count DESC, created_at DESC
      LIMIT $1
    `, [limit]);

    popularTemplates = result.rows;
    
    // Cache for 30 minutes
    await cache.set(cacheKey, popularTemplates, 1800);
  }

  res.json({
    status: 'success',
    data: {
      templates: popularTemplates
    }
  });
}));

// Get user's templates
router.get('/user/:userId', catchAsync(async (req, res) => {
  const targetUserId = req.params.userId;
  const currentUserId = req.user ? req.user.id : null;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  // Build query conditions
  let whereConditions = ['created_by = $1'];
  let queryParams = [targetUserId];
  let paramIndex = 2;

  // If not the owner, only show public templates
  if (currentUserId !== targetUserId) {
    whereConditions.push('is_public = true');
  }

  // Get templates
  const result = await dbQuery(`
    SELECT 
      id, name, description, category, thumbnail_url, is_public, 
      usage_count, created_at, updated_at
    FROM templates
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `, [...queryParams, limit, offset]);

  // Get total count for pagination
  const countResult = await dbQuery(`
    SELECT COUNT(*) as total
    FROM templates
    WHERE ${whereConditions.join(' AND ')}
  `, queryParams);

  const total = parseInt(countResult.rows[0].total);
  const totalPages = Math.ceil(total / limit);

  res.json({
    status: 'success',
    data: {
      templates: result.rows,
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
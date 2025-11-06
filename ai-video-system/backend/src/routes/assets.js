const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const { query: dbQuery, transaction } = require('../database/connection');
const { catchAsync, ValidationError, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');
const { createRateLimit, requireProjectAccess } = require('../middleware/auth');
const { cache } = require('../services/redis');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Rate limiting for asset uploads
const assetUploadRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // limit each user to 50 uploads per hour
  message: 'Too many asset uploads, please try again later.'
});

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 5 // Max 5 files at once
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/avi', 'video/mov', 'video/wmv',
      'audio/mp3', 'audio/wav', 'audio/ogg',
      'text/plain', 'application/json',
      'model/gltf+json', 'model/gltf-binary'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

// Validation rules
const updateAssetValidation = [
  body('name').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Name must be between 1 and 255 characters'),
  body('metadata').optional().isObject().withMessage('Metadata must be an object')
];

// Helper function to determine asset type from mimetype
const getAssetType = (mimetype) => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.startsWith('text/') || mimetype === 'application/json') return 'text';
  if (mimetype.startsWith('model/')) return 'model';
  return 'other';
};

// Helper function to get file dimensions
const getFileDimensions = async (file) => {
  const sharp = require('sharp');
  const ffmpeg = require('fluent-ffmpeg');

  return new Promise((resolve) => {
    if (file.mimetype.startsWith('image/')) {
      // For images, use sharp
      sharp(file.buffer)
        .metadata()
        .then(metadata => {
          resolve({ width: metadata.width, height: metadata.height });
        })
        .catch(() => resolve(null));
    } else if (file.mimetype.startsWith('video/')) {
      // For videos, use ffmpeg
      ffmpeg.ffprobe(file.buffer, (err, metadata) => {
        if (err) {
          resolve(null);
        } else {
          const videoStream = metadata.streams.find(s => s.codec_type === 'video');
          if (videoStream) {
            resolve({ width: videoStream.width, height: videoStream.height });
          } else {
            resolve(null);
          }
        }
      });
    } else {
      resolve(null);
    }
  });
};

// Helper function to get file duration
const getFileDuration = async (file) => {
  const ffmpeg = require('fluent-ffmpeg');

  return new Promise((resolve) => {
    if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')) {
      ffmpeg.ffprobe(file.buffer, (err, metadata) => {
        if (err) {
          resolve(null);
        } else {
          resolve(metadata.format.duration);
        }
      });
    } else {
      resolve(null);
    }
  });
};

// Upload assets to a project
router.post('/upload/:projectId', requireProjectAccess, assetUploadRateLimit, upload.array('files', 5), catchAsync(async (req, res) => {
  const projectId = req.params.projectId;
  const userId = req.user.id;

  // Check if user has permission to upload
  if (req.projectAccess.role === 'viewer') {
    throw new ForbiddenError('You do not have permission to upload assets to this project');
  }

  if (!req.files || req.files.length === 0) {
    throw new ValidationError('No files provided');
  }

  const uploadedAssets = [];

  // Process each file
  for (const file of req.files) {
    try {
      const assetType = getAssetType(file.mimetype);
      const dimensions = await getFileDimensions(file);
      const duration = await getFileDuration(file);

      // Generate unique filename
      const fileExtension = path.extname(file.originalname);
      const fileName = `${uuidv4()}${fileExtension}`;
      const filePath = `assets/${userId}/${projectId}/${fileName}`;

      // In a real implementation, you would upload to S3 or similar
      // For now, we'll simulate the upload and store the URL
      const assetUrl = `${process.env.BASE_URL || 'http://localhost:3001'}/uploads/${filePath}`;

      // Save file to local storage (for development)
      const uploadDir = path.join(__dirname, '../../uploads', userId.toString(), projectId.toString());
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      fs.writeFileSync(path.join(uploadDir, fileName), file.buffer);

      // Create asset record
      const result = await dbQuery(`
        INSERT INTO assets (user_id, project_id, type, name, url, file_size, dimensions, duration, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, type, name, url, file_size, dimensions, duration, metadata, created_at
      `, [
        userId,
        projectId,
        assetType,
        file.originalname,
        assetUrl,
        file.size,
        dimensions ? JSON.stringify(dimensions) : null,
        duration,
        JSON.stringify({
          originalName: file.originalname,
          mimetype: file.mimetype,
          encoding: file.encoding
        })
      ]);

      uploadedAssets.push(result.rows[0]);

      // Log asset upload
      logger.logUserActivity(userId, 'asset_uploaded', {
        projectId,
        assetId: result.rows[0].id,
        fileName: file.originalname,
        fileSize: file.size,
        ip: req.ip
      });

    } catch (error) {
      logger.error('Failed to process uploaded file:', error);
      // Continue processing other files even if one fails
    }
  }

  // Clear project assets cache
  await cache.del(`project_assets:${projectId}:${userId}`);

  res.status(201).json({
    status: 'success',
    message: `${uploadedAssets.length} assets uploaded successfully`,
    data: {
      assets: uploadedAssets
    }
  });
}));

// Get all assets for a user (with optional filtering)
router.get('/', catchAsync(async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const type = req.query.type;
  const projectId = req.query.project_id;
  const search = req.query.search;

  // Build query conditions
  let whereConditions = ['a.user_id = $1'];
  let queryParams = [userId];
  let paramIndex = 2;

  if (type) {
    whereConditions.push(`a.type = $${paramIndex++}`);
    queryParams.push(type);
  }

  if (projectId) {
    whereConditions.push(`a.project_id = $${paramIndex++}`);
    queryParams.push(projectId);
  }

  if (search) {
    whereConditions.push(`a.name ILIKE $${paramIndex++}`);
    queryParams.push(`%${search}%`);
  }

  // Get assets with project info
  const result = await dbQuery(`
    SELECT 
      a.id, a.type, a.name, a.url, a.file_size, a.dimensions, a.duration, 
      a.metadata, a.created_at, a.project_id,
      p.title as project_title
    FROM assets a
    LEFT JOIN projects p ON a.project_id = p.id
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY a.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `, [...queryParams, limit, offset]);

  // Get total count for pagination
  const countResult = await dbQuery(`
    SELECT COUNT(*) as total
    FROM assets a
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

// Get a specific asset
router.get('/:id', catchAsync(async (req, res) => {
  const assetId = req.params.id;
  const userId = req.user.id;

  // Get asset with project info
  const result = await dbQuery(`
    SELECT 
      a.id, a.type, a.name, a.url, a.file_size, a.dimensions, a.duration, 
      a.metadata, a.created_at, a.project_id, a.user_id,
      p.title as project_title,
      c.role as user_role
    FROM assets a
    LEFT JOIN projects p ON a.project_id = p.id
    LEFT JOIN collaborations c ON a.project_id = c.project_id AND c.user_id = $1
    WHERE a.id = $2 AND (a.user_id = $1 OR c.user_id IS NOT NULL)
  `, [userId, assetId]);

  if (result.rows.length === 0) {
    throw new NotFoundError('Asset');
  }

  const asset = result.rows[0];

  res.json({
    status: 'success',
    data: {
      asset
    }
  });
}));

// Update asset metadata
router.put('/:id', updateAssetValidation, catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const assetId = req.params.id;
  const userId = req.user.id;
  const { name, metadata } = req.body;

  // Check if user owns the asset
  const assetResult = await dbQuery(
    'SELECT user_id, project_id FROM assets WHERE id = $1',
    [assetId]
  );

  if (assetResult.rows.length === 0) {
    throw new NotFoundError('Asset');
  }

  const asset = assetResult.rows[0];

  if (asset.user_id !== userId) {
    throw new ForbiddenError('You can only edit your own assets');
  }

  // Update asset
  const updateFields = [];
  const updateValues = [];
  let paramIndex = 1;

  if (name !== undefined) {
    updateFields.push(`name = $${paramIndex++}`);
    updateValues.push(name);
  }

  if (metadata !== undefined) {
    updateFields.push(`metadata = $${paramIndex++}`);
    updateValues.push(metadata);
  }

  if (updateFields.length === 0) {
    throw new ValidationError('No fields to update');
  }

  updateValues.push(assetId);

  const result = await dbQuery(`
    UPDATE assets 
    SET ${updateFields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, type, name, url, file_size, dimensions, duration, metadata
  `, updateValues);

  const updatedAsset = result.rows[0];

  // Clear cache
  await cache.del(`asset:${assetId}:${userId}`);

  // Log asset update
  logger.logUserActivity(userId, 'asset_updated', {
    assetId,
    projectId: asset.project_id,
    fields: Object.keys(req.body),
    ip: req.ip
  });

  res.json({
    status: 'success',
    message: 'Asset updated successfully',
    data: {
      asset: updatedAsset
    }
  });
}));

// Delete an asset
router.delete('/:id', catchAsync(async (req, res) => {
  const assetId = req.params.id;
  const userId = req.user.id;

  // Check if user owns the asset
  const assetResult = await dbQuery(
    'SELECT user_id, project_id, url FROM assets WHERE id = $1',
    [assetId]
  );

  if (assetResult.rows.length === 0) {
    throw new NotFoundError('Asset');
  }

  const asset = assetResult.rows[0];

  if (asset.user_id !== userId) {
    throw new ForbiddenError('You can only delete your own assets');
  }

  // Delete asset from database
  await dbQuery('DELETE FROM assets WHERE id = $1', [assetId]);

  // Delete file from storage (in a real implementation, you'd delete from S3)
  try {
    const urlParts = asset.url.split('/');
    const fileName = urlParts[urlParts.length - 1];
    const filePath = path.join(__dirname, '../../uploads', userId.toString(), asset.project_id.toString(), fileName);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    logger.error('Failed to delete asset file:', error);
    // Continue even if file deletion fails
  }

  // Clear cache
  await cache.del(`asset:${assetId}:${userId}`);

  // Log asset deletion
  logger.logUserActivity(userId, 'asset_deleted', {
    assetId,
    projectId: asset.project_id,
    ip: req.ip
  });

  res.json({
    status: 'success',
    message: 'Asset deleted successfully'
  });
}));

// Move asset to another project
router.post('/:id/move', catchAsync(async (req, res) => {
  const assetId = req.params.id;
  const userId = req.user.id;
  const { targetProjectId } = req.body;

  if (!targetProjectId) {
    throw new ValidationError('Target project ID is required');
  }

  // Check if user owns the asset
  const assetResult = await dbQuery(
    'SELECT user_id, project_id FROM assets WHERE id = $1',
    [assetId]
  );

  if (assetResult.rows.length === 0) {
    throw new NotFoundError('Asset');
  }

  const asset = assetResult.rows[0];

  if (asset.user_id !== userId) {
    throw new ForbiddenError('You can only move your own assets');
  }

  // Check if user has access to target project
  const projectResult = await dbQuery(`
    SELECT p.id, p.user_id as owner_id, c.role
    FROM projects p
    LEFT JOIN collaborations c ON p.id = c.project_id AND c.user_id = $1
    WHERE p.id = $2
  `, [userId, targetProjectId]);

  if (projectResult.rows.length === 0) {
    throw new NotFoundError('Target project');
  }

  const project = projectResult.rows[0];
  const isOwner = project.owner_id === userId;
  const isCollaborator = project.role !== null;

  if (!isOwner && !isCollaborator) {
    throw new ForbiddenError('You do not have access to the target project');
  }

  // Move asset
  const result = await dbQuery(`
    UPDATE assets 
    SET project_id = $1
    WHERE id = $2
    RETURNING id, type, name, url, project_id
  `, [targetProjectId, assetId]);

  const movedAsset = result.rows[0];

  // Clear cache
  await cache.del(`asset:${assetId}:${userId}`);
  await cache.del(`project_assets:${asset.project_id}:${userId}`);
  await cache.del(`project_assets:${targetProjectId}:${userId}`);

  // Log asset move
  logger.logUserActivity(userId, 'asset_moved', {
    assetId,
    fromProjectId: asset.project_id,
    toProjectId: targetProjectId,
    ip: req.ip
  });

  res.json({
    status: 'success',
    message: 'Asset moved successfully',
    data: {
      asset: movedAsset
    }
  });
}));

module.exports = router;
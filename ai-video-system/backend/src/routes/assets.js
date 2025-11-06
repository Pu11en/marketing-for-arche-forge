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

// Import upload and processing services
const uploadService = require('../services/upload');
const assetProcessingService = require('../services/assetProcessing');

const router = express.Router();

// Rate limiting for asset uploads
const assetUploadRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // limit each user to 50 uploads per hour
  message: 'Too many asset uploads, please try again later.'
});

// Configure multer for file uploads (memory storage for validation)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB limit
    files: 5 // Max 5 files at once
  },
  fileFilter: (req, file, cb) => {
    // Use upload service to validate file
    const validation = uploadService.validateFile({
      mimetype: file.mimetype,
      size: req.headers['content-length'] || 0
    });
    
    if (validation.valid) {
      cb(null, true);
    } else {
      cb(new Error(validation.error), false);
    }
  }
});

// Validation rules
const updateAssetValidation = [
  body('name').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Name must be between 1 and 255 characters'),
  body('metadata').optional().isObject().withMessage('Metadata must be an object')
];

// Helper function to determine asset type from mimetype (using upload service)
const getAssetType = (mimetype) => {
  return uploadService.getAssetTypeFromMimeType(mimetype);
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
      // Validate file
      const validation = uploadService.validateFile({
        mimetype: file.mimetype,
        size: file.size
      });
      
      if (!validation.valid) {
        throw new ValidationError(validation.error);
      }
      
      const assetType = validation.assetType;
      
      // Scan file for malware
      const isSafe = await uploadService.scanFileForMalware(file.buffer, file.mimetype);
      if (!isSafe) {
        throw new ValidationError('File failed security scan');
      }

      // Generate unique S3 key
      const fileExtension = path.extname(file.originalname);
      const s3Key = uploadService.generateFileKey(userId, projectId, file.originalname, assetType);

      // Upload to S3
      const uploadResult = await uploadService.uploadBufferToS3(file.buffer, s3Key, file.mimetype);
      
      // Generate download URL
      const downloadUrl = await uploadService.generatePresignedDownloadUrl(s3Key, 86400 * 30); // 30 days

      // Get file dimensions and duration
      let dimensions = null;
      let duration = null;
      
      if (assetType === 'image') {
        dimensions = await uploadService.getImageDimensions(file.buffer);
      } else if (assetType === 'video') {
        dimensions = await uploadService.getVideoDimensions(file.buffer);
        duration = await uploadService.getVideoDuration(file.buffer);
      } else if (assetType === 'audio') {
        duration = await uploadService.getVideoDuration(file.buffer);
      }

      // Calculate file hash
      const fileHash = uploadService.calculateFileHash(file.buffer);

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
        downloadUrl,
        file.size,
        dimensions ? JSON.stringify(dimensions) : null,
        duration,
        JSON.stringify({
          originalName: file.originalname,
          mimetype: file.mimetype,
          encoding: file.encoding,
          s3Key,
          fileHash,
          uploadResult
        })
      ]);

      uploadedAssets.push(result.rows[0]);

      // Queue asset for processing (thumbnails, metadata extraction, etc.)
      assetProcessingService.queueAssetForProcessing(result.rows[0].id, s3Key, assetType);

      // Log asset upload
      logger.logUserActivity(userId, 'asset_uploaded', {
        projectId,
        assetId: result.rows[0].id,
        fileName: file.originalname,
        fileSize: file.size,
        assetType,
        s3Key,
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

  // Delete file from S3
  try {
    const metadata = asset.metadata || {};
    const s3Key = metadata.s3Key;
    
    if (s3Key) {
      await uploadService.deleteFileFromS3(s3Key);
      
      // Also delete associated thumbnails and formats
      if (metadata.thumbnails) {
        for (const thumbnail of metadata.thumbnails) {
          if (thumbnail.key) {
            await uploadService.deleteFileFromS3(thumbnail.key);
          }
        }
      }
      
      if (metadata.formats) {
        for (const format of metadata.formats) {
          if (format.key) {
            await uploadService.deleteFileFromS3(format.key);
          }
        }
      }
    }
  } catch (error) {
    logger.error('Failed to delete asset file from S3:', error);
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

// Generate presigned upload URL for direct browser upload
router.post('/presigned-url/:projectId', requireProjectAccess, catchAsync(async (req, res) => {
  const projectId = req.params.projectId;
  const userId = req.user.id;
  const { fileName, fileSize, mimeType } = req.body;

  // Check if user has permission to upload
  if (req.projectAccess.role === 'viewer') {
    throw new ForbiddenError('You do not have permission to upload assets to this project');
  }

  // Validate input
  if (!fileName || !mimeType) {
    throw new ValidationError('File name and MIME type are required');
  }

  // Validate file
  const validation = uploadService.validateFile({
    mimetype: mimeType,
    size: fileSize || 0
  });
  
  if (!validation.valid) {
    throw new ValidationError(validation.error);
  }

  const assetType = validation.assetType;

  // Generate unique S3 key
  const s3Key = uploadService.generateFileKey(userId, projectId, fileName, assetType);

  // Generate presigned upload URL
  const uploadUrl = await uploadService.generatePresignedUploadUrl(s3Key, mimeType, 3600); // 1 hour

  // Generate download URL for after upload
  const downloadUrl = await uploadService.generatePresignedDownloadUrl(s3Key, 86400 * 30); // 30 days

  res.json({
    status: 'success',
    data: {
      uploadUrl,
      downloadUrl,
      s3Key,
      assetType,
      expiresIn: 3600
    }
  });
}));

// Initiate multipart upload for large files
router.post('/multipart-upload/initiate/:projectId', requireProjectAccess, catchAsync(async (req, res) => {
  const projectId = req.params.projectId;
  const userId = req.user.id;
  const { fileName, fileSize, mimeType } = req.body;

  // Check if user has permission to upload
  if (req.projectAccess.role === 'viewer') {
    throw new ForbiddenError('You do not have permission to upload assets to this project');
  }

  // Validate input
  if (!fileName || !mimeType || !fileSize) {
    throw new ValidationError('File name, MIME type, and file size are required');
  }

  // Validate file
  const validation = uploadService.validateFile({
    mimetype: mimeType,
    size: fileSize
  });
  
  if (!validation.valid) {
    throw new ValidationError(validation.error);
  }

  const assetType = validation.assetType;

  // Generate unique S3 key
  const s3Key = uploadService.generateFileKey(userId, projectId, fileName, assetType);

  // Initiate multipart upload
  const multipartUpload = await uploadService.initiateMultipartUpload(s3Key, mimeType);

  res.json({
    status: 'success',
    data: {
      uploadId: multipartUpload.UploadId,
      s3Key,
      assetType
    }
  });
}));

// Get presigned URL for multipart upload part
router.post('/multipart-upload/part-url', requireProjectAccess, catchAsync(async (req, res) => {
  const { s3Key, uploadId, partNumber } = req.body;

  // Validate input
  if (!s3Key || !uploadId || !partNumber) {
    throw new ValidationError('S3 key, upload ID, and part number are required');
  }

  // Generate presigned URL for part
  const partUrl = await uploadService.generatePresignedMultipartUrl(s3Key, uploadId, partNumber);

  res.json({
    status: 'success',
    data: {
      partUrl,
      partNumber,
      expiresIn: 3600
    }
  });
}));

// Complete multipart upload
router.post('/multipart-upload/complete', requireProjectAccess, catchAsync(async (req, res) => {
  const { s3Key, uploadId, parts, projectId, fileName, mimeType, fileSize } = req.body;
  const userId = req.user.id;

  // Validate input
  if (!s3Key || !uploadId || !parts || !projectId) {
    throw new ValidationError('S3 key, upload ID, parts, and project ID are required');
  }

  // Complete multipart upload
  const uploadResult = await uploadService.completeMultipartUpload(s3Key, uploadId, parts);

  // Generate download URL
  const downloadUrl = await uploadService.generatePresignedDownloadUrl(s3Key, 86400 * 30); // 30 days

  // Get file metadata
  const metadata = await uploadService.getFileMetadata(s3Key);

  // Get asset type
  const assetType = uploadService.getAssetTypeFromMimeType(mimeType);

  // Get file dimensions and duration (will be processed asynchronously)
  let dimensions = null;
  let duration = null;

  // Create asset record
  const result = await dbQuery(`
    INSERT INTO assets (user_id, project_id, type, name, url, file_size, dimensions, duration, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, type, name, url, file_size, dimensions, duration, metadata, created_at
  `, [
    userId,
    projectId,
    assetType,
    fileName,
    downloadUrl,
    fileSize,
    dimensions ? JSON.stringify(dimensions) : null,
    duration,
    JSON.stringify({
      originalName: fileName,
      mimetype: mimeType,
      s3Key,
      uploadResult,
      metadata
    })
  ]);

  // Queue asset for processing (thumbnails, metadata extraction, etc.)
  assetProcessingService.queueAssetForProcessing(result.rows[0].id, s3Key, assetType);

  // Log asset upload
  logger.logUserActivity(userId, 'asset_uploaded_multipart', {
    projectId,
    assetId: result.rows[0].id,
    fileName,
    fileSize,
    assetType,
    s3Key,
    partsCount: parts.length,
    ip: req.ip
  });

  // Clear project assets cache
  await cache.del(`project_assets:${projectId}:${userId}`);

  res.json({
    status: 'success',
    message: 'Multipart upload completed successfully',
    data: {
      asset: result.rows[0],
      downloadUrl
    }
  });
}));

// Abort multipart upload
router.post('/multipart-upload/abort', requireProjectAccess, catchAsync(async (req, res) => {
  const { s3Key, uploadId } = req.body;

  // Validate input
  if (!s3Key || !uploadId) {
    throw new ValidationError('S3 key and upload ID are required');
  }

  // Abort multipart upload
  await uploadService.abortMultipartUpload(s3Key, uploadId);

  res.json({
    status: 'success',
    message: 'Multipart upload aborted successfully'
  });
}));

// Get asset processing status
router.get('/:id/processing-status', catchAsync(async (req, res) => {
  const assetId = req.params.id;
  const userId = req.user.id;

  // Check if user has access to the asset
  const assetResult = await dbQuery(`
    SELECT a.id, a.metadata, a.user_id, p.id as project_id
    FROM assets a
    LEFT JOIN projects p ON a.project_id = p.id
    LEFT JOIN collaborations c ON p.id = c.project_id AND c.user_id = $1
    WHERE a.id = $2 AND (a.user_id = $1 OR c.user_id IS NOT NULL)
  `, [userId, assetId]);

  if (assetResult.rows.length === 0) {
    throw new NotFoundError('Asset');
  }

  const asset = assetResult.rows[0];
  const metadata = asset.metadata || {};

  // Check processing status
  const processingStatus = {
    isProcessed: !!(metadata.thumbnails || metadata.formats || metadata.waveformData),
    hasThumbnails: !!(metadata.thumbnails && metadata.thumbnails.length > 0),
    hasFormats: !!(metadata.formats && metadata.formats.length > 0),
    hasWaveform: !!metadata.waveformData,
    processingComplete: !!(metadata.thumbnails || metadata.formats || metadata.waveformData)
  };

  res.json({
    status: 'success',
    data: {
      assetId,
      processingStatus,
      metadata
    }
  });
}));

// Generate new download URL for an asset
router.post('/:id/download-url', catchAsync(async (req, res) => {
  const assetId = req.params.id;
  const userId = req.user.id;
  const { expiresIn = 3600 } = req.body;

  // Check if user has access to the asset
  const assetResult = await dbQuery(`
    SELECT a.id, a.metadata, a.user_id, p.id as project_id
    FROM assets a
    LEFT JOIN projects p ON a.project_id = p.id
    LEFT JOIN collaborations c ON p.id = c.project_id AND c.user_id = $1
    WHERE a.id = $2 AND (a.user_id = $1 OR c.user_id IS NOT NULL)
  `, [userId, assetId]);

  if (assetResult.rows.length === 0) {
    throw new NotFoundError('Asset');
  }

  const asset = assetResult.rows[0];
  const metadata = asset.metadata || {};
  const s3Key = metadata.s3Key;

  if (!s3Key) {
    throw new ValidationError('Asset does not have a valid S3 key');
  }

  // Generate new download URL
  const downloadUrl = await uploadService.generatePresignedDownloadUrl(s3Key, expiresIn);

  res.json({
    status: 'success',
    data: {
      downloadUrl,
      expiresIn
    }
  });
}));

module.exports = router;
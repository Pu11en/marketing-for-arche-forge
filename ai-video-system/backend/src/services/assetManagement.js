const { query: dbQuery } = require('../database/connection');
const { cache } = require('./redis');
const logger = require('../utils/logger');
const uploadService = require('./upload');
const { v4: uuidv4 } = require('uuid');

/**
 * Create a new version of an asset
 * @param {string} assetId - Original asset ID
 * @param {string} userId - User ID
 * @param {Object} versionData - Version data
 * @returns {Object} New asset version
 */
const createAssetVersion = async (assetId, userId, versionData) => {
  try {
    // Get original asset
    const originalAssetResult = await dbQuery(
      'SELECT * FROM assets WHERE id = $1 AND user_id = $2',
      [assetId, userId]
    );

    if (originalAssetResult.rows.length === 0) {
      throw new Error('Asset not found or access denied');
    }

    const originalAsset = originalAssetResult.rows[0];
    const metadata = originalAsset.metadata || {};

    // Copy file in S3 to create version
    const originalS3Key = metadata.s3Key;
    if (!originalS3Key) {
      throw new Error('Original asset does not have S3 key');
    }

    const versionS3Key = generateVersionKey(originalS3Key, versionData.version);
    await uploadService.copyFileInS3(originalS3Key, versionS3Key);

    // Create new asset record for version
    const versionMetadata = {
      ...metadata,
      ...versionData,
      originalAssetId,
      version: versionData.version,
      versionNotes: versionData.notes,
      createdAt: new Date().toISOString()
    };

    const newAssetResult = await dbQuery(`
      INSERT INTO assets (user_id, project_id, type, name, url, file_size, dimensions, duration, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      userId,
      originalAsset.project_id,
      originalAsset.type,
      `${originalAsset.name} (v${versionData.version})`,
      await uploadService.generatePresignedDownloadUrl(versionS3Key, 86400 * 30),
      originalAsset.file_size,
      originalAsset.dimensions,
      originalAsset.duration,
      JSON.stringify(versionMetadata)
    ]);

    // Update original asset metadata to include version reference
    const updatedMetadata = {
      ...metadata,
      versions: [...(metadata.versions || []), {
        id: newAssetResult.rows[0].id,
        version: versionData.version,
        createdAt: new Date().toISOString(),
        notes: versionData.notes
      }]
    };

    await dbQuery(
      'UPDATE assets SET metadata = $1 WHERE id = $2',
      [JSON.stringify(updatedMetadata), assetId]
    );

    // Clear cache
    await cache.del(`asset:${assetId}:${userId}`);
    await cache.del(`asset:${newAssetResult.rows[0].id}:${userId}`);

    logger.logUserActivity(userId, 'asset_version_created', {
      originalAssetId: assetId,
      newAssetId: newAssetResult.rows[0].id,
      version: versionData.version
    });

    return newAssetResult.rows[0];
  } catch (error) {
    logger.error('Error creating asset version:', error);
    throw error;
  }
};

/**
 * Generate version key for S3
 * @param {string} originalKey - Original S3 key
 * @param {string} version - Version number
 * @returns {string} Version S3 key
 */
const generateVersionKey = (originalKey, version) => {
  const parts = originalKey.split('/');
  const filename = parts[parts.length - 1];
  const extension = filename.includes('.') ? filename.substring(filename.lastIndexOf('.')) : '';
  const basename = filename.includes('.') ? filename.substring(0, filename.lastIndexOf('.')) : filename;
  
  return `versions/${parts[1]}/${parts[2]}/${basename}_v${version}${extension}`;
};

/**
 * Get all versions of an asset
 * @param {string} assetId - Asset ID
 * @param {string} userId - User ID
 * @returns {Array} Array of asset versions
 */
const getAssetVersions = async (assetId, userId) => {
  try {
    // Check cache first
    const cacheKey = `asset_versions:${assetId}:${userId}`;
    const cachedVersions = await cache.get(cacheKey);
    if (cachedVersions) {
      return JSON.parse(cachedVersions);
    }

    // Get original asset
    const originalAssetResult = await dbQuery(
      'SELECT * FROM assets WHERE id = $1 AND user_id = $2',
      [assetId, userId]
    );

    if (originalAssetResult.rows.length === 0) {
      throw new Error('Asset not found or access denied');
    }

    const originalAsset = originalAssetResult.rows[0];
    const metadata = originalAsset.metadata || {};
    const versionIds = metadata.versions ? metadata.versions.map(v => v.id) : [];

    // Get all version assets
    let versions = [originalAsset];
    if (versionIds.length > 0) {
      const versionsResult = await dbQuery(
        `SELECT * FROM assets WHERE id = ANY($1) ORDER BY metadata->>'version' DESC`,
        [versionIds]
      );
      versions = [...versions, ...versionsResult.rows];
    }

    // Cache result
    await cache.setex(cacheKey, 3600, JSON.stringify(versions));

    return versions;
  } catch (error) {
    logger.error('Error getting asset versions:', error);
    throw error;
  }
};

/**
 * Share an asset with another user
 * @param {string} assetId - Asset ID
 * @param {string} userId - Current user ID
 * @param {string} targetUserId - Target user ID
 * @param {Object} shareOptions - Sharing options
 * @returns {Object} Share result
 */
const shareAsset = async (assetId, userId, targetUserId, shareOptions) => {
  try {
    // Check if user owns the asset
    const assetResult = await dbQuery(
      'SELECT * FROM assets WHERE id = $1 AND user_id = $2',
      [assetId, userId]
    );

    if (assetResult.rows.length === 0) {
      throw new Error('Asset not found or access denied');
    }

    const asset = assetResult.rows[0];
    const metadata = asset.metadata || {};

    // Create share token
    const shareToken = uuidv4();
    const shareData = {
      assetId,
      sharedBy: userId,
      sharedWith: targetUserId,
      permissions: shareOptions.permissions || ['view'],
      expiresAt: shareOptions.expiresAt || null,
      createdAt: new Date().toISOString(),
      token: shareToken
    };

    // Update asset metadata with share information
    const updatedMetadata = {
      ...metadata,
      shares: [...(metadata.shares || []), shareData]
    };

    await dbQuery(
      'UPDATE assets SET metadata = $1 WHERE id = $2',
      [JSON.stringify(updatedMetadata), assetId]
    );

    // Clear cache
    await cache.del(`asset:${assetId}:${userId}`);

    logger.logUserActivity(userId, 'asset_shared', {
      assetId,
      targetUserId,
      shareToken,
      permissions: shareOptions.permissions
    });

    return {
      shareToken,
      expiresAt: shareOptions.expiresAt,
      permissions: shareOptions.permissions
    };
  } catch (error) {
    logger.error('Error sharing asset:', error);
    throw error;
  }
};

/**
 * Get shared assets for a user
 * @param {string} userId - User ID
 * @returns {Array} Array of shared assets
 */
const getSharedAssets = async (userId) => {
  try {
    // Check cache first
    const cacheKey = `shared_assets:${userId}`;
    const cachedAssets = await cache.get(cacheKey);
    if (cachedAssets) {
      return JSON.parse(cachedAssets);
    }

    // Get assets shared with user
    const result = await dbQuery(`
      SELECT a.*, p.title as project_title
      FROM assets a
      LEFT JOIN projects p ON a.project_id = p.id
      WHERE a.metadata->'shares' @> '[{"sharedWith": "$1"}]'
      ORDER BY a.created_at DESC
    `, [userId]);

    // Filter shares to only include those shared with this user
    const sharedAssets = result.rows.map(asset => {
      const metadata = asset.metadata || {};
      const shares = metadata.shares || [];
      const userShares = shares.filter(share => share.sharedWith === userId);
      
      return {
        ...asset,
        shares: userShares
      };
    });

    // Cache result
    await cache.setex(cacheKey, 3600, JSON.stringify(sharedAssets));

    return sharedAssets;
  } catch (error) {
    logger.error('Error getting shared assets:', error);
    throw error;
  }
};

/**
 * Revoke asset sharing
 * @param {string} assetId - Asset ID
 * @param {string} userId - User ID
 * @param {string} shareToken - Share token to revoke
 * @returns {boolean} Success status
 */
const revokeAssetShare = async (assetId, userId, shareToken) => {
  try {
    // Check if user owns the asset
    const assetResult = await dbQuery(
      'SELECT * FROM assets WHERE id = $1 AND user_id = $2',
      [assetId, userId]
    );

    if (assetResult.rows.length === 0) {
      throw new Error('Asset not found or access denied');
    }

    const asset = assetResult.rows[0];
    const metadata = asset.metadata || {};
    const shares = metadata.shares || [];

    // Remove share with matching token
    const updatedShares = shares.filter(share => share.token !== shareToken);

    // Update asset metadata
    const updatedMetadata = {
      ...metadata,
      shares: updatedShares
    };

    await dbQuery(
      'UPDATE assets SET metadata = $1 WHERE id = $2',
      [JSON.stringify(updatedMetadata), assetId]
    );

    // Clear cache
    await cache.del(`asset:${assetId}:${userId}`);

    logger.logUserActivity(userId, 'asset_share_revoked', {
      assetId,
      shareToken
    });

    return true;
  } catch (error) {
    logger.error('Error revoking asset share:', error);
    throw error;
  }
};

/**
 * Search assets with advanced filtering
 * @param {string} userId - User ID
 * @param {Object} searchOptions - Search options
 * @returns {Object} Search results with pagination
 */
const searchAssets = async (userId, searchOptions) => {
  try {
    const {
      query,
      type,
      projectId,
      tags,
      dateFrom,
      dateTo,
      minSize,
      maxSize,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      page = 1,
      limit = 20
    } = searchOptions;

    const offset = (page - 1) * limit;

    // Build query conditions
    let whereConditions = ['a.user_id = $1'];
    let queryParams = [userId];
    let paramIndex = 2;

    if (query) {
      whereConditions.push(`(a.name ILIKE $${paramIndex++} OR a.metadata->>'originalName' ILIKE $${paramIndex++})`);
      queryParams.push(`%${query}%`, `%${query}%`);
    }

    if (type) {
      whereConditions.push(`a.type = $${paramIndex++}`);
      queryParams.push(type);
    }

    if (projectId) {
      whereConditions.push(`a.project_id = $${paramIndex++}`);
      queryParams.push(projectId);
    }

    if (tags && tags.length > 0) {
      whereConditions.push(`a.metadata->'tags' ?| $${paramIndex++}`);
      queryParams.push(tags);
    }

    if (dateFrom) {
      whereConditions.push(`a.created_at >= $${paramIndex++}`);
      queryParams.push(dateFrom);
    }

    if (dateTo) {
      whereConditions.push(`a.created_at <= $${paramIndex++}`);
      queryParams.push(dateTo);
    }

    if (minSize) {
      whereConditions.push(`a.file_size >= $${paramIndex++}`);
      queryParams.push(minSize);
    }

    if (maxSize) {
      whereConditions.push(`a.file_size <= $${paramIndex++}`);
      queryParams.push(maxSize);
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
      ORDER BY a.${sortBy} ${sortOrder}
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

    return {
      assets: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  } catch (error) {
    logger.error('Error searching assets:', error);
    throw error;
  }
};

/**
 * Get asset analytics
 * @param {string} userId - User ID
 * @param {Object} analyticsOptions - Analytics options
 * @returns {Object} Analytics data
 */
const getAssetAnalytics = async (userId, analyticsOptions) => {
  try {
    const {
      projectId,
      dateFrom,
      dateTo,
      groupBy = 'day'
    } = analyticsOptions;

    // Build query conditions
    let whereConditions = ['user_id = $1'];
    let queryParams = [userId];
    let paramIndex = 2;

    if (projectId) {
      whereConditions.push(`project_id = $${paramIndex++}`);
      queryParams.push(projectId);
    }

    if (dateFrom) {
      whereConditions.push(`created_at >= $${paramIndex++}`);
      queryParams.push(dateFrom);
    }

    if (dateTo) {
      whereConditions.push(`created_at <= $${paramIndex++}`);
      queryParams.push(dateTo);
    }

    // Get asset statistics
    const statsResult = await dbQuery(`
      SELECT 
        COUNT(*) as total_assets,
        SUM(file_size) as total_size,
        AVG(file_size) as avg_size,
        type,
        DATE_TRUNC('${groupBy}', created_at) as period
      FROM assets
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY type, DATE_TRUNC('${groupBy}', created_at)
      ORDER BY period DESC
    `, queryParams);

    // Get storage usage by type
    const storageResult = await dbQuery(`
      SELECT 
        type,
        COUNT(*) as count,
        SUM(file_size) as total_size
      FROM assets
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY type
    `, queryParams);

    // Get upload trends
    const trendsResult = await dbQuery(`
      SELECT 
        DATE_TRUNC('${groupBy}', created_at) as period,
        COUNT(*) as uploads,
        SUM(file_size) as upload_size
      FROM assets
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY DATE_TRUNC('${groupBy}', created_at)
      ORDER BY period DESC
      LIMIT 30
    `, queryParams);

    return {
      statistics: statsResult.rows,
      storageByType: storageResult.rows,
      uploadTrends: trendsResult.rows
    };
  } catch (error) {
    logger.error('Error getting asset analytics:', error);
    throw error;
  }
};

/**
 * Bulk delete assets
 * @param {string} userId - User ID
 * @param {Array} assetIds - Array of asset IDs
 * @returns {Object} Delete results
 */
const bulkDeleteAssets = async (userId, assetIds) => {
  try {
    const results = {
      successful: [],
      failed: []
    };

    // Get all assets to delete
    const assetsResult = await dbQuery(
      'SELECT * FROM assets WHERE id = ANY($1) AND user_id = $2',
      [assetIds, userId]
    );

    for (const asset of assetsResult.rows) {
      try {
        // Delete from S3
        const metadata = asset.metadata || {};
        const s3Key = metadata.s3Key;
        
        if (s3Key) {
          await uploadService.deleteFileFromS3(s3Key);
          
          // Delete associated thumbnails and formats
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

        // Delete from database
        await dbQuery('DELETE FROM assets WHERE id = $1', [asset.id]);

        results.successful.push(asset.id);

        // Clear cache
        await cache.del(`asset:${asset.id}:${userId}`);

        logger.logUserActivity(userId, 'asset_deleted_bulk', {
          assetId: asset.id,
          fileName: asset.name
        });
      } catch (error) {
        logger.error(`Failed to delete asset ${asset.id}:`, error);
        results.failed.push({
          id: asset.id,
          error: error.message
        });
      }
    }

    return results;
  } catch (error) {
    logger.error('Error in bulk delete assets:', error);
    throw error;
  }
};

/**
 * Bulk move assets to another project
 * @param {string} userId - User ID
 * @param {Array} assetIds - Array of asset IDs
 * @param {string} targetProjectId - Target project ID
 * @returns {Object} Move results
 */
const bulkMoveAssets = async (userId, assetIds, targetProjectId) => {
  try {
    const results = {
      successful: [],
      failed: []
    };

    // Check if user has access to target project
    const projectResult = await dbQuery(`
      SELECT p.id, p.user_id as owner_id, c.role
      FROM projects p
      LEFT JOIN collaborations c ON p.id = c.project_id AND c.user_id = $1
      WHERE p.id = $2
    `, [userId, targetProjectId]);

    if (projectResult.rows.length === 0) {
      throw new Error('Target project not found');
    }

    const project = projectResult.rows[0];
    const isOwner = project.owner_id === userId;
    const isCollaborator = project.role !== null;

    if (!isOwner && !isCollaborator) {
      throw new Error('You do not have access to the target project');
    }

    // Move assets
    for (const assetId of assetIds) {
      try {
        // Check if user owns the asset
        const assetResult = await dbQuery(
          'SELECT project_id FROM assets WHERE id = $1 AND user_id = $2',
          [assetId, userId]
        );

        if (assetResult.rows.length === 0) {
          results.failed.push({
            id: assetId,
            error: 'Asset not found or access denied'
          });
          continue;
        }

        const oldProjectId = assetResult.rows[0].project_id;

        // Move asset
        await dbQuery(
          'UPDATE assets SET project_id = $1 WHERE id = $2',
          [targetProjectId, assetId]
        );

        results.successful.push(assetId);

        // Clear cache
        await cache.del(`asset:${assetId}:${userId}`);
        await cache.del(`project_assets:${oldProjectId}:${userId}`);
        await cache.del(`project_assets:${targetProjectId}:${userId}`);

        logger.logUserActivity(userId, 'asset_moved_bulk', {
          assetId,
          fromProjectId: oldProjectId,
          toProjectId: targetProjectId
        });
      } catch (error) {
        logger.error(`Failed to move asset ${assetId}:`, error);
        results.failed.push({
          id: assetId,
          error: error.message
        });
      }
    }

    return results;
  } catch (error) {
    logger.error('Error in bulk move assets:', error);
    throw error;
  }
};

module.exports = {
  createAssetVersion,
  getAssetVersions,
  shareAsset,
  getSharedAssets,
  revokeAssetShare,
  searchAssets,
  getAssetAnalytics,
  bulkDeleteAssets,
  bulkMoveAssets
};
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const logger = require('../utils/logger');

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

// Bucket configuration
const BUCKETS = {
  videos: process.env.AWS_S3_VIDEOS_BUCKET || process.env.AWS_S3_BUCKET,
  images: process.env.AWS_S3_IMAGES_BUCKET || process.env.AWS_S3_BUCKET,
  audio: process.env.AWS_S3_AUDIO_BUCKET || process.env.AWS_S3_BUCKET,
  documents: process.env.AWS_S3_DOCUMENTS_BUCKET || process.env.AWS_S3_BUCKET,
  thumbnails: process.env.AWS_S3_THUMBNAILS_BUCKET || process.env.AWS_S3_BUCKET,
  temp: process.env.AWS_S3_TEMP_BUCKET || process.env.AWS_S3_BUCKET
};

// File size limits (in bytes)
const FILE_SIZE_LIMITS = {
  video: 2 * 1024 * 1024 * 1024, // 2GB
  image: 50 * 1024 * 1024,       // 50MB
  audio: 500 * 1024 * 1024,      // 500MB
  document: 100 * 1024 * 1024    // 100MB
};

// Allowed MIME types
const ALLOWED_MIME_TYPES = {
  video: [
    'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 
    'video/webm', 'video/mkv', 'video/flv', 'video/quicktime'
  ],
  image: [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 
    'image/svg+xml', 'image/bmp', 'image/tiff'
  ],
  audio: [
    'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 
    'audio/flac', 'audio/m4a', 'audio/wma'
  ],
  document: [
    'text/plain', 'application/json', 'application/pdf', 
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
};

/**
 * Get bucket name based on asset type
 * @param {string} assetType - The asset type
 * @returns {string} Bucket name
 */
const getBucketForAssetType = (assetType) => {
  switch (assetType) {
    case 'video': return BUCKETS.videos;
    case 'image': return BUCKETS.images;
    case 'audio': return BUCKETS.audio;
    case 'text': return BUCKETS.documents;
    default: return BUCKETS.videos;
  }
};

/**
 * Get asset type from MIME type
 * @param {string} mimetype - The MIME type
 * @returns {string} Asset type
 */
const getAssetTypeFromMimeType = (mimetype) => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.startsWith('text/') || mimetype === 'application/json') return 'text';
  return 'other';
};

/**
 * Validate file type and size
 * @param {Object} file - File object with mimetype and size
 * @returns {Object} Validation result
 */
const validateFile = (file) => {
  const { mimetype, size } = file;
  const assetType = getAssetTypeFromMimeType(mimetype);
  
  // Check if MIME type is allowed
  const allowedTypes = ALLOWED_MIME_TYPES[assetType] || [];
  if (!allowedTypes.includes(mimetype)) {
    return {
      valid: false,
      error: `File type ${mimetype} is not allowed for ${assetType} files`
    };
  }
  
  // Check file size
  const maxSize = FILE_SIZE_LIMITS[assetType] || FILE_SIZE_LIMITS.document;
  if (size > maxSize) {
    return {
      valid: false,
      error: `File size ${size} exceeds maximum allowed size of ${maxSize} bytes for ${assetType} files`
    };
  }
  
  return { valid: true, assetType };
};

/**
 * Generate a unique file key for S3
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @param {string} originalName - Original file name
 * @param {string} assetType - Asset type
 * @returns {string} S3 key
 */
const generateFileKey = (userId, projectId, originalName, assetType) => {
  const fileExtension = path.extname(originalName);
  const fileName = `${uuidv4()}${fileExtension}`;
  return `assets/${userId}/${projectId}/${assetType}/${fileName}`;
};

/**
 * Generate a presigned URL for direct upload to S3
 * @param {string} key - S3 object key
 * @param {string} mimetype - File MIME type
 * @param {number} expiresIn - URL expiration time in seconds
 * @returns {string} Presigned URL
 */
const generatePresignedUploadUrl = async (key, mimetype, expiresIn = 3600) => {
  const params = {
    Bucket: getBucketForAssetType(key.split('/')[3]),
    Key: key,
    ContentType: mimetype,
    Expires: expiresIn,
    ACL: 'private'
  };
  
  return s3.getSignedUrl('putObject', params);
};

/**
 * Generate a presigned URL for downloading from S3
 * @param {string} key - S3 object key
 * @param {number} expiresIn - URL expiration time in seconds
 * @returns {string} Presigned URL
 */
const generatePresignedDownloadUrl = async (key, expiresIn = 3600) => {
  const params = {
    Bucket: getBucketForAssetType(key.split('/')[3]),
    Key: key,
    Expires: expiresIn
  };
  
  return s3.getSignedUrl('getObject', params);
};

/**
 * Initiate multipart upload for large files
 * @param {string} key - S3 object key
 * @param {string} mimetype - File MIME type
 * @returns {Object} Multipart upload info
 */
const initiateMultipartUpload = async (key, mimetype) => {
  const params = {
    Bucket: getBucketForAssetType(key.split('/')[3]),
    Key: key,
    ContentType: mimetype,
    ACL: 'private'
  };
  
  return s3.createMultipartUpload(params).promise();
};

/**
 * Generate presigned URL for multipart upload part
 * @param {string} key - S3 object key
 * @param {string} uploadId - Multipart upload ID
 * @param {number} partNumber - Part number
 * @returns {string} Presigned URL
 */
const generatePresignedMultipartUrl = async (key, uploadId, partNumber) => {
  const params = {
    Bucket: getBucketForAssetType(key.split('/')[3]),
    Key: key,
    PartNumber: partNumber,
    UploadId: uploadId,
    Expires: 3600
  };
  
  return s3.getSignedUrl('uploadPart', params);
};

/**
 * Complete multipart upload
 * @param {string} key - S3 object key
 * @param {string} uploadId - Multipart upload ID
 * @param {Array} parts - Array of part information
 * @returns {Object} Upload result
 */
const completeMultipartUpload = async (key, uploadId, parts) => {
  const params = {
    Bucket: getBucketForAssetType(key.split('/')[3]),
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts
    }
  };
  
  return s3.completeMultipartUpload(params).promise();
};

/**
 * Abort multipart upload
 * @param {string} key - S3 object key
 * @param {string} uploadId - Multipart upload ID
 * @returns {Object} Abort result
 */
const abortMultipartUpload = async (key, uploadId) => {
  const params = {
    Bucket: getBucketForAssetType(key.split('/')[3]),
    Key: key,
    UploadId: uploadId
  };
  
  return s3.abortMultipartUpload(params).promise();
};

/**
 * Upload file buffer directly to S3
 * @param {Buffer} buffer - File buffer
 * @param {string} key - S3 object key
 * @param {string} mimetype - File MIME type
 * @returns {Object} Upload result
 */
const uploadBufferToS3 = async (buffer, key, mimetype) => {
  const params = {
    Bucket: getBucketForAssetType(key.split('/')[3]),
    Key: key,
    Body: buffer,
    ContentType: mimetype,
    ACL: 'private'
  };
  
  return s3.upload(params).promise();
};

/**
 * Delete file from S3
 * @param {string} key - S3 object key
 * @returns {Object} Delete result
 */
const deleteFileFromS3 = async (key) => {
  const params = {
    Bucket: getBucketForAssetType(key.split('/')[3]),
    Key: key
  };
  
  return s3.deleteObject(params).promise();
};

/**
 * Copy file within S3
 * @param {string} sourceKey - Source S3 key
 * @param {string} destinationKey - Destination S3 key
 * @returns {Object} Copy result
 */
const copyFileInS3 = async (sourceKey, destinationKey) => {
  const sourceBucket = getBucketForAssetType(sourceKey.split('/')[3]);
  const destBucket = getBucketForAssetType(destinationKey.split('/')[3]);
  
  const params = {
    Bucket: destBucket,
    CopySource: `${sourceBucket}/${sourceKey}`,
    Key: destinationKey,
    ACL: 'private'
  };
  
  return s3.copyObject(params).promise();
};

/**
 * Get file metadata from S3
 * @param {string} key - S3 object key
 * @returns {Object} File metadata
 */
const getFileMetadata = async (key) => {
  const params = {
    Bucket: getBucketForAssetType(key.split('/')[3]),
    Key: key
  };
  
  return s3.headObject(params).promise();
};

/**
 * Generate thumbnail for image
 * @param {Buffer} imageBuffer - Image buffer
 * @param {number} width - Thumbnail width
 * @param {number} height - Thumbnail height
 * @returns {Buffer} Thumbnail buffer
 */
const generateImageThumbnail = async (imageBuffer, width = 300, height = 300) => {
  return sharp(imageBuffer)
    .resize(width, height, {
      fit: 'cover',
      position: 'center'
    })
    .jpeg({ quality: 80 })
    .toBuffer();
};

/**
 * Generate thumbnail for video
 * @param {Buffer} videoBuffer - Video buffer
 * @param {number} width - Thumbnail width
 * @param {number} height - Thumbnail height
 * @returns {Promise<Buffer>} Thumbnail buffer
 */
const generateVideoThumbnail = async (videoBuffer, width = 300, height = 300) => {
  return new Promise((resolve, reject) => {
    const tempInputPath = `/tmp/${uuidv4()}.mp4`;
    const tempOutputPath = `/tmp/${uuidv4()}.jpg`;
    
    // Write buffer to temp file
    require('fs').writeFileSync(tempInputPath, videoBuffer);
    
    ffmpeg(tempInputPath)
      .screenshots({
        count: 1,
        folder: '/tmp',
        filename: path.basename(tempOutputPath),
        size: `${width}x${height}`
      })
      .on('end', () => {
        const thumbnailBuffer = require('fs').readFileSync(tempOutputPath);
        // Clean up temp files
        require('fs').unlinkSync(tempInputPath);
        require('fs').unlinkSync(tempOutputPath);
        resolve(thumbnailBuffer);
      })
      .on('error', (error) => {
        // Clean up temp files
        try {
          require('fs').unlinkSync(tempInputPath);
        } catch (e) {}
        reject(error);
      });
  });
};

/**
 * Get video dimensions
 * @param {Buffer} videoBuffer - Video buffer
 * @returns {Promise<Object>} Dimensions {width, height}
 */
const getVideoDimensions = async (videoBuffer) => {
  return new Promise((resolve, reject) => {
    const tempInputPath = `/tmp/${uuidv4()}.mp4`;
    
    // Write buffer to temp file
    require('fs').writeFileSync(tempInputPath, videoBuffer);
    
    ffmpeg.ffprobe(tempInputPath, (err, metadata) => {
      // Clean up temp file
      try {
        require('fs').unlinkSync(tempInputPath);
      } catch (e) {}
      
      if (err) {
        reject(err);
        return;
      }
      
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (videoStream) {
        resolve({ width: videoStream.width, height: videoStream.height });
      } else {
        reject(new Error('No video stream found'));
      }
    });
  });
};

/**
 * Get video duration
 * @param {Buffer} videoBuffer - Video buffer
 * @returns {Promise<number>} Duration in seconds
 */
const getVideoDuration = async (videoBuffer) => {
  return new Promise((resolve, reject) => {
    const tempInputPath = `/tmp/${uuidv4()}.mp4`;
    
    // Write buffer to temp file
    require('fs').writeFileSync(tempInputPath, videoBuffer);
    
    ffmpeg.ffprobe(tempInputPath, (err, metadata) => {
      // Clean up temp file
      try {
        require('fs').unlinkSync(tempInputPath);
      } catch (e) {}
      
      if (err) {
        reject(err);
        return;
      }
      
      resolve(metadata.format.duration);
    });
  });
};

/**
 * Get image dimensions
 * @param {Buffer} imageBuffer - Image buffer
 * @returns {Promise<Object>} Dimensions {width, height}
 */
const getImageDimensions = async (imageBuffer) => {
  const metadata = await sharp(imageBuffer).metadata();
  return { width: metadata.width, height: metadata.height };
};

/**
 * Calculate file hash for integrity checking
 * @param {Buffer} buffer - File buffer
 * @returns {string} SHA-256 hash
 */
const calculateFileHash = (buffer) => {
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

/**
 * Check if file is potentially malicious
 * @param {Buffer} buffer - File buffer
 * @param {string} mimetype - File MIME type
 * @returns {Promise<boolean>} True if file appears safe
 */
const scanFileForMalware = async (buffer, mimetype) => {
  // Basic malware scanning - in production, integrate with a proper antivirus service
  try {
    // Check for common malware signatures in executable files
    if (mimetype.includes('executable') || mimetype.includes('application/x-executable')) {
      return false; // Reject executables
    }
    
    // Check for script content in non-script files
    const content = buffer.toString('utf8', 0, Math.min(1024, buffer.length));
    if (content.includes('<script') && !mimetype.includes('javascript')) {
      return false; // Potential XSS
    }
    
    // Check for PHP tags in non-PHP files
    if (content.includes('<?php') && !mimetype.includes('php')) {
      return false; // Potential PHP injection
    }
    
    return true; // File appears safe
  } catch (error) {
    logger.error('Error scanning file for malware:', error);
    return false; // Err on the side of caution
  }
};

module.exports = {
  // Configuration
  BUCKETS,
  FILE_SIZE_LIMITS,
  ALLOWED_MIME_TYPES,
  
  // Core upload functions
  validateFile,
  generateFileKey,
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  uploadBufferToS3,
  deleteFileFromS3,
  copyFileInS3,
  getFileMetadata,
  
  // Multipart upload functions
  initiateMultipartUpload,
  generatePresignedMultipartUrl,
  completeMultipartUpload,
  abortMultipartUpload,
  
  // Asset processing functions
  generateImageThumbnail,
  generateVideoThumbnail,
  getVideoDimensions,
  getVideoDuration,
  getImageDimensions,
  
  // Security functions
  calculateFileHash,
  scanFileForMalware,
  
  // Utility functions
  getAssetTypeFromMimeType,
  getBucketForAssetType
};
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const logger = require('../utils/logger');
const uploadService = require('./upload');
const { query: dbQuery } = require('../database/connection');

// Configure AWS S3 for processed assets
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

// Processing queue configuration
const PROCESSING_QUEUE = 'asset-processing';

/**
 * Process uploaded asset - generate thumbnails, extract metadata, etc.
 * @param {string} assetId - Asset ID
 * @param {string} assetKey - S3 key of the asset
 * @param {string} assetType - Type of asset
 * @returns {Object} Processing results
 */
const processAsset = async (assetId, assetKey, assetType) => {
  try {
    logger.info(`Starting asset processing for ${assetId} (${assetType})`);
    
    // Get the asset file from S3
    const assetBuffer = await getAssetFromS3(assetKey);
    
    // Process based on asset type
    let processingResults = {};
    
    switch (assetType) {
      case 'image':
        processingResults = await processImage(assetBuffer, assetKey);
        break;
      case 'video':
        processingResults = await processVideo(assetBuffer, assetKey);
        break;
      case 'audio':
        processingResults = await processAudio(assetBuffer, assetKey);
        break;
      default:
        processingResults = await processDocument(assetBuffer, assetKey);
    }
    
    // Update asset record with processing results
    await updateAssetWithProcessingResults(assetId, processingResults);
    
    logger.info(`Completed asset processing for ${assetId}`);
    return processingResults;
    
  } catch (error) {
    logger.error(`Error processing asset ${assetId}:`, error);
    throw error;
  }
};

/**
 * Get asset file from S3
 * @param {string} key - S3 key
 * @returns {Buffer} File buffer
 */
const getAssetFromS3 = async (key) => {
  const params = {
    Bucket: uploadService.getBucketForAssetType(key.split('/')[3]),
    Key: key
  };
  
  const result = await s3.getObject(params).promise();
  return result.Body;
};

/**
 * Process image asset
 * @param {Buffer} imageBuffer - Image buffer
 * @param {string} originalKey - Original S3 key
 * @returns {Object} Processing results
 */
const processImage = async (imageBuffer, originalKey) => {
  const results = {
    dimensions: null,
    thumbnails: [],
    metadata: {}
  };
  
  try {
    // Get image dimensions
    results.dimensions = await uploadService.getImageDimensions(imageBuffer);
    
    // Generate thumbnails in different sizes
    const thumbnailSizes = [
      { name: 'small', width: 150, height: 150 },
      { name: 'medium', width: 300, height: 300 },
      { name: 'large', width: 800, height: 600 }
    ];
    
    for (const size of thumbnailSizes) {
      const thumbnailBuffer = await uploadService.generateImageThumbnail(
        imageBuffer, 
        size.width, 
        size.height
      );
      
      const thumbnailKey = generateThumbnailKey(originalKey, size.name);
      await uploadService.uploadBufferToS3(thumbnailBuffer, thumbnailKey, 'image/jpeg');
      
      results.thumbnails.push({
        size: size.name,
        key: thumbnailKey,
        url: await uploadService.generatePresignedDownloadUrl(thumbnailKey, 86400 * 30) // 30 days
      });
    }
    
    // Extract additional metadata
    const metadata = await sharp(imageBuffer).metadata();
    results.metadata = {
      format: metadata.format,
      size: metadata.size,
      hasAlpha: metadata.hasAlpha,
      orientation: metadata.orientation,
      density: metadata.density
    };
    
    return results;
    
  } catch (error) {
    logger.error('Error processing image:', error);
    throw error;
  }
};

/**
 * Process video asset
 * @param {Buffer} videoBuffer - Video buffer
 * @param {string} originalKey - Original S3 key
 * @returns {Object} Processing results
 */
const processVideo = async (videoBuffer, originalKey) => {
  const results = {
    dimensions: null,
    duration: null,
    thumbnails: [],
    metadata: {},
    formats: []
  };
  
  try {
    // Get video dimensions
    results.dimensions = await uploadService.getVideoDimensions(videoBuffer);
    
    // Get video duration
    results.duration = await uploadService.getVideoDuration(videoBuffer);
    
    // Generate thumbnails at different points
    const thumbnailCount = 3;
    for (let i = 0; i < thumbnailCount; i++) {
      const timeOffset = (results.duration / thumbnailCount) * i;
      const thumbnailBuffer = await generateVideoThumbnailAtTime(videoBuffer, timeOffset);
      
      const thumbnailKey = generateThumbnailKey(originalKey, `frame_${i}`);
      await uploadService.uploadBufferToS3(thumbnailBuffer, thumbnailKey, 'image/jpeg');
      
      results.thumbnails.push({
        size: 'frame',
        key: thumbnailKey,
        url: await uploadService.generatePresignedDownloadUrl(thumbnailKey, 86400 * 30), // 30 days
        timeOffset
      });
    }
    
    // Extract video metadata
    results.metadata = await extractVideoMetadata(videoBuffer);
    
    // Generate different formats for web optimization
    results.formats = await generateVideoFormats(videoBuffer, originalKey);
    
    return results;
    
  } catch (error) {
    logger.error('Error processing video:', error);
    throw error;
  }
};

/**
 * Process audio asset
 * @param {Buffer} audioBuffer - Audio buffer
 * @param {string} originalKey - Original S3 key
 * @returns {Object} Processing results
 */
const processAudio = async (audioBuffer, originalKey) => {
  const results = {
    duration: null,
    metadata: {},
    waveformData: null,
    formats: []
  };
  
  try {
    // Get audio duration and metadata
    results.metadata = await extractAudioMetadata(audioBuffer);
    results.duration = results.metadata.duration;
    
    // Generate waveform data (simplified version)
    results.waveformData = await generateWaveformData(audioBuffer);
    
    // Generate different formats for web optimization
    results.formats = await generateAudioFormats(audioBuffer, originalKey);
    
    return results;
    
  } catch (error) {
    logger.error('Error processing audio:', error);
    throw error;
  }
};

/**
 * Process document asset
 * @param {Buffer} documentBuffer - Document buffer
 * @param {string} originalKey - Original S3 key
 * @returns {Object} Processing results
 */
const processDocument = async (documentBuffer, originalKey) => {
  const results = {
    metadata: {},
    textContent: null,
    pageCount: null
  };
  
  try {
    // Extract basic metadata
    results.metadata = {
      size: documentBuffer.length,
      hash: uploadService.calculateFileHash(documentBuffer)
    };
    
    // For text files, extract content
    if (originalKey.includes('.txt') || originalKey.includes('.json')) {
      results.textContent = documentBuffer.toString('utf-8');
    }
    
    // For PDF files, extract page count and text (would need PDF library in production)
    if (originalKey.includes('.pdf')) {
      // Placeholder for PDF processing
      results.pageCount = 1; // Would use PDF library to get actual count
    }
    
    return results;
    
  } catch (error) {
    logger.error('Error processing document:', error);
    throw error;
  }
};

/**
 * Generate video thumbnail at specific time
 * @param {Buffer} videoBuffer - Video buffer
 * @param {number} timeOffset - Time offset in seconds
 * @returns {Buffer} Thumbnail buffer
 */
const generateVideoThumbnailAtTime = async (videoBuffer, timeOffset) => {
  return new Promise((resolve, reject) => {
    const tempInputPath = `/tmp/${uuidv4()}.mp4`;
    const tempOutputPath = `/tmp/${uuidv4()}.jpg`;
    
    // Write buffer to temp file
    require('fs').writeFileSync(tempInputPath, videoBuffer);
    
    ffmpeg(tempInputPath)
      .seekInput(timeOffset)
      .frames(1)
      .size('300x300')
      .output(tempOutputPath)
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
      })
      .run();
  });
};

/**
 * Extract video metadata
 * @param {Buffer} videoBuffer - Video buffer
 * @returns {Object} Video metadata
 */
const extractVideoMetadata = async (videoBuffer) => {
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
      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
      
      resolve({
        format: metadata.format.format_name,
        duration: metadata.format.duration,
        size: metadata.format.size,
        bitrate: metadata.format.bit_rate,
        videoCodec: videoStream ? videoStream.codec_name : null,
        audioCodec: audioStream ? audioStream.codec_name : null,
        frameRate: videoStream ? eval(videoStream.r_frame_rate) : null,
        pixelFormat: videoStream ? videoStream.pix_fmt : null
      });
    });
  });
};

/**
 * Extract audio metadata
 * @param {Buffer} audioBuffer - Audio buffer
 * @returns {Object} Audio metadata
 */
const extractAudioMetadata = async (audioBuffer) => {
  return new Promise((resolve, reject) => {
    const tempInputPath = `/tmp/${uuidv4()}.mp3`;
    
    // Write buffer to temp file
    require('fs').writeFileSync(tempInputPath, audioBuffer);
    
    ffmpeg.ffprobe(tempInputPath, (err, metadata) => {
      // Clean up temp file
      try {
        require('fs').unlinkSync(tempInputPath);
      } catch (e) {}
      
      if (err) {
        reject(err);
        return;
      }
      
      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
      
      resolve({
        format: metadata.format.format_name,
        duration: metadata.format.duration,
        size: metadata.format.size,
        bitrate: metadata.format.bit_rate,
        codec: audioStream ? audioStream.codec_name : null,
        sampleRate: audioStream ? audioStream.sample_rate : null,
        channels: audioStream ? audioStream.channels : null
      });
    });
  });
};

/**
 * Generate waveform data for audio
 * @param {Buffer} audioBuffer - Audio buffer
 * @returns {Array} Waveform data points
 */
const generateWaveformData = async (audioBuffer) => {
  // Simplified waveform generation - in production, use proper audio analysis
  const samples = 100;
  const waveformData = [];
  
  for (let i = 0; i < samples; i++) {
    // Generate random waveform data as placeholder
    waveformData.push(Math.random() * 100);
  }
  
  return waveformData;
};

/**
 * Generate different video formats for web optimization
 * @param {Buffer} videoBuffer - Original video buffer
 * @param {string} originalKey - Original S3 key
 * @returns {Array} Array of generated formats
 */
const generateVideoFormats = async (videoBuffer, originalKey) => {
  const formats = [];
  
  // In production, implement actual video transcoding
  // For now, return placeholder formats
  const targetFormats = [
    { name: 'webm', codec: 'libvpx', extension: '.webm' },
    { name: 'mp4-h264', codec: 'libx264', extension: '.mp4' }
  ];
  
  for (const format of targetFormats) {
    const formatKey = generateFormatKey(originalKey, format.name);
    
    // Placeholder for actual transcoding
    // In production, use ffmpeg to transcode to different formats
    // await transcodeVideo(videoBuffer, formatKey, format.codec);
    
    formats.push({
      name: format.name,
      key: formatKey,
      url: await uploadService.generatePresignedDownloadUrl(formatKey, 86400 * 30) // 30 days
    });
  }
  
  return formats;
};

/**
 * Generate different audio formats for web optimization
 * @param {Buffer} audioBuffer - Original audio buffer
 * @param {string} originalKey - Original S3 key
 * @returns {Array} Array of generated formats
 */
const generateAudioFormats = async (audioBuffer, originalKey) => {
  const formats = [];
  
  // In production, implement actual audio transcoding
  // For now, return placeholder formats
  const targetFormats = [
    { name: 'mp3-128', codec: 'libmp3lame', bitrate: '128k', extension: '.mp3' },
    { name: 'aac', codec: 'aac', bitrate: '128k', extension: '.aac' },
    { name: 'ogg', codec: 'libvorbis', bitrate: '128k', extension: '.ogg' }
  ];
  
  for (const format of targetFormats) {
    const formatKey = generateFormatKey(originalKey, format.name);
    
    // Placeholder for actual transcoding
    // In production, use ffmpeg to transcode to different formats
    // await transcodeAudio(audioBuffer, formatKey, format.codec, format.bitrate);
    
    formats.push({
      name: format.name,
      key: formatKey,
      url: await uploadService.generatePresignedDownloadUrl(formatKey, 86400 * 30) // 30 days
    });
  }
  
  return formats;
};

/**
 * Generate thumbnail key
 * @param {string} originalKey - Original S3 key
 * @param {string} size - Thumbnail size identifier
 * @returns {string} Thumbnail key
 */
const generateThumbnailKey = (originalKey, size) => {
  const parts = originalKey.split('/');
  const filename = parts[parts.length - 1];
  const extension = path.extname(filename);
  const basename = path.basename(filename, extension);
  
  return `thumbnails/${parts[1]}/${parts[2]}/${basename}_${size}${extension}`;
};

/**
 * Generate format key
 * @param {string} originalKey - Original S3 key
 * @param {string} formatName - Format name
 * @returns {string} Format key
 */
const generateFormatKey = (originalKey, formatName) => {
  const parts = originalKey.split('/');
  const filename = parts[parts.length - 1];
  const extension = path.extname(filename);
  const basename = path.basename(filename, extension);
  
  return `formats/${parts[1]}/${parts[2]}/${basename}_${formatName}${extension}`;
};

/**
 * Update asset record with processing results
 * @param {string} assetId - Asset ID
 * @param {Object} processingResults - Processing results
 */
const updateAssetWithProcessingResults = async (assetId, processingResults) => {
  const updateQuery = `
    UPDATE assets 
    SET 
      dimensions = $1,
      duration = $2,
      metadata = metadata || $3
    WHERE id = $4
  `;
  
  await dbQuery(updateQuery, [
    processingResults.dimensions ? JSON.stringify(processingResults.dimensions) : null,
    processingResults.duration || null,
    JSON.stringify(processingResults),
    assetId
  ]);
};

/**
 * Queue asset for processing
 * @param {string} assetId - Asset ID
 * @param {string} assetKey - S3 key
 * @param {string} assetType - Asset type
 */
const queueAssetForProcessing = async (assetId, assetKey, assetType) => {
  // In production, use a proper job queue like Bull or RabbitMQ
  // For now, process immediately
  setTimeout(() => {
    processAsset(assetId, assetKey, assetType).catch(error => {
      logger.error(`Error in queued processing for asset ${assetId}:`, error);
    });
  }, 1000);
};

module.exports = {
  processAsset,
  queueAssetForProcessing,
  getAssetFromS3,
  processImage,
  processVideo,
  processAudio,
  processDocument,
  generateVideoThumbnailAtTime,
  extractVideoMetadata,
  extractAudioMetadata,
  generateWaveformData,
  generateVideoFormats,
  generateAudioFormats
};
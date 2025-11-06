const logger = require('../utils/logger');
const { query } = require('../database/connection');
const { cache } = require('../services/redis');

class VideoGenerationService {
  constructor() {
    this.renderQueue = [];
    this.activeJobs = new Map();
    this.maxConcurrentJobs = 3;
  }

  /**
   * Generate video from text prompt
   * @param {Object} params - Video generation parameters
   * @param {string} params.prompt - Text description of the video
   * @param {Object} params.settings - Video generation settings
   * @param {string} params.userId - User ID
   * @param {string} params.projectId - Project ID
   * @returns {Promise<Object>} Generated video information
   */
  async generateVideo({ prompt, settings = {}, userId, projectId }) {
    try {
      logger.info('Starting video generation', { prompt, userId, projectId });

      // Create render job record
      const job = await this.createRenderJob({
        userId,
        projectId,
        status: 'processing',
        settings: { prompt, ...settings }
      });

      // Add to queue
      this.renderQueue.push({
        jobId: job.id,
        prompt,
        settings,
        userId,
        projectId,
        createdAt: new Date()
      });

      // Process queue
      this.processQueue();

      return job;
    } catch (error) {
      logger.error('Video generation failed:', error);
      throw error;
    }
  }

  /**
   * Process video generation queue
   */
  async processQueue() {
    if (this.activeJobs.size >= this.maxConcurrentJobs || this.renderQueue.length === 0) {
      return;
    }

    const job = this.renderQueue.shift();
    if (!job) return;

    this.activeJobs.set(job.jobId, job);

    try {
      // Update job status
      await this.updateJobStatus(job.jobId, 'processing', 0);

      // Step 1: Generate script from prompt
      const script = await this.generateScript(job.prompt, job.settings);
      await this.updateJobStatus(job.jobId, 'processing', 20);

      // Step 2: Generate scenes
      const scenes = await this.generateScenes(script, job.settings);
      await this.updateJobStatus(job.jobId, 'processing', 40);

      // Step 3: Generate visual assets for each scene
      const assets = await this.generateAssets(scenes, job.settings);
      await this.updateJobStatus(job.jobId, 'processing', 60);

      // Step 4: Generate voiceover
      const voiceover = await this.generateVoiceover(script, job.settings);
      await this.updateJobStatus(job.jobId, 'processing', 80);

      // Step 5: Compose video
      const videoUrl = await this.composeVideo(scenes, assets, voiceover, job.settings);
      await this.updateJobStatus(job.jobId, 'completed', 100, videoUrl);

      logger.info('Video generation completed', { jobId: job.jobId, videoUrl });
    } catch (error) {
      logger.error('Video generation failed:', error);
      await this.updateJobStatus(job.jobId, 'failed', 0, null, error.message);
    } finally {
      this.activeJobs.delete(job.jobId);
      
      // Process next job in queue
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Generate video script from prompt
   * @param {string} prompt - Text prompt
   * @param {Object} settings - Generation settings
   * @returns {Promise<Object>} Generated script
   */
  async generateScript(prompt, settings) {
    try {
      const response = await global.openai.createChatCompletion({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a professional video script writer. Create a compelling video script based on the user's prompt. 
            The script should include:
            1. Scene descriptions
            2. Dialogue/narration
            3. Visual directions
            4. Timing information
            
            Format the response as JSON with the following structure:
            {
              "title": "Video Title",
              "duration": 30,
              "scenes": [
                {
                  "id": 1,
                  "description": "Scene description",
                  "dialogue": "Narration/dialogue text",
                  "duration": 5,
                  "visuals": "Visual directions",
                  "mood": "emotional tone"
                }
              ]
            }`
          },
          {
            role: 'user',
            content: `Create a video script for: ${prompt}\n\nStyle: ${settings.style || 'modern'}\nDuration: ${settings.duration || 30} seconds\nTone: ${settings.tone || 'engaging'}`
          }
        ],
        max_tokens: 2000,
        temperature: 0.7
      });

      const scriptData = JSON.parse(response.data.choices[0].message.content);
      return scriptData;
    } catch (error) {
      logger.error('Script generation failed:', error);
      throw new Error('Failed to generate video script');
    }
  }

  /**
   * Generate visual scenes from script
   * @param {Object} script - Video script
   * @param {Object} settings - Generation settings
   * @returns {Promise<Array>} Array of scenes
   */
  async generateScenes(script, settings) {
    try {
      const scenes = [];
      
      for (const sceneData of script.scenes) {
        // Generate scene image using Stable Diffusion or DALL-E
        const imagePrompt = `${sceneData.description}, ${sceneData.visuals}, ${settings.visualStyle || 'cinematic'}, high quality, detailed`;
        
        let imageUrl;
        if (settings.imageModel === 'stable-diffusion') {
          imageUrl = await this.generateImageStableDiffusion(imagePrompt);
        } else {
          imageUrl = await this.generateImageDALLE(imagePrompt);
        }

        scenes.push({
          ...sceneData,
          imageUrl,
          generatedAt: new Date()
        });
      }

      return scenes;
    } catch (error) {
      logger.error('Scene generation failed:', error);
      throw new Error('Failed to generate video scenes');
    }
  }

  /**
   * Generate image using Stable Diffusion
   * @param {string} prompt - Image prompt
   * @returns {Promise<string>} Image URL
   */
  async generateImageStableDiffusion(prompt) {
    try {
      const response = await global.stability.generateImage({
        prompt: prompt,
        width: 1024,
        height: 576,
        samples: 1,
        steps: 30,
        cfg_scale: 7.5,
        style_preset: 'cinematic'
      });

      return response.artifacts[0].base64;
    } catch (error) {
      logger.error('Stable Diffusion image generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate image using DALL-E
   * @param {string} prompt - Image prompt
   * @returns {Promise<string>} Image URL
   */
  async generateImageDALLE(prompt) {
    try {
      const response = await global.openai.createImage({
        prompt: prompt,
        n: 1,
        size: '1024x576',
        quality: 'hd',
        style: 'cinematic'
      });

      return response.data.data[0].url;
    } catch (error) {
      logger.error('DALL-E image generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate additional assets for scenes
   * @param {Array} scenes - Array of scenes
   * @param {Object} settings - Generation settings
   * @returns {Promise<Object>} Generated assets
   */
  async generateAssets(scenes, settings) {
    try {
      const assets = {
        transitions: [],
        effects: [],
        overlays: []
      };

      // Generate transitions between scenes
      for (let i = 0; i < scenes.length - 1; i++) {
        const transition = await this.generateTransition(scenes[i], scenes[i + 1], settings);
        assets.transitions.push(transition);
      }

      // Generate effects based on mood
      const uniqueMoods = [...new Set(scenes.map(scene => scene.mood))];
      for (const mood of uniqueMoods) {
        const effect = await this.generateEffect(mood, settings);
        assets.effects.push(effect);
      }

      return assets;
    } catch (error) {
      logger.error('Asset generation failed:', error);
      throw new Error('Failed to generate video assets');
    }
  }

  /**
   * Generate transition between scenes
   * @param {Object} scene1 - First scene
   * @param {Object} scene2 - Second scene
   * @param {Object} settings - Generation settings
   * @returns {Promise<Object>} Transition data
   */
  async generateTransition(scene1, scene2, settings) {
    // Generate transition using Replicate or custom algorithm
    const transitionType = settings.transitionType || 'fade';
    
    return {
      type: transitionType,
      duration: 1.0,
      fromScene: scene1.id,
      toScene: scene2.id,
      generatedAt: new Date()
    };
  }

  /**
   * Generate effect for mood
   * @param {string} mood - Emotional mood
   * @param {Object} settings - Generation settings
   * @returns {Promise<Object>} Effect data
   */
  async generateEffect(mood, settings) {
    return {
      type: 'color_grading',
      mood: mood,
      parameters: this.getMoodParameters(mood),
      generatedAt: new Date()
    };
  }

  /**
   * Get color grading parameters for mood
   * @param {string} mood - Emotional mood
   * @returns {Object} Color grading parameters
   */
  getMoodParameters(mood) {
    const moodParams = {
      happy: { brightness: 1.1, contrast: 1.05, saturation: 1.2, warmth: 1.1 },
      sad: { brightness: 0.9, contrast: 1.0, saturation: 0.8, warmth: 0.9 },
      dramatic: { brightness: 0.95, contrast: 1.2, saturation: 1.1, warmth: 1.0 },
      calm: { brightness: 1.0, contrast: 1.0, saturation: 0.9, warmth: 1.05 },
      energetic: { brightness: 1.05, contrast: 1.1, saturation: 1.3, warmth: 1.15 }
    };

    return moodParams[mood] || moodParams.calm;
  }

  /**
   * Generate voiceover from script
   * @param {Object} script - Video script
   * @param {Object} settings - Generation settings
   * @returns {Promise<string>} Voiceover audio URL
   */
  async generateVoiceover(script, settings) {
    try {
      // Combine all dialogue into single text
      const fullText = script.scenes.map(scene => scene.dialogue).join(' ');
      
      // Generate voice using ElevenLabs
      const voiceSettings = {
        voice_id: settings.voiceId || 'rachel',
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        }
      };

      const audio = await global.elevenlabs.generate({
        text: fullText,
        voice_settings: voiceSettings
      });

      return audio;
    } catch (error) {
      logger.error('Voiceover generation failed:', error);
      throw new Error('Failed to generate voiceover');
    }
  }

  /**
   * Compose final video from scenes, assets, and voiceover
   * @param {Array} scenes - Array of scenes
   * @param {Object} assets - Generated assets
   * @param {string} voiceover - Voiceover audio URL
   * @param {Object} settings - Video settings
   * @returns {Promise<string>} Final video URL
   */
  async composeVideo(scenes, assets, voiceover, settings) {
    try {
      // Use FFmpeg to compose video
      const ffmpeg = require('fluent-ffmpeg');
      const path = require('path');
      const fs = require('fs');
      const { v4: uuidv4 } = require('uuid');

      const outputDir = '/tmp/videos';
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const videoId = uuidv4();
      const outputPath = path.join(outputDir, `${videoId}.mp4`);

      // Create FFmpeg command
      let command = ffmpeg();

      // Add scenes
      scenes.forEach((scene, index) => {
        const scenePath = await this.downloadImage(scene.imageUrl, `/tmp/scene_${index}.jpg`);
        command = command.input(scenePath);
      });

      // Add voiceover
      const voiceoverPath = await this.downloadAudio(voiceover, `/tmp/voiceover.mp3`);
      command = command.input(voiceoverPath);

      // Complex filter for video composition
      const filterComplex = this.buildVideoFilter(scenes.length, assets);
      
      command
        .complexFilter(filterComplex)
        .outputOptions([
          '-c:v libx264',
          '-c:a aac',
          '-shortest',
          '-map [finalvideo]',
          '-map [audio]',
          '-preset medium',
          '-crf 23'
        ])
        .output(outputPath)
        .on('progress', (progress) => {
          // Update progress if needed
          logger.debug('Video composition progress:', progress.percent);
        })
        .on('end', () => {
          logger.info('Video composition completed');
        })
        .on('error', (error) => {
          logger.error('Video composition failed:', error);
          throw error;
        });

      // Run the composition
      await new Promise((resolve, reject) => {
        command.run().on('end', resolve).on('error', reject);
      });

      // Upload to storage and return URL
      const videoUrl = await this.uploadVideo(outputPath, videoId);
      
      // Clean up temporary files
      this.cleanupTempFiles([outputPath, voiceoverPath]);

      return videoUrl;
    } catch (error) {
      logger.error('Video composition failed:', error);
      throw new Error('Failed to compose video');
    }
  }

  /**
   * Build FFmpeg filter complex for video composition
   * @param {number} sceneCount - Number of scenes
   * @param {Object} assets - Video assets
   * @returns {string} FFmpeg filter complex
   */
  buildVideoFilter(sceneCount, assets) {
    let filter = '';

    // Create video stream concatenation
    for (let i = 0; i < sceneCount; i++) {
      filter += `[${i}:v]scale=1920:1080:force_original_aspect_ratio[v${i}];`;
    }

    // Concatenate videos
    const videoInputs = Array.from({ length: sceneCount }, (_, i) => `[v${i}]`).join('');
    filter += `${videoInputs}concat=n=${sceneCount}:v=1:a=0[finalvideo]`;

    return filter;
  }

  /**
   * Download image from URL
   * @param {string} url - Image URL
   * @param {string} path - Local path to save
   * @returns {Promise<string>} Local file path
   */
  async downloadImage(url, path) {
    const axios = require('axios');
    const fs = require('fs');
    
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    fs.writeFileSync(path, response.data);
    
    return path;
  }

  /**
   * Download audio from URL
   * @param {string} url - Audio URL
   * @param {string} path - Local path to save
   * @returns {Promise<string>} Local file path
   */
  async downloadAudio(url, path) {
    const axios = require('axios');
    const fs = require('fs');
    
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    fs.writeFileSync(path, response.data);
    
    return path;
  }

  /**
   * Upload video to storage
   * @param {string} path - Local video path
   * @param {string} videoId - Video ID
   * @returns {Promise<string>} Video URL
   */
  async uploadVideo(path, videoId) {
    // Upload to AWS S3 or other storage
    // For now, return a mock URL
    return `https://storage.example.com/videos/${videoId}.mp4`;
  }

  /**
   * Clean up temporary files
   * @param {Array} files - Array of file paths
   */
  cleanupTempFiles(files) {
    const fs = require('fs');
    
    files.forEach(file => {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        logger.warn('Failed to cleanup temp file:', file, error);
      }
    });
  }

  /**
   * Create render job record
   * @param {Object} jobData - Job data
   * @returns {Promise<Object>} Created job
   */
  async createRenderJob(jobData) {
    const result = await query(
      `INSERT INTO render_jobs (project_id, user_id, status, settings, created_at) 
       VALUES ($1, $2, $3, $4, NOW()) 
       RETURNING *`,
      [jobData.projectId, jobData.userId, jobData.status, JSON.stringify(jobData.settings)]
    );

    return result.rows[0];
  }

  /**
   * Update job status
   * @param {string} jobId - Job ID
   * @param {string} status - New status
   * @param {number} progress - Progress percentage
   * @param {string} resultUrl - Result URL
   * @param {string} errorMessage - Error message
   */
  async updateJobStatus(jobId, status, progress, resultUrl = null, errorMessage = null) {
    await query(
      `UPDATE render_jobs 
       SET status = $1, progress = $2, result_url = $3, error_message = $4, 
           started_at = CASE WHEN started_at IS NULL AND $1 = 'processing' THEN NOW() ELSE started_at END,
           completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN NOW() ELSE completed_at END
       WHERE id = $5`,
      [status, progress, resultUrl, errorMessage, jobId]
    );

    // Cache status for real-time updates
    await cache.set(`render_job:${jobId}`, {
      status,
      progress,
      resultUrl,
      errorMessage
    }, 300); // 5 minutes TTL
  }

  /**
   * Get job status
   * @param {string} jobId - Job ID
   * @returns {Promise<Object>} Job status
   */
  async getJobStatus(jobId) {
    // Try cache first
    const cached = await cache.get(`render_job:${jobId}`);
    if (cached) {
      return cached;
    }

    // Fallback to database
    const result = await query(
      'SELECT * FROM render_jobs WHERE id = $1',
      [jobId]
    );

    return result.rows[0];
  }

  /**
   * Cancel render job
   * @param {string} jobId - Job ID
   * @returns {Promise<boolean>} Success status
   */
  async cancelJob(jobId) {
    try {
      // Remove from queue if pending
      this.renderQueue = this.renderQueue.filter(job => job.jobId !== jobId);
      
      // Update status in database
      await this.updateJobStatus(jobId, 'cancelled', 0);
      
      logger.info('Render job cancelled', { jobId });
      return true;
    } catch (error) {
      logger.error('Failed to cancel render job:', error);
      return false;
    }
  }
}

module.exports = new VideoGenerationService();
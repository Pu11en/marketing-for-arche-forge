const logger = require('../utils/logger');
const { query } = require('../database/connection');
const { cache } = require('./redis');
const aiProviders = require('./aiProviders');
const { addJob, JOB_TYPES } = require('./jobQueue');
const { executeTask, WORKER_TYPES } = require('./workerPool');
const personalizationService = require('./personalization');
const crypto = require('crypto');

class ContentAnalysisService {
  constructor() {
    this.analysisQueue = [];
    this.activeJobs = new Map();
    this.maxConcurrentJobs = 5;
    this.analysisLevels = {
      basic: { detail: 'low', timeout: 30000 },
      standard: { detail: 'medium', timeout: 120000 },
      comprehensive: { detail: 'high', timeout: 300000 }
    };
    this.batchProcessing = {
      enabled: true,
      batchSize: 10,
      maxConcurrency: 3
    };
  }

  /**
   * Analyze content (image, video, text, audio)
   * @param {Object} params - Analysis parameters
   * @param {string} params.contentType - Type of content (image, video, text, audio)
   * @param {string} params.contentUrl - URL of content to analyze
   * @param {Object} params.contentData - Direct content data (optional)
   * @param {Object} params.settings - Analysis settings
   * @param {string} params.userId - User ID
   * @param {string} params.projectId - Project ID (optional)
   * @param {string} params.analysisLevel - Analysis level (basic, standard, comprehensive)
   * @param {boolean} params.useWorkerPool - Whether to use worker pool for processing
   * @returns {Promise<Object>} Analysis job information
   */
  async analyzeContent({
    contentType,
    contentUrl,
    contentData,
    settings = {},
    userId,
    projectId,
    analysisLevel = 'standard',
    useWorkerPool = true
  }) {
    try {
      logger.info('Starting content analysis', { contentType, contentUrl, userId, projectId, analysisLevel });

      // Check cache first
      const cacheKey = this.generateCacheKey(contentType, contentUrl, contentData, settings, analysisLevel);
      const cachedResult = await this.getCachedAnalysis(cacheKey);
      if (cachedResult) {
        logger.info('Returning cached analysis result', { cacheKey });
        return cachedResult;
      }

      // Create analysis job record
      const job = await this.createAnalysisJob({
        userId,
        projectId,
        contentType,
        contentUrl,
        contentData,
        status: 'queued',
        settings: { ...settings, analysisLevel },
        cacheKey
      });

      // Determine if we should use job queue or worker pool
      if (useWorkerPool && this.shouldUseWorkerPool(contentType, analysisLevel)) {
        // Add to job queue for worker pool processing
        await addJob(JOB_TYPES.CONTENT_ANALYSIS, {
          jobId: job.id,
          contentType,
          contentUrl,
          contentData,
          settings: { ...settings, analysisLevel },
          userId,
          projectId,
          cacheKey
        }, {
          priority: this.getJobPriority(userId, analysisLevel),
          timeout: this.analysisLevels[analysisLevel].timeout
        });
      } else {
        // Add to internal queue for direct processing
        this.analysisQueue.push({
          jobId: job.id,
          contentType,
          contentUrl,
          contentData,
          settings: { ...settings, analysisLevel },
          userId,
          projectId,
          cacheKey,
          createdAt: new Date()
        });

        // Process queue
        this.processQueue();
      }

      return job;
    } catch (error) {
      logger.error('Content analysis failed:', error);
      throw error;
    }
  }

  /**
   * Process analysis queue
   */
  async processQueue() {
    if (this.activeJobs.size >= this.maxConcurrentJobs || this.analysisQueue.length === 0) {
      return;
    }

    const job = this.analysisQueue.shift();
    if (!job) return;

    this.activeJobs.set(job.jobId, job);

    try {
      // Update job status
      await this.updateJobStatus(job.jobId, 'processing', 0);

      let result;

      // Route to appropriate analysis method
      switch (job.contentType) {
        case 'image':
          result = await this.analyzeImage(job);
          break;
        case 'video':
          result = await this.analyzeVideo(job);
          break;
        case 'text':
          result = await this.analyzeText(job);
          break;
        case 'audio':
          result = await this.analyzeAudio(job);
          break;
        default:
          throw new Error(`Unsupported content type: ${job.contentType}`);
      }

      await this.updateJobStatus(job.jobId, 'completed', 100, result);
      logger.info('Content analysis completed', { jobId: job.jobId });
    } catch (error) {
      logger.error('Content analysis failed:', error);
      await this.updateJobStatus(job.jobId, 'failed', 0, null, error.message);
    } finally {
      this.activeJobs.delete(job.jobId);
      
      // Process next job in queue
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Analyze image content
   * @param {Object} job - Analysis job
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeImage(job) {
    try {
      await this.updateJobStatus(job.jobId, 'processing', 20);

      // Scene understanding
      const sceneUnderstanding = await this.analyzeImageScene(job);
      await this.updateJobStatus(job.jobId, 'processing', 40);

      // Object recognition
      const objectRecognition = await this.recognizeObjects(job);
      await this.updateJobStatus(job.jobId, 'processing', 60);

      // Style analysis
      const styleAnalysis = await this.analyzeImageStyle(job);
      await this.updateJobStatus(job.jobId, 'processing', 80);

      // Quality assessment
      const qualityAssessment = await this.assessImageQuality(job);

      return {
        contentType: 'image',
        sceneUnderstanding,
        objectRecognition,
        styleAnalysis,
        qualityAssessment,
        analyzedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Image analysis failed:', error);
      throw new Error('Failed to analyze image');
    }
  }

  /**
   * Analyze video content
   * @param {Object} job - Analysis job
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeVideo(job) {
    try {
      await this.updateJobStatus(job.jobId, 'processing', 10);

      // Extract key frames
      const keyFrames = await this.extractKeyFrames(job);
      await this.updateJobStatus(job.jobId, 'processing', 30);

      // Analyze each key frame
      const frameAnalyses = [];
      for (let i = 0; i < keyFrames.length; i++) {
        const frameAnalysis = await this.analyzeImageFrame(keyFrames[i], job);
        frameAnalyses.push(frameAnalysis);
        await this.updateJobStatus(job.jobId, 'processing', 30 + (40 * (i + 1) / keyFrames.length));
      }

      // Scene understanding
      const sceneUnderstanding = await this.analyzeVideoScenes(frameAnalyses);
      await this.updateJobStatus(job.jobId, 'processing', 80);

      // Motion analysis
      const motionAnalysis = await this.analyzeMotion(job);
      await this.updateJobStatus(job.jobId, 'processing', 90);

      // Quality assessment
      const qualityAssessment = await this.assessVideoQuality(job, frameAnalyses);

      return {
        contentType: 'video',
        keyFrames: frameAnalyses,
        sceneUnderstanding,
        motionAnalysis,
        qualityAssessment,
        analyzedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Video analysis failed:', error);
      throw new Error('Failed to analyze video');
    }
  }

  /**
   * Analyze text content
   * @param {Object} job - Analysis job
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeText(job) {
    try {
      await this.updateJobStatus(job.jobId, 'processing', 20);

      // Sentiment analysis
      const sentimentAnalysis = await this.analyzeSentiment(job);
      await this.updateJobStatus(job.jobId, 'processing', 40);

      // Topic extraction
      const topicExtraction = await this.extractTopics(job);
      await this.updateJobStatus(job.jobId, 'processing', 60);

      // Entity recognition
      const entityRecognition = await this.recognizeEntities(job);
      await this.updateJobStatus(job.jobId, 'processing', 80);

      // Style analysis
      const styleAnalysis = await this.analyzeTextStyle(job);

      return {
        contentType: 'text',
        sentimentAnalysis,
        topicExtraction,
        entityRecognition,
        styleAnalysis,
        analyzedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Text analysis failed:', error);
      throw new Error('Failed to analyze text');
    }
  }

  /**
   * Analyze audio content
   * @param {Object} job - Analysis job
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeAudio(job) {
    try {
      await this.updateJobStatus(job.jobId, 'processing', 20);

      // Speech recognition
      const speechRecognition = await this.recognizeSpeech(job);
      await this.updateJobStatus(job.jobId, 'processing', 40);

      // Audio classification
      const audioClassification = await this.classifyAudio(job);
      await this.updateJobStatus(job.jobId, 'processing', 60);

      // Emotion detection
      const emotionDetection = await this.detectEmotions(job);
      await this.updateJobStatus(job.jobId, 'processing', 80);

      // Quality assessment
      const qualityAssessment = await this.assessAudioQuality(job);

      return {
        contentType: 'audio',
        speechRecognition,
        audioClassification,
        emotionDetection,
        qualityAssessment,
        analyzedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Audio analysis failed:', error);
      throw new Error('Failed to analyze audio');
    }
  }

  /**
   * Analyze image scene using AI
   * @param {Object} job - Analysis job
   * @returns {Promise<Object>} Scene understanding result
   */
  async analyzeImageScene(job) {
    try {
      const result = await aiProviders.openaiAnalyzeImage({
        imageUrl: job.contentUrl,
        prompt: 'Analyze this image and describe the scene',
        systemPrompt: `You are an expert image analyst. Analyze the image and describe the scene in detail.
            
            Format your response as JSON with the following structure:
            {
              "sceneType": "indoor|outdoor|abstract|mixed",
              "environment": "office|nature|urban|home|studio|other",
              "lighting": "natural|artificial|mixed|dramatic|soft",
              "composition": "centered|rule_of_thirds|symmetrical|asymmetrical|leading_lines",
              "mood": "happy|sad|energetic|calm|dramatic|mysterious",
              "description": "Detailed description of the scene",
              "keyElements": ["element1", "element2", "element3"]
            }`,
        maxTokens: 1000,
        temperature: 0.3
      });

      return JSON.parse(result.content);
    } catch (error) {
      logger.error('Scene understanding failed:', error);
      throw error;
    }
  }

  /**
   * Recognize objects in image using AI
   * @param {Object} job - Analysis job
   * @returns {Promise<Object>} Object recognition result
   */
  async recognizeObjects(job) {
    try {
      // Use OpenAI's vision model for object detection
      const result = await aiProviders.openaiAnalyzeImage({
        imageUrl: job.contentUrl,
        prompt: 'Identify all objects in this image with their positions and confidence scores',
        systemPrompt: `You are an object detection expert. Identify all objects in the image.
            
            Format your response as JSON with the following structure:
            {
              "objects": [
                {
                  "name": "object_name",
                  "category": "person|animal|vehicle|furniture|electronics|food|other",
                  "confidence": 0.95,
                  "position": {"x": 0.5, "y": 0.5},
                  "size": {"width": 0.2, "height": 0.3},
                  "attributes": ["attribute1", "attribute2"]
                }
              ],
              "totalCount": 5,
              "mainSubject": "main_object_name"
            }`,
        maxTokens: 1500,
        temperature: 0.1
      });

      return JSON.parse(result.content);
    } catch (error) {
      logger.error('Object recognition failed:', error);
      throw error;
    }
  }

  /**
   * Analyze image style
   * @param {Object} job - Analysis job
   * @returns {Promise<Object>} Style analysis result
   */
  async analyzeImageStyle(job) {
    try {
      const result = await aiProviders.openaiAnalyzeImage({
        imageUrl: job.contentUrl,
        prompt: 'Analyze the artistic style and visual elements of this image',
        systemPrompt: `You are an art and style expert. Analyze the artistic style of the image.
            
            Format your response as JSON with the following structure:
            {
              "artStyle": "realistic|abstract|impressionist|surreal|minimalist|pop_art|other",
              "colorPalette": ["#hex1", "#hex2", "#hex3"],
              "dominantColors": ["color1", "color2", "color3"],
              "visualStyle": "modern|vintage|contemporary|classic|futuristic",
              "composition": "balanced|dynamic|static|chaotic|harmonious",
              "mood": "bright|dark|warm|cool|neutral",
              "techniques": ["technique1", "technique2"],
              "artisticElements": {
                "contrast": "high|medium|low",
                "saturation": "high|medium|low",
                "brightness": "high|medium|low"
              }
            }`,
        maxTokens: 1000,
        temperature: 0.3
      });

      return JSON.parse(result.content);
    } catch (error) {
      logger.error('Style analysis failed:', error);
      throw error;
    }
  }

  /**
   * Assess image quality
   * @param {Object} job - Analysis job
   * @returns {Promise<Object>} Quality assessment result
   */
  async assessImageQuality(job) {
    try {
      // For now, use a mock implementation
      // In a real system, this would use computer vision algorithms
      return {
        overall: 0.85,
        resolution: 'high',
        sharpness: 0.8,
        noise: 0.2,
        exposure: 0.9,
        colorAccuracy: 0.85,
        composition: 0.9,
        technicalDetails: {
          width: 1920,
          height: 1080,
          format: 'JPEG',
          fileSize: '2.3MB'
        },
        recommendations: [
          'Consider increasing contrast for better visual impact',
          'Slightly reduce noise in shadow areas'
        ]
      };
    } catch (error) {
      logger.error('Quality assessment failed:', error);
      throw error;
    }
  }

  /**
   * Extract key frames from video
   * @param {Object} job - Analysis job
   * @returns {Promise<Array>} Array of key frame URLs
   */
  async extractKeyFrames(job) {
    try {
      // Mock implementation - in reality would use FFmpeg
      const frameCount = 5;
      const frames = [];
      
      for (let i = 0; i < frameCount; i++) {
        frames.push({
          index: i,
          timestamp: (i * 100 / frameCount), // Percentage through video
          url: `${job.contentUrl}?frame=${i}`,
          thumbnail: `${job.contentUrl}?thumb=${i}`
        });
      }
      
      return frames;
    } catch (error) {
      logger.error('Key frame extraction failed:', error);
      throw error;
    }
  }

  /**
   * Analyze individual video frame
   * @param {Object} frame - Frame data
   * @param {Object} job - Analysis job
   * @returns {Promise<Object>} Frame analysis result
   */
  async analyzeImageFrame(frame, job) {
    try {
      // Reuse image analysis methods
      const tempJob = {
        ...job,
        contentUrl: frame.url
      };
      
      const sceneUnderstanding = await this.analyzeImageScene(tempJob);
      const objectRecognition = await this.recognizeObjects(tempJob);
      const styleAnalysis = await this.analyzeImageStyle(tempJob);
      
      return {
        frame: frame.index,
        timestamp: frame.timestamp,
        sceneUnderstanding,
        objectRecognition,
        styleAnalysis
      };
    } catch (error) {
      logger.error('Frame analysis failed:', error);
      throw error;
    }
  }

  /**
   * Analyze video scenes
   * @param {Array} frameAnalyses - Array of frame analyses
   * @returns {Promise<Object>} Scene analysis result
   */
  async analyzeVideoScenes(frameAnalyses) {
    try {
      // Group frames into scenes based on similarity
      const scenes = [];
      let currentScene = [frameAnalyses[0]];
      
      for (let i = 1; i < frameAnalyses.length; i++) {
        const similarity = this.calculateSceneSimilarity(
          frameAnalyses[i-1], 
          frameAnalyses[i]
        );
        
        if (similarity > 0.7) {
          currentScene.push(frameAnalyses[i]);
        } else {
          scenes.push(currentScene);
          currentScene = [frameAnalyses[i]];
        }
      }
      
      if (currentScene.length > 0) {
        scenes.push(currentScene);
      }
      
      return {
        sceneCount: scenes.length,
        scenes: scenes.map((scene, index) => ({
          sceneId: index,
          startFrame: scene[0].frame,
          endFrame: scene[scene.length - 1].frame,
          startTime: scene[0].timestamp,
          endTime: scene[scene.length - 1].timestamp,
          duration: scene[scene.length - 1].timestamp - scene[0].timestamp,
          dominantObjects: this.getDominantObjects(scene),
          sceneType: this.getSceneType(scene)
        }))
      };
    } catch (error) {
      logger.error('Video scene analysis failed:', error);
      throw error;
    }
  }

  /**
   * Analyze motion in video
   * @param {Object} job - Analysis job
   * @returns {Promise<Object>} Motion analysis result
   */
  async analyzeMotion(job) {
    try {
      // Mock implementation
      return {
        motionType: 'moderate',
        cameraMovement: 'stable',
        objectMovement: 'dynamic',
        motionIntensity: 0.6,
        motionPatterns: ['pan_left', 'zoom_in', 'static'],
        recommendations: [
          'Consider stabilizing camera movement',
          'Good variety of motion patterns'
        ]
      };
    } catch (error) {
      logger.error('Motion analysis failed:', error);
      throw error;
    }
  }

  /**
   * Assess video quality
   * @param {Object} job - Analysis job
   * @param {Array} frameAnalyses - Array of frame analyses
   * @returns {Promise<Object>} Quality assessment result
   */
  async assessVideoQuality(job, frameAnalyses) {
    try {
      // Mock implementation
      return {
        overall: 0.82,
        resolution: '1080p',
        frameRate: '30fps',
        bitrate: '5Mbps',
        sharpness: 0.8,
        stability: 0.9,
        colorQuality: 0.85,
        audioQuality: 0.78,
        technicalDetails: {
          duration: '2:30',
          format: 'MP4',
          codec: 'H.264',
          fileSize: '45MB'
        },
        recommendations: [
          'Consider increasing bitrate for better quality',
          'Audio levels could be balanced better'
        ]
      };
    } catch (error) {
      logger.error('Video quality assessment failed:', error);
      throw error;
    }
  }

  /**
   * Analyze text sentiment
   * @param {Object} job - Analysis job
   * @returns {Promise<Object>} Sentiment analysis result
   */
  async analyzeSentiment(job) {
    try {
      const result = await aiProviders.openaiGenerateText({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a sentiment analysis expert. Analyze the sentiment of the given text.
            
            Format your response as JSON with the following structure:
            {
              "overall": "positive|negative|neutral",
              "confidence": 0.85,
              "emotions": {
                "joy": 0.6,
                "sadness": 0.1,
                "anger": 0.05,
                "fear": 0.1,
                "surprise": 0.15
              },
              "tone": "formal|informal|professional|casual",
              "subjectivity": 0.7,
              "keyPhrases": ["phrase1", "phrase2"]
            }`
          },
          {
            role: 'user',
            content: `Analyze the sentiment of this text: ${job.contentData || job.contentUrl}`
          }
        ],
        maxTokens: 500,
        temperature: 0.1
      });

      return JSON.parse(result.content);
    } catch (error) {
      logger.error('Sentiment analysis failed:', error);
      throw error;
    }
  }

  /**
   * Extract topics from text
   * @param {Object} job - Analysis job
   * @returns {Promise<Object>} Topic extraction result
   */
  async extractTopics(job) {
    try {
      const response = await global.openai.createChatCompletion({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a topic extraction expert. Identify the main topics in the given text.
            
            Format your response as JSON with the following structure:
            {
              "mainTopics": [
                {
                  "topic": "topic_name",
                  "confidence": 0.9,
                  "keywords": ["keyword1", "keyword2"]
                }
              ],
              "subTopics": [
                {
                  "topic": "subtopic_name",
                  "parentTopic": "main_topic",
                  "confidence": 0.7
                }
              ],
              "categories": ["category1", "category2"],
              "summary": "Brief summary of the main topics"
            }`
          },
          {
            role: 'user',
            content: `Extract topics from this text: ${job.contentData || job.contentUrl}`
          }
        ],
        max_tokens: 800,
        temperature: 0.2
      });

      return JSON.parse(response.data.choices[0].message.content);
    } catch (error) {
      logger.error('Topic extraction failed:', error);
      throw error;
    }
  }

  /**
   * Recognize entities in text
   * @param {Object} job - Analysis job
   * @returns {Promise<Object>} Entity recognition result
   */
  async recognizeEntities(job) {
    try {
      const response = await global.openai.createChatCompletion({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an entity recognition expert. Identify entities in the given text.
            
            Format your response as JSON with the following structure:
            {
              "persons": [
                {
                  "name": "Person Name",
                  "type": "person",
                  "confidence": 0.95,
                  "context": "surrounding text"
                }
              ],
              "organizations": [
                {
                  "name": "Organization Name",
                  "type": "organization",
                  "confidence": 0.9
                }
              ],
              "locations": [
                {
                  "name": "Location Name",
                  "type": "location",
                  "confidence": 0.85
                }
              ],
              "dates": [
                {
                  "value": "2024-01-01",
                  "type": "date",
                  "confidence": 0.95
                }
              ],
              "other": [
                {
                  "name": "Entity Name",
                  "type": "other_type",
                  "confidence": 0.8
                }
              ]
            }`
          },
          {
            role: 'user',
            content: `Recognize entities in this text: ${job.contentData || job.contentUrl}`
          }
        ],
        max_tokens: 1000,
        temperature: 0.1
      });

      return JSON.parse(response.data.choices[0].message.content);
    } catch (error) {
      logger.error('Entity recognition failed:', error);
      throw error;
    }
  }

  /**
   * Analyze text style
   * @param {Object} job - Analysis job
   * @returns {Promise<Object>} Style analysis result
   */
  async analyzeTextStyle(job) {
    try {
      const result = await aiProviders.openaiGenerateText({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a writing style expert. Analyze the writing style of the given text.
            
            Format your response as JSON with the following structure:
            {
              "formality": "formal|informal|semi_formal",
              "complexity": "simple|moderate|complex",
              "tone": "neutral|positive|negative|persuasive|informative",
              "writingStyle": "academic|creative|business|casual|technical",
              "readability": {
                "score": 0.8,
                "level": "high_school",
                "avgSentenceLength": 15.5
              },
              "vocabulary": {
                "richness": 0.7,
                "diversity": 0.8,
                "avgWordLength": 5.2
              },
              "structure": {
                "hasIntroduction": true,
                "hasBody": true,
                "hasConclusion": true,
                "paragraphCount": 5
              }
            }`
          },
          {
            role: 'user',
            content: `Analyze the writing style of this text: ${job.contentData || job.contentUrl}`
          }
        ],
        maxTokens: 800,
        temperature: 0.2
      });

      return JSON.parse(result.content);
    } catch (error) {
      logger.error('Text style analysis failed:', error);
      throw error;
    }
  }

  /**
   * Recognize speech in audio
   * @param {Object} job - Analysis job
   * @returns {Promise<Object>} Speech recognition result
   */
  async recognizeSpeech(job) {
    try {
      // Mock implementation - would use speech-to-text API
      return {
        transcript: "This is a sample transcript of the audio content.",
        confidence: 0.92,
        language: "en-US",
        speakerCount: 1,
        duration: "2:30",
        words: [
          {
            word: "This",
            start: 0.5,
            end: 0.8,
            confidence: 0.95
          },
          {
            word: "is",
            start: 0.9,
            end: 1.1,
            confidence: 0.98
          }
        ]
      };
    } catch (error) {
      logger.error('Speech recognition failed:', error);
      throw error;
    }
  }

  /**
   * Classify audio content
   * @param {Object} job - Analysis job
   * @returns {Promise<Object>} Audio classification result
   */
  async classifyAudio(job) {
    try {
      // Mock implementation
      return {
        audioType: "speech",
        musicGenre: null,
        soundEffects: ["background_noise"],
        environment: "office",
        clarity: 0.85,
        backgroundNoise: 0.3,
        categories: {
          speech: 0.9,
          music: 0.05,
          noise: 0.05
        }
      };
    } catch (error) {
      logger.error('Audio classification failed:', error);
      throw error;
    }
  }

  /**
   * Detect emotions in audio
   * @param {Object} job - Analysis job
   * @returns {Promise<Object>} Emotion detection result
   */
  async detectEmotions(job) {
    try {
      // Mock implementation
      return {
        primaryEmotion: "neutral",
        confidence: 0.75,
        emotions: {
          happy: 0.2,
          sad: 0.1,
          angry: 0.05,
          fearful: 0.1,
          surprised: 0.15,
          disgusted: 0.05,
          neutral: 0.35
        },
        emotionTimeline: [
          {
            timestamp: 0.5,
            emotion: "neutral",
            confidence: 0.8
          }
        ]
      };
    } catch (error) {
      logger.error('Emotion detection failed:', error);
      throw error;
    }
  }

  /**
   * Assess audio quality
   * @param {Object} job - Analysis job
   * @returns {Promise<Object>} Quality assessment result
   */
  async assessAudioQuality(job) {
    try {
      // Mock implementation
      return {
        overall: 0.82,
        clarity: 0.85,
        volume: 0.8,
        noise: 0.2,
        distortion: 0.1,
        technicalDetails: {
          sampleRate: "44.1kHz",
          bitrate: "320kbps",
          format: "MP3",
          channels: "stereo",
          duration: "2:30"
        },
        recommendations: [
          "Consider reducing background noise",
          "Volume levels are good"
        ]
      };
    } catch (error) {
      logger.error('Audio quality assessment failed:', error);
      throw error;
    }
  }

  /**
   * Calculate scene similarity between frames
   * @param {Object} frame1 - First frame analysis
   * @param {Object} frame2 - Second frame analysis
   * @returns {number} Similarity score (0-1)
   */
  calculateSceneSimilarity(frame1, frame2) {
    // Simple similarity calculation based on scene type and objects
    let similarity = 0;
    
    if (frame1.sceneUnderstanding.sceneType === frame2.sceneUnderstanding.sceneType) {
      similarity += 0.3;
    }
    
    const objects1 = frame1.objectRecognition.objects.map(o => o.name);
    const objects2 = frame2.objectRecognition.objects.map(o => o.name);
    const commonObjects = objects1.filter(o => objects2.includes(o));
    similarity += (commonObjects.length / Math.max(objects1.length, objects2.length)) * 0.4;
    
    if (frame1.styleAnalysis.artStyle === frame2.styleAnalysis.artStyle) {
      similarity += 0.3;
    }
    
    return similarity;
  }

  /**
   * Get dominant objects from scene
   * @param {Array} scene - Array of frame analyses
   * @returns {Array} Dominant objects
   */
  getDominantObjects(scene) {
    const objectCounts = {};
    
    scene.forEach(frame => {
      frame.objectRecognition.objects.forEach(obj => {
        objectCounts[obj.name] = (objectCounts[obj.name] || 0) + 1;
      });
    });
    
    return Object.entries(objectCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  }

  /**
   * Get scene type from scene
   * @param {Array} scene - Array of frame analyses
   * @returns {string} Scene type
   */
  getSceneType(scene) {
    const sceneTypes = scene.map(frame => frame.sceneUnderstanding.sceneType);
    const typeCounts = {};
    
    sceneTypes.forEach(type => {
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    
    return Object.entries(typeCounts)
      .sort(([,a], [,b]) => b - a)[0][0];
  }

  /**
   * Create analysis job record
   * @param {Object} jobData - Job data
   * @returns {Promise<Object>} Created job
   */
  async createAnalysisJob(jobData) {
    const result = await query(
      `INSERT INTO analysis_jobs (project_id, user_id, content_type, content_url, content_data, status, settings, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) 
       RETURNING *`,
      [
        jobData.projectId,
        jobData.userId,
        jobData.contentType,
        jobData.contentUrl,
        jobData.contentData ? JSON.stringify(jobData.contentData) : null,
        jobData.status,
        JSON.stringify(jobData.settings)
      ]
    );

    return result.rows[0];
  }

  /**
   * Update job status
   * @param {string} jobId - Job ID
   * @param {string} status - New status
   * @param {number} progress - Progress percentage
   * @param {Object} result - Analysis result
   * @param {string} errorMessage - Error message
   */
  async updateJobStatus(jobId, status, progress, result = null, errorMessage = null) {
    await query(
      `UPDATE analysis_jobs 
       SET status = $1, progress = $2, result = $3, error_message = $4, 
           started_at = CASE WHEN started_at IS NULL AND $1 = 'processing' THEN NOW() ELSE started_at END,
           completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN NOW() ELSE completed_at END
       WHERE id = $5`,
      [
        status,
        progress,
        result ? JSON.stringify(result) : null,
        errorMessage,
        jobId
      ]
    );

    // Cache status for real-time updates
    await cache.set(`analysis_job:${jobId}`, {
      status,
      progress,
      result,
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
    const cached = await cache.get(`analysis_job:${jobId}`);
    if (cached) {
      return cached;
    }

    // Fallback to database
    const result = await query(
      'SELECT * FROM analysis_jobs WHERE id = $1',
      [jobId]
    );

    return result.rows[0];
  }

  /**
   * Cancel analysis job
   * @param {string} jobId - Job ID
   * @returns {Promise<boolean>} Success status
   */
  async cancelJob(jobId) {
    try {
      // Remove from queue if pending
      this.analysisQueue = this.analysisQueue.filter(job => job.jobId !== jobId);
      
      // Update status in database
      await this.updateJobStatus(jobId, 'cancelled', 0);
      
      logger.info('Analysis job cancelled', { jobId });
      return true;
    } catch (error) {
      logger.error('Failed to cancel analysis job:', error);
      return false;
    }
  }

  /**
   * Generate content embeddings for similarity matching
   * @param {Object} params - Embedding parameters
   * @param {string} params.contentType - Content type
   * @param {string} params.contentUrl - Content URL
   * @param {Object} params.contentData - Direct content data
   * @param {string} params.analysisResult - Analysis result to embed
   * @returns {Promise<Object>} Embedding result
   */
  async generateContentEmbedding({ contentType, contentUrl, contentData, analysisResult }) {
    try {
      logger.info('Generating content embedding', { contentType, contentUrl });
      
      // Prepare text representation based on content type and analysis
      let textRepresentation = '';
      
      switch (contentType) {
        case 'image':
          textRepresentation = this.imageToTextRepresentation(analysisResult);
          break;
        case 'video':
          textRepresentation = this.videoToTextRepresentation(analysisResult);
          break;
        case 'audio':
          textRepresentation = this.audioToTextRepresentation(analysisResult);
          break;
        case 'text':
          textRepresentation = contentData || contentUrl;
          break;
        default:
          throw new Error(`Unsupported content type for embedding: ${contentType}`);
      }
      
      // Generate embedding using OpenAI
      const embeddingResult = await aiProviders.openaiGenerateText({
        model: 'text-embedding-ada-002',
        input: textRepresentation,
        maxTokens: 8000
      });
      
      // Store embedding for future similarity searches
      const embeddingId = await this.storeEmbedding({
        contentType,
        contentUrl,
        embedding: embeddingResult.embedding,
        metadata: analysisResult
      });
      
      return {
        embeddingId,
        embedding: embeddingResult.embedding,
        dimensions: embeddingResult.embedding.length,
        textRepresentation: textRepresentation.substring(0, 200) + '...'
      };
    } catch (error) {
      logger.error('Failed to generate content embedding:', error);
      throw error;
    }
  }

  /**
   * Perform cross-modal analysis between different content types
   * @param {Array} contentItems - Array of content items to analyze
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Cross-modal analysis result
   */
  async performCrossModalAnalysis(contentItems, options = {}) {
    try {
      logger.info('Performing cross-modal analysis', { contentCount: contentItems.length });
      
      // Generate embeddings for all content items
      const embeddings = await Promise.all(
        contentItems.map(item =>
          this.generateContentEmbedding({
            contentType: item.contentType,
            contentUrl: item.contentUrl,
            contentData: item.contentData,
            analysisResult: item.analysisResult
          })
        )
      );
      
      // Calculate similarity matrix
      const similarityMatrix = this.calculateSimilarityMatrix(embeddings);
      
      // Identify patterns and relationships
      const patterns = this.identifyCrossModalPatterns(contentItems, similarityMatrix);
      
      // Generate insights
      const insights = await this.generateCrossModalInsights(contentItems, patterns);
      
      return {
        contentItems: contentItems.length,
        embeddings: embeddings.map(e => ({ embeddingId: e.embeddingId, dimensions: e.dimensions })),
        similarityMatrix,
        patterns,
        insights,
        analyzedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Cross-modal analysis failed:', error);
      throw error;
    }
  }

  /**
   * Process batch of content items for analysis
   * @param {Array} contentBatch - Array of content items to analyze
   * @param {Object} options - Batch processing options
   * @returns {Promise<Object>} Batch processing result
   */
  async processBatchAnalysis(contentBatch, options = {}) {
    try {
      logger.info('Starting batch content analysis', { batchSize: contentBatch.length });
      
      const {
        analysisLevel = 'standard',
        priority = 'normal',
        onProgress = null
      } = options;
      
      const results = [];
      const errors = [];
      
      // Process in chunks to avoid overwhelming the system
      const chunks = this.chunkArray(contentBatch, this.batchProcessing.batchSize);
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        // Process chunk with concurrency control
        const chunkPromises = chunk.map(async (item, index) => {
          try {
            const result = await this.analyzeContent({
              contentType: item.contentType,
              contentUrl: item.contentUrl,
              contentData: item.contentData,
              userId: item.userId,
              projectId: item.projectId,
              analysisLevel,
              useWorkerPool: true
            });
            
            return { index: i * this.batchProcessing.batchSize + index, result, item };
          } catch (error) {
            return { index: i * this.batchProcessing.batchSize + index, error, item };
          }
        });
        
        const chunkResults = await Promise.allSettled(chunkPromises);
        
        // Process results
        chunkResults.forEach(promiseResult => {
          if (promiseResult.status === 'fulfilled') {
            if (promiseResult.value.error) {
              errors.push(promiseResult.value);
            } else {
              results.push(promiseResult.value);
            }
          } else {
            errors.push({
              error: promiseResult.reason,
              item: promiseResult.reason.item || 'unknown'
            });
          }
        });
        
        // Report progress
        if (onProgress) {
          onProgress({
            completed: Math.min((i + 1) * this.batchProcessing.batchSize, contentBatch.length),
            total: contentBatch.length,
            percentage: Math.round(((i + 1) * this.batchProcessing.batchSize / contentBatch.length) * 100)
          });
        }
        
        // Add delay between chunks to prevent rate limiting
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Generate batch summary
      const summary = await this.generateBatchSummary(results, errors);
      
      return {
        batchId: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        totalItems: contentBatch.length,
        successful: results.length,
        failed: errors.length,
        results,
        errors,
        summary,
        processedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Batch analysis failed:', error);
      throw error;
    }
  }

  /**
   * Detect content quality and appropriateness
   * @param {Object} params - Quality assessment parameters
   * @param {string} params.contentType - Content type
   * @param {Object} params.analysisResult - Analysis result to assess
   * @param {Object} params.options - Assessment options
   * @returns {Promise<Object>} Quality assessment result
   */
  async detectContentQualityAndAppropriateness({ contentType, analysisResult, options = {} }) {
    try {
      logger.info('Assessing content quality and appropriateness', { contentType });
      
      const { strictness = 'standard' } = options;
      
      // Prepare assessment prompt based on content type
      let assessmentPrompt = '';
      let assessmentData = analysisResult;
      
      switch (contentType) {
        case 'image':
          assessmentPrompt = `Assess the quality and appropriateness of this image analysis: ${JSON.stringify(assessmentData)}`;
          break;
        case 'video':
          assessmentPrompt = `Assess the quality and appropriateness of this video analysis: ${JSON.stringify(assessmentData)}`;
          break;
        case 'audio':
          assessmentPrompt = `Assess the quality and appropriateness of this audio analysis: ${JSON.stringify(assessmentData)}`;
          break;
        case 'text':
          assessmentPrompt = `Assess the quality and appropriateness of this text analysis: ${JSON.stringify(assessmentData)}`;
          break;
      }
      
      // Use AI to assess quality and appropriateness
      const result = await aiProviders.openaiGenerateText({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a content moderation and quality assessment expert.
            Assess the provided content analysis for quality and appropriateness.
            
            Use a ${strictness} level of strictness for assessment.
            
            Format your response as JSON with the following structure:
            {
              "qualityScore": 0.85,
              "appropriatenessScore": 0.9,
              "qualityFactors": {
                "technical": 0.8,
                "aesthetic": 0.9,
                "content": 0.85
              },
              "appropriatenessFactors": {
                "safety": 0.95,
                "appropriateness": 0.9,
                "context": 0.85
              },
              "issues": [
                {
                  "type": "quality|appropriateness",
                  "severity": "low|medium|high",
                  "description": "Description of the issue",
                  "suggestion": "How to fix the issue"
                }
              ],
              "recommendations": [
                "Recommendation 1",
                "Recommendation 2"
              ],
              "approved": true,
              "confidence": 0.9
            }`
          },
          {
            role: 'user',
            content: assessmentPrompt
          }
        ],
        maxTokens: 1000,
        temperature: 0.2
      });
      
      const assessment = JSON.parse(result.content);
      
      // Store assessment for future reference
      await this.storeQualityAssessment({
        contentType,
        analysisResult,
        assessment,
        strictness
      });
      
      return assessment;
    } catch (error) {
      logger.error('Content quality assessment failed:', error);
      throw error;
    }
  }

  /**
   * Extract metadata for search and recommendation
   * @param {Object} params - Metadata extraction parameters
   * @param {string} params.contentType - Content type
   * @param {Object} params.analysisResult - Analysis result
   * @param {Object} params.options - Extraction options
   * @returns {Promise<Object>} Extracted metadata
   */
  async extractMetadataForSearchAndRecommendation({ contentType, analysisResult, options = {} }) {
    try {
      logger.info('Extracting metadata for search and recommendation', { contentType });
      
      const { includeEmbeddings = true, includeTags = true } = options;
      
      // Extract base metadata from analysis result
      const baseMetadata = this.extractBaseMetadata(contentType, analysisResult);
      
      // Generate tags if requested
      let tags = [];
      if (includeTags) {
        tags = await this.generateContentTags(contentType, analysisResult);
      }
      
      // Generate embeddings if requested
      let embeddings = null;
      if (includeEmbeddings) {
        embeddings = await this.generateContentEmbedding({
          contentType,
          analysisResult,
          contentUrl: analysisResult.contentUrl,
          contentData: analysisResult.contentData
        });
      }
      
      // Extract searchable text
      const searchableText = this.extractSearchableText(contentType, analysisResult);
      
      // Generate categories
      const categories = await this.categorizeContent(contentType, analysisResult);
      
      const metadata = {
        contentType,
        baseMetadata,
        tags,
        embeddings,
        searchableText,
        categories,
        extractedAt: new Date().toISOString()
      };
      
      // Store metadata for search
      await this.storeSearchMetadata(metadata);
      
      return metadata;
    } catch (error) {
      logger.error('Metadata extraction failed:', error);
      throw error;
    }
  }

  /**
   * Export analysis data in various formats
   * @param {Object} params - Export parameters
   * @param {string} params.jobId - Job ID to export
   * @param {string} params.format - Export format (json, csv, xml)
   * @param {Object} params.options - Export options
   * @returns {Promise<Object>} Export result
   */
  async exportAnalysisData({ jobId, format = 'json', options = {} }) {
    try {
      logger.info('Exporting analysis data', { jobId, format });
      
      // Get analysis result
      const job = await this.getJobStatus(jobId);
      if (!job) {
        throw new Error(`Analysis job not found: ${jobId}`);
      }
      
      const { includeMetadata = true, includeRawData = false } = options;
      
      // Prepare export data
      const exportData = {
        jobId,
        contentType: job.content_type,
        userId: job.user_id,
        projectId: job.project_id,
        analysisResult: job.result,
        exportedAt: new Date().toISOString()
      };
      
      if (includeMetadata) {
        exportData.metadata = {
          createdAt: job.created_at,
          startedAt: job.started_at,
          completedAt: job.completed_at,
          status: job.status,
          settings: job.settings
        };
      }
      
      if (includeRawData) {
        exportData.rawData = {
          contentUrl: job.content_url,
          contentData: job.content_data
        };
      }
      
      // Format based on requested format
      let formattedData;
      let mimeType;
      
      switch (format.toLowerCase()) {
        case 'json':
          formattedData = JSON.stringify(exportData, null, 2);
          mimeType = 'application/json';
          break;
        case 'csv':
          formattedData = this.convertToCSV(exportData);
          mimeType = 'text/csv';
          break;
        case 'xml':
          formattedData = this.convertToXML(exportData);
          mimeType = 'application/xml';
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
      
      // Store export record
      const exportId = await this.storeExportRecord({
        jobId,
        format,
        size: formattedData.length,
        options
      });
      
      return {
        exportId,
        data: formattedData,
        mimeType,
        filename: `analysis_${jobId}_${Date.now()}.${format}`,
        size: formattedData.length
      };
    } catch (error) {
      logger.error('Analysis data export failed:', error);
      throw error;
    }
  }

  // Helper methods

  /**
   * Generate cache key for analysis results
   * @param {string} contentType - Content type
   * @param {string} contentUrl - Content URL
   * @param {Object} contentData - Content data
   * @param {Object} settings - Analysis settings
   * @param {string} analysisLevel - Analysis level
   * @returns {string} Cache key
   */
  generateCacheKey(contentType, contentUrl, contentData, settings, analysisLevel) {
    const keyData = {
      contentType,
      contentUrl,
      contentData: contentData ? JSON.stringify(contentData) : '',
      settings: JSON.stringify(settings),
      analysisLevel
    };
    
    const hash = crypto
      .createHash('md5')
      .update(JSON.stringify(keyData))
      .digest('hex');
    
    return `content_analysis:${hash}`;
  }

  /**
   * Get cached analysis result
   * @param {string} cacheKey - Cache key
   * @returns {Promise<Object|null>} Cached result or null
   */
  async getCachedAnalysis(cacheKey) {
    try {
      return await cache.get(cacheKey);
    } catch (error) {
      logger.warn('Failed to get cached analysis:', error);
      return null;
    }
  }

  /**
   * Determine if worker pool should be used
   * @param {string} contentType - Content type
   * @param {string} analysisLevel - Analysis level
   * @returns {boolean} Whether to use worker pool
   */
  shouldUseWorkerPool(contentType, analysisLevel) {
    // Use worker pool for video analysis and comprehensive analysis
    return contentType === 'video' || analysisLevel === 'comprehensive';
  }

  /**
   * Get job priority based on user and analysis level
   * @param {string} userId - User ID
   * @param {string} analysisLevel - Analysis level
   * @returns {string} Job priority
   */
  getJobPriority(userId, analysisLevel) {
    // In a real implementation, this would check user subscription
    // For now, base priority on analysis level
    switch (analysisLevel) {
      case 'comprehensive': return 'high';
      case 'standard': return 'normal';
      case 'basic': return 'low';
      default: return 'normal';
    }
  }

  /**
   * Convert image analysis to text representation for embedding
   * @param {Object} analysisResult - Image analysis result
   * @returns {string} Text representation
   */
  imageToTextRepresentation(analysisResult) {
    const { sceneUnderstanding, objectRecognition, styleAnalysis } = analysisResult;
    
    return [
      `Scene: ${sceneUnderstanding?.description || ''}`,
      `Objects: ${objectRecognition?.objects?.map(o => o.name).join(', ') || ''}`,
      `Style: ${styleAnalysis?.artStyle || ''}`,
      `Mood: ${sceneUnderstanding?.mood || ''}`,
      `Colors: ${styleAnalysis?.dominantColors?.join(', ') || ''}`
    ].filter(Boolean).join('. ');
  }

  /**
   * Convert video analysis to text representation for embedding
   * @param {Object} analysisResult - Video analysis result
   * @returns {string} Text representation
   */
  videoToTextRepresentation(analysisResult) {
    const { sceneUnderstanding, motionAnalysis } = analysisResult;
    
    return [
      `Scenes: ${sceneUnderstanding?.scenes?.map(s => s.sceneType).join(', ') || ''}`,
      `Motion: ${motionAnalysis?.motionType || ''}`,
      `Camera Movement: ${motionAnalysis?.cameraMovement || ''}`,
      `Duration: ${analysisResult?.duration || ''}`
    ].filter(Boolean).join('. ');
  }

  /**
   * Convert audio analysis to text representation for embedding
   * @param {Object} analysisResult - Audio analysis result
   * @returns {string} Text representation
   */
  audioToTextRepresentation(analysisResult) {
    const { speechRecognition, audioClassification, emotionDetection } = analysisResult;
    
    return [
      `Transcript: ${speechRecognition?.transcript || ''}`,
      `Audio Type: ${audioClassification?.audioType || ''}`,
      `Emotion: ${emotionDetection?.primaryEmotion || ''}`,
      `Language: ${speechRecognition?.language || ''}`
    ].filter(Boolean).join('. ');
  }

  /**
   * Calculate similarity matrix between embeddings
   * @param {Array} embeddings - Array of embedding objects
   * @returns {Array} Similarity matrix
   */
  calculateSimilarityMatrix(embeddings) {
    const matrix = [];
    
    for (let i = 0; i < embeddings.length; i++) {
      const row = [];
      for (let j = 0; j < embeddings.length; j++) {
        const similarity = this.cosineSimilarity(
          embeddings[i].embedding,
          embeddings[j].embedding
        );
        row.push(similarity);
      }
      matrix.push(row);
    }
    
    return matrix;
  }

  /**
   * Calculate cosine similarity between two vectors
   * @param {Array} vecA - First vector
   * @param {Array} vecB - Second vector
   * @returns {number} Similarity score
   */
  cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    return dotProduct / (normA * normB);
  }

  /**
   * Identify cross-modal patterns
   * @param {Array} contentItems - Content items
   * @param {Array} similarityMatrix - Similarity matrix
   * @returns {Array} Identified patterns
   */
  identifyCrossModalPatterns(contentItems, similarityMatrix) {
    const patterns = [];
    
    // Find highly similar content across different types
    for (let i = 0; i < contentItems.length; i++) {
      for (let j = i + 1; j < contentItems.length; j++) {
        if (contentItems[i].contentType !== contentItems[j].contentType) {
          const similarity = similarityMatrix[i][j];
          
          if (similarity > 0.8) {
            patterns.push({
              type: 'cross_modal_similarity',
              content1: contentItems[i],
              content2: contentItems[j],
              similarity,
              description: `High similarity between ${contentItems[i].contentType} and ${contentItems[j].contentType}`
            });
          }
        }
      }
    }
    
    return patterns;
  }

  /**
   * Generate cross-modal insights
   * @param {Array} contentItems - Content items
   * @param {Array} patterns - Identified patterns
   * @returns {Promise<Array>} Generated insights
   */
  async generateCrossModalInsights(contentItems, patterns) {
    try {
      const prompt = `Analyze these content items and patterns to generate insights:
      
      Content Items: ${JSON.stringify(contentItems.map(item => ({
        type: item.contentType,
        summary: item.analysisResult?.sceneUnderstanding?.description || item.analysisResult?.sentimentAnalysis?.overall || 'N/A'
      })))}
      
      Patterns: ${JSON.stringify(patterns)}
      
      Generate insights about:
      1. Content relationships
      2. Thematic connections
      3. Recommendations for content creation
      
      Format as JSON array of insight objects.`;
      
      const result = await aiProviders.openaiGenerateText({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in content analysis and cross-modal understanding.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        maxTokens: 1000,
        temperature: 0.3
      });
      
      return JSON.parse(result.content);
    } catch (error) {
      logger.error('Failed to generate cross-modal insights:', error);
      return [];
    }
  }

  /**
   * Chunk array into smaller arrays
   * @param {Array} array - Array to chunk
   * @param {number} size - Chunk size
   * @returns {Array} Array of chunks
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Generate batch summary
   * @param {Array} results - Successful results
   * @param {Array} errors - Errors
   * @returns {Promise<Object>} Batch summary
   */
  async generateBatchSummary(results, errors) {
    try {
      const contentTypeDistribution = {};
      const avgProcessingTime = results.reduce((sum, job) => {
        const time = new Date(job.completed_at) - new Date(job.started_at);
        contentTypeDistribution[job.content_type] = (contentTypeDistribution[job.content_type] || 0) + 1;
        return sum + time;
      }, 0) / results.length;
      
      return {
        totalProcessed: results.length + errors.length,
        successRate: (results.length / (results.length + errors.length)) * 100,
        contentTypeDistribution,
        avgProcessingTime,
        errorTypes: errors.reduce((types, error) => {
          types[error.error.name] = (types[error.error.name] || 0) + 1;
          return types;
        }, {})
      };
    } catch (error) {
      logger.error('Failed to generate batch summary:', error);
      return {};
    }
  }

  /**
   * Store embedding in database
   * @param {Object} embeddingData - Embedding data
   * @returns {Promise<string>} Embedding ID
   */
  async storeEmbedding(embeddingData) {
    try {
      const result = await query(
        `INSERT INTO content_embeddings (content_type, content_url, embedding, metadata, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id`,
        [
          embeddingData.contentType,
          embeddingData.contentUrl,
          JSON.stringify(embeddingData.embedding),
          JSON.stringify(embeddingData.metadata)
        ]
      );
      
      return result.rows[0].id;
    } catch (error) {
      logger.error('Failed to store embedding:', error);
      throw error;
    }
  }

  /**
   * Store quality assessment in database
   * @param {Object} assessmentData - Assessment data
   * @returns {Promise<void>}
   */
  async storeQualityAssessment(assessmentData) {
    try {
      await query(
        `INSERT INTO quality_assessments (content_type, analysis_result, assessment, strictness, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [
          assessmentData.contentType,
          JSON.stringify(assessmentData.analysisResult),
          JSON.stringify(assessmentData.assessment),
          assessmentData.strictness
        ]
      );
    } catch (error) {
      logger.error('Failed to store quality assessment:', error);
      throw error;
    }
  }

  /**
   * Store search metadata in database
   * @param {Object} metadata - Metadata to store
   * @returns {Promise<void>}
   */
  async storeSearchMetadata(metadata) {
    try {
      await query(
        `INSERT INTO search_metadata (content_type, base_metadata, tags, embeddings, searchable_text, categories, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          metadata.contentType,
          JSON.stringify(metadata.baseMetadata),
          JSON.stringify(metadata.tags),
          JSON.stringify(metadata.embeddings),
          metadata.searchableText,
          JSON.stringify(metadata.categories)
        ]
      );
    } catch (error) {
      logger.error('Failed to store search metadata:', error);
      throw error;
    }
  }

  /**
   * Store export record in database
   * @param {Object} exportData - Export data
   * @returns {Promise<string>} Export ID
   */
  async storeExportRecord(exportData) {
    try {
      const result = await query(
        `INSERT INTO analysis_exports (job_id, format, size, options, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id`,
        [
          exportData.jobId,
          exportData.format,
          exportData.size,
          JSON.stringify(exportData.options)
        ]
      );
      
      return result.rows[0].id;
    } catch (error) {
      logger.error('Failed to store export record:', error);
      throw error;
    }
  }

  /**
   * Extract base metadata from analysis result
   * @param {string} contentType - Content type
   * @param {Object} analysisResult - Analysis result
   * @returns {Object} Base metadata
   */
  extractBaseMetadata(contentType, analysisResult) {
    const metadata = { contentType };
    
    switch (contentType) {
      case 'image':
        metadata.scene = analysisResult.sceneUnderstanding?.sceneType;
        metadata.objects = analysisResult.objectRecognition?.objects?.map(o => o.name);
        metadata.style = analysisResult.styleAnalysis?.artStyle;
        metadata.colors = analysisResult.styleAnalysis?.dominantColors;
        break;
      case 'video':
        metadata.scenes = analysisResult.sceneUnderstanding?.scenes?.length;
        metadata.motion = analysisResult.motionAnalysis?.motionType;
        metadata.duration = analysisResult.duration;
        break;
      case 'audio':
        metadata.transcript = analysisResult.speechRecognition?.transcript;
        metadata.emotion = analysisResult.emotionDetection?.primaryEmotion;
        metadata.language = analysisResult.speechRecognition?.language;
        break;
      case 'text':
        metadata.sentiment = analysisResult.sentimentAnalysis?.overall;
        metadata.topics = analysisResult.topicExtraction?.mainTopics?.map(t => t.topic);
        metadata.entities = analysisResult.entityRecognition;
        metadata.style = analysisResult.styleAnalysis?.writingStyle;
        break;
    }
    
    return metadata;
  }

  /**
   * Generate content tags
   * @param {string} contentType - Content type
   * @param {Object} analysisResult - Analysis result
   * @returns {Promise<Array>} Generated tags
   */
  async generateContentTags(contentType, analysisResult) {
    try {
      const prompt = `Generate relevant tags for this ${contentType} content analysis:
      
      ${JSON.stringify(analysisResult)}
      
      Generate 5-10 descriptive tags that would be useful for search and recommendation.
      Format as JSON array of strings.`;
      
      const result = await aiProviders.openaiGenerateText({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in content tagging and metadata generation.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        maxTokens: 200,
        temperature: 0.3
      });
      
      return JSON.parse(result.content);
    } catch (error) {
      logger.error('Failed to generate content tags:', error);
      return [];
    }
  }

  /**
   * Extract searchable text from analysis result
   * @param {string} contentType - Content type
   * @param {Object} analysisResult - Analysis result
   * @returns {string} Searchable text
   */
  extractSearchableText(contentType, analysisResult) {
    switch (contentType) {
      case 'image':
        return [
          analysisResult.sceneUnderstanding?.description || '',
          analysisResult.objectRecognition?.objects?.map(o => o.name).join(' ') || '',
          analysisResult.styleAnalysis?.artStyle || ''
        ].filter(Boolean).join(' ');
      case 'video':
        return [
          analysisResult.sceneUnderstanding?.scenes?.map(s => s.sceneType).join(' ') || '',
          analysisResult.motionAnalysis?.motionType || ''
        ].filter(Boolean).join(' ');
      case 'audio':
        return [
          analysisResult.speechRecognition?.transcript || '',
          analysisResult.audioClassification?.audioType || ''
        ].filter(Boolean).join(' ');
      case 'text':
        return analysisResult.contentData || '';
      default:
        return '';
    }
  }

  /**
   * Categorize content
   * @param {string} contentType - Content type
   * @param {Object} analysisResult - Analysis result
   * @returns {Promise<Array>} Content categories
   */
  async categorizeContent(contentType, analysisResult) {
    try {
      const prompt = `Categorize this ${contentType} content:
      
      ${JSON.stringify(analysisResult)}
      
      Provide 3-5 relevant categories from this list:
      - Technology
      - Business
      - Education
      - Entertainment
      - Lifestyle
      - News
      - Science
      - Arts
      - Sports
      - Travel
      - Food
      - Fashion
      - Health
      - Other
      
      Format as JSON array of category names.`;
      
      const result = await aiProviders.openaiGenerateText({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in content categorization.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        maxTokens: 200,
        temperature: 0.2
      });
      
      return JSON.parse(result.content);
    } catch (error) {
      logger.error('Failed to categorize content:', error);
      return ['Other'];
    }
  }

  /**
   * Convert data to CSV format
   * @param {Object} data - Data to convert
   * @returns {string} CSV string
   */
  convertToCSV(data) {
    // Simple CSV conversion - in production, use a proper CSV library
    const flatten = (obj, prefix = '') => {
      const flattened = {};
      
      for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          Object.assign(flattened, flatten(obj[key], `${prefix}${key}.`));
        } else {
          flattened[`${prefix}${key}`] = obj[key];
        }
      }
      
      return flattened;
    };
    
    const flattened = flatten(data);
    const headers = Object.keys(flattened);
    const values = headers.map(header => `"${flattened[header] || ''}"`);
    
    return [headers.join(','), values.join(',')].join('\n');
  }

  /**
   * Convert data to XML format
   * @param {Object} data - Data to convert
   * @returns {string} XML string
   */
  convertToXML(data) {
    // Simple XML conversion - in production, use a proper XML library
    const convertToXML = (obj, indent = 0) => {
      const spaces = '  '.repeat(indent);
      let xml = '';
      
      for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          xml += `${spaces}<${key}>\n${convertToXML(obj[key], indent + 1)}${spaces}</${key}>\n`;
        } else {
          xml += `${spaces}<${key}>${obj[key]}</${key}>\n`;
        }
      }
      
      return xml;
    };
    
    return `<?xml version="1.0" encoding="UTF-8"?>\n<analysis>\n${convertToXML(data)}</analysis>`;
  }
}

module.exports = new ContentAnalysisService();
  /**
   * Find similar content based on embedding
   * @param {string} embeddingId - Embedding ID
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Similar content items
   */
  async findSimilarContent(embeddingId, options = {}) {
    try {
      const { limit = 10, threshold = 0.7 } = options;
      
      // Get embedding to compare
      const embeddingResult = await query(
        'SELECT embedding FROM content_embeddings WHERE id = $1',
        [embeddingId]
      );
      
      if (embeddingResult.rows.length === 0) {
        throw new Error(`Embedding not found: ${embeddingId}`);
      }
      
      const targetEmbedding = JSON.parse(embeddingResult.rows[0].embedding);
      
      // Find similar embeddings
      const similarEmbeddings = await query(`
        SELECT 
          ce.id,
          ce.content_type,
          ce.content_url,
          ce.metadata,
          ce.embedding,
          (ce.embedding <-> $2::vector) as similarity
        FROM content_embeddings ce
        WHERE ce.id != $1
          AND (ce.embedding <-> $2::vector) > $3
        ORDER BY similarity DESC
        LIMIT $4
      `, [embeddingId, JSON.stringify(targetEmbedding), threshold, limit]);
      
      return similarEmbeddings.rows.map(row => ({
        embeddingId: row.id,
        contentType: row.content_type,
        contentUrl: row.content_url,
        metadata: JSON.parse(row.metadata),
        similarity: row.similarity
      }));
    } catch (error) {
      logger.error('Failed to find similar content:', error);
      throw error;
    }
  }

  /**
   * Get analysis statistics for a user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Analysis statistics
   */
  async getAnalysisStats(userId, options = {}) {
    try {
      const { timeframe = '30d', contentType } = options;
      
      // Calculate date range based on timeframe
      const dateRange = this.calculateDateRange(timeframe);
      
      // Build query conditions
      let whereConditions = ['user_id = $1', 'created_at >= $2', 'created_at <= $3'];
      let queryParams = [userId, dateRange.start, dateRange.end];
      
      if (contentType) {
        whereConditions.push('content_type = $' + (queryParams.length + 1));
        queryParams.push(contentType);
      }
      
      // Get statistics
      const statsQuery = `
        SELECT 
          COUNT(*) as total_analyses,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
          AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_processing_time,
          content_type
        FROM analysis_jobs
        WHERE ${whereConditions.join(' AND ')}
        GROUP BY content_type
      `;
      
      const result = await query(statsQuery, queryParams);
      
      // Calculate overall stats
      const totalAnalyses = result.rows.reduce((sum, row) => sum + parseInt(row.total_analyses), 0);
      const completedAnalyses = result.rows.reduce((sum, row) => sum + parseInt(row.completed), 0);
      const failedAnalyses = result.rows.reduce((sum, row) => sum + parseInt(row.failed), 0);
      const cancelledAnalyses = result.rows.reduce((sum, row) => sum + parseInt(row.cancelled), 0);
      const avgProcessingTime = result.rows.reduce((sum, row) => sum + (parseFloat(row.avg_processing_time) || 0), 0) / result.rows.length;
      
      return {
        timeframe,
        totalAnalyses,
        completedAnalyses,
        failedAnalyses,
        cancelledAnalyses,
        successRate: totalAnalyses > 0 ? (completedAnalyses / totalAnalyses) * 100 : 0,
        avgProcessingTime: avgProcessingTime || 0,
        byContentType: result.rows.map(row => ({
          contentType: row.content_type,
          total: parseInt(row.total_analyses),
          completed: parseInt(row.completed),
          failed: parseInt(row.failed),
          cancelled: parseInt(row.cancelled),
          avgProcessingTime: parseFloat(row.avg_processing_time) || 0
        }))
      };
    } catch (error) {
      logger.error('Failed to get analysis stats:', error);
      throw error;
    }
  }

  /**
   * Calculate date range based on timeframe string
   * @param {string} timeframe - Timeframe (e.g., '7d', '30d', '90d')
   * @returns {Object} Date range with start and end
   */
  calculateDateRange(timeframe) {
    const now = new Date();
    const end = now.toISOString();
    
    let start;
    const value = parseInt(timeframe);
    
    if (timeframe.endsWith('d')) {
      start = new Date(now.getTime() - (value * 24 * 60 * 60 * 1000));
    } else if (timeframe.endsWith('h')) {
      start = new Date(now.getTime() - (value * 60 * 60 * 1000));
    } else if (timeframe.endsWith('m')) {
      start = new Date(now.getTime() - (value * 60 * 1000));
    } else {
      // Default to 30 days
      start = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    }
    
    return {
      start: start.toISOString(),
      end
    };
  }
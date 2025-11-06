const logger = require('../utils/logger');
const { query } = require('../database/connection');
const { cache } = require('./redis');

class ContentAnalysisService {
  constructor() {
    this.analysisQueue = [];
    this.activeJobs = new Map();
    this.maxConcurrentJobs = 5;
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
   * @returns {Promise<Object>} Analysis job information
   */
  async analyzeContent({ contentType, contentUrl, contentData, settings = {}, userId, projectId }) {
    try {
      logger.info('Starting content analysis', { contentType, contentUrl, userId, projectId });

      // Create analysis job record
      const job = await this.createAnalysisJob({
        userId,
        projectId,
        contentType,
        contentUrl,
        contentData,
        status: 'processing',
        settings
      });

      // Add to queue
      this.analysisQueue.push({
        jobId: job.id,
        contentType,
        contentUrl,
        contentData,
        settings,
        userId,
        projectId,
        createdAt: new Date()
      });

      // Process queue
      this.processQueue();

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
      const response = await global.openai.createChatCompletion({
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
        max_tokens: 800,
        temperature: 0.2
      });

      return JSON.parse(response.data.choices[0].message.content);
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
}

module.exports = new ContentAnalysisService();
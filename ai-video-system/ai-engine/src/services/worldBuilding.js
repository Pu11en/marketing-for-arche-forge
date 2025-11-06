const logger = require('../utils/logger');
const { query } = require('../database/connection');
const { cache } = require('../services/redis');
const aiProviders = require('./aiProviders');

class WorldBuildingService {
  constructor() {
    this.worldQueue = [];
    this.activeJobs = new Map();
    this.maxConcurrentJobs = 2;
  }

  /**
   * Build 3D world from description
   * @param {Object} params - World building parameters
   * @param {string} params.description - World description
   * @param {Object} params.settings - World building settings
   * @param {string} params.userId - User ID
   * @param {string} params.projectId - Project ID
   * @returns {Promise<Object>} Generated world information
   */
  async buildWorld({ description, settings = {}, userId, projectId }) {
    try {
      logger.info('Starting world building', { description, userId, projectId });

      // Create world job record
      const job = await this.createWorldJob({
        userId,
        projectId,
        status: 'processing',
        settings: { description, ...settings }
      });

      // Add to queue
      this.worldQueue.push({
        jobId: job.id,
        description,
        settings,
        userId,
        projectId,
        createdAt: new Date()
      });

      // Process queue
      this.processQueue();

      return job;
    } catch (error) {
      logger.error('World building failed:', error);
      throw error;
    }
  }

  /**
   * Process world building queue
   */
  async processQueue() {
    if (this.activeJobs.size >= this.maxConcurrentJobs || this.worldQueue.length === 0) {
      return;
    }

    const job = this.worldQueue.shift();
    if (!job) return;

    this.activeJobs.set(job.jobId, job);

    try {
      // Update job status
      await this.updateJobStatus(job.jobId, 'processing', 0);

      // Step 1: Parse world description and extract elements
      const worldElements = await this.parseWorldDescription(job.description, job.settings);
      await this.updateJobStatus(job.jobId, 'processing', 20);

      // Step 2: Generate terrain
      const terrain = await this.generateTerrain(worldElements, job.settings);
      await this.updateJobStatus(job.jobId, 'processing', 40);

      // Step 3: Generate environment and atmosphere
      const environment = await this.generateEnvironment(worldElements, job.settings);
      await this.updateJobStatus(job.jobId, 'processing', 60);

      // Step 4: Place objects and assets
      const objects = await this.placeObjects(worldElements, terrain, job.settings);
      await this.updateJobStatus(job.jobId, 'processing', 80);

      // Step 5: Apply lighting and effects
      const lighting = await this.applyLighting(terrain, environment, objects, job.settings);
      await this.updateJobStatus(job.jobId, 'processing', 90);

      // Step 6: Generate final world data
      const worldData = await this.generateWorldData(terrain, environment, objects, lighting, job.settings);
      await this.updateJobStatus(job.jobId, 'completed', 100, worldData);

      logger.info('World building completed', { jobId: job.jobId });
    } catch (error) {
      logger.error('World building failed:', error);
      await this.updateJobStatus(job.jobId, 'failed', 0, null, error.message);
    } finally {
      this.activeJobs.delete(job.jobId);
      
      // Process next job in queue
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Parse world description and extract elements
   * @param {string} description - World description
   * @param {Object} settings - Generation settings
   * @returns {Promise<Object>} Parsed world elements
   */
  async parseWorldDescription(description, settings) {
    try {
      const response = await global.openai.createChatCompletion({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a world-building expert. Parse the user's world description and extract key elements.
            
            Format the response as JSON with the following structure:
            {
              "terrain": {
                "type": "mountains|plains|desert|ocean|forest|urban|fantasy",
                "features": ["mountains", "rivers", "valleys"],
                "scale": "small|medium|large|epic"
              },
              "environment": {
                "timeOfDay": "dawn|day|dusk|night",
                "weather": "clear|cloudy|rainy|stormy|snowy",
                "season": "spring|summer|autumn|winter",
                "atmosphere": "misty|clear|hazy|aurora"
              },
              "objects": [
                {
                  "type": "building|tree|rock|water|vehicle|character",
                  "description": "Detailed description",
                  "position": {"x": 0, "y": 0, "z": 0},
                  "scale": {"x": 1, "y": 1, "z": 1},
                  "rotation": {"x": 0, "y": 0, "z": 0}
                }
              ],
              "lighting": {
                "primaryLight": "sun|moon|artificial",
                "lightColor": "#ffffff",
                "ambientColor": "#404040",
                "intensity": 1.0,
                "shadows": true
              },
              "style": {
                "artStyle": "realistic|stylized|cartoon|fantasy|sci-fi",
                "colorPalette": ["#primary", "#secondary", "#accent"],
                "mood": "peaceful|dramatic|mysterious|energetic"
              }
            }`
          },
          {
            role: 'user',
            content: `Parse this world description: ${description}\n\nStyle: ${settings.artStyle || 'realistic'}\nScale: ${settings.scale || 'medium'}\nMood: ${settings.mood || 'peaceful'}`
          }
        ],
        max_tokens: 2000,
        temperature: 0.7
      });

      const worldElements = JSON.parse(response.data.choices[0].message.content);
      return worldElements;
    } catch (error) {
      logger.error('World description parsing failed:', error);
      throw new Error('Failed to parse world description');
    }
  }

  /**
   * Generate terrain based on world elements
   * @param {Object} worldElements - Parsed world elements
   * @param {Object} settings - Generation settings
   * @returns {Promise<Object>} Generated terrain
   */
  async generateTerrain(worldElements, settings) {
    try {
      const { terrain } = worldElements;
      
      // Generate heightmap using Perlin noise or similar algorithm
      const heightmap = this.generateHeightmap(terrain.scale, settings);
      
      // Generate terrain mesh
      const mesh = this.generateTerrainMesh(heightmap, terrain.type);
      
      // Apply terrain features
      const features = await this.applyTerrainFeatures(mesh, terrain.features, settings);
      
      return {
        heightmap,
        mesh,
        features,
        type: terrain.type,
        scale: terrain.scale
      };
    } catch (error) {
      logger.error('Terrain generation failed:', error);
      throw new Error('Failed to generate terrain');
    }
  }

  /**
   * Generate heightmap using noise algorithms
   * @param {string} scale - Terrain scale
   * @param {Object} settings - Generation settings
   * @returns {Object} Heightmap data
   */
  generateHeightmap(scale, settings) {
    const size = this.getTerrainSize(scale);
    const heightmap = {
      width: size,
      height: size,
      data: new Float32Array(size * size)
    };

    // Generate Perlin noise
    const noise = this.generatePerlinNoise(size, settings.seed || Date.now());
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = y * size + x;
        let height = 0;
        let amplitude = 1;
        let frequency = 0.005;
        
        // Octave noise for more realistic terrain
        for (let i = 0; i < 8; i++) {
          height += noise.noise(x * frequency, y * frequency) * amplitude;
          amplitude *= 0.5;
          frequency *= 2;
        }
        
        heightmap.data[index] = height;
      }
    }

    return heightmap;
  }

  /**
   * Get terrain dimensions based on scale
   * @param {string} scale - Terrain scale
   * @returns {number} Terrain size
   */
  getTerrainSize(scale) {
    const scaleSizes = {
      small: 256,
      medium: 512,
      large: 1024,
      epic: 2048
    };
    
    return scaleSizes[scale] || scaleSizes.medium;
  }

  /**
   * Generate Perlin noise
   * @param {number} size - Noise size
   * @param {number} seed - Random seed
   * @returns {Object} Noise generator
   */
  generatePerlinNoise(size, seed) {
    // Simple Perlin noise implementation
    const permutation = new Array(256);
    const p = new Array(512);
    
    // Initialize permutation with seed
    for (let i = 0; i < 256; i++) {
      permutation[i] = i;
    }
    
    // Shuffle permutation
    for (let i = 255; i > 0; i--) {
      const j = Math.floor((seed + i) % (i + 1));
      [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
    }
    
    // Duplicate permutation array
    for (let i = 0; i < 512; i++) {
      p[i] = permutation[i & 255];
    }
    
    return {
      noise: (x, y) => {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        
        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);
        
        const u = this.fade(xf);
        const v = this.fade(yf);
        
        const a = p[X] + Y;
        const aa = p[a];
        const ab = p[a + 1];
        const b = p[X + 1] + Y;
        const ba = p[b];
        const bb = p[b + 1];
        
        return this.lerp(v,
          this.lerp(u, this.grad(aa, xf, yf), this.grad(ab, xf - 1, yf)),
          this.lerp(u, this.grad(ba, xf, yf - 1), this.grad(bb, xf - 1, yf - 1))
        );
      },
      
      fade: (t) => t * t * t * (t * (t * 6 - 15) + 10),
      
      lerp: (t, a, b) => a + t * (b - a),
      
      grad: (hash, x, y) => {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
      }
    };
  }

  /**
   * Generate terrain mesh from heightmap
   * @param {Object} heightmap - Heightmap data
   * @param {string} terrainType - Terrain type
   * @returns {Object} Terrain mesh
   */
  generateTerrainMesh(heightmap, terrainType) {
    const vertices = [];
    const indices = [];
    const normals = [];
    const uvs = [];
    
    const { width, height, data } = heightmap;
    
    // Generate vertices
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const heightValue = data[index];
        
        // Calculate vertex position
        vertices.push(
          (x / width - 0.5) * 100,  // X
          heightValue * 20,                 // Y (height)
          (y / height - 0.5) * 100    // Z
        );
        
        // Calculate UV coordinates
        uvs.push(x / width, y / height);
        
        // Calculate normal (simplified)
        const normal = this.calculateNormal(data, x, y, width, height);
        normals.push(normal.x, normal.y, normal.z);
      }
    }
    
    // Generate indices for triangles
    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const topLeft = y * width + x;
        const topRight = topLeft + 1;
        const bottomLeft = (y + 1) * width + x;
        const bottomRight = bottomLeft + 1;
        
        // Two triangles per quad
        indices.push(topLeft, bottomLeft, topRight);
        indices.push(topRight, bottomLeft, bottomRight);
      }
    }
    
    return {
      vertices: new Float32Array(vertices),
      indices: new Uint32Array(indices),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      vertexCount: vertices.length / 3,
      triangleCount: indices.length / 3
    };
  }

  /**
   * Calculate normal for terrain vertex
   * @param {Array} data - Heightmap data
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} width - Heightmap width
   * @param {number} height - Heightmap height
   * @returns {Object} Normal vector
   */
  calculateNormal(data, x, y, width, height) {
    const getHeight = (px, py) => {
      if (px < 0 || px >= width || py < 0 || py >= height) return 0;
      return data[py * width + px];
    };
    
    const hL = getHeight(x - 1, y);
    const hR = getHeight(x + 1, y);
    const hD = getHeight(x, y - 1);
    const hU = getHeight(x, y + 1);
    
    // Calculate normal using height differences
    const normal = {
      x: hL - hR,
      y: 2, // Fixed Y component for terrain
      z: hD - hU
    };
    
    // Normalize
    const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
    normal.x /= length;
    normal.y /= length;
    normal.z /= length;
    
    return normal;
  }

  /**
   * Apply terrain features
   * @param {Object} mesh - Terrain mesh
   * @param {Array} features - Terrain features
   * @param {Object} settings - Generation settings
   * @returns {Promise<Object>} Enhanced terrain
   */
  async applyTerrainFeatures(mesh, features, settings) {
    const enhancedMesh = { ...mesh };
    
    for (const feature of features) {
      switch (feature) {
        case 'mountains':
          enhancedMesh.vertices = this.addMountains(enhancedMesh.vertices, settings);
          break;
        case 'rivers':
          enhancedMesh.vertices = this.addRivers(enhancedMesh.vertices, settings);
          break;
        case 'valleys':
          enhancedMesh.vertices = this.addValleys(enhancedMesh.vertices, settings);
          break;
        case 'forests':
          enhancedMesh.vertices = this.addForests(enhancedMesh.vertices, settings);
          break;
      }
    }
    
    return enhancedMesh;
  }

  /**
   * Add mountains to terrain
   * @param {Array} vertices - Terrain vertices
   * @param {Object} settings - Generation settings
   * @returns {Array} Modified vertices
   */
  addMountains(vertices, settings) {
    // Add mountain peaks and ridges
    const mountainCount = Math.floor(Math.random() * 5) + 3;
    
    for (let i = 0; i < mountainCount; i++) {
      const peakX = Math.random() * 100 - 50;
      const peakZ = Math.random() * 100 - 50;
      const peakHeight = Math.random() * 30 + 10;
      const radius = Math.random() * 10 + 5;
      
      // Modify vertices within mountain radius
      for (let j = 0; j < vertices.length; j += 3) {
        const x = vertices[j];
        const z = vertices[j + 2];
        const distance = Math.sqrt((x - peakX) ** 2 + (z - peakZ) ** 2);
        
        if (distance < radius) {
          const influence = 1 - (distance / radius);
          vertices[j + 1] += peakHeight * influence;
        }
      }
    }
    
    return vertices;
  }

  /**
   * Add rivers to terrain
   * @param {Array} vertices - Terrain vertices
   * @param {Object} settings - Generation settings
   * @returns {Array} Modified vertices
   */
  addRivers(vertices, settings) {
    // Add river valleys
    const riverCount = Math.floor(Math.random() * 3) + 1;
    
    for (let i = 0; i < riverCount; i++) {
      const riverPath = this.generateRiverPath(settings);
      
      // Carve river path into terrain
      for (const point of riverPath) {
        const radius = 2;
        
        for (let j = 0; j < vertices.length; j += 3) {
          const x = vertices[j];
          const z = vertices[j + 2];
          const distance = Math.sqrt((x - point.x) ** 2 + (z - point.z) ** 2);
          
          if (distance < radius) {
            const influence = 1 - (distance / radius);
            vertices[j + 1] -= 5 * influence; // Lower terrain for river
          }
        }
      }
    }
    
    return vertices;
  }

  /**
   * Generate river path
   * @param {Object} settings - Generation settings
   * @returns {Array} River path points
   */
  generateRiverPath(settings) {
    const path = [];
    const steps = 50;
    
    let x = Math.random() * 100 - 50;
    let z = Math.random() * 100 - 50;
    
    for (let i = 0; i < steps; i++) {
      path.push({ x, z });
      
      // Random walk with downward tendency
      x += (Math.random() - 0.5) * 4;
      z += (Math.random() - 0.5) * 4;
      
      // Keep within bounds
      x = Math.max(-50, Math.min(50, x));
      z = Math.max(-50, Math.min(50, z));
    }
    
    return path;
  }

  /**
   * Generate environment and atmosphere
   * @param {Object} worldElements - Parsed world elements
   * @param {Object} settings - Generation settings
   * @returns {Promise<Object>} Generated environment
   */
  async generateEnvironment(worldElements, settings) {
    try {
      const { environment } = worldElements;
      
      // Generate skybox
      const skybox = await this.generateSkybox(environment, settings);
      
      // Generate atmospheric effects
      const atmosphere = await this.generateAtmosphericEffects(environment, settings);
      
      // Generate weather effects
      const weather = await this.generateWeatherEffects(environment, settings);
      
      return {
        skybox,
        atmosphere,
        weather,
        timeOfDay: environment.timeOfDay,
        season: environment.season
      };
    } catch (error) {
      logger.error('Environment generation failed:', error);
      throw new Error('Failed to generate environment');
    }
  }

  /**
   * Generate skybox based on environment
   * @param {Object} environment - Environment settings
   * @param {Object} settings - Generation settings
   * @returns {Promise<Object>} Skybox data
   */
  async generateSkybox(environment, settings) {
    const skyColors = this.getSkyColors(environment.timeOfDay, environment.weather);
    
    return {
      topColor: skyColors.top,
      bottomColor: skyColors.bottom,
      sunPosition: this.calculateSunPosition(environment.timeOfDay),
      moonPosition: this.calculateMoonPosition(environment.timeOfDay),
      stars: environment.timeOfDay === 'night',
      clouds: environment.weather === 'cloudy' || environment.weather === 'rainy'
    };
  }

  /**
   * Get sky colors based on time and weather
   * @param {string} timeOfDay - Time of day
   * @param {string} weather - Weather condition
   * @returns {Object} Sky colors
   */
  getSkyColors(timeOfDay, weather) {
    const colorSchemes = {
      dawn: { top: '#1e3c72', bottom: '#fbbf24' },
      day: { top: '#3b82f6', bottom: '#93c5fd' },
      dusk: { top: '#1e293b', bottom: '#f97316' },
      night: { top: '#0f172a', bottom: '#1e293b' }
    };
    
    let colors = colorSchemes[timeOfDay] || colorSchemes.day;
    
    // Adjust for weather
    if (weather === 'cloudy' || weather === 'rainy') {
      colors.top = this.darkenColor(colors.top, 0.3);
      colors.bottom = this.darkenColor(colors.bottom, 0.2);
    }
    
    return colors;
  }

  /**
   * Calculate sun position based on time
   * @param {string} timeOfDay - Time of day
   * @returns {Object} Sun position
   */
  calculateSunPosition(timeOfDay) {
    const positions = {
      dawn: { x: 30, y: 20 },
      day: { x: 90, y: 80 },
      dusk: { x: 150, y: 20 },
      night: { x: -90, y: -20 }
    };
    
    return positions[timeOfDay] || positions.day;
  }

  /**
   * Calculate moon position based on time
   * @param {string} timeOfDay - Time of day
   * @returns {Object} Moon position
   */
  calculateMoonPosition(timeOfDay) {
    const positions = {
      dawn: { x: -30, y: 10 },
      day: { x: -90, y: -20 },
      dusk: { x: -150, y: 10 },
      night: { x: 90, y: 60 }
    };
    
    return positions[timeOfDay] || positions.night;
  }

  /**
   * Darken color by amount
   * @param {string} color - Hex color
   * @param {number} amount - Darken amount (0-1)
   * @returns {string} Darkened color
   */
  darkenColor(color, amount) {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    const newR = Math.floor(r * (1 - amount));
    const newG = Math.floor(g * (1 - amount));
    const newB = Math.floor(b * (1 - amount));
    
    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
  }

  /**
   * Place objects in world
   * @param {Object} worldElements - Parsed world elements
   * @param {Object} terrain - Generated terrain
   * @param {Object} settings - Generation settings
   * @returns {Promise<Array>} Placed objects
   */
  async placeObjects(worldElements, terrain, settings) {
    try {
      const { objects } = worldElements;
      const placedObjects = [];
      
      for (const objectData of objects) {
        // Generate or load 3D model for object
        const model = await this.generateObjectModel(objectData, settings);
        
        // Find suitable placement position
        const position = this.findPlacementPosition(objectData, terrain, placedObjects);
        
        // Place object in world
        const placedObject = {
          ...objectData,
          model,
          position,
          rotation: objectData.rotation || { x: 0, y: 0, z: 0 },
          scale: objectData.scale || { x: 1, y: 1, z: 1 }
        };
        
        placedObjects.push(placedObject);
      }
      
      return placedObjects;
    } catch (error) {
      logger.error('Object placement failed:', error);
      throw new Error('Failed to place objects');
    }
  }

  /**
   * Generate 3D model for object
   * @param {Object} objectData - Object data
   * @param {Object} settings - Generation settings
   * @returns {Promise<Object>} 3D model
   */
  async generateObjectModel(objectData, settings) {
    // For now, return a placeholder model
    // In a real implementation, this would generate or load actual 3D models
    return {
      type: objectData.type,
      geometry: 'placeholder_geometry',
      material: 'placeholder_material',
      description: objectData.description
    };
  }

  /**
   * Find suitable placement position for object
   * @param {Object} objectData - Object data
   * @param {Object} terrain - Terrain data
   * @param {Array} existingObjects - Already placed objects
   * @returns {Object} Placement position
   */
  findPlacementPosition(objectData, terrain, existingObjects) {
    // Simple placement algorithm - in real implementation, this would be more sophisticated
    const maxAttempts = 100;
    
    for (let i = 0; i < maxAttempts; i++) {
      const position = {
        x: (Math.random() - 0.5) * 80,
        y: 0,
        z: (Math.random() - 0.5) * 80
      };
      
      // Check for collisions with existing objects
      const hasCollision = existingObjects.some(obj => {
        const distance = Math.sqrt(
          (obj.position.x - position.x) ** 2 +
          (obj.position.z - position.z) ** 2
        );
        return distance < 5; // Minimum distance between objects
      });
      
      if (!hasCollision) {
        return position;
      }
    }
    
    // Fallback position
    return { x: 0, y: 0, z: 0 };
  }

  /**
   * Apply lighting and effects
   * @param {Object} terrain - Terrain data
   * @param {Object} environment - Environment data
   * @param {Array} objects - Placed objects
   * @param {Object} settings - Generation settings
   * @returns {Promise<Object>} Lighting data
   */
  async applyLighting(terrain, environment, objects, settings) {
    try {
      const { lighting } = settings;
      
      // Generate lighting configuration
      const lightingConfig = {
        ambient: {
          color: lighting.ambientColor || '#404040',
          intensity: 0.3
        },
        directional: {
          color: lighting.lightColor || '#ffffff',
          intensity: lighting.intensity || 1.0,
          position: environment.skybox.sunPosition,
          shadows: lighting.shadows !== false
        },
        point: [], // Point lights for specific areas
        spot: []   // Spot lights for dramatic effects
      };
      
      // Add dynamic lights based on environment
      if (environment.timeOfDay === 'night') {
        lightingConfig.point.push({
          position: { x: 10, y: 5, z: 10 },
          color: '#ffaa00',
          intensity: 0.5,
          radius: 20
        });
      }
      
      return lightingConfig;
    } catch (error) {
      logger.error('Lighting application failed:', error);
      throw new Error('Failed to apply lighting');
    }
  }

  /**
   * Generate final world data
   * @param {Object} terrain - Terrain data
   * @param {Object} environment - Environment data
   * @param {Array} objects - Placed objects
   * @param {Object} lighting - Lighting data
   * @param {Object} settings - Generation settings
   * @returns {Promise<Object>} Final world data
   */
  async generateWorldData(terrain, environment, objects, lighting, settings) {
    try {
      // Compose final world data
      const worldData = {
        version: '1.0',
        terrain: {
          mesh: terrain.mesh,
          heightmap: terrain.heightmap,
          features: terrain.features
        },
        environment,
        objects,
        lighting,
        metadata: {
          generatedAt: new Date().toISOString(),
          generator: 'AI Video System',
          settings
        }
      };
      
      // Serialize world data for storage
      const serializedData = JSON.stringify(worldData);
      
      // Upload to storage
      const worldUrl = await this.uploadWorldData(serializedData);
      
      return {
        ...worldData,
        url: worldUrl,
        size: serializedData.length
      };
    } catch (error) {
      logger.error('World data generation failed:', error);
      throw new Error('Failed to generate world data');
    }
  }

  /**
   * Upload world data to storage
   * @param {string} data - Serialized world data
   * @returns {Promise<string>} World URL
   */
  async uploadWorldData(data) {
    // Upload to AWS S3 or other storage
    // For now, return a mock URL
    const worldId = `world_${Date.now()}`;
    return `https://storage.example.com/worlds/${worldId}.json`;
  }

  /**
   * Create world job record
   * @param {Object} jobData - Job data
   * @returns {Promise<Object>} Created job
   */
  async createWorldJob(jobData) {
    const result = await query(
      `INSERT INTO world_jobs (project_id, user_id, status, settings, created_at) 
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
      `UPDATE world_jobs 
       SET status = $1, progress = $2, result_url = $3, error_message = $4, 
           started_at = CASE WHEN started_at IS NULL AND $1 = 'processing' THEN NOW() ELSE started_at END,
           completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN NOW() ELSE completed_at END
       WHERE id = $5`,
      [status, progress, resultUrl, errorMessage, jobId]
    );

    // Cache status for real-time updates
    await cache.set(`world_job:${jobId}`, {
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
    const cached = await cache.get(`world_job:${jobId}`);
    if (cached) {
      return cached;
    }

    // Fallback to database
    const result = await query(
      'SELECT * FROM world_jobs WHERE id = $1',
      [jobId]
    );

    return result.rows[0];
  }
}

module.exports = new WorldBuildingService();
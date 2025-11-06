const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const logger = require('../utils/logger');

const seed = async () => {
  try {
    logger.info('Starting database seeding...');

    // Connect to database
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    const client = await pool.connect();

    try {
      // Seed users
      await seedUsers(client);

      // Seed templates
      await seedTemplates(client);

      // Seed categories
      await seedCategories(client);

      logger.info('Database seeding completed successfully');

    } finally {
      client.release();
      await pool.end();
    }

  } catch (error) {
    logger.error('Database seeding failed:', error);
    process.exit(1);
  }
};

const seedUsers = async (client) => {
  logger.info('Seeding users...');

  // Check if users already exist
  const existingUsers = await client.query('SELECT COUNT(*) as count FROM users');
  if (parseInt(existingUsers.rows[0].count) > 0) {
    logger.info('Users already exist, skipping user seeding');
    return;
  }

  // Create demo users
  const saltRounds = 12;
  const demoUsers = [
    {
      email: 'admin@aivideosystem.com',
      name: 'Admin User',
      password: 'admin123',
      subscription_tier: 'enterprise',
      is_verified: true
    },
    {
      email: 'demo@aivideosystem.com',
      name: 'Demo User',
      password: 'demo123',
      subscription_tier: 'pro',
      is_verified: true
    },
    {
      email: 'user@aivideosystem.com',
      name: 'Regular User',
      password: 'user123',
      subscription_tier: 'basic',
      is_verified: true
    }
  ];

  for (const user of demoUsers) {
    const passwordHash = await bcrypt.hash(user.password, saltRounds);
    
    await client.query(`
      INSERT INTO users (email, password_hash, name, subscription_tier, is_verified, credits_remaining)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      user.email,
      passwordHash,
      user.name,
      user.subscription_tier,
      user.is_verified,
      user.subscription_tier === 'enterprise' ? 2000 : user.subscription_tier === 'pro' ? 500 : 100
    ]);

    logger.info(`Created user: ${user.email}`);
  }
};

const seedTemplates = async (client) => {
  logger.info('Seeding templates...');

  // Check if templates already exist
  const existingTemplates = await client.query('SELECT COUNT(*) as count FROM templates');
  if (parseInt(existingTemplates.rows[0].count) > 0) {
    logger.info('Templates already exist, skipping template seeding');
    return;
  }

  // Get admin user ID for created_by field
  const adminResult = await client.query('SELECT id FROM users WHERE email = $1', ['admin@aivideosystem.com']);
  const adminId = adminResult.rows[0]?.id;

  // Create demo templates
  const demoTemplates = [
    {
      name: 'Modern Commercial',
      description: 'High-impact commercial style with fast cuts and dynamic transitions',
      category: 'Commercial',
      thumbnail_url: '/templates/modern-commercial.jpg',
      template_data: {
        style: 'modern',
        duration: 30,
        transitions: ['cut', 'fade'],
        color_grading: 'vibrant',
        aspect_ratio: '16:9',
        resolution: '1080p'
      },
      is_public: true
    },
    {
      name: 'Cinematic Story',
      description: 'Emotional storytelling with cinematic pacing and color grading',
      category: 'Storytelling',
      thumbnail_url: '/templates/cinematic-story.jpg',
      template_data: {
        style: 'cinematic',
        duration: 120,
        transitions: ['dissolve', 'wipe'],
        color_grading: 'filmic',
        aspect_ratio: '16:9',
        resolution: '1080p'
      },
      is_public: true
    },
    {
      name: 'Social Media Short',
      description: 'Optimized for TikTok/Reels with vertical format and engaging hooks',
      category: 'Social Media',
      thumbnail_url: '/templates/social-short.jpg',
      template_data: {
        style: 'social',
        duration: 15,
        transitions: ['cut', 'zoom'],
        color_grading: 'bright',
        aspect_ratio: '9:16',
        resolution: '1080p'
      },
      is_public: true
    },
    {
      name: 'Product Showcase',
      description: 'Clean product presentation with professional lighting',
      category: 'Product',
      thumbnail_url: '/templates/product-showcase.jpg',
      template_data: {
        style: 'clean',
        duration: 45,
        transitions: ['fade', 'slide'],
        color_grading: 'neutral',
        aspect_ratio: '16:9',
        resolution: '1080p'
      },
      is_public: true
    },
    {
      name: 'Educational Content',
      description: 'Clear and engaging educational video format',
      category: 'Education',
      thumbnail_url: '/templates/educational.jpg',
      template_data: {
        style: 'educational',
        duration: 180,
        transitions: ['cut', 'dissolve'],
        color_grading: 'natural',
        aspect_ratio: '16:9',
        resolution: '1080p'
      },
      is_public: true
    }
  ];

  for (const template of demoTemplates) {
    await client.query(`
      INSERT INTO templates (name, description, category, thumbnail_url, template_data, is_public, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      template.name,
      template.description,
      template.category,
      template.thumbnail_url,
      JSON.stringify(template.template_data),
      template.is_public,
      adminId
    ]);

    logger.info(`Created template: ${template.name}`);
  }
};

const seedCategories = async (client) => {
  logger.info('Seeding categories...');

  // Categories are implicitly created by templates, but we can log them
  const categories = [
    'Commercial',
    'Storytelling',
    'Social Media',
    'Product',
    'Education',
    'Music Video',
    'Tutorial',
    'Presentation',
    'Advertisement',
    'Documentary'
  ];

  for (const category of categories) {
    logger.info(`Category available: ${category}`);
  }
};

// Run seeding if this file is executed directly
if (require.main === module) {
  seed();
}

module.exports = { seed };
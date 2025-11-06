const { Pool } = require('pg');
const logger = require('../utils/logger');

// Database connection pool
let pool = null;

/**
 * Initialize database connection pool
 * @returns {Promise<Pool>} Database connection pool
 */
const connectDatabase = async () => {
  try {
    if (pool) {
      logger.info('Database pool already initialized');
      return pool;
    }

    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'ai_video_system',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      max: process.env.DB_MAX_CONNECTIONS || 20,
      idleTimeoutMillis: process.env.DB_IDLE_TIMEOUT || 30000,
      connectionTimeoutMillis: process.env.DB_CONNECTION_TIMEOUT || 2000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    };

    pool = new Pool(dbConfig);

    // Test the connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();

    logger.info('Database connected successfully', {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database
    });

    // Handle pool errors
    pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', err);
    });

    pool.on('connect', (client) => {
      logger.debug('New client connected to database');
    });

    pool.on('remove', (client) => {
      logger.debug('Client removed from database pool');
    });

    return pool;
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
};

/**
 * Execute a query with automatic connection handling
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
const query = async (text, params = []) => {
  const start = Date.now();
  
  try {
    if (!pool) {
      throw new Error('Database not connected. Call connectDatabase() first.');
    }

    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    logger.debug('Query executed', {
      query: text,
      duration: `${duration}ms`,
      rows: result.rowCount
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error('Query failed', {
      query: text,
      params,
      duration: `${duration}ms`,
      error: error.message
    });
    throw error;
  }
};

/**
 * Execute a transaction
 * @param {Function} callback - Transaction callback function
 * @returns {Promise<any>} Transaction result
 */
const transaction = async (callback) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    logger.debug('Transaction started');
    
    const result = await callback(client);
    
    await client.query('COMMIT');
    logger.debug('Transaction committed');
    
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Transaction rolled back', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get database health status
 * @returns {Promise<Object>} Health status
 */
const getHealthStatus = async () => {
  try {
    if (!pool) {
      return { status: 'disconnected', error: 'Pool not initialized' };
    }

    const start = Date.now();
    const result = await pool.query('SELECT 1 as health_check');
    const responseTime = Date.now() - start;
    
    const totalCount = pool.totalCount;
    const idleCount = pool.idleCount;
    const waitingCount = pool.waitingCount;
    
    return {
      status: 'connected',
      responseTime: `${responseTime}ms`,
      pool: {
        total: totalCount,
        idle: idleCount,
        waiting: waitingCount
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message
    };
  }
};

/**
 * Close database connection pool
 * @returns {Promise<void>}
 */
const closeDatabase = async () => {
  try {
    if (pool) {
      await pool.end();
      pool = null;
      logger.info('Database connection pool closed');
    }
  } catch (error) {
    logger.error('Error closing database pool:', error);
    throw error;
  }
};

/**
 * Initialize database tables if they don't exist
 * @returns {Promise<void>}
 */
const initializeTables = async () => {
  try {
    // Create render_jobs table if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS render_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL,
        user_id UUID NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        settings JSONB,
        result_url TEXT,
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create world_jobs table if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS world_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL,
        user_id UUID NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        settings JSONB,
        result_url TEXT,
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create analysis_jobs table if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS analysis_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID,
        user_id UUID NOT NULL,
        content_type VARCHAR(50) NOT NULL,
        content_url TEXT,
        content_data JSONB,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        settings JSONB,
        result JSONB,
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create indexes for better performance
    await query('CREATE INDEX IF NOT EXISTS idx_render_jobs_user_id ON render_jobs(user_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_render_jobs_project_id ON render_jobs(project_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_render_jobs_status ON render_jobs(status)');
    await query('CREATE INDEX IF NOT EXISTS idx_world_jobs_user_id ON world_jobs(user_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_world_jobs_project_id ON world_jobs(project_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_world_jobs_status ON world_jobs(status)');
    await query('CREATE INDEX IF NOT EXISTS idx_analysis_jobs_user_id ON analysis_jobs(user_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_analysis_jobs_project_id ON analysis_jobs(project_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON analysis_jobs(status)');

    logger.info('Database tables initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database tables:', error);
    throw error;
  }
};

module.exports = {
  connectDatabase,
  query,
  transaction,
  getHealthStatus,
  closeDatabase,
  initializeTables
};
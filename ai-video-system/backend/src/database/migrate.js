const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const migrate = async () => {
  try {
    logger.info('Starting database migration...');

    // Connect to database
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    const client = await pool.connect();

    try {
      // Create migrations table if it doesn't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Get all migration files
      const migrationsDir = path.join(__dirname, 'migrations');
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();

      // Get executed migrations
      const executedMigrationsResult = await client.query(
        'SELECT name FROM migrations ORDER BY executed_at'
      );
      const executedMigrations = new Set(
        executedMigrationsResult.rows.map(row => row.name)
      );

      // Run pending migrations
      for (const file of migrationFiles) {
        const migrationName = path.basename(file, '.sql');

        if (!executedMigrations.has(migrationName)) {
          logger.info(`Running migration: ${migrationName}`);

          // Read migration file
          const migrationPath = path.join(migrationsDir, file);
          const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

          // Execute migration
          await client.query('BEGIN');
          try {
            await client.query(migrationSQL);
            await client.query(
              'INSERT INTO migrations (name) VALUES ($1)',
              [migrationName]
            );
            await client.query('COMMIT');
            logger.info(`Migration ${migrationName} completed successfully`);
          } catch (error) {
            await client.query('ROLLBACK');
            logger.error(`Migration ${migrationName} failed:`, error);
            throw error;
          }
        } else {
          logger.info(`Migration ${migrationName} already executed, skipping`);
        }
      }

      logger.info('Database migration completed successfully');

    } finally {
      client.release();
      await pool.end();
    }

  } catch (error) {
    logger.error('Database migration failed:', error);
    process.exit(1);
  }
};

// Run migrations if this file is executed directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
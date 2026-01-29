const { Pool } = require('pg');

let pool = null;

function initializeDatabase() {
  const DATABASE_URL = process.env.DATABASE_URL;
  
  if (!DATABASE_URL) {
    console.error('[DATABASE] DATABASE_URL environment variable is required');
    console.error('[DATABASE] Set DATABASE_URL to PostgreSQL connection string');
    process.exit(1);
  }

  pool = new Pool({
    connectionString: DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  return pool;
}

function getPool() {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return pool;
}

async function executeMigrations() {
  const client = getPool();
  
  try {
    console.log('[DATABASE] Running migrations...');
    
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create jobs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id VARCHAR(36) PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        type VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        input_data JSONB,
        output_data JSONB,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create memories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        filename VARCHAR(255) NOT NULL,
        content JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, filename)
      )
    `);
    
    console.log('[DATABASE] Migrations completed successfully');
  } catch (error) {
    console.error('[DATABASE] Migration failed:', error);
    throw error;
  }
}

async function testConnection() {
  const client = getPool();
  try {
    const result = await client.query('SELECT NOW()');
    console.log('[DATABASE] Connection test successful:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('[DATABASE] Connection test failed:', error);
    return false;
  }
}

module.exports = {
  initializeDatabase,
  getPool,
  executeMigrations,
  testConnection
};

const { Pool } = require('pg');
const { validateProductionEnv } = require('./production-env-validator');

// Ensure production environment validation is performed
validateProductionEnv();

// Hard requirement for DATABASE_URL - no fallbacks in production
function getConnectionString() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('[DATABASE] DATABASE_URL environment variable is required');
    console.error('[DATABASE] Set DATABASE_URL to PostgreSQL connection string');
    process.exit(1);
  }
  
  console.log('[DATABASE] Using validated DATABASE_URL');
  return databaseUrl;
}

let pool = null;

function initializeDatabase() {
  const connectionString = getConnectionString();
  
  console.log('[DATABASE] Connecting to PostgreSQL with optimized pool settings');
  // ... (rest of real init)
  pool = new Pool({
    connectionString,
    max: 20,
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    statement_timeout: 10000,
    query_timeout: 10000,
    allowExitOnIdle: false
  });
  
  // ... events
  pool.on('error', (err) => console.error('[DB] Pool Error', err));
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
    
    // Create users table with tenant support
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        tenant_id VARCHAR(100) NOT NULL DEFAULT 'default',
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Jobs table creation - managed by job.service.js with job-schema-final.sql
    await client.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id VARCHAR(36) PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        tenant_id VARCHAR(100) NOT NULL DEFAULT 'default',
        type VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'queued',
        data JSONB,
        input_data JSONB,
        output_data JSONB,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        duration INTEGER
      )
    `);
    
    // Create tenant_quotas table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_quotas (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(100) UNIQUE NOT NULL,
        max_users INTEGER NOT NULL DEFAULT 10,
        max_jobs_per_day INTEGER NOT NULL DEFAULT 100,
        max_storage_mb INTEGER NOT NULL DEFAULT 1024,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create tenants table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        settings JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create user_settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        tenant_id VARCHAR(100) NOT NULL DEFAULT 'default',
        settings JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, tenant_id)
      )
    `);
    
    // Create audit_log table
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        tenant_id VARCHAR(100) NOT NULL DEFAULT 'default',
        action VARCHAR(50) NOT NULL,
        resource_type VARCHAR(50) NOT NULL,
        resource_id VARCHAR(255),
        old_values JSONB,
        new_values JSONB,
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes for audit_log separately
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_user_tenant_time 
      ON audit_log (user_id, tenant_id, created_at)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_action_time 
      ON audit_log (tenant_id, action, created_at)
    `);
    
    // Add missing columns for job.service compatibility (idempotent)
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS queue_name VARCHAR(100) DEFAULT 'default'`);
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3`);
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS retry_delay_ms INTEGER DEFAULT 1000`);
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS visibility_timeout_ms INTEGER DEFAULT 30000`);
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`);
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'`);
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP`);
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMP`);
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`);
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS failed_at TIMESTAMP`);
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS worker_id VARCHAR(255)`);
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS processing_time_ms INTEGER`);

    // Update existing jobs from 'pending' to 'queued' status
    await client.query(`
      UPDATE jobs SET status = 'queued' WHERE status = 'pending'
    `);
    
    // Ensure default tenant exists (multi-tenant isolation)
    await client.query(`
      INSERT INTO tenants (tenant_id, name, status) VALUES ('default', 'Default', 'active')
      ON CONFLICT (tenant_id) DO NOTHING
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

async function closeDatabase() {
  if (pool) {
    try {
      console.log('[DATABASE] Closing connection pool...');
      await pool.end();
      console.log('[DATABASE] Connection pool closed');
      pool = null;
    } catch (error) {
      console.error('[DATABASE] Error closing pool:', error);
    }
  }
}

module.exports = {
  initializeDatabase,
  getPool,
  executeMigrations,
  testConnection,
  closeDatabase
};

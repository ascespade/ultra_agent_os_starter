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
let poolHealthy = true;
let reconnectAttempts = 0;
const MAX_RECONNECT_INTERVAL_MS = 60000; // 60 seconds max
const INITIAL_RECONNECT_INTERVAL_MS = 1000; // 1 second initial

// Calculate exponential backoff with jitter
function getReconnectDelay() {
  const baseDelay = INITIAL_RECONNECT_INTERVAL_MS * Math.pow(2, Math.min(reconnectAttempts, 10));
  const jitter = Math.random() * 0.3 * baseDelay; // 30% jitter
  return Math.min(baseDelay + jitter, MAX_RECONNECT_INTERVAL_MS);
}

// Attempt to recreate the pool with exponential backoff
async function attemptPoolRecreate() {
  if (poolHealthy) {
    console.log('[DB] Pool still healthy, skipping recreate');
    return pool;
  }

  reconnectAttempts++;
  const delay = getReconnectDelay();
  
  console.log(`[DB] Attempting pool recreate (attempt ${reconnectAttempts}) in ${Math.round(delay)}ms`);
  
  await new Promise(resolve => setTimeout(resolve, delay));
  
  try {
    // Close old pool if exists
    if (pool) {
      try {
        await pool.end();
      } catch (e) {
        console.error('[DB] Error closing old pool:', e.message);
      }
    }
    
    // Create new pool
    const connectionString = getConnectionString();
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
    
    // Set up event handlers
    setupPoolHandlers(pool);
    
    // Test the new pool
    await pool.query('SELECT 1');
    
    poolHealthy = true;
    reconnectAttempts = 0;
    console.log('[DB] Pool recreated successfully');
    return pool;
  } catch (error) {
    console.error('[DB] Pool recreate failed:', error.message);
    return attemptPoolRecreate(); // Retry with exponential backoff
  }
}

// Set up pool event handlers
function setupPoolHandlers(poolInstance) {
  poolInstance.on('error', async (err) => {
    console.error('[DB] Pool error event:', err.message);
    poolHealthy = false;
    // Don't exit, attempt recovery instead
    attemptPoolRecreate().catch(e => {
      console.error('[DB] Auto-recovery failed:', e.message);
    });
  });
  
  poolInstance.on('connect', () => {
    console.debug('[DB] New connection established');
  });
  
  poolInstance.on('remove', () => {
    console.debug('[DB] Connection removed from pool');
  });
}

function initializeDatabase() {
  const connectionString = getConnectionString();
  
  console.log('[DATABASE] Connecting to PostgreSQL with optimized pool settings');
  
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
  
  setupPoolHandlers(pool);
  
  pool.on('error', (err) => console.error('[DB] Pool Error', err));
  return pool;
}

function getPool() {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return pool;
}

// Health check query for /health endpoint
async function healthCheck() {
  try {
    const poolInstance = getPool();
    const result = await poolInstance.query('SELECT 1 as health');
    return { healthy: true, timestamp: new Date().toISOString() };
  } catch (error) {
    return { healthy: false, error: error.message, timestamp: new Date().toISOString() };
  }
}

// Check if pool is healthy
function isPoolHealthy() {
  return poolHealthy && pool !== null;
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
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS error_details JSONB`);

    // Update existing jobs from 'pending' to 'queued' status
    await client.query(`
      UPDATE jobs SET status = 'queued' WHERE status = 'pending'
    `);
    
    // Ensure default tenant exists (multi-tenant isolation)
    await client.query(`
      INSERT INTO tenants (tenant_id, name, status) VALUES ('default', 'Default', 'active')
      ON CONFLICT (tenant_id) DO NOTHING
    `);
    
    // Create llm_providers table for dynamic provider management
    await client.query(`
      CREATE TABLE IF NOT EXISTS llm_providers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(50) NOT NULL UNIQUE,
        type VARCHAR(50) NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        description TEXT,
        config JSONB NOT NULL DEFAULT '{}',
        is_active BOOLEAN DEFAULT false,
        is_enabled BOOLEAN DEFAULT true,
        health_status VARCHAR(20) DEFAULT 'unknown',
        last_health_check TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create llm_provider_usage table for usage tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS llm_provider_usage (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id UUID REFERENCES llm_providers(id) ON DELETE CASCADE,
        tenant_id VARCHAR(100) NOT NULL DEFAULT 'system',
        usage_type VARCHAR(50) NOT NULL,
        tokens_used INTEGER DEFAULT 0,
        cost_cents INTEGER DEFAULT 0,
        request_duration_ms INTEGER,
        model_used VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for performance
    await client.query(`CREATE INDEX IF NOT EXISTS idx_llm_providers_active ON llm_providers(is_active, is_enabled)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_llm_providers_type ON llm_providers(type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_llm_usage_provider ON llm_provider_usage(provider_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_llm_usage_tenant ON llm_provider_usage(tenant_id, created_at)`);

    // Insert default providers if they don't exist
    await client.query(`
      INSERT INTO llm_providers (name, type, display_name, description, config, is_active) VALUES
      ('ollama', 'ollama', 'Ollama Local', 'Local Ollama instance for private LLM inference', '{"model": "llama3.2", "baseUrl": "http://localhost:11434"}', false)
      ON CONFLICT (name) DO NOTHING
    `);

    await client.query(`
      INSERT INTO llm_providers (name, type, display_name, description, config, is_active) VALUES
      ('openai', 'openai', 'OpenAI GPT', 'OpenAI GPT models for general purpose tasks', '{"model": "gpt-3.5-turbo", "apiUrl": "https://api.openai.com/v1"}', false)
      ON CONFLICT (name) DO NOTHING
    `);

    await client.query(`
      INSERT INTO llm_providers (name, type, display_name, description, config, is_active) VALUES
      ('anthropic', 'anthropic', 'Anthropic Claude', 'Anthropic Claude models for advanced reasoning', '{"model": "claude-3-haiku-20240307", "apiUrl": "https://api.anthropic.com/v1"}', false)
      ON CONFLICT (name) DO NOTHING
    `);

    await client.query(`
      INSERT INTO llm_providers (name, type, display_name, description, config, is_active) VALUES
      ('gemini', 'gemini', 'Google Gemini', 'Google Gemini models for multimodal tasks', '{"model": "gemini-1.5-flash", "apiUrl": "https://generativelanguage.googleapis.com/v1beta"}', false)
      ON CONFLICT (name) DO NOTHING
    `);

    // Create memories table for memory service
    await client.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(100) NOT NULL DEFAULT 'default',
        user_id INTEGER,
        key VARCHAR(255) NOT NULL,
        content JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(tenant_id, user_id, key)
      )
    `);

    // Create indexes for memories table
    await client.query(`CREATE INDEX IF NOT EXISTS idx_memories_tenant_user ON memories(tenant_id, user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key)`);

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
      poolHealthy = false;
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
  closeDatabase,
  healthCheck,
  isPoolHealthy,
  attemptPoolRecreate
};

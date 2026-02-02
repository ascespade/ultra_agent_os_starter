const { Pool } = require('pg');
const pino = require('pino');
const fs = require('fs').promises;
const path = require('path');

const logger = pino({
  name: 'memory-service',
  level: process.env.LOG_LEVEL || 'info'
});

class MemoryService {
  constructor() {
    this.pool = null;
  }

  async initialize() {
    try {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      await this.runMigrations();
      logger.info('Memory service initialized successfully');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to initialize memory service');
      throw error;
    }
  }

  async runMigrations() {
    try {
      const schemaPath = path.join(__dirname, '../../../../lib/memory-schema.sql');
      const schema = await fs.readFile(schemaPath, 'utf8');
      await this.pool.query(schema);
      logger.info('Memory schema migrations completed');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to run memory migrations');
      throw error;
    }
  }

  async set(tenantId, userId, key, content) {
    const query = `
      INSERT INTO memories (tenant_id, user_id, key, content)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (tenant_id, user_id, key) 
      DO UPDATE SET
        content = EXCLUDED.content,
        updated_at = NOW()
      RETURNING id, created_at, updated_at
    `;
    const values = [tenantId, userId, key, content];
    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async get(tenantId, userId, key) {
    const query = `
      SELECT id, key, content, created_at, updated_at
      FROM memories
      WHERE tenant_id = $1 AND user_id = $2 AND key = $3
    `;
    const result = await this.pool.query(query, [tenantId, userId, key]);
    return result.rows[0] || null;
  }

  async delete(tenantId, userId, key) {
    const query = `
      DELETE FROM memories
      WHERE tenant_id = $1 AND user_id = $2 AND key = $3
      RETURNING id
    `;
    const result = await this.pool.query(query, [tenantId, userId, key]);
    return result.rowCount > 0;
  }

  async list(tenantId, userId, limit = 100, offset = 0) {
    const query = `
      SELECT id, key, content, created_at, updated_at
      FROM memories
      WHERE tenant_id = $1 AND user_id = $2
      ORDER BY updated_at DESC
      LIMIT $3 OFFSET $4
    `;
    const result = await this.pool.query(query, [tenantId, userId, limit, offset]);
    return result.rows;
  }

  async cleanup() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

module.exports = new MemoryService();

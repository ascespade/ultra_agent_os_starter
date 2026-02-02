const { getPool } = require('../../../../lib/db-connector');
const pino = require('pino');
const fs = require('fs').promises;
const path = require('path');

const logger = pino({
  name: 'memory-service',
  level: process.env.LOG_LEVEL || 'info'
});

class MemoryService {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      const pool = getPool();
      
      // Load and apply the new simple schema
      const schemaPath = path.join(__dirname, '../../../../lib/memory-schema-final.sql');
      const schema = await fs.readFile(schemaPath, 'utf8');
      
      // We execute the schema. ALERT: This drops tables as per requirements.
      await pool.query(schema);
      
      this.initialized = true;
      logger.info('Memory service initialized with FINAL SIMPLE SCHEMA');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to initialize memory service');
      throw error;
    }
  }

  async createMemory(tenantId, userId, key, content, options = {}) {
    const pool = getPool();
    // Ensure content is strictly JSONB object
    const finalContent = typeof content === 'object' ? content : { value: content };
    
    // Manual UPSERT logic as requested (No ON CONFLICT magic)
    try {
      // 1. Check if exists
      const checkQuery = `
        SELECT id FROM memories 
        WHERE tenant_id = $1 AND user_id = $2 AND key = $3
      `;
      const checkRes = await pool.query(checkQuery, [tenantId, userId, key]);

      if (checkRes.rows.length > 0) {
        // 2. Update
        const updateQuery = `
          UPDATE memories
          SET content = $1, updated_at = NOW()
          WHERE id = $2
          RETURNING id, key, content, created_at, updated_at
        `;
        const updateRes = await pool.query(updateQuery, [finalContent, checkRes.rows[0].id]);
        logger.info({ tenantId, userId, key }, 'Memory updated');
        return updateRes.rows[0];
      } else {
        // 2. Insert
        const insertQuery = `
          INSERT INTO memories (tenant_id, user_id, key, content)
          VALUES ($1, $2, $3, $4)
          RETURNING id, key, content, created_at, updated_at
        `;
        const insertRes = await pool.query(insertQuery, [tenantId, userId, key, finalContent]);
        logger.info({ tenantId, userId, key }, 'Memory created');
        return insertRes.rows[0];
      }
    } catch (error) {
      logger.error({ error: error.message, tenantId, userId, key }, 'Error in createMemory');
      throw error;
    }
  }

  async readMemory(tenantId, userId, key) {
    const pool = getPool();
    try {
      const query = `
        SELECT id, key, content, created_at, updated_at
        FROM memories
        WHERE tenant_id = $1 AND user_id = $2 AND key = $3
      `;
      const result = await pool.query(query, [tenantId, userId, key]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ error: error.message, tenantId, userId, key }, 'Error in readMemory');
      throw error;
    }
  }

  async deleteMemory(tenantId, userId, key) {
    const pool = getPool();
    try {
      const query = `
        DELETE FROM memories
        WHERE tenant_id = $1 AND user_id = $2 AND key = $3
        RETURNING id
      `;
      const result = await pool.query(query, [tenantId, userId, key]);
      
      const success = result.rowCount > 0;
      if (success) {
        logger.info({ tenantId, userId, key }, 'Memory deleted');
      }
      return { success, message: success ? 'Memory deleted' : 'Not found' };
    } catch (error) {
      logger.error({ error: error.message, tenantId, userId, key }, 'Error in deleteMemory');
      throw error;
    }
  }

  async getWorkspace(tenantId, userId) {
    const pool = getPool();
    try {
      // Return workspace overview
      const query = `
        SELECT key, created_at, updated_at
        FROM memories
        WHERE tenant_id = $1 AND user_id = $2
        ORDER BY updated_at DESC
        LIMIT 100
      `;
      const result = await pool.query(query, [tenantId, userId]);
      
      return {
        memories: result.rows,
        count: result.rowCount
      };
    } catch (error) {
      logger.error({ error: error.message, tenantId, userId }, 'Error in getWorkspace');
      throw error;
    }
  }

  async searchMemories(tenantId, userId, options = {}) {
    // Basic search implementation for compatibility
    const pool = getPool();
    try {
      const { query: searchStr } = options;
      
      let sql = `
        SELECT key, content, created_at 
        FROM memories 
        WHERE tenant_id = $1 AND user_id = $2
      `;
      const params = [tenantId, userId];

      if (searchStr) {
        sql += ` AND (key ILIKE $3 OR content::text ILIKE $3)`;
        params.push(`%${searchStr}%`);
      }
      
      sql += ` ORDER BY updated_at DESC LIMIT 50`;

      const result = await pool.query(sql, params);
      return {
        results: result.rows,
        total: result.rowCount
      };
    } catch (error) {
      logger.error({ error: error.message }, 'Error in searchMemories');
      throw error;
    }
  }

  async getMemoryStats(tenantId, userId) {
    const pool = getPool();
    try {
      const query = `
        SELECT COUNT(*) as total_memories
        FROM memories
        WHERE tenant_id = $1 AND user_id = $2
      `;
      const result = await pool.query(query, [tenantId, userId]);
      return {
        total_memories: parseInt(result.rows[0].total_memories),
        storage_engine: 'jsonb_simple_v2'
      };
    } catch (error) {
      logger.error({ error: error.message }, 'Error in getMemoryStats');
      throw error;
    }
  }

  async applyRetentionPolicy(policy, dryRun = true) {
    // Simplified specific implementation
    return { 
      message: "Retention policy not implemented in simple mode (Freeze Phase)",
      dry_run: dryRun 
    };
  }
}

module.exports = new MemoryService();

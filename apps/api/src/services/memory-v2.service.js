const { Pool } = require('pg');
const pino = require('pino');

const logger = pino({
  name: 'memory-service-v2',
  level: process.env.LOG_LEVEL || 'info'
});

class MemoryServiceV2 {
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

      // Run the new schema migration
      await this.runSchemaMigration();

      logger.info('Memory Service V2 initialized successfully');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to initialize Memory Service V2');
      throw error;
    }
  }

  async runSchemaMigration() {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const schemaPath = path.join(__dirname, '../../../../lib/memory-schema-v2.sql');
      const schemaSQL = await fs.readFile(schemaPath, 'utf8');
      
      const client = await this.pool.connect();
      try {
        await client.query(schemaSQL);
        logger.info('Memory schema V2 migration completed');
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to run memory schema migration');
      throw error;
    }
  }

  // Simple POST /api/memory/:key - accepts { content: {} } only
  async createMemory(tenantId, userId, key, content) {
    const client = await this.pool.connect();
    try {
      let effectiveUserId = userId;
      if (userId === 'system') {
        const u = await client.query('SELECT id FROM users ORDER BY id LIMIT 1');
        effectiveUserId = u.rows[0]?.id ?? null;
      }
      if (effectiveUserId == null) {
        throw new Error('No user available for system memory write');
      }
      const query = `
        INSERT INTO memories (tenant_id, user_id, key, content)
        VALUES ($1, $2, $3, $4)
        RETURNING id, created_at, updated_at
      `;

      const values = [tenantId, effectiveUserId, key, JSON.stringify(content)];
      const result = await client.query(query, values);

      logger.info({ tenantId, userId, key, memoryId: result.rows[0].id }, 'Memory created successfully');

      return {
        success: true,
        id: result.rows[0].id,
        key,
        created_at: result.rows[0].created_at,
        updated_at: result.rows[0].updated_at
      };
    } catch (error) {
      logger.error({ error: error.message, tenantId, userId, key }, 'Failed to create memory');
      throw error;
    } finally {
      client.release();
    }
  }

  // Simple GET /api/memory/:key - returns JSON directly
  async getMemory(tenantId, userId, key) {
    const client = await this.pool.connect();
    try {
      let effectiveUserId = userId;
      if (userId === 'system') {
        const u = await client.query('SELECT id FROM users ORDER BY id LIMIT 1');
        effectiveUserId = u.rows[0]?.id ?? null;
      }
      if (effectiveUserId == null) return null;
      const query = `
        SELECT id, key, content, created_at, updated_at
        FROM memories
        WHERE tenant_id = $1 AND user_id = $2 AND key = $3
      `;

      const result = await client.query(query, [tenantId, effectiveUserId, key]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const memory = result.rows[0];
      
      // Return content as JSON directly (not string)
      return {
        id: memory.id,
        key: memory.key,
        content: memory.content, // JSONB will be automatically converted to JSON
        created_at: memory.created_at,
        updated_at: memory.updated_at
      };
    } finally {
      client.release();
    }
  }

  // Simple update using direct UPDATE (no UPSERT)
  async updateMemory(tenantId, userId, key, content) {
    const client = await this.pool.connect();
    try {
      let effectiveUserId = userId;
      if (userId === 'system') {
        const u = await client.query('SELECT id FROM users ORDER BY id LIMIT 1');
        effectiveUserId = u.rows[0]?.id ?? null;
      }
      if (effectiveUserId == null) return null;
      const query = `
        UPDATE memories 
        SET content = $1, updated_at = NOW()
        WHERE tenant_id = $2 AND user_id = $3 AND key = $4
        RETURNING id, created_at, updated_at
      `;

      const values = [JSON.stringify(content), tenantId, effectiveUserId, key];
      const result = await client.query(query, values);
      
      if (result.rows.length === 0) {
        return null;
      }

      logger.info({ tenantId, userId, key, memoryId: result.rows[0].id }, 'Memory updated successfully');

      return {
        success: true,
        id: result.rows[0].id,
        key,
        created_at: result.rows[0].created_at,
        updated_at: result.rows[0].updated_at
      };
    } catch (error) {
      logger.error({ error: error.message, tenantId, userId, key }, 'Failed to update memory');
      throw error;
    } finally {
      client.release();
    }
  }

  // Simple delete
  async deleteMemory(tenantId, userId, key) {
    const client = await this.pool.connect();
    try {
      let effectiveUserId = userId;
      if (userId === 'system') {
        const u = await client.query('SELECT id FROM users ORDER BY id LIMIT 1');
        effectiveUserId = u.rows[0]?.id ?? null;
      }
      if (effectiveUserId == null) return { success: false, message: 'No user available' };
      const query = `
        DELETE FROM memories
        WHERE tenant_id = $1 AND user_id = $2 AND key = $3
        RETURNING id
      `;

      const result = await client.query(query, [tenantId, effectiveUserId, key]);
      
      if (result.rows.length === 0) {
        return { success: false, message: 'Memory not found' };
      }

      logger.info({ tenantId, userId, key }, 'Memory deleted successfully');

      return { success: true, id: result.rows[0].id };
    } catch (error) {
      logger.error({ error: error.message, tenantId, userId, key }, 'Failed to delete memory');
      throw error;
    } finally {
      client.release();
    }
  }

  // GET /api/workspace - shows memories + jobs (basic implementation)
  async getWorkspace(tenantId, userId) {
    const client = await this.pool.connect();
    try {
      // Resolve 'system' to first admin user id for memories (user_id is NOT NULL)
      let effectiveUserId = userId;
      if (userId === 'system') {
        const u = await client.query('SELECT id FROM users ORDER BY id LIMIT 1');
        effectiveUserId = u.rows[0]?.id ?? null;
      }

      // Use the new memory_entries table instead of memories
      let memoryResult = { rows: [] };
      if (effectiveUserId != null) {
        const memoryQuery = `
          SELECT id, agent_id as key, content, created_at, updated_at
          FROM memory_entries
          WHERE tenant_id = $1 AND agent_id = $2
          ORDER BY updated_at DESC
          LIMIT 50
        `;
        memoryResult = await client.query(memoryQuery, [tenantId, effectiveUserId]);
      }

      // Jobs: system can see all in tenant (user_id can be NULL)
      const jobsQuery = `
        SELECT id, type, status, created_at, updated_at
        FROM jobs
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `;
      const jobsResult = await client.query(jobsQuery, [tenantId]);

      return {
        memories: memoryResult.rows,
        jobs: jobsResult.rows,
        tenantId,
        userId,
        timestamp: new Date().toISOString()
      };
    } finally {
      client.release();
    }
  }

  async cleanup() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

module.exports = new MemoryServiceV2();

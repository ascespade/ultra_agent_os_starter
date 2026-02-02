const { getPool } = require('../../../../lib/db-connector');
const redis = require('redis');
const pino = require('pino');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

const logger = pino({
  name: 'job-service',
  level: process.env.LOG_LEVEL || 'info'
});

class JobService {
  constructor() {
    this.redisClient = null;
    this.queuePrefix = 'job_queue:';
    this.visibilityTimeoutPrefix = 'visibility:';
    this.defaultVisibilityTimeout = 30000; // 30 seconds
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      const pool = getPool();

      // Initialize Redis connection
      this.redisClient = redis.createClient({
        url: process.env.REDIS_URL
      });
      await this.redisClient.connect();

      // Run schema migrations
      await this.runMigrations();

      this.initialized = true;
      logger.info('Job service initialized (Simple/Final)');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to initialize job service');
      throw error;
    }
  }

  async runMigrations() {
    try {
      const pool = getPool();
      const schemaPath = path.join(__dirname, '../../../../lib/job-schema-final.sql');
      const schema = await fs.readFile(schemaPath, 'utf8');
      
      await pool.query(schema);
      logger.info('Job schema migrations completed');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to run job migrations');
      throw error;
    }
  }

  async createJob(tenantId, userId, type, inputData, options = {}) {
    const pool = getPool();
    try {
      const {
        priority = 0,
        maxRetries = 3,
        retryDelayMs = 1000,
        queueName = 'default',
        metadata = {},
        tags = []
      } = options;

      const jobId = uuidv4();

      const query = `
        INSERT INTO jobs (
          id, tenant_id, user_id, type, status, priority, input_data,
          max_retries, retry_delay_ms, queue_name, metadata, tags
        )
        VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, created_at, status
      `;

      const values = [
        jobId,
        tenantId,
        userId,
        type,
        priority,
        inputData, // JSONB handles object directly
        maxRetries,
        retryDelayMs,
        queueName,
        metadata,
        tags
      ];

      const result = await pool.query(query, values);

      // Enqueue job in Redis
      await this.enqueueJob(queueName, {
        id: jobId,
        tenantId,
        userId,
        type,
        priority,
        status: result.rows[0].status,
        created_at: result.rows[0].created_at
      });

      return {
        jobId,
        status: result.rows[0].status,
        queue: queueName,
        created_at: result.rows[0].created_at
      };
    } catch (error) {
      logger.error({ error: error.message, tenantId, type }, 'Job creation failed');
      throw error;
    }
  }

  async enqueueJob(queueName, job) {
    if (!this.redisClient) return;
    const tenantId = job.tenantId || 'default';
    const queueKey = `tenant:${tenantId}:job_queue`;
    const jobData = JSON.stringify(job);
    
    // Match worker's blPop
    await this.redisClient.lPush(queueKey, jobData);
    
    // Register tenant for worker
    await this.redisClient.sAdd('tenants', tenantId);
    
    logger.debug({ tenantId, jobId: job.id, queueKey }, 'Job enqueued for worker');
  }

  getQueueKey(queueName) {
    return `job_queue:${queueName}`;
  }

  // Basic list jobs for Dashboard
  async listJobs(tenantId, userId, options = {}) {
    const pool = getPool();
    const { limit = 20 } = options;
    
    // Simple fetch
    const result = await pool.query(`
      SELECT * FROM jobs 
      WHERE tenant_id = $1 AND user_id = $2
      ORDER BY created_at DESC
      LIMIT $3
    `, [tenantId, userId, limit]);

    return {
      jobs: result.rows,
      total: result.rowCount // Approximation
    };
  }

  async getJob(jobId) {
    const pool = getPool();
    const result = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
    return result.rows[0] || null;
  }
  
  async getJobStats(tenantId, userId) {
    // Return dummy or real basic stats
     const pool = getPool();
     const res = await pool.query(`
        SELECT status, count(*) as count 
        FROM jobs 
        WHERE tenant_id = $1 AND user_id = $2
        GROUP BY status
     `, [tenantId, userId]);
     
     const stats = {
       total_jobs: 0,
       completed_jobs: 0,
       failed_jobs: 0,
       pending_jobs: 0
     };
     
     res.rows.forEach(r => {
       const c = parseInt(r.count);
       stats.total_jobs += c;
       if (r.status === 'completed') stats.completed_jobs += c;
       if (r.status === 'failed' || r.status === 'dead_letter') stats.failed_jobs += c;
       if (r.status === 'pending') stats.pending_jobs += c;
     });
     
     return stats;
  }
}

module.exports = new JobService();

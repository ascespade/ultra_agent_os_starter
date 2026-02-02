const { Pool } = require('pg');
const redis = require('redis');
const pino = require('pino');
const { v4: uuidv4 } = require('uuid');

const logger = pino({
  name: 'job-service',
  level: 'debug'
});

class JobService {
  constructor() {
    this.pool = null;
    this.redisClient = null;
    this.queuePrefix = 'job_queue:';
    this.deadLetterPrefix = 'dead_letter:';
    this.visibilityTimeoutPrefix = 'visibility:';
    this.defaultVisibilityTimeout = 30000; // 30 seconds
  }

  async initialize() {
    try {
      // Initialize database connection
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Initialize Redis connection
      this.redisClient = redis.createClient({
        url: process.env.REDIS_URL
      });
      await this.redisClient.connect();

      // Run schema migrations
      await this.runMigrations();

      logger.info('Job service initialized successfully');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to initialize job service');
      throw error;
    }
  }

  async runMigrations() {
    try {
      // Skip job schema migrations - using main db-connector migrations only
      logger.info('Job schema migrations skipped - using main database schema');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to run job migrations');
      throw error;
    }
  }

  async createJob(tenantId, userId, type, inputData, options = {}) {
    const client = await this.pool.connect();
    try {
      const {
        priority = 0,
        maxRetries = 3,
        retryDelayMs = 1000,
        visibilityTimeoutMs = this.defaultVisibilityTimeout,
        queueName = 'default',
        metadata = {},
        tags = [],
        expiresAt = null
      } = options;

      const jobId = uuidv4().toString();
      const inputStr = JSON.stringify(inputData);

      logger.debug({ jobId, tenantId, userId, type, priority, inputStr }, 'Creating job with parameters');

      const query = `
        INSERT INTO jobs (
          id, tenant_id, user_id, type, status, priority, input_data,
          max_retries, retry_delay_ms, visibility_timeout_ms, queue_name,
          metadata, tags, expires_at
        )
        VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id, created_at, status
      `;

      const values = [
        jobId,
        tenantId,
        userId,
        type,
        priority,
        inputStr,
        maxRetries,
        retryDelayMs,
        visibilityTimeoutMs,
        queueName,
        JSON.stringify(metadata),
        tags,
        expiresAt
      ];

      const result = await client.query(query, values);

      logger.debug({ result: result.rows }, 'Database query completed');

      // Enqueue job in Redis
      try {
        await this.enqueueJob(queueName, {
          id: jobId,
          tenantId,
          userId,
          type,
          priority,
          status: result.rows[0].status,
          created_at: result.rows[0].created_at
        });
        logger.debug({ jobId }, 'Job enqueued successfully');
      } catch (redisError) {
        logger.error({ error: redisError.message, jobId }, 'Failed to enqueue job in Redis');
        throw redisError;
      }

      logger.info({ jobId, tenantId, userId, type, queueName }, 'Job created successfully');

      return {
        jobId,
        status: result.rows[0].status,
        queue: queueName,
        priority,
        created_at: result.rows[0].created_at
      };
    } catch (error) {
      logger.error({ error: error.message, tenantId, userId, type }, 'Failed to create job');
      throw error;
    } finally {
      client.release();
    }
  }

  async enqueueJob(queueName, job) {
    const tenantId = job.tenantId || 'default';
    const queueKey = `tenant:${tenantId}:job_queue`;
    const jobData = JSON.stringify(job);
    
    // Use Redis list (LPUSH) to match worker's BLPOP
    await this.redisClient.lPush(queueKey, jobData);
    
    // Ensure tenant is registered for worker monitoring
    await this.redisClient.sAdd('tenants', tenantId);
    
    logger.debug({ tenantId, jobId: job.id, queueKey }, 'Job enqueued for worker');
  }

  async dequeueJob(queueName, options = {}) {
    const {
      visibilityTimeoutMs = this.defaultVisibilityTimeout,
      timeoutMs = visibilityTimeoutMs + 5000
    } = options;

    const queueKey = this.getQueueKey(queueName);
    
    // Get highest priority job (lowest score)
    const result = await this.redisClient.bzPopMin(queueKey, {
      timeout: timeoutMs
    });

    if (!result) {
      return null;
    }

    const job = JSON.parse(result);
    
    // Set visibility timeout
    const visibilityKey = this.getVisibilityKey(job.id);
    await this.redisClient.setEx(visibilityKey, visibilityTimeoutMs / 1000, job.id);
    
    // Update job status to processing
    await this.updateJobStatus(job.id, 'processing', {
      started_at: new Date().toISOString()
    });

    logger.debug({ queueName, jobId: job.id }, 'Job dequeued');

    return job;
  }

  async returnJobToQueue(jobId, options = {}) {
    const {
      increaseDelay = false,
      newDelayMs = null
    } = options;

    const client = await this.pool.connect();
    try {
      // Get job details
      const jobQuery = `
        SELECT queue_name, retry_count, retry_delay_ms, max_retries
        FROM jobs
        WHERE id = $1
      `;
      
      const jobResult = await client.query(jobQuery, [jobId]);
      
      if (jobResult.rows.length === 0) {
        return false;
      }
      
      const job = jobResult.rows[0];
      
      // Update retry count and delay
      let newRetryCount = job.retry_count + 1;
      let newRetryDelay = job.retry_delay_ms;
      
      if (increaseDelay) {
        newRetryDelay = Math.min(job.retry_delay_ms * 2, 60000); // Max 60 seconds
      } else if (newDelayMs) {
        newRetryDelay = newDelayMs;
      }
      
      // Update job status
      await this.updateJobStatus(jobId, 'retrying', {
        retry_count: newRetryCount,
        retry_delay_ms: newRetryDelay,
        updated_at: new Date().toISOString()
      });

      // Re-enqueue with higher score (lower priority)
      const queueKey = this.getQueueKey(job.queue_name);
      const score = 100 - (job.priority || 0) + newRetryCount; // Lower priority for retries
      
      await this.redisClient.zAdd(queueKey, score, JSON.stringify({
        id: jobId,
        tenant_id: null, // Will be populated in next step
        user_id: null,
        type: null,
        status: 'retrying',
        retry_count: newRetryCount,
        retry_delay_ms: newRetryDelay
      }));

      logger.info({ jobId, queueName: job.queue_name, retryCount: newRetryCount }, 'Job returned to queue');

      return true;
    } finally {
      client.release();
    }
  }

  async completeJob(jobId, outputData, processingTimeMs) {
    const client = await this.pool.connect();
    try {
      const query = `
        UPDATE jobs 
        SET status = 'completed', 
            output_data = $1, 
            processing_time_ms = $2,
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = $3
        RETURNING id, status, completed_at
      `;

      const values = [
        JSON.stringify(outputData),
        processingTimeMs,
        jobId
      ];

      const result = await client.query(query, values);

      // Clear visibility timeout
      const visibilityKey = this.getVisibilityKey(jobId);
      await this.redisClient.del(visibilityKey);

      logger.info({ jobId, processingTimeMs }, 'Job completed successfully');

      return {
        jobId,
        status: result.rows[0].status,
        completed_at: result.rows[0].completed_at
      };
    } finally {
      client.release();
    }
  }

  async failJob(jobId, errorMessage, errorDetails = null, processingTimeMs = null) {
    const client = await this.pool.connect();
    try {
      const jobQuery = `
        SELECT retry_count, max_retries, queue_name
        FROM jobs
        WHERE id = $1
      `;
      
      const jobResult = await client.query(jobQuery, [jobId]);
      
      if (jobResult.rows.length === 0) {
        return false;
      }
      
      const job = jobResult.rows[0];
      
      // Check if max retries exceeded
      if (job.retry_count >= job.max_retries) {
        // Move to dead letter
        await this.moveToDeadLetter(jobId, errorMessage, errorDetails);
        return { status: 'dead_letter' };
      } else {
        // Return to queue for retry
        await this.returnJobToQueue(jobId, { increaseDelay: true });
        return { status: 'retrying' };
      }
    } finally {
      client.release();
    }
  }

  async moveToDeadLetter(jobId, errorMessage, errorDetails = null) {
    const client = await this.pool.connect();
    try {
      // Get job details
      const jobQuery = `
        SELECT tenant_id, user_id, type, status, input_data, retry_count, max_retries,
               failed_at, created_at, worker_id, queue_name, metadata, tags
        FROM jobs
        WHERE id = $1
      `;
      
      const jobResult = await client.query(jobQuery, [jobId]);
      
      if (jobResult.rows.length === 0) {
        return false;
      }
      
      const job = jobResult.rows[0];
      
      // Insert into dead letter table
      const dlQuery = `
        INSERT INTO dead_letter_jobs (
          original_job_id, tenant_id, user_id, job_type, status,
          input_data, error_message, error_details, retry_count,
          max_retries, failed_at, original_created_at, worker_id,
          queue_name, metadata, tags
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `;
      
      const dlValues = [
        jobId,
        job.tenant_id,
        job.user_id,
        job.type,
        job.status,
        job.input_data,
        errorMessage,
        errorDetails ? JSON.stringify(errorDetails) : null,
        job.retry_count,
        job.max_retries,
        new Date().toISOString(),
        job.created_at,
        job.worker_id,
        job.queue_name,
        job.metadata,
        job.tags
      ];
      
      await client.query(dlQuery);

      // Update original job status
      await this.updateJobStatus(jobId, 'dead_letter', {
        error_message: errorMessage,
        error_details: errorDetails ? JSON.stringify(errorDetails) : null,
        updated_at: new Date().toISOString()
      });

      // Clear visibility timeout
      const visibilityKey = this.getVisibilityKey(jobId);
      await this.redisClient.del(visibilityKey);

      logger.warn({ jobId, errorMessage }, 'Job moved to dead letter queue');

      return true;
    } finally {
      client.release();
    }
  }

  async updateJobStatus(jobId, status, updates = {}) {
    const client = await this.pool.connect();
    try {
      const setClause = Object.keys(updates)
        .map((key, index) => `${key} = $${index + 2}`)
        .join(', ');
      
      const values = Object.values(updates);
      
      const query = `
        UPDATE jobs 
        SET status = $1, ${setClause}, updated_at = NOW()
        WHERE id = $2
        RETURNING id, status, updated_at
      `;
      
      const result = await client.query(query, [status, ...values, jobId]);
      
      return {
        jobId: result.rows[0].id,
        status: result.rows[0].status,
        updated_at: result.rows[0].updated_at
      };
    } finally {
      client.release();
    }
  }

  async getJob(jobId) {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT id, tenant_id, user_id, type, status, priority,
               input_data, output_data, error_message, error_details,
               retry_count, max_retries, retry_delay_ms, visibility_timeout_ms,
               created_at, updated_at, started_at, completed_at,
               expires_at, worker_id, queue_name, metadata, tags
        FROM jobs
        WHERE id = $1
      `;
      
      const result = await client.query(query, [jobId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async listJobs(tenantId, userId, options = {}) {
    const {
      status = null,
      type = null,
      limit = 20,
      page = 1,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      queueName = null
    } = options;

    logger.debug({ tenantId, userId, options }, 'listJobs called with parameters');

    const client = await this.pool.connect();
    try {
      let whereClause = 'WHERE tenant_id = $1';
      let queryParams = [tenantId];
      let paramIndex = 2;

      logger.debug({ queryParams, whereClause }, 'Initial query parameters');

      if (userId) {
        whereClause += ' AND user_id = $' + paramIndex;
        queryParams.push(userId);
        paramIndex++;
      }

      if (status) {
        whereClause += ' AND status = $' + paramIndex;
        queryParams.push(status);
        paramIndex++;
      }

      if (type) {
        whereClause += ' AND type = $' + paramIndex;
        queryParams.push(type);
        paramIndex++;
      }

      if (queueName) {
        whereClause += ' AND queue_name = $' + paramIndex;
        queryParams.push(queueName);
        paramIndex++;
      }

      const query = `
        SELECT id, tenant_id, user_id, type, status, priority,
               created_at, updated_at, started_at, completed_at,
               expires_at, worker_id, queue_name, metadata, tags,
               retry_count, max_retries
        FROM jobs
        ${whereClause}
        ORDER BY ${sortBy} ${sortOrder}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const countQuery = `
        SELECT COUNT(*) as total
        FROM jobs
        ${whereClause}
      `;

      logger.debug({ queryParams: JSON.stringify(queryParams), whereClause, tenantId: String(tenantId) }, 'About to execute query');

      const [jobsResult, countResult] = await Promise.all([
        client.query(query, queryParams.concat([limit, (page - 1) * limit])),
        client.query(countQuery, queryParams)
      ]);

      const total = parseInt(countResult.rows[0].total);
      const jobs = jobsResult.rows.map(row => ({
        id: row.id,
        tenant_id: row.tenant_id,
        user_id: row.user_id,
        type: row.type,
        status: row.status,
        priority: row.priority,
        created_at: row.created_at,
        updated_at: row.updated_at,
        started_at: row.started_at,
        completed_at: row.completed_at,
        expires_at: row.expires_at,
        worker_id: row.worker_id,
        queue_name: row.queue_name,
        metadata: row.metadata,
        tags: row.tags,
        retry_count: row.retry_count,
        max_retries: row.max_retries
      }));

      return {
        jobs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } finally {
      client.release();
    }
  }

  async getQueueStatus(tenantId = 'default') {
    const queueKey = `tenant:${tenantId}:job_queue`;
    
    try {
      // Get queue size
      const queueSize = await this.redisClient.lLen(queueKey);
      
      // Get processing jobs estimate (simplified for CRUD)
      const processingCount = 0; 
      
      return {
        tenant_id: tenantId,
        size: queueSize,
        processing: processingCount,
        backlog: queueSize,
        backlog_limit: 5000,
        is_overloaded: queueSize > 5000
      };
    } catch (error) {
      logger.error({ error: error.message, queueName }, 'Failed to get queue status');
      return {
        queue_name: queueName,
        size: 0,
        processing: 0,
        backlog: 0,
        backlog_limit: 5000,
        is_overloaded: false
      };
    }
  }

  async getJobStats(tenantId = null, userId = null) {
    const client = await this.pool.connect();
    try {
      let whereClause = 'WHERE 1=1';
      let queryParams = [];

      if (tenantId) {
        whereClause += ' AND tenant_id = $1';
        queryParams.push(tenantId);
      }

      if (userId) {
        const paramIndex = queryParams.length + 1;
        whereClause += ` AND user_id = $${paramIndex}`;
        queryParams.push(userId);
      }

      const query = `
        SELECT 
          COUNT(*) as total_jobs,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_jobs,
          COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_jobs,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs,
          COUNT(CASE WHEN status = 'retrying' THEN 1 END) as retrying_jobs,
          COUNT(CASE WHEN status = 'dead_letter' THEN 1 END) as dead_letter_jobs,
          AVG(CASE WHEN status IN ('completed', 'failed', 'dead_letter') THEN processing_time_ms END) as avg_processing_time_ms,
          MAX(created_at) as latest_job,
          MIN(created_at) as oldest_job
        FROM jobs
        ${whereClause}
      `;

      const result = await client.query(query, queryParams);

      return {
        total_jobs: parseInt(result.rows[0].total_jobs),
        pending_jobs: parseInt(result.rows[0].pending_jobs),
        processing_jobs: parseInt(result.rows[0].processing_jobs),
        completed_jobs: parseInt(result.rows[0].completed_jobs),
        failed_jobs: parseInt(result.rows[0].failed_jobs),
        retrying_jobs: parseInt(result.rows[0].retrying_jobs),
        dead_letter_jobs: parseInt(result.rows[0].dead_letter_jobs),
        avg_processing_time_ms: parseFloat(result.rows[0].avg_processing_time_ms || 0),
        latest_job: result.rows[0].latest_job,
        oldest_job: result.rows[0].oldest_job
      };
    } finally {
      client.release();
    }
  }

  async applyRetentionPolicy(policy, dryRun = true) {
    const client = await this.pool.connect();
    try {
      let query;
      let queryParams = [];
      let description;

      switch (policy.type) {
        case 'age':
          query = `
            UPDATE jobs 
            SET status = 'archived', updated_at = NOW()
            WHERE status IN ('pending', 'failed', 'retrying')
              AND created_at < NOW() - INTERVAL '${policy.days} days'
          `;
          queryParams.push(policy.days);
          description = `Archive jobs older than ${policy.days} days`;
          break;

        case 'size':
          query = `
            WITH jobs_to_archive AS (
              SELECT id, size_bytes
              FROM jobs
              WHERE status IN ('completed', 'failed', 'dead_letter')
              ORDER BY created_at ASC
            ),
            total_size AS (
              SELECT COALESCE(SUM(size_bytes), 0) as total
              FROM jobs
              WHERE status IN ('completed', 'failed', 'dead_letter')
            )
            UPDATE jobs 
            SET status = 'archived', updated_at = NOW()
            WHERE id IN (
              SELECT id FROM jobs_to_archive
              WHERE (SELECT total FROM total_size) - size_bytes > $1
            )
          `;
          queryParams.push(policy.max_size_bytes);
          description = `Archive jobs to stay under ${policy.max_size_bytes} bytes`;
          break;

        case 'tags':
          query = `
            UPDATE jobs 
            SET status = 'archived', updated_at = NOW()
            WHERE status IN ('pending', 'failed', 'retrying')
              AND tags && $1
          `;
          queryParams.push(policy.tags);
          description = `Archive jobs with tags: ${policy.tags.join(', ')}`;
          break;

        default:
          throw new Error(`Unknown retention policy type: ${policy.type}`);
      }

      if (dryRun) {
        // Count what would be archived
        const countQuery = query.replace('UPDATE jobs SET status = archived', 'SELECT COUNT(*) as count');
        const result = await client.query(countQuery, queryParams);
        
        return {
          dry_run: true,
          affected_jobs: parseInt(result.rows[0].count),
          description,
          policy
        };
      } else {
        // Get size before archiving
        const sizeQuery = query.replace('UPDATE jobs SET status = archived', 'SELECT COALESCE(SUM(size_bytes), 0) as total_size');
        const sizeResult = await client.query(sizeQuery, queryParams);
        const totalSizeFreed = parseInt(sizeResult.rows[0].total_size || 0);

        // Execute archiving
        const result = await client.query(query, queryParams);

        return {
          dry_run: false,
          affected_jobs: result.rowCount,
          total_size_freed: totalSizeFreed,
          description,
          policy
        };
      }
    } finally {
      client.release();
    }
  }

  getQueueKey(queueName) {
    return `${this.queuePrefix}${queueName}`;
  }

  getVisibilityKey(jobId) {
    return `${this.visibilityTimeoutPrefix}${jobId}`;
  }

  async cleanup() {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
    if (this.pool) {
      await this.pool.end();
    }
  }
}

module.exports = new JobService();

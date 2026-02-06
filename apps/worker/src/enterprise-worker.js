require('dotenv').config();
const redis = require('redis');
const { Pool } = require('pg');
const pino = require('pino');

const logger = pino({
  name: 'worker-service',
  level: process.env.LOG_LEVEL || 'info'
});

const REDIS_URL = process.env.REDIS_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY) || 5;
const RETRY_ATTEMPTS = parseInt(process.env.RETRY_ATTEMPTS) || 3;
const RETRY_DELAY = parseInt(process.env.RETRY_DELAY) || 1000;
const MAX_BACKLOG = 100;

if (!REDIS_URL) {
  logger.error('REDIS_URL environment variable is required');
  process.exit(1);
}

if (!DATABASE_URL) {
  logger.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

// Redis client
const redisClient = redis.createClient({ url: REDIS_URL });

// PostgreSQL connection
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: WORKER_CONCURRENCY + 5
});

// Worker state
let isRunning = false;
let processedJobs = 0;
let failedJobs = 0;

// Health check server
const healthServer = require('http').createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'worker-service',
      timestamp: new Date().toISOString(),
      isRunning,
      processedJobs,
      failedJobs
    }));
  } else if (req.url === '/ready') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ready',
      service: 'worker-service',
      timestamp: new Date().toISOString()
    }));
  } else if (req.url === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      service: 'worker-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      processedJobs,
      failedJobs,
      isRunning,
      concurrency: WORKER_CONCURRENCY
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

// Job processing functions
async function getNextJob() {
  try {
    // Try to get a job from any tenant queue
    const keys = await redisClient.keys('tenant:*:job_queue');
    if (keys.length === 0) {
      return null;
    }

    for (const queueKey of keys) {
      const jobData = await redisClient.lPop(queueKey);
      if (jobData) {
        return {
          job: JSON.parse(jobData),
          queueKey,
          tenantId: queueKey.split(':')[1]
        };
      }
    }

    return null;
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting next job');
    return null;
  }
}

async function updateJobStatus(jobId, status, result = null, error = null) {
  try {
    // CRITICAL FIX: Build dynamic SET clause with timestamps
    let setClause = 'status = $1, output_data = $2, error_message = $3, updated_at = NOW()';
    let values = [
      status,
      result ? JSON.stringify(result) : null,
      error,
      jobId
    ];
    
    // CRITICAL FIX: Add started_at when transitioning to processing
    if (status === 'processing') {
      setClause += ', started_at = NOW()';
    }
    
    // CRITICAL FIX: Add completed_at when transitioning to completed
    if (status === 'completed') {
      setClause += ', completed_at = NOW()';
    }
    
    const updateQuery = `
      UPDATE jobs 
      SET ${setClause}
      WHERE id = $${values.length}
    `;
    
    await pool.query(updateQuery, values);

    // Update Redis cache
    const jobKey = `job:${jobId}`;
    const jobCache = await redisClient.hGetAll(jobKey);
    if (Object.keys(jobCache).length > 0) {
      jobCache.status = status;
      jobCache.updated_at = new Date().toISOString();
      if (result) jobCache.output_data = result;
      if (error) jobCache.error_message = error;
      await redisClient.hMSet(jobKey, jobCache);
    }

    // Publish job update
    await redisClient.publish('job:status', JSON.stringify({
      jobId,
      status,
      result,
      error,
      timestamp: new Date().toISOString()
    }));

    logger.info({ jobId, status }, 'Job status updated');
  } catch (error) {
    logger.error({ error: error.message, jobId }, 'Error updating job status');
  }
}

async function processJob(jobData, queueKey, tenantId) {
  const { id: jobId, type, input_data } = jobData;
  
  logger.info({ jobId, type, tenantId }, 'Processing job');

  try {
    // CRITICAL FIX: Update job status to processing when starting
    await updateJobStatus(jobId, 'processing');
    
    // Simulate job processing
    let result;
    
    switch (type) {
      case 'chat':
        // Simulate chat processing
        result = {
          plan: {
            steps: [
              {
                id: '1',
                action: 'analyze',
                result: { analysis: 'Chat message analyzed', findings: [] },
                status: 'completed',
                description: 'Core analysis: chat message processed'
              },
              {
                id: '2',
                action: 'execute',
                result: { output: 'Chat response generated' },
                status: 'completed',
                description: 'Core execution: chat response created'
              },
              {
                id: '3',
                action: 'verify',
                result: { status: 'success', verified: true },
                status: 'completed',
                description: 'Core verification: response verified'
              }
            ],
            adapter_enhanced: false
          },
          intent: {
            analysis: 'Chat message processed successfully',
            adapter_enhanced: false
          },
          execution_summary: {
            total_steps: 3,
            execution_time: Date.now(),
            completed_steps: 3
          }
        };
        break;
        
      default:
        throw new Error(`Unknown job type: ${type}`);
    }

    // Update job as completed
    await updateJobStatus(jobId, 'completed', result);
    processedJobs++;
    
    logger.info({ jobId, type }, 'Job completed successfully');
    
  } catch (error) {
    logger.error({ error: error.message, jobId, type }, 'Job processing failed');
    
    // Update job as failed
    await updateJobStatus(jobId, 'failed', null, error.message);
    failedJobs++;
  }
}

async function retryFailedJob(jobData, queueKey, tenantId, attempt) {
  if (attempt >= RETRY_ATTEMPTS) {
    // Max retries reached, move to dead letter
    await moveToDeadLetter(jobData, queueKey, tenantId, 'Max retries exceeded');
    return;
  }

  // Exponential backoff
  const delay = RETRY_DELAY * Math.pow(2, attempt);
  await new Promise(resolve => setTimeout(resolve, delay));

  logger.info({ jobId: jobData.id, attempt }, `Retrying job (attempt ${attempt + 1}/${RETRY_ATTEMPTS})`);
  
  try {
    await processJob(jobData, queueKey, tenantId);
  } catch (error) {
    logger.error({ error: error.message, jobId: jobData.id }, `Retry ${attempt + 1} failed`);
    await retryFailedJob(jobData, queueKey, tenantId, attempt + 1);
  }
}

async function moveToDeadLetter(jobData, queueKey, tenantId, reason) {
  try {
    const deadLetterKey = `tenant:${tenantId}:dead_letter_queue`;
    await redisClient.rPush(deadLetterKey, JSON.stringify({
      ...jobData,
      failed_at: new Date().toISOString(),
      reason,
      original_queue: queueKey
    }));

    // Update job status
    await updateJobStatus(jobData.id, 'failed', null, reason);
    
    logger.warn({ jobId: jobData.id, reason }, 'Job moved to dead letter queue');
  } catch (error) {
    logger.error({ error: error.message, jobId: jobData.id }, 'Error moving job to dead letter queue');
  }
}

async function checkBacklogLimits(tenantId) {
  try {
    const queueKey = `tenant:${tenantId}:job_queue`;
    const backlogSize = await redisClient.lLen(queueKey);
    
    if (backlogSize > MAX_BACKLOG) {
      // Remove oldest jobs to maintain limit
      const removeCount = backlogSize - MAX_BACKLOG;
      for (let i = 0; i < removeCount; i++) {
        const jobData = await redisClient.lPop(queueKey);
        if (jobData) {
          const job = JSON.parse(jobData);
          await moveToDeadLetter(job, queueKey, tenantId, 'Backlog limit exceeded');
        }
      }
      
      logger.warn({ tenantId, removedCount }, `Removed ${removeCount} jobs to maintain backlog limit`);
    }
  } catch (error) {
    logger.error({ error: error.message, tenantId }, 'Error checking backlog limits');
  }
}

// Main worker loop
async function workerLoop() {
  while (isRunning) {
    try {
      const jobInfo = await getNextJob();
      
      if (jobInfo) {
        const { job, queueKey, tenantId } = jobInfo;
        
        // Check backlog limits before processing
        await checkBacklogLimits(tenantId);
        
        // Process the job
        await processJob(job, queueKey, tenantId);
      } else {
        // No jobs available, wait briefly
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      logger.error({ error: error.message }, 'Error in worker loop');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// Start worker service
async function startWorker() {
  try {
    // Connect to Redis
    await redisClient.connect();
    logger.info('Connected to Redis');

    // Test database connection
    await pool.query('SELECT 1');
    logger.info('Connected to PostgreSQL');

    // Start health check server
    healthServer.listen(parseInt(process.env.PORT) + 1000 || 4004, process.env.HOST || '0.0.0.0', () => {
      logger.info(`Health check server listening on port ${parseInt(process.env.PORT) + 1000 || 4004}`);
    });

    // Start worker loop
    isRunning = true;
    logger.info(`Worker service started with concurrency: ${WORKER_CONCURRENCY}`);
    
    // Start multiple worker instances
    const workers = [];
    for (let i = 0; i < WORKER_CONCURRENCY; i++) {
      workers.push(workerLoop());
    }
    
    await Promise.all(workers);

  } catch (error) {
    logger.error({ error: error.message }, 'Failed to start worker service');
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down worker service...');
  
  isRunning = false;
  
  try {
    await redisClient.quit();
    await pool.end();
    healthServer.close();
    logger.info('Worker service shutdown complete');
  } catch (error) {
    logger.error({ error: error.message }, 'Error during shutdown');
  }
  
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the service
startWorker();

const express = require('express');
const router = express.Router();
const pino = require('pino');
const { v4: uuidv4 } = require('uuid');

const logger = pino({
  name: 'test-data-controller',
  level: process.env.LOG_LEVEL || 'info'
});

// Create test jobs for real data testing
router.post('/create-test-jobs', async (req, res) => {
  try {
    const db = require('../../../lib/db-connector').getPool();
    const redis = require('redis');
    const client = redis.createClient({ url: process.env.REDIS_URL });
    
    await client.connect();
    
    // Create test jobs with different statuses
    const testJobs = [];
    const statuses = ['pending', 'active', 'completed', 'failed'];
    const types = ['system', 'maintenance', 'monitoring', 'cleanup'];
    
    for (let i = 0; i < 20; i++) {
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const type = types[Math.floor(Math.random() * types.length)];
      const jobId = uuidv4();
      const createdAt = new Date(Date.now() - Math.random() * 3600000); // Random time in last hour
      const duration = status === 'completed' ? Math.floor(Math.random() * 5000) + 500 : null;
      
      // Insert into database
      await db.query(`
        INSERT INTO jobs (id, tenant_id, user_id, type, status, data, created_at, updated_at, duration)
        VALUES ($1, 'system', 'system', $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO NOTHING
      `, [
        jobId,
        type,
        status,
        JSON.stringify({ message: `Test job ${i + 1}`, test: true }),
        createdAt,
        status === 'completed' || status === 'failed' ? new Date(createdAt.getTime() + (duration || 1000)) : new Date(),
        duration
      ]);
      
      // Add to Redis queues
      if (status === 'pending') {
        await client.lPush('jobs:queue', JSON.stringify({
          id: jobId,
          type: type,
          data: { message: `Test job ${i + 1}`, test: true },
          created_at: createdAt.toISOString()
        }));
      } else if (status === 'active') {
        await client.lPush('jobs:processing', JSON.stringify({
          id: jobId,
          type: type,
          data: { message: `Test job ${i + 1}`, test: true },
          created_at: createdAt.toISOString()
        }));
      } else if (status === 'failed') {
        await client.lPush('jobs:failed', JSON.stringify({
          id: jobId,
          type: type,
          data: { message: `Test job ${i + 1}`, test: true },
          error: 'Test failure',
          created_at: createdAt.toISOString()
        }));
      }
      
      testJobs.push({ id: jobId, status, type });
    }
    
    await client.disconnect();
    
    logger.info(`Created ${testJobs.length} test jobs`);
    
    res.json({
      success: true,
      message: `Created ${testJobs.length} test jobs`,
      jobs: testJobs
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to create test jobs');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear test data
router.delete('/clear-test-data', async (req, res) => {
  try {
    const db = require('../../../lib/db-connector').getPool();
    const redis = require('redis');
    const client = redis.createClient({ url: process.env.REDIS_URL });
    
    await client.connect();
    
    // Clear test jobs from database
    const result = await db.query(`
      DELETE FROM jobs 
      WHERE data::text LIKE '%test%'
      RETURNING id
    `);
    
    // Clear Redis queues
    await client.del('jobs:queue');
    await client.del('jobs:processing');
    await client.del('jobs:failed');
    
    await client.disconnect();
    
    logger.info(`Cleared ${result.rows.length} test jobs`);
    
    res.json({
      success: true,
      message: `Cleared ${result.rows.length} test jobs`,
      cleared: result.rows.length
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to clear test data');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current test data status
router.get('/test-data-status', async (req, res) => {
  try {
    const db = require('../../../lib/db-connector').getPool();
    const redis = require('redis');
    const client = redis.createClient({ url: process.env.REDIS_URL });
    
    await client.connect();
    
    // Get test jobs count from database
    const dbResult = await db.query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM jobs 
      WHERE data::text LIKE '%test%'
      GROUP BY status
    `);
    
    // Get Redis queue lengths
    const queueLength = await client.lLen('jobs:queue');
    const processingLength = await client.lLen('jobs:processing');
    const failedLength = await client.lLen('jobs:failed');
    
    await client.disconnect();
    
    res.json({
      database: dbResult.rows,
      redis: {
        queue: queueLength,
        processing: processingLength,
        failed: failedLength
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get test data status');
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

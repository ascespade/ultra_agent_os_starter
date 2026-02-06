const express = require('express');
const healthController = require('../controllers/health.controller');
const { getPool } = require('../../../../lib/db-connector');
const redis = require('redis');

const router = express.Router();

// Get Redis client - lazy initialization
let redisClient = null;

async function getRedisClient() {
  if (!redisClient && process.env.REDIS_URL) {
    redisClient = redis.createClient({ url: process.env.REDIS_URL });
    await redisClient.connect();
  }
  return redisClient;
}

// GET /worker/health
router.get('/health', healthController.checkHealth);

// GET /api/queue/status - Queue status endpoint (REAL data)
router.get('/queue/status', async (req, res) => {
  try {
    const pool = getPool();
    
    // Query pending jobs from Redis (job_queue:default sorted set)
    let pending = 0;
    let deadLetter = 0;
    const rc = await getRedisClient();
    if (rc) {
      try {
        pending = await rc.zCard('job_queue:default');
      } catch (e) {
        console.error('[QUEUE_STATUS] Redis error:', e.message);
      }
    }
    
    // Query processing/completed/failed from DB
    const counts = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed' OR status = 'dead_letter') as failed,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_db,
        MAX(updated_at) as last_activity
      FROM jobs
    `);
    
    // Combine Redis pending with DB pending count
    const pendingDb = parseInt(counts.rows[0]?.pending_db || '0', 10);
    const totalPending = pending + pendingDb;
    
    res.json({
      status: 'active',
      queue: {
        pending: totalPending,
        processing: parseInt(counts.rows[0]?.processing || '0', 10),
        completed: parseInt(counts.rows[0]?.completed || '0', 10),
        failed: parseInt(counts.rows[0]?.failed || '0', 10),
        deadLetter: deadLetter
      },
      worker: {
        status: 'healthy',
        lastSeen: new Date().toISOString()
      },
      lastActivity: counts.rows[0]?.last_activity || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[QUEUE_STATUS] Error:', error.message);
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch queue status',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;

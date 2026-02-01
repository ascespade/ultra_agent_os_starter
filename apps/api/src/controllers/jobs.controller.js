const { v4: uuidv4 } = require("uuid");
const dbConnector = require("../../../../lib/db-connector");
const { redisClient } = require("../services/redis.service"); // This needs to be created or passed
// For now, assume redisClient is available globally or we fix imports later.
// Actually, it's better to verify where redisClient comes from.
// In server.js it is instantiated. We should move Redis to a service.

async function createJob(req, res) {
  const { message } = req.body;
  const jobId = uuidv4();
  const tenantId = req.tenantId;
  
  // Phase 5: Backlog Limits
  const MAX_BACKLOG = 100; // Hard limit per tenant
  const queueKey = `tenant:${tenantId}:job_queue`;

  try {
    // We need to access redisClient. Using global or require logic.
    // Assuming we will move redisClient to a singleton service.
    const redis = require('../services/redis.service').getClient();
    
    const backlogSize = await redis.lLen(queueKey);
    if (backlogSize >= MAX_BACKLOG) {
      console.warn(`[JOBS] Tenant ${tenantId} exceeded backlog limit (${backlogSize}/${MAX_BACKLOG})`);
      return res.status(429).json({ 
        error: "System busy. Too many pending jobs.",
        retry_after: 60 
      });
    }

    const db = dbConnector.getPool();

    await db.query(
      `
      INSERT INTO jobs (id, user_id, tenant_id, type, status, input_data, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `,
      [
        jobId,
        parseInt(req.user.userId),
        tenantId,
        "chat",
        "planning",
        JSON.stringify({ message }),
      ],
    );

    const jobData = {
      id: jobId,
      tenantId: tenantId,
      userId: req.user.userId,
      type: "chat",
      input: { message },
      status: "planning",
      created_at: new Date().toISOString(),
    };

    await redis.lPush(queueKey, JSON.stringify(jobData));
    
    // Also store initial state in Redis for quick status checks
    const jobKey = `tenant:${tenantId}:job:${jobId}`;
    await redis.hSet(jobKey, 'data', JSON.stringify(jobData));
    await redis.expire(jobKey, 86400); // 24h retention

    // Notify connected WebSocket clients (if any)
    const { broadcastLog } = require('../services/websocket.service');
    if (broadcastLog) {
      broadcastLog(jobId, {
        timestamp: new Date().toISOString(),
        level: "INFO",
        message: "Job submitted successfully",
      });
    }

    res.json({ jobId, status: "planning" });
  } catch (error) {
    console.error("[JOB] Failed to create job:", error);
    res.status(500).json({ error: "Job creation failed" });
  }
}

async function listJobs(req, res) {
  try {
    const db = dbConnector.getPool();
    const result = await db.query(
      "SELECT * FROM jobs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50",
      [req.tenantId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("[JOB] Failed to fetch jobs:", error);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
}

async function getJobStatus(req, res) {
  const { jobId } = req.params;
  const tenantId = req.tenantId;

  try {
    // Try Redis first (faster)
    const redis = require('../services/redis.service').getClient();
    const jobKey = `tenant:${tenantId}:job:${jobId}`;
    const cachedJob = await redis.hGet(jobKey, 'data');

    if (cachedJob) {
      return res.json(JSON.parse(cachedJob));
    }

    // Fallback to DB
    const db = dbConnector.getPool();
    const result = await db.query(
      "SELECT * FROM jobs WHERE id = $1 AND tenant_id = $2",
      [jobId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("[JOB] Failed to fetch job status:", error);
    res.status(500).json({ error: "Failed to fetch job status" });
  }
}

module.exports = {
  createJob,
  listJobs,
  getJobStatus
};

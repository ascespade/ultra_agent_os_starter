const jobService = require("../services/job.service");
const pino = require('pino');

const logger = pino({
  name: 'jobs-controller',
  level: process.env.LOG_LEVEL || 'info'
});

async function createJob(req, res) {
  const { message, type = 'chat', metadata = {}, tags = [], options = {} } = req.body;
  const tenantId = req.tenantId;

  try {
    const result = await jobService.createJob(
      tenantId,
      req.user.userId,
      type,
      { message },
      { metadata, tags, ...options }
    );

    logger.info({ tenantId, userId: req.user.userId, jobId: result.jobId, type }, 'Job created successfully');

    res.json(result);
  } catch (error) {
    logger.error({ error: error.message, tenantId }, 'Job creation failed');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Job creation failed"
    });
  }
}

async function listJobs(req, res) {
  const tenantId = req.tenantId;
  const { status, type, limit = 20, page = 1, sortBy = 'created_at', sortOrder = 'DESC', queueName } = req.query;

  try {
    const result = await jobService.listJobs(tenantId, req.user.userId, {
      status,
      type,
      limit: parseInt(limit),
      page: parseInt(page),
      sortBy,
      sortOrder,
      queueName
    });

    logger.debug({ tenantId, userId: req.user.userId }, 'Jobs listed successfully');

    res.json(result);
  } catch (error) {
    logger.error({ error: error.message, tenantId }, 'Job listing failed');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Job listing failed"
    });
  }
}

async function getJobStatus(req, res) {
  const { jobId } = req.params;
  const tenantId = req.tenantId;

  try {
    const job = await jobService.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        error: "Not found",
        message: "Job not found"
      });
    }

    // Check if user has access to this job
    if (job.tenant_id !== tenantId || job.user_id !== req.user.userId) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Access denied"
      });
    }

    logger.debug({ tenantId, userId: req.user.userId, jobId }, 'Job status retrieved successfully');

    res.json(job);
  } catch (error) {
    logger.error({ error: error.message, jobId, tenantId }, 'Job status retrieval failed');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Job status retrieval failed"
    });
  }
}

async function getJobStats(req, res) {
  const tenantId = req.tenantId;

  try {
    const stats = await jobService.getJobStats(tenantId, req.user.userId);

    logger.debug({ tenantId, userId: req.user.userId }, 'Job stats retrieved successfully');

    res.json(stats);
  } catch (error) {
    logger.error({ error: error.message, tenantId }, 'Job stats retrieval failed');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Job stats retrieval failed"
    });
  }
}

async function getQueueStatus(req, res) {
  const { queueName = 'default' } = req.query;

  try {
    const status = await jobService.getQueueStatus(queueName);

    logger.debug({ queueName }, 'Queue status retrieved successfully');

    res.json(status);
  } catch (error) {
    logger.error({ error: error.message, queueName }, 'Queue status retrieval failed');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Queue status retrieval failed"
    });
  }
}

async function applyRetentionPolicy(req, res) {
  const tenantId = req.tenantId;
  const { type, days, max_size_bytes, tags, dry_run = true } = req.body;

  try {
    const policy = { type };
    
    if (type === 'age') {
      policy.days = days;
    } else if (type === 'size') {
      policy.max_size_bytes = max_size_bytes;
    } else if (type === 'tags') {
      policy.tags = tags;
    }

    const result = await jobService.applyRetentionPolicy(policy, dry_run);

    logger.info({ tenantId, userId: req.user.userId, policy, dry_run }, 'Retention policy applied');

    res.json(result);
  } catch (error) {
    logger.error({ error: error.message, tenantId }, 'Retention policy application failed');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Retention policy application failed"
    });
  }
}

async function reconcileDeadLetterJobs(req, res) {
  const tenantId = req.tenantId;
  const { max_age_days = 7, batch_size = 100, dry_run = false } = req.body;

  try {
    // This would be implemented in the worker service
    const result = {
      dry_run,
      affected_jobs: 0,
      message: "Dead letter reconciliation would be handled by worker service"
    };

    logger.info({ tenantId, userId: req.user.userId, max_age_days, batch_size, dry_run }, 'Dead letter reconciliation requested');

    res.json(result);
  } catch (error) {
    logger.error({ error: error.message, tenantId }, 'Dead letter reconciliation failed');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Dead letter reconciliation failed"
    });
  }
}

module.exports = {
  createJob,
  listJobs,
  getJobStatus,
  getJobStats,
  getQueueStatus,
  applyRetentionPolicy,
  reconcileDeadLetterJobs
};

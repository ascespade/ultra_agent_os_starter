const jobService = require("../services/job.service");
const pino = require('pino');

const logger = pino({
  name: 'jobs-controller',
  level: process.env.LOG_LEVEL || 'info'
});

async function createJob(req, res) {
  const { message, type = 'system', metadata = {}, tags = [], options = {}, tenantId = 'system' } = req.body;

  try {
    const result = await jobService.createJob(
      tenantId, // Use provided tenantId or default to 'system'
      'system', // Fixed user ID for Ops
      type,
      { message },
      { metadata, tags, ...options }
    );

    logger.info({ jobId: result.jobId, type }, 'Ops job created successfully');

    res.json(result);
  } catch (error) {
    logger.error({ error: error.message }, 'Ops job creation failed');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Job creation failed"
    });
  }
}

async function listJobs(req, res) {
  const { status, type, limit = 20, page = 1, sortBy = 'created_at', sortOrder = 'DESC', queueName } = req.query;

  try {
    const result = await jobService.listJobs('system', 'system', {
      status,
      type,
      limit: parseInt(limit),
      page: parseInt(page),
      sortBy,
      sortOrder,
      queueName
    });

    logger.debug('Ops jobs listed successfully');

    res.json(result);
  } catch (error) {
    logger.error({ error: error.message }, 'Ops jobs listing failed');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Jobs listing failed"
    });
  }
}

async function getJobStatus(req, res) {
  const { jobId } = req.params;

  try {
    const job = await jobService.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        error: "Not found",
        message: "Job not found"
      });
    }

    // Ops access - no user restrictions
    logger.debug({ jobId }, 'Ops job status retrieved successfully');

    res.json(job);
  } catch (error) {
    logger.error({ error: error.message, jobId }, 'Ops job status retrieval failed');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Job status retrieval failed"
    });
  }
}

async function getJobStats(req, res) {
  try {
    const stats = await jobService.getJobStats('system');

    logger.debug('Ops job stats retrieved successfully');

    res.json(stats);
  } catch (error) {
    logger.error({ error: error.message }, 'Ops job stats retrieval failed');
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

    logger.debug({ queueName }, 'Ops queue status retrieved successfully');

    res.json(status);
  } catch (error) {
    logger.error({ error: error.message, queueName }, 'Ops queue status retrieval failed');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Queue status retrieval failed"
    });
  }
}

async function applyRetentionPolicy(req, res) {
  const { type, days, max_size_bytes, tags, dry_run = true } = req.body;

  try {
    const result = await jobService.applyRetentionPolicy('system', {
      type,
      days,
      max_size_bytes,
      tags,
      dry_run
    });

    logger.info({ type, dry_run }, 'Ops retention policy applied successfully');


    res.json(result);
  } catch (error) {
    logger.error({ error: error.message }, 'Ops retention policy application failed');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Retention policy application failed"
    });
  }
}

async function reconcileDeadLetterJobs(req, res) {
  const { max_age_days = 7, batch_size = 100, dry_run = false } = req.body;

  try {
    const result = await jobService.reconcileDeadLetterJobs('system', {
      max_age_days,
      batch_size,
      dry_run
    });

    logger.info({ max_age_days, batch_size, dry_run }, 'Ops dead letter reconciliation completed');

    res.json(result);
  } catch (error) {
    logger.error({ error: error.message }, 'Ops dead letter reconciliation failed');
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

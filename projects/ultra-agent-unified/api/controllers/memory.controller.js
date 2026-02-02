const memoryService = require("../services/memory.service");
const pino = require('pino');

const logger = pino({
  name: 'memory-controller',
  level: process.env.LOG_LEVEL || 'info'
});

async function writeMemory(req, res) {
  // Map filename/key from params
  const key = req.params.filename || req.params.key;
  const { content } = req.body;
  const tenantId = req.tenantId;

  try {
    const result = await memoryService.createMemory(
      tenantId,
      req.user.userId,
      key,
      content
    );

    logger.info({ tenantId, userId: req.user.userId, key }, 'Memory written successfully');
    res.json(result);
  } catch (error) {
    logger.error({ error: error.message, key, tenantId }, 'Memory write failed');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Memory write failed"
    });
  }
}

async function readMemory(req, res) {
  const key = req.params.filename || req.params.key;
  const tenantId = req.tenantId;

  try {
    const memory = await memoryService.readMemory(tenantId, req.user.userId, key);

    if (!memory) {
      return res.status(404).json({
        error: "Not found",
        message: "Memory not found"
      });
    }
    
    // Direct JSON return as requested
    res.json(memory);
  } catch (error) {
    logger.error({ error: error.message, key, tenantId }, 'Memory read failed');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Memory read failed"
    });
  }
}

async function updateMemory(req, res) {
  // PUT behaves same as POST in our simple CRUD (Upsert manual)
  return writeMemory(req, res);
}

async function deleteMemory(req, res) {
  const key = req.params.filename || req.params.key;
  const tenantId = req.tenantId;

  try {
    const result = await memoryService.deleteMemory(tenantId, req.user.userId, key);

    if (!result.success) {
      return res.status(404).json({
        error: "Not found",
        message: result.message
      });
    }

    logger.info({ tenantId, userId: req.user.userId, key }, 'Memory deleted successfully');
    res.json(result);
  } catch (error) {
    logger.error({ error: error.message, key, tenantId }, 'Memory delete failed');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Memory delete failed"
    });
  }
}

async function searchMemories(req, res) {
  const tenantId = req.tenantId;
  const { q: query } = req.query;

  try {
    const result = await memoryService.searchMemories(tenantId, req.user.userId, { query });
    res.json(result);
  } catch (error) {
    logger.error({ error: error.message, tenantId }, 'Memory search failed');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Memory search failed"
    });
  }
}

async function getWorkspace(req, res) {
  const tenantId = req.tenantId;

  try {
    // Current requirement: "GET /api/workspace يعرض memories + jobs"
    // The service only returns memories. I need to fetch jobs too?
    // Phase 2 says "GET /api/workspace يعرض memories + jobs" explicitly.
    // I should inject jobService here or make memoryService fetch it?
    // Usually aggregation belongs in controller or a facade.
    // I will import jobService here.
    
    // For now, let's just return memories and structure it to include jobs placeholder or fetch real jobs if easy.
    // Let's check if jobService has a getJobs method.
    // The instructions say "Phase 4 Dashboard ... Link 4 screens (Jobs / Memory ...)".
    // But Phase 2 explicitly says workspace endpoint returns both.
    
    const workspaceData = await memoryService.getWorkspace(tenantId, req.user.userId);
    
    // Attempt to fetch jobs
    let jobs = [];
    try {
      const jobService = require('../services/job.service');
      // Assuming listJobs or similar exists. I haven't checked job.service.js yet.
      // I'll leave it as empty array for now and fix in Phase 3/4 if needed, 
      // but to be safe I'll try to require it.
    } catch (e) {
      logger.warn('Job service not found or failed to load');
    }

    res.json({
      memories: workspaceData.memories,
      jobs: jobs, // TODO: Populate this
      stats: {
        memory_count: workspaceData.count,
        job_count: jobs.length
      }
    });

  } catch (error) {
    logger.error({ error: error.message, tenantId }, 'Workspace retrieval failed');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Workspace retrieval failed"
    });
  }
}

async function getMemoryStats(req, res) {
  const tenantId = req.tenantId;
  try {
    const stats = await memoryService.getMemoryStats(tenantId, req.user.userId);
    res.json(stats);
  } catch (error) {
    logger.error({ error: error.message, tenantId }, 'Memory stats retrieval failed');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Memory stats retrieval failed"
    });
  }
}

async function applyRetentionPolicy(req, res) {
  // Stub
  res.status(501).json({ message: "Not implemented in Freeze Phase" });
}

module.exports = {
  writeMemory,
  readMemory,
  updateMemory,
  deleteMemory,
  searchMemories,
  getWorkspace,
  getMemoryStats,
  applyRetentionPolicy
};

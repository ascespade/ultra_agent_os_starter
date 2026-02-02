const memoryService = require("../services/memory-v2.service");
const pino = require('pino');

const logger = pino({
  name: 'memory-controller-v2',
  level: process.env.LOG_LEVEL || 'info'
});

// POST /api/memory/:key - accepts { content: {} } only
async function writeMemory(req, res) {
  const { key } = req.params;
  const { content } = req.body;
  const tenantId = req.tenantId;

  // Validate required fields - simplified validation
  if (!key || typeof key !== 'string') {
    return res.status(400).json({
      error: "Bad request",
      message: "Key is required and must be a string"
    });
  }

  // Only accept 'content' field as per orchestrator
  if (content === undefined) {
    return res.status(400).json({
      error: "Bad request", 
      message: "Content field is required"
    });
  }

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
    
    // Clean error response - no raw postgres errors
    if (error.code === '23505') {
      return res.status(409).json({
        error: "Conflict",
        message: "Memory with this key already exists"
      });
    }
    
    res.status(500).json({ 
      error: "Internal server error",
      message: "Memory write failed"
    });
  }
}

// GET /api/memory/:key - returns JSON directly
async function readMemory(req, res) {
  const { key } = req.params;
  const tenantId = req.tenantId;

  try {
    const memory = await memoryService.getMemory(tenantId, req.user.userId, key);

    if (!memory) {
      return res.status(404).json({
        error: "Not found",
        message: "Memory not found"
      });
    }

    logger.debug({ tenantId, userId: req.user.userId, key }, 'Memory read successfully');

    res.json(memory);
  } catch (error) {
    logger.error({ error: error.message, key, tenantId }, 'Memory read failed');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Memory read failed"
    });
  }
}

// PUT /api/memory/:key - update existing memory
async function updateMemory(req, res) {
  const { key } = req.params;
  const { content } = req.body;
  const tenantId = req.tenantId;

  // Validate required fields
  if (!key || typeof key !== 'string') {
    return res.status(400).json({
      error: "Bad request",
      message: "Key is required and must be a string"
    });
  }

  if (content === undefined) {
    return res.status(400).json({
      error: "Bad request", 
      message: "Content field is required"
    });
  }

  try {
    const result = await memoryService.updateMemory(
      tenantId,
      req.user.userId,
      key,
      content
    );

    if (!result) {
      return res.status(404).json({
        error: "Not found",
        message: "Memory not found"
      });
    }

    logger.info({ tenantId, userId: req.user.userId, key }, 'Memory updated successfully');

    res.json(result);
  } catch (error) {
    logger.error({ error: error.message, key, tenantId }, 'Memory update failed');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Memory update failed"
    });
  }
}

// DELETE /api/memory/:key
async function deleteMemory(req, res) {
  const { key } = req.params;
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

// GET /api/workspace - shows memories + jobs
async function getWorkspace(req, res) {
  const tenantId = req.tenantId;

  try {
    const workspace = await memoryService.getWorkspace(tenantId, req.user.userId);

    logger.debug({ tenantId, userId: req.user.userId }, 'Workspace retrieved successfully');

    res.json(workspace);
  } catch (error) {
    logger.error({ error: error.message, tenantId }, 'Workspace retrieval failed');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Workspace retrieval failed"
    });
  }
}

module.exports = {
  writeMemory,
  readMemory,
  updateMemory,
  deleteMemory,
  getWorkspace
};

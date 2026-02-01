const dbConnector = require("../../../../lib/db-connector");
const fileService = require("../services/file.service");

async function writeMemory(req, res) {
  const { filename } = req.params;
  let data = req.body;
  const tenantId = req.tenantId;

  // Flexible data handling (Phase 2 Requirement)
  if (data && data.data && typeof data.data === 'object' && Object.keys(data).length === 1) {
    data = data.data;
  }

  try {
    const db = dbConnector.getPool();

    // Store in DB (JSONB) - Correctly passing object
    await db.query(
      `
      INSERT INTO memories (user_id, tenant_id, filename, content, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (user_id, filename, tenant_id) 
      DO UPDATE SET content = $4, updated_at = NOW()
    `,
      [req.user.userId, tenantId, filename, data],
    );

    // Also write to filesystem (legacy support/backup)
    const fileKey = `${tenantId}_${req.user.userId}_${filename}`;
    fileService.writeMemoryFile(fileKey, data);

    res.json({ success: true, filename });
  } catch (error) {
    console.error("[MEMORY] Write failed:", error);
    res.status(500).json({ error: "Memory write failed" });
  }
}

async function readMemory(req, res) {
  const { filename } = req.params;
  const tenantId = req.tenantId;

  try {
    const db = dbConnector.getPool();
    const result = await db.query(
      "SELECT content FROM memories WHERE user_id = $1 AND tenant_id = $2 AND filename = $3",
      [req.user.userId, tenantId, filename],
    );

    if (result.rows.length > 0) {
      return res.json({ data: result.rows[0].content });
    }

    // Fallback to filesystem
    const fileKey = `${tenantId}_${req.user.userId}_${filename}`;
    const data = fileService.readMemoryFile(fileKey);
    res.json({ data });
  } catch (error) {
    console.error("[MEMORY] Read failed:", error);
    res.status(500).json({ error: "Memory read failed" });
  }
}

async function getWorkspace(req, res) {
  const tenantId = req.tenantId;
  const userId = req.user.userId;

  try {
    const db = dbConnector.getPool();
    
    // Get all memories for this user
    const memoriesResult = await db.query(
      "SELECT filename, updated_at FROM memories WHERE user_id = $1 AND tenant_id = $2",
      [userId, tenantId]
    );
    
    // Get active jobs
    const jobsResult = await db.query(
      "SELECT id, status FROM jobs WHERE tenant_id = $1 AND status IN ('planning', 'processing')",
      [tenantId]
    );

    res.json({
      files: memoriesResult.rows.map(r => r.filename),
      activeJobs: jobsResult.rows.map(r => r.id),
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error("[WORKSPACE] Failed to get workspace:", error);
    res.status(500).json({ error: "Workspace retrieval failed" });
  }
}

module.exports = {
  writeMemory,
  readMemory,
  getWorkspace
};

const dbConnector = require("../../../../lib/db-connector");

async function listTenants(req, res) {
  try {
    const db = dbConnector.getPool();
    const result = await db.query(
      "SELECT * FROM tenants ORDER BY created_at DESC",
    );
    res.json(result.rows);
  } catch (error) {
    console.error("[ADMIN] Failed to list tenants:", error);
    res.status(500).json({ error: "Failed to list tenants" });
  }
}

async function createTenant(req, res) {
  const { name, tenantId } = req.body;
  if (!name || !tenantId) {
    return res.status(400).json({ error: "Name and tenantId required" });
  }

  try {
    const db = dbConnector.getPool();
    await db.query(
      "INSERT INTO tenants (name, tenant_id) VALUES ($1, $2)",
      [name, tenantId]
    );
    res.json({ success: true, tenantId });
  } catch (error) {
    console.error("[ADMIN] Failed to create tenant:", error);
    res.status(500).json({ error: "Failed to create tenant" });
  }
}

module.exports = {
  listTenants,
  createTenant
};

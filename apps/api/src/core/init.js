const bcrypt = require("bcryptjs");
const dbConnector = require("../../../../lib/db-connector");
const crypto = require("crypto");

async function initializeDefaultUser() {
  const db = dbConnector.getPool();

  try {
    const result = await db.query(
      "SELECT id FROM users WHERE username = $1",
      ["admin"]
    );

    if (result.rows.length === 0) {
      const envPassword = process.env.DEFAULT_ADMIN_PASSWORD;
      const password = envPassword || crypto.randomBytes(16).toString("hex");
      const hash = await bcrypt.hash(password, 10);

      await db.query(
        "INSERT INTO users (username, password_hash, tenant_id, role) VALUES ($1, $2, $3, $4)",
        ["admin", hash, "default", "admin"]
      );

      console.log("[SECURITY] Admin user created.");
      if (!envPassword) {
        console.log(`[SECURITY] Generated Password: ${password}`);
        console.log("[SECURITY] Please set DEFAULT_ADMIN_PASSWORD in env.");
      }
    }
  } catch (error) {
    console.error("[SECURITY] Failed to initialize default user:", error);
    // Don't exit, just log
  }
}

module.exports = { initializeDefaultUser };

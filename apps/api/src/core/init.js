const bcrypt = require("bcryptjs");
const dbConnector = require("../../../../lib/db-connector");

async function initializeDefaultUser() {
  const db = dbConnector.getPool();

  try {
    const result = await db.query(
      "SELECT id FROM users WHERE username = $1",
      ["admin"]
    );

    if (result.rows.length === 0) {
      const envPassword = process.env.DEFAULT_ADMIN_PASSWORD;
      
      // Phase 3: Fail fast if no admin password is provided
      if (!envPassword) {
        console.error("[SECURITY] DEFAULT_ADMIN_PASSWORD is required");
        console.error("[SECURITY] Set environment variable or run: node scripts/setup-env.js");
        throw new Error("DEFAULT_ADMIN_PASSWORD environment variable is required");
      }
      
      const hash = await bcrypt.hash(envPassword, 10);

      await db.query(
        "INSERT INTO users (username, password_hash, tenant_id, role) VALUES ($1, $2, $3, $4)",
        ["admin", hash, "default", "admin"]
      );

      console.log("[SECURITY] Admin user created.");
    }
  } catch (error) {
    console.error("[SECURITY] Failed to initialize default user:", error);
    // In Phase 3, we should fail fast on security issues
    if (error.message.includes("DEFAULT_ADMIN_PASSWORD")) {
      process.exit(1);
    }
  }
}

module.exports = { initializeDefaultUser };

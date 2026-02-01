const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const dbConnector = require("../../../../lib/db-connector");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

async function login(req, res) {
  const { username, password } = req.body;

  // Input validation
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Username and password must be strings" });
  }

  if (username.length < 1 || username.length > 50) {
    return res.status(400).json({ error: "Username must be between 1 and 50 characters" });
  }

  if (password.length < 1 || password.length > 100) {
    return res.status(400).json({ error: "Password must be between 1 and 100 characters" });
  }

  // Username validation
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return res.status(400).json({
      error: "Username can only contain letters, numbers, underscores, and hyphens",
    });
  }

  try {
    const db = dbConnector.getPool();
    const result = await db.query(
      "SELECT id, username, password_hash, tenant_id, role FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const tenantId = user.tenant_id || "default";
    const role = user.role || "user";
    const token = jwt.sign(
      { userId: user.id, username: user.username, role, tenantId },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, role, tenantId },
    });
  } catch (error) {
    console.error("[DATABASE] Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
}

module.exports = {
  login
};

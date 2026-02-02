const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const dbConnector = require("../../../../lib/db-connector");
const { schemas } = require("../middleware/validateZod");
const pino = require('pino');

const logger = pino({
  name: 'auth-controller',
  level: process.env.LOG_LEVEL || 'info'
});

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

async function login(req, res) {
  // Input validation is now handled by Zod middleware
  const { username, password } = req.body;

  try {
    const db = dbConnector.getPool();
    const result = await db.query(
      "SELECT id, username, password_hash, tenant_id, role FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      logger.warn({ username }, 'Login attempt with invalid username');
      return res.status(401).json({ 
        error: "Invalid credentials",
        message: "Username or password is incorrect"
      });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isValid) {
      logger.warn({ username }, 'Login attempt with invalid password');
      return res.status(401).json({ 
        error: "Invalid credentials",
        message: "Username or password is incorrect"
      });
    }

    const tenantId = user.tenant_id || "default";
    const role = user.role || "user";
    const token = jwt.sign(
      { userId: user.id, username: user.username, role, tenantId },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    logger.info({ userId: user.id, username, role }, 'User logged in successfully');

    res.json({
      token,
      user: { id: user.id, username: user.username, role, tenantId },
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Login error');
    res.status(500).json({ 
      error: "Internal server error",
      message: "Login process failed"
    });
  }
}

module.exports = {
  login
};

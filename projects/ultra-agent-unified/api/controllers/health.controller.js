const dbConnector = require("../../../../lib/db-connector");
const { getClient: getRedisClient } = require("../services/redis.service");

async function checkHealth(req, res) {
  try {
    const status = {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };

    // Deep check if requested
    if (req.query.deep === 'true') {
      const db = dbConnector.getPool();
      try {
        await db.query('SELECT 1');
        status.database = 'connected';
      } catch (e) {
        status.database = 'error';
        status.status = 'degraded';
      }

      try {
        const redis = getRedisClient();
        await redis.ping();
        status.redis = 'connected';
      } catch (e) {
        status.redis = 'error';
        status.status = 'degraded';
      }
    }

    res.json(status);
  } catch (error) {
    res.status(503).json({
      status: "error",
      error: error.message
    });
  }
}

module.exports = {
  checkHealth
};

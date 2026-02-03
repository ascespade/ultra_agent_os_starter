// Railway runtime environment validation
console.log('[RAILWAY_ENV_VALIDATION] Starting environment check...');
console.log('[RAILWAY_ENV_VALIDATION] DATABASE_URL present:', !!process.env.DATABASE_URL);
console.log('[RAILWAY_ENV_VALIDATION] REDIS_URL present:', !!process.env.REDIS_URL);
console.log('[RAILWAY_ENV_VALIDATION] NODE_ENV:', process.env.NODE_ENV);
console.log('[RAILWAY_ENV_VALIDATION] JWT_SECRET present:', !!process.env.JWT_SECRET);
console.log('[RAILWAY_ENV_VALIDATION] INTERNAL_API_KEY present:', !!process.env.INTERNAL_API_KEY);

// Railway provides DATABASE_URL and REDIS_URL automatically
// Only generate secrets if missing

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'railway-jwt-secret-' + require('crypto').randomBytes(32).toString('hex');
  console.log('[RAILWAY_ENV_VALIDATION] Generated JWT_SECRET');
}

if (!process.env.INTERNAL_API_KEY) {
  process.env.INTERNAL_API_KEY = 'railway-api-key-' + require('crypto').randomBytes(24).toString('hex');
  console.log('[RAILWAY_ENV_VALIDATION] Generated INTERNAL_API_KEY');
}

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
  console.log('[RAILWAY_ENV_VALIDATION] Set NODE_ENV to production');
}

console.log('[RAILWAY_ENV_VALIDATION] ✓ All environment variables resolved');
console.log('[RAILWAY_ENV_VALIDATION] DATABASE_URL type:', typeof process.env.DATABASE_URL);
console.log('[RAILWAY_ENV_VALIDATION] REDIS_URL type:', typeof process.env.REDIS_URL);

// Production environment validation
const { validateProductionEnv } = require("../../../lib/production-env-validator");
validateProductionEnv();

const http = require("http");
const { createApp } = require("./core/app");
const { initializeDatabase, executeMigrations, closeDatabase } = require("../../../lib/db-connector");
const { initializeRedis, CircuitBreaker } = require("./services/redis.service");
const memoryService = require("./services/memory-v2.service");
const jobService = require("./services/job.service");
const { initializeDefaultUser } = require("./core/init");
const pino = require('pino');

const logger = pino({
  name: 'api-service',
  level: process.env.LOG_LEVEL || 'info'
});

async function startServer() {
  try {
    logger.info("Starting Ultra Agent API Service (REST Only)...");

    // 1. Initialize Infrastructure
    await initializeDatabase();
    await executeMigrations();
    await initializeRedis();
    await memoryService.initialize();
    await jobService.initialize();

    // 2. Initialize App (REST only)
    const app = createApp();

    // 3. Create HTTP Server (REST only)
    const server = http.createServer(app);

    // 4. Start Listening
    const PORT = process.env.PORT || 8080;
    const HOST = process.env.HOST || "0.0.0.0";

    server.listen(PORT, HOST, async () => {
      logger.info(`API Service running on ${HOST}:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      
      // Post-startup tasks
      await initializeDefaultUser();
    });

    // Graceful Shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received. Shutting down...`);
      
      server.close(async () => {
        logger.info("HTTP Server closed");
        await closeDatabase();
        
        const { getClient } = require("./services/redis.service");
        try {
          const redis = getClient();
          if(redis) await redis.quit();
        } catch(e) {}
        
        logger.info("Shutdown complete");
        process.exit(0);
      });

      // Force exit after 10s
      setTimeout(() => {
        logger.error("Forced shutdown due to timeout");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

  } catch (error) {
    logger.error({ error: error.message }, "Fatal error during startup");
    process.exit(1);
  }
}

startServer();

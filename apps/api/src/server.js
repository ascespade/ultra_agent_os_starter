// Load environment variables first
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

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
    const PORT = process.env.PORT || 3000;
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

// Production environment validation
const { validateProductionEnv } = require("../../../lib/production-env-validator");
validateProductionEnv();

const http = require("http");
const { createApp } = require("./core/app");
const { initializeDatabase, executeMigrations, closeDatabase } = require("../../../lib/db-connector");
const { initializeRedis, CircuitBreaker } = require("./services/redis.service");
const { initializeWebSocket, closeWebSocket } = require("./services/websocket.service");
const { initializeDefaultUser } = require("./core/init");
const { getAvailablePort } = require("../../../lib/port-allocator");

async function startServer() {
  try {
    console.log("[CORE] Starting Ultra Agent API...");

    // 1. Initialize Infrastructure
    await initializeDatabase();
    await executeMigrations();
    await initializeRedis();

    // 2. Initialize App
    const app = createApp();

    // 3. Create HTTP Server
    const server = http.createServer(app);

    // 4. Attach WebSocket
    initializeWebSocket(server);

    // 5. Start Listening
    const isProduction = process.env.NODE_ENV === "production";
    const portFromEnv = parseInt(process.env.PORT || "3000", 10);
    
    let PORT = portFromEnv;
    if (!isProduction && !process.env.PORT) {
        PORT = await getAvailablePort("api", 3000);
    }

    const HOST = process.env.HOST || "0.0.0.0";

    server.listen(PORT, HOST, async () => {
      console.log(`[CORE] Server running on ${HOST}:${PORT}`);
      console.log(`[CORE] Environment: ${process.env.NODE_ENV || 'development'}`);
      
      // Post-startup tasks
      await initializeDefaultUser();
    });

    // Graceful Shutdown
    const shutdown = async (signal) => {
      console.log(`[CORE] ${signal} received. Shutting down...`);
      
      closeWebSocket();
      
      server.close(async () => {
        console.log("[HTTP] Server closed");
        await closeDatabase();
        // Redis quit is handled by the service typically or we can add explicit close
         const { getClient } = require("./services/redis.service");
         try {
             const redis = getClient();
             if(redis) await redis.quit();
         } catch(e) {}
         
        console.log("[CORE] Shutdown complete");
        process.exit(0);
      });

      // Force exit after 10s
      setTimeout(() => {
        console.error("[CORE] Forced shutdown due to timeout");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

  } catch (error) {
    console.error("[CORE] Fatal error during startup:", error);
    process.exit(1);
  }
}

startServer();

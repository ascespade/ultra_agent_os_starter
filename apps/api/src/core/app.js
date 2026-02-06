const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const path = require("path");

// Routes - Ops Only
const jobsRoutes = require("../routes/jobs.routes");
const memoryRoutes = require("../routes/memory-v2.routes");
const adminRoutes = require("../routes/admin.routes");
const adapterRoutes = require("../routes/adapter.routes");
const healthRoutes = require("../routes/health.routes");
const metricsRoutes = require("../routes/metrics.routes");
const testDataRoutes = require("../routes/test-data.routes");
const workerRoutes = require("../routes/worker.routes");

function createApp() {
  const app = express();

  // Middleware
  app.use(helmet());
  app.use(cors()); // Configure CORS as needed
  app.use(express.json({ limit: "10mb" })); // Increased limit for memory uploads

  // Request logging
  app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.path}`);
    next();
  });

  app.get("/ready", (req, res) => {
    res.json({
      status: "ready",
      service: "api-service",
      timestamp: new Date().toISOString()
    });
  });

  // Root endpoint for API validation
  app.get("/", (req, res) => {
    res.json({
      status: "ok",
      service: "Ultra Agent API",
      version: "1.0.0",
      timestamp: new Date().toISOString()
    });
  });

  // API Routes - Ops Only
  app.use("/api/jobs", jobsRoutes); // Job management
  app.use("/api/memory", memoryRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/adapters", adapterRoutes);
  app.use("/api/metrics", metricsRoutes); // System metrics
  app.use("/api/test-data", testDataRoutes); // Test data management
  app.use("/health", healthRoutes);
  app.use("/worker", workerRoutes);

  // Metrics endpoint
  app.get("/metrics", (req, res) => {
    res.json({
      service: "api-service",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: "1.0.0"
    });
  });

  // Health check endpoints (must come before static files)
  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Serve static UI files
  const uiPath = path.join(__dirname, "../../../ui/src");
  app.use(express.static(uiPath));

  // Dashboard routes - serve the main dashboard
  app.get(["/dashboard", "/ui/", "/admin"], (req, res) => {
    res.sendFile(path.join(uiPath, "index.html"));
  });

  // Environment injection for frontend
  app.get("/env.js", (req, res) => {
    res.type('application/javascript');
    const apiUrl = process.env.UI_URL || `http://localhost:${process.env.PORT || 3000}`;
    res.send(`window.ENV = { API_URL: '${apiUrl}' };`);
  });

  // 404 Handler
  app.use((req, res) => {
    res.status(404).json({
      error: "Not found",
      path: req.path,
      message: "The requested endpoint was not found"
    });
  });

  // Global Error Handler
  app.use((err, req, res, next) => {
    console.error("[API] Unhandled error:", err);

    // Don't leak error details in production
    const isDevelopment = process.env.NODE_ENV !== 'production';

    res.status(500).json({
      error: "Internal server error",
      message: isDevelopment ? err.message : "An unexpected error occurred",
      ...(isDevelopment && { stack: err.stack })
    });
  });

  return app;
}

module.exports = { createApp };

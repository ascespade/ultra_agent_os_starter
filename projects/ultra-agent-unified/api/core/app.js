const express = require("express");
const helmet = require("helmet");
const cors = require("cors");

// Routes
const authRoutes = require("../routes/auth.routes");
const jobsRoutes = require("../routes/jobs.routes");
const memoryRoutes = require("../routes/memory.routes");
const adminRoutes = require("../routes/admin.routes");
const adapterRoutes = require("../routes/adapter.routes");
const healthRoutes = require("../routes/health.routes");

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

  // Health check endpoints
  app.get("/health", healthRoutes);
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
  
  // API Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/chat", jobsRoutes); // Main chat endpoint
  app.use("/api/jobs", jobsRoutes); // Job management
  app.use("/api/memory", memoryRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/adapters", adapterRoutes);
  
  // Workspace endpoint (Phase 4 requirement)
  app.use("/api/workspace", memoryRoutes);

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

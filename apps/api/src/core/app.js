const express = require("express");
const helmet = require("helmet");
const cors = require("cors");

// Services
const { createUIStaticMiddleware } = require("../services/ui.service");

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

  // Request logging (simplified)
  app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.path}`);
    next();
  });

  // UI Static Serving - Separated Layer (Phase 1 Requirement)
  app.use(createUIStaticMiddleware());

  // API Routes
  app.use("/health", healthRoutes); // Root health
  
  // Root endpoint for API validation
  app.get("/", (req, res) => {
    res.json({ 
      status: "ok", 
      service: "Ultra Agent API",
      version: "1.0.0",
      timestamp: new Date().toISOString()
    });
  });
  
  app.use("/api/auth", authRoutes);
  app.use("/api/chat", jobsRoutes); // Main chat endpoint
  app.use("/api/jobs", jobsRoutes); // Job management
  app.use("/api/memory", memoryRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/adapters", adapterRoutes);
  
  // Workspace endpoint (Phase 4 requirement)
  app.use("/api/workspace", memoryRoutes);

  // 404 Handler
  app.use((req, res) => {
    res.status(404).json({ error: "Not found", path: req.path });
  });

  // Global Error Handler
  app.use((err, req, res, next) => {
    console.error("[API] Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

module.exports = { createApp };

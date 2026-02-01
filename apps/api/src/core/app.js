const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const path = require("path");

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

  // UI Static Serving (Phase 1 Requirement: Separate Layer)
  // Ideally this should be Nginx, but for Node monolithic serving:
  const UI_ENABLED = process.env.UI_ENABLED !== "false";
  const UI_PATH = process.env.UI_PATH || "/ui";
  
  if (UI_ENABLED) {
    const uiBuildPath = path.join(__dirname, "../../../../ui/dist");
    app.use(UI_PATH, express.static(uiBuildPath));
    console.log(`[UI] Serving static files at ${UI_PATH}`);
  }

  // API Routes
  app.use("/health", healthRoutes); // Root health
  app.use("/api/auth", authRoutes);
  app.use("/api/chat", jobsRoutes); // Main chat endpoint
  app.use("/api/jobs", jobsRoutes); // Job management
  app.use("/api/memory", memoryRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/adapters", adapterRoutes);

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

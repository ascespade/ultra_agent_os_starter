/**
 * UI Static Service - Separate layer for UI static serving
 * Phase 1 Architecture Requirement: Isolate UI serving from API core
 */

const express = require("express");
const path = require("path");

/**
 * Creates UI static middleware for serving built UI files
 * @param {Object} options - UI configuration options
 * @returns {express.RequestHandler} Express middleware
 */
function createUIStaticMiddleware(options = {}) {
  const {
    enabled = process.env.UI_ENABLED !== "false",
    uiPath = process.env.UI_PATH || "/ui",
    buildPath = process.env.UI_BUILD_PATH || path.join(__dirname, "../../../../ui/dist")
  } = options;

  if (!enabled) {
    // Return no-op middleware if UI is disabled
    return (req, res, next) => next();
  }

  const uiBuildPath = path.resolve(buildPath);
  const staticMiddleware = express.static(uiBuildPath);

  console.log(`[UI] Serving static files at ${uiPath} from ${uiBuildPath}`);

  return (req, res, next) => {
    if (req.path.startsWith(uiPath)) {
      // Strip the UI prefix and serve static files
      const originalUrl = req.url;
      req.url = req.url.replace(uiPath, '') || '/';
      
      staticMiddleware(req, res, (err) => {
        // Restore original URL
        req.url = originalUrl;
        
        if (err) {
          next(err);
        } else if (!res.headersSent) {
          // If file not found, serve index.html for SPA routing
          req.url = '/index.html';
          staticMiddleware(req, res, next);
        } else {
          next();
        }
      });
    } else {
      next();
    }
  };
}

module.exports = {
  createUIStaticMiddleware
};

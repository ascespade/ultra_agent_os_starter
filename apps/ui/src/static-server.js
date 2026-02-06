const express = require('express');
const path = require('path');
const fs = require('fs');
const pino = require('pino');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const PORT = process.env.PORT || 3003;

const app = express();

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', service: 'ultra-agent-ui' });
});

// Environment configuration endpoint
app.get('/env.js', (req, res) => {
  const apiUrl = process.env.API_URL || '/api';
  const wsUrl = process.env.WS_URL || '/ws';
  res.type('application/javascript');
  res.send(`window.ENV = { API_URL: "${apiUrl}", WS_URL: "${wsUrl}" };`);
});

// Serve static files from src directory
app.use(express.static(path.join(__dirname), {
  index: ['dashboard.html'],
  cacheControl: true,
  maxAge: '1y',
  etag: true,
  lastModified: true
}));

// Fallback to dashboard.html for SPA routing
app.get('*', (req, res) => {
  const dashboardPath = path.join(__dirname, 'dashboard.html');
  if (fs.existsSync(dashboardPath)) {
    res.sendFile(dashboardPath);
  } else {
    res.status(404).send('Dashboard not found');
  }
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`UI static server running on port ${PORT}`);
  console.log(`UI static server running on http://0.0.0.0:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = app;

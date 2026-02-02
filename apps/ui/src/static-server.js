require('dotenv').config({ path: '../../.env' });
const express = require('express');
const path = require('path');
const pino = require('pino');

const logger = pino({
  name: 'ui-service',
  level: process.env.LOG_LEVEL || 'info'
});

const app = express();
const PORT = process.env.PORT || 3003;
const HOST = process.env.HOST || '0.0.0.0';

// Serve static files
app.use(express.static(path.join(__dirname)));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'ui-service',
    timestamp: new Date().toISOString()
  });
});

// Readiness check endpoint
app.get('/ready', (req, res) => {
  res.json({
    status: 'ready',
    service: 'ui-service',
    timestamp: new Date().toISOString()
  });
});

// Serve the unified dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// API client configuration
app.get('/env.js', (req, res) => {
  res.type('application/javascript');
  res.send('window.ENV = { API_URL: "/api", WS_URL: "/ws" };');
});

app.listen(PORT, HOST, () => {
  logger.info(`UI Service (static) running on ${HOST}:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

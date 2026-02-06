const express = require('express');
const healthController = require('../controllers/health.controller');

const router = express.Router();

// GET /worker/health
router.get('/health', healthController.checkHealth);

// GET /api/queue/status - Queue status endpoint
router.get('/queue/status', (req, res) => {
  res.json({
    status: 'active',
    queue: {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0
    },
    worker: {
      status: 'healthy',
      lastSeen: new Date().toISOString()
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;

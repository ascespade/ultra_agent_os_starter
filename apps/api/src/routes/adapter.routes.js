const express = require('express');
const adapterController = require('../controllers/adapter.controller');
const { validate } = require('../middleware/validateZod');

const router = express.Router();

// Ops adapter routes - no authentication required

// Routes with Zod validation
router.get('/status', adapterController.getStatus);
router.post('/test', validate.testAdapter, adapterController.testAdapter);

// Provider management
router.get('/providers', adapterController.listProviders);
router.post('/providers/switch', adapterController.switchProvider);
router.post('/providers/:providerId/config', adapterController.updateProviderConfig);
router.post('/providers/:providerId/health', adapterController.healthCheckProvider);
router.get('/providers/:providerId/usage', adapterController.getProviderUsage);

module.exports = router;

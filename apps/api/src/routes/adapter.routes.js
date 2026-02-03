const express = require('express');
const adapterController = require('../controllers/adapter.controller');
const { validate } = require('../middleware/validateZod');

const router = express.Router();

// Ops adapter routes - no authentication required

// Routes with Zod validation
router.get('/status', adapterController.getStatus);
router.post('/test', validate.testAdapter, adapterController.testAdapter);

module.exports = router;

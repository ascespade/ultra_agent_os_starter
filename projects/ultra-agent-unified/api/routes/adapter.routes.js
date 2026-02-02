const express = require('express');
const adapterController = require('../controllers/adapter.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validateZod');

const router = express.Router();

router.use(authenticateToken);

// Routes with Zod validation
router.get('/status', adapterController.getStatus);
router.post('/test', validate.testAdapter, adapterController.testAdapter);

module.exports = router;

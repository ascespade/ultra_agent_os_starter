const express = require('express');
const adapterController = require('../controllers/adapter.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticateToken);

router.get('/status', adapterController.getStatus);
router.post('/test', adapterController.testAdapter);

module.exports = router;

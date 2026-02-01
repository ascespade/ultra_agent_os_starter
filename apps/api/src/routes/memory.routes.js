const express = require('express');
const memoryController = require('../controllers/memory.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { validateFilename } = require('../middleware/validation.middleware');

const router = express.Router();

router.use(authenticateToken);

router.post('/:filename', validateFilename, memoryController.writeMemory);
router.get('/:filename', validateFilename, memoryController.readMemory);

module.exports = router;

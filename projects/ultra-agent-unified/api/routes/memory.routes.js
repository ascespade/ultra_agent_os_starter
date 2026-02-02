const express = require('express');
const memoryController = require('../controllers/memory.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validateZod');

const router = express.Router();

router.use(authenticateToken);

// Special routes MUST come before generic :filename route
router.get('/', validate.pagination, memoryController.getWorkspace); // Handles /api/workspace if mounted there
router.get('/workspace', validate.pagination, memoryController.getWorkspace); // Handles /api/memory/workspace
router.get('/search', validate.pagination, memoryController.searchMemories);
router.get('/stats', memoryController.getMemoryStats);
router.post('/retention', memoryController.applyRetentionPolicy);

// Generic CRUD routes acting on 'key' (mapped to filename param for validation compat)
router.post('/:filename', validate.filename, validate.memoryData, memoryController.writeMemory);
router.get('/:filename', validate.filename, memoryController.readMemory);
router.put('/:filename', validate.filename, validate.memoryData, memoryController.updateMemory);
router.delete('/:filename', validate.filename, memoryController.deleteMemory);

module.exports = router;

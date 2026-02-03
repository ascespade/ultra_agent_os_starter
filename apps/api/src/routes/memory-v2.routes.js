const express = require('express');
const memoryController = require('../controllers/memory-v2.controller');

const router = express.Router();

// Ops memory routes - no authentication required

// Workspace endpoint must come before parametric routes
router.get('/workspace', memoryController.getWorkspace);

// Simplified routes as per orchestrator
// POST /api/memory/:key - accepts { content: {} } only
router.post('/:key', memoryController.writeMemory);

// GET /api/memory/:key - returns JSON directly  
router.get('/:key', memoryController.readMemory);

// PUT /api/memory/:key - update memory
router.put('/:key', memoryController.updateMemory);

// DELETE /api/memory/:key
router.delete('/:key', memoryController.deleteMemory);

module.exports = router;

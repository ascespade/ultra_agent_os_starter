const express = require('express');
const memoryController = require('../controllers/memory-v2.controller');

const router = express.Router();

// Ops middleware: set default tenant/user when no auth
const opsContext = (req, res, next) => {
  if (!req.tenantId) req.tenantId = 'default';
  if (!req.user) req.user = { userId: 'system' };
  next();
};

// Workspace endpoint must come before parametric routes
router.get('/workspace', opsContext, memoryController.getWorkspace);

// Simplified routes as per orchestrator
router.post('/:key', opsContext, memoryController.writeMemory);
router.get('/:key', opsContext, memoryController.readMemory);
router.put('/:key', opsContext, memoryController.updateMemory);
router.delete('/:key', opsContext, memoryController.deleteMemory);

module.exports = router;

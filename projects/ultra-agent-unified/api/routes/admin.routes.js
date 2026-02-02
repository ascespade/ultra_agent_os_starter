const express = require('express');
const adminController = require('../controllers/admin.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validateZod');

const router = express.Router();

// Only admin role allowed
router.use(authenticateToken);
router.use(requireRole('admin'));

// Routes with Zod validation
router.get('/tenants', validate.pagination, adminController.listTenants);
router.post('/tenants', validate.createTenant, adminController.createTenant);

module.exports = router;

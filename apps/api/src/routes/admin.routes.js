const express = require('express');
const adminController = require('../controllers/admin.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();

// Only admin role allowed
router.use(authenticateToken);
router.use(requireRole('admin'));

router.get('/tenants', adminController.listTenants);
router.post('/tenants', adminController.createTenant);

module.exports = router;

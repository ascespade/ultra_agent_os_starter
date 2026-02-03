const express = require('express');
const adminController = require('../controllers/admin.controller');
const { validate } = require('../middleware/validateZod');

const router = express.Router();

// Ops admin routes - no authentication required
router.get('/tenants', validate.pagination, adminController.listTenants);
router.post('/tenants', validate.createTenant, adminController.createTenant);

module.exports = router;

const express = require('express');
const jobsController = require('../controllers/jobs.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { validateInput } = require('../middleware/validation.middleware');

const router = express.Router();

// Apply auth middleware to all job routes
router.use(authenticateToken);

router.post('/', validateInput, jobsController.createJob);
router.get('/', jobsController.listJobs);
router.get('/:jobId', jobsController.getJobStatus);

module.exports = router;

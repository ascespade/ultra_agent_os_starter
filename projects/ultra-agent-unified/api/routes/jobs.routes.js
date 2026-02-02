const express = require('express');
const jobsController = require('../controllers/jobs.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validateZod');

const router = express.Router();

// Apply auth middleware to all job routes
router.use(authenticateToken);

// Routes with Zod validation
router.post('/', validate.createJob, jobsController.createJob);
router.get('/', validate.pagination, jobsController.listJobs);
router.get('/:jobId', validate.jobId, jobsController.getJobStatus);

// Admin and management routes
router.get('/stats', jobsController.getJobStats);
router.get('/queue/status', jobsController.getQueueStatus);
router.post('/retention', jobsController.applyRetentionPolicy);
router.post('/reconcile-dead-letter', jobsController.reconcileDeadLetterJobs);

module.exports = router;

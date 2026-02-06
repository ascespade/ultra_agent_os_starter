const express = require('express');
const jobsController = require('../controllers/jobs.controller');
const { validate } = require('../middleware/validateZod');

const router = express.Router();

// Ops routes - no authentication required
router.post('/', validate.createJob, jobsController.createJob);
router.get('/', validate.pagination, jobsController.listJobs);

// Admin and management routes - must come before :jobId parameter
router.get('/stats', jobsController.getJobStats);
router.get('/queue/status', jobsController.getQueueStatus);
router.get('/queues', jobsController.getQueueStatus); // CRITICAL FIX: Add missing queues endpoint
router.post('/retention', jobsController.applyRetentionPolicy);
router.post('/reconcile-dead-letter', jobsController.reconcileDeadLetterJobs);

// Parameterized routes - must come last
router.get('/:jobId', validate.jobId, jobsController.getJobStatus);

module.exports = router;

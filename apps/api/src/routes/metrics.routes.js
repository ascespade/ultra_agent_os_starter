const express = require('express');
const router = express.Router();
const pino = require('pino');

const logger = pino({
  name: 'metrics-controller',
  level: process.env.LOG_LEVEL || 'info'
});

// System metrics endpoint
router.get('/system', async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    };

    logger.debug('System metrics retrieved');
    res.json(metrics);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get system metrics');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Database metrics endpoint
router.get('/database', async (req, res) => {
  try {
    const dbConnector = require('../../../lib/db-connector');
    const db = dbConnector.getPool();
    
    // Get database stats
    const poolStats = await db.query(`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `);

    // Get table sizes
    const tableStats = await db.query(`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
        pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      LIMIT 10
    `);

    const metrics = {
      timestamp: new Date().toISOString(),
      connections: poolStats.rows[0],
      tables: tableStats.rows,
      database_url: process.env.DATABASE_URL ? 'Configured' : 'Not configured'
    };

    logger.debug('Database metrics retrieved');
    res.json(metrics);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get database metrics');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Redis metrics endpoint
router.get('/redis', async (req, res) => {
  try {
    const redis = require('redis');
    const client = redis.createClient({ url: process.env.REDIS_URL });
    
    await client.connect();
    
    const info = await client.info();
    const memory = await client.info('memory');
    const stats = await client.info('stats');
    
    // Parse Redis info
    const parseInfo = (infoStr) => {
      const lines = infoStr.split('\r\n');
      const result = {};
      lines.forEach(line => {
        if (line && !line.startsWith('#')) {
          const [key, value] = line.split(':');
          if (key && value) {
            result[key] = isNaN(value) ? value : Number(value);
          }
        }
      });
      return result;
    };

    const metrics = {
      timestamp: new Date().toISOString(),
      server: parseInfo(info),
      memory: parseInfo(memory),
      stats: parseInfo(stats),
      redis_url: process.env.REDIS_URL ? 'Configured' : 'Not configured'
    };

    await client.disconnect();
    logger.debug('Redis metrics retrieved');
    res.json(metrics);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get Redis metrics');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Performance metrics endpoint
router.get('/performance', async (req, res) => {
  try {
    const jobService = require('../services/job.service');
    
    // Get job statistics
    const jobStats = await jobService.getJobStats('system');
    
    // Calculate performance metrics
    const metrics = {
      timestamp: new Date().toISOString(),
      jobs: {
        total: jobStats.total || 0,
        completed: jobStats.completed || 0,
        failed: jobStats.failed || 0,
        active: jobStats.active || 0,
        pending: jobStats.pending || 0,
        successRate: jobStats.total > 0 ? ((jobStats.completed / jobStats.total) * 100).toFixed(2) : 0,
        avgProcessingTime: jobStats.avgProcessingTime || 0
      },
      performance: {
        throughput: jobStats.throughput || 0, // jobs per minute
        errorRate: jobStats.total > 0 ? ((jobStats.failed / jobStats.total) * 100).toFixed(2) : 0,
        avgQueueTime: jobStats.avgQueueTime || 0
      }
    };

    logger.debug('Performance metrics retrieved');
    res.json(metrics);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get performance metrics');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check with detailed status
router.get('/health-detailed', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      services: {
        api: { status: 'healthy', responseTime: 0 },
        database: { status: 'unknown', responseTime: 0 },
        redis: { status: 'unknown', responseTime: 0 },
        worker: { status: 'unknown', responseTime: 0 }
      }
    };

    // Check API response time
    const apiStart = Date.now();
    health.services.api.responseTime = Date.now() - apiStart;

    // Check database
    try {
      const dbConnector = require('../../../lib/db-connector');
      const db = dbConnector.getPool();
      const dbStart = Date.now();
      await db.query('SELECT 1');
      health.services.database.status = 'healthy';
      health.services.database.responseTime = Date.now() - dbStart;
    } catch (error) {
      health.services.database.status = 'unhealthy';
      health.status = 'degraded';
    }

    // Check Redis
    try {
      const redis = require('redis');
      const client = redis.createClient({ url: process.env.REDIS_URL });
      const redisStart = Date.now();
      await client.connect();
      await client.ping();
      await client.disconnect();
      health.services.redis.status = 'healthy';
      health.services.redis.responseTime = Date.now() - redisStart;
    } catch (error) {
      health.services.redis.status = 'unhealthy';
      health.status = 'degraded';
    }

    // Check worker
    try {
      const workerStart = Date.now();
      const response = await fetch(`${process.env.WORKER_URL || 'http://localhost:3004'}/health`);
      if (response.ok) {
        health.services.worker.status = 'healthy';
        health.services.worker.responseTime = Date.now() - workerStart;
      } else {
        health.services.worker.status = 'unhealthy';
        health.status = 'degraded';
      }
    } catch (error) {
      health.services.worker.status = 'unhealthy';
      health.status = 'degraded';
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error({ error: error.message }, 'Health check failed');
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

module.exports = router;

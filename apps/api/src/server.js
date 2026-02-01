
const express = require('express');
const redis = require('redis');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const { RateLimitOrchestrator } = require('../lib/rate-limiter');
const { initializeDatabase, executeMigrations, testConnection } = require('../lib/db-connector');

const app = express();
app.use(helmet());
app.use(express.json());

// JWT Secret with runtime guard
const JWT_SECRET = process.env.JWT_SECRET;

// Runtime security check
if (!JWT_SECRET) {
  console.error('[SECURITY] JWT_SECRET environment variable is required');
  console.error('[SECURITY] Set JWT_SECRET to a secure random string');
  process.exit(1);
}

const REDIS_URL = process.env.REDIS_URL;
const DATA_DIR = process.env.DATA_DIR || './data';
const OLLAMA_URL = process.env.OLLAMA_URL;

// Redis connection with runtime guard
if (!REDIS_URL) {
  console.error('[REDIS] REDIS_URL environment variable is required');
  console.error('[REDIS] Set REDIS_URL to Redis connection string');
  process.exit(1);
}

const redisClient = redis.createClient({ url: REDIS_URL });

redisClient.on('error', (err) => {
  console.error('[REDIS] Redis connection error:', err);
  process.exit(1);
});

redisClient.on('connect', () => {
  console.log('[REDIS] Connected to Redis');
});

const wss = new WebSocket.Server({ port: 3011 });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.on('message', async (message) => {
    const data = JSON.parse(message);
    if (data.type === 'subscribe_logs') {
      ws.jobId = data.jobId;
    }
  });
});

function broadcastLog(jobId, logEntry) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.jobId === jobId) {
      client.send(JSON.stringify({ type: 'log', jobId, ...logEntry }));
    }
  });
}

function ensureMemoryDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readMemoryFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return {};
}

function writeMemoryFile(filename, data) {
  ensureMemoryDir();
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}

// Tenant context: JWT claim or X-TENANT-ID for admin (fail if missing)
function requireTenant(req, res, next) {
  const tenantId = req.user.tenantId || (req.user.role === 'admin' ? (req.headers['x-tenant-id'] || '').trim() : null) || null;
  if (!tenantId) {
    return res.status(403).json({ error: 'Tenant context required' });
  }
  req.tenantId = tenantId;
  next();
}

// Initialize default user with security guard
async function initializeDefaultUser() {
  const db = require('../lib/db-connector').getPool();
  
  try {
    // Security: Require explicit password for default user creation
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD;
    
    if (!defaultPassword) {
      console.log('[SECURITY] No DEFAULT_ADMIN_PASSWORD provided - skipping default user creation');
      console.log('[SECURITY] Set DEFAULT_ADMIN_PASSWORD to create default admin user');
      return;
    }
    
    if (defaultPassword === 'admin123' || defaultPassword.length < 8) {
      console.error('[SECURITY] Default admin password is too weak');
      console.error('[SECURITY] Use a stronger password for DEFAULT_ADMIN_PASSWORD');
      return;
    }
    
    // Check if admin user already exists
    const existingUser = await db.query('SELECT id FROM users WHERE username = $1 AND tenant_id = $2', ['admin', 'default']);
    if (existingUser.rows.length > 0) {
      console.log('[SECURITY] Admin user already exists');
      return;
    }
    
    const defaultPasswordHash = await bcrypt.hash(defaultPassword, 10);
    await db.query(
      'INSERT INTO users (username, password_hash, tenant_id, role) VALUES ($1, $2, $3, $4)',
      ['admin', defaultPasswordHash, 'default', 'admin']
    );
    
    console.log('[SECURITY] Default admin user created in database');
  } catch (error) {
    console.error('[SECURITY] Failed to create default user:', error);
  }
}

// Login endpoint with validation
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  // Input validation
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password must be strings' });
  }
  
  if (username.length < 1 || username.length > 50) {
    return res.status(400).json({ error: 'Username must be between 1 and 50 characters' });
  }
  
  if (password.length < 1 || password.length > 100) {
    return res.status(400).json({ error: 'Password must be between 1 and 100 characters' });
  }
  
  // Username validation
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores, and hyphens' });
  }
  
  try {
    const db = require('../lib/db-connector').getPool();
    const result = await db.query(
      'SELECT id, username, password_hash, tenant_id, role FROM users WHERE username = $1',
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    if (!await bcrypt.compare(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const tenantId = user.tenant_id || 'default';
    const role = user.role || 'user';
    const token = jwt.sign(
      { userId: user.id, username: user.username, role, tenantId },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      user: { id: user.id, username: user.username, role, tenantId }
    });
  } catch (error) {
    console.error('[DATABASE] Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Authenticated + tenant-required (cross_tenant_access forbidden)
const withTenant = [authenticateToken, requireTenant];

// Adapter Status Check Endpoint
app.get('/api/adapters/status', withTenant, async (req, res) => {
  try {
    // Real adapter availability checks
    const ollamaAvailable = process.env.OLLAMA_URL && process.env.OLLAMA_URL.trim() !== '' && !process.env.OLLAMA_URL.includes('localhost');
    const dockerAvailable = process.env.DOCKER_HOST && process.env.DOCKER_HOST.trim() !== '' && !process.env.DOCKER_HOST.includes('localhost');
    
    // Real system status checks
    const db = require('../lib/db-connector').getPool();
    let databaseStatus = 'unknown';
    let databaseError = null;
    
    try {
      await db.query('SELECT 1');
      databaseStatus = 'connected';
    } catch (error) {
      databaseStatus = 'error';
      databaseError = error.message;
    }
    
    let redisStatus = 'unknown';
    let redisError = null;
    
    try {
      await redisClient.ping();
      redisStatus = 'connected';
    } catch (error) {
      redisStatus = 'error';
      redisError = error.message;
    }
    
    // Real job queue status (tenant-scoped)
    let queueStatus = 'unknown';
    let queueLength = 0;
    const tenantQueueKey = `tenant:${req.tenantId}:job_queue`;
    try {
      queueLength = await redisClient.lLen(tenantQueueKey);
      queueStatus = queueLength > 0 ? 'active' : 'idle';
    } catch (error) {
      queueStatus = 'error';
    }
    
    const status = {
      database: {
        available: databaseStatus === 'connected',
        status: databaseStatus,
        error: databaseError,
        type: 'postgresql'
      },
      redis: {
        available: redisStatus === 'connected',
        status: redisStatus,
        error: redisError,
        queue_length: queueLength,
        queue_status: queueStatus
      },
      adapters: {
        ollama: {
          available: ollamaAvailable,
          url: process.env.OLLAMA_URL || 'not_configured',
          status: ollamaAvailable ? 'available' : 'unavailable'
        },
        docker: {
          available: dockerAvailable,
          socket: process.env.DOCKER_HOST || 'not_configured',
          status: dockerAvailable ? 'available' : 'unavailable'
        }
      },
      core: {
        status: 'running',
        message: 'Core platform functionality is operational',
        uptime: process.uptime(),
        memory: process.memoryUsage()
      },
      timestamp: new Date().toISOString()
    };
    
    res.json(status);
  } catch (error) {
    console.error('[API] Adapter status check failed:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve adapter status',
      timestamp: new Date().toISOString()
    });
  }
});


// Input validation middleware
function validateInput(req, res, next) {
  const { message } = req.body;
  
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required and must be a string' });
  }
  
  if (message.length < 1 || message.length > 10000) {
    return res.status(400).json({ error: 'Message must be between 1 and 10000 characters' });
  }
  
  // Basic XSS prevention
  if (/<script|javascript:|on\w+=/i.test(message)) {
    return res.status(400).json({ error: 'Invalid characters in message' });
  }
  
  next();
}

app.post('/api/chat', withTenant, validateInput, async (req, res) => {
  const { message } = req.body;
  const jobId = uuidv4();
  const tenantId = req.tenantId;
  
  try {
    const db = require('../lib/db-connector').getPool();
    
    await db.query(`
      INSERT INTO jobs (id, user_id, tenant_id, type, status, input_data, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `, [jobId, req.user.userId, tenantId, 'chat', 'planning', JSON.stringify({ message })]);
    
    const job = {
      id: jobId,
      tenantId,
      message,
      status: 'planning',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    await redisClient.sAdd('tenants', tenantId);
    await redisClient.lPush(`tenant:${tenantId}:job_queue`, JSON.stringify(job));
    await redisClient.hSet(`tenant:${tenantId}:job:${jobId}`, 'data', JSON.stringify(job));
    
    res.json({ jobId, status: 'queued' });
  } catch (error) {
    console.error('[DATABASE] Job creation error:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

app.get('/api/jobs/:jobId', withTenant, async (req, res) => {
  const { jobId } = req.params;
  const tenantId = req.tenantId;
  
  try {
    const db = require('../lib/db-connector').getPool();
    const isAdmin = req.user.role === 'admin';
    const result = await db.query(
      isAdmin
        ? 'SELECT * FROM jobs WHERE id = $1 AND tenant_id = $2'
        : 'SELECT * FROM jobs WHERE id = $1 AND tenant_id = $2 AND user_id = $3',
      isAdmin ? [jobId, tenantId] : [jobId, tenantId, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const job = result.rows[0];
    res.json({
      id: job.id,
      type: job.type,
      status: job.status,
      input_data: job.input_data,
      output_data: job.output_data,
      error_message: job.error_message,
      created_at: job.created_at,
      updated_at: job.updated_at
    });
  } catch (error) {
    console.error('[DATABASE] Job retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve job' });
  }
});

app.get('/api/jobs', authenticateToken, async (req, res) => {
  try {
    const db = require('../lib/db-connector').getPool();
    const result = await db.query(
      'SELECT * FROM jobs WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.userId]
    );
    
    const jobs = result.rows.map(job => ({
      id: job.id,
      type: job.type,
      status: job.status,
      input_data: job.input_data,
      output_data: job.output_data,
      error_message: job.error_message,
      created_at: job.created_at,
      updated_at: job.updated_at
    }));
    
    res.json(jobs);
  } catch (error) {
    console.error('[DATABASE] Jobs list error:', error);
    res.status(500).json({ error: 'Failed to retrieve jobs' });
  }
});

app.get('/api/memory/:filename', withTenant, async (req, res) => {
  const { filename } = req.params;
  try {
    const db = require('../lib/db-connector').getPool();
    const result = await db.query(
      'SELECT content FROM memories WHERE user_id = $1 AND filename = $2 AND tenant_id = $3',
      [req.user.userId, filename, req.tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.json({});
    }
    
    res.json(result.rows[0].content);
  } catch (error) {
    console.error('[DATABASE] Memory retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve memory' });
  }
});

app.post('/api/memory/:filename', authenticateToken, async (req, res) => {
  const { filename } = req.params;
  const { data } = req.body;
  
  // Filename validation
  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'Valid filename required' });
  }
  
  if (!/^[a-zA-Z0-9_.-]+$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename format' });
  }
  
  if (filename.length > 100) {
    return res.status(400).json({ error: 'Filename too long' });
  }
  
  // Data validation
  if (data === undefined) {
    return res.status(400).json({ error: 'Data is required' });
  }
  
  try {
    JSON.stringify(data);
  } catch (error) {
    return res.status(400).json({ error: 'Data must be JSON serializable' });
  }
  
  try {
    const db = require('../lib/db-connector').getPool();
    await db.query(`
      INSERT INTO memories (user_id, filename, content, tenant_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (user_id, filename, tenant_id)
      DO UPDATE SET content = $3, updated_at = NOW()
    `, [req.user.userId, filename, data, req.tenantId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[DATABASE] Memory storage error:', error);
    res.status(500).json({ error: 'Failed to store memory' });
  }
});

app.get('/api/workspace', withTenant, async (req, res) => {
  try {
    const db = require('../lib/db-connector').getPool();
    const result = await db.query(
      'SELECT filename, content FROM memories WHERE user_id = $1 AND tenant_id = $2',
      [req.user.userId, req.tenantId]
    );
    
    const workspace = {
      projectState: {},
      constraints: {},
      decisions: {},
      knownIssues: {},
      lastUpdated: new Date().toISOString()
    };
    
    result.rows.forEach(memory => {
      workspace[memory.filename] = memory.content;
    });
    
    res.json(workspace);
  } catch (error) {
    console.error('[DATABASE] Workspace retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve workspace' });
  }
});

// Admin: list tenants (global_admin_view; admin only)
app.get('/api/admin/tenants', withTenant, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }
  try {
    const db = require('../lib/db-connector').getPool();
    const result = await db.query(
      'SELECT tenant_id, name, status FROM tenants ORDER BY tenant_id'
    );
    res.json(result.rows.map(r => ({ tenant_id: r.tenant_id, name: r.name, status: r.status })));
  } catch (error) {
    console.error('[API] Admin tenants error:', error);
    res.status(500).json({ error: 'Failed to list tenants' });
  }
});

// Health check endpoint for Railway
app.get("/health", async (req, res) => {
  try {
    // Real health checks
    const db = require('../lib/db-connector').getPool();
    let databaseHealthy = false;
    let databaseError = null;
    
    try {
      await db.query('SELECT 1');
      databaseHealthy = true;
    } catch (error) {
      databaseError = error.message;
    }
    
    let redisHealthy = false;
    let redisError = null;
    
    try {
      await redisClient.ping();
      redisHealthy = true;
    } catch (error) {
      redisError = error.message;
    }
    
    // Check WebSocket server
    const wsHealthy = wss && wss.clients && wss.clients.size >= 0;
    
    const overallHealthy = databaseHealthy && redisHealthy && wsHealthy;
    
    const healthData = {
      status: overallHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      checks: {
        database: {
          healthy: databaseHealthy,
          error: databaseError
        },
        redis: {
          healthy: redisHealthy,
          error: redisError
        },
        websocket: {
          healthy: wsHealthy,
          clients: wss ? wss.clients.size : 0
        }
      }
    };
    
    res.status(overallHealthy ? 200 : 503).json(healthData);
  } catch (error) {
    console.error('[HEALTH] Health check failed:', error);
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: "Health check failed"
    });
  }
});

const PORT = process.env.PORT || 3000;

// Core Server Bootstrap with Database
async function serverBootstrap() {
  try {
    console.log('[DATABASE] Initializing database connection...');
    initializeDatabase();
    
    console.log('[DATABASE] Testing database connection...');
    const connectionTest = await testConnection();
    if (!connectionTest) {
      throw new Error('Database connection test failed');
    }
    
    console.log('[DATABASE] Running migrations...');
    await executeMigrations();
    
    console.log('[DATABASE] Database initialization complete');
    
    // Test Redis connection
    console.log('[REDIS] Testing Redis connection...');
    await redisClient.connect();
    await redisClient.ping();
    console.log('[REDIS] Redis connection verified');
    
  } catch (error) {
    console.error('[BOOTSTRAP] Initialization failed:', error);
    process.exit(1);
  }
}

// Initialize default user before starting server
serverBootstrap().then(() => {
  const profile = getEnvProfile();
  console.log(`[ENV] Profile: ${profile.env} (logging=${profile.logging}, limits=${profile.limits})`);
  console.log('[RATE_LIMIT] Initializing professional rate limiting system...');
  const rateLimitOrchestrator = new RateLimitOrchestrator(redisClient, profile.limitsConfig);
  
  // Rate limiting with tenant-prefixed keys (ISOLATION_RULES.redis)
  const tenantRateKey = (req) => `tenant:${(req.headers['x-tenant-id'] || 'none').trim()}:${req.user?.userId || req.ip}`;
  app.use('/api/chat', rateLimitOrchestrator.getMiddleware('ai_endpoints', tenantRateKey));
  app.use('/api/jobs', rateLimitOrchestrator.getMiddleware('light_endpoints', tenantRateKey));
  app.use('/api/memory', rateLimitOrchestrator.getMiddleware('light_endpoints', tenantRateKey));
  app.use('/api/workspace', rateLimitOrchestrator.getMiddleware('light_endpoints', tenantRateKey));
  app.use('/api/adapters', rateLimitOrchestrator.getMiddleware('light_endpoints', tenantRateKey));
  app.use('/api/plugins', rateLimitOrchestrator.getMiddleware('light_endpoints', tenantRateKey));
  app.use('/api/auth', rateLimitOrchestrator.getMiddleware('light_endpoints', (req) => req.ip));
  
  // Plugin Manager API (tenant-scoped, fail-isolated)
  app.get('/api/plugins', withTenant, async (req, res) => {
    try {
      const discovered = pluginSystem.discoverPlugins();
      const enabled = await pluginSystem.getEnabledPlugins(redisClient, req.tenantId);
      const list = (discovered.available || []).map((p) => {
        const validation = pluginSystem.validatePlugin(p, pluginSystem.getPluginDir(), { signedOnly: true });
        const status = pluginSystem.monitorPlugin(req.tenantId, p.id);
        return {
          id: p.id,
          name: p.name,
          version: p.version,
          type: p.type,
          description: p.description,
          permissions: p.permissions,
          enabled: enabled.includes(p.id),
          valid: validation.valid,
          validationErrors: validation.valid ? [] : validation.errors,
          status: status.status
        };
      });
      res.json({ plugins: list, errors: discovered.errors || [] });
    } catch (e) {
      console.error('[PLUGINS] List error:', e);
      res.status(500).json({ error: 'Failed to list plugins' });
    }
  });
  app.post('/api/plugins/:pluginId/enable', withTenant, async (req, res) => {
    const { pluginId } = req.params;
    const tenantId = req.tenantId;
    try {
      const discovered = pluginSystem.discoverPlugins();
      const meta = (discovered.available || []).find((p) => p.id === pluginId);
      if (!meta) {
        return res.status(404).json({ error: 'Plugin not found' });
      }
      const validation = pluginSystem.validatePlugin(meta, pluginSystem.getPluginDir(), { signedOnly: true });
      if (!validation.valid) {
        return res.status(400).json({ error: 'Plugin validation failed', details: validation.errors });
      }
      const result = await pluginSystem.enablePlugin(redisClient, tenantId, pluginId, meta);
      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Enable failed' });
      }
      res.json({ success: true });
    } catch (e) {
      console.error('[PLUGINS] Enable error:', e);
      res.status(500).json({ error: 'Failed to enable plugin' });
    }
  });
  app.post('/api/plugins/:pluginId/disable', withTenant, async (req, res) => {
    const { pluginId } = req.params;
    try {
      const result = await pluginSystem.disablePlugin(redisClient, req.tenantId, pluginId);
      res.json({ success: result.success, shutdownOk: result.shutdownOk });
    } catch (e) {
      console.error('[PLUGINS] Disable error:', e);
      res.status(500).json({ error: 'Failed to disable plugin' });
    }
  });
  app.get('/api/plugins/status', withTenant, async (req, res) => {
    try {
      const enabled = await pluginSystem.getEnabledPlugins(redisClient, req.tenantId);
      const statuses = enabled.map((id) => ({
        id,
        ...pluginSystem.monitorPlugin(req.tenantId, id)
      }));
      res.json({ plugins: statuses });
    } catch (e) {
      console.error('[PLUGINS] Status error:', e);
      res.status(500).json({ error: 'Failed to get plugin status' });
    }
  });
  
  app.get('/api/admin/rate-limit-metrics', withTenant, async (req, res) => {
    try {
      const metrics = await rateLimitOrchestrator.getMetrics();
      res.json(metrics);
    } catch (error) {
      console.error('[RATE_LIMIT] Metrics endpoint error:', error);
      res.status(500).json({ error: 'Failed to retrieve rate limit metrics' });
    }
  });
  
  console.log('[RATE_LIMIT] Rate limiting system initialized');
  
  // Now start the server after rate limiting is configured
  initializeDefaultUser().then(() => {
    // Listen on localhost only to prevent network issues when Tailscale is off
    const HOST = process.env.HOST || '127.0.0.1';
    app.listen(PORT, HOST, () => {
      console.log(`[CORE] Ultra Agent API running on ${HOST}:${PORT} (env=${profile.env})`);
      console.log(`[CORE] WebSocket server running on port ${WS_PORT}`);
      console.log(`[SECURITY] Authentication system active`);
      console.log(`[DATABASE] PostgreSQL integration active`);
      console.log(`[REDIS] Redis integration active`);
      console.log(`[RATE_LIMIT] Professional rate limiting active`);
    });
  }).catch(error => {
    console.error('Failed to initialize default user:', error);
    process.exit(1);
  });
}).catch(error => {
  console.error('Failed to initialize server:', error);
  process.exit(1);
});

module.exports = { app, broadcastLog, redisClient };

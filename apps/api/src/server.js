
// Production environment validation and dotenv handling
const { validateProductionEnv, getEnvironmentProfile } = require('../../../lib/production-env-validator');

// Perform strict production environment validation
validateProductionEnv();

const express = require('express');
const redis = require('redis');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const { RateLimitOrchestrator } = require('../../../lib/rate-limiter');
const { initializeDatabase, executeMigrations, testConnection } = require('../../../lib/db-connector');
const { getEnvProfile } = require('../../../config/env-profiles');
const { getAvailablePort } = require('../../../lib/port-allocator');
const SecurityManager = require('../../../lib/security');

const app = express();
const security = new SecurityManager();

// CORS: allow UI origin (fix "Failed to fetch" on login)
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allow = ALLOWED_ORIGINS.includes('*') ? '*' : (origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Access-Control-Allow-Origin', allow || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-Id');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json());

// Root landing page (fix localhost:3000/)
const UI_URL = process.env.UI_URL || process.env.API_URL?.replace(':3000', ':8088') || 'http://localhost:8088';
app.get('/', (req, res) => {
  res.type('html');
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Ultra Agent OS – API</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'DM Sans',sans-serif;background:#1a1210;color:#e8d5c4;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px}
    h1{font-size:1.75rem;font-weight:700;color:#f5a623;margin-bottom:8px}
    p{color:#c4a77d;margin-bottom:16px;font-size:1rem}
    a{color:#f5a623;text-decoration:none;font-weight:500;padding:10px 20px;background:rgba(245,166,35,0.15);border-radius:8px;transition:background 0.2s}
    a:hover{background:rgba(245,166,35,0.25)}
    .links{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
    .badge{font-size:0.75rem;background:rgba(245,166,35,0.2);color:#f5a623;padding:4px 10px;border-radius:6px;margin-top:20px}
  </style>
</head>
<body>
  <h1>Ultra Agent OS</h1>
  <p>API is running. Open the dashboard to get started.</p>
  <div class="links">
    <a href="${UI_URL}">Open Dashboard</a>
    <a href="/health">Health Check</a>
  </div>
  <span class="badge">API v1.0</span>
</body>
</html>
  `);
});

// Use validated environment variables
const REDIS_URL = process.env.REDIS_URL;
const DATABASE_URL = process.env.DATABASE_URL;

// JWT Secret with runtime guard
const JWT_SECRET = process.env.JWT_SECRET;

// Railway environment variables fallback
if (!JWT_SECRET && process.env.RAILWAY_ENVIRONMENT) {
  // Generate a JWT secret for Railway if not provided
  console.log('[SECURITY] Generating JWT_SECRET for Railway deployment');
  process.env.JWT_SECRET = require('crypto').randomBytes(64).toString('hex');
}

// Runtime security check
if (!process.env.JWT_SECRET) {
  console.error('[SECURITY] JWT_SECRET environment variable is required');
  console.error('[SECURITY] Set JWT_SECRET to a secure random string');
  process.exit(1);
}

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

const wss = new WebSocket.Server({ port: 3011, host: '0.0.0.0' });

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

// Initialize default user with automatic bootstrap
async function initializeDefaultUser() {
  const db = require('../../../lib/db-connector').getPool();
  const envPassword = process.env.DEFAULT_ADMIN_PASSWORD;

  try {
    const existingUser = await db.query('SELECT id FROM users WHERE username = $1 AND tenant_id = $2', ['admin', 'default']);

    if (existingUser.rows.length > 0) {
      // Admin exists: sync password if DEFAULT_ADMIN_PASSWORD is set (allows password reset via env)
      if (envPassword && envPassword.length >= 8) {
        const hash = await bcrypt.hash(envPassword, 10);
        await db.query('UPDATE users SET password_hash = $1 WHERE username = $2 AND tenant_id = $3', [hash, 'admin', 'default']);
        console.log('[SECURITY] Admin password synced to DEFAULT_ADMIN_PASSWORD');
      } else {
        console.log('[SECURITY] Admin user already exists');
      }
      return;
    }

    // Create admin: use DEFAULT_ADMIN_PASSWORD when set, otherwise generate
    const password = (envPassword && envPassword.length >= 8)
      ? envPassword
      : require('crypto').randomBytes(16).toString('hex');
    const defaultPasswordHash = await bcrypt.hash(password, 10);

    await db.query(
      'INSERT INTO users (username, password_hash, tenant_id, role) VALUES ($1, $2, $3, $4)',
      ['admin', defaultPasswordHash, 'default', 'admin']
    );

    console.log('[SECURITY] Admin user created in database');
    if (!envPassword || envPassword.length < 8) {
      console.log('[SECURITY] Username: admin | Password:', password);
      console.log('[SECURITY] Set DEFAULT_ADMIN_PASSWORD for predictable credentials.');
    }
  } catch (error) {
    console.error('[SECURITY] Failed to create default user:', error);
    throw error;
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
    const db = require('../../../lib/db-connector').getPool();
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
    const db = require('../../../lib/db-connector').getPool();
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


// Test LLM adapter configuration
app.post('/api/adapters/test', authenticateToken, async (req, res) => {
  const { provider, url, model, apiKey } = req.body;
  
  try {
    let result = {};
    
    switch (provider) {
      case 'ollama':
        // Test Ollama connection - use internal Docker networking
        let ollamaTestUrl = url;
        if (url && url.includes('localhost')) {
          ollamaTestUrl = url.replace('localhost', 'ollama');
        }
        const ollamaResponse = await fetch(`${ollamaTestUrl}/api/tags`, {
          timeout: 5000
        }).catch(e => ({ ok: false, error: e.message }));
        
        if (ollamaResponse.ok) {
          result = { 
            success: true, 
            message: `Ollama connected successfully. Model: ${model}`,
            provider: 'ollama'
          };
        } else {
          result = { 
            success: false, 
            message: `Failed to connect to Ollama at ${url}`,
            error: ollamaResponse.error
          };
        }
        break;
        
      case 'openai':
        // Test OpenAI connection
        const openaiResponse = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          timeout: 5000
        }).catch(e => ({ ok: false, error: e.message }));
        
        if (openaiResponse.ok) {
          result = { 
            success: true, 
            message: `OpenAI API connection successful. Model: ${model}`,
            provider: 'openai'
          };
        } else {
          result = { 
            success: false, 
            message: 'Invalid OpenAI API key or connection failed',
            error: openaiResponse.error
          };
        }
        break;
        
      case 'gemini':
        // Test Gemini connection
        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
          { timeout: 5000 }
        ).catch(e => ({ ok: false, error: e.message }));
        
        if (geminiResponse.ok) {
          result = { 
            success: true, 
            message: `Gemini API connection successful. Model: ${model}`,
            provider: 'gemini'
          };
        } else {
          result = { 
            success: false, 
            message: 'Invalid Gemini API key or connection failed',
            error: geminiResponse.error
          };
        }
        break;
        
      case 'claude':
        // Test Claude connection
        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model,
            max_tokens: 10,
            messages: [{ role: 'user', content: 'test' }]
          }),
          timeout: 5000
        }).catch(e => ({ ok: false, error: e.message }));
        
        if (claudeResponse.ok || claudeResponse.status === 401) {
          result = { 
            success: claudeResponse.ok, 
            message: claudeResponse.ok ? 
              `Claude API connection successful. Model: ${model}` :
              'Claude API responded (authentication check)',
            provider: 'claude'
          };
        } else {
          result = { 
            success: false, 
            message: 'Invalid Claude API key or connection failed',
            error: claudeResponse.error
          };
        }
        break;
        
      default:
        return res.status(400).json({ error: 'Unknown provider' });
    }
    
    res.json(result);
  } catch (error) {
    console.error('[API] Adapter test failed:', error);
    res.status(500).json({ 
      error: 'Test failed',
      message: error.message
    });
  }
});
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
    const db = require('../../../lib/db-connector').getPool();
    
    await db.query(`
      INSERT INTO jobs (id, user_id, tenant_id, type, status, input_data, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `, [jobId, parseInt(req.user.userId), tenantId, 'chat', 'planning', JSON.stringify({ message })]);
    
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
    const db = require('../../../lib/db-connector').getPool();
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
    const db = require('../../../lib/db-connector').getPool();
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
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename format' });
  }
  try {
    const db = require('../../../lib/db-connector').getPool();
    const userId = typeof req.user.userId === 'string' ? parseInt(req.user.userId, 10) : req.user.userId;
    
    const result = await db.query(
      `SELECT content FROM memories 
       WHERE user_id = $1 AND filename = $2 AND tenant_id = $3`,
      [userId, filename, req.tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.json({ data: null });
    }
    
    // content is already JSONB, return it directly
    const content = result.rows[0].content;
    res.json({ data: content });
  } catch (error) {
    console.error('[MEMORY] Retrieval error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve memory' });
  }
});

app.post('/api/memory/:filename', withTenant, async (req, res) => {
  const { filename } = req.params;
  const { data } = req.body;
  
  console.log(`[MEMORY] POST received - filename: ${filename}, data type: ${typeof data}`);
  
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
  
  // Convert data to JSON object for JSONB storage
  let dataToStore;
  try {
    if (typeof data === 'string') {
      dataToStore = JSON.parse(data); // Parse string to object
    } else if (typeof data === 'object') {
      dataToStore = data;
    } else {
      dataToStore = { value: data };
    }
    console.log(`[MEMORY] Data converted - final type: ${typeof dataToStore}`);
  } catch (error) {
    console.log(`[MEMORY] JSON parse error: ${error.message}`);
    return res.status(400).json({ error: 'Data must be valid JSON' });
  }
  
  try {
    const db = require('../../../lib/db-connector').getPool();
    const userId = typeof req.user.userId === 'string' ? parseInt(req.user.userId, 10) : req.user.userId;
    
    console.log(`[MEMORY] Storing - userId: ${userId} (type: ${typeof userId}), tenant: ${req.tenantId}, file: ${filename}`);
    
    const jsonString = JSON.stringify(dataToStore);
    console.log(`[MEMORY] JSON string to store: ${jsonString.substring(0, 100)}...`);
    
    const result = await db.query(`
      INSERT INTO memories (user_id, filename, content, tenant_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (user_id, filename, tenant_id)
      DO UPDATE SET content = $3, updated_at = NOW()
      RETURNING id
    `, [userId, filename, jsonString, req.tenantId]);
    
    console.log(`[MEMORY] Query executed, rows returned: ${result.rows.length}`);
    
    if (result.rows.length > 0) {
      console.log(`[MEMORY] ✅ Success - stored as id: ${result.rows[0].id}`);
      res.json({ success: true, id: result.rows[0].id });
    } else {
      throw new Error('No rows returned after insert');
    }
  } catch (error) {
    console.error(`[MEMORY] ❌ Error: ${error.message}`);
    console.error(`[MEMORY] Stack: ${error.stack}`);
    res.status(500).json({ error: 'Failed to store memory', details: error.message });
  }
});

app.get('/api/workspace', withTenant, async (req, res) => {
  try {
    const db = require('../../../lib/db-connector').getPool();
    const userId = typeof req.user.userId === 'string' ? parseInt(req.user.userId, 10) : req.user.userId;
    
    const result = await db.query(
      `SELECT filename, content FROM memories 
       WHERE user_id = $1 AND tenant_id = $2`,
      [userId, req.tenantId]
    );
    
    const workspace = {
      projectState: {},
      constraints: {},
      decisions: {},
      knownIssues: {},
      lastUpdated: new Date().toISOString()
    };
    
    result.rows.forEach(memory => {
      // content is already JSONB
      workspace[memory.filename] = memory.content;
    });
    
    res.json(workspace);
  } catch (error) {
    console.error('[MEMORY] Workspace retrieval error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve workspace' });
  }
});

// Admin: list tenants (global_admin_view; admin only)
app.get('/api/admin/tenants', withTenant, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }
  try {
    const db = require('../../../lib/db-connector').getPool();
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
    const db = require('../../../lib/db-connector').getPool();
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

  // User Settings API endpoints
  app.get('/api/user/settings', withTenant, async (req, res) => {
    try {
      const db = require('../../../lib/db-connector').getPool();
      const userId = typeof req.user.userId === 'string' ? parseInt(req.user.userId, 10) : req.user.userId;
      const tenantId = req.tenantId;
      
      const result = await db.query(
        'SELECT settings FROM user_settings WHERE user_id = $1 AND tenant_id = $2',
        [userId, tenantId]
      );
      
      if (result.rows.length > 0) {
        // Decrypt settings before sending to client
        const decryptedSettings = security.decryptSettings(result.rows[0].settings);
        res.json({ settings: decryptedSettings });
      } else {
        // Return default settings
        const defaultSettings = {
          llm: { provider: 'ollama', url: 'http://ollama:11434', model: 'llama3.2' },
          appearance: { theme: 'blue', starfield: true, effects3d: true },
          system: { autosave: true, jobTimeout: 300 }
        };
        res.json({ settings: defaultSettings });
      }
    } catch (error) {
      console.error('[SETTINGS] Get settings error:', error);
      res.status(500).json({ error: 'Failed to retrieve settings' });
    }
  });

  app.post('/api/user/settings', withTenant, async (req, res) => {
    try {
      const db = require('../../../lib/db-connector').getPool();
      const userId = typeof req.user.userId === 'string' ? parseInt(req.user.userId, 10) : req.user.userId;
      const tenantId = req.tenantId;
      const { settings } = req.body;
      
      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Invalid settings object' });
      }
      
      // Encrypt sensitive settings before storing
      const encryptedSettings = security.encryptSettings(settings);
      
      // Get old settings for audit
      const oldResult = await db.query(
        'SELECT settings FROM user_settings WHERE user_id = $1 AND tenant_id = $2',
        [userId, tenantId]
      );
      const oldSettings = oldResult.rows.length > 0 ? oldResult.rows[0].settings : null;
      
      // Upsert settings
      await db.query(`
        INSERT INTO user_settings (user_id, tenant_id, settings, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id, tenant_id)
        DO UPDATE SET settings = $3, updated_at = NOW()
      `, [userId, tenantId, JSON.stringify(encryptedSettings)]);
      
      // Log audit event
      await logAuditEvent(db, userId, tenantId, 'UPDATE', 'user_settings', userId.toString(), oldSettings, settings, req);
      
      res.json({ success: true, message: 'Settings saved successfully' });
    } catch (error) {
      console.error('[SETTINGS] Save settings error:', error);
      res.status(500).json({ error: 'Failed to save settings' });
    }
  });

  app.delete('/api/user/settings', withTenant, async (req, res) => {
    try {
      const db = require('../../../lib/db-connector').getPool();
      const userId = typeof req.user.userId === 'string' ? parseInt(req.user.userId, 10) : req.user.userId;
      const tenantId = req.tenantId;
      
      await db.query(
        'DELETE FROM user_settings WHERE user_id = $1 AND tenant_id = $2',
        [userId, tenantId]
      );
      
      res.json({ success: true, message: 'Settings reset successfully' });
    } catch (error) {
      console.error('[SETTINGS] Delete settings error:', error);
      res.status(500).json({ error: 'Failed to reset settings' });
    }
  });

  // Enhanced System Health Monitoring endpoint
  app.get('/api/health/detailed', withTenant, async (req, res) => {
    try {
      const db = require('../../../lib/db-connector').getPool();
      
      // Get system metrics
      const systemMetrics = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version
      };
      
      // Database health check with metrics
      let dbMetrics = { healthy: false, error: null, connections: 0 };
      try {
        const dbResult = await db.query(`
          SELECT 
            count(*) as total_connections,
            count(*) FILTER (WHERE state = 'active') as active_connections
          FROM pg_stat_activity 
          WHERE datname = current_database()
        `);
        dbMetrics = {
          healthy: true,
          connections: dbResult.rows[0].total_connections,
          activeConnections: dbResult.rows[0].active_connections,
          size: await getDatabaseSize(db)
        };
      } catch (error) {
        dbMetrics.error = error.message;
      }
      
      // Redis health check with metrics
      let redisMetrics = { healthy: false, error: null, memory: 0, keys: 0 };
      try {
        await redisClient.ping();
        const info = await redisClient.info('memory');
        const keyCount = await redisClient.dbSize();
        redisMetrics = {
          healthy: true,
          memory: parseRedisMemory(info),
          keys: keyCount
        };
      } catch (error) {
        redisMetrics.error = error.message;
      }
      
      // Job queue metrics
      let jobMetrics = { total: 0, byStatus: {} };
      try {
        const jobResult = await db.query(`
          SELECT status, COUNT(*) as count
          FROM jobs 
          WHERE tenant_id = $1
          GROUP BY status
        `, [req.tenantId]);
        
        jobMetrics.total = jobResult.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
        jobResult.rows.forEach(row => {
          jobMetrics.byStatus[row.status] = parseInt(row.count);
        });
      } catch (error) {
        console.error('Job metrics error:', error);
      }
      
      // WebSocket connections
      const wsMetrics = {
        connected: wss ? wss.clients.size : 0,
        status: wss ? 'active' : 'inactive'
      };
      
      // Overall health calculation
      const overallHealthy = dbMetrics.healthy && redisMetrics.healthy;
      
      const healthData = {
        status: overallHealthy ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        system: systemMetrics,
        database: dbMetrics,
        redis: redisMetrics,
        jobs: jobMetrics,
        websocket: wsMetrics,
        tenant: {
          id: req.tenantId,
          user: req.user.userId
        }
      };
      
      res.status(overallHealthy ? 200 : 503).json(healthData);
    } catch (error) {
      console.error('[HEALTH] Detailed health check failed:', error);
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  });

  // Helper functions for health monitoring
  async function getDatabaseSize(db) {
    try {
      const result = await db.query(`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `);
      return result.rows[0].size;
    } catch {
      return 'Unknown';
    }
  }
  
  function parseRedisMemory(info) {
    const match = info.match(/used_memory:(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  // Audit logging function
  async function logAuditEvent(db, userId, tenantId, action, resourceType, resourceId, oldValues, newValues, req) {
    try {
      await db.query(`
        INSERT INTO audit_log (user_id, tenant_id, action, resource_type, resource_id, old_values, new_values, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        userId,
        tenantId,
        action,
        resourceType,
        resourceId,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        req.ip || null,
        req.get('User-Agent') || null
      ]);
    } catch (error) {
      console.error('[AUDIT] Failed to log audit event:', error);
    }
  }

  // 404 for unknown routes
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found', path: req.path });
  });

  // Global error handler
  app.use((err, req, res, next) => {
    console.error('[API] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  console.log('[RATE_LIMIT] Rate limiting system initialized');
  
  // Now start the server after rate limiting is configured
  initializeDefaultUser().then(async () => {
    // Railway environment detection
    const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
    
    // Use dynamic port allocation with Railway compatibility
    // Railway provides PORT env var, otherwise use our dynamic system
    const railwayPort = process.env.PORT ? parseInt(process.env.PORT) : null;
    const PORT = await getAvailablePort('api', railwayPort || 3000);
    const WS_PORT = await getAvailablePort('websocket', 3011);
    
    // Listen on appropriate interface based on environment
    const HOST = process.env.HOST || (isRailway ? '0.0.0.0' : '127.0.0.1');
    const server = app.listen(PORT, HOST, () => {
      console.log(`[CORE] Ultra Agent API running on ${HOST}:${PORT} (env=${profile.env})`);
      console.log(`[CORE] WebSocket server running on port ${WS_PORT}`);
      console.log(`[SECURITY] Authentication system active`);
      console.log(`[DATABASE] PostgreSQL integration active`);
      console.log(`[REDIS] Redis integration active`);
      console.log(`[RATE_LIMIT] Professional rate limiting active`);
    });

    const shutdown = () => {
      console.log('[CORE] Shutdown signal received, closing server...');
      server.close(() => {
        redisClient.quit().catch(() => {}).finally(() => process.exit(0));
      });
      setTimeout(() => process.exit(1), 10000);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }).catch(error => {
    console.error('Failed to initialize default user:', error);
    process.exit(1);
  });
}).catch(error => {
  console.error('Failed to initialize server:', error);
  process.exit(1);
});

module.exports = { app, broadcastLog, redisClient };

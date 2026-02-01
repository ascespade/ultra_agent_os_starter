# 🔧 COMPLETE REFACTORING IMPLEMENTATION PLAN
**Target:** Ultra Agent OS Core Architecture  
**Objective:** Transform monolithic `server.js` into modular, testable, production-grade architecture  
**Estimated Effort:** 8-12 hours  
**Complexity:** 🔴 HIGH

---

## 🎯 REFACTORING GOALS

1. ✅ **Modularity:** No file >400 lines
2. ✅ **Testability:** Each module independently testable
3. ✅ **Maintainability:** Clear separation of concerns
4. ✅ **Scalability:** Independent module scaling
5. ✅ **Security:** Centralized security controls

---

## 📐 TARGET ARCHITECTURE

```
apps/api/src/
├── server.js                          # Entry point (<50 lines)
├── core/
│   ├── app.js                         # Express app factory
│   ├── http-server.js                 # HTTP server singleton
│   └── websocket-server.js            # WebSocket server module
├── modules/
│   ├── auth/
│   │   ├── auth.controller.js         # Routes
│   │   ├── auth.service.js            # Business logic
│   │   ├── auth.middleware.js         # Middleware
│   │   └── auth.validator.js          # Input validation
│   ├── jobs/
│   │   ├── jobs.controller.js
│   │   ├── jobs.service.js
│   │   └── jobs.validator.js
│   ├── memory/
│   │   ├── memory.controller.js
│   │   ├── memory.service.js
│   │   └── memory.validator.js
│   ├── adapters/
│   │   ├── adapters.controller.js
│   │   └── adapters.service.js
│   ├── admin/
│   │   └── admin.controller.js
│   └── health/
│       └── health.controller.js
├── services/
│   ├── redis.service.js               # Redis client singleton
│   ├── database.service.js            # Database pool singleton
│   └── ui-server.service.js           # UI static serving (optional)
├── middleware/
│   ├── cors.middleware.js
│   ├── security.middleware.js
│   ├── error.middleware.js
│   └── validation.middleware.js
├── routes/
│   └── index.js                       # Route aggregator
└── utils/
    ├── logger.js
    └── state-machine.js               # Job state transitions
```

---

## 🔨 IMPLEMENTATION STEPS

### **STEP 1: Create Core Infrastructure**

#### 1.1 Redis Service (Singleton)

**File:** `apps/api/src/services/redis.service.js`

```javascript
// apps/api/src/services/redis.service.js
const redis = require('redis');

class RedisService {
  constructor() {
    if (RedisService.instance) {
      return RedisService.instance;
    }

    const REDIS_URL = process.env.REDIS_URL;
    if (!REDIS_URL) {
      console.error('[REDIS] REDIS_URL environment variable is required');
      process.exit(1);
    }

    this.client = redis.createClient({
      url: REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          const delay = Math.min(100 * Math.pow(2, retries), 5000);
          console.log(`[REDIS] Reconnect attempt ${retries + 1}, waiting ${delay}ms`);
          return delay;
        }
      }
    });

    this.client.on('error', (err) => {
      console.error(JSON.stringify({
        level: 'error',
        service: 'redis',
        message: 'Redis connection error',
        error: err.message,
        timestamp: new Date().toISOString()
      }));
    });

    this.client.on('connect', () => {
      console.log(JSON.stringify({
        level: 'info',
        service: 'redis',
        message: 'Redis connected successfully',
        timestamp: new Date().toISOString()
      }));
    });

    this.client.on('ready', () => {
      console.log('[REDIS] Redis client ready');
    });

    RedisService.instance = this;
  }

  async connect() {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
    return this.client;
  }

  async disconnect() {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  getClient() {
    if (!this.client.isOpen) {
      throw new Error('Redis client not connected. Call connect() first.');
    }
    return this.client;
  }

  async ping() {
    return this.client.ping();
  }
}

module.exports = new RedisService();
```

#### 1.2 Database Service (Singleton)

**File:** `apps/api/src/services/database.service.js`

```javascript
// apps/api/src/services/database.service.js
const { Pool } = require('pg');

class DatabaseService {
  constructor() {
    if (DatabaseService.instance) {
      return DatabaseService.instance;
    }

    const DATABASE_URL = process.env.DATABASE_URL;
    if (!DATABASE_URL) {
      console.error('[DATABASE] DATABASE_URL environment variable is required');
      process.exit(1);
    }

    this.pool = new Pool({
      connectionString: DATABASE_URL,
      max: 20,                      // Maximum pool size
      idleTimeoutMillis: 30000,     // Close idle connections after 30s
      connectionTimeoutMillis: 2000 // Fail fast on exhaustion
    });

    this.pool.on('error', (err) => {
      console.error('[DATABASE] Unexpected error on idle client', err);
    });

    this.pool.on('connect', () => {
      console.log('[DATABASE] New client connected to pool');
    });

    DatabaseService.instance = this;
  }

  getPool() {
    return this.pool;
  }

  async query(text, params) {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      console.log('[DATABASE] Query executed', { duration, rows: res.rowCount });
      return res;
    } catch (error) {
      console.error('[DATABASE] Query error', { error: error.message, query: text });
      throw error;
    }
  }

  async testConnection() {
    try {
      const result = await this.pool.query('SELECT NOW()');
      console.log('[DATABASE] Connection test successful', result.rows[0]);
      return true;
    } catch (error) {
      console.error('[DATABASE] Connection test failed', error);
      return false;
    }
  }

  async close() {
    await this.pool.end();
    console.log('[DATABASE] Pool closed');
  }
}

module.exports = new DatabaseService();
```

#### 1.3 WebSocket Service

**File:** `apps/api/src/core/websocket-server.js`

```javascript
// apps/api/src/core/websocket-server.js
const WebSocket = require('ws');

class WebSocketServer {
  constructor() {
    if (WebSocketServer.instance) {
      return WebSocketServer.instance;
    }
    this.wss = null;
    WebSocketServer.instance = this;
  }

  initialize(httpServer) {
    if (this.wss) {
      console.warn('[WEBSOCKET] Server already initialized');
      return this.wss;
    }

    this.wss = new WebSocket.Server({ 
      server: httpServer,
      path: '/ws'
    });

    this.wss.on('connection', (ws, req) => {
      console.log('[WEBSOCKET] Client connected', { ip: req.socket.remoteAddress });

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'subscribe' && data.jobId) {
            ws.jobId = data.jobId;
            console.log('[WEBSOCKET] Client subscribed to job', data.jobId);
          }
        } catch (error) {
          console.error('[WEBSOCKET] Invalid message', error);
        }
      });

      ws.on('close', () => {
        console.log('[WEBSOCKET] Client disconnected');
      });

      ws.on('error', (error) => {
        console.error('[WEBSOCKET] Client error', error);
      });
    });

    console.log('[WEBSOCKET] Server initialized');
    return this.wss;
  }

  broadcastLog(jobId, logEntry) {
    if (!this.wss) {
      console.warn('[WEBSOCKET] Server not initialized');
      return;
    }

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client.jobId === jobId) {
        client.send(JSON.stringify({ type: 'log', jobId, ...logEntry }));
      }
    });
  }

  getServer() {
    return this.wss;
  }
}

module.exports = new WebSocketServer();
```

---

### **STEP 2: Create Middleware Layer**

#### 2.1 CORS Middleware

**File:** `apps/api/src/middleware/cors.middleware.js`

```javascript
// apps/api/src/middleware/cors.middleware.js
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '*')
  .split(',')
  .map((s) => s.trim());

function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  const allow = ALLOWED_ORIGINS.includes('*')
    ? '*'
    : origin && ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0];

  res.setHeader('Access-Control-Allow-Origin', allow || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-Id');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
}

module.exports = corsMiddleware;
```

#### 2.2 Security Middleware

**File:** `apps/api/src/middleware/security.middleware.js`

```javascript
// apps/api/src/middleware/security.middleware.js
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Helmet configuration
const helmetMiddleware = helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
});

// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,                  // 100 requests per window
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false
});

// Login rate limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                    // 5 login attempts
  message: 'Too many login attempts. Please try again later.',
  skipSuccessfulRequests: true
});

module.exports = {
  helmetMiddleware,
  globalLimiter,
  loginLimiter
};
```

#### 2.3 Error Middleware

**File:** `apps/api/src/middleware/error.middleware.js`

```javascript
// apps/api/src/middleware/error.middleware.js
function errorHandler(err, req, res, next) {
  console.error('[ERROR]', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Don't expose stack traces in production
  const isDevelopment = process.env.NODE_ENV !== 'production';

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(isDevelopment && { stack: err.stack }),
    timestamp: new Date().toISOString()
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
```

---

### **STEP 3: Create Auth Module**

#### 3.1 Auth Middleware

**File:** `apps/api/src/modules/auth/auth.middleware.js`

```javascript
// apps/api/src/modules/auth/auth.middleware.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('[SECURITY] CRITICAL: JWT_SECRET environment variable is required');
  process.exit(1);
}

if (JWT_SECRET.length < 32) {
  console.error('[SECURITY] CRITICAL: JWT_SECRET must be at least 32 characters');
  process.exit(1);
}

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

function requireTenant(req, res, next) {
  const tenantId =
    req.user.tenantId ||
    (req.user.role === 'admin'
      ? (req.headers['x-tenant-id'] || '').trim()
      : null) ||
    null;

  if (!tenantId) {
    return res.status(403).json({ error: 'Tenant context required' });
  }

  req.tenantId = tenantId;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }
  next();
}

module.exports = {
  authenticateToken,
  requireTenant,
  requireAdmin,
  JWT_SECRET
};
```

#### 3.2 Auth Service

**File:** `apps/api/src/modules/auth/auth.service.js`

```javascript
// apps/api/src/modules/auth/auth.service.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./auth.middleware');
const databaseService = require('../../services/database.service');

class AuthService {
  async initializeDefaultUser() {
    const db = databaseService.getPool();
    const envPassword = process.env.DEFAULT_ADMIN_PASSWORD;

    try {
      const existingUser = await db.query(
        'SELECT id FROM users WHERE username = $1 AND tenant_id = $2',
        ['admin', 'default']
      );

      if (existingUser.rows.length > 0) {
        if (envPassword && envPassword.length >= 8) {
          const hash = await bcrypt.hash(envPassword, 10);
          await db.query(
            'UPDATE users SET password_hash = $1 WHERE username = $2 AND tenant_id = $3',
            [hash, 'admin', 'default']
          );
          console.log('[SECURITY] Admin password synced to DEFAULT_ADMIN_PASSWORD');
        } else {
          console.log('[SECURITY] Admin user already exists');
        }
        return;
      }

      // Create admin
      const password =
        envPassword && envPassword.length >= 8
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

  async login(username, password) {
    const db = databaseService.getPool();

    const result = await db.query(
      'SELECT id, username, password_hash, tenant_id, role FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    const tenantId = user.tenant_id || 'default';
    const role = user.role || 'user';

    const token = jwt.sign(
      { userId: user.id, username: user.username, role, tenantId },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return {
      token,
      user: { id: user.id, username: user.username, role, tenantId }
    };
  }
}

module.exports = new AuthService();
```

#### 3.3 Auth Controller

**File:** `apps/api/src/modules/auth/auth.controller.js`

```javascript
// apps/api/src/modules/auth/auth.controller.js
const express = require('express');
const authService = require('./auth.service');
const { loginLimiter } = require('../../middleware/security.middleware');

const router = express.Router();

// Login endpoint
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
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

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({
        error: 'Username can only contain letters, numbers, underscores, and hyphens'
      });
    }

    const result = await authService.login(username, password);
    res.json(result);
  } catch (error) {
    if (error.message === 'Invalid credentials') {
      return res.status(401).json({ error: error.message });
    }
    next(error);
  }
});

module.exports = router;
```

---

### **STEP 4: Create Jobs Module**

#### 4.1 Job State Machine

**File:** `apps/api/src/utils/state-machine.js`

```javascript
// apps/api/src/utils/state-machine.js
const VALID_TRANSITIONS = {
  'planning': ['processing', 'failed'],
  'processing': ['completed', 'failed'],
  'completed': [],
  'failed': []
};

class StateMachine {
  static validateTransition(currentStatus, newStatus) {
    if (!VALID_TRANSITIONS[currentStatus]) {
      throw new Error(`Invalid current status: ${currentStatus}`);
    }

    if (!VALID_TRANSITIONS[currentStatus].includes(newStatus)) {
      throw new Error(
        `Invalid transition: ${currentStatus} → ${newStatus}. ` +
        `Valid transitions: ${VALID_TRANSITIONS[currentStatus].join(', ')}`
      );
    }

    return true;
  }

  static getValidTransitions(currentStatus) {
    return VALID_TRANSITIONS[currentStatus] || [];
  }
}

module.exports = StateMachine;
```

#### 4.2 Jobs Service

**File:** `apps/api/src/modules/jobs/jobs.service.js`

```javascript
// apps/api/src/modules/jobs/jobs.service.js
const { v4: uuidv4 } = require('uuid');
const databaseService = require('../../services/database.service');
const redisService = require('../../services/redis.service');
const StateMachine = require('../../utils/state-machine');

const MAX_BACKLOG = 100;

class JobsService {
  async createJob(userId, tenantId, message) {
    const jobId = uuidv4();
    const queueKey = `tenant:${tenantId}:job_queue`;
    const redis = redisService.getClient();
    const db = databaseService.getPool();

    // Check backlog
    const backlogSize = await redis.lLen(queueKey);
    if (backlogSize >= MAX_BACKLOG) {
      throw new Error('BACKLOG_EXCEEDED');
    }

    // Insert into database
    await db.query(
      `INSERT INTO jobs (id, user_id, tenant_id, type, status, input_data, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [jobId, parseInt(userId), tenantId, 'chat', 'planning', JSON.stringify({ message })]
    );

    // Queue in Redis
    const job = {
      id: jobId,
      tenantId,
      message,
      status: 'planning',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await redis.sAdd('tenants', tenantId);
    await redis.lPush(queueKey, JSON.stringify(job));
    await redis.hSet(`tenant:${tenantId}:job:${jobId}`, 'data', JSON.stringify(job));

    return { jobId, status: 'queued' };
  }

  async getJob(jobId, tenantId, userId, isAdmin) {
    const db = databaseService.getPool();

    const result = await db.query(
      isAdmin
        ? 'SELECT * FROM jobs WHERE id = $1 AND tenant_id = $2'
        : 'SELECT * FROM jobs WHERE id = $1 AND tenant_id = $2 AND user_id = $3',
      isAdmin ? [jobId, tenantId] : [jobId, tenantId, userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const job = result.rows[0];
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      input_data: job.input_data,
      output_data: job.output_data,
      error_message: job.error_message,
      created_at: job.created_at,
      updated_at: job.updated_at
    };
  }

  async listJobs(userId) {
    const db = databaseService.getPool();

    const result = await db.query(
      'SELECT * FROM jobs WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    return result.rows.map((job) => ({
      id: job.id,
      type: job.type,
      status: job.status,
      input_data: job.input_data,
      output_data: job.output_data,
      error_message: job.error_message,
      created_at: job.created_at,
      updated_at: job.updated_at
    }));
  }
}

module.exports = new JobsService();
```

#### 4.3 Jobs Controller

**File:** `apps/api/src/modules/jobs/jobs.controller.js`

```javascript
// apps/api/src/modules/jobs/jobs.controller.js
const express = require('express');
const jobsService = require('./jobs.service');
const { authenticateToken, requireTenant } = require('../auth/auth.middleware');

const router = express.Router();

// Create job
router.post('/chat', authenticateToken, requireTenant, async (req, res, next) => {
  try {
    const { message } = req.body;

    // Validation
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required and must be a string' });
    }

    if (message.length < 1 || message.length > 10000) {
      return res.status(400).json({ error: 'Message must be between 1 and 10000 characters' });
    }

    if (/<script|javascript:|on\w+=/i.test(message)) {
      return res.status(400).json({ error: 'Invalid characters in message' });
    }

    const result = await jobsService.createJob(req.user.userId, req.tenantId, message);
    res.json(result);
  } catch (error) {
    if (error.message === 'BACKLOG_EXCEEDED') {
      return res.status(429).json({
        error: 'System busy. Too many pending jobs.',
        retry_after: 60
      });
    }
    next(error);
  }
});

// Get job by ID
router.get('/jobs/:jobId', authenticateToken, requireTenant, async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const isAdmin = req.user.role === 'admin';

    const job = await jobsService.getJob(jobId, req.tenantId, req.user.userId, isAdmin);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  } catch (error) {
    next(error);
  }
});

// List jobs
router.get('/jobs', authenticateToken, async (req, res, next) => {
  try {
    const jobs = await jobsService.listJobs(req.user.userId);
    res.json(jobs);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
```

---

### **STEP 5: Create Memory Module**

**File:** `apps/api/src/modules/memory/memory.controller.js`

```javascript
// apps/api/src/modules/memory/memory.controller.js
const express = require('express');
const { authenticateToken, requireTenant } = require('../auth/auth.middleware');
const databaseService = require('../../services/database.service');

const router = express.Router();

// Get memory
router.get('/memory/:filename', authenticateToken, requireTenant, async (req, res, next) => {
  try {
    const { filename } = req.params;

    // Validation
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(filename)) {
      return res.status(400).json({ error: 'Invalid filename format' });
    }

    const db = databaseService.getPool();
    const userId = typeof req.user.userId === 'string'
      ? parseInt(req.user.userId, 10)
      : req.user.userId;

    const result = await db.query(
      `SELECT content FROM memories 
       WHERE user_id = $1 AND filename = $2 AND tenant_id = $3`,
      [userId, filename, req.tenantId]
    );

    if (result.rows.length === 0) {
      return res.json({ data: null });
    }

    res.json({ data: result.rows[0].content });
  } catch (error) {
    next(error);
  }
});

// Store memory
router.post('/memory/:filename', authenticateToken, requireTenant, async (req, res, next) => {
  try {
    const { filename } = req.params;

    // Flexible data extraction
    let data = req.body;
    if (data && data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
      data = data.data;
    }

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
    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
      return res.status(400).json({ error: 'Data is required (non-empty body)' });
    }

    // Convert to JSON object for JSONB
    let dataToStore = data;
    if (typeof data === 'string') {
      try {
        dataToStore = JSON.parse(data);
      } catch (e) {
        dataToStore = { content: data };
      }
    } else if (typeof data !== 'object') {
      dataToStore = { content: data };
    }

    const db = databaseService.getPool();
    const userId = typeof req.user.userId === 'string'
      ? parseInt(req.user.userId, 10)
      : req.user.userId;

    const result = await db.query(
      `INSERT INTO memories (user_id, filename, content, tenant_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (user_id, filename, tenant_id)
       DO UPDATE SET content = $3, updated_at = NOW()
       RETURNING id`,
      [userId, filename, dataToStore, req.tenantId]
    );

    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    next(error);
  }
});

// Get workspace
router.get('/workspace', authenticateToken, requireTenant, async (req, res, next) => {
  try {
    const db = databaseService.getPool();
    const userId = typeof req.user.userId === 'string'
      ? parseInt(req.user.userId, 10)
      : req.user.userId;

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

    result.rows.forEach((memory) => {
      workspace[memory.filename] = memory.content;
    });

    res.json(workspace);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
```

---

### **STEP 6: Create Express App Factory**

**File:** `apps/api/src/core/app.js`

```javascript
// apps/api/src/core/app.js
const express = require('express');
const corsMiddleware = require('../middleware/cors.middleware');
const { helmetMiddleware, globalLimiter } = require('../middleware/security.middleware');
const { errorHandler, notFoundHandler } = require('../middleware/error.middleware');

// Import routes
const authRoutes = require('../modules/auth/auth.controller');
const jobsRoutes = require('../modules/jobs/jobs.controller');
const memoryRoutes = require('../modules/memory/memory.controller');
// ... import other routes

function createApp() {
  const app = express();

  // Middleware
  app.use(corsMiddleware);
  app.use(helmetMiddleware);
  app.use(express.json());
  app.use(globalLimiter);

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api', jobsRoutes);
  app.use('/api', memoryRoutes);
  // ... mount other routes

  // Health check
  app.get('/health', async (req, res) => {
    const databaseService = require('../services/database.service');
    const redisService = require('../services/redis.service');

    try {
      const dbHealthy = await databaseService.testConnection();
      const redisHealthy = await redisService.ping();

      res.json({
        status: dbHealthy && redisHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks: {
          database: { healthy: dbHealthy },
          redis: { healthy: !!redisHealthy }
        }
      });
    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        error: error.message
      });
    }
  });

  // Error handlers (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
```

---

### **STEP 7: Create HTTP Server Singleton**

**File:** `apps/api/src/core/http-server.js`

```javascript
// apps/api/src/core/http-server.js
const http = require('http');

class HttpServer {
  constructor() {
    if (HttpServer.instance) {
      return HttpServer.instance;
    }
    this.server = null;
    this.isListening = false;
    HttpServer.instance = this;
  }

  create(app) {
    if (this.server) {
      console.warn('[HTTP] Server already created');
      return this.server;
    }

    this.server = http.createServer(app);
    console.log('[HTTP] Server created');
    return this.server;
  }

  async listen(port) {
    if (this.isListening) {
      console.warn('[HTTP] Server already listening');
      return this.server;
    }

    return new Promise((resolve, reject) => {
      this.server.listen(port, (err) => {
        if (err) {
          console.error('[HTTP] Failed to start server:', err);
          reject(err);
        } else {
          this.isListening = true;
          console.log(`[HTTP] Server listening on port ${port}`);
          resolve(this.server);
        }
      });
    });
  }

  async close() {
    if (!this.server || !this.isListening) {
      return;
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        this.isListening = false;
        console.log('[HTTP] Server closed');
        resolve();
      });
    });
  }

  getServer() {
    return this.server;
  }
}

module.exports = new HttpServer();
```

---

### **STEP 8: Create New Entry Point**

**File:** `apps/api/src/server.js` (NEW VERSION)

```javascript
// apps/api/src/server.js
const { validateProductionEnv } = require('../../lib/production-env-validator');

// Validate environment
validateProductionEnv();

const createApp = require('./core/app');
const httpServer = require('./core/http-server');
const websocketServer = require('./core/websocket-server');
const redisService = require('./services/redis.service');
const databaseService = require('./services/database.service');
const authService = require('./modules/auth/auth.service');

async function bootstrap() {
  try {
    console.log('[BOOTSTRAP] Starting application...');

    // Connect to Redis
    await redisService.connect();
    console.log('[BOOTSTRAP] Redis connected');

    // Test database
    const dbHealthy = await databaseService.testConnection();
    if (!dbHealthy) {
      throw new Error('Database connection failed');
    }
    console.log('[BOOTSTRAP] Database connected');

    // Initialize default user
    await authService.initializeDefaultUser();

    // Create Express app
    const app = createApp();

    // Create HTTP server
    const server = httpServer.create(app);

    // Initialize WebSocket
    websocketServer.initialize(server);

    // Start listening
    const PORT = process.env.PORT || 3000;
    await httpServer.listen(PORT);

    console.log('[BOOTSTRAP] Application ready');
  } catch (error) {
    console.error('[BOOTSTRAP] Failed to start:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  console.log('[SHUTDOWN] Shutting down gracefully...');

  try {
    await httpServer.close();
    await redisService.disconnect();
    await databaseService.close();
    console.log('[SHUTDOWN] Cleanup complete');
    process.exit(0);
  } catch (error) {
    console.error('[SHUTDOWN] Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start application
bootstrap();
```

---

## 📋 MIGRATION CHECKLIST

### **Phase 1: Preparation**
- [ ] Backup current `server.js` to `server.js.backup`
- [ ] Create new directory structure
- [ ] Install any missing dependencies

### **Phase 2: Core Services**
- [ ] Create `services/redis.service.js`
- [ ] Create `services/database.service.js`
- [ ] Create `core/websocket-server.js`
- [ ] Test each service independently

### **Phase 3: Middleware**
- [ ] Create `middleware/cors.middleware.js`
- [ ] Create `middleware/security.middleware.js`
- [ ] Create `middleware/error.middleware.js`

### **Phase 4: Modules**
- [ ] Create `modules/auth/*`
- [ ] Create `modules/jobs/*`
- [ ] Create `modules/memory/*`
- [ ] Create `modules/adapters/*`
- [ ] Create `modules/admin/*`
- [ ] Create `modules/health/*`

### **Phase 5: Core**
- [ ] Create `core/app.js`
- [ ] Create `core/http-server.js`
- [ ] Create new `server.js`

### **Phase 6: Testing**
- [ ] Test authentication flow
- [ ] Test job creation
- [ ] Test memory operations
- [ ] Test health endpoint
- [ ] Test graceful shutdown

### **Phase 7: Deployment**
- [ ] Update `package.json` if needed
- [ ] Test in development
- [ ] Deploy to staging
- [ ] Monitor for issues
- [ ] Deploy to production

---

## 🎯 SUCCESS CRITERIA

✅ **All files < 400 lines**  
✅ **Each module independently testable**  
✅ **No code duplication**  
✅ **Clear separation of concerns**  
✅ **All existing functionality preserved**  
✅ **Improved error handling**  
✅ **Better security (rate limiting, validation)**  
✅ **Graceful shutdown implemented**

---

## ⚠️ RISKS AND MITIGATION

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Comprehensive testing before deployment |
| Database connection issues | Test connection pooling thoroughly |
| Redis singleton issues | Implement proper initialization checks |
| WebSocket disconnections | Add reconnection logic |
| Performance degradation | Benchmark before/after |

---

## 📊 ESTIMATED TIMELINE

| Phase | Duration | Complexity |
|-------|----------|------------|
| Phase 1-2 | 2 hours | Medium |
| Phase 3 | 1 hour | Low |
| Phase 4 | 4 hours | High |
| Phase 5 | 1 hour | Medium |
| Phase 6 | 2 hours | High |
| Phase 7 | 2 hours | Medium |
| **TOTAL** | **12 hours** | **HIGH** |

---

**Next Steps:**
1. Review this plan
2. Set up Node.js environment
3. Begin Phase 1 implementation
4. Test incrementally
5. Deploy when all tests pass

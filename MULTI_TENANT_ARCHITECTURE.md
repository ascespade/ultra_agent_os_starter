# Ultra Agent OS - Multi-Tenant Architecture

## Multi-Tenant Core Implementation

This document defines the **multi-tenant architecture** implemented in Ultra Agent OS with strict tenant isolation, quotas, and management.

---

## 🏢 TENANT ARCHITECTURE OVERVIEW

### Multi-Tenancy Model
- **Type**: **Shared Database, Shared Application** with strict logical isolation
- **Isolation Level**: **Row-Level Security** with tenant_id scoping
- **Data Separation**: Complete tenant data segregation
- **Resource Management**: Per-tenant quotas and limits

### Tenant Context
```javascript
// Tenant context is extracted from JWT token or headers
{
  tenantId: "tenant-123",           // Unique tenant identifier
  userId: "user-456",              // User within tenant
  userRole: "admin|user",          // User role within tenant
  tenantFilter: "tenant_id = $1",   // Database filter
  tenantParams: ["tenant-123"]      // Query parameters
}
```

---

## 🗄️ DATABASE SCHEMA MULTI-TENANCY

### Enhanced Tables with Tenant Support

#### Users Table
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  tenant_id VARCHAR(100) NOT NULL DEFAULT 'default',
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Jobs Table
```sql
CREATE TABLE jobs (
  id VARCHAR(36) PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  tenant_id VARCHAR(100) NOT NULL DEFAULT 'default',
  type VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  input_data JSONB,
  output_data JSONB,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Memories Table
```sql
CREATE TABLE memories (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  tenant_id VARCHAR(100) NOT NULL DEFAULT 'default',
  filename VARCHAR(255) NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, filename, tenant_id)
);
```

#### Tenant Management Tables
```sql
-- Tenant quotas and limits
CREATE TABLE tenant_quotas (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) UNIQUE NOT NULL,
  max_users INTEGER NOT NULL DEFAULT 10,
  max_jobs_per_day INTEGER NOT NULL DEFAULT 100,
  max_storage_mb INTEGER NOT NULL DEFAULT 1024,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tenant metadata and settings
CREATE TABLE tenants (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  settings JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔒 TENANT ISOLATION MECHANISMS

### Database Isolation
```javascript
// All database queries automatically include tenant filtering
function enforceTenantIsolation(req, res, next) {
  if (!req.tenantId) {
    return res.status(400).json({ error: 'Tenant context required' });
  }
  
  req.tenantFilter = 'tenant_id = $1';
  req.tenantParams = [req.tenantId];
  next();
}

// Example tenant-scoped query
const jobs = await db.query(`
  SELECT * FROM jobs 
  WHERE ${req.tenantFilter} AND user_id = $2
  ORDER BY created_at DESC
`, [...req.tenantParams, req.user.userId]);
```

### Redis Isolation
```javascript
// Redis keys are tenant-prefixed
const jobKey = `job:${req.tenantId}:${jobId}`;
const queueKey = `job_queue:${req.tenantId}`;
const memoryKey = `memory:${req.tenantId}:${userId}:${filename}`;

// Tenant-specific job queue
await redisClient.lPush(`job_queue:${req.tenantId}`, jobData);
```

### File System Isolation
```javascript
// File system paths are tenant-scoped
const tenantDataDir = path.join(DATA_DIR, 'tenants', req.tenantId);
const userMemoryDir = path.join(tenantDataDir, 'users', req.userId);

// Ensure tenant directories exist
function ensureTenantDirectory(tenantId) {
  const tenantDir = path.join(DATA_DIR, 'tenants', tenantId);
  if (!fs.existsSync(tenantDir)) {
    fs.mkdirSync(tenantDir, { recursive: true });
  }
  return tenantDir;
}
```

---

## 📊 TENANT QUOTAS AND LIMITS

### Quota Management
```javascript
// Default tenant quotas
const DEFAULT_QUOTAS = {
  max_users: 10,
  max_jobs_per_day: 100,
  max_storage_mb: 1024,
  max_concurrent_jobs: 5
};

// Quota enforcement middleware
async function enforceQuotas(req, res, next) {
  const tenantQuotas = await getTenantQuotas(req.tenantId);
  
  // Check job creation quota
  if (req.path === '/api/jobs' && req.method === 'POST') {
    const todayJobs = await getTodayJobCount(req.tenantId);
    if (todayJobs >= tenantQuotas.max_jobs_per_day) {
      return res.status(429).json({ 
        error: 'Daily job quota exceeded',
        quota: tenantQuotas.max_jobs_per_day,
        used: todayJobs
      });
    }
  }
  
  next();
}
```

### Quota Monitoring
```javascript
// Real-time quota tracking
async function getTenantQuotas(tenantId) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM tenant_quotas WHERE tenant_id = $1',
    [tenantId]
  );
  
  return result.rows[0] || DEFAULT_QUOTAS;
}

// Usage statistics
async function getTenantUsage(tenantId) {
  const db = getPool();
  
  const [userCount, jobCount, storageUsage] = await Promise.all([
    db.query('SELECT COUNT(*) as count FROM users WHERE tenant_id = $1', [tenantId]),
    db.query('SELECT COUNT(*) as count FROM jobs WHERE tenant_id = $1 AND created_at >= CURRENT_DATE', [tenantId]),
    getTenantStorageUsage(tenantId)
  ]);
  
  return {
    users: parseInt(userCount.rows[0].count),
    jobs_today: parseInt(jobCount.rows[0].count),
    storage_mb: storageUsage
  };
}
```

---

## 👥 TENANT USER MANAGEMENT

### Multi-Tenant Authentication
```javascript
// JWT token includes tenant context
const token = jwt.sign({
  userId: user.id,
  username: user.username,
  role: user.role,
  tenantId: user.tenant_id
}, JWT_SECRET, { expiresIn: '24h' });

// Tenant context extraction
function extractTenantContext(req, res, next) {
  const authHeader = req.headers['authorization'];
  const tenantHeader = req.headers['x-tenant-id'];
  
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.tenantId = decoded.tenantId || 'default';
    req.userId = decoded.userId;
    req.userRole = decoded.role;
  } else {
    req.tenantId = tenantHeader || 'default';
    req.userId = null;
    req.userRole = 'system';
  }
  
  next();
}
```

### Tenant User Roles
```javascript
// Role-based permissions within tenant
const TENANT_ROLES = {
  admin: {
    permissions: [
      'user:create', 'user:read', 'user:update', 'user:delete',
      'job:create', 'job:read', 'job:update', 'job:delete',
      'tenant:read', 'tenant:update'
    ]
  },
  user: {
    permissions: [
      'job:create', 'job:read', 'job:update',
      'profile:read', 'profile:update'
    ]
  }
};

// Permission checking
function hasPermission(userRole, permission) {
  return TENANT_ROLES[userRole]?.permissions?.includes(permission) || false;
}
```

---

## 🔧 TENANT MANAGEMENT APIS

### Tenant Administration
```javascript
// Create new tenant
app.post('/api/tenants', authenticateToken, async (req, res) => {
  const { tenantId, name, quotas } = req.body;
  
  // Only system admins can create tenants
  if (req.userRole !== 'system') {
    return res.status(403).json({ error: 'System admin required' });
  }
  
  const db = getPool();
  
  // Create tenant record
  await db.query(`
    INSERT INTO tenants (tenant_id, name, status, created_at, updated_at)
    VALUES ($1, $2, 'active', NOW(), NOW())
  `, [tenantId, name]);
  
  // Set tenant quotas
  await db.query(`
    INSERT INTO tenant_quotas (tenant_id, max_users, max_jobs_per_day, max_storage_mb, created_at, updated_at)
    VALUES ($1, $2, $3, $4, NOW(), NOW())
  `, [tenantId, quotas?.max_users || 10, quotas?.max_jobs_per_day || 100, quotas?.max_storage_mb || 1024]);
  
  res.json({ message: 'Tenant created successfully', tenantId });
});

// Get tenant information
app.get('/api/tenants/:tenantId', authenticateToken, async (req, res) => {
  const { tenantId } = req.params;
  
  // Users can only view their own tenant
  if (req.userRole !== 'system' && req.tenantId !== tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const db = getPool();
  
  const [tenantInfo, tenantQuotas, tenantUsage] = await Promise.all([
    db.query('SELECT * FROM tenants WHERE tenant_id = $1', [tenantId]),
    db.query('SELECT * FROM tenant_quotas WHERE tenant_id = $1', [tenantId]),
    getTenantUsage(tenantId)
  ]);
  
  res.json({
    tenant: tenantInfo.rows[0],
    quotas: tenantQuotas.rows[0],
    usage: tenantUsage
  });
});
```

### Tenant User Management
```javascript
// Create tenant user
app.post('/api/tenants/:tenantId/users', authenticateToken, async (req, res) => {
  const { tenantId } = req.params;
  const { username, password, role } = req.body;
  
  // Check tenant user quota
  const quotas = await getTenantQuotas(tenantId);
  const currentUsers = await getTenantUserCount(tenantId);
  
  if (currentUsers >= quotas.max_users) {
    return res.status(429).json({ 
      error: 'User quota exceeded',
      max: quotas.max_users,
      current: currentUsers
    });
  }
  
  const db = getPool();
  const passwordHash = await bcrypt.hash(password, 10);
  
  await db.query(`
    INSERT INTO users (username, password_hash, tenant_id, role, created_at, updated_at)
    VALUES ($1, $2, $3, $4, NOW(), NOW())
  `, [username, passwordHash, tenantId, role || 'user']);
  
  res.json({ message: 'User created successfully' });
});

// Get tenant users
app.get('/api/tenants/:tenantId/users', authenticateToken, async (req, res) => {
  const { tenantId } = req.params;
  
  // Users can only view their own tenant users
  if (req.userRole !== 'system' && req.tenantId !== tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const db = getPool();
  const users = await db.query(
    'SELECT id, username, role, created_at FROM users WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );
  
  res.json({ users: users.rows });
});
```

---

## 📈 TENANT MONITORING

### Tenant Metrics
```javascript
// Get tenant metrics dashboard
app.get('/api/tenants/:tenantId/metrics', authenticateToken, async (req, res) => {
  const { tenantId } = req.params;
  
  // Enforce tenant access
  if (req.userRole !== 'system' && req.tenantId !== tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const db = getPool();
  
  const [jobMetrics, userMetrics, quotaMetrics] = await Promise.all([
    // Job statistics
    db.query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs,
        COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END) as today_jobs
      FROM jobs 
      WHERE tenant_id = $1
    `, [tenantId]),
    
    // User statistics
    db.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_users
      FROM users 
      WHERE tenant_id = $1
    `, [tenantId]),
    
    // Quota usage
    getTenantQuotas(tenantId)
  ]);
  
  const metrics = {
    jobs: jobMetrics.rows[0],
    users: userMetrics.rows[0],
    quotas: quotaMetrics,
    usage: await getTenantUsage(tenantId)
  };
  
  res.json(metrics);
});
```

### System-wide Tenant Monitoring
```javascript
// System admin tenant overview
app.get('/api/system/tenants', authenticateToken, async (req, res) => {
  // System admin only
  if (req.userRole !== 'system') {
    return res.status(403).json({ error: 'System admin required' });
  }
  
  const db = getPool();
  
  const tenants = await db.query(`
    SELECT 
      t.tenant_id,
      t.name,
      t.status,
      t.created_at,
      tq.max_users,
      tq.max_jobs_per_day,
      tq.max_storage_mb,
      COUNT(DISTINCT u.id) as user_count,
      COUNT(DISTINCT j.id) as total_jobs
    FROM tenants t
    LEFT JOIN tenant_quotas tq ON t.tenant_id = tq.tenant_id
    LEFT JOIN users u ON t.tenant_id = u.tenant_id
    LEFT JOIN jobs j ON t.tenant_id = j.tenant_id
    GROUP BY t.tenant_id, t.name, t.status, t.created_at, tq.max_users, tq.max_jobs_per_day, tq.max_storage_mb
    ORDER BY t.created_at DESC
  `);
  
  res.json({ tenants: tenants.rows });
});
```

---

## 🚀 TENANT LIFECYCLE MANAGEMENT

### Tenant Creation Workflow
```javascript
// Automated tenant provisioning
async function provisionTenant(tenantId, tenantName, quotas) {
  const db = getPool();
  
  try {
    // 1. Create tenant record
    await db.query(`
      INSERT INTO tenants (tenant_id, name, status, created_at, updated_at)
      VALUES ($1, $2, 'active', NOW(), NOW())
    `, [tenantId, tenantName]);
    
    // 2. Set up quotas
    await db.query(`
      INSERT INTO tenant_quotas (tenant_id, max_users, max_jobs_per_day, max_storage_mb, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [tenantId, quotas.max_users, quotas.max_jobs_per_day, quotas.max_storage_mb]);
    
    // 3. Create tenant directory structure
    const tenantDir = ensureTenantDirectory(tenantId);
    
    // 4. Initialize tenant Redis namespace
    await initializeTenantRedis(tenantId);
    
    // 5. Create default admin user for tenant
    await createTenantAdmin(tenantId, tenantName);
    
    return { success: true, tenantId };
  } catch (error) {
    console.error(`Failed to provision tenant ${tenantId}:`, error);
    throw error;
  }
}
```

### Tenant Deactivation
```javascript
// Soft delete tenant
app.delete('/api/tenants/:tenantId', authenticateToken, async (req, res) => {
  const { tenantId } = req.params;
  
  // System admin only
  if (req.userRole !== 'system') {
    return res.status(403).json({ error: 'System admin required' });
  }
  
  const db = getPool();
  
  // Soft delete - mark as inactive
  await db.query(
    'UPDATE tenants SET status = $1, updated_at = NOW() WHERE tenant_id = $2',
    ['inactive', tenantId]
  );
  
  // Revoke all user tokens for tenant
  await revokeTenantTokens(tenantId);
  
  res.json({ message: 'Tenant deactivated successfully' });
});
```

---

## 📋 TENANT COMPLIANCE AND SECURITY

### Data Isolation Verification
```javascript
// Verify tenant data isolation
async function verifyTenantIsolation(tenantId) {
  const db = getPool();
  
  // Check that no data leaks across tenants
  const crossTenantQueries = [
    'SELECT COUNT(*) FROM jobs WHERE tenant_id != $1',
    'SELECT COUNT(*) FROM users WHERE tenant_id != $1',
    'SELECT COUNT(*) FROM memories WHERE tenant_id != $1'
  ];
  
  for (const query of crossTenantQueries) {
    const result = await db.query(query, [tenantId]);
    if (parseInt(result.rows[0].count) > 0) {
      throw new Error(`Data isolation violation detected for tenant ${tenantId}`);
    }
  }
  
  return { verified: true };
}
```

### Audit Logging
```javascript
// Tenant-aware audit logging
function logTenantEvent(tenantId, userId, event, details) {
  const auditEntry = {
    timestamp: new Date().toISOString(),
    tenantId,
    userId,
    event,
    details,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  };
  
  // Store in tenant-specific audit log
  const auditKey = `audit:${tenantId}:${Date.now()}`;
  redisClient.hSet(auditKey, auditEntry);
  
  // Also log to system audit
  console.log(`[AUDIT] [${tenantId}] ${event}: ${userId} - ${details}`);
}
```

---

## 🎯 BEST PRACTICES

### Tenant Design Principles
1. **Explicit Tenant Context**: Every operation must have explicit tenant context
2. **No Data Leakage**: Strict enforcement of tenant boundaries
3. **Quota Enforcement**: Prevent resource abuse with per-tenant limits
4. **Audit Trail**: Complete audit logging for all tenant operations
5. **Graceful Degradation**: Handle quota exceeded scenarios gracefully

### Security Considerations
- **JWT Token Security**: Include tenant_id in all tokens
- **Database Security**: Row-level security with tenant_id filtering
- **Redis Security**: Tenant-prefixed keys for data isolation
- **File System Security**: Tenant-isolated directory structures
- **API Security**: Tenant context validation on all endpoints

### Performance Optimization
- **Database Indexing**: tenant_id columns indexed for performance
- **Connection Pooling**: Per-tenant connection management
- **Caching Strategy**: Tenant-aware caching with invalidation
- **Resource Monitoring**: Per-tenant resource usage tracking

---

**This multi-tenant architecture provides complete isolation while maintaining efficient resource utilization and strict security boundaries.**

**Last Updated:** 2025-01-31  
**Multi-Tenant Architecture Version:** 1.0.0

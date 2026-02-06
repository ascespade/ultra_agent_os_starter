# ARCH_DECISIONS.md

**Document Date:** 2026-02-06T16:30:00Z  
**Version:** 1.0.0  
**Status:** ✅ APPROVED

This document records key architecture decisions made for the Ultra Agent OS core system.

---

## Table of Contents

1. [Service Separation Strategy](#1-service-separation-strategy)
2. [Database Connection Pooling Approach](#2-database-connection-pooling-approach)
3. [Redis Queue Implementation](#3-redis-queue-implementation)
4. [Worker Crash Recovery Design](#4-worker-crash-recovery-design)
5. [Railway Deployment Decisions](#5-railway-deployment-decisions)
6. [State Machine Design](#6-state-machine-design)
7. [Health Check Strategy](#7-health-check-strategy)

---

## 1. Service Separation Strategy

### Decision

Separate API, Worker, and UI into independent processes with clear boundaries.

### Context

The system requires:
- Independent scaling of API vs Worker
- Failure isolation (worker crash shouldn't affect API)
- Clear separation of concerns
- Simplified debugging and monitoring

### Options Considered

| Option | Pros | Cons |
|--------|------|------|
| Monolithic (single process) | Simpler deployment | No isolation, scaling issues |
| Two-tier (API + Worker) | Basic separation | No UI independence |
| Three-tier (API + Worker + UI) ✅ | Full isolation, independent scaling | More complex deployment |

### Implementation

```
┌─────────────────────────────────────────────────────────────┐
│                   Ultra Agent OS                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   ultra-ui   │───▶│ ultra-agent-api│───▶│ ultra-worker  │  │
│  │   (Port 8080)│    │   (Port 8080) │    │  (Port 8080)  │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**File References:**
- API: [`apps/api/src/server.js`](apps/api/src/server.js)
- Worker: [`apps/worker/src/worker.js`](apps/worker/src/worker.js)
- UI: [`apps/ui/src/server.js`](apps/ui/src/server.js)

### Consequences

- ✅ Independent scaling per service
- ✅ Failure isolation
- ✅ Clear debugging paths
- ⚠️ More complex deployment (mitigated by Railway)

---

## 2. Database Connection Pooling Approach

### Decision

Use PostgreSQL with connection pooling and exponential backoff reconnection strategy.

### Context

Production environments require:
- Multiple concurrent connections
- Automatic reconnection on failures
- Resource management (connection limits)
- Query timeout protection

### Implementation

```javascript
// lib/db-connector.js
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,              // Max concurrent connections
  min: 2,               // Min idle connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  statement_timeout: 10000,
  query_timeout: 10000,
  allowExitOnIdle: false
});
```

**Recovery Strategy:**
```javascript
// Exponential backoff with jitter
const MAX_RECONNECT_INTERVAL_MS = 60000;
const INITIAL_RECONNECT_INTERVAL_MS = 1000;

function getReconnectDelay() {
  const baseDelay = INITIAL_RECONNECT_INTERVAL_MS * Math.pow(2, Math.min(reconnectAttempts, 10));
  const jitter = Math.random() * 0.3 * baseDelay;
  return Math.min(baseDelay + jitter, MAX_RECONNECT_INTERVAL_MS);
}
```

**File Reference:** [`lib/db-connector.js`](lib/db-connector.js)

### Consequences

- ✅ Automatic recovery from DB restarts
- ✅ Resource protection (connection limits)
- ✅ Query timeout protection
- ⚠️ Additional complexity (worthwhile for production)

---

## 3. Redis Queue Implementation

### Decision

Use Redis for job queuing with tenant isolation and circuit breaker pattern.

### Context

Worker needs:
- Reliable job queue
- Multi-tenant isolation
- Failure handling (circuit breaker)
- Persistence across restarts

### Implementation

**Queue Structure:**
```
tenant:{tenantId}:queue     → List of job IDs
tenant:{tenantId}:job:{id}  → Job data (JSON)
tenant:{tenantId}:status:{id} → Job status
```

**Circuit Breaker:**
```javascript
const CircuitBreaker = {
  failures: 0,
  threshold: 5,
  resetTimeout: 30000,
  
  isOpen: () => {
    if (CircuitBreaker.failures >= CircuitBreaker.threshold) {
      if (Date.now() - CircuitBreaker.lastFailureTime > CircuitBreaker.resetTimeout) {
        CircuitBreaker.failures = 0;  // Half-open
        return false;
      }
      return true;
    }
    return false;
  }
};
```

**File Reference:** [`apps/api/src/services/redis.service.js`](apps/api/src/services/redis.service.js)

### Consequences

- ✅ Multi-tenant isolation
- ✅ Failure protection
- ⚠️ Single Redis instance (future: Redis Cluster)

---

## 4. Worker Crash Recovery Design

### Decision

Implement graceful shutdown with signal handlers and state preservation.

### Context

Worker process may crash or be terminated. Need to:
- Handle SIGTERM/SIGINT gracefully
- Preserve job state for recovery
- Clean up resources properly
- Prevent data loss

### Implementation

```javascript
// Signal handlers
process.on('SIGTERM', async () => {
  console.log('[WORKER] Received SIGTERM, shutting down gracefully');
  await shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[WORKER] Received SIGINT, shutting down gracefully');
  await shutdown();
  process.exit(0);
});

// Graceful shutdown
async function shutdown() {
  // 1. Close Redis connection
  if (redisClient) await redisClient.quit();
  
  // 2. Close database pool
  if (db.getPool) await db.getPool().end();
  
  // 3. Signal completion
  console.log('[WORKER] Shutdown complete');
}

// Force exit timeout
const FORCE_EXIT_TIMEOUT = 10000;
setTimeout(() => {
  console.log('[WORKER] Force exiting after timeout');
  process.exit(1);
}, FORCE_EXIT_TIMEOUT);
```

**File Reference:** [`apps/worker/src/worker.js`](apps/worker/src/worker.js)

### Consequences

- ✅ Graceful shutdown on container termination
- ✅ Resource cleanup
- ⚠️ Jobs in progress may fail (acceptable for queue-based systems)

---

## 5. Railway Deployment Decisions

### Decision

Use Railway's native service discovery and dynamic PORT assignment.

### Context

Railway provides:
- Automatic service discovery
- Dynamic PORT assignment
- Environment variable linking
- Volume persistence

### Implementation

**railway.toml:**
```toml
[build]
dockerfile = "apps/api/Dockerfile"

[deploy]
startCommand = "node apps/api/src/server.js"
healthcheckPath = "/health"
healthcheckInterval = 30
restartPolicyType = "always"
restartPolicyMaxRetries = 10

[environments]
[environments.production]
[environments.production.variables]
NODE_ENV = "production"
HOST = "0.0.0.0"
PORT = "8080"
```

**Dynamic PORT Usage:**
```javascript
// Always use process.env.PORT
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0');
```

**Service Discovery:**
```bash
# Railway automatically links services
DATABASE_URL = postgres://...  # PostgreSQL service
REDIS_URL = redis://...        # Redis service
API_URL = https://...          # Public URL
```

**File Reference:** [`railway.toml`](railway.toml)

### Consequences

- ✅ Simplified configuration
- ✅ Automatic service linking
- ✅ Zero-downtime deployments
- ⚠️ Local development requires Docker Compose

---

## 6. State Machine Design

### Decision

Implement valid state transitions with terminal and retry states.

### Context

Job lifecycle requires:
- Valid state transitions only
- Terminal states (completed, failed)
- Retry capability for failed jobs

### Implementation

```javascript
// lib/state-machine.js
class StateMachine {
  static STATES = {
    PENDING: ['pending', 'processing', 'active', 'failed'],
    PROCESSING: ['processing', 'completed', 'failed'],
    ACTIVE: ['active', 'completed', 'failed'],
    COMPLETED: ['completed'],  // Terminal state
    FAILED: ['failed', 'pending']  // Can retry
  };

  static validateTransition(fromStatus, toStatus) {
    const allowedTransitions = this.STATES[fromStatus.toUpperCase()];
    if (!allowedTransitions.includes(toStatus.toLowerCase())) {
      throw new Error(`Invalid state transition: ${fromStatus} -> ${toStatus}`);
    }
    return true;
  }
}
```

**File Reference:** [`lib/state-machine.js`](lib/state-machine.js)

### Consequences

- ✅ Invalid state transitions prevented
- ✅ Clear job lifecycle
- ⚠️ Fixed states limit flexibility (intentional for safety)

---

## 7. Health Check Strategy

### Decision

Implement deep health checks with real connectivity tests.

### Context

Monitoring requires:
- Real connectivity verification
- Component-specific status
- Deep health (not just "OK")

### Implementation

```javascript
// apps/api/src/routes/health.routes.js
router.get('/health', async (req, res) => {
  const db = require('../../../lib/db-connector');
  const redis = require('../../../services/redis.service.js');
  
  const checks = {
    database: false,
    redis: false
  };
  
  // Deep health: actually query the database
  try {
    await db.getPool().query('SELECT 1');
    checks.database = true;
  } catch (e) {
    console.error('[HEALTH] DB check failed:', e.message);
  }
  
  // Deep health: actually check Redis
  try {
    const client = redis.getClient();
    await client.ping();
    checks.redis = true;
  } catch (e) {
    console.error('[HEALTH] Redis check failed:', e.message);
  }
  
  const status = checks.database && checks.redis ? 'ok' : 'degraded';
  
  res.json({
    status,
    checks,
    uptime: process.uptime()
  });
});
```

**File Reference:** [`apps/api/src/routes/health.routes.js`](apps/api/src/routes/health.routes.js)

### Consequences

- ✅ Real infrastructure health verification
- ✅ Container orchestrator integration
- ⚠️ Slightly higher latency (negligible for health checks)

---

## Summary Table

| Decision | Impact | Risk |
|----------|--------|------|
| Service Separation | High positive | Low |
| DB Pooling + Recovery | High positive | Low |
| Redis Queue + CB | High positive | Medium |
| Worker Crash Recovery | High positive | Low |
| Railway Deployment | Medium positive | Low |
| State Machine | Medium positive | Low |
| Deep Health Checks | Medium positive | Low |

---

*Architecture decisions documented by Ultra Agent Freeze Validation System*

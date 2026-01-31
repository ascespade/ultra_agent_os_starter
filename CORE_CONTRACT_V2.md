# Ultra Agent OS - Core Contract

## Immutable Core Platform Contract

**Version:** 1.0.0  
**Status:** FREEZE ELIGIBLE  
**Effective Date:** 2025-01-31  

This contract defines the **immutable boundaries** of the Ultra Agent OS Core Platform. **No changes permitted** without formal governance process.

---

## 🚫 IMMUTABLE CORE CONTRACTS

### 1. Service Architecture Contract

#### Service Definitions (IMMUTABLE)
```yaml
services:
  api:
    name: "ultra-agent-api"
    entrypoint: "apps/api/src/server.js"
    port: 3000
    websocket_port: 3011
    dependencies: [postgresql, redis]
    
  worker:
    name: "ultra-agent-worker"
    entrypoint: "apps/worker/src/worker.js"
    dependencies: [postgresql, redis]
    
  ui:
    name: "ultra-agent-ui"
    entrypoint: "apps/ui/src/server.js"
    dependencies: [api]
```

#### Service Communication (IMMUTABLE)
- **API ↔ Worker**: Redis job queue only
- **API ↔ UI**: HTTP + WebSocket only
- **Worker ↔ Database**: Direct PostgreSQL connection
- **No direct Worker ↔ UI communication**

### 2. Database Schema Contract

#### Table Structure (IMMUTABLE)
```sql
-- users table structure CANNOT change
CREATE TABLE users (
  id SERIAL PRIMARY KEY,                    -- IMMUTABLE
  username VARCHAR(50) UNIQUE NOT NULL,     -- IMMUTABLE
  password_hash VARCHAR(255) NOT NULL,      -- IMMUTABLE
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- IMMUTABLE
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP  -- IMMUTABLE
);

-- jobs table structure CANNOT change
CREATE TABLE jobs (
  id VARCHAR(36) PRIMARY KEY,              -- IMMUTABLE
  user_id INTEGER REFERENCES users(id),     -- IMMUTABLE
  type VARCHAR(100) NOT NULL,              -- IMMUTABLE
  status VARCHAR(50) DEFAULT 'pending',    -- IMMUTABLE
  input_data JSONB,                         -- IMMUTABLE
  output_data JSONB,                        -- IMMUTABLE
  error_message TEXT,                       -- IMMUTABLE
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- IMMUTABLE
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP  -- IMMUTABLE
);

-- memories table structure CANNOT change
CREATE TABLE memories (
  id SERIAL PRIMARY KEY,                   -- IMMUTABLE
  user_id INTEGER REFERENCES users(id),     -- IMMUTABLE
  filename VARCHAR(255) NOT NULL,          -- IMMUTABLE
  content JSONB NOT NULL,                   -- IMMUTABLE
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- IMMUTABLE
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- IMMUTABLE
  UNIQUE(user_id, filename)                -- IMMUTABLE
);
```

#### Column Constraints (IMMUTABLE)
- **No new columns** can be added to core tables
- **No column types** can be changed
- **No constraint removal** permitted
- **Foreign key relationships** are immutable

### 3. API Contract

#### Authentication Endpoints (IMMUTABLE)
```http
POST /api/auth/login
POST /api/auth/register (future extension)
```

#### Job Management Endpoints (IMMUTABLE)
```http
GET    /api/jobs
POST   /api/jobs
GET    /api/jobs/:id
DELETE /api/jobs/:id
```

#### System Status Endpoints (IMMUTABLE)
```http
GET /api/adapters/status
GET /health
```

#### Request/Response Formats (IMMUTABLE)
```javascript
// Job Creation Request (IMMUTABLE)
{
  "message": "string (required)",
  "type": "string (optional)"
}

// Job Response (IMMUTABLE)
{
  "id": "uuid",
  "status": "pending|analyzing|planning|executing|completed|failed",
  "message": "string",
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}

// Authentication Response (IMMUTABLE)
{
  "token": "JWT string",
  "user": {
    "id": "number",
    "username": "string",
    "role": "string"
  }
}
```

### 4. Environment Variable Contract

#### Required Variables (IMMUTABLE)
```bash
# Core Infrastructure (IMMUTABLE)
DATABASE_URL=          # PostgreSQL connection (required)
REDIS_URL=             # Redis connection (required)
JWT_SECRET=            # JWT signing secret (required)
INTERNAL_API_KEY=      # Service authentication (required)

# Service Configuration (IMMUTABLE)
API_URL=               # UI service API URL (required)
DEFAULT_ADMIN_PASSWORD= # Default admin user (required)

# Optional Adapters (IMMUTABLE structure)
OLLAMA_URL=            # LLM adapter endpoint (optional)
DOCKER_HOST=           # Docker daemon socket (optional)
DATA_DIR=              # Persistent data directory (optional)
```

#### Variable Validation Rules (IMMUTABLE)
- **Required variables** must exist or service exits
- **No fallback values** permitted in production
- **Environment-specific values** allowed (dev/staging/prod)
- **No new required variables** without governance approval

### 5. Job Processing Contract

#### Job Lifecycle (IMMUTABLE)
```
pending → analyzing → planning → executing → completed
    ↓         ↓         ↓          ↓
  failed    failed    failed     failed
```

#### Job Pipeline (IMMUTABLE)
```javascript
// Pipeline stages CANNOT change
1. analyzeIntent(message)     // IMMUTABLE
2. createPlan(intent)         // IMMUTABLE  
3. executeStep(jobId, step)   // IMMUTABLE
4. verifyResults(jobId, step) // IMMUTABLE
```

#### Job Status Values (IMMUTABLE)
- `pending` - Job queued, not started
- `analyzing` - Intent analysis in progress
- `planning` - Execution plan creation
- `executing` - Plan execution active
- `completed` - Job finished successfully
- `failed` - Job terminated with error

### 6. WebSocket Contract

#### Connection Endpoint (IMMUTABLE)
```
ws://api-service:3011
```

#### Message Types (IMMUTABLE)
```javascript
// Client → Server (IMMUTABLE)
{
  "type": "subscribe_logs",
  "jobId": "uuid"
}

// Server → Client (IMMUTABLE)
{
  "type": "job_start|step_start|step_complete|step_error|job_complete|job_failed",
  "jobId": "uuid",
  "data": {...}
}
```

### 7. Redis Data Structure Contract

#### Keys (IMMUTABLE)
```
job_queue              # List - FIFO job queue
job:{jobId}            # Hash - Job state data
memory:{user}:{file}   # Hash - User memory files
```

#### Data Formats (IMMUTABLE)
```javascript
// Job Queue Items (IMMUTABLE)
{
  "id": "uuid",
  "message": "string",
  "type": "string",
  "user_id": "number",
  "created_at": "ISO8601"
}

// Job State Hash (IMMUTABLE)
{
  "data": "JSON string",
  "updated_at": "ISO8601"
}
```

---

## 🔒 EXTENSION POINTS (CONTROLLED)

### 1. Adapter Interface (CONTROLLED)
New adapters must implement:
```javascript
// Adapter Interface (IMMUTABLE signature)
async function adapterFunction(input, context) {
  // Must return: { success: boolean, data: any, error?: string }
  // Must handle errors gracefully
  // Must not crash core platform
}
```

### 2. Job Types (CONTROLLED)
New job types require:
- Unique type identifier
- Handler function in worker
- Database compatibility
- UI support

### 3. Memory File Types (CONTROLLED)
New memory file types:
- Must be JSON-serializable
- Must follow naming convention
- Must be user-scoped

---

## 🚫 FORBIDDEN CHANGES

### Absolutely Forbidden (BREAKS CONTRACT)
- ❌ Changing table schemas
- ❌ Removing required environment variables
- ❌ Changing API endpoint paths
- ❌ Modifying WebSocket message format
- ❌ Altering job status values
- ❌ Changing Redis key structure
- ❌ Removing core services
- ❌ Breaking authentication flow

### Governance Required (MAY BREAK CONTRACT)
- 🔄 Adding new required environment variables
- 🔄 Adding new API endpoints
- 🔄 Changing job pipeline stages
- 🔄 Modifying service communication patterns
- 🔄 Adding new database tables

### Extensions Allowed (DOESN'T BREAK CONTRACT)
- ✅ Adding optional environment variables
- ✅ Adding new job types
- ✅ Adding new adapters
- ✅ Enhancing UI without API changes
- ✅ Adding new memory file types

---

## 🛡️ COMPLIANCE ENFORCEMENT

### Automated Checks
- **Database Schema Validation**: Compare deployed schema to contract
- **API Contract Testing**: Endpoint existence and format validation
- **Environment Variable Audit**: Required variable presence checking
- **WebSocket Message Validation**: Message format compliance

### Manual Reviews
- **Architecture Change Review**: Any structural modifications
- **Security Impact Assessment**: Authentication/authorization changes
- **Performance Impact Review**: Resource usage changes
- **Migration Compatibility**: Data format changes

### Violation Consequences
- **Contract Violation**: Immediate rollback required
- **Breaking Change**: Full governance review mandatory
- **Security Violation**: Immediate security incident response
- **Performance Degradation**: Performance review and optimization

---

## 📋 VERSION CONTROL

### Contract Versioning
- **Major Version**: Breaking changes (1.0.0 → 2.0.0)
- **Minor Version**: Non-breaking additions (1.0.0 → 1.1.0)
- **Patch Version**: Bug fixes only (1.0.0 → 1.0.1)

### Freeze Tags
- **core-freeze-v1.0.0**: Initial platform freeze
- **core-freeze-v1.0.1**: Security patches only
- **core-freeze-v1.1.0**: Controlled extensions

### Backward Compatibility
- **API Compatibility**: Must support previous major version
- **Database Compatibility**: Migration scripts required
- **Environment Compatibility**: Graceful handling of missing variables

---

## 🎯 GOVERNANCE PROCESS

### Change Proposal
1. **Impact Assessment**: Contract violation analysis
2. **Risk Evaluation**: Security and performance impact
3. **Stakeholder Review**: Cross-team approval required
4. **Implementation Planning**: Migration and rollback strategy
5. **Testing Requirements**: Comprehensive test suite

### Approval Requirements
- **Core Changes**: 100% stakeholder consensus
- **Extension Changes**: Majority stakeholder approval
- **Security Changes**: Security team mandatory review
- **Performance Changes**: Performance team sign-off

### Implementation Process
1. **Feature Branch**: Isolated development environment
2. **Contract Tests**: Automated compliance validation
3. **Integration Testing**: Full platform testing
4. **Security Review**: Security team validation
5. **Governance Approval**: Final change approval
6. **Deployment**: Controlled rollout with monitoring
7. **Verification**: Post-deployment contract validation

---

## ⚖️ LEGAL AND COMPLIANCE

### Intellectual Property
- **Core Platform**: Collective ownership
- **Extensions**: Contributor ownership with platform license
- **Contract Changes**: Governance board approval required

### Compliance Requirements
- **Data Protection**: GDPR/CCPA compliance maintained
- **Security Standards**: Industry security practices
- **Audit Requirements**: Full audit trail maintenance
- **Documentation**: Complete change documentation

### Support and Maintenance
- **SLA Commitments**: Platform availability guarantees
- **Security Updates**: Immediate security patch deployment
- **Bug Fixes**: Timely resolution process
- **Documentation**: Always up-to-date with platform state

---

## 📞 CONTACT AND ESCALATION

### Governance Board
- **Platform Architect**: Technical authority
- **Security Lead**: Security compliance authority
- **Performance Lead**: Performance optimization authority
- **Product Lead**: User experience authority

### Escalation Process
1. **Contract Question**: Direct to relevant authority
2. **Change Proposal**: Submit governance board
3. **Urgent Security**: Immediate security team escalation
4. **Performance Issue**: Performance team assessment

### Documentation Updates
- **Contract Changes**: Immediate documentation update
- **New Extensions**: Extension documentation required
- **Security Updates**: Security bulletin publication
- **Performance Changes**: Performance impact documentation

---

**This contract is legally binding for all platform modifications. Violations may result in immediate rollback, access revocation, or other remedial actions.**

**Last Updated:** 2025-01-31  
**Next Review:** 2025-07-31  
**Review Frequency:** Every 6 months  

**Contract Status:** 🟢 ACTIVE - FREEZE ELIGIBLE

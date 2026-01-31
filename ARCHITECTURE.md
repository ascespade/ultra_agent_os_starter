# Ultra Agent OS - Architecture Documentation

## Runtime Architecture Truth

This document describes the **actual runtime architecture** of Ultra Agent OS as deployed in production. No assumptions, no future plans - only what exists and executes today.

## Core Services Architecture

### Service Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                    Railway Platform                            │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   UI Service    │   API Service   │      Worker Service         │
│   apps/ui/      │   apps/api/     │      apps/worker/           │
│   server.js     │   server.js     │      worker.js              │
│   Port: Dynamic │   Port: 3000    │      Port: Dynamic          │
└─────────────────┴─────────────────┴─────────────────────────────┘
         │                   │                     │
         └───────────────────┼─────────────────────┘
                             │
         ┌─────────────────────────────────────────────────┐
         │              Data Layer                         │
         ├─────────────────┬───────────────────────────────┤
         │   PostgreSQL    │            Redis               │
         │   DATABASE_URL  │         REDIS_URL              │
         │   Port: 5432    │         Port: 6379             │
         │   Jobs/Users    │     Queue/Cache/WebSocket      │
         └─────────────────┴───────────────────────────────┘
```

### Service Responsibilities

#### API Service (`apps/api/src/server.js`)
**Primary Functions:**
- HTTP API endpoints for job management
- JWT authentication and user management
- WebSocket server for real-time updates (port 3011)
- Database connection pooling and migrations
- Redis client for job queue operations

**Runtime Behavior:**
- Starts Express server on dynamic PORT (Railway-assigned)
- Initializes PostgreSQL connection pool with 20 max connections
- Creates WebSocket server on fixed port 3011 for job updates
- Executes database migrations on startup
- Requires all environment variables or exits with error

#### Worker Service (`apps/worker/src/worker.js`)
**Primary Functions:**
- Redis job queue consumer
- Job processing pipeline (analyze → plan → execute → verify)
- Adapter integration (LLM, Docker)
- Real-time job status updates

**Runtime Behavior:**
- Connects to Redis and subscribes to job queue
- Processes jobs sequentially with 60-second timeout
- Updates job status in both database and Redis
- Broadcasts log updates via WebSocket to API service

#### UI Service (`apps/ui/src/server.js`)
**Primary Functions:**
- Static file serving for admin dashboard
- API URL injection for frontend
- Environment endpoint for dynamic configuration

**Runtime Behavior:**
- Serves static files from `/apps/ui/src/`
- Provides `/env.js` endpoint with API_URL injection
- Requires explicit API_URL environment variable

## Data Flow Architecture

### Job Processing Flow

```
1. UI → API: POST /api/jobs (create job)
2. API → DB: INSERT job record
3. API → Redis: LPUSH job_queue
4. Worker ← Redis: BRPOP job_queue
5. Worker → DB: UPDATE job.status = 'analyzing'
6. Worker → API: WebSocket broadcast job status
7. Worker: Execute job pipeline
8. Worker → DB: UPDATE job with results
9. Worker → API: WebSocket broadcast completion
10. UI ← API: WebSocket update UI state
```

### Authentication Flow

```
1. UI → API: POST /api/auth/login
2. API → DB: SELECT user credentials
3. API: bcrypt.compare password verification
4. API: jwt.sign token with user data
5. API → UI: Return JWT token
6. UI: Store token for subsequent requests
7. UI → API: Authorization: Bearer <token>
8. API: jwt.verify token on protected routes
```

### Real-time Communication

```
WebSocket Server (API:3011) ←→ UI Clients
├── subscribe_logs (jobId)
├── job_start (jobId, message)
├── step_start (stepId, description)
├── step_complete (stepId, result)
├── step_error (stepId, error)
├── job_complete (jobId, results)
└── job_failed (jobId, error)
```

## Database Schema

### PostgreSQL Tables

#### users Table
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### jobs Table
```sql
CREATE TABLE jobs (
  id VARCHAR(36) PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  type VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  input_data JSONB,
  output_data JSONB,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### memories Table
```sql
CREATE TABLE memories (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  filename VARCHAR(255) NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, filename)
);
```

### Redis Data Structures

#### Job Queue
```
job_queue (List) - FIFO job processing queue
├── LPUSH: Add new job to queue
└── BRPOP: Worker blocks waiting for jobs
```

#### Job State
```
job:{jobId} (Hash) - Real-time job data
├── data: JSON job object with status
└── updated_at: Last modification timestamp
```

#### Memory Storage
```
memory:{tenant}:{filename} (Hash) - File-based memory
├── content: JSON memory data
└── updated_at: Last modification timestamp
```

## Environment Contract

### Required Environment Variables

#### API Service
- `DATABASE_URL`: PostgreSQL connection string (required)
- `REDIS_URL`: Redis connection string (required)
- `JWT_SECRET`: JWT signing secret (required)
- `INTERNAL_API_KEY`: Service authentication (required)
- `DEFAULT_ADMIN_PASSWORD`: Default admin user (required)
- `DATA_DIR`: Persistent data directory (optional, defaults to './data')
- `OLLAMA_URL`: LLM adapter endpoint (optional)
- `DOCKER_HOST`: Docker daemon socket (optional)

#### Worker Service
- `DATABASE_URL`: PostgreSQL connection string (required)
- `REDIS_URL`: Redis connection string (required)
- `INTERNAL_API_KEY`: Service authentication (required)
- `DATA_DIR`: Persistent data directory (optional, defaults to '/data/agent')
- `OLLAMA_URL`: LLM adapter endpoint (optional)
- `DOCKER_HOST`: Docker daemon socket (optional)

#### UI Service
- `API_URL`: API service URL (required)
- `PORT`: UI service port (optional, Railway-assigned)

### Runtime Environment Guards

All services implement **strict environment validation**:

```javascript
// Example from API service
if (!DATABASE_URL) {
  console.error('[CRITICAL] DATABASE_URL environment variable is required');
  process.exit(1);
}
```

## Adapter Architecture

### LLM Adapter (Optional)
**Integration Point:** `callLLM()` function in worker
**Protocol:** HTTP POST to `${OLLAMA_URL}/api/generate`
**Fallback:** Returns null, continues with core logic
**Error Handling:** Graceful degradation, logs unavailability

### Docker Adapter (Optional)
**Integration Point:** `executeCommand()` function in worker
**Protocol:** Dockerode client connection
**Fallback:** Queues command for manual execution
**Error Handling:** Continues job processing without execution

### Adapter Detection Logic
```javascript
// Current implementation (post-sanitization)
const ollamaAvailable = process.env.OLLAMA_URL && process.env.OLLAMA_URL.trim() !== '';
const dockerAvailable = process.env.DOCKER_HOST && process.env.DOCKER_HOST.trim() !== '';
```

## Security Architecture

### Authentication
- **JWT Tokens**: 24-hour expiration, HS256 signing
- **Password Hashing**: bcrypt with 10 salt rounds
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Input Validation**: Comprehensive request sanitization

### Authorization
- **Protected Routes**: All `/api/*` endpoints require JWT
- **User Context**: Token contains userId, username, role
- **Admin Role**: Default 'admin' role for default user

### Network Security
- **Internal Communication**: Service-to-service via Railway networking
- **External Access**: Only API and UI exposed to internet
- **Database Access**: Restricted to internal services only

## Failure Modes

### Service Startup Failures
- **Missing Environment Variables**: Immediate process.exit(1)
- **Database Connection Failure**: Process exits after logging error
- **Redis Connection Failure**: Process exits after logging error

### Runtime Failures
- **Job Processing Timeout**: 60-second timeout, marked as failed
- **WebSocket Connection Loss**: Client reconnects on next interaction
- **Adapter Unavailability**: Graceful degradation, core continues

### Database Failures
- **Connection Pool Exhaustion**: Queries fail with error logging
- **Migration Failures**: Process exits, prevents inconsistent state
- **Query Failures**: Error logged, operation fails gracefully

## Performance Characteristics

### Concurrency
- **API Service**: 20 concurrent database connections
- **Worker Service**: Sequential job processing (single worker)
- **WebSocket Server**: Unlimited client connections
- **Redis Client**: Single connection per service

### Resource Limits
- **Job Timeout**: 60 seconds maximum execution time
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Memory Usage**: Dynamic based on job complexity
- **Storage**: Persistent file system for memory files

### Scaling Behavior
- **Horizontal Scaling**: Multiple API/UI instances possible
- **Worker Scaling**: Single worker instance (job queue serialized)
- **Database Scaling**: Managed by Railway PostgreSQL
- **Redis Scaling**: Managed by Railway Redis

## Monitoring and Observability

### Health Endpoints
- `/health`: Basic service health (API only)
- `/api/adapters/status`: Comprehensive system status
- WebSocket: Real-time job and system updates

### Logging
- **Structured Logging**: Component-prefixed log messages
- **Error Logging**: Full error context with stack traces
- **Job Logging**: Step-by-step job execution logs
- **Security Logging**: Authentication and authorization events

### Metrics (Manual)
- Job creation and completion rates
- Adapter availability status
- Database and Redis connection health
- Authentication success/failure rates

## Deployment Architecture

### Railway Platform Integration
- **Service Discovery**: Automatic internal DNS resolution
- **Environment Injection**: Railway provides DATABASE_URL, REDIS_URL
- **Health Checks**: Railway monitors service health endpoints
- **Automatic Scaling**: Railway handles horizontal scaling

### Container Configuration
- **Base Image**: node:20-alpine for all services
- **Working Directory**: /app for all containers
- **Port Exposure**: Dynamic port assignment by Railway
- **Volume Mounts**: Persistent data directory for memories

---

This architecture documentation reflects the **actual runtime behavior** of Ultra Agent OS as deployed today. Any deviation between this document and the running system indicates a deployment inconsistency that must be resolved.

# Ultra Agent OS - Core Platform

[![Freeze Status](https://img.shields.io/badge/freeze-pending-orange)](https://github.com/ascespade/ultra_agent_os_starter)
[![Runtime](https://img.shields.io/badge/runtime-production-blue)](https://railway.app/template/ultra-agent-core-blueprint)

## Executive Summary

Ultra Agent OS is a **production-grade, multi-tenant agent platform** designed for enterprise deployment. The platform provides real-time job processing, persistent storage, and extensible adapter architecture with zero-configuration deployment on Railway.

### Core Capabilities

- **Real-time Job Processing**: WebSocket-powered job execution with live status updates
- **Multi-tenant Architecture**: Strict tenant isolation with scoped data and quotas
- **Enterprise Security**: JWT authentication, rate limiting, and audit logging
- **Adapter Ecosystem**: Pluggable LLM and Docker execution adapters
- **Production Ready**: PostgreSQL, Redis, and comprehensive health monitoring

### Quick Start

```bash
# Deploy to Railway (Zero Configuration)
git clone https://github.com/ascespade/ultra_agent_os_starter
cd ultra_agent_os_starter
railway up
```

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   UI Service    │    │   API Service   │    │  Worker Service │
│   (Express)     │◄──►│   (Express)     │◄──►│   (Node.js)     │
│ Port: Dynamic   │    │ Port: Dynamic   │    │ Job Processing  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   PostgreSQL    │
                    │   (Jobs/Users)  │
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │      Redis      │
                    │  (Queue/Cache)  │
                    └─────────────────┘
```

## Services

### API Service (`apps/api`)
- **Authentication**: JWT-based user management
- **Job Management**: Create, monitor, and manage agent jobs
- **Adapter Status**: Real-time system health monitoring
- **WebSocket**: Live job updates and log streaming

### Worker Service (`apps/worker`)
- **Job Processing**: Intent analysis, planning, and execution
- **Adapter Integration**: LLM and Docker execution adapters
- **State Management**: Real-time job status synchronization
- **Error Handling**: Comprehensive error recovery and logging

### UI Service (`apps/ui`)
- **Admin Dashboard**: Real-time system monitoring
- **Job Interface**: Interactive job creation and tracking
- **Adapter Status**: Live system health display
- **Log Streaming**: WebSocket-powered real-time logs

## Environment Variables

### Required Variables

| Variable | Service | Description |
|----------|---------|-------------|
| `DATABASE_URL` | API, Worker | PostgreSQL connection string |
| `REDIS_URL` | API, Worker | Redis connection string |
| `JWT_SECRET` | API | JWT signing secret |
| `INTERNAL_API_KEY` | API, Worker | Internal service authentication |
| `API_URL` | UI | API service URL |
| `DEFAULT_ADMIN_PASSWORD` | API | Default admin user password |

### Optional Variables

| Variable | Service | Description |
|----------|---------|-------------|
| `OLLAMA_URL` | Worker | LLM adapter endpoint |
| `DOCKER_HOST` | Worker | Docker daemon socket |
| `DATA_DIR` | API, Worker | Persistent data directory |

## Railway Deployment

The platform is **Railway-native** with zero-configuration deployment:

```json
{
  "services": [
    {
      "name": "ultra-agent-api",
      "dockerfilePath": "apps/api/Dockerfile"
    },
    {
      "name": "ultra-agent-worker", 
      "dockerfilePath": "apps/worker/Dockerfile"
    },
    {
      "name": "ultra-agent-ui",
      "dockerfilePath": "apps/ui/Dockerfile"
    }
  ],
  "databases": {
    "Postgres": {
      "version": "15",
      "generator": "POSTGRESQL"
    }
  },
  "redis": {
    "version": "7",
    "generator": "REDIS"
  }
}
```

### Automatic Features

- ✅ **Auto-generated secrets** for all required environment variables
- ✅ **Automatic database provisioning** with migrations
- ✅ **Service discovery** with internal networking
- ✅ **Health checks** with automatic restarts
- ✅ **Zero manual configuration** required

## Security Model

### Authentication
- **JWT Tokens**: 24-hour expiration with secure signing
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Input Validation**: Comprehensive request sanitization
- **Security Headers**: Helmet.js protection suite

### Data Protection
- **Tenant Isolation**: Strict data segregation by tenant
- **Encryption**: All secrets encrypted at rest
- **Audit Logging**: Complete action audit trail
- **Secure Defaults**: No development fallbacks

## Adapter System

### LLM Adapter (Optional)
```javascript
// Enable LLM enhancement
process.env.OLLAMA_URL = "https://your-ollama-instance.com"
```

### Docker Adapter (Optional)
```javascript
// Enable container execution
process.env.DOCKER_HOST = "unix:///var/run/docker.sock"
```

Both adapters **fail safely** - core functionality remains operational without external dependencies.

## API Reference

### Authentication
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your-secure-password"
}
```

### Job Management
```http
POST /api/jobs
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "Analyze system performance",
  "type": "analysis"
}
```

### System Status
```http
GET /api/adapters/status
Authorization: Bearer <token>
```

## Development

### Local Development
```bash
# Start services locally
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit with your values
nano .env
```

## Multi-Tenant Architecture

### Tenant Context
All operations require explicit tenant context:
```javascript
// Tenant-scoped job creation
const job = await createJob({
  tenantId: 'tenant-123',
  message: 'Tenant-specific task',
  type: 'analysis'
});
```

### Data Isolation
- **Database**: Row-level security with tenant_id
- **Redis**: Tenant-prefixed keys
- **File System**: Tenant-isolated directories
- **Jobs**: Tenant-scoped execution contexts

## Monitoring

### Health Endpoints
- `/health` - Service health status
- `/api/adapters/status` - System component status
- WebSocket logs - Real-time job streaming

### Metrics
- Job throughput and success rates
- Adapter availability and response times
- Resource utilization and queue depths
- Authentication and security events

## Troubleshooting

### Common Issues

**Service won't start**
- Check all required environment variables
- Verify database and Redis connectivity
- Review service logs for specific errors

**Jobs stuck in queue**
- Check worker service health
- Verify Redis connection
- Review adapter availability

**Authentication failures**
- Verify JWT_SECRET is set
- Check token expiration
- Review user creation logs

### Debug Mode
```bash
# Enable debug logging
DEBUG=ultra-agent:* railway up
```

## Support

- **Documentation**: [Core Contract](./CORE_CONTRACT.md)
- **Issues**: [GitHub Issues](https://github.com/ascespade/ultra_agent_os_starter/issues)
- **Community**: [Discussions](https://github.com/ascespade/ultra_agent_os_starter/discussions)

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

**Ultra Agent OS** - Production-grade agent platform for enterprise deployment.

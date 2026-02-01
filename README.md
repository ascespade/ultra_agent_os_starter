# Ultra Agent OS - Railway Multi-Service Deployment

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/ascespade/ultra_agent_os_starter)

MiniMax-like Agent OS with API, Dashboard, Worker, PostgreSQL & Redis deployed on Railway.

## 🏗️ Architecture

### Services (5 total)
1. **ultra-agent-api** - Core Backend API (Authentication, orchestration, WebSocket)
2. **ultra-agent-ui** - Dashboard Frontend (4-panel MiniMax-like interface)
3. **ultra-agent-worker** - Background Worker (Job execution, processing)
4. **ultra-agent-db** - PostgreSQL Database (Persistent storage)
5. **ultra-agent-redis** - Redis Cache (Cache, queue, locks)

### Service Connections
- API → DB + Redis
- UI → API
- Worker → DB + API

## 🚀 Quick Start

### One-Command Setup
```bash
make setup
```

### Deploy Changes
```bash
make deploy
```

### Monitor Logs
```bash
make logs
```

### Check Status
```bash
make status
```

## 📁 Project Structure
```
ultra-agent-os/
├── railway.toml              # Railway configuration (5 services)
├── .railwayignore            # Files to ignore in Railway builds
├── Makefile                  # One-command deployment
├── package.json              # Railway scripts + dependencies
├── config/
│   ├── database.js           # Auto-detect database config
│   └── env.js                # Environment configuration
├── lib/
│   └── db-connector.js       # Universal database connector
├── scripts/
│   ├── railway-setup.js      # Automated Railway setup
│   └── migrate.js            # Database migrations
├── apps/
│   ├── api/                  # API service
│   ├── ui/                   # Dashboard service
│   └── worker/               # Worker service
└── Dockerfile.*              # Individual service Dockerfiles
```

## 🔧 Configuration

### Railway.toml Features
- ✅ Auto-generated secrets (JWT_SECRET, INTERNAL_API_KEY)
- ✅ Service-to-service variable linking
- ✅ Managed PostgreSQL + Redis
- ✅ Health checks and restart policies
- ✅ Volume mounts for data persistence

### Environment Variables
All variables are automatically injected by Railway:
- `DATABASE_URL` from ultra-agent-db
- `REDIS_URL` from ultra-agent-redis
- `API_INTERNAL_URL` for UI → API communication
- Auto-generated secrets for security

## 📊 Health Checks

### API Health Endpoint
```bash
curl https://your-api-url.railway.app/health
```

### Service Status
```bash
make health
```

## 🛠️ Development

### Local Development
```bash
npm run install:all
npm start
```

### Database Migrations
```bash
npm run db:migrate
```

### Railway Environment
```bash
npm run railway:logs
npm run railway:status
```

## 🚨 Troubleshooting

### Common Issues
1. **Build fails**: Check `.railwayignore` excludes node_modules
2. **Database connection**: Verify `DATABASE_URL` is injected
3. **Service communication**: Check internal service URLs
4. **Health checks**: Ensure `/health` endpoint returns 200

### Debug Commands
```bash
# View build logs
railway logs --build

# View service logs
railway logs --service ultra-agent-api

# Check environment variables
railway variables --service ultra-agent-api
```

## 📚 Documentation

- [Railway Docs](https://docs.railway.app/)
- [Railway CLI](https://docs.railway.app/develop/cli)
- [Multi-Service Guide](https://docs.railway.app/deploy/monorepo)

## 🎯 Deployment Flow

1. **Import Repository** → Railway reads railway.toml
2. **Auto-Provision Services** → Creates 5 services automatically
3. **Variable Injection** → Links services with environment variables
4. **Deploy** → Builds and deploys all services
5. **Health Checks** → Monitors service health
6. **Ready** → All services online and connected

## 🔄 Auto-Deploy

Every push to main branch triggers automatic deployment:
- Git push → Railway detects changes
- Build services → Apply railway.toml config
- Deploy → Update running services
- Monitor → Health checks verify deployment

---

**Status**: ✅ Railway Ready - 5 Services Configured
**Deploy**: `make deploy`
**Monitor**: `make logs`
// Force deployment Sun Feb  1 05:17:28 AM UTC 2026

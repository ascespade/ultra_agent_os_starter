# Railway Deployment Guide

## Repository Structure
```
ultra-agent-os/
├── apps/
│   ├── api/          # Main API service
│   ├── worker/       # Background job worker
│   └── ui/           # Frontend UI
├── railway.json      # Railway configuration
└── package.json      # Workspace configuration
```

## Railway Services Configuration

### 1. API Service
- **Source**: `apps/api` directory
- **Port**: `process.env.PORT` (Railway assigns automatically)
- **Environment Variables**:
  - `REDIS_URL` (Railway Redis plugin)
  - `JWT_SECRET` (generate secure secret)
  - `DATA_DIR` (optional, for persistent storage)

### 2. Worker Service
- **Source**: `apps/worker` directory
- **Port**: No public port needed
- **Environment Variables**:
  - `REDIS_URL` (Railway Redis plugin)
  - `DATA_DIR` (optional, for persistent storage)
  - `OLLAMA_URL` (if using external Ollama)

### 3. UI Service
- **Source**: `apps/ui` directory
- **Port**: `process.env.PORT` (Railway assigns automatically)
- **Environment Variables**:
  - `API_URL` (Railway will inject: `${api_service_url}`)

### 4. Redis Plugin
- Add Redis plugin from Railway marketplace
- Railway will inject `REDIS_URL` automatically

## Deployment Steps

1. **Create Railway Project**
   ```bash
   railway login
   railway new ultra-agent-os
   railway link
   ```

2. **Add Services**
   - API: Select `apps/api` directory
   - Worker: Select `apps/worker` directory  
   - UI: Select `apps/ui` directory

3. **Add Redis Plugin**
   - Go to project settings
   - Add Redis plugin from marketplace

4. **Configure Environment Variables**
   - API Service: `JWT_SECRET` (generate secure value)
   - UI Service: `API_URL=${api_service_url}`

5. **Deploy**
   ```bash
   git add .
   git commit -m "Refactor for Railway deployment"
   git push origin main
   ```

## Railway-Specific Features

✅ **Auto-provisioning**: Services deploy automatically on repo import
✅ **Dynamic Ports**: Uses `process.env.PORT` for Railway port assignment
✅ **Service Discovery**: Uses Railway's `${service_name}_URL` pattern
✅ **Managed Redis**: Uses Railway Redis plugin instead of container
✅ **Individual Dockerfiles**: Each service has its own Dockerfile
✅ **No docker-compose**: Railway handles service orchestration

## Verification

After deployment, verify:
- API health endpoint responds
- UI loads and connects to API
- Worker processes jobs (check Redis)
- All services show healthy status in Railway dashboard

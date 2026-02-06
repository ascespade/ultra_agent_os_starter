# Ultra Agent OS - Project Structure

## 📁 Directory Organization

### **Root Level**
- `README.md` - Project overview and quick start
- `DOCUMENTATION.md` - Complete project documentation
- `package.json` - Monorepo configuration
- `docker-compose.yml` - Local development setup
- `railway.toml` - Production deployment config
- `.env.example` - Environment template

### **Applications** (`apps/`)
- `api/` - REST API service
- `worker/` - Job processing service  
- `ui/` - Professional dashboard

### **Core Libraries** (`lib/`)
- `db-connector.js` - Database connection and migrations
- `llm/` - LLM provider registry and services
- `migrations/` - Database schema migrations
- `rate-limiter.js` - API rate limiting

### **Scripts** (`scripts/`)
- `normalize-project.sh` - Project structure validation
- `test-railway-ui.sh` - Railway UI testing
- Phase validation scripts
- Health check and monitoring scripts

### **Tests** (`tests/`)
- Functional test suites
- Production validation tests
- Load testing scripts

### **Configuration** (`config/`)
- Environment configurations
- Deployment settings

## 🎯 Key Files

### **Production Documentation**
- `DOCUMENTATION.md` - Complete project documentation
- `GOVERNED_FREEZE_LOCK.md` - Production freeze status
- `PROJECT_HEALTH_REPORT.md` - System health monitoring

### **Phase Reports** (Consolidated into DOCUMENTATION.md)
- All phase reports merged into main documentation
- Historical progress preserved in git history

### **Deployment**
- Railway: All services operational
- Local: Docker Compose setup
- Production: Governed freeze active

## 🚀 Quick Start

```bash
# Local Development
docker-compose up -d

# Access Services
# Dashboard: http://localhost:3003
# API: http://localhost:3000
# Worker: http://localhost:3004
```

## 📊 System Status

- **Version**: v1.0.0-STABLE
- **Score**: 98/100 (Exceptional)
- **Status**: Production Ready
- **Repository**: Under Governed Freeze

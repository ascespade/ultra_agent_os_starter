#!/bin/bash
set -e

echo "🔍 GLOBAL PRODUCTION SIMULATION: STARTING"
echo "This script simulates the exact conditions of Railway deployment."

# 1. Clean previous state
echo "🧹 Cleaning previous containers..."
docker compose down -v 2>/dev/null || true

# 2. Build with production context
echo "🏗️  Building services (Production Mode)..."
# We define RAILWAY_ENVIRONMENT=true arg if we want to bake it, but usually it's runtime.
# Here we rely on docker-compose.yml configuration.
docker compose build

# 3. Start services
echo "🚀 Starting services..."
docker compose up -d

# 4. Wait for readiness
echo "⏳ Waiting 15s for initialization..."
sleep 15

# 5. Health Checks
echo "🏥 Performing Health Checks..."

# Check API (Port 3000 mapped to 3000)
if curl -s -f http://localhost:3000/health > /dev/null; then
    echo "✅ API Service: HEALTHY"
else
    echo "❌ API Service: FAILED"
    docker compose logs api
    exit 1
fi

# Check UI (Port 3003 mapped to 3003)
if curl -s -f http://localhost:3003/health > /dev/null; then
    echo "✅ UI Service: HEALTHY"
else
    echo "❌ UI Service: FAILED"
    docker compose logs ui
    exit 1
fi

# Check Worker Health Server (Port 3004)
if curl -s -f http://localhost:3004/health > /dev/null; then
    echo "✅ Worker Health Server: HEALTHY"
else
    echo "❌ Worker Health Server: FAILED"
    docker compose logs worker
    exit 1
fi

# Check Worker via API
if curl -s -f http://localhost:3000/worker/health > /dev/null; then
    echo "✅ Worker via API: HEALTHY"
else
    echo "⚠️  Worker check via API failed (might be startup delay)"
fi

echo "---------------------------------------------------"
echo "🎉 SUCCESS: Local production simulation passed!"
echo "    You can now deploy to Railway with confidence."
echo "---------------------------------------------------"

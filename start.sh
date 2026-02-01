#!/bin/bash

# Ultra Agent OS - Startup Script
# Starts all services with correct ports

echo "🚀 Starting Ultra Agent OS..."

# Kill existing processes
pkill -f "node.*server.js" 2>/dev/null || true
pkill -f "node.*worker.js" 2>/dev/null || true

# Wait for cleanup
sleep 2

# Clear port cache
rm -f .port-cache.json

# Start API Server
echo "📡 Starting API Server on 3003..."
cd apps/api
JWT_SECRET=test-jwt-secret-for-functional-testing-only \
REDIS_URL=redis://localhost:6379 \
DATABASE_URL=postgres://postgres:password@localhost:5432/ultra_agent \
PORT=3003 \
WS_PORT=3011 \
node src/server.js > ../../api.log 2>&1 &
API_PID=$!

# Wait for API to start
sleep 3

# Start UI Server
echo "🖥️  Starting UI Server on 8088..."
cd ../ui
API_URL=http://localhost:3003 \
PORT=8088 \
UI_PORT=8088 \
node src/server.js > ../../ui.log 2>&1 &
UI_PID=$!

# Start Worker
echo "⚡ Starting Worker..."
cd ../worker
API_URL=http://localhost:3003 \
REDIS_URL=redis://localhost:6379 \
DATABASE_URL=postgres://postgres:password@localhost:5432/ultra_agent \
node src/worker.js > ../../worker.log 2>&1 &
WORKER_PID=$!

# Wait for services to start
sleep 5

echo ""
echo "✅ Ultra Agent OS Started!"
echo ""
echo "🌐 Main UI:        http://localhost:8088/"
echo "🔧 Admin Dashboard: http://localhost:8088/?admin=true"
echo "📡 API Server:     http://localhost:3003/"
echo "💬 WebSocket:      ws://localhost:3011/"
echo ""
echo "📊 Process IDs:"
echo "   API: $API_PID"
echo "   UI:  $UI_PID" 
echo "   Worker: $WORKER_PID"
echo ""
echo "📋 Logs:"
echo "   API:    tail -f api.log"
echo "   UI:     tail -f ui.log"
echo "   Worker: tail -f worker.log"

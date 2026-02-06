FROM node:20-alpine

WORKDIR /app

# Preserve repo structure for require('../../../lib/...') paths
COPY lib ./lib
COPY config ./config
COPY apps ./apps
COPY package.json package-lock.json* ./

RUN cd apps/worker && npm install --only=production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S workeruser -u 1001
RUN chown -R workeruser:nodejs /app
USER workeruser

WORKDIR /app/apps/worker

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3004) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

EXPOSE 3004 4004

CMD ["node", "src/worker.js"]

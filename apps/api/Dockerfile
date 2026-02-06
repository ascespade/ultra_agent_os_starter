FROM node:20-alpine

WORKDIR /app

# Preserve repo structure for require('../../../lib/...') paths
COPY lib ./lib
COPY apps ./apps
COPY package.json package-lock.json* ./

# Install root deps (pg, redis for lib/db-connector) + API deps
RUN npm install pg redis --omit=dev 2>/dev/null || true
RUN cd apps/api && npm install --omit=dev

WORKDIR /app/apps/api

# Prefer API node_modules for resolution (has pg, redis)
ENV NODE_PATH=/app/apps/api/node_modules

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S apiuser -u 1001
RUN chown -R apiuser:nodejs /app
USER apiuser

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

EXPOSE 3000

CMD ["node", "src/server.js"]

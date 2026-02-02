FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY apps/worker/package*.json ./

# Install dependencies (use install for stability)
RUN npm install --only=production

# Copy source code
COPY apps/worker/src ./apps/worker/src
COPY lib ./lib

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S workeruser -u 1001

# Change ownership of the app directory
RUN chown -R workeruser:nodejs /app
USER workeruser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3004/health || exit 1

EXPOSE 3004 4004

CMD ["node", "apps/worker/src/enterprise-worker.js"]

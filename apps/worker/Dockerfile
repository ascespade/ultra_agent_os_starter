FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY apps/worker/package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy libraries and shared components
COPY lib ./lib
# Copy specifically the Worker source
COPY apps/worker/src ./src

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S workeruser -u 1001

# Change ownership
RUN chown -R workeruser:nodejs /app
USER workeruser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3004/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

EXPOSE 3004 4004

CMD ["node", "src/worker.js"]

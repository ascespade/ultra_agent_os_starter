FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY apps/ws/package*.json ./

# Install dependencies (use install for stability)
RUN npm install --only=production

# Copy source code
COPY apps/ws/src ./apps/ws/src
COPY lib ./lib

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S wsuser -u 1001

# Change ownership of the app directory
RUN chown -R wsuser:nodejs /app
USER wsuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

EXPOSE 3002

CMD ["node", "apps/ws/src/server.js"]

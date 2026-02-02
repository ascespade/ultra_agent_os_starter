FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY apps/api/package*.json ./

# Install dependencies (use install for stability)
RUN npm install --only=production

# Copy source code
COPY apps/api/src ./apps/api/src
COPY apps/ui/src ./apps/ui/src
COPY lib ./lib

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S apiuser -u 1001

# Change ownership of the app directory
RUN chown -R apiuser:nodejs /app
USER apiuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["node", "apps/api/src/server.js"]

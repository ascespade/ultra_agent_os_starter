FROM node:20-alpine

WORKDIR /app

# Copy package files from the root context for this service
COPY apps/api/package*.json ./

# Install dependencies (use ci for faster, more reliable builds if package-lock exists)
RUN npm install --only=production

# Copy libraries and shared components from the root context
COPY lib ./lib
COPY apps/ui/src ./ui/src
# Copy specifically the API source
COPY apps/api/src ./src

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S apiuser -u 1001

# Change ownership
RUN chown -R apiuser:nodejs /app
USER apiuser

# Health check (matches railway.json and app routing)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 8080) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

EXPOSE 8080

CMD ["node", "src/server.js"]

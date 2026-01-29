FROM node:20-alpine

WORKDIR /app

# Install dependencies for all workspaces
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/worker/package*.json ./apps/worker/
COPY apps/ui/package*.json ./apps/ui/

# Install dependencies
RUN npm ci --only=production
RUN cd apps/api && npm ci --only=production
RUN cd apps/worker && npm ci --only=production  
RUN cd apps/ui && npm ci --only=production

# Copy source code
COPY apps/ ./apps/

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start all services
CMD ["npm", "start"]

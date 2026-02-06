FROM node:20-alpine

WORKDIR /app/apps/ui

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --omit=dev

# Copy source files
COPY src ./src

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S uiuser -u 1001
RUN chown -R uiuser:nodejs /app
USER uiuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3003) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

ENV PORT=3003
ENV NODE_ENV=production
EXPOSE 3003

CMD ["node", "src/server.js"]

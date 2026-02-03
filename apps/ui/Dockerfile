# UI Dockerfile - Pure static frontend service
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY apps/ui/package*.json ./
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy UI source files
COPY apps/ui/src ./src

# Build stage
FROM nginx:alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy built UI from builder stage
COPY --from=builder /app/src /usr/share/nginx/html

# Copy nginx configuration
COPY apps/ui/nginx.conf /etc/nginx/conf.d/default.conf

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3003}/health || exit 1

# Default port if not set
ENV PORT=3003

EXPOSE ${PORT}

# Substitute environment variables in nginx config and start nginx
CMD ["sh", "-c", "envsubst '${PORT}' < /etc/nginx/conf.d/default.conf > /tmp/default.conf && mv /tmp/default.conf /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]

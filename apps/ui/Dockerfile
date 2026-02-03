FROM nginx:alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy static files directly
COPY apps/ui/src /usr/share/nginx/html

# Copy nginx configuration
COPY apps/ui/nginx.conf /etc/nginx/conf.d/default.conf

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3003}/health || exit 1

# Default port if not set
ENV PORT=3003

EXPOSE ${PORT}

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

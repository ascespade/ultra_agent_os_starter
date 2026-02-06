# UI - nginx static server (Railway: Root Directory = apps/ui)
FROM nginx:alpine

RUN apk add --no-cache curl gettext

COPY src /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3003}/health || exit 1

ENV PORT=3003
EXPOSE 3003

CMD ["sh", "-c", "envsubst '${PORT}' < /etc/nginx/conf.d/default.conf > /tmp/default.conf && mv /tmp/default.conf /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]

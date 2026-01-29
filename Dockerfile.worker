FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY apps/worker/package*.json ./apps/worker/

RUN npm ci --only=production
RUN cd apps/worker && npm ci --only=production

COPY apps/worker/src ./apps/worker/src

ENV NODE_ENV=production
ENV REDIS_URL=redis://redis:6379
ENV OLLAMA_URL=http://ollama:11434

HEALTHCHECK --interval=15s --timeout=5s --start-period=120s --retries=20 \
  CMD test -f /tmp/worker-health || (ps aux | grep -v grep | grep -E 'worker\.js|node.*worker' > /dev/null && touch /tmp/worker-health) || exit 1

CMD ["node", "apps/worker/src/worker.js"]

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY apps/ui/package*.json ./apps/ui/

RUN npm ci --only=production
RUN cd apps/ui && npm ci --only=production

COPY apps/ui/src ./apps/ui/src

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV API_URL=http://api:3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3000/', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["node", "apps/ui/src/server.js"]

FROM node:20-alpine

WORKDIR /app

# Replicate monorepo layout so require('../../../lib/...') resolves correctly
COPY apps/ui/package*.json ./apps/ui/
RUN cd apps/ui && npm install --omit=dev

COPY apps/ui/src/ ./apps/ui/src/
COPY lib/ ./lib/

WORKDIR /app/apps/ui

EXPOSE 3000

CMD ["npm", "start"]

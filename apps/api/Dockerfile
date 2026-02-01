FROM node:20-alpine

WORKDIR /app

# Replicate monorepo layout so require('../../../lib/...') resolves correctly
COPY apps/api/package*.json ./apps/api/
RUN cd apps/api && npm install --omit=dev

# Install shared lib deps at root so lib/* can resolve pg, etc.
RUN echo '{"dependencies":{"pg":"^8.11.5"}}' > package.json && npm install --omit=dev

COPY apps/api/src/ ./apps/api/src/
COPY lib/ ./lib/
COPY config/ ./config/
COPY plugins/ ./plugins/

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["npm", "start"]

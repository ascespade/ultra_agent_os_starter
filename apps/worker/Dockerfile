FROM node:20-alpine

WORKDIR /app

# Replicate monorepo layout so require('../../../lib/...') resolves correctly
COPY apps/worker/package*.json ./apps/worker/
RUN cd apps/worker && npm install --omit=dev

# Install shared lib deps at root so lib/* can resolve pg, etc.
RUN echo '{"dependencies":{"pg":"^8.11.5"}}' > package.json && npm install --omit=dev

COPY apps/worker/src/ ./apps/worker/src/
COPY lib/ ./lib/
COPY config/ ./config/

WORKDIR /app/apps/worker

CMD ["npm", "start"]

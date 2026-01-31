FROM node:20-alpine

WORKDIR /app

COPY apps/worker/package*.json ./
RUN npm install --only=production

COPY apps/worker/src/ ./src/
COPY lib/ ./lib/

CMD ["npm", "start"]

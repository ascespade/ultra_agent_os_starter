FROM node:20-alpine

WORKDIR /app

COPY apps/api/package*.json ./
RUN npm install --only=production

COPY apps/api/src/ ./src/
COPY lib/ ./lib/
COPY config/ ./config/

EXPOSE 3000

CMD ["npm", "start"]

FROM node:20-alpine

WORKDIR /app

COPY apps/ui/package*.json ./
RUN npm ci --only=production

COPY apps/ui/src/ ./src/

EXPOSE 3000

CMD ["npm", "start"]

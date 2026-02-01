const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
const isDev = process.env.NODE_ENV === 'development';
const isProd = process.env.NODE_ENV === 'production';

const { getEnvProfile, BEHAVIOR_MATRIX } = require('./env-profiles');

module.exports = {
  isRailway,
  isDev,
  isProd,
  getEnvProfile,
  BEHAVIOR_MATRIX,
  port: process.env.PORT || 3000,
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  internalApiKey: process.env.INTERNAL_API_KEY,
  jwtSecret: process.env.JWT_SECRET,
  serviceName: process.env.RAILWAY_SERVICE_NAME,
  environment: process.env.RAILWAY_ENVIRONMENT,
  projectId: process.env.RAILWAY_PROJECT_ID,
};

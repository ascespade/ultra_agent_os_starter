/**
 * Production Environment Validator
 * Validates environment variables for production deployment
 */

function validateProductionEnv() {
  const required = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
    'INTERNAL_API_KEY'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Validate database URL format
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl.match(/^postgres:\/\//) && !dbUrl.match(/^postgresql:\/\//)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }
  
  // Validate Redis URL format
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl.match(/^redis:\/\//)) {
    throw new Error('REDIS_URL must be a Redis connection string');
  }
  
  console.log('[PROD_VALIDATION] ✓ Environment validation passed');
}

function getEnvironmentProfile() {
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    hasDatabase: !!process.env.DATABASE_URL,
    hasRedis: !!process.env.REDIS_URL,
    hasJwtSecret: !!process.env.JWT_SECRET,
    hasInternalApiKey: !!process.env.INTERNAL_API_KEY,
    isProduction: process.env.NODE_ENV === 'production'
  };
}

module.exports = {
  validateProductionEnv,
  getEnvironmentProfile
};

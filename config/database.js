// Automatically detects and connects to Railway database
const getDatabaseConfig = () => {
  // Railway automatically injects these variables
  const config = {
    // Try different database types
    postgres: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    mysql: process.env.MYSQL_URL,
    mongodb: process.env.MONGO_URL,
    redis: process.env.REDIS_URL,
    
    // Service discovery
    serviceName: process.env.RAILWAY_SERVICE_NAME,
    environment: process.env.RAILWAY_ENVIRONMENT,
    projectId: process.env.RAILWAY_PROJECT_ID,
  };
  
  // Auto-detect which database is available
  if (config.postgres) {
    return {
      type: 'postgres',
      url: config.postgres,
      client: 'pg'
    };
  } else if (config.mysql) {
    return {
      type: 'mysql',
      url: config.mysql,
      client: 'mysql2'
    };
  } else if (config.mongodb) {
    return {
      type: 'mongodb',
      url: config.mongodb,
      client: 'mongodb'
    };
  }
  
  // Fallback to Redis for cache/queue
  if (config.redis) {
    return {
      type: 'redis',
      url: config.redis,
      client: 'redis'
    };
  }
  
  throw new Error('No database connection found!');
};

module.exports = { getDatabaseConfig };

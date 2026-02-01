const redis = require("redis");

let redisClient = null;
let isConnected = false;

// Simple Circuit Breaker for Redis
const CircuitBreaker = {
  failures: 0,
  threshold: 5,
  lastFailureTime: 0,
  resetTimeout: 30000, // 30s
  isOpen: () => {
    if (CircuitBreaker.failures >= CircuitBreaker.threshold) {
      if (Date.now() - CircuitBreaker.lastFailureTime > CircuitBreaker.resetTimeout) {
        // Half-open: try to reset
        CircuitBreaker.failures = 0;
        return false;
      }
      return true;
    }
    return false;
  },
  recordFailure: () => {
    CircuitBreaker.failures++;
    CircuitBreaker.lastFailureTime = Date.now();
  },
  recordSuccess: () => {
    CircuitBreaker.failures = 0;
  }
};

async function initializeRedis() {
  const REDIS_URL = process.env.REDIS_URL;
  if (!REDIS_URL) {
    console.error("[REDIS] REDIS_URL environment variable is required");
    process.exit(1);
  }

  redisClient = redis.createClient({ url: REDIS_URL });

  redisClient.on("error", (err) => {
    console.error("[REDIS] Client Error", err);
    CircuitBreaker.recordFailure();
    isConnected = false;
  });

  redisClient.on("connect", () => {
    console.log("[REDIS] Connected to Redis");
    CircuitBreaker.recordSuccess();
    isConnected = true;
  });

  redisClient.on("ready", () => {
    console.log("[REDIS] Redis client ready");
    isConnected = true;
  });

  await redisClient.connect();
  return redisClient;
}

function getClient() {
  if (!redisClient) {
    throw new Error("Redis client not initialized. Call initializeRedis() first.");
  }
  
  if (CircuitBreaker.isOpen()) {
    console.warn("[REDIS] Circuit breaker OPEN. Failing fast.");
    // In a real implementation, you might return a mock client or throw specific error
    // For now, we throw specific error that controllers can catch
    throw new Error("Redis Service Unavailable (Circuit Breaker Open)");
  }

  return redisClient;
}

module.exports = {
  initializeRedis,
  getClient,
  CircuitBreaker
};

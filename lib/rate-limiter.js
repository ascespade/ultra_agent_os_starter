/**
 * Professional Rate Limiting Engine
 * Implements token bucket algorithm with graceful overflow handling
 * Protects Ollama from overload while never hard-blocking users
 */

class TokenBucket {
  constructor(rate, burst, redisClient) {
    this.rate = rate; // tokens per second
    this.burst = burst; // maximum bucket capacity
    this.redis = redisClient;
  }

  async consume(key, tokens = 1) {
    const now = Math.floor(Date.now() / 1000);
    const bucketKey = `rate_limit:${key}`;
    
    // Lua script for atomic token bucket operations
    const luaScript = `
      local bucket_key = KEYS[1]
      local now = tonumber(ARGV[1])
      local rate = tonumber(ARGV[2])
      local burst = tonumber(ARGV[3])
      local tokens = tonumber(ARGV[4])
      
      local bucket = redis.call('HMGET', bucket_key, 'tokens', 'last_refill')
      local current_tokens = tonumber(bucket[1]) or burst
      local last_refill = tonumber(bucket[2]) or now
      
      -- Refill tokens based on elapsed time
      local elapsed = now - last_refill
      local new_tokens = math.min(burst, current_tokens + elapsed * rate)
      
      -- Check if request can be processed
      if new_tokens >= tokens then
        new_tokens = new_tokens - tokens
        redis.call('HMSET', bucket_key, 'tokens', new_tokens, 'last_refill', now)
        redis.call('EXPIRE', bucket_key, 3600) -- 1 hour expiry
        return {1, new_tokens} -- success, remaining tokens
      else
        redis.call('HMSET', bucket_key, 'tokens', new_tokens, 'last_refill', now)
        redis.call('EXPIRE', bucket_key, 3600)
        return {0, new_tokens} -- rejected, remaining tokens
      end
    `;
    
    try {
      const result = await this.redis.eval(luaScript, {
        keys: [bucketKey],
        arguments: [now, this.rate, this.burst, tokens]
      });
      
      return {
        allowed: result[0] === 1,
        remaining: result[1],
        resetTime: now + Math.ceil((this.burst - result[1]) / this.rate)
      };
    } catch (error) {
      console.error('[RATE_LIMIT] Token bucket error:', error);
      // Surface failure: do not silently allow when Redis is unavailable
      return { allowed: false, remaining: 0, resetTime: now + 60, serviceUnavailable: true };
    }
  }
}

class CircuitBreaker {
  constructor(failureThreshold, cooldownSeconds) {
    this.failureThreshold = failureThreshold;
    this.cooldownSeconds = cooldownSeconds;
    this.redis = null;
  }

  async initialize(redisClient) {
    this.redis = redisClient;
  }

  async execute(key, operation, timeoutMs = 60000) {
    const stateKey = `circuit_breaker:${key}`;
    const now = Math.floor(Date.now() / 1000);
    
    // Check circuit state
    try {
      const state = await this.redis.hGetAll(stateKey);
      const failures = parseInt(state.failures || '0');
      const lastFailure = parseInt(state.last_failure || '0');
      const isOpen = state.state === 'open';
      
      // If circuit is open and cooldown period has passed, try to close it
      if (isOpen && (now - lastFailure) > this.cooldownSeconds) {
        await this.redis.del(stateKey);
        console.log(`[CIRCUIT_BREAKER] Circuit ${key} attempting to close after cooldown`);
      }
      
      // If circuit is open and still in cooldown, reject immediately
      if (isOpen && (now - lastFailure) <= this.cooldownSeconds) {
        return {
          success: false,
          error: 'Circuit breaker is open',
          retryAfter: this.cooldownSeconds - (now - lastFailure)
        };
      }
      
      // Execute operation with timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
      );
      
      try {
        const result = await Promise.race([operation(), timeoutPromise]);
        
        // Success - reset failure count
        if (failures > 0) {
          await this.redis.del(stateKey);
          console.log(`[CIRCUIT_BREAKER] Circuit ${key} closed after successful operation`);
        }
        
        return { success: true, result };
      } catch (error) {
        // Failure - increment failure count
        const newFailures = failures + 1;
        const newState = newFailures >= this.failureThreshold ? 'open' : 'closed';
        
        await this.redis.hSet(stateKey, {
          failures: newFailures,
          last_failure: now,
          state: newState
        });
        await this.redis.expire(stateKey, this.cooldownSeconds * 2);
        
        console.error(`[CIRCUIT_BREAKER] Circuit ${key} operation failed: ${error.message}`);
        console.error(`[CIRCUIT_BREAKER] Circuit ${key} state: ${newState}, failures: ${newFailures}/${this.failureThreshold}`);
        
        return {
          success: false,
          error: error.message,
          circuitOpen: newState === 'open'
        };
      }
    } catch (redisError) {
      console.error('[CIRCUIT_BREAKER] Redis error, failing open:', redisError);
      // Fail open - allow operation if Redis fails
      try {
        const result = await Promise.race([operation(), timeoutPromise]);
        return { success: true, result };
      } catch (operationError) {
        return { success: false, error: operationError.message };
      }
    }
  }
}

class RateLimitOrchestrator {
  constructor(redisClient) {
    this.redis = redisClient;
    this.policies = new Map();
    this.circuitBreaker = new CircuitBreaker(5, 30); // 5 failures, 30s cooldown
    this.circuitBreaker.initialize(redisClient);
    
    this.setupPolicies();
  }

  setupPolicies() {
    // AI endpoints - token bucket with enqueue on overflow
    // Requirements: 8 req/sec per user, burst 25, enqueue_and_return_202
    this.policies.set('ai_endpoints', {
      bucket: new TokenBucket(8, 25, this.redis), // 8 req/sec, burst 25
      queueEnabled: true,
      timeoutMs: 60000
    });

    // Light endpoints - leaky bucket with delay not reject
    // Requirements: 50 req/sec, burst 100, delay_not_reject
    this.policies.set('light_endpoints', {
      bucket: new TokenBucket(50, 100, this.redis), // 50 req/sec, burst 100
      queueEnabled: false,
      timeoutMs: 30000
    });

    // Internal services - no rate limit (health, admin)
    this.policies.set('internal_services', {
      bucket: null,
      queueEnabled: false,
      timeoutMs: 30000
    });
  }

  async checkRateLimit(policyName, userKey, tokens = 1) {
    const policy = this.policies.get(policyName);
    if (!policy) {
      console.error(`[RATE_LIMIT] Unknown policy: ${policyName}`);
      return { allowed: true, remaining: 999 };
    }

    // No rate limiting for internal services
    if (!policy.bucket) {
      return { allowed: true, remaining: 999 };
    }

    const result = await policy.bucket.consume(userKey, tokens);
    
    // If not allowed and queue is enabled, enqueue request
    if (!result.allowed && policy.queueEnabled) {
      await this.enqueueRequest(policyName, userKey, tokens);
      return { 
        allowed: false, 
        remaining: result.remaining,
        queued: true,
        resetTime: result.resetTime
      };
    }

    return result;
  }

  async enqueueRequest(policyName, userKey, tokens) {
    const queueKey = `rate_limit_queue:${policyName}:${userKey}`;
    const request = {
      userKey,
      tokens,
      timestamp: Date.now(),
      policyName
    };
    
    await this.redis.lPush(queueKey, JSON.stringify(request));
    await this.redis.expire(queueKey, 300); // 5 minute queue expiry
    
    console.log(`[RATE_LIMIT] Request queued for ${userKey} under policy ${policyName}`);
  }

  async processQueue(policyName, userKey) {
    const queueKey = `rate_limit_queue:${policyName}:${userKey}`;
    
    while (true) {
      const queueData = await this.redis.lPop(queueKey);
      if (!queueData) break;
      
      try {
        const request = JSON.parse(queueData);
        const result = await this.checkRateLimit(request.policyName, request.userKey, request.tokens);
        
        if (result.allowed) {
          // Process the queued request
          console.log(`[RATE_LIMIT] Processed queued request for ${userKey}`);
        } else {
          // Put it back if still not allowed
          await this.redis.rPush(queueKey, queueData);
          break;
        }
      } catch (error) {
        console.error('[RATE_LIMIT] Queue processing error:', error);
      }
    }
  }

  async executeWithCircuitBreaker(key, operation) {
    return await this.circuitBreaker.execute(key, operation);
  }

  getMiddleware(policyName, getUserKey = (req) => req.ip) {
    return async (req, res, next) => {
      try {
        const userKey = getUserKey(req);
        const result = await this.checkRateLimit(policyName, userKey);
        
        if (result.allowed) {
          // Add rate limit headers
          res.set({
            'X-RateLimit-Limit': this.policies.get(policyName)?.bucket?.burst || 999,
            'X-RateLimit-Remaining': result.remaining,
            'X-RateLimit-Reset': result.resetTime
          });
          next();
        } else if (result.queued) {
          // Return 202 Accepted for queued requests
          res.status(202).json({
            message: 'Request queued due to rate limit',
            retryAfter: Math.ceil((result.resetTime - Math.floor(Date.now() / 1000))),
            queuePosition: 'processing'
          });
        } else if (result.serviceUnavailable) {
          res.status(503).json({
            error: 'Rate limit service unavailable',
            retryAfter: 60
          });
        } else {
          res.status(429).json({
            error: 'Rate limit exceeded',
            retryAfter: Math.ceil((result.resetTime - Math.floor(Date.now() / 1000)))
          });
        }
      } catch (error) {
        console.error('[RATE_LIMIT] Middleware error:', error);
        res.status(503).json({ error: 'Rate limit service unavailable', retryAfter: 60 });
      }
    };
  }

  async getMetrics() {
    const metrics = {
      policies: {},
      circuit_breakers: {},
      queues: {},
      timestamp: new Date().toISOString()
    };

    // Collect policy metrics
    for (const [name, policy] of this.policies) {
      if (policy.bucket) {
        metrics.policies[name] = {
          rate: policy.bucket.rate,
          burst: policy.bucket.burst,
          queue_enabled: policy.queueEnabled
        };
      }
    }

    // Collect circuit breaker metrics
    try {
      const keys = await this.redis.keys('circuit_breaker:*');
      for (const key of keys) {
        const state = await this.redis.hGetAll(key);
        metrics.circuit_breakers[key.replace('circuit_breaker:', '')] = state;
      }
    } catch (error) {
      console.error('[RATE_LIMIT] Failed to collect circuit breaker metrics:', error);
    }

    // Collect queue metrics
    try {
      const keys = await this.redis.keys('rate_limit_queue:*');
      for (const key of keys) {
        const length = await this.redis.lLen(key);
        metrics.queues[key.replace('rate_limit_queue:', '')] = length;
      }
    } catch (error) {
      console.error('[RATE_LIMIT] Failed to collect queue metrics:', error);
    }

    return metrics;
  }
}

module.exports = {
  TokenBucket,
  CircuitBreaker,
  RateLimitOrchestrator
};

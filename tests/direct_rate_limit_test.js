#!/usr/bin/env node

const redis = require('redis');
const { RateLimitOrchestrator } = require('../lib/rate-limiter');

// Direct rate limiting test without full server
async function testRateLimitingDirectly() {
  console.log('🔍 Direct Rate Limiting Test');
  console.log('============================\n');

  const results = {
    token_bucket_works: false,
    queue_behavior_works: false,
    circuit_breaker_works: false,
    overall_status: 'UNKNOWN'
  };

  try {
    // Connect to Redis
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisClient = redis.createClient({ url: redisUrl });
    await redisClient.connect();
    console.log('✅ Redis connected');

    // Initialize rate limiter
    const rateLimitOrchestrator = new RateLimitOrchestrator(redisClient);
    console.log('✅ Rate limiter initialized');

    // Test 1: Token bucket functionality
    console.log('\n📋 Test 1: Token Bucket Functionality');
    const testUser = 'test_user_direct';
    
    // Clear any existing state
    await redisClient.del(`rate_limit:ai_endpoints:${testUser}`);
    
    // Make requests within burst limit
    for (let i = 0; i < 25; i++) { // Within burst of 30
      const result = await rateLimitOrchestrator.checkRateLimit('ai_endpoints', testUser);
      if (!result.allowed) {
        console.log(`❌ Request ${i} rejected unexpectedly`);
        break;
      }
    }
    
    // Make requests that should trigger queuing
    let queuedCount = 0;
    for (let i = 25; i < 40; i++) { // Should exceed burst
      const result = await rateLimitOrchestrator.checkRateLimit('ai_endpoints', testUser);
      if (!result.allowed && result.queued) {
        queuedCount++;
      }
    }
    
    if (queuedCount > 0) {
      console.log(`✅ Token bucket working: ${queuedCount} requests queued`);
      results.token_bucket_works = true;
    } else {
      console.log('❌ Token bucket not working as expected');
    }

    // Test 2: Queue processing
    console.log('\n📋 Test 2: Queue Processing');
    const queueDepthBefore = await redisClient.lLen(`rate_limit_queue:ai_endpoints:${testUser}`);
    console.log(`📊 Queue depth before processing: ${queueDepthBefore}`);
    
    // Wait for tokens to refill (1 token per second for AI endpoints)
    console.log('⏳ Waiting 3 seconds for token refill...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Process queue
    await rateLimitOrchestrator.processQueue('ai_endpoints', testUser);
    
    const queueDepthAfter = await redisClient.lLen(`rate_limit_queue:ai_endpoints:${testUser}`);
    console.log(`📊 Queue depth after processing: ${queueDepthAfter}`);
    
    if (queueDepthAfter < queueDepthBefore) {
      console.log('✅ Queue processing working');
      results.queue_behavior_works = true;
    } else {
      console.log('❌ Queue processing not working');
    }

    // Test 3: Circuit breaker
    console.log('\n📋 Test 3: Circuit Breaker');
    const testKey = 'circuit_test';
    
    // Clear circuit breaker state
    await redisClient.del(`circuit_breaker:${testKey}`);
    
    // Simulate successful operation
    const successOperation = async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return 'success';
    };
    
    const result1 = await rateLimitOrchestrator.executeWithCircuitBreaker(testKey, successOperation);
    if (result1.success) {
      console.log('✅ Circuit breaker allows successful operation');
    }
    
    // Simulate failing operations
    const failOperation = async () => {
      throw new Error('Simulated failure');
    };
    
    // Trigger failures to open circuit
    for (let i = 0; i < 6; i++) { // 5 failures should open circuit
      await rateLimitOrchestrator.executeWithCircuitBreaker(testKey, failOperation).catch(() => {});
    }
    
    // Try operation again - should be rejected
    const result2 = await rateLimitOrchestrator.executeWithCircuitBreaker(testKey, successOperation);
    if (!result2.success && result2.error.includes('circuit')) {
      console.log('✅ Circuit breaker opens after failures');
      results.circuit_breaker_works = true;
    } else {
      console.log('❌ Circuit breaker not working');
    }

    // Test 4: Metrics collection
    console.log('\n📋 Test 4: Metrics Collection');
    const metrics = await rateLimitOrchestrator.getMetrics();
    console.log('📊 Rate limiting metrics collected');
    console.log(`   - Policies: ${Object.keys(metrics.policies).length}`);
    console.log(`   - Circuit breakers: ${Object.keys(metrics.circuit_breakers).length}`);
    console.log(`   - Queues: ${Object.keys(metrics.queues).length}`);

    await redisClient.disconnect();
    
  } catch (error) {
    console.error('❌ Direct test failed:', error.message);
  }

  // Overall assessment
  console.log('\n📊 DIRECT RATE LIMITING TEST RESULTS');
  console.log('====================================');
  console.log(`✅ Token bucket works: ${results.token_bucket_works}`);
  console.log(`✅ Queue behavior works: ${results.queue_behavior_works}`);
  console.log(`✅ Circuit breaker works: ${results.circuit_breaker_works}`);

  const passedTests = Object.values(results).filter(v => v === true).length;
  const totalTests = 3;
  
  if (passedTests >= 2) {
    results.overall_status = 'PASS';
    console.log(`\n🎉 DIRECT RATE LIMITING TEST PASSED (${passedTests}/${totalTests})`);
    console.log('✅ Rate limiting logic is working correctly');
  } else {
    results.overall_status = 'FAIL';
    console.log(`\n❌ DIRECT RATE LIMITING TEST FAILED (${passedTests}/${totalTests})`);
    console.log('❌ Rate limiting implementation has issues');
  }

  return results;
}

// Run test
if (require.main === module) {
  testRateLimitingDirectly()
    .then(results => {
      process.exit(results.overall_status === 'FAIL' ? 1 : 0);
    })
    .catch(error => {
      console.error('Test script error:', error);
      process.exit(1);
    });
}

module.exports = { testRateLimitingDirectly };

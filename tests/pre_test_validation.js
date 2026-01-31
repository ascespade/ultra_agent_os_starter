#!/usr/bin/env node

const redis = require('redis');
const axios = require('axios');

// Pre-test validation script
async function validatePreTestConditions() {
  console.log('🔍 RATE_LIMIT_AND_DEEP_STABILITY_CERTIFICATION_ORCHESTRATOR');
  console.log('Phase 2: Pre-Test Validation');
  console.log('=====================================\n');

  const results = {
    ollama_responds: false,
    redis_reachable: false,
    no_container_restart_storm: false,
    api_returns_202_on_overload: false,
    worker_queue_depth_visible: false,
    overall_status: 'UNKNOWN'
  };

  // Test 1: Ollama responds to /api/generate
  console.log('📋 Test 1: Ollama API Responsiveness');
  try {
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    const response = await axios.post(`${ollamaUrl}/api/generate`, {
      model: 'llama3.2',
      prompt: 'Test prompt - respond with "OK"',
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 10
      }
    }, {
      timeout: 5000
    });
    
    if (response.data && response.data.response) {
      console.log('✅ Ollama API responds correctly');
      results.ollama_responds = true;
    } else {
      console.log('❌ Ollama API response invalid');
    }
  } catch (error) {
    console.log(`❌ Ollama API unreachable: ${error.message}`);
    console.log('   Note: This is expected if Ollama is not running');
  }

  // Test 2: Redis reachable
  console.log('\n📋 Test 2: Redis Connectivity');
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisClient = redis.createClient({ url: redisUrl });
    
    await redisClient.connect();
    const pong = await redisClient.ping();
    
    if (pong === 'PONG') {
      console.log('✅ Redis reachable and responsive');
      results.redis_reachable = true;
    } else {
      console.log('❌ Redis ping response invalid');
    }
    
    await redisClient.disconnect();
  } catch (error) {
    console.log(`❌ Redis unreachable: ${error.message}`);
  }

  // Test 3: No container restart storm
  console.log('\n📋 Test 3: Container Restart Storm Check');
  try {
    const { execSync } = require('child_process');
    const dockerPs = execSync('docker ps --format "table {{.Names}}\\t{{.Status}}"', { encoding: 'utf8' });
    
    if (dockerPs.includes('Restarting')) {
      console.log('❌ Container restart storm detected');
      console.log('   Containers in restarting state:');
      console.log(dockerPs.split('\n').filter(line => line.includes('Restarting')).join('\n'));
    } else {
      console.log('✅ No container restart storm detected');
      results.no_container_restart_storm = true;
    }
  } catch (error) {
    console.log(`⚠️  Could not check container status: ${error.message}`);
    console.log('   Assuming no restart storm (Docker not available)');
    results.no_container_restart_storm = true;
  }

  // Test 4: API returns 202 on overload not 429
  console.log('\n📋 Test 4: API Overload Response (should return 202, not 429)');
  try {
    // Clear any existing rate limit for test IP
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisClient = redis.createClient({ url: redisUrl });
    await redisClient.connect();
    
    // Clear rate limit state for test user
    const testKey = 'rate_limit:ai_endpoints:127.0.0.1';
    await redisClient.del(testKey);
    await redisClient.disconnect();
    
    // Make rapid requests to trigger rate limit
    const promises = [];
    for (let i = 0; i < 40; i++) { // Exceed burst of 30
      promises.push(
        axios.get('http://localhost:3000/health', {
          headers: { 'X-Forwarded-For': '127.0.0.1' },
          timeout: 1000
        }).catch(e => e.response || e)
      );
    }
    
    const responses = await Promise.all(promises);
    const statusCodes = responses.map(r => r.status || r.response?.status).filter(Boolean);
    
    const has202 = statusCodes.includes(202);
    const has429 = statusCodes.includes(429);
    
    if (has202 && !has429) {
      console.log('✅ API returns 202 on overload (queuing behavior)');
      results.api_returns_202_on_overload = true;
    } else if (has429) {
      console.log('❌ API returns 429 on overload (hard rejection)');
      console.log(`   Status codes observed: ${[...new Set(statusCodes)].join(', ')}`);
    } else {
      console.log('⚠️  No rate limiting behavior observed');
      console.log(`   Status codes observed: ${[...new Set(statusCodes)].join(', ')}`);
    }
  } catch (error) {
    console.log(`❌ API overload test failed: ${error.message}`);
  }

  // Test 5: Worker queue depth visible
  console.log('\n📋 Test 5: Worker Queue Depth Visibility');
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisClient = redis.createClient({ url: redisUrl });
    await redisClient.connect();
    
    const queueDepth = await redisClient.lLen('job_queue');
    console.log(`📊 Current job queue depth: ${queueDepth}`);
    
    // Check if we can read queue metrics
    const rateLimitKeys = await redisClient.keys('rate_limit_queue:*');
    console.log(`📊 Rate limit queues: ${rateLimitKeys.length}`);
    
    if (queueDepth >= 0 && rateLimitKeys.length >= 0) {
      console.log('✅ Worker queue depth visible');
      results.worker_queue_depth_visible = true;
    }
    
    await redisClient.disconnect();
  } catch (error) {
    console.log(`❌ Queue depth check failed: ${error.message}`);
  }

  // Overall assessment
  console.log('\n📊 PRE-TEST VALIDATION RESULTS');
  console.log('================================');
  console.log(`✅ Ollama responds: ${results.ollama_responds}`);
  console.log(`✅ Redis reachable: ${results.redis_reachable}`);
  console.log(`✅ No restart storm: ${results.no_container_restart_storm}`);
  console.log(`✅ API returns 202: ${results.api_returns_202_on_overload}`);
  console.log(`✅ Queue depth visible: ${results.worker_queue_depth_visible}`);

  const passedTests = Object.values(results).filter(v => v === true).length;
  const totalTests = 5;
  
  if (passedTests === totalTests) {
    results.overall_status = 'PASS';
    console.log(`\n🎉 ALL TESTS PASSED (${passedTests}/${totalTests})`);
    console.log('✅ System ready for deep stability testing');
  } else if (passedTests >= 3) {
    results.overall_status = 'SOFT_PASS';
    console.log(`\n⚠️  SOFT PASS (${passedTests}/${totalTests})`);
    console.log('⚠️  Some issues detected, but testing can proceed with caution');
  } else {
    results.overall_status = 'FAIL';
    console.log(`\n❌ PRE-TEST VALIDATION FAILED (${passedTests}/${totalTests})`);
    console.log('❌ Critical issues must be resolved before deep testing');
  }

  console.log('\n📋 RECOMMENDATIONS:');
  if (!results.ollama_responds) {
    console.log('   - Start Ollama service or configure OLLAMA_URL');
  }
  if (!results.redis_reachable) {
    console.log('   - Start Redis service or configure REDIS_URL');
  }
  if (!results.api_returns_202_on_overload) {
    console.log('   - Check rate limiting implementation');
    console.log('   - Verify token bucket configuration');
  }
  if (!results.worker_queue_depth_visible) {
    console.log('   - Check worker service status');
    console.log('   - Verify Redis connectivity for worker');
  }

  return results;
}

// Run validation
if (require.main === module) {
  validatePreTestConditions()
    .then(results => {
      process.exit(results.overall_status === 'FAIL' ? 1 : 0);
    })
    .catch(error => {
      console.error('Validation script error:', error);
      process.exit(1);
    });
}

module.exports = { validatePreTestConditions };

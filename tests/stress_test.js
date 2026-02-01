#!/usr/bin/env node

/**
 * CONTROLLED STRESS TEST
 * Tests system stability under load within safe limits
 * Max: 8 req/s, 15 concurrent jobs, 2 Ollama parallel
 */

const test = require('node:test');
const assert = require('node:assert');
const axios = require('axios');

const API_BASE = 'http://localhost:3000';

// Stress test configuration
const STRESS_CONFIG = {
  max_requests_per_second: 8,
  max_concurrent_jobs: 15,
  ollama_parallel_requests: 2,
  duration_minutes: 2, // Reduced for testing
  burst_size: 20
};

// Helper function
async function apiRequest(method, endpoint, data = null, headers = {}) {
  try {
    const config = {
      method,
      url: `${API_BASE}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: 5000,
      validateStatus: function (status) {
        return status < 500;
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    if (error.response) {
      return { 
        success: false, 
        data: error.response.data,
        status: error.response.status
      };
    }
    return { 
      success: false, 
      error: error.message,
      code: error.code
    };
  }
}

// Rate limiter for stress testing
class StressRateLimiter {
  constructor(requestsPerSecond) {
    this.requestsPerSecond = requestsPerSecond;
    this.lastRequestTime = 0;
  }
  
  async wait() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 1000 / this.requestsPerSecond;
    
    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }
}

test('Controlled Load Test - Health Endpoint', async () => {
  const rateLimiter = new StressRateLimiter(STRESS_CONFIG.max_requests_per_second);
  const testDuration = 30000; // 30 seconds
  const startTime = Date.now();
  const results = [];
  
  console.log(`Starting controlled load test: ${STRESS_CONFIG.max_requests_per_second} req/s for ${testDuration/1000}s`);
  
  while (Date.now() - startTime < testDuration) {
    await rateLimiter.wait();
    
    const requestStart = Date.now();
    const result = await apiRequest('GET', '/health');
    const requestEnd = Date.now();
    
    results.push({
      success: result.success && result.status === 200,
      responseTime: requestEnd - requestStart,
      status: result.status
    });
  }
  
  const totalRequests = results.length;
  const successfulRequests = results.filter(r => r.success).length;
  const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / totalRequests;
  const maxResponseTime = Math.max(...results.map(r => r.responseTime));
  
  console.log(`Load test results:`);
  console.log(`- Total requests: ${totalRequests}`);
  console.log(`- Successful: ${successfulRequests} (${(successfulRequests/totalRequests*100).toFixed(1)}%)`);
  console.log(`- Avg response time: ${avgResponseTime.toFixed(2)}ms`);
  console.log(`- Max response time: ${maxResponseTime}ms`);
  
  // Assertions
  assert(successfulRequests / totalRequests >= 0.95, 'At least 95% of requests should succeed');
  assert(avgResponseTime < 1000, 'Average response time should be under 1 second');
  assert(maxResponseTime < 5000, 'Maximum response time should be under 5 seconds');
  
  console.log('✅ Controlled load test passed');
});

test('Burst Load Test - Rate Limiting Behavior', async () => {
  console.log(`Testing burst behavior with ${STRESS_CONFIG.burst_size} concurrent requests`);
  
  // Create burst of requests
  const requests = [];
  for (let i = 0; i < STRESS_CONFIG.burst_size; i++) {
    requests.push(apiRequest('GET', '/health'));
  }
  
  const startTime = Date.now();
  const results = await Promise.all(requests);
  const endTime = Date.now();
  
  const successfulRequests = results.filter(r => r.success && r.status === 200).length;
  const rateLimitedRequests = results.filter(r => r.status === 429).length;
  const otherErrors = results.filter(r => !r.success && r.status !== 429).length;
  
  console.log(`Burst test results:`);
  console.log(`- Total requests: ${results.length}`);
  console.log(`- Successful: ${successfulRequests}`);
  console.log(`- Rate limited (429): ${rateLimitedRequests}`);
  console.log(`- Other errors: ${otherErrors}`);
  console.log(`- Total time: ${endTime - startTime}ms`);
  
  // Should handle burst gracefully (no server crashes)
  assert(otherErrors < results.length * 0.1, 'Less than 10% should have non-rate-limit errors');
  
  console.log('✅ Burst load test passed');
});

test('Concurrent Authentication Stress Test', async () => {
  const rateLimiter = new StressRateLimiter(STRESS_CONFIG.max_requests_per_second);
  const testDuration = 15000; // 15 seconds
  const startTime = Date.now();
  const results = [];
  
  console.log('Starting authentication stress test');
  
  while (Date.now() - startTime < testDuration) {
    await rateLimiter.wait();
    
    const result = await apiRequest('POST', '/api/auth/login', {
      username: `stress_test_${Date.now()}_${Math.random()}`,
      password: 'testpassword'
    });
    
    results.push({
      success: result.success,
      status: result.status,
      rateLimited: result.status === 429,
      invalid: result.status === 401 || result.status === 400
    });
  }
  
  const totalRequests = results.length;
  const rateLimitedRequests = results.filter(r => r.rateLimited).length;
  const invalidRequests = results.filter(r => r.invalid).length;
  const serverErrors = results.filter(r => !r.success && r.status >= 500).length;
  
  console.log(`Auth stress test results:`);
  console.log(`- Total requests: ${totalRequests}`);
  console.log(`- Rate limited: ${rateLimitedRequests} (${(rateLimitedRequests/totalRequests*100).toFixed(1)}%)`);
  console.log(`- Invalid credentials: ${invalidRequests} (${(invalidRequests/totalRequests*100).toFixed(1)}%)`);
  console.log(`- Server errors: ${serverErrors} (${(serverErrors/totalRequests*100).toFixed(1)}%)`);
  
  // Should not have server errors under stress
  assert(serverErrors === 0, 'Should have no server errors under stress');
  
  console.log('✅ Authentication stress test passed');
});

test('Memory Stability Under Load', async () => {
  const rateLimiter = new StressRateLimiter(STRESS_CONFIG.max_requests_per_second);
  const testDuration = 20000; // 20 seconds
  const memorySnapshots = [];
  
  console.log('Monitoring memory usage under load');
  
  const memoryMonitor = setInterval(async () => {
    const healthResult = await apiRequest('GET', '/health');
    if (healthResult.success) {
      memorySnapshots.push({
        timestamp: Date.now(),
        rss: healthResult.data.memory.rss,
        heapUsed: healthResult.data.memory.heapUsed,
        heapTotal: healthResult.data.memory.heapTotal
      });
    }
  }, 2000);
  
  // Generate load
  const startTime = Date.now();
  while (Date.now() - startTime < testDuration) {
    await rateLimiter.wait();
    await apiRequest('GET', '/health');
  }
  
  clearInterval(memoryMonitor);
  
  if (memorySnapshots.length >= 2) {
    const initialMemory = memorySnapshots[0];
    const finalMemory = memorySnapshots[memorySnapshots.length - 1];
    const memoryGrowth = finalMemory.rss - initialMemory.rss;
    const memoryGrowthMB = memoryGrowth / 1024 / 1024;
    
    console.log(`Memory stability results:`);
    console.log(`- Initial RSS: ${(initialMemory.rss / 1024 / 1024).toFixed(2)}MB`);
    console.log(`- Final RSS: ${(finalMemory.rss / 1024 / 1024).toFixed(2)}MB`);
    console.log(`- Memory growth: ${memoryGrowthMB.toFixed(2)}MB`);
    console.log(`- Samples: ${memorySnapshots.length}`);
    
    // Memory growth should be reasonable (under 50MB during test)
    assert(memoryGrowthMB < 50, `Memory growth should be under 50MB (was ${memoryGrowthMB.toFixed(2)}MB)`);
  }
  
  console.log('✅ Memory stability test passed');
});

test('System Resource Monitoring', async () => {
  const initialHealth = await apiRequest('GET', '/health');
  
  assert(initialHealth.success, 'Initial health check should succeed');
  
  const initialMemory = initialHealth.data.memory;
  const initialUptime = initialHealth.data.uptime;
  
  console.log('System resource monitoring:');
  console.log(`- Initial memory: ${(initialMemory.rss / 1024 / 1024).toFixed(2)}MB RSS`);
  console.log(`- Initial heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB used`);
  console.log(`- System uptime: ${initialUptime.toFixed(0)}s`);
  
  // Wait a bit and check again
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const finalHealth = await apiRequest('GET', '/health');
  assert(finalHealth.success, 'Final health check should succeed');
  
  const finalMemory = finalHealth.data.memory;
  const finalUptime = finalHealth.data.uptime;
  
  console.log(`- Final memory: ${(finalMemory.rss / 1024 / 1024).toFixed(2)}MB RSS`);
  console.log(`- Final heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB used`);
  console.log(`- System uptime: ${finalUptime.toFixed(0)}s`);
  
  // System should remain stable
  assert(finalHealth.data.status === 'healthy', 'System should remain healthy');
  assert(finalUptime > initialUptime, 'Uptime should increase');
  
  console.log('✅ System resource monitoring passed');
});

console.log('✅ All controlled stress tests completed');

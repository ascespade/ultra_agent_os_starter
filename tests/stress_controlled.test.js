#!/usr/bin/env node

/**
 * Controlled Stress Test for Ultra Core
 * Tests system stability under controlled load
 */

const axios = require('axios');
const ServerSafetyGuard = require('./server_safety_guard.js');

class UltraCoreStressTest {
  constructor() {
    this.baseURL = 'http://localhost:3000';
    this.safetyGuard = new ServerSafetyGuard();
    this.testResults = {
      total_requests: 0,
      successful_requests: 0,
      failed_requests: 0,
      queued_requests: 0,
      rate_limit_hits: 0,
      errors: [],
      start_time: null,
      end_time: null
    };
    this.authToken = null;
    this.stressConfig = {
      max_requests_per_second: 8,
      max_concurrent_jobs: 15,
      ollama_parallel_requests: 2,
      duration_minutes: 2, // Reduced for testing
      auto_adjust: true
    };
  }

  async authenticate() {
    try {
      const response = await axios.post(`${this.baseURL}/api/auth/login`, {
        username: 'admin',
        password: 'admin123'
      });
      
      this.authToken = response.data.token;
      console.log('🔐 Authenticated successfully');
      return true;
    } catch (error) {
      console.error('❌ Authentication failed:', error.response?.data || error.message);
      return false;
    }
  }

  async makeRequest(requestType, data = null) {
    this.testResults.total_requests++;
    
    try {
      let response;
      const headers = {
        'Authorization': `Bearer ${this.authToken}`,
        'X-Tenant-ID': 'default',
        'Content-Type': 'application/json'
      };

      switch (requestType) {
        case 'health':
          response = await axios.get(`${this.baseURL}/health`);
          break;
          
        case 'chat':
          response = await axios.post(`${this.baseURL}/api/chat`, {
            message: data || `Stress test message ${Date.now()}`
          }, { headers });
          break;
          
        case 'job_status':
          response = await axios.get(`${this.baseURL}/api/jobs/${data}`, { headers });
          break;
          
        case 'adapter_status':
          response = await axios.get(`${this.baseURL}/api/adapters/status`, { headers });
          break;
          
        case 'memory_write':
          response = await axios.post(`${this.baseURL}/api/memory/stress_test`, {
            data: { timestamp: Date.now(), request_id: this.testResults.total_requests }
          }, { headers });
          break;
          
        case 'memory_read':
          response = await axios.get(`${this.baseURL}/api/memory/stress_test`, { headers });
          break;
          
        default:
          throw new Error(`Unknown request type: ${requestType}`);
      }

      this.testResults.successful_requests++;
      
      // Check for rate limiting
      if (response.status === 202) {
        this.testResults.queued_requests++;
        return { status: 'queued', data: response.data };
      }
      
      return { status: 'success', data: response.data };
      
    } catch (error) {
      this.testResults.failed_requests++;
      
      if (error.response?.status === 429) {
        this.testResults.rate_limit_hits++;
        return { status: 'rate_limited', error: error.response.data };
      }
      
      this.testResults.errors.push({
        request_id: this.testResults.total_requests,
        type: requestType,
        error: error.response?.data || error.message,
        status: error.response?.status
      });
      
      return { status: 'error', error: error.response?.data || error.message };
    }
  }

  async runStressTest() {
    console.log('🔥 Ultra Core Controlled Stress Test');
    console.log('===================================');
    console.log(`Config: ${this.stressConfig.max_requests_per_second} req/s, ${this.stressConfig.duration_minutes} min duration`);
    
    // Authenticate first
    if (!await this.authenticate()) {
      throw new Error('Authentication failed');
    }

    // Start safety monitoring
    await this.safetyGuard.startMonitoring(1000);
    
    try {
      this.testResults.start_time = Date.now();
      const durationMs = this.stressConfig.duration_minutes * 60 * 1000;
      const requestInterval = 1000 / this.stressConfig.max_requests_per_second;
      
      console.log(`\n🚀 Starting stress test for ${this.stressConfig.duration_minutes} minutes...`);
      
      const requestTypes = [
        { type: 'health', weight: 20 },
        { type: 'chat', weight: 30 },
        { type: 'adapter_status', weight: 20 },
        { type: 'memory_write', weight: 15 },
        { type: 'memory_read', weight: 15 }
      ];
      
      let requestId = 0;
      const testInterval = setInterval(async () => {
        // Check if we should stop
        if (Date.now() - this.testResults.start_time > durationMs) {
          clearInterval(testInterval);
          return;
        }
        
        // Apply dynamic throttling based on system load
        const throttle = await this.safetyGuard.applyDynamicTestThrottling();
        if (throttle.throttle_active) {
          console.log(`🛡️  Throttling active: ${throttle.max_requests_per_second} req/s`);
          return;
        }
        
        // Make concurrent requests
        const concurrentRequests = Math.min(3, this.stressConfig.max_concurrent_jobs);
        const promises = [];
        
        for (let i = 0; i < concurrentRequests; i++) {
          const requestType = this.selectWeightedRandom(requestTypes);
          promises.push(this.makeRequest(requestType.type));
        }
        
        await Promise.allSettled(promises);
        
        // Log progress every 10 seconds
        if (requestId % 80 === 0) {
          const elapsed = Math.round((Date.now() - this.testResults.start_time) / 1000);
          const rps = Math.round(this.testResults.total_requests / elapsed);
          console.log(`⏱️  ${elapsed}s: ${this.testResults.total_requests} requests, ${rps} req/s, ${this.testResults.successful_requests} success, ${this.testResults.queued_requests} queued`);
        }
        
        requestId++;
      }, requestInterval);
      
      // Wait for test to complete
      return new Promise((resolve) => {
        setTimeout(async () => {
          clearInterval(testInterval);
          this.testResults.end_time = Date.now();
          this.safetyGuard.stopMonitoring();
          resolve(this.generateStressReport());
        }, durationMs);
      });
      
    } catch (error) {
      this.safetyGuard.stopMonitoring();
      throw error;
    }
  }

  selectWeightedRandom(items) {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const item of items) {
      random -= item.weight;
      if (random <= 0) {
        return item;
      }
    }
    
    return items[0];
  }

  generateStressReport() {
    const duration = this.testResults.end_time - this.testResults.start_time;
    const durationSeconds = duration / 1000;
    const actualRPS = this.testResults.total_requests / durationSeconds;
    const successRate = (this.testResults.successful_requests / this.testResults.total_requests) * 100;
    
    const safetyReport = this.safetyGuard.generateSafetyReport();
    
    console.log('\n📊 Stress Test Report');
    console.log('======================');
    console.log(`Duration: ${Math.round(durationSeconds)}s`);
    console.log(`Total Requests: ${this.testResults.total_requests}`);
    console.log(`Successful: ${this.testResults.successful_requests}`);
    console.log(`Failed: ${this.testResults.failed_requests}`);
    console.log(`Queued: ${this.testResults.queued_requests}`);
    console.log(`Rate Limit Hits: ${this.testResults.rate_limit_hits}`);
    console.log(`Actual RPS: ${Math.round(actualRPS)}`);
    console.log(`Success Rate: ${Math.round(successRate)}%`);
    
    console.log('\n🛡️  Safety Report:');
    console.log(`  Safety Rate: ${Math.round(safetyReport.safety_rate)}%`);
    console.log(`  Violations: ${safetyReport.violations.length}`);
    
    if (this.testResults.errors.length > 0) {
      console.log('\n❌ Sample Errors:');
      this.testResults.errors.slice(0, 5).forEach(error => {
        console.log(`  - ${error.type}: ${error.error}`);
      });
    }
    
    // Determine if test passed
    const testPassed = successRate >= 90 && safetyReport.safety_rate >= 95 && this.testResults.rate_limit_hits === 0;
    
    console.log(`\n🎯 Stress Test Result: ${testPassed ? '✅ PASSED' : '❌ FAILED'}`);
    
    return {
      stress: this.testResults,
      safety: safetyReport,
      performance: {
        duration_seconds: durationSeconds,
        actual_rps: actualRPS,
        success_rate: successRate
      },
      passed: testPassed
    };
  }
}

// CLI interface
if (require.main === module) {
  const stressTest = new UltraCoreStressTest();
  
  stressTest.runStressTest()
    .then(report => {
      console.log('\n🏁 Stress Test Complete');
      process.exit(report.passed ? 0 : 1);
    })
    .catch(error => {
      console.error('Stress test failed:', error);
      process.exit(1);
    });
}

module.exports = UltraCoreStressTest;

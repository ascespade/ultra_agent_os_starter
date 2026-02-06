#!/usr/bin/env node

/**
 * Contract Tests - API Response Shape Validation
 * Validates that all API endpoints return expected response formats
 */

require('dotenv').config();
const axios = require('axios');

const API_BASE = process.env.API_URL || 'http://localhost:3101';

// Test configuration
const TEST_CONFIG = {
  timeout: 10000,
  retries: 3
};

class ContractTester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  async test(description, testFn) {
    try {
      await testFn();
      this.results.passed++;
      this.results.tests.push({
        description,
        status: 'PASS',
        error: null
      });
      console.log(`✅ PASS: ${description}`);
    } catch (error) {
      this.results.failed++;
      this.results.tests.push({
        description,
        status: 'FAIL',
        error: error.message
      });
      console.log(`❌ FAIL: ${description} - ${error.message}`);
    }
  }

  validateResponse(response, expectedStatus, schema = null) {
    if (response.status !== expectedStatus) {
      throw new Error(`Expected status ${expectedStatus}, got ${response.status}`);
    }

    if (schema) {
      const data = response.data;
      for (const [key, type] of Object.entries(schema)) {
        if (type === 'string' && typeof data[key] !== 'string') {
          throw new Error(`Expected ${key} to be string, got ${typeof data[key]}`);
        }
        if (type === 'number' && typeof data[key] !== 'number') {
          throw new Error(`Expected ${key} to be number, got ${typeof data[key]}`);
        }
        if (type === 'boolean' && typeof data[key] !== 'boolean') {
          throw new Error(`Expected ${key} to be boolean, got ${typeof data[key]}`);
        }
        if (type === 'object' && (data[key] === null || typeof data[key] !== 'object')) {
          throw new Error(`Expected ${key} to be object, got ${typeof data[key]}`);
        }
        if (type === 'array' && !Array.isArray(data[key])) {
          throw new Error(`Expected ${key} to be array, got ${typeof data[key]}`);
        }
      }
    }
  }
}

async function runContractTests() {
  const tester = new ContractTester();
  
  console.log('='.repeat(60));
  console.log('🧪 CONTRACT TESTS - API RESPONSE SHAPE VALIDATION');
  console.log('='.repeat(60));

  // Test 1: Root endpoint
  await tester.test('Root endpoint returns correct shape', async () => {
    const response = await axios.get(`${API_BASE}/`, { timeout: TEST_CONFIG.timeout });
    tester.validateResponse(response, 200, {
      status: 'string',
      service: 'string',
      version: 'string',
      timestamp: 'string'
    });
  });

  // Test 2: Health endpoint (if exists)
  await tester.test('Health endpoint returns correct shape', async () => {
    try {
      const response = await axios.get(`${API_BASE}/health`, { timeout: TEST_CONFIG.timeout });
      tester.validateResponse(response, 200, {
        status: 'string',
        timestamp: 'string'
      });
    } catch (error) {
      // Health endpoint might not exist, that's ok
      if (error.response?.status === 404) {
        console.log('ℹ️  SKIP: Health endpoint not found');
        return;
      }
      throw error;
    }
  });

  // Test 3: Login validation error
  await tester.test('Login validation error returns correct shape', async () => {
    const response = await axios.post(`${API_BASE}/api/auth/login`, 
      { username: '', password: '' }, 
      { timeout: TEST_CONFIG.timeout }
    );
    tester.validateResponse(response, 400);
    if (!response.data.error) throw new Error('Missing error field');
    // Note: Zod validation returns details array, basic validation returns just error
  });

  // Test 4: Login success
  await tester.test('Login success returns correct shape', async () => {
    const response = await axios.post(`${API_BASE}/api/auth/login`, 
      { username: 'admin', password: 'admin' }, 
      { timeout: TEST_CONFIG.timeout }
    );
    tester.validateResponse(response, 200);
    if (!response.data.token) throw new Error('Missing token field');
    if (!response.data.user) throw new Error('Missing user field');
    tester.validateResponse({ data: response.data }, 200, {
      token: 'string',
      user: 'object'
    });
  });

  // Test 5: Unauthorized error
  await tester.test('Unauthorized error returns correct shape', async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/jobs`, { 
        timeout: TEST_CONFIG.timeout 
      });
      throw new Error('Expected 401 error');
    } catch (error) {
      if (error.response?.status !== 401) {
        throw new Error(`Expected 401, got ${error.response?.status}`);
      }
      tester.validateResponse(error.response, 401);
      if (!error.response.data.error) throw new Error('Missing error field');
      // Note: Some endpoints may not have message field
    }
  });

  // Test 6: Create job with authentication
  await tester.test('Create job with valid token', async () => {
    // First login to get token
    const loginResponse = await axios.post(`${API_BASE}/api/auth/login`, 
      { username: 'admin', password: 'admin' }, 
      { timeout: TEST_CONFIG.timeout }
    );
    const token = loginResponse.data.token;

    // Create job
    const response = await axios.post(`${API_BASE}/api/chat`, 
      { message: 'Contract test job' }, 
      { 
        timeout: TEST_CONFIG.timeout,
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    tester.validateResponse(response, 200);
    if (!response.data.jobId) throw new Error('Missing jobId field');
    if (!response.data.status) throw new Error('Missing status field');
  });

  // Test 7: Create job validation error
  await tester.test('Create job validation error', async () => {
    const loginResponse = await axios.post(`${API_BASE}/api/auth/login`, 
      { username: 'admin', password: 'admin' }, 
      { timeout: TEST_CONFIG.timeout }
    );
    const token = loginResponse.data.token;

    try {
      const response = await axios.post(`${API_BASE}/api/chat`, 
        { message: '' }, // Empty message should fail validation
        { 
          timeout: TEST_CONFIG.timeout,
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      throw new Error('Expected 400 error');
    } catch (error) {
      if (error.response?.status !== 400) {
        throw new Error(`Expected 400, got ${error.response?.status}`);
      }
      tester.validateResponse(error.response, 400);
    }
  });

  // Test 8: Memory write with authentication
  await tester.test('Memory write with valid token', async () => {
    const loginResponse = await axios.post(`${API_BASE}/api/auth/login`, 
      { username: 'admin', password: 'admin' }, 
      { timeout: TEST_CONFIG.timeout }
    );
    const token = loginResponse.data.token;

    const response = await axios.post(`${API_BASE}/api/memory/contract-test`, 
      { data: { test: 'contract test data' } }, 
      { 
        timeout: TEST_CONFIG.timeout,
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    tester.validateResponse(response, 200);
    if (!response.data.success) throw new Error('Missing success field');
  });

  // Test 9: Memory filename validation error
  await tester.test('Memory filename validation error', async () => {
    const loginResponse = await axios.post(`${API_BASE}/api/auth/login`, 
      { username: 'admin', password: 'admin' }, 
      { timeout: TEST_CONFIG.timeout }
    );
    const token = loginResponse.data.token;

    try {
      const response = await axios.post(`${API_BASE}/api/memory/invalid-filename!@#`, 
        { data: { test: 'test' } }, 
        { 
          timeout: TEST_CONFIG.timeout,
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      throw new Error('Expected 400 error');
    } catch (error) {
      if (error.response?.status !== 400) {
        throw new Error(`Expected 400, got ${error.response?.status}`);
      }
      tester.validateResponse(error.response, 400);
    }
  });

  // Test 10: Admin endpoints with admin role
  await tester.test('Admin tenant listing with admin token', async () => {
    const loginResponse = await axios.post(`${API_BASE}/api/auth/login`, 
      { username: 'admin', password: 'admin' }, 
      { timeout: TEST_CONFIG.timeout }
    );
    const token = loginResponse.data.token;

    const response = await axios.get(`${API_BASE}/api/admin/tenants`, 
      { 
        timeout: TEST_CONFIG.timeout,
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    tester.validateResponse(response, 200);
    if (!Array.isArray(response.data.tenants)) throw new Error('Expected tenants array');
  });

  // Test 11: Adapter status endpoint
  await tester.test('Adapter status endpoint', async () => {
    const loginResponse = await axios.post(`${API_BASE}/api/auth/login`, 
      { username: 'admin', password: 'admin' }, 
      { timeout: TEST_CONFIG.timeout }
    );
    const token = loginResponse.data.token;

    const response = await axios.get(`${API_BASE}/api/adapters/status`, 
      { 
        timeout: TEST_CONFIG.timeout,
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    tester.validateResponse(response, 200);
    if (!response.data.redis) throw new Error('Missing redis field');
    if (!response.data.database) throw new Error('Missing database field');
  });

  // Test 12: 404 Not Found
  await tester.test('404 Not Found returns correct shape', async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/nonexistent-endpoint`, 
        { timeout: TEST_CONFIG.timeout }
      );
      throw new Error('Expected 404 error');
    } catch (error) {
      if (error.response?.status !== 404) {
        throw new Error(`Expected 404, got ${error.response?.status}`);
      }
      tester.validateResponse(error.response, 404);
      if (!error.response.data.error) throw new Error('Missing error field');
      if (!error.response.data.path) throw new Error('Missing path field');
    }
  });

  // Print results
  console.log('='.repeat(60));
  console.log('📊 CONTRACT TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${tester.results.passed}`);
  console.log(`❌ Failed: ${tester.results.failed}`);
  console.log(`📈 Total: ${tester.results.passed + tester.results.failed}`);
  console.log(`🎯 Success Rate: ${((tester.results.passed / (tester.results.passed + tester.results.failed)) * 100).toFixed(1)}%`);

  if (tester.results.failed > 0) {
    console.log('\n❌ Failed Tests:');
    tester.results.tests
      .filter(test => test.status === 'FAIL')
      .forEach(test => {
        console.log(`   - ${test.description}: ${test.error}`);
      });
    process.exit(1);
  }

  console.log('\n🎉 CONTRACT TESTS: ✅ PASS - All response shapes validated');
}

// Run tests
runContractTests().catch(error => {
  console.error('❌ Contract test execution failed:', error.message);
  process.exit(1);
});

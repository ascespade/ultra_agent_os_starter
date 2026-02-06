#!/usr/bin/env node
/**
 * API FUNCTIONAL VALIDATION - PHASE 4
 * 
 * Tests all API endpoints to verify they work correctly.
 * Requires: Server running on localhost:3000
 * 
 * Run: node scripts/api-validation.js
 */

const http = require('http');
const https = require('https');

console.log('='.repeat(80));
console.log('🧪 API FUNCTIONAL VALIDATION - PHASE 4');
console.log('='.repeat(80));
console.log();

const API_URL = process.env.API_URL || 'http://localhost:3000';
let authToken = null;

const results = {
  phase: 'PHASE_4_API_FUNCTIONAL_VALIDATION',
  timestamp: new Date().toISOString(),
  api_url: API_URL,
  tests: [],
  passed: 0,
  failed: 0,
  overall: 'UNKNOWN'
};

// Helper function to make HTTP requests
function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      method,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Test helper
async function test(name, fn) {
  process.stdout.write(`[TEST] ${name}... `);
  try {
    const result = await fn();
    console.log('✅ PASS');
    results.tests.push({ name, status: 'PASS', result });
    results.passed++;
    return result;
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}`);
    results.tests.push({ name, status: 'FAIL', error: error.message });
    results.failed++;
    return null;
  }
}

// Run tests
(async () => {
  console.log('📋 API ENDPOINT TESTS\n');

  // Test 1: Health Check
  await test('Health endpoint returns 200', async () => {
    const res = await request('GET', '/health');
    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }
    if (!res.body.status) {
      throw new Error('Response missing status field');
    }
    return res.body.status;
  });

  // Test 2: Root endpoint
  await test('Root endpoint returns 200', async () => {
    const res = await request('GET', '/');
    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }
    return 'OK';
  });

  // Test 3: Login (get auth token)
  await test('Auth login with admin credentials', async () => {
    const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin';
    const res = await request('POST', '/api/auth/login', {
      username: 'admin',
      password: password
    });

    if (res.status !== 200) {
      throw new Error(`Login failed with status ${res.status}: ${JSON.stringify(res.body)}`);
    }

    if (!res.body.token) {
      throw new Error('Response missing token');
    }

    authToken = res.body.token;
    return 'Authenticated';
  });

  // Test 4: Adapters status (requires auth)
  await test('Adapters status endpoint (authenticated)', async () => {
    if (!authToken) {
      throw new Error('No auth token available');
    }

    const res = await request('GET', '/api/adapters/status', null, {
      'Authorization': `Bearer ${authToken}`
    });

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }

    if (!res.body.database) {
      throw new Error('Response missing database status');
    }

    return res.body.database.status;
  });

  // Test 5: Create chat job
  await test('Create chat job', async () => {
    if (!authToken) {
      throw new Error('No auth token available');
    }

    const res = await request('POST', '/api/chat', {
      message: 'Test message from validation script'
    }, {
      'Authorization': `Bearer ${authToken}`
    });

    if (res.status !== 200 && res.status !== 429) {
      throw new Error(`Expected 200 or 429, got ${res.status}`);
    }

    if (res.status === 429) {
      return 'Backlog full (expected behavior)';
    }

    if (!res.body.jobId) {
      throw new Error('Response missing jobId');
    }

    return res.body.jobId;
  });

  // Test 6: List jobs
  await test('List user jobs', async () => {
    if (!authToken) {
      throw new Error('No auth token available');
    }

    const res = await request('GET', '/api/jobs', null, {
      'Authorization': `Bearer ${authToken}`
    });

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }

    if (!Array.isArray(res.body)) {
      throw new Error('Response is not an array');
    }

    return `${res.body.length} jobs`;
  });

  // Test 7: Memory write
  await test('Memory write endpoint', async () => {
    if (!authToken) {
      throw new Error('No auth token available');
    }

    const res = await request('POST', '/api/memory/test.json', {
      test: 'validation',
      timestamp: new Date().toISOString()
    }, {
      'Authorization': `Bearer ${authToken}`
    });

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }

    if (!res.body.success) {
      throw new Error('Memory write failed');
    }

    return 'Written';
  });

  // Test 8: Memory read
  await test('Memory read endpoint', async () => {
    if (!authToken) {
      throw new Error('No auth token available');
    }

    const res = await request('GET', '/api/memory/test.json', null, {
      'Authorization': `Bearer ${authToken}`
    });

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }

    if (!res.body.data) {
      throw new Error('Response missing data');
    }

    return 'Read successfully';
  });

  // Test 9: Workspace endpoint
  await test('Workspace endpoint', async () => {
    if (!authToken) {
      throw new Error('No auth token available');
    }

    const res = await request('GET', '/api/workspace', null, {
      'Authorization': `Bearer ${authToken}`
    });

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }

    if (!res.body.lastUpdated) {
      throw new Error('Response missing lastUpdated');
    }

    return 'OK';
  });

  // Results
  console.log();
  console.log('='.repeat(80));
  console.log('📊 RESULTS');
  console.log('='.repeat(80));
  console.log();

  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📊 Total:  ${results.tests.length}`);
  console.log();

  const passRate = (results.passed / results.tests.length * 100).toFixed(1);

  if (results.failed === 0) {
    results.overall = 'PASS';
    console.log(`🎉 PHASE 4: ✅ PASS - All APIs functional! (${passRate}%)`);
  } else if (passRate >= 80) {
    results.overall = 'PARTIAL';
    console.log(`⚠️  PHASE 4: PARTIAL PASS - ${passRate}% success rate`);
  } else {
    results.overall = 'FAIL';
    console.log(`❌ PHASE 4: FAIL - Only ${passRate}% success rate`);
  }

  console.log();
  console.log('='.repeat(80));

  // Save results
  const fs = require('fs');
  const path = require('path');
  const resultsPath = path.join(__dirname, '..', 'PHASE_4_API_VALIDATION_RESULTS.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`📄 Results saved to: PHASE_4_API_VALIDATION_RESULTS.json`);
  console.log('='.repeat(80));

  process.exit(results.failed > 0 ? 1 : 0);
})().catch(error => {
  console.error('\n❌ FATAL ERROR:', error.message);
  console.error('\nMake sure:');
  console.error('1. Server is running (npm run start:api)');
  console.error('2. Database is accessible');
  console.error('3. Redis is accessible');
  console.error('4. Environment variables are set');
  process.exit(1);
});

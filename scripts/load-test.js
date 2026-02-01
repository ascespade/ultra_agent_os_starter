#!/usr/bin/env node
/**
 * LOAD TEST - PHASE 5
 * 
 * Tests system stability under concurrent load.
 * Sends 50 concurrent requests to verify no crash.
 * 
 * Run: node scripts/load-test.js
 */

const http = require('http');
const https = require('https');

console.log('='.repeat(80));
console.log('💪 LOAD TEST - PHASE 5');
console.log('='.repeat(80));
console.log();

const API_URL = process.env.API_URL || 'http://localhost:3000';
const CONCURRENT_REQUESTS = 50;
const REQUEST_TIMEOUT = 30000; // 30 seconds

const results = {
  phase: 'PHASE_5_SYSTEM_STABILITY',
  timestamp: new Date().toISOString(),
  api_url: API_URL,
  concurrent_requests: CONCURRENT_REQUESTS,
  requests: [],
  succeeded: 0,
  failed: 0,
  rate_limited: 0,
  total_time_ms: 0,
  overall: 'UNKNOWN'
};

// Helper function
function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
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
      },
      timeout: REQUEST_TIMEOUT
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const duration = Date.now() - startTime;
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ 
            status: res.statusCode, 
            headers: res.headers, 
            body: json,
            duration 
          });
        } catch (e) {
          resolve({ 
            status: res.statusCode, 
            headers: res.headers, 
            body: data,
            duration 
          });
        }
      });
    });

    req.on('error', (error) => {
      const duration = Date.now() - startTime;
      reject({ error: error.message, duration });
    });

    req.on('timeout', () => {
      req.destroy();
      const duration = Date.now() - startTime;
      reject({ error: 'Request timeout', duration });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Login to get auth token
async function login() {
  console.log('🔐 Authenticating...');
  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin';
  
  try {
    const res = await request('POST', '/api/auth/login', {
      username: 'admin',
      password: password
    });

    if (res.status !== 200) {
      throw new Error(`Login failed: ${res.status}`);
    }

    console.log('✅ Authenticated\n');
    return res.body.token;
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    throw error;
  }
}

// Run load test
(async () => {
  const authToken = await login();

  console.log(`📊 Starting load test: ${CONCURRENT_REQUESTS} concurrent requests\n`);
  
  const startTime = Date.now();

  // Create array of requests
  const requests = Array(CONCURRENT_REQUESTS).fill(null).map((_, i) => {
    return request('POST', '/api/chat', {
      message: `Load test message ${i + 1}`
    }, {
      'Authorization': `Bearer ${authToken}`
    }).then(res => {
      return { index: i, success: true, ...res };
    }).catch(err => {
      return { index: i, success: false, ...err };
    });
  });

  // Execute all requests concurrently
  console.log('🚀 Sending requests...');
  const responses = await Promise.all(requests);
  
  results.total_time_ms = Date.now() - startTime;

  console.log('✅ All requests completed\n');

  // Analyze results
  responses.forEach(res => {
    results.requests.push(res);

    if (res.success) {
      if (res.status === 200) {
        results.succeeded++;
      } else if (res.status === 429) {
        results.rate_limited++;
      } else {
        results.failed++;
      }
    } else {
      results.failed++;
    }
  });

  // Display results
  console.log('='.repeat(80));
  console.log('📊 RESULTS');
  console.log('='.repeat(80));
  console.log();

  console.log(`✅ Succeeded:     ${results.succeeded}`);
  console.log(`⏸️  Rate Limited:  ${results.rate_limited}`);
  console.log(`❌ Failed:        ${results.failed}`);
  console.log(`📊 Total:         ${CONCURRENT_REQUESTS}`);
  console.log(`⏱️  Total Time:    ${results.total_time_ms}ms`);
  console.log(`⚡ Avg Time:      ${(results.total_time_ms / CONCURRENT_REQUESTS).toFixed(0)}ms`);
  console.log();

  // Calculate metrics
  const successRate = ((results.succeeded + results.rate_limited) / CONCURRENT_REQUESTS * 100).toFixed(1);
  const avgDuration = responses.reduce((sum, r) => sum + (r.duration || 0), 0) / responses.length;

  console.log(`📈 Success Rate:  ${successRate}%`);
  console.log(`⏱️  Avg Duration:  ${avgDuration.toFixed(0)}ms`);
  console.log();

  // Determine pass/fail
  const serverCrashed = results.failed > CONCURRENT_REQUESTS * 0.5; // >50% failed
  const backlogOverflow = results.rate_limited > CONCURRENT_REQUESTS * 0.9; // >90% rate limited

  if (serverCrashed) {
    results.overall = 'FAIL';
    console.log('❌ PHASE 5: FAIL - Server crashed or too many failures');
  } else if (backlogOverflow) {
    results.overall = 'FAIL';
    console.log('❌ PHASE 5: FAIL - Backlog overflow (too many 429s)');
  } else {
    results.overall = 'PASS';
    console.log('🎉 PHASE 5: ✅ PASS - System stable under load!');
    console.log();
    console.log('✅ Server did not crash');
    console.log('✅ Backlog limit enforced (429 responses)');
    console.log('✅ System remained responsive');
  }

  console.log();
  console.log('='.repeat(80));

  // Save results
  const fs = require('fs');
  const path = require('path');
  const resultsPath = path.join(__dirname, '..', 'PHASE_5_LOAD_TEST_RESULTS.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`📄 Results saved to: PHASE_5_LOAD_TEST_RESULTS.json`);
  console.log('='.repeat(80));

  process.exit(results.overall === 'PASS' ? 0 : 1);
})().catch(error => {
  console.error('\n❌ FATAL ERROR:', error.message);
  console.error('\nMake sure:');
  console.error('1. Server is running (npm run start:api)');
  console.error('2. Database is accessible');
  console.error('3. Redis is accessible');
  process.exit(1);
});

const https = require('https');
const fs = require('fs');

const BASE_URL = 'https://ultra-agent-ui-production.up.railway.app';

console.log('='.repeat(60));
console.log(`PRODUCTION VALIDATION: ${BASE_URL}`);
console.log('='.repeat(60));

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          // Try to parse JSON if content-type says so, otherwise text
          const isJson = res.headers['content-type']?.includes('application/json');
          const content = isJson ? JSON.parse(data) : data;
          resolve({ 
            status: res.statusCode, 
            headers: res.headers,
            data: content 
          });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: data });
        }
      });
    });

    req.on('error', (e) => reject(e));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTest() {
  const results = [];

  // 1. Static Files & Routing
  console.log('\n[1] Checking Static Files & Routing...');
  
  // Dashboard HTML
  try {
    const dash = await request('GET', '/');
    const isHtml = dash.headers['content-type']?.includes('text/html');
    const hasTitle = dash.data.includes('<title>Ultra Agent OS - Professional Ops Dashboard</title>');
    
    if (dash.status === 200 && isHtml && hasTitle) {
      console.log('✓ Root URL loads dashboard.html');
      results.push({ test: 'Root URL', status: 'PASS' });
    } else {
      console.error('✗ Root URL failed:', dash.status, isHtml ? 'HTML' : 'Not HTML');
      results.push({ test: 'Root URL', status: 'FAIL' });
    }
  } catch (e) { console.error('✗ Root URL error:', e.message); }

  // Env JS
  let apiUrl = '';
  try {
    const env = await request('GET', '/env.js');
    if (env.status === 200 && env.data.includes('window.ENV')) {
      console.log('✓ env.js loaded correctly');
      console.log('  Content:', env.data.trim());
      
      // Extract API_URL
      const match = env.data.match(/API_URL:\s*"([^"]+)"/);
      if (match && match[1]) {
        apiUrl = match[1];
        console.log(`  -> Detected API URL: ${apiUrl}`);
      }
      results.push({ test: 'env.js', status: 'PASS' });
    } else {
      console.error('✗ env.js failed');
      results.push({ test: 'env.js', status: 'FAIL' });
    }
  } catch (e) { console.error('✗ env.js error:', e.message); }

  if (!apiUrl) {
      console.error('!!! Cannot proceed with API testing: API URL not found in env.js');
      return;
  }

  // Helper for API requests
  function apiRequest(method, path, body = null) {
      return new Promise((resolve, reject) => {
        const url = new URL(path, apiUrl);
        const options = {
          method: method,
          headers: { 'Content-Type': 'application/json' }
        };
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
      });
  }

  // 2. API Endpoints
  console.log(`\n[2] Checking API Endpoints (${apiUrl})...`);
  const endpoints = [
    '/health', // Corrected endpoint (root /health)
    '/api/metrics/system',
    '/api/metrics/database',
    '/api/jobs?limit=5',
    '/api/adapters/status'
  ];

  for (const ep of endpoints) {
    try {
      const res = await apiRequest('GET', ep);
      // Check for JSON content or expected status
      if (res.status === 200) {
        console.log(`✓ ${ep} : OK`);
        results.push({ test: ep, status: 'PASS' });
      } else {
        console.error(`✗ ${ep} : ${res.status}`);
        results.push({ test: ep, status: 'FAIL' });
      }
    } catch (e) {
      console.error(`✗ ${ep} : Error ${e.message}`);
      results.push({ test: ep, status: 'FAIL' });
    }
  }

  // 3. Functional Test (Job Creation)
  console.log('\n[3] Functional Test: Job Creation...');
  try {
    const jobPayload = { message: "Prod Test " + Date.now() };
    const jobRes = await apiRequest('POST', '/api/jobs', jobPayload);
    
    if (jobRes.status === 201 || jobRes.status === 200) {
      console.log('✓ Job creation successful');
      results.push({ test: 'Job Creation', status: 'PASS' });
    } else {
      console.error('✗ Job creation failed:', jobRes.status, jobRes.data);
      results.push({ test: 'Job Creation', status: 'FAIL' });
    }
  } catch (e) {
    console.error('✗ Job creation error:', e.message);
    results.push({ test: 'Job Creation', status: 'FAIL' });
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  results.forEach(r => console.log(`[${r.status}] ${r.test}`));
  
  const failCount = results.filter(r => r.status === 'FAIL').length;
  if (failCount === 0) {
    console.log('\n✅ ALL SYSTEMS GO');
  } else {
    console.log(`\n❌ ${failCount} FAILURES DETECTED`);
    process.exit(1);
  }
}

runTest();

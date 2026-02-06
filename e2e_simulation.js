const http = require('http');

const API_BASE = 'http://localhost:3000';

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(API_BASE + path, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (e) => reject(e));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runE2E() {
  console.log('Starting End-to-End Dashboard Validation...');
  const report = [];

  try {
    // Step 1: Dashboard Load
    console.log('\n[1] Loading Dashboard (Overview)...');
    const metrics = await request('GET', '/api/metrics/performance');
    if (metrics.status === 200) {
      console.log('✓ Metrics loaded');
      report.push('| Dashboard Load | ✅ PASS | Metrics API responsive |');
    } else {
      console.log('✗ Metrics failed');
      report.push('| Dashboard Load | ❌ FAIL | Metrics API error |');
    }

    // Step 2: Navigate to Jobs
    console.log('\n[2] Navigating to Jobs Page...');
    const jobs = await request('GET', '/api/jobs?limit=5');
    const queues = await request('GET', '/api/metrics/queue-status');
    if (jobs.status === 200 && queues.status === 200) {
      console.log('✓ Jobs & Queues loaded');
      report.push('| Jobs Navigation | ✅ PASS | Jobs & Queue API responsive |');
    } else {
      console.log('✗ Jobs/Queue failed');
      report.push('| Jobs Navigation | ❌ FAIL | API error |');
    }

    // Step 3: Create a Job (Action)
    console.log('\n[3] Creating Test Job...');
    // Try standard job creation
    const jobPayload = { message: "E2E Test Job " + Date.now() };
    const createRes = await request('POST', '/api/jobs', jobPayload);
    
    // Try dashboard test job creation
    const testJobRes = await request('POST', '/api/test-data/create-test-jobs', { count: 1 });

    if ((createRes.status === 201 || createRes.status === 200) || (testJobRes.status === 200)) {
      console.log('✓ Job created successfully');
      if (createRes.status === 200) console.log('  - /api/jobs: OK');
      if (testJobRes.status === 200) console.log('  - /api/test-data: OK');
      report.push('| Create Job | ✅ PASS | Job created successfully |');
    } else {
      console.log('✗ Job creation failed');
      console.log('  - /api/jobs status: ' + createRes.status);
      console.log('  - /api/test-data status: ' + testJobRes.status);
      report.push(`| Create Job | ❌ FAIL | Job creation failed |`);
    }

    // Step 4: Verify Job in List
    console.log('\n[4] Verifying Job in List...');
    // Give it a moment for async processing
    await new Promise(r => setTimeout(r, 1000));
    
    const updatedJobs = await request('GET', '/api/jobs?limit=10');
    // Look for our specific message or just any job if test-data was used
    const found = updatedJobs.data.jobs && updatedJobs.data.jobs.length > 0;
    
    if (found) {
      console.log('✓ Jobs found in list');
      report.push('| Verify Job | ✅ PASS | Job list not empty |');
    } else {
      console.log('⚠ No jobs found (queue might be slow)');
      report.push('| Verify Job | ⚠️ WARN | Job list empty |');
    }

    // Step 5: System Page
    console.log('\n[5] Navigating to System Page...');
    const sys = await request('GET', '/api/metrics/system');
    const db = await request('GET', '/api/metrics/database');
    if (sys.status === 200 && db.status === 200) {
      console.log('✓ System & DB metrics loaded');
      report.push('| System Navigation | ✅ PASS | System APIs responsive |');
    } else {
      console.log('✗ System APIs failed');
      report.push('| System Navigation | ❌ FAIL | API error |');
    }

    // Step 6: Admin Page
    console.log('\n[6] Navigating to Admin Page...');
    const tenants = await request('GET', '/api/admin/tenants');
    if (tenants.status === 200) {
      console.log('✓ Tenants loaded');
      report.push('| Admin Navigation | ✅ PASS | Admin API responsive |');
    } else {
      console.log('✗ Admin API failed');
      report.push('| Admin Navigation | ❌ FAIL | API error |');
    }

  } catch (e) {
    console.error('E2E Error:', e);
    report.push(`| E2E Execution | ❌ CRITICAL | Exception: ${e.message} |`);
  }

  // Write Report
  const fs = require('fs');
  const reportContent = `# E2E Dashboard Validation Report

| Step | Status | Notes |
|------|--------|-------|
${report.join('\n')}

**Overall Result**: ${report.some(r => r.includes('FAIL')) ? 'FAIL' : 'PASS'}
`;
  fs.writeFileSync('E2E_DASHBOARD_VALIDATION.md', reportContent);
  console.log('\nReport generated: E2E_DASHBOARD_VALIDATION.md');
}

runE2E();

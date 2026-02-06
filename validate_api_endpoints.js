const http = require('http');

const API_BASE = 'http://localhost:3000';

const endpoints = [
  '/api/metrics/system',
  '/api/metrics/database',
  '/api/metrics/performance',
  '/api/jobs?limit=10',
  '/api/memory/workspace',
  '/api/adapters/status',
  '/api/admin/tenants',
  '/api/metrics/queue-status'
];

async function checkEndpoint(path) {
  return new Promise((resolve) => {
    http.get(API_BASE + path, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          path,
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          data: data.length > 100 ? data.substring(0, 100) + '...' : data
        });
      });
    }).on('error', (err) => {
      resolve({
        path,
        status: 'ERROR',
        ok: false,
        error: err.message
      });
    });
  });
}

async function runValidation() {
  console.log('Starting API Validation...');
  const results = [];
  
  for (const endpoint of endpoints) {
    const result = await checkEndpoint(endpoint);
    results.push(result);
    console.log(`[${result.ok ? 'PASS' : 'FAIL'}] ${result.path} (${result.status})`);
    if (!result.ok && result.status !== 404) {
        console.log('   Response:', result.data);
    }
  }

  // Generate Report
  const fs = require('fs');
  const report = `# API Validation Report

| Endpoint | Status | Result |
|----------|--------|--------|
${results.map(r => `| \`${r.path}\` | ${r.status} | ${r.ok ? '✅' : '❌'} |`).join('\n')}

## Findings
${results.filter(r => !r.ok).map(r => `- **${r.path}** failed with status ${r.status}`).join('\n')}
`;

  fs.writeFileSync('SCREEN_FUNCTION_TEST.md', report);
  console.log('Report generated: SCREEN_FUNCTION_TEST.md');
}

runValidation();

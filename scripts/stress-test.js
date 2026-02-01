const axios = require('axios');
const API_URL = process.env.API_URL || 'http://localhost:3000';

const TOTAL_REQUESTS = 30;
const CONCURRENCY = 5;

async function runStressTest() {
  console.log(`Starting stress test against ${API_URL}`);
  console.log(`Sending ${TOTAL_REQUESTS} requests with concurrency ${CONCURRENCY}...`);

  let success = 0;
  let failed = 0;
  const start = Date.now();

  const requests = Array.from({ length: TOTAL_REQUESTS }, (_, i) => i);
  
  // Login first to get token
  let token;
  try {
    const login = await axios.post(`${API_URL}/api/auth/login`, {
      username: 'admin',
      password: process.env.DEFAULT_ADMIN_PASSWORD || 'admin123'
    });
    token = login.data.token;
  } catch (e) {
    console.error('Login failed so cannot run authenticated stress test', e.message);
    process.exit(1);
  }

  const client = axios.create({
    headers: { Authorization: `Bearer ${token}` }
  });

  // Process in chunks
  for (let i = 0; i < requests.length; i += CONCURRENCY) {
    const chunk = requests.slice(i, i + CONCURRENCY);
    const promises = chunk.map(id => 
      client.get(`${API_URL}/api/adapters/status`)
        .then(() => {
          process.stdout.write('.');
          success++;
        })
        .catch((e) => {
          process.stdout.write('x');
          failed++;
          console.error(`\nReq ${id} failed: ${e.message}`);
        })
    );
    await Promise.all(promises);
  }

  const duration = (Date.now() - start) / 1000;
  console.log('\n\nStress Test Results:');
  console.log(`Duration: ${duration}s`);
  console.log(`Successful: ${success}`);
  console.log(`Failed: ${failed}`);
  
  if (failed > 0) {
    console.error('Stress test failed with errors');
    process.exit(1);
  }
  
  console.log('Stress test passed');
}

runStressTest();

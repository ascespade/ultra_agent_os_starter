const axios = require('axios');
const API_URL = process.env.API_URL || 'http://localhost:3000';

const TOTAL_REQUESTS = 50;
const CONCURRENCY = 10;

async function runBurstTest() {
  console.log(`Starting burst test against ${API_URL}`);
  console.log(`Sending ${TOTAL_REQUESTS} chat requests with concurrency ${CONCURRENCY}...`);

  let success = 0;
  let failed = 0;
  const start = Date.now();

  // Login first to get token
  let token;
  try {
    const login = await axios.post(`${API_URL}/api/auth/login`, {
      username: 'admin',
      password: process.env.DEFAULT_ADMIN_PASSWORD || 'admin'
    });
    token = login.data.token;
    console.log('✅ Login successful');
  } catch (e) {
    console.error('❌ Login failed:', e.message);
    process.exit(1);
  }

  const client = axios.create({
    headers: { Authorization: `Bearer ${token}` }
  });

  // Process in chunks
  for (let i = 0; i < TOTAL_REQUESTS; i += CONCURRENCY) {
    const chunk = Array.from({ length: Math.min(CONCURRENCY, TOTAL_REQUESTS - i) }, (_, j) => i + j);
    
    const promises = chunk.map(id => 
      client.post(`${API_URL}/api/chat`, {
        message: `Burst test message ${id + 1}`
      })
      .then((response) => {
        process.stdout.write('.');
        success++;
        return response.data.jobId;
      })
      .catch((e) => {
        process.stdout.write('x');
        failed++;
        if (e.response && e.response.status === 429) {
          console.log(`\n⚠️  Rate limited on request ${id + 1}`);
        }
        return null;
      })
    );
    
    const results = await Promise.all(promises);
    
    // Small delay between chunks to avoid overwhelming
    if (i + CONCURRENCY < TOTAL_REQUESTS) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  const duration = Date.now() - start;
  const rps = (success / duration) * 1000;

  console.log(`\n\n📊 BURST TEST RESULTS`);
  console.log(`==================`);
  console.log(`✅ Successful: ${success}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((success / TOTAL_REQUESTS) * 100).toFixed(1)}%`);
  console.log(`⏱️  Duration: ${duration}ms`);
  console.log(`🚀 Requests/sec: ${rps.toFixed(2)}`);

  // Check system health after burst
  try {
    const health = await axios.get(`${API_URL}/health`);
    console.log(`🏥 System Health: ${health.data.status}`);
    
    const adapters = await client.get(`${API_URL}/api/adapters/status`);
    const backlog = adapters.data.redis.queue_length || 0;
    console.log(`📦 Queue Backlog: ${backlog}`);
    
    if (backlog <= 100) {
      console.log(`✅ Backlog within acceptable limits`);
    } else {
      console.log(`⚠️  Backlog exceeds acceptable limits`);
    }
    
  } catch (e) {
    console.error(`❌ Health check failed:`, e.message);
  }

  // Final verdict
  if (success >= TOTAL_REQUESTS * 0.9) { // 90% success rate acceptable
    console.log(`\n🎉 BURST TEST: ✅ PASS`);
    process.exit(0);
  } else {
    console.log(`\n❌ BURST TEST: FAIL`);
    process.exit(1);
  }
}

runBurstTest().catch(console.error);

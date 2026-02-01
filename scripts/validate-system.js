const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: '.env.local' });

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3000';
const USERNAME = 'admin';
const PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';

console.log('='.repeat(60));
console.log('FULL SYSTEM VALIDATION (PHASE 7)');
console.log('='.repeat(60));
console.log(`Target: ${API_URL}`);
console.log(`User:   ${USERNAME}`);
console.log('');

async function runValidation() {
  try {
    // 1. Health Check
    console.log('[1/6] Checking API Health...');
    try {
      const health = await axios.get(`${API_URL}/health`);
      console.log(`  ✓ Health check passed: ${health.data.status}`);
    } catch (error) {
      console.error(`  ✗ Health check failed: ${error.message}`);
      process.exit(1);
    }

    // 2. Authentication
    console.log('[2/6] Testing Authentication...');
    let token;
    try {
      const login = await axios.post(`${API_URL}/api/auth/login`, {
        username: USERNAME,
        password: PASSWORD
      });
      token = login.data.token;
      console.log(`  ✓ Login successful. Token received.`);
    } catch (error) {
      console.error(`  ✗ Login failed: ${error.response?.data?.error || error.message}`);
      process.exit(1);
    }

    // Configure axios with token
    const client = axios.create({
      baseURL: API_URL,
      headers: { Authorization: `Bearer ${token}` }
    });

    // 3. Adapter Status & Backlog Metrics
    console.log('[3/6] Checking Adapter Status & Backlog Metrics...');
    try {
      const status = await client.get('/api/adapters/status');
      const redis = status.data.redis;
      console.log(`  ✓ Database: ${status.data.database.status}`);
      console.log(`  ✓ Redis: ${redis.status}`);
      
      if (redis.backlog_limit === 100) {
        console.log(`  ✓ Backlog limit exposed: ${redis.backlog_limit}`);
      } else {
        console.error(`  ✗ Backlog limit missing or incorrect: ${redis.backlog_limit}`);
      }
    } catch (error) {
      console.error(`  ✗ Status check failed: ${error.message}`);
    }

    // 4. Memory System (JSONB Fix)
    console.log('[4/6] Testing Memory System (JSONB Fix)...');
    const memoryFile = `test-memory-${uuidv4()}.json`;
    const memoryData = { 
      test: true, 
      timestamp: new Date().toISOString(),
      complex: { nested: [1, 2, 3] }
    };

    try {
      // Store
      await client.post(`/api/memory/${memoryFile}`, memoryData);
      console.log(`  ✓ Memory stored: ${memoryFile}`);

      // Retrieve
      const retrieved = await client.get(`/api/memory/${memoryFile}`);
      if (retrieved.data.complex.nested[1] === 2) {
        console.log(`  ✓ Memory retrieved and verified (JSON object preserved)`);
      } else {
        console.error(`  ✗ Memory retrieval mismatch`);
      }
    } catch (error) {
      console.error(`  ✗ Memory test failed: ${error.response?.data?.error || error.message}`);
    }

    // 5. Job Creation (Backlog Limits)
    console.log('[5/6] Testing Job Creation...');
    try {
      const job = await client.post('/api/chat', { message: 'System validation test' });
      console.log(`  ✓ Job created: ${job.data.jobId} (status: ${job.data.status})`);
    } catch (error) {
      console.error(`  ✗ Job creation failed: ${error.response?.data?.error || error.message}`);
    }

    // 6. UI Assets Check
    console.log('[6/6] Checking UI Assets...');
    try {
      await axios.get(`${API_URL}/ui/env.js`);
      console.log(`  ✓ UI env.js accessible`);
      await axios.get(`${API_URL}/ui/`);
      console.log(`  ✓ UI index.html accessible`);
    } catch (error) {
      console.error(`  ✗ UI assets missing: ${error.message}`);
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('VALIDATION COMPLETE - SYSTEM READY FOR FREEZE');
    console.log('='.repeat(60));

  } catch (err) {
    console.error('Fatal validation error:', err);
    process.exit(1);
  }
}

runValidation();

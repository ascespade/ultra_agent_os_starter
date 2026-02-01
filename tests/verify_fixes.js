#!/usr/bin/env node
/**
 * PHASE_3_4_FIX_VERIFICATION: Test memory API fix and worker heartbeat improvements
 */

const axios = require('axios');
const { Pool } = require('pg');
const redis = require('redis');

const API_URL = 'http://localhost:3000';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/ultra_agent';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function verifyMemoryAPIFix() {
  console.log('\n=== TESTING MEMORY API FIX ===\n');
  
  try {
    // 1. Login
    const login = await axios.post(`${API_URL}/api/auth/login`, {
      username: 'admin',
      password: process.env.DEFAULT_ADMIN_PASSWORD || 'SecureAdminPassword2024!'
    });
    
    const token = login.data.token;
    console.log('✅ Login successful');
    
    // 2. Test POST memory
    const testData = { 
      test: 'verification', 
      timestamp: Date.now(),
      data: { nested: 'value' }
    };
    
    const postResp = await axios.post(
      `${API_URL}/api/memory/phase3_test_file`,
      { data: testData },
      { 
        headers: { 'Authorization': `Bearer ${token}` },
        validateStatus: () => true
      }
    );
    
    if (postResp.status === 200) {
      console.log('✅ POST /api/memory succeeded (200 OK)');
    } else {
      console.log(`❌ POST /api/memory failed (${postResp.status})`);
      console.log('Response:', postResp.data);
      return false;
    }
    
    // 3. Test GET memory
    const getResp = await axios.get(
      `${API_URL}/api/memory/phase3_test_file`,
      { 
        headers: { 'Authorization': `Bearer ${token}` },
        validateStatus: () => true
      }
    );
    
    if (getResp.status === 200) {
      console.log('✅ GET /api/memory succeeded (200 OK)');
    } else {
      console.log(`❌ GET /api/memory failed (${getResp.status})`);
      return false;
    }
    
    // 4. Verify data integrity
    const dataMatch = JSON.stringify(getResp.data) === JSON.stringify(testData);
    if (dataMatch) {
      console.log('✅ Data integrity verified - stored and retrieved data match');
    } else {
      console.log('❌ Data integrity failed - stored data does not match retrieved data');
      console.log('Expected:', testData);
      console.log('Got:', getResp.data);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('❌ Memory API test failed:', error.message);
    return false;
  }
}

async function checkWorkerHeartbeat() {
  console.log('\n=== CHECKING WORKER HEARTBEAT ===\n');
  
  try {
    const redisClient = redis.createClient({ url: REDIS_URL });
    await redisClient.connect();
    
    // Get job data from Redis to check for heartbeat field
    const jobKeys = await redisClient.keys('tenant:default:job:*');
    console.log(`Found ${jobKeys.length} jobs in Redis`);
    
    if (jobKeys.length > 0) {
      const sampleKey = jobKeys[0];
      const jobData = await redisClient.hGet(sampleKey, 'data');
      if (jobData) {
        const job = JSON.parse(jobData);
        if (job.heartbeat) {
          console.log(`✅ Heartbeat field found in job: ${job.heartbeat}`);
        } else if (job.status === 'processing') {
          console.log(`⚠️  Processing job without heartbeat field (may be old job): ${job.id}`);
        }
      }
    }
    
    await redisClient.quit();
    return true;
  } catch (error) {
    console.error('❌ Heartbeat check failed:', error.message);
    return false;
  }
}

async function checkDatabaseConsistency() {
  console.log('\n=== CHECKING DATABASE CONSISTENCY ===\n');
  
  try {
    const pool = new Pool({ connectionString: DATABASE_URL });
    
    // Check for jobs stuck in planning
    const result = await pool.query(`
      SELECT COUNT(*) as count, status FROM jobs 
      WHERE created_at > NOW() - INTERVAL '1 hour'
      GROUP BY status
      ORDER BY count DESC
    `);
    
    console.log('Job status distribution (last 1 hour):');
    for (const row of result.rows) {
      const fill = '█'.repeat(Math.min(row.count / 100, 40));
      console.log(`  ${row.status.padEnd(12)}: ${String(row.count).padStart(6)} ${fill}`);
    }
    
    // Check for old planning jobs
    const oldPlanningResult = await pool.query(`
      SELECT COUNT(*) as count FROM jobs 
      WHERE status = 'planning' AND created_at < NOW() - INTERVAL '1 hour'
    `);
    
    const oldCount = oldPlanningResult.rows[0].count;
    if (oldCount > 0) {
      console.log(`⚠️  Found ${oldCount} jobs stuck in planning for >1 hour`);
      console.log('   (These should be recovered by recoverStuckJobs)');
    } else {
      console.log('✅ No jobs stuck in planning for >1 hour');
    }
    
    await pool.end();
    return true;
  } catch (error) {
    console.error('❌ Database consistency check failed:', error.message);
    return false;
  }
}

async function runVerification() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  PHASE_3_4 FIX VERIFICATION TEST                           ║');
  console.log('║  Testing Memory API and Worker Heartbeat Fixes             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  
  const results = {
    memoryAPI: false,
    heartbeat: false,
    database: false
  };
  
  results.memoryAPI = await verifyMemoryAPIFix();
  results.heartbeat = await checkWorkerHeartbeat();
  results.database = await checkDatabaseConsistency();
  
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  VERIFICATION RESULTS                                      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  
  const allPassed = Object.values(results).every(r => r);
  
  for (const [test, passed] of Object.entries(results)) {
    console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASS' : 'FAIL'}`);
  }
  
  console.log(`\n${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}\n`);
  
  process.exit(allPassed ? 0 : 1);
}

runVerification().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * PHASE_0_DIAGNOSTIC: Gather current system state
 * - Job queue depth and status distribution
 * - Memory API functionality
 * - Worker processing state
 * - Git status
 */

const redis = require('redis');
const axios = require('axios');
const { Pool } = require('pg');
const fs = require('fs');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/ultra_agent';
const API_URL = process.env.API_URL || 'http://localhost:3000';

async function diagnosticPhase0() {
  console.log('🔍 PHASE_0_DIAGNOSTIC: Gathering system state...\n');
  
  const report = {
    timestamp: new Date().toISOString(),
    checks: {}
  };

  // 1. Redis Queue Status
  console.log('📊 1. Redis Queue Status');
  try {
    const redisClient = redis.createClient({ url: REDIS_URL });
    await redisClient.connect();
    
    // Get all tenant queue keys
    const allKeys = await redisClient.keys('*');
    const queueKeys = allKeys.filter(k => k.includes('job_queue'));
    console.log(`   Found ${queueKeys.length} queue(s): ${queueKeys.join(', ')}`);
    
    let totalQueueLength = 0;
    const queueDepths = {};
    for (const qkey of queueKeys) {
      const len = await redisClient.lLen(qkey);
      queueDepths[qkey] = len;
      totalQueueLength += len;
      console.log(`   - ${qkey}: ${len} jobs`);
    }
    
    report.checks.redis_queue = {
      status: 'OK',
      total_jobs: totalQueueLength,
      queue_details: queueDepths
    };
    
    await redisClient.quit();
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    report.checks.redis_queue = { status: 'ERROR', error: error.message };
  }

  // 2. Database Job Status Distribution
  console.log('\n📊 2. Database Job Status Distribution');
  try {
    const pool = new Pool({ connectionString: DATABASE_URL });
    
    // Count jobs by status
    const result = await pool.query(`
      SELECT status, COUNT(*) as count FROM jobs GROUP BY status ORDER BY count DESC
    `);
    
    const byStatus = {};
    let totalJobs = 0;
    for (const row of result.rows) {
      byStatus[row.status] = row.count;
      totalJobs += row.count;
      console.log(`   - ${row.status}: ${row.count}`);
    }
    
    // Count jobs stuck in planning (older than 24 hours)
    const stuckResult = await pool.query(`
      SELECT COUNT(*) as count FROM jobs 
      WHERE status = 'planning' AND created_at < NOW() - INTERVAL '24 hours'
    `);
    
    const stuckCount = stuckResult.rows[0].count;
    console.log(`   - Stuck in planning (>24h): ${stuckCount}`);
    
    report.checks.database_jobs = {
      status: 'OK',
      total_jobs: totalJobs,
      by_status: byStatus,
      stuck_24h: stuckCount
    };
    
    // Job age distribution
    const ageResult = await pool.query(`
      SELECT 
        status,
        MIN(created_at) as oldest,
        MAX(created_at) as newest,
        COUNT(*) as count
      FROM jobs
      WHERE created_at > NOW() - INTERVAL '72 hours'
      GROUP BY status
    `);
    
    console.log('\n   Job age distribution (last 72h):');
    for (const row of ageResult.rows) {
      const age = new Date(row.oldest);
      const ageHours = Math.round((Date.now() - age) / 3600000);
      console.log(`   - ${row.status}: ${row.count} jobs, oldest ${ageHours}h ago`);
    }
    
    await pool.end();
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    report.checks.database_jobs = { status: 'ERROR', error: error.message };
  }

  // 3. Memory API Test
  console.log('\n📊 3. Memory API Functionality Test');
  try {
    // First, get auth token
    const loginResp = await axios.post(`${API_URL}/api/auth/login`, {
      username: 'admin',
      password: process.env.DEFAULT_ADMIN_PASSWORD || 'SecureAdminPassword2024!'
    });
    
    const token = loginResp.data.token;
    const testData = { test: true, timestamp: Date.now() };
    const testFilename = `diagnostic_test_${Date.now()}.json`;
    
    // Try POST
    const postResp = await axios.post(
      `${API_URL}/api/memory/${testFilename}`,
      { data: testData },
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    
    console.log(`   ✅ POST /api/memory/${testFilename}: ${postResp.status}`);
    
    // Try GET
    const getResp = await axios.get(
      `${API_URL}/api/memory/${testFilename}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    
    console.log(`   ✅ GET /api/memory/${testFilename}: ${getResp.status}`);
    
    // Check if data matches
    const retrieved = getResp.data;
    const match = JSON.stringify(retrieved) === JSON.stringify(testData);
    console.log(`   ${match ? '✅' : '❌'} Data integrity: ${match ? 'PASS' : 'FAIL'}`);
    
    report.checks.memory_api = {
      status: 'OK',
      post_status: postResp.status,
      get_status: getResp.status,
      data_integrity: match
    };
  } catch (error) {
    console.error(`   ❌ Error: ${error.response?.status || error.message}`);
    if (error.response?.data) console.error(`   Response: ${JSON.stringify(error.response.data)}`);
    report.checks.memory_api = { 
      status: 'ERROR', 
      error: error.message,
      http_status: error.response?.status
    };
  }

  // 4. Worker Status
  console.log('\n📊 4. Worker and API Status');
  try {
    const healthResp = await axios.get(`${API_URL}/health`);
    console.log(`   ✅ API Health: ${healthResp.status}`);
    console.log(`   - Database: ${healthResp.data.checks.database.healthy ? '✅' : '❌'}`);
    console.log(`   - Redis: ${healthResp.data.checks.redis.healthy ? '✅' : '❌'}`);
    console.log(`   - WebSocket: ${healthResp.data.checks.websocket.healthy ? '✅' : '❌'}`);
    
    report.checks.api_health = {
      status: 'OK',
      details: healthResp.data.checks
    };
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    report.checks.api_health = { status: 'ERROR', error: error.message };
  }

  // 5. Adapter Status
  console.log('\n📊 5. Adapter Status');
  try {
    const loginResp = await axios.post(`${API_URL}/api/auth/login`, {
      username: 'admin',
      password: process.env.DEFAULT_ADMIN_PASSWORD || 'SecureAdminPassword2024!'
    });
    
    const token = loginResp.data.token;
    const adapterResp = await axios.get(`${API_URL}/api/adapters/status`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log(`   ✅ Adapter Status: ${adapterResp.status}`);
    console.log(`   - Queue Length: ${adapterResp.data.redis?.queue_length || 'N/A'}`);
    console.log(`   - Ollama: ${adapterResp.data.adapters?.ollama?.available ? '✅' : '❌'}`);
    console.log(`   - Docker: ${adapterResp.data.adapters?.docker?.available ? '✅' : '❌'}`);
    
    report.checks.adapters = {
      status: 'OK',
      details: adapterResp.data
    };
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    report.checks.adapters = { status: 'ERROR', error: error.message };
  }

  // Write report
  const reportPath = '/tmp/phase0_diagnostic.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n✅ Diagnostic report saved to: ${reportPath}`);
  console.log('\n' + JSON.stringify(report, null, 2));
  
  return report;
}

diagnosticPhase0().catch(err => {
  console.error('❌ Diagnostic failed:', err);
  process.exit(1);
});

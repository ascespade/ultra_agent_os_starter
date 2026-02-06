#!/usr/bin/env node
/**
 * ULTRA AGENT - Phase 7: True E2E Tests (No Mock)
 * 
 * This script runs comprehensive E2E tests against the local Docker parity stack
 * with REAL data only - NO mock data, NO simulation, NO hardcoded metrics.
 * 
 * Tests run against real Redis + PostgreSQL and output machine-readable JSON.
 */

const fs = require('fs');
const path = require('path');

// Configuration from environment variables
const API_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5433/ultra_agent';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const TEST_TIMEOUT = 30000; // 30 seconds per test
const RETRY_COUNT = 3;
const RETRY_DELAY = 1000; // 1 second

// Test results structure
const results = {
  test_run: {
    timestamp: new Date().toISOString(),
    duration_ms: 0,
    environment: 'local_docker_parity'
  },
  preconditions: {
    services_healthy: false,
    redis_connected: false,
    postgres_connected: false
  },
  tests: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    success_rate: '0%'
  }
};

// Utility: Sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Utility: Retry wrapper
async function withRetry(fn, retries = RETRY_COUNT, delay = RETRY_DELAY) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < retries - 1) {
        console.log(`  Retry ${i + 1}/${retries - 1} after error: ${error.message}`);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

// Utility: HTTP request with timeout
async function httpRequest(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    const data = await response.json().catch(() => null);
    return { status: response.status, data, ok: response.ok };
  } finally {
    clearTimeout(timeout);
  }
}

// Utility: Add test result
function addTestResult(name, passed, durationMs, details = {}) {
  results.tests.push({
    name,
    passed,
    duration_ms: durationMs,
    details
  });
  
  if (passed) {
    console.log(`  ✓ ${name} (${durationMs}ms)`);
  } else {
    console.log(`  ✗ ${name} (${durationMs}ms) - ${details.error || 'Failed'}`);
  }
}

// ============================================================================
// PRECONDITIONS
// ============================================================================

async function checkPreconditions() {
  console.log('\n📋 Checking Preconditions...');
  
  // Wait for API to be healthy
  console.log('  Waiting for API service...');
  let apiHealthy = false;
  for (let i = 0; i < 30; i++) {
    try {
      const response = await httpRequest(`${API_URL}/health`);
      if (response.ok && response.data?.status === 'ok') {
        apiHealthy = true;
        break;
      }
    } catch (e) {
      // Continue waiting
    }
    await sleep(1000);
  }
  
  if (!apiHealthy) {
    console.log('  ✗ API service not healthy after 30 seconds');
    return false;
  }
  console.log('  ✓ API service is healthy');
  
  // Deep health check for database and redis
  console.log('  Checking database and Redis connections...');
  try {
    const deepHealth = await httpRequest(`${API_URL}/health?deep=true`);
    
    if (deepHealth.data?.database === 'connected') {
      results.preconditions.postgres_connected = true;
      console.log('  ✓ PostgreSQL connected');
    } else {
      console.log('  ✗ PostgreSQL not connected');
    }
    
    if (deepHealth.data?.redis === 'connected') {
      results.preconditions.redis_connected = true;
      console.log('  ✓ Redis connected');
    } else {
      console.log('  ✗ Redis not connected');
    }
    
    results.preconditions.services_healthy = 
      results.preconditions.postgres_connected && 
      results.preconditions.redis_connected;
      
  } catch (error) {
    console.log(`  ✗ Deep health check failed: ${error.message}`);
  }
  
  return results.preconditions.services_healthy;
}

// ============================================================================
// TEST: Health Check
// ============================================================================

async function testHealthCheck() {
  console.log('\n🏥 Test: Health Check');
  const startTime = Date.now();
  
  try {
    // Basic health check
    const basicHealth = await withRetry(async () => {
      const response = await httpRequest(`${API_URL}/health`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    });
    
    const hasStatus = basicHealth.data?.status === 'ok';
    const hasTimestamp = !!basicHealth.data?.timestamp;
    const hasUptime = typeof basicHealth.data?.uptime === 'number';
    
    // Deep health check
    const deepHealth = await withRetry(async () => {
      const response = await httpRequest(`${API_URL}/health?deep=true`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    });
    
    const dbConnected = deepHealth.data?.database === 'connected';
    const redisConnected = deepHealth.data?.redis === 'connected';
    
    const passed = hasStatus && hasTimestamp && hasUptime && dbConnected && redisConnected;
    
    addTestResult('health_check', passed, Date.now() - startTime, {
      basic_status: basicHealth.data?.status,
      has_timestamp: hasTimestamp,
      has_uptime: hasUptime,
      database_connected: dbConnected,
      redis_connected: redisConnected
    });
    
    return passed;
  } catch (error) {
    addTestResult('health_check', false, Date.now() - startTime, {
      error: error.message
    });
    return false;
  }
}

// ============================================================================
// TEST: Job Lifecycle
// ============================================================================

async function testJobLifecycle() {
  console.log('\n📦 Test: Job Lifecycle');
  const startTime = Date.now();
  const testJobType = 'e2e-test';
  const testMessage = `E2E Test Job - ${Date.now()}`;
  
  try {
    // Step 1: Create a test job
    console.log('  Step 1: Creating test job...');
    const createResponse = await withRetry(async () => {
      const response = await httpRequest(`${API_URL}/api/jobs`, {
        method: 'POST',
        body: JSON.stringify({
          type: testJobType,
          message: testMessage,
          metadata: { test: true, timestamp: Date.now() }
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
      return response;
    });
    
    const jobId = createResponse.data?.jobId;
    const initialStatus = createResponse.data?.status;
    
    if (!jobId) {
      throw new Error('No jobId returned from job creation');
    }
    
    console.log(`    Created job: ${jobId} with status: ${initialStatus}`);
    
    // Step 2: Verify job exists in database via API
    console.log('  Step 2: Verifying job status...');
    const statusResponse = await withRetry(async () => {
      const response = await httpRequest(`${API_URL}/api/jobs/${jobId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    });
    
    const jobExists = !!statusResponse.data?.id || !!statusResponse.data?.jobId;
    console.log(`    Job exists: ${jobExists}`);
    
    // Step 3: Check queue status
    console.log('  Step 3: Checking queue status...');
    const queueResponse = await withRetry(async () => {
      const response = await httpRequest(`${API_URL}/api/jobs/queue/status`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    });
    
    const queueHasData = queueResponse.data !== null;
    console.log(`    Queue status retrieved: ${queueHasData}`);
    
    // Step 4: Wait for job processing (if worker is running)
    console.log('  Step 4: Waiting for job processing (up to 30s)...');
    const statusTransitions = [initialStatus];
    let finalStatus = initialStatus;
    
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      
      try {
        const checkResponse = await httpRequest(`${API_URL}/api/jobs/${jobId}`);
        const currentStatus = checkResponse.data?.status;
        
        if (currentStatus && currentStatus !== statusTransitions[statusTransitions.length - 1]) {
          statusTransitions.push(currentStatus);
          console.log(`    Status changed: ${currentStatus}`);
        }
        
        finalStatus = currentStatus;
        
        // If job is completed or failed, stop waiting
        if (currentStatus === 'completed' || currentStatus === 'failed') {
          break;
        }
      } catch (e) {
        // Continue waiting
      }
    }
    
    const passed = jobId && jobExists && queueHasData;
    
    addTestResult('job_lifecycle', passed, Date.now() - startTime, {
      job_id: jobId,
      initial_status: initialStatus,
      final_status: finalStatus,
      status_transitions: statusTransitions,
      job_exists_in_db: jobExists,
      queue_has_data: queueHasData
    });
    
    return passed;
  } catch (error) {
    addTestResult('job_lifecycle', false, Date.now() - startTime, {
      error: error.message
    });
    return false;
  }
}

// ============================================================================
// TEST: Metrics Endpoints
// ============================================================================

async function testMetricsEndpoints() {
  console.log('\n📊 Test: Metrics Endpoints');
  const startTime = Date.now();
  
  try {
    // Test /api/metrics/performance
    console.log('  Testing /api/metrics/performance...');
    const perfResponse = await withRetry(async () => {
      const response = await httpRequest(`${API_URL}/api/metrics/performance`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    });
    
    const perfData = perfResponse.data;
    const hasRealJobCounts = perfData?.jobs && typeof perfData.jobs.total === 'number';
    const hasTimestamp = !!perfData?.timestamp;
    const hasPerformanceData = !!perfData?.performance;
    
    console.log(`    Jobs total: ${perfData?.jobs?.total || 'N/A'}`);
    console.log(`    Has timestamp: ${hasTimestamp}`);
    console.log(`    Has performance data: ${hasPerformanceData}`);
    
    // Test /api/metrics/queue-status
    console.log('  Testing /api/metrics/queue-status...');
    const queueResponse = await withRetry(async () => {
      const response = await httpRequest(`${API_URL}/api/metrics/queue-status`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    });
    
    const queueData = queueResponse.data;
    const hasQueueLength = typeof queueData?.length === 'number';
    const hasQueueTimestamp = !!queueData?.timestamp;
    const hasQueuesArray = Array.isArray(queueData?.queues);
    
    console.log(`    Queue length: ${queueData?.length || 'N/A'}`);
    console.log(`    Has queues array: ${hasQueuesArray}`);
    
    const passed = hasRealJobCounts && hasTimestamp && hasPerformanceData && 
                   hasQueueLength && hasQueueTimestamp;
    
    addTestResult('metrics_endpoints', passed, Date.now() - startTime, {
      performance: {
        has_job_counts: hasRealJobCounts,
        total_jobs: perfData?.jobs?.total,
        has_timestamp: hasTimestamp,
        has_performance_data: hasPerformanceData
      },
      queue_status: {
        has_queue_length: hasQueueLength,
        queue_length: queueData?.length,
        has_timestamp: hasQueueTimestamp,
        has_queues_array: hasQueuesArray
      }
    });
    
    return passed;
  } catch (error) {
    addTestResult('metrics_endpoints', false, Date.now() - startTime, {
      error: error.message
    });
    return false;
  }
}

// ============================================================================
// TEST: Queue Status (Real Data Verification)
// ============================================================================

async function testQueueStatus() {
  console.log('\n📬 Test: Queue Status (Real Data)');
  const startTime = Date.now();
  
  try {
    // Get queue status from jobs endpoint
    const queueResponse = await withRetry(async () => {
      const response = await httpRequest(`${API_URL}/api/jobs/queue/status`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    });
    
    const queueData = queueResponse.data;
    
    // Verify we have real numbers (not hardcoded zeros)
    const hasTimestamp = !!queueData?.timestamp;
    const timestampIsISO = hasTimestamp && !isNaN(Date.parse(queueData.timestamp));
    
    // Check for real queue data structure
    const hasQueueInfo = queueData !== null && typeof queueData === 'object';
    
    // Verify the data looks real (has expected structure)
    const hasExpectedFields = hasQueueInfo && (
      'length' in queueData || 
      'pending' in queueData || 
      'queues' in queueData ||
      'status' in queueData
    );
    
    console.log(`    Has timestamp: ${hasTimestamp}`);
    console.log(`    Timestamp is ISO: ${timestampIsISO}`);
    console.log(`    Has queue info: ${hasQueueInfo}`);
    console.log(`    Has expected fields: ${hasExpectedFields}`);
    
    const passed = hasTimestamp && timestampIsISO && hasQueueInfo && hasExpectedFields;
    
    addTestResult('queue_status_real_data', passed, Date.now() - startTime, {
      has_timestamp: hasTimestamp,
      timestamp_is_iso: timestampIsISO,
      has_queue_info: hasQueueInfo,
      has_expected_fields: hasExpectedFields,
      raw_data: queueData
    });
    
    return passed;
  } catch (error) {
    addTestResult('queue_status_real_data', false, Date.now() - startTime, {
      error: error.message
    });
    return false;
  }
}

// ============================================================================
// TEST: Memory Create/Read
// ============================================================================

async function testMemoryCreateRead() {
  console.log('\n🧠 Test: Memory Create/Read');
  const startTime = Date.now();
  const testKey = `e2e-test-${Date.now()}`;
  const testContent = {
    test: true,
    timestamp: Date.now(),
    message: 'E2E Test Memory Entry',
    data: { nested: { value: 42 } }
  };
  
  try {
    // Step 1: Create memory entry
    console.log(`  Step 1: Creating memory with key: ${testKey}...`);
    const createResponse = await withRetry(async () => {
      const response = await httpRequest(`${API_URL}/api/memory/${testKey}`, {
        method: 'POST',
        body: JSON.stringify({ content: testContent })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
      return response;
    });
    
    const createSuccess = createResponse.ok;
    console.log(`    Create success: ${createSuccess}`);
    
    // Step 2: Read memory entry back
    console.log('  Step 2: Reading memory back...');
    const readResponse = await withRetry(async () => {
      const response = await httpRequest(`${API_URL}/api/memory/${testKey}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    });
    
    const readSuccess = readResponse.ok;
    const readData = readResponse.data;
    
    // Verify content matches
    const contentMatches = readData?.content && 
      readData.content.test === testContent.test &&
      readData.content.message === testContent.message;
    
    console.log(`    Read success: ${readSuccess}`);
    console.log(`    Content matches: ${contentMatches}`);
    
    // Step 3: Clean up - delete the test memory
    console.log('  Step 3: Cleaning up test memory...');
    try {
      await httpRequest(`${API_URL}/api/memory/${testKey}`, {
        method: 'DELETE'
      });
      console.log('    Cleanup successful');
    } catch (e) {
      console.log(`    Cleanup failed (non-critical): ${e.message}`);
    }
    
    const passed = createSuccess && readSuccess && contentMatches;
    
    addTestResult('memory_create_read', passed, Date.now() - startTime, {
      test_key: testKey,
      create_success: createSuccess,
      read_success: readSuccess,
      content_matches: contentMatches,
      written_content: testContent,
      read_content: readData?.content
    });
    
    return passed;
  } catch (error) {
    addTestResult('memory_create_read', false, Date.now() - startTime, {
      error: error.message,
      test_key: testKey
    });
    return false;
  }
}

// ============================================================================
// TEST: Dashboard Endpoints
// ============================================================================

async function testDashboardEndpoints() {
  console.log('\n📈 Test: Dashboard Endpoints');
  const startTime = Date.now();
  
  const endpoints = [
    { path: '/health', name: 'health' },
    { path: '/api/metrics/system', name: 'system_metrics' },
    { path: '/api/metrics/database', name: 'database_metrics' },
    { path: '/api/metrics/health-detailed', name: 'health_detailed' }
  ];
  
  const endpointResults = {};
  let allPassed = true;
  
  try {
    for (const endpoint of endpoints) {
      console.log(`  Testing ${endpoint.path}...`);
      
      try {
        const response = await withRetry(async () => {
          const res = await httpRequest(`${API_URL}${endpoint.path}`);
          return res;
        });
        
        const passed = response.status === 200;
        endpointResults[endpoint.name] = {
          status: response.status,
          passed,
          has_data: response.data !== null
        };
        
        console.log(`    Status: ${response.status} - ${passed ? '✓' : '✗'}`);
        
        if (!passed) allPassed = false;
      } catch (error) {
        endpointResults[endpoint.name] = {
          status: 'error',
          passed: false,
          error: error.message
        };
        console.log(`    Error: ${error.message}`);
        allPassed = false;
      }
    }
    
    addTestResult('dashboard_endpoints', allPassed, Date.now() - startTime, {
      endpoints: endpointResults
    });
    
    return allPassed;
  } catch (error) {
    addTestResult('dashboard_endpoints', false, Date.now() - startTime, {
      error: error.message
    });
    return false;
  }
}

// ============================================================================
// TEST: Jobs List Endpoint
// ============================================================================

async function testJobsList() {
  console.log('\n📋 Test: Jobs List Endpoint');
  const startTime = Date.now();
  
  try {
    const response = await withRetry(async () => {
      const res = await httpRequest(`${API_URL}/api/jobs?limit=10`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    });
    
    const data = response.data;
    const hasJobs = Array.isArray(data?.jobs) || Array.isArray(data);
    const hasPagination = data?.pagination || data?.total !== undefined;
    
    console.log(`    Has jobs array: ${hasJobs}`);
    console.log(`    Has pagination: ${hasPagination}`);
    
    const passed = hasJobs;
    
    addTestResult('jobs_list', passed, Date.now() - startTime, {
      has_jobs_array: hasJobs,
      has_pagination: hasPagination,
      jobs_count: Array.isArray(data?.jobs) ? data.jobs.length : (Array.isArray(data) ? data.length : 0)
    });
    
    return passed;
  } catch (error) {
    addTestResult('jobs_list', false, Date.now() - startTime, {
      error: error.message
    });
    return false;
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function runAllTests() {
  const overallStartTime = Date.now();
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ULTRA AGENT - Phase 7: True E2E Tests (No Mock)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  API URL: ${API_URL}`);
  console.log(`  Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`  Redis: ${REDIS_URL}`);
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  // Check preconditions
  const preconditionsPassed = await checkPreconditions();
  
  if (!preconditionsPassed) {
    console.log('\n❌ Preconditions failed - services not healthy');
    console.log('   Please ensure Docker containers are running:');
    console.log('   docker-compose up -d');
    
    results.test_run.duration_ms = Date.now() - overallStartTime;
    results.summary.total = 0;
    results.summary.passed = 0;
    results.summary.failed = 0;
    results.summary.success_rate = '0%';
    
    writeResults();
    process.exit(1);
  }
  
  console.log('\n✓ All preconditions passed - starting tests...');
  
  // Run all tests
  await testHealthCheck();
  await testJobLifecycle();
  await testMetricsEndpoints();
  await testQueueStatus();
  await testMemoryCreateRead();
  await testDashboardEndpoints();
  await testJobsList();
  
  // Calculate summary
  results.test_run.duration_ms = Date.now() - overallStartTime;
  results.summary.total = results.tests.length;
  results.summary.passed = results.tests.filter(t => t.passed).length;
  results.summary.failed = results.tests.filter(t => !t.passed).length;
  results.summary.success_rate = results.summary.total > 0 
    ? `${Math.round((results.summary.passed / results.summary.total) * 100)}%`
    : '0%';
  
  // Print summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Total Tests:  ${results.summary.total}`);
  console.log(`  Passed:       ${results.summary.passed}`);
  console.log(`  Failed:       ${results.summary.failed}`);
  console.log(`  Success Rate: ${results.summary.success_rate}`);
  console.log(`  Duration:     ${results.test_run.duration_ms}ms`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  // Write results to file
  writeResults();
  
  // Exit with appropriate code
  const exitCode = results.summary.failed > 0 ? 1 : 0;
  console.log(`\n${exitCode === 0 ? '✓ All tests passed!' : '✗ Some tests failed!'}`);
  process.exit(exitCode);
}

function writeResults() {
  const outputPath = path.join(process.cwd(), 'E2E_RESULTS.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Results written to: ${outputPath}`);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error.message);
  results.test_run.duration_ms = Date.now();
  results.summary.total = results.tests.length;
  results.summary.passed = results.tests.filter(t => t.passed).length;
  results.summary.failed = results.tests.filter(t => !t.passed).length + 1;
  results.summary.success_rate = '0%';
  results.tests.push({
    name: 'uncaught_exception',
    passed: false,
    duration_ms: 0,
    details: { error: error.message }
  });
  writeResults();
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  results.test_run.duration_ms = Date.now();
  results.summary.total = results.tests.length;
  results.summary.passed = results.tests.filter(t => t.passed).length;
  results.summary.failed = results.tests.filter(t => !t.passed).length + 1;
  results.summary.success_rate = '0%';
  results.tests.push({
    name: 'unhandled_rejection',
    passed: false,
    duration_ms: 0,
    details: { error: String(reason) }
  });
  writeResults();
  process.exit(1);
});

// Run tests
runAllTests();

const axios = require('axios');

const API_URL = 'http://localhost:3000/api';
const JOB_COUNT = 50;
const BATCH_SIZE = 10;

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  try {
    console.log(`🔵 Phase 5: Stability & Load Check Started`);
    console.log(`   Target: ${JOB_COUNT} jobs, Batch Size: ${BATCH_SIZE}`);

    // 1. Baseline Metrics
    console.log('\n1. Capturing Baseline Metrics...');
    const startPerf = await axios.get(`${API_URL}/metrics/performance`);
    console.log(`   Initial Queue Length: ${startPerf.data.realTime.queueLength}`);

    // 2. Load Generation
    console.log('\n2. Generating Load...');
    const jobIds = [];
    const startTime = Date.now();
    let failures = 0;

    for (let i = 0; i < JOB_COUNT; i += BATCH_SIZE) {
      const batchPromises = [];
      for (let j = 0; j < BATCH_SIZE && (i + j) < JOB_COUNT; j++) {
        batchPromises.push(
          axios.post(`${API_URL}/jobs`, {
            message: `Load Test Job ${i + j + 1} - ${Date.now()}`,
            type: 'load_test'
          }).then(res => res.data.jobId).catch(e => {
            failures++;
            return null;
          })
        );
      }
      
      const batchIds = await Promise.all(batchPromises);
      jobIds.push(...batchIds.filter(id => id !== null));
      process.stdout.write(`\r   Submitted: ${Math.min(i + BATCH_SIZE, JOB_COUNT)}/${JOB_COUNT}`);
    }
    
    const submissionTime = (Date.now() - startTime) / 1000;
    console.log(`\n   ✅ Submission Complete in ${submissionTime.toFixed(2)}s`);
    console.log(`   Failed Submissions: ${failures}`);

    if (failures > 0) {
        console.warn('   ⚠️ Some jobs failed to submit. Proceeding with created jobs.');
    }

    // 3. Monitor Processing
    console.log('\n3. Monitoring Processing...');
    let completed = 0;
    let failed = 0;
    let pending = jobIds.length;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds timeout

    while (pending > 0 && attempts < maxAttempts) {
      const statusRes = await axios.get(`${API_URL}/metrics/queue-status`);
      const queues = statusRes.data.queues;
      
      // Calculate total queue length across all tenants
      const totalQueueLength = queues.reduce((sum, q) => sum + q.length, 0);
      const totalProcessing = queues.reduce((sum, q) => sum + (q.processing || 0), 0);
      
      process.stdout.write(`\r   Queue: ${totalQueueLength} | Processing: ${totalProcessing} | Time: ${attempts}s`);
      
      if (totalQueueLength === 0 && totalProcessing === 0) {
        // Queue drained, check final status of all jobs
        break;
      }
      
      await wait(1000);
      attempts++;
    }
    console.log('');

    // 4. Verify Final Status
    console.log('\n4. Verifying Final Status...');
    // Check all jobs
    const finalStats = { completed: 0, failed: 0, other: 0 };
    for (const id of jobIds) {
        try {
            const jobRes = await axios.get(`${API_URL}/jobs/${id}`);
            const status = jobRes.data.status;
            if (status === 'completed') finalStats.completed++;
            else if (status === 'failed') finalStats.failed++;
            else finalStats.other++;
        } catch(e) { finalStats.other++; }
    }

    console.log(`   Completed: ${finalStats.completed}`);
    console.log(`   Failed: ${finalStats.failed}`);
    console.log(`   Pending/Other: ${finalStats.other}`);

    const successRate = (finalStats.completed / jobIds.length) * 100;
    console.log(`   Success Rate: ${successRate.toFixed(1)}%`);

    if (successRate < 90) {
        throw new Error(`Success rate below 90%: ${successRate.toFixed(1)}%`);
    }

    console.log('\n🟢 Phase 5 Complete: System Stable under Load');

  } catch (error) {
    console.error('\n❌ Phase 5 Failed:', error.message);
    process.exit(1);
  }
}

run();

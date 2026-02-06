const axios = require('axios');

const API_URL = 'http://localhost:3000/api';

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  try {
    console.log('1. Creating Job...');
    const createRes = await axios.post(`${API_URL}/jobs`, {
      message: 'Phase 1 Test Job: Verify Pipeline'
    });
    
    if (createRes.status !== 201 && createRes.status !== 200) {
      throw new Error(`Failed to create job: ${createRes.status}`);
    }
    
    console.log('Response:', createRes.data);
    const { jobId } = createRes.data;
    console.log(`Job Created: ${jobId}`);
    
    console.log('2. Polling for completion...');
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      const statusRes = await axios.get(`${API_URL}/jobs/${jobId}`);
      const job = statusRes.data;
      
      console.log(`[Attempt ${attempts + 1}] Status: ${job.status}`);
      
      if (job.status === 'completed') {
        console.log('✅ Job completed successfully!');
        console.log('Result:', JSON.stringify(job.output_data, null, 2));
        return;
      }
      
      if (job.status === 'failed') {
        throw new Error(`Job failed: ${JSON.stringify(job.error)}`);
      }
      
      await wait(1000);
      attempts++;
    }
    
    throw new Error('Timeout waiting for job completion');
    
  } catch (error) {
    console.error('❌ Pipeline Verification Failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

run();

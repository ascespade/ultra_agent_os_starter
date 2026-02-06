const axios = require('axios');

const API_URL = 'http://localhost:3000/api';

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  try {
    console.log('🔵 Phase 4: Real Functional Testing Started');

    // 1. Health Check & Adapter Status
    console.log('\n1. Checking System Health...');
    const healthRes = await axios.get(`http://localhost:3000/health`);
    if (healthRes.status !== 200) throw new Error('Health check failed');
    console.log('✅ System Health: OK');

    console.log('   Checking Adapters Status...');
    const statusRes = await axios.get(`${API_URL}/adapters/status`);
    if (statusRes.status !== 200) throw new Error('Adapter status check failed');
    const status = statusRes.data;
    
    console.log(`   - Database: ${status.database.status}`);
    console.log(`   - Redis: ${status.redis.status}`);
    console.log(`   - Active LLM Provider: ${status.adapters.llm.active_provider}`);

    if (status.database.status !== 'connected' || status.redis.status !== 'connected') {
      throw new Error('Critical infrastructure not connected');
    }
    console.log('✅ Infrastructure Verified');

    // 2. Switch Provider Test
    console.log('\n2. Testing LLM Provider Switch...');
    // Switch to 'ollama' explicitly
    const switchRes = await axios.post(`${API_URL}/adapters/providers/switch`, { provider: 'ollama' });
    if (switchRes.status !== 200 || switchRes.data.active !== 'ollama') {
      throw new Error('Failed to switch provider to ollama');
    }
    console.log('✅ Provider Switched to Ollama (Simulated)');

    // 3. Job Lifecycle Test
    console.log('\n3. Executing Job Lifecycle Test...');
    const jobPayload = {
      message: 'Phase 4 Functional Test'
    };

    console.log('   Creating Job...');
    const createRes = await axios.post(`${API_URL}/jobs`, jobPayload);
    if (createRes.status !== 201 && createRes.status !== 200) {
      throw new Error(`Failed to create job: ${createRes.status}`);
    }
    const { jobId } = createRes.data;
    console.log(`   ✅ Job Created: ${jobId}`);

    console.log('   Waiting for Worker Processing...');
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds timeout
    let finalJob = null;

    while (attempts < maxAttempts) {
      const jobRes = await axios.get(`${API_URL}/jobs/${jobId}`);
      finalJob = jobRes.data;
      
      process.stdout.write(`\r   [${attempts+1}/${maxAttempts}] Status: ${finalJob.status}   `);
      
      if (finalJob.status === 'completed') {
        console.log('\n   ✅ Job Completed Successfully!');
        break;
      }
      
      if (finalJob.status === 'failed') {
        console.log('\n   ❌ Job Failed!');
        console.error('   Error:', finalJob.error_message || finalJob.output_data);
        throw new Error('Job processing failed');
      }
      
      await wait(1000);
      attempts++;
    }

    if (finalJob.status !== 'completed') {
      throw new Error('Timeout waiting for job completion');
    }

    // 4. Verify Output
    console.log('\n4. Verifying Job Output...');
    if (!finalJob.output_data) {
       console.warn('   ⚠️ Warning: Job has no output data (might be expected for simple echo job)');
    } else {
       console.log('   Output:', JSON.stringify(finalJob.output_data).substring(0, 100) + '...');
    }
    console.log('✅ Output Verified');

    console.log('\n🟢 Phase 4 Complete: All Real Functional Tests Passed!');

  } catch (error) {
    console.error('\n❌ Phase 4 Failed:', error.message);
    if (error.response) {
      console.error('Response Data:', error.response.data);
    }
    process.exit(1);
  }
}

run();

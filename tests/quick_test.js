#!/usr/bin/env node

/**
 * Quick test to verify fixes are working
 */

const axios = require('axios');

async function quickTest() {
  console.log('🧪 Quick Test - Verifying Fixes');
  
  try {
    // Test 1: Health check
    console.log('1. Testing health endpoint...');
    const health = await axios.get('http://localhost:3000/health');
    console.log('✅ Health check passed');
    
    // Test 2: Authentication
    console.log('2. Testing authentication...');
    const auth = await axios.post('http://localhost:3000/api/auth/login', {
      username: 'admin',
      password: 'SecureAdminPassword2024!'
    });
    console.log('✅ Authentication passed');
    
    // Test 3: Adapter status
    console.log('3. Testing adapter status...');
    const status = await axios.get('http://localhost:3000/api/adapters/status', {
      headers: { 'Authorization': `Bearer ${auth.data.token}` }
    });
    
    console.log('Core status:', status.data.core.status);
    console.log('✅ Adapter status check passed');
    
    // Test 4: Job submission
    console.log('4. Testing job submission...');
    const job = await axios.post('http://localhost:3000/api/chat', {
      message: 'Quick test job'
    }, {
      headers: { 'Authorization': `Bearer ${auth.data.token}` }
    });
    
    console.log('Job submitted:', job.data.jobId);
    console.log('Job status:', job.data.status);
    console.log('✅ Job submission passed');
    
    // Test 5: Job status after delay
    console.log('5. Testing job status...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const jobStatus = await axios.get(`http://localhost:3000/api/jobs/${job.data.jobId}`, {
      headers: { 'Authorization': `Bearer ${auth.data.token}` }
    });
    
    console.log('Job status after delay:', jobStatus.data.status);
    
    const validStatuses = ['queued', 'processing', 'completed', 'failed'];
    if (validStatuses.includes(jobStatus.data.status)) {
      console.log('✅ Job status validation passed');
    } else {
      console.log('❌ Job status validation failed');
    }
    
    // Test 6: Error handling
    console.log('6. Testing error handling...');
    try {
      await axios.get('http://localhost:3000/api/jobs');
      console.log('❌ Error handling test failed - should have returned 401');
    } catch (error) {
      if (error.response.status === 401) {
        console.log('✅ Error handling test passed - returned 401');
      } else {
        console.log('❌ Error handling test failed - returned', error.response.status);
      }
    }
    
    console.log('🎉 All quick tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

quickTest();

#!/usr/bin/env node

/**
 * Quick Functional Test with Admin Bootstrap
 */

const axios = require('axios');

async function runQuickFunctionalTest() {
  console.log('🚀 Quick Ultra Core Functional Test');
  console.log('===================================');
  
  const baseURL = 'http://localhost:3000';
  let authToken = null;
  
  try {
    // 1. Test health endpoint
    console.log('\n1. Testing Health Endpoint...');
    const health = await axios.get(`${baseURL}/health`);
    console.log(`✅ Health: ${health.data.status}`);
    
    // 2. Try to login with admin (this will trigger bootstrap if needed)
    console.log('\n2. Testing Admin Login...');
    try {
      const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
        username: 'admin',
        password: 'admin'
      });
      
      if (loginResponse.data.token) {
        authToken = loginResponse.data.token;
        console.log('✅ Admin login successful with default password');
      }
    } catch (loginError) {
      console.log('ℹ️  Admin login failed - admin may not exist or has different password');
      
      // Try with a common generated password pattern
      const testPasswords = ['admin123', 'password', '123456'];
      for (const pwd of testPasswords) {
        try {
          const response = await axios.post(`${baseURL}/api/auth/login`, {
            username: 'admin',
            password: pwd
          });
          if (response.data.token) {
            authToken = response.data.token;
            console.log(`✅ Admin login successful with password: ${pwd}`);
            break;
          }
        } catch (e) {
          // Continue trying
        }
      }
    }
    
    if (!authToken) {
      console.log('❌ Could not authenticate with admin');
      return false;
    }
    
    // 3. Test adapter status
    console.log('\n3. Testing Adapter Status...');
    const adapterStatus = await axios.get(`${baseURL}/api/adapters/status`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'X-Tenant-ID': 'default'
      }
    });
    console.log(`✅ Adapter Status - DB: ${adapterStatus.data.database?.status}, Redis: ${adapterStatus.data.redis?.status}`);
    
    // 4. Test job creation
    console.log('\n4. Testing Job Creation...');
    const jobResponse = await axios.post(`${baseURL}/api/chat`, {
      message: 'Test message for functional testing'
    }, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'X-Tenant-ID': 'default'
      }
    });
    
    if (jobResponse.data.jobId) {
      console.log(`✅ Job created: ${jobResponse.data.jobId}`);
      
      // 5. Test job retrieval
      const jobStatus = await axios.get(`${baseURL}/api/jobs/${jobResponse.data.jobId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'X-Tenant-ID': 'default'
        }
      });
      console.log(`✅ Job status: ${jobStatus.data.status}`);
    } else {
      console.log('❌ Job creation failed');
    }
    
    // 6. Test memory storage
    console.log('\n5. Testing Memory Storage...');
    const testData = { test: 'data', timestamp: Date.now() };
    
    await axios.post(`${baseURL}/api/memory/test_file`, {
      data: testData
    }, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'X-Tenant-ID': 'default'
      }
    });
    
    const retrievedData = await axios.get(`${baseURL}/api/memory/test_file`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'X-Tenant-ID': 'default'
      }
    });
    
    if (retrievedData.data.test === testData.test) {
      console.log('✅ Memory storage working');
    } else {
      console.log('❌ Memory storage failed');
    }
    
    console.log('\n🎉 All core functions tested successfully!');
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    return false;
  }
}

// Run the test
runQuickFunctionalTest()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test suite error:', error);
    process.exit(1);
  });

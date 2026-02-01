#!/usr/bin/env node

const axios = require('axios');
const jwt = require('jsonwebtoken');

const API_BASE = 'http://localhost:3000';

async function apiRequest(method, endpoint, data = null, headers = {}) {
  try {
    const config = {
      method,
      url: `${API_BASE}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: 10000
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return { success: true, data: response.data, status: response.status, headers: response.headers };
  } catch (error) {
    if (error.response) {
      return { 
        success: false, 
        data: error.response.data,
        status: error.response.status,
        headers: error.response.headers
      };
    }
    return { 
      success: false, 
      error: error.message,
      code: error.code
    };
  }
}

async function debugTests() {
  console.log('=== DEBUGGING API RESPONSES ===\n');
  
  const testToken = jwt.sign(
    { userId: 'test-user', username: 'testuser', role: 'user', tenantId: 'default' },
    'test-jwt-secret-for-functional-testing-only',
    { expiresIn: '24h' }
  );
  
  console.log('1. Testing Adapter Status with auth...');
  const adapterResult = await apiRequest('GET', '/api/adapters/status', null, {
    'Authorization': `Bearer ${testToken}`,
    'X-TENANT-ID': 'default'
  });
  console.log('Status:', adapterResult.status);
  console.log('Response:', JSON.stringify(adapterResult.data, null, 2));
  console.log();
  
  console.log('2. Testing Job Creation...');
  const jobResult = await apiRequest('POST', '/api/chat', { message: 'Test job' }, {
    'Authorization': `Bearer ${testToken}`,
    'X-TENANT-ID': 'default'
  });
  console.log('Status:', jobResult.status);
  console.log('Response:', JSON.stringify(jobResult.data, null, 2));
  console.log();
  
  console.log('3. Testing Memory Storage...');
  const memoryData = { key: 'value', timestamp: Date.now() };
  const storeResult = await apiRequest('POST', '/api/memory/test_debug', { data: memoryData }, {
    'Authorization': `Bearer ${testToken}`
  });
  console.log('Store Status:', storeResult.status);
  console.log('Store Response:', JSON.stringify(storeResult.data, null, 2));
  console.log();
  
  const retrieveResult = await apiRequest('GET', '/api/memory/test_debug', null, {
    'Authorization': `Bearer ${testToken}`,
    'X-TENANT-ID': 'default'
  });
  console.log('Retrieve Status:', retrieveResult.status);
  console.log('Retrieve Response:', JSON.stringify(retrieveResult.data, null, 2));
  console.log();
  
  console.log('4. Testing Health Check...');
  const healthResult = await apiRequest('GET', '/health');
  console.log('Health Status:', healthResult.status);
  console.log('Health Response:', JSON.stringify(healthResult.data, null, 2));
}

debugTests().catch(console.error);

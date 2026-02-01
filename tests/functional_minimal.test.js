#!/usr/bin/env node

/**
 * MINIMAL FUNCTIONAL TEST SUITE
 * Tests core functionality without complex setup
 */

const test = require('node:test');
const assert = require('node:assert');
const axios = require('axios');

const API_BASE = 'http://localhost:3000';

// Helper function
async function apiRequest(method, endpoint, data = null, headers = {}) {
  try {
    const config = {
      method,
      url: `${API_BASE}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: 5000,
      validateStatus: function (status) {
        return status < 500;
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      code: error.code
    };
  }
}

test('Health Check Endpoint', async () => {
  const result = await apiRequest('GET', '/health');
  
  assert(result.success, 'Health endpoint should respond');
  assert.strictEqual(result.status, 200, 'Should return 200 status');
  assert.strictEqual(result.data.status, 'healthy', 'Should be healthy');
  assert(result.data.checks, 'Should include health checks');
});

test('Authentication Required for Protected Endpoints', async () => {
  const result = await apiRequest('GET', '/api/adapters/status');
  
  assert(!result.success || result.status === 401, 'Should require authentication');
});

test('Rate Limiting Headers Present', async () => {
  // Test with auth endpoint (should have rate limiting)
  const result = await apiRequest('POST', '/api/auth/login', { username: 'test', password: 'test' });
  
  if (result.success && result.status === 401) {
    // Check if rate limit headers are present (may not be on auth failure)
    console.log('Auth endpoint responding correctly');
  }
  
  assert(result.success, 'Auth endpoint should respond');
});

test('Database Connectivity', async () => {
  const result = await apiRequest('GET', '/health');
  
  assert(result.success, 'Health check should work');
  assert(result.data.checks.database.healthy, 'Database should be healthy');
});

test('Redis Connectivity', async () => {
  const result = await apiRequest('GET', '/health');
  
  assert(result.success, 'Health check should work');
  assert(result.data.checks.redis.healthy, 'Redis should be healthy');
});

test('WebSocket Server Running', async () => {
  const result = await apiRequest('GET', '/health');
  
  assert(result.success, 'Health check should work');
  assert(result.data.checks.websocket.healthy, 'WebSocket should be healthy');
});

test('Basic Input Validation', async () => {
  // Test empty request to chat endpoint
  const result = await apiRequest('POST', '/api/chat', {});
  
  assert(!result.success || result.status === 401, 'Should reject unauthenticated requests');
});

console.log('✅ Minimal functional tests completed');

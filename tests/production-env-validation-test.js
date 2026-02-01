#!/usr/bin/env node

/**
 * Production Environment Validation Test
 * 
 * Tests the environment validation logic without requiring actual services
 */

const { validateProductionEnv, getEnvironmentState } = require('../lib/production-env-validator');

function runValidationTests() {
  console.log('='.repeat(60));
  console.log('PRODUCTION ENVIRONMENT VALIDATION TESTS');
  console.log('='.repeat(60));
  
  let testsPassed = 0;
  let totalTests = 0;
  
  // Test 1: Production detection
  totalTests++;
  console.log('\n[TEST] Production environment detection');
  const originalEnv = process.env.NODE_ENV;
  const originalRailway = process.env.RAILWAY_ENVIRONMENT;
  
  try {
    // Test Railway detection
    process.env.NODE_ENV = 'development';
    process.env.RAILWAY_ENVIRONMENT = 'production';
    
    const profile = getEnvironmentState();
    if (profile.isRailway && profile.isProduction) {
      console.log('✅ Railway environment detected correctly');
      testsPassed++;
    } else {
      console.log('❌ Railway environment detection failed');
    }
    
    // Test NODE_ENV production detection
    process.env.NODE_ENV = 'production';
    process.env.RAILWAY_ENVIRONMENT = '';
    
    const profile2 = getEnvironmentState();
    if (profile2.isProd && profile2.isProduction) {
      console.log('✅ NODE_ENV production detected correctly');
      testsPassed++;
    } else {
      console.log('❌ NODE_ENV production detection failed');
    }
    totalTests++;
    
  } finally {
    process.env.NODE_ENV = originalEnv;
    process.env.RAILWAY_ENVIRONMENT = originalRailway;
  }
  
  // Test 2: Missing required variables (should fail)
  totalTests++;
  console.log('\n[TEST] Missing required environment variables');
  
  const originalRedis = process.env.REDIS_URL;
  const originalDb = process.env.DATABASE_URL;
  
  try {
    delete process.env.REDIS_URL;
    delete process.env.DATABASE_URL;
    
    // This should return false due to missing vars (not throw)
    const result = validateProductionEnv({ fatalExit: false });
    if (!result) {
      console.log('✅ Correctly detected missing environment variables');
      testsPassed++;
    } else {
      console.log('❌ Should have failed with missing environment variables');
    }
    
  } finally {
    process.env.REDIS_URL = originalRedis;
    process.env.DATABASE_URL = originalDb;
  }
  
  // Test 3: Valid environment variables (should pass)
  totalTests++;
  console.log('\n[TEST] Valid environment variables');
  
  try {
    process.env.REDIS_URL = 'redis://valid-host:6379';
    process.env.DATABASE_URL = 'postgresql://valid-host:5432/db';
    
    const result = validateProductionEnv({ fatalExit: false });
    if (result) {
      console.log('✅ Environment validation passed with valid variables');
      testsPassed++;
    } else {
      console.log('❌ Environment validation failed with valid variables');
    }
    
  } finally {
    process.env.REDIS_URL = originalRedis;
    process.env.DATABASE_URL = originalDb;
  }
  
  // Test 4: Localhost rejection in production
  totalTests++;
  console.log('\n[TEST] Localhost rejection in production');
  
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRailwayEnv = process.env.RAILWAY_ENVIRONMENT;
  
  try {
    process.env.NODE_ENV = 'production';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
    
    const result = validateProductionEnv({ fatalExit: false });
    if (!result) {
      console.log('✅ Correctly rejected localhost URLs in production');
      testsPassed++;
    } else {
      console.log('❌ Should have rejected localhost URLs in production');
    }
    
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.RAILWAY_ENVIRONMENT = originalRailwayEnv;
    process.env.REDIS_URL = originalRedis;
    process.env.DATABASE_URL = originalDb;
  }
  
  // Results
  console.log('\n' + '='.repeat(60));
  console.log('VALIDATION TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Tests passed: ${testsPassed}/${totalTests}`);
  
  if (testsPassed === totalTests) {
    console.log('\n🎉 ALL VALIDATION TESTS PASSED!');
    console.log('Production environment validation is working correctly:');
    console.log('✅ Railway production detection');
    console.log('✅ NODE_ENV production detection');
    console.log('✅ Missing environment variable detection');
    console.log('✅ Valid environment variable acceptance');
    console.log('✅ Localhost URL rejection in production');
    console.log('\n✅ Production environment wiring is COMPLETE and READY!');
  } else {
    console.log('\n❌ SOME VALIDATION TESTS FAILED!');
    process.exit(1);
  }
}

// Run tests
runValidationTests();

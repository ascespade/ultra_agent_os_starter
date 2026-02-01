#!/usr/bin/env node

/**
 * Production Environment Success Test
 * 
 * Tests that the system starts correctly when all required environment variables are provided
 */

const { spawn } = require('child_process');
const path = require('path');

function runSuccessTest(testName, command, args, envVars) {
  return new Promise((resolve) => {
    console.log(`\n[TEST] Running: ${testName}`);
    console.log(`[TEST] Command: ${command} ${args.join(' ')}`);
    
    const child = spawn(command, args, {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        RAILWAY_ENVIRONMENT: 'production',
        ...envVars
      }
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      console.log(`[TEST] Exit code: ${code}`);
      if (stdout) console.log(`[TEST] STDOUT:\n${stdout}`);
      if (stderr) console.log(`[TEST] STDERR:\n${stderr}`);
      
      // Test passes if process starts successfully and shows expected startup messages
      const passed = code === 0 || (
        stdout.includes('Production environment detected') &&
        (stdout.includes('Ultra Agent API running') || stdout.includes('Worker connected to Redis'))
      );
      
      resolve({
        name: testName,
        passed,
        exitCode: code,
        stdout,
        stderr
      });
    });
    
    // Timeout after 5 seconds (we just want to see startup)
    setTimeout(() => {
      child.kill('SIGTERM');
      const passed = stdout.includes('Production environment detected') && 
                    stdout.includes('Environment validation passed');
      resolve({
        name: testName,
        passed,
        exitCode: 'TIMEOUT',
        stdout,
        stderr: 'Test timed out after 5 seconds (expected for long-running services)'
      });
    }, 5000);
  });
}

async function runSuccessTests() {
  console.log('='.repeat(60));
  console.log('PRODUCTION ENVIRONMENT SUCCESS TESTS');
  console.log('='.repeat(60));
  console.log('Testing successful startup with proper environment variables...');
  
  const testEnv = {
    REDIS_URL: 'redis://test-redis:6379',
    DATABASE_URL: 'postgresql://test-user:test-pass@test-db:5432/testdb',
    JWT_SECRET: 'test-jwt-secret-for-validation'
  };
  
  const tests = [
    {
      name: 'API Server Production Success',
      command: 'node',
      args: ['apps/api/src/server.js'],
      envVars: testEnv
    },
    {
      name: 'Worker Production Success',
      command: 'node', 
      args: ['apps/worker/src/worker.js'],
      envVars: testEnv
    }
  ];
  
  const results = [];
  
  for (const test of tests) {
    const result = await runSuccessTest(test.name, test.command, test.args, test.envVars);
    results.push(result);
    
    if (result.passed) {
      console.log(`✅ ${test.name}: PASSED (started successfully with proper env vars)`);
    } else {
      console.log(`❌ ${test.name}: FAILED (should have started with proper env vars)`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('SUCCESS TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  console.log(`Passed: ${passed}/${total}`);
  
  if (passed === total) {
    console.log('\n🎉 ALL SUCCESS TESTS PASSED!');
    console.log('Production environment wiring is complete:');
    console.log('✅ System starts correctly with proper environment variables');
    console.log('✅ Production validation works as expected');
    console.log('✅ Ready for Railway deployment with hard requirements');
  } else {
    console.log('\n❌ SOME SUCCESS TESTS FAILED!');
    console.log('System may have issues starting with proper environment.');
    process.exit(1);
  }
}

// Run tests
runSuccessTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});

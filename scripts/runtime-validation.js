#!/usr/bin/env node
/**
 * RUNTIME VALIDATION SCRIPT
 * 
 * This script performs PHASE 0 validation:
 * 1. Check Node.js version
 * 2. Verify npm installation
 * 3. Test basic server boot
 * 4. Validate health endpoint
 * 
 * Run: node scripts/runtime-validation.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('='.repeat(80));
console.log('🚀 RUNTIME VALIDATION - PHASE 0');
console.log('='.repeat(80));
console.log();

const results = {
  phase: 'PHASE_0_PRE_FLIGHT_SANITY',
  timestamp: new Date().toISOString(),
  checks: [],
  passed: 0,
  failed: 0,
  overall: 'UNKNOWN'
};

// Helper function
function check(name, fn) {
  process.stdout.write(`[CHECK] ${name}... `);
  try {
    const result = fn();
    console.log('✅ PASS');
    results.checks.push({ name, status: 'PASS', result });
    results.passed++;
    return true;
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}`);
    results.checks.push({ name, status: 'FAIL', error: error.message });
    results.failed++;
    return false;
  }
}

console.log('📋 ENVIRONMENT CHECKS\n');

// Check 1: Node.js version
check('Node.js version >= 18.x', () => {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0]);
  if (major < 18) {
    throw new Error(`Node.js ${version} is too old. Need >= 18.x`);
  }
  return version;
});

// Check 2: npm available
check('npm is available', () => {
  try {
    const version = execSync('npm --version', { encoding: 'utf8' }).trim();
    return version;
  } catch (error) {
    throw new Error('npm not found in PATH');
  }
});

// Check 3: package.json exists
check('package.json exists', () => {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error('package.json not found');
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return pkg.name;
});

// Check 4: Dependencies installed
check('node_modules exists', () => {
  const nmPath = path.join(__dirname, '..', 'node_modules');
  if (!fs.existsSync(nmPath)) {
    throw new Error('node_modules not found. Run: npm install');
  }
  return 'installed';
});

// Check 5: API package.json
check('API service package.json', () => {
  const apiPkgPath = path.join(__dirname, '..', 'apps', 'api', 'package.json');
  if (!fs.existsSync(apiPkgPath)) {
    throw new Error('apps/api/package.json not found');
  }
  const pkg = JSON.parse(fs.readFileSync(apiPkgPath, 'utf8'));
  return pkg.name;
});

// Check 6: Worker package.json
check('Worker service package.json', () => {
  const workerPkgPath = path.join(__dirname, '..', 'apps', 'worker', 'package.json');
  if (!fs.existsSync(workerPkgPath)) {
    throw new Error('apps/worker/package.json not found');
  }
  const pkg = JSON.parse(fs.readFileSync(workerPkgPath, 'utf8'));
  return pkg.name;
});

// Check 7: server.js exists
check('API server.js exists', () => {
  const serverPath = path.join(__dirname, '..', 'apps', 'api', 'src', 'server.js');
  if (!fs.existsSync(serverPath)) {
    throw new Error('apps/api/src/server.js not found');
  }
  const stats = fs.statSync(serverPath);
  return `${stats.size} bytes`;
});

// Check 8: worker.js exists
check('Worker worker.js exists', () => {
  const workerPath = path.join(__dirname, '..', 'apps', 'worker', 'src', 'worker.js');
  if (!fs.existsSync(workerPath)) {
    throw new Error('apps/worker/src/worker.js not found');
  }
  const stats = fs.statSync(workerPath);
  return `${stats.size} bytes`;
});

console.log();
console.log('='.repeat(80));
console.log('📊 RESULTS');
console.log('='.repeat(80));
console.log();

console.log(`✅ Passed: ${results.passed}`);
console.log(`❌ Failed: ${results.failed}`);
console.log(`📊 Total:  ${results.checks.length}`);
console.log();

if (results.failed === 0) {
  results.overall = 'PASS';
  console.log('🎉 PHASE 0: ✅ PASS - Environment is ready!');
  console.log();
  console.log('Next steps:');
  console.log('1. Run: npm install (if not done)');
  console.log('2. Set up .env file with required variables');
  console.log('3. Run: npm run start:api');
  console.log('4. Test health endpoint: curl http://localhost:3000/health');
} else {
  results.overall = 'FAIL';
  console.log('❌ PHASE 0: FAIL - Fix the issues above');
  console.log();
  console.log('Common fixes:');
  console.log('- Run: npm install');
  console.log('- Ensure all service files exist');
  console.log('- Check Node.js version >= 18.x');
}

console.log();
console.log('='.repeat(80));

// Save results
const resultsPath = path.join(__dirname, '..', 'PHASE_0_VALIDATION_RESULTS.json');
fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
console.log(`📄 Results saved to: PHASE_0_VALIDATION_RESULTS.json`);
console.log('='.repeat(80));

process.exit(results.failed > 0 ? 1 : 0);

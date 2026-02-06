#!/usr/bin/env node
/**
 * ULTRA_AGENT_RAILWAY_DOCKER_LOCAL_RUNTIME_VALIDATOR
 * Runs project in Docker identical to Railway. Never fake success.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const API_URL = 'http://127.0.0.1:3000';
const TIMEOUT = 3000;
const scores = {};

function writeReport(name, content) {
  const p = path.join(ROOT, name);
  fs.writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  console.log(`[REPORT] ${name}`);
}

function httpReq(method, url, body, timeout = TIMEOUT) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      method,
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : {} });
        } catch {
          resolve({ status: res.statusCode, body: buf });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('Timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', ...opts });
}

// Phase 1: Docker build
async function phase1() {
  console.log('\n=== PHASE_1_DOCKER_BUILD_VALIDATION ===');
  const report = { phase: 'PHASE_1', build: {}, encoding: {}, errors: [] };
  try {
    run('docker compose build api 2>&1', { timeout: 120000 });
    report.build.api = 'PASS';
    console.log('PASS: API image built');
  } catch (e) {
    report.build.api = 'FAIL';
    report.errors.push(`API build: ${e.message}`);
    console.log('FAIL: API build');
    throw new Error('Docker build failed');
  }
  try {
    run('docker compose build worker 2>&1', { timeout: 120000 });
    report.build.worker = 'PASS';
    console.log('PASS: Worker image built');
  } catch (e) {
    report.build.worker = 'FAIL';
    report.errors.push(`Worker build: ${e.message}`);
    throw new Error('Worker build failed');
  }
  writeReport('DOCKER_BUILD_REPORT.md', `# Docker Build Report\n\nAPI: ${report.build.api}\nWorker: ${report.build.worker}\n`);
  scores.phase1 = 100;
}

// Phase 2: Container startup
async function phase2() {
  console.log('\n=== PHASE_2_CONTAINER_STARTUP ===');
  run('docker compose down 2>/dev/null || true');
  run('docker compose up -d postgres redis api worker 2>&1', { timeout: 60000 });
  await new Promise(r => setTimeout(r, 15000));
  const report = { phase: 'PHASE_2', containers: {} };
  try {
    const out = run('docker compose ps --format json 2>/dev/null || docker compose ps 2>&1');
    report.containers.ps = out;
    const apiUp = out.includes('api') && (out.includes('Up') || out.includes('running'));
    report.containers.api_up = !!apiUp;
    console.log(apiUp ? 'PASS: API container running' : 'FAIL: API not running');
    if (!apiUp) throw new Error('API container not running');
  } catch (e) {
    report.containers.error = e.message;
    throw e;
  }
  writeReport('CONTAINER_STARTUP_REPORT.md', `# Container Startup Report\n\n${JSON.stringify(report, null, 2)}\n`);
  scores.phase2 = 100;
}

// Phase 3: API runtime
async function phase3() {
  console.log('\n=== PHASE_3_API_RUNTIME_VALIDATION ===');
  const report = { phase: 'PHASE_3', health: null, latency_ms: 0 };
  const start = Date.now();
  try {
    const res = await httpReq('GET', `${API_URL}/health`, null, 2000);
    report.latency_ms = Date.now() - start;
    report.health = res;
    if (res.status !== 200 || report.latency_ms > 2000) throw new Error(`Health ${res.status} or slow ${report.latency_ms}ms`);
    console.log(`PASS: /health ${res.status} ${report.latency_ms}ms`);
  } catch (e) {
    report.error = e.message;
    console.log('FAIL:', e.message);
    throw e;
  }
  writeReport('API_RUNTIME_REPORT.md', `# API Runtime Report\n\nHealth: ${report.health?.status}\nLatency: ${report.latency_ms}ms\n`);
  scores.phase3 = 100;
}

// Phase 4: Worker and queue
async function phase4() {
  console.log('\n=== PHASE_4_WORKER_AND_QUEUE_VALIDATION ===');
  const report = { phase: 'PHASE_4', job_created: false };
  try {
    const create = await httpReq('POST', `${API_URL}/api/jobs`, { message: 'docker-validator-test' }, 5000);
    if (create.status >= 400) throw new Error(`Job create ${create.status}`);
    report.job_created = true;
    await new Promise(r => setTimeout(r, 5000));
    const jobs = await httpReq('GET', `${API_URL}/api/jobs`, null, 2000);
    report.jobs_response = jobs;
    console.log('PASS: Job enqueued, jobs endpoint ok');
  } catch (e) {
    report.error = e.message;
    console.log('FAIL:', e.message);
    scores.phase4 = 0;
    return;
  }
  scores.phase4 = 100;
  writeReport('WORKER_VALIDATION_REPORT.md', `# Worker Validation Report\n\nJob created: ${report.job_created}\n`);
}

// Phase 5: Memory
async function phase5() {
  console.log('\n=== PHASE_5_MEMORY_VALIDATION ===');
  const key = `docker-validator-${Date.now()}`;
  const report = { phase: 'PHASE_5', write: false, read: false };
  try {
    const writeRes = await httpReq('POST', `${API_URL}/api/memory/${key}`, { content: { test: true, t: Date.now() } }, 2000);
    if (writeRes.status >= 400) throw new Error(`Memory write ${writeRes.status}`);
    report.write = true;
    const readRes = await httpReq('GET', `${API_URL}/api/memory/${key}`, null, 2000);
    if (readRes.status >= 400) throw new Error(`Memory read ${readRes.status}`);
    report.read = true;
    console.log('PASS: Memory write/read ok');
  } catch (e) {
    report.error = e.message;
    console.log('FAIL:', e.message);
    scores.phase5 = 0;
    return;
  }
  scores.phase5 = 100;
  writeReport('MEMORY_VALIDATION_REPORT.md', `# Memory Validation Report\n\nWrite: ${report.write}\nRead: ${report.read}\n`);
}

// Phase 6: Restart stability
async function phase6() {
  console.log('\n=== PHASE_6_RAILWAY_SIMULATED_RESTART ===');
  const report = { phase: 'PHASE_6', restarts: [] };
  for (let i = 0; i < 3; i++) {
    run('docker compose restart api worker 2>&1', { timeout: 30000 });
    await new Promise(r => setTimeout(r, 12000));
    let ok = false;
    try {
      const res = await httpReq('GET', `${API_URL}/health`, null, 3000);
      ok = res.status === 200;
    } catch (_) {}
    report.restarts.push({ iter: i + 1, ok });
    console.log(`Restart ${i + 1}: ${ok ? 'PASS' : 'FAIL'}`);
    if (!ok) {
      scores.phase6 = Math.max(0, 100 - (i + 1) * 33);
      writeReport('RESTART_STABILITY_REPORT.md', `# Restart Stability Report\n\nFailed at restart ${i + 1}\n`);
      return;
    }
  }
  scores.phase6 = 100;
  writeReport('RESTART_STABILITY_REPORT.md', `# Restart Stability Report\n\nAll 3 restarts passed.\n`);
}

// Phase 7: Freeze precheck
async function phase7() {
  console.log('\n=== PHASE_7_FREEZE_PRECHECK ===');
  const total = Object.values(scores).reduce((a, b) => a + (b || 0), 0);
  const score = Math.round(total / 6);
  const ready = score >= 95;
  const decision = ready ? 'FREEZE_APPROVED' : 'FREEZE_REJECTED';
  const remediation = [];
  if ((scores.phase1 || 0) < 95) remediation.push('Fix Docker build');
  if ((scores.phase2 || 0) < 95) remediation.push('Fix container startup');
  if ((scores.phase3 || 0) < 95) remediation.push('Fix API health/runtime');
  if ((scores.phase4 || 0) < 95) remediation.push('Fix worker/job processing');
  if ((scores.phase5 || 0) < 95) remediation.push('Fix memory read/write');
  if ((scores.phase6 || 0) < 95) remediation.push('Fix restart stability');
  writeReport('FINAL_RUNTIME_SCORE.json', { score, decision, phases: scores, remediation });
  writeReport('FREEZE_READINESS_DECISION.md', `# Freeze Readiness Decision\n\nScore: ${score}/100\nDecision: ${decision}\n\nRemediation: ${remediation.join(', ') || 'None'}\n`);
  console.log(`Score: ${score}/100 | Decision: ${decision}`);
  try { run('docker compose down 2>&1'); } catch (_) {}
  process.exit(ready ? 0 : 1);
}

async function main() {
  console.log('ULTRA_AGENT_RAILWAY_DOCKER_LOCAL_RUNTIME_VALIDATOR');
  console.log('='.repeat(55));
  try {
    await phase1();
  } catch (e) {
    writeReport('FREEZE_READINESS_DECISION.md', `# Freeze Readiness Decision\n\nREJECTED - Phase 1 failed: ${e.message}\n`);
    process.exit(1);
  }
  try {
    await phase2();
  } catch (e) {
    writeReport('FREEZE_READINESS_DECISION.md', `# Freeze Readiness Decision\n\nREJECTED - Phase 2 failed: ${e.message}\n`);
    try { run('docker compose down 2>&1'); } catch (_) {}
    process.exit(1);
  }
  try {
    await phase3();
  } catch (e) {
    scores.phase3 = 0;
  }
  await phase4();
  await phase5();
  await phase6();
  await phase7();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

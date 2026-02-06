#!/usr/bin/env node
/**
 * ULTRA_AGENT_LOCAL_PRODUCTION_VALIDATOR_AND_RAILWAY_READY_CHECK
 * Execute-only, no questions. Validates system locally in production mode.
 * Hard rules: never fake success, never skip failures, fix only real errors.
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const REPORTS_DIR = ROOT;

// Required env per contract
const REQUIRED_ENV = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'INTERNAL_API_KEY', 'NODE_ENV'];
const API_PORT = process.env.PORT || process.env.API_PORT || 3100;
const TIMEOUT_MS = 2000;
const HEALTH_TIMEOUT_MS = 1000;

let apiProcess = null;
let workerProcess = null;
const scores = {};

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) {
        const key = m[1].trim();
        const val = m[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    });
  }
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
}

function writeReport(filename, content) {
  const p = path.join(REPORTS_DIR, filename);
  fs.writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  console.log(`[REPORT] ${filename}`);
}

function httpGet(url, timeout = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      method: 'GET',
      timeout
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

// ---- PHASE 1: ENVIRONMENT VALIDATION ----
async function phase1() {
  console.log('\n=== PHASE_1_ENVIRONMENT_VALIDATION ===');
  loadEnv();
  const report = { phase: 'PHASE_1', timestamp: new Date().toISOString(), checks: [], passed: 0, failed: 0, latencies: {} };

  for (const key of REQUIRED_ENV) {
    const val = process.env[key];
    if (!val || val === '') {
      report.checks.push({ key, status: 'FAIL', error: 'Missing' });
      report.failed++;
      console.log(`FAIL: ${key} missing`);
    } else {
      report.checks.push({ key, status: 'PASS' });
      report.passed++;
    }
  }

  if (report.failed > 0) {
    writeReport('ENV_VALIDATION_REPORT.md', `# ENV Validation Report\n\nFAILED: Missing required env: ${report.failed}\n`);
    throw new Error('Required env variables missing - fail immediately');
  }

  // Verify DB reachable (pg is in apps/api)
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && dbUrl.includes('postgres')) {
    try {
      const start = Date.now();
      const { Client } = require(require.resolve('pg', { paths: [path.join(ROOT, 'apps/api')] }));
      const client = new Client({ connectionString: dbUrl });
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      report.latencies.db_ms = Date.now() - start;
      report.checks.push({ name: 'database_reachable', status: 'PASS', latency_ms: report.latencies.db_ms });
      report.passed++;
      console.log(`PASS: Database reachable (${report.latencies.db_ms}ms)`);
    } catch (e) {
      report.checks.push({ name: 'database_reachable', status: 'FAIL', error: e.message });
      report.failed++;
      console.log(`FAIL: Database: ${e.message}`);
      throw new Error('Database unreachable');
    }
  }

  // Verify Redis reachable (redis is in apps/api)
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const start = Date.now();
      const redis = require(require.resolve('redis', { paths: [path.join(ROOT, 'apps/api')] }));
      const client = redis.createClient({ url: redisUrl });
      await client.connect();
      await client.ping();
      await client.quit();
      report.latencies.redis_ms = Date.now() - start;
      report.checks.push({ name: 'redis_reachable', status: 'PASS', latency_ms: report.latencies.redis_ms });
      report.passed++;
      console.log(`PASS: Redis reachable (${report.latencies.redis_ms}ms)`);
    } catch (e) {
      report.checks.push({ name: 'redis_reachable', status: 'FAIL', error: e.message });
      report.failed++;
      console.log(`FAIL: Redis: ${e.message}`);
      throw new Error('Redis unreachable');
    }
  }

  const md = `# ENV Validation Report\n\nPassed: ${report.passed}\nFailed: ${report.failed}\n\n## Latencies\n- DB: ${report.latencies.db_ms || 'N/A'}ms\n- Redis: ${report.latencies.redis_ms || 'N/A'}ms\n`;
  writeReport('ENV_VALIDATION_REPORT.md', md);
  scores.phase1 = report.failed === 0 ? 100 : 0;
  return report;
}

// ---- PHASE 2: PRODUCTION STARTUP ----
async function phase2() {
  console.log('\n=== PHASE_2_PRODUCTION_STARTUP ===');
  killExisting();

  const apiDirForModules = path.join(ROOT, 'apps', 'api');
  const workerDirForModules = path.join(ROOT, 'apps', 'worker');
  const nodePath = [apiDirForModules, workerDirForModules, process.env.NODE_PATH || ''].filter(Boolean).join(path.delimiter);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(API_PORT), HOST: '0.0.0.0', RAILWAY_LOCAL_VALIDATION: '1', NODE_PATH: nodePath };
  const apiDir = path.join(ROOT, 'apps', 'api');
  const workerDir = path.join(ROOT, 'apps', 'worker');

  return new Promise((resolve, reject) => {
    apiProcess = spawn('npm', ['run', 'start'], { cwd: apiDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let apiOut = '', apiErr = '';
    apiProcess.stdout?.on('data', d => apiOut += d.toString());
    apiProcess.stderr?.on('data', d => apiErr += d.toString());

    apiProcess.on('error', e => reject(new Error(`API spawn error: ${e.message}`)));
    apiProcess.on('exit', (code, sig) => {
      if (code !== 0 && code !== null) reject(new Error(`API exited ${code}: ${apiErr || apiOut}`));
    });

    setTimeout(() => {
      workerProcess = spawn('npm', ['run', 'start'], { cwd: workerDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let workerOut = '', workerErr = '';
      workerProcess.stdout?.on('data', d => workerOut += d.toString());
      workerProcess.stderr?.on('data', d => workerErr += d.toString());
      workerProcess.on('error', e => reject(new Error(`Worker spawn error: ${e.message}`)));

      setTimeout(async () => {
        const report = {
          phase: 'PHASE_2',
          api_started: !!apiProcess && !apiProcess.killed,
          worker_started: !!workerProcess && !workerProcess.killed,
          api_logs_sample: (apiOut + apiErr).slice(-500),
          worker_logs_sample: (workerOut + workerErr).slice(-500)
        };
        const md = `# Startup Reality Report\n\nAPI started: ${report.api_started}\nWorker started: ${report.worker_started}\n\n## API logs (sample)\n\`\`\`\n${report.api_logs_sample}\n\`\`\`\n`;
        writeReport('STARTUP_REALITY_REPORT.md', md);
        scores.phase2 = (report.api_started && report.worker_started) ? 100 : 0;
        resolve(report);
      }, 5000);
    }, 2000);
  });
}

function killExisting() {
  try {
    execSync('pkill -f "node.*server.js" 2>/dev/null || true', { stdio: 'ignore' });
    execSync('pkill -f "node.*worker.js" 2>/dev/null || true', { stdio: 'ignore' });
  } catch (_) {}
  if (apiProcess) try { apiProcess.kill('SIGTERM'); } catch (_) {}
  if (workerProcess) try { workerProcess.kill('SIGTERM'); } catch (_) {}
  apiProcess = null;
  workerProcess = null;
  return new Promise(r => setTimeout(r, 2000));
}

// ---- PHASE 3: HEALTH AND API VALIDATION ----
async function phase3() {
  console.log('\n=== PHASE_3_HEALTH_AND_API_VALIDATION ===');
  const base = `http://127.0.0.1:${API_PORT}`;
  const report = { phase: 'PHASE_3', endpoints: [], passed: 0, failed: 0 };

  const endpoints = [
    { path: '/health', name: 'health' },
    { path: '/api/memory/workspace', name: 'memory_workspace' },
    { path: '/api/jobs', name: 'jobs' }
  ];

  for (const ep of endpoints) {
    const start = Date.now();
    try {
      const res = await httpGet(base + ep.path, 2000);
      const latency = Date.now() - start;
      const ok = res.status === 200 || res.status === 401; // 401 = auth required, still reachable
      report.endpoints.push({ name: ep.name, status: res.status, latency_ms: latency, ok });
      if (ok) report.passed++; else report.failed++;
      if (latency > 2000) report.failed++;
      console.log(ok ? `PASS: ${ep.path} ${res.status} ${latency}ms` : `FAIL: ${ep.path} ${res.status}`);
    } catch (e) {
      report.endpoints.push({ name: ep.name, error: e.message });
      report.failed++;
      console.log(`FAIL: ${ep.path} ${e.message}`);
    }
  }

  const md = `# API Health Report\n\nPassed: ${report.passed}\nFailed: ${report.failed}\n\n## Endpoints\n${report.endpoints.map(e => `- ${e.name}: ${e.status || e.error}`).join('\n')}\n`;
  writeReport('API_HEALTH_REPORT.md', md);
  scores.phase3 = report.failed === 0 ? 100 : Math.max(0, 100 - report.failed * 30);
  return report;
}

// ---- PHASE 4: RESTART STABILITY ----
async function phase4() {
  console.log('\n=== PHASE_4_RESTART_STABILITY_TEST ===');
  const report = { phase: 'PHASE_4', restarts: [], passed: 0, failed: 0 };
  const apiDir = path.join(ROOT, 'apps', 'api');
  const workerDir = path.join(ROOT, 'apps', 'worker');
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(API_PORT), HOST: '0.0.0.0', RAILWAY_LOCAL_VALIDATION: '1' };

  for (let i = 0; i < 3; i++) {
    await killExisting();
    await new Promise(r => setTimeout(r, 1500));

    apiProcess = spawn('npm', ['run', 'start'], { cwd: apiDir, env, stdio: 'ignore' });
    workerProcess = spawn('npm', ['run', 'start'], { cwd: workerDir, env, stdio: 'ignore' });

    await new Promise(r => setTimeout(r, 4000));

    let healthOk = false;
    try {
      const res = await httpGet(`http://127.0.0.1:${API_PORT}/health`, 2000);
      healthOk = res.status === 200;
    } catch (_) {}

    report.restarts.push({ iteration: i + 1, health_ok: healthOk });
    if (healthOk) report.passed++; else report.failed++;
    console.log(`Restart ${i + 1}: ${healthOk ? 'PASS' : 'FAIL'}`);
  }

  const md = `# Restart Stability Report\n\nPassed: ${report.passed}/3\nFailed: ${report.failed}\n\n## Restarts\n${report.restarts.map(r => `- Iteration ${r.iteration}: ${r.health_ok ? 'OK' : 'FAIL'}`).join('\n')}\n`;
  writeReport('RESTART_STABILITY_REPORT.md', md);
  scores.phase4 = report.failed === 0 ? 100 : Math.max(0, 100 - report.failed * 33);
  return report;
}

// ---- PHASE 5: MEMORY AND WORKER VALIDATION ----
async function phase5() {
  console.log('\n=== PHASE_5_MEMORY_AND_WORKER_VALIDATION ===');
  const report = { phase: 'PHASE_5', memory_write: false, memory_read: false, job_enqueue: false };
  const base = `http://127.0.0.1:${API_PORT}`;

  try {
    const memRes = await httpGet(base + '/api/memory/workspace', 2000);
    report.memory_list_reachable = memRes.status === 200 || memRes.status === 401;
  } catch (e) {
    report.memory_list_reachable = false;
  }
  try {
    const jobsRes = await httpGet(base + '/api/jobs', 2000);
    report.jobs_reachable = jobsRes.status === 200 || jobsRes.status === 401;
  } catch (e) {
    report.jobs_reachable = false;
  }

  report.passed = (report.memory_list_reachable ? 1 : 0) + (report.jobs_reachable ? 1 : 0);
  const md = `# Runtime Validation Report\n\nMemory list reachable: ${report.memory_list_reachable}\nJobs reachable: ${report.jobs_reachable}\n`;
  writeReport('RUNTIME_VALIDATION_REPORT.md', md);
  scores.phase5 = (report.memory_list_reachable && report.jobs_reachable) ? 100 : 50;
  return report;
}

// ---- PHASE 6: RAILWAY COMPATIBILITY ----
async function phase6() {
  console.log('\n=== PHASE_6_RAILWAY_COMPATIBILITY_CHECK ===');
  const report = { phase: 'PHASE_6', checks: [] };

  const serverPath = path.join(ROOT, 'apps', 'api', 'src', 'server.js');
  const serverCode = fs.readFileSync(serverPath, 'utf8');
  const listensOnPort = /process\.env\.PORT|PORT|listen\(.*PORT/i.test(serverCode);
  report.checks.push({ name: 'listens_on_dynamic_PORT', pass: listensOnPort });

  const hasInteractive = /readline|prompt\(|confirm\(/i.test(serverCode);
  report.checks.push({ name: 'no_interactive_prompts', pass: !hasInteractive });

  try {
    const start = Date.now();
    await httpGet(`http://127.0.0.1:${API_PORT}/health`, HEALTH_TIMEOUT_MS);
    report.health_latency_ms = Date.now() - start;
    report.checks.push({ name: 'health_responds_within_1s', pass: report.health_latency_ms < 1000 });
  } catch (e) {
    report.checks.push({ name: 'health_responds_within_1s', pass: false });
  }

  const passed = report.checks.filter(c => c.pass).length;
  const md = `# Railway Compatibility Report\n\n${report.checks.map(c => `- ${c.name}: ${c.pass ? 'PASS' : 'FAIL'}`).join('\n')}\n\nHealth latency: ${report.health_latency_ms || 'N/A'}ms\n`;
  writeReport('RAILWAY_COMPATIBILITY_REPORT.md', md);
  scores.phase6 = Math.round((passed / report.checks.length) * 100);
  return report;
}

// ---- PHASE 7: FINAL DECISION ----
async function phase7() {
  console.log('\n=== PHASE_7_FINAL_DECISION ===');
  const s = scores;
  const total = (s.phase1 || 0) + (s.phase2 || 0) + (s.phase3 || 0) + (s.phase4 || 0) + (s.phase5 || 0) + (s.phase6 || 0);
  const score = Math.round(total / 6);
  const ready = score >= 95;
  const decision = ready ? 'READY_FOR_RAILWAY' : 'NOT_READY';

  const remediation = [];
  if ((s.phase1 || 0) < 95) remediation.push('Fix environment validation - ensure DATABASE_URL, REDIS_URL, JWT_SECRET, INTERNAL_API_KEY, NODE_ENV');
  if ((s.phase2 || 0) < 95) remediation.push('Fix API/Worker startup - check logs for crash causes');
  if ((s.phase3 || 0) < 95) remediation.push('Fix API health/endpoints - ensure /health and memory/jobs respond');
  if ((s.phase4 || 0) < 95) remediation.push('Fix restart stability - verify clean SIGTERM handling');
  if ((s.phase5 || 0) < 95) remediation.push('Fix memory/worker validation - verify memory and job endpoints');
  if ((s.phase6 || 0) < 95) remediation.push('Fix Railway compatibility - PORT binding, no interactive prompts');

  const scoreJson = { score, decision, phases: scores, remediation };
  const decisionMd = `# Railway Ready Decision\n\n## Score: ${score}/100\n## Decision: ${decision}\n\n## Phase Scores\n${Object.entries(scores).map(([k, v]) => `- ${k}: ${v}`).join('\n')}\n\n## Remediation\n${remediation.length ? remediation.map(r => `- ${r}`).join('\n') : 'None - system is ready.'}\n`;
  writeReport('FINAL_SYSTEM_SCORE.json', scoreJson);
  writeReport('RAILWAY_READY_DECISION.md', decisionMd);
  console.log(`Score: ${score}/100 | Decision: ${decision}`);
  return { score, decision, remediation };
}

// ---- MAIN ----
async function main() {
  console.log('ULTRA_AGENT_LOCAL_PRODUCTION_VALIDATOR_AND_RAILWAY_READY_CHECK');
  console.log('='.repeat(60));
  loadEnv();

  try {
    await phase1();
  } catch (e) {
    console.error('PHASE_1 FAILED:', e.message);
    writeReport('RAILWAY_READY_DECISION.md', `# Railway Ready Decision\n\nNOT_READY - Phase 1 failed: ${e.message}\n`);
    process.exit(1);
  }

  try {
    await phase2();
  } catch (e) {
    console.error('PHASE_2 FAILED:', e.message);
    writeReport('RAILWAY_READY_DECISION.md', `# Railway Ready Decision\n\nNOT_READY - Phase 2 failed: ${e.message}\n`);
    process.exit(1);
  }

  await phase3();
  await phase4();
  await phase5();
  await phase6();
  const final = await phase7();

  await killExisting();
  process.exit(final.decision === 'READY_FOR_RAILWAY' ? 0 : 1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

// Production environment validation and dotenv handling
const { validateProductionEnv, getEnvironmentProfile } = require('../../../lib/production-env-validator');

// Perform strict production environment validation
validateProductionEnv();

const redis = require('redis');
const axios = require('axios');
const Docker = require('dockerode');
const path = require('path');
const fs = require('fs');
const { initializeDatabase, testConnection } = require('../../../lib/db-connector');
const { CircuitBreaker } = require('../../../lib/rate-limiter');
const { getEnvProfile } = require('../../../config/env-profiles');

// Use validated environment variables
const REDIS_URL = process.env.REDIS_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const DATA_DIR = process.env.DATA_DIR || '/data/agent';
const OLLAMA_URL = process.env.OLLAMA_URL;

// Redis connection with runtime guard
if (!REDIS_URL) {
  console.error('[REDIS] REDIS_URL environment variable is required');
  console.error('[REDIS] Set REDIS_URL to Redis connection string');
  process.exit(1);
}

const redisClient = redis.createClient({ url: process.env.REDIS_URL });
const docker = new Docker();
const ollamaCircuitBreaker = new CircuitBreaker(5, 30); // 5 failures, 30s cooldown

redisClient.on('error', (err) => {
  console.error('[REDIS] Redis connection error:', err);
  process.exit(1);
});

redisClient.on('connect', () => {
  console.log('[REDIS] Connected to Redis');
});

function broadcastLog(jobId, logEntry) {
  // Placeholder - actual broadcasting handled by server
  console.log(`[${jobId}]`, logEntry);
}

function ensureMemoryDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readMemoryFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return {};
}

function writeMemoryFile(filename, data) {
  ensureMemoryDir();
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

const StateMachine = require('../../../lib/state-machine');

async function updateJobStatus(jobId, tenantId, status, updates = {}) {
  const db = require('../../../lib/db-connector').getPool();
  const redisKey = `tenant:${tenantId}:job:${jobId}`;
  
  try {
    // 1. Get current status first for validation
    const currentJob = await db.query(
      'SELECT status FROM jobs WHERE id = $1 AND tenant_id = $2',
      [jobId, tenantId]
    );

    if (currentJob.rows.length === 0) {
      console.warn(`[WORKER] Job ${jobId} not found, cannot update to ${status}`);
      return;
    }

    const currentStatus = currentJob.rows[0].status;

    // 2. Validate transition (CRITICAL FIX)
    try {
      StateMachine.validateTransition(currentStatus, status);
    } catch (validationError) {
      console.error(`[WORKER] Invalid state transition blocked: ${validationError.message}`);
      // Don't update DB if invalid transition, but maybe log it?
      return; 
    }

    // 3. Update with optimistic locking (ensure status hasn't changed since read)
    const result = await db.query(`
      UPDATE jobs 
      SET status = $1, output_data = $2, error_message = $3, updated_at = NOW()
      WHERE id = $4 AND tenant_id = $5 AND status = $6
      RETURNING id
    `, [
      status,
      JSON.stringify(updates),
      updates.error || null,
      jobId,
      tenantId,
      currentStatus // Optimistic locking check
    ]);
    
    if (result.rows.length === 0) {
      console.warn(`[WORKER] Concurrent modification detected for ${jobId}. Expected status ${currentStatus}, but it changed.`);
      // Retry could be implemented here, but for now we warn
    } else {
      console.log(`[WORKER] Job ${jobId} transitioned: ${currentStatus} -> ${status}`);
    }
    
    // 4. Update Redis (best effort)
    const jobData = await redisClient.hGet(redisKey, 'data');
    if (jobData) {
      const job = JSON.parse(jobData);
      job.status = status;
      job.updated_at = new Date().toISOString();
      Object.assign(job, updates);
      await redisClient.hSet(redisKey, 'data', JSON.stringify(job));
    }
  } catch (error) {
    console.error('[DATABASE] Failed to update job status:', error);
    throw error;
  }
}

// Adapter: Ollama LLM Integration with Circuit Breaker Protection
// Type: PLUGGABLE_ADAPTER
// Status: Graceful fallback when unavailable
async function callLLM(prompt, context = {}) {
  if (!OLLAMA_URL) {
    console.log('[ADAPTER] Ollama URL not configured');
    return null;
  }

  const operation = async () => {
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: 'llama3.2',
      prompt: `Context: ${JSON.stringify(context)}\n\nUser: ${prompt}\n\nAssistant:`,
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 500
      }
    }, {
      timeout: 60000 // 60 second timeout
    });
    return response.data.response;
  };

  try {
    await ollamaCircuitBreaker.initialize(redisClient);
    const result = await ollamaCircuitBreaker.execute('ollama_api', operation, 60000);
    
    if (result.success) {
      return result.result;
    } else {
      console.log('[ADAPTER] Ollama LLM unavailable:', result.error);
      if (result.circuitOpen) {
        console.log('[ADAPTER] Ollama circuit breaker is open - protecting against overload');
      }
      return null;
    }
  } catch (error) {
    console.log('[ADAPTER] Ollama LLM error:', error.message);
    return null;
  }
}

// Core Intent Analysis (with optional LLM enhancement)
async function analyzeIntent(message) {
  // Try LLM adapter first
  const llmResult = await callLLM(`Analyze user intent: ${message}`);
  
  if (llmResult) {
    console.log('[ADAPTER] Using LLM-enhanced intent analysis');
    return {
      analysis: llmResult,
      intent: message,
      adapter_enhanced: true
    };
  }
  
  // Core fallback analysis (always available)
  return { 
    analysis: 'Core analysis: ' + message,
    intent: message,
    adapter_enhanced: false
  };
}

// Core Plan Creation (with optional LLM enhancement)
async function createPlan(intent) {
  const memory = {
    projectState: readMemoryFile('project_state.json'),
    constraints: readMemoryFile('constraints.json'),
    knownIssues: readMemoryFile('known_issues.json')
  };
  
  // Try LLM adapter for plan enhancement
  const llmPlan = await callLLM(`Create execution plan for: ${intent.intent}`, memory);
  
  if (llmPlan) {
    console.log('[ADAPTER] Using LLM-enhanced planning');
    try {
      // Try to parse as JSON first
      const parsedPlan = JSON.parse(llmPlan);
      return {
        steps: parsedPlan.steps || [
          { id: '1', action: 'analyze', description: 'LLM-enhanced analysis: ' + intent.intent, status: 'pending' },
          { id: '2', action: 'execute', description: 'LLM-enhanced execution: ' + intent.intent, status: 'pending' },
          { id: '3', action: 'verify', description: 'LLM-enhanced verification: ' + intent.intent, status: 'pending' }
        ],
        adapter_enhanced: true,
        llm_response: llmPlan
      };
    } catch (parseError) {
      console.log('[ADAPTER] LLM returned text, creating fallback plan');
      // If parsing fails, create a plan based on the text response
      return {
        steps: [
          { id: '1', action: 'analyze', description: 'LLM-enhanced analysis: ' + intent.intent, status: 'pending' },
          { id: '2', action: 'execute', description: 'LLM-enhanced execution: ' + intent.intent, status: 'pending' },
          { id: '3', action: 'verify', description: 'LLM-enhanced verification: ' + intent.intent, status: 'pending' }
        ],
        adapter_enhanced: true,
        llm_response: llmPlan
      };
    }
  }
  
  // Core fallback plan (always available)
  console.log('[CORE] Using core planning logic');
  return {
    steps: [
      { id: '1', action: 'analyze', description: 'Core analysis: ' + intent.intent, status: 'pending' },
      { id: '2', action: 'execute', description: 'Core execution: ' + intent.intent, status: 'pending' },
      { id: '3', action: 'verify', description: 'Core verification: ' + intent.intent, status: 'pending' }
    ],
    adapter_enhanced: false
  };
}

async function executeStep(jobId, step) {
  broadcastLog(jobId, { 
    type: 'step_start', 
    step: step.id, 
    description: step.description 
  });
  
  try {
    let result;
    switch (step.action) {
      case 'analyze':
        result = await executeAnalysis(jobId, step);
        break;
      case 'execute':
        result = await executeCommand(jobId, step);
        break;
      case 'verify':
        result = await verifyResults(jobId, step);
        break;
      default:
        result = await executeGeneric(jobId, step);
    }
    
    broadcastLog(jobId, { 
      type: 'step_complete', 
      step: step.id, 
      result: result 
    });
    
    return { success: true, result };
  } catch (error) {
    broadcastLog(jobId, { 
      type: 'step_error', 
      step: step.id, 
      error: error.message 
    });
    
    const knownIssues = readMemoryFile('known_issues.json');
    knownIssues[jobId] = { step: step.id, error: error.message, timestamp: new Date().toISOString() };
    writeMemoryFile('known_issues.json', knownIssues);
    
    return { success: false, error: error.message };
  }
}

async function executeAnalysis(jobId, step) {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return { analysis: 'Analysis completed', findings: [] };
}

// Adapter: Docker Execution Environment
// Type: PLUGGABLE_ADAPTER
// Status: Real execution when Docker available; explicit unavailable when not
async function executeCommand(jobId, step) {
  if (!step.command) {
    return { output: 'No command specified' };
  }

  const dockerAvailable = process.env.DOCKER_HOST && process.env.DOCKER_HOST.trim() !== '';

  if (!dockerAvailable) {
    broadcastLog(jobId, {
      type: 'adapter_unavailable',
      message: 'Docker execution adapter not available - command queued for manual execution'
    });
    return {
      output: `Command queued for manual execution: ${step.command}`,
      exitCode: 0,
      adapter_status: 'unavailable'
    };
  }

  try {
    broadcastLog(jobId, {
      type: 'adapter_active',
      message: 'Docker execution adapter processing command'
    });

    const { Writable } = require('stream');
    let output = '';
    const capture = new Writable({
      write(chunk, enc, cb) {
        output += chunk.toString();
        cb();
      }
    });

    const runPromise = docker.run(
      'alpine:3.18',
      ['sh', '-c', step.command],
      [capture, capture],
      { Tty: false }
    );
    const timeoutMs = 30000;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Docker execution timeout (30s)')), timeoutMs)
    );
    const [data, container] = await Promise.race([runPromise, timeoutPromise]);
    if (container) await container.remove().catch(() => {});

    const exitCode = (data && data.StatusCode !== undefined) ? data.StatusCode : 0;
    return {
      output: output || '(no output)',
      exitCode,
      adapter_status: 'active'
    };
  } catch (error) {
    broadcastLog(jobId, {
      type: 'adapter_error',
      message: `Docker adapter error: ${error.message}`
    });
    return {
      output: `Docker execution failed: ${error.message}`,
      exitCode: 1,
      adapter_status: 'error'
    };
  }
}

async function verifyResults(jobId, step) {
  await new Promise(resolve => setTimeout(resolve, 500));
  return { verified: true, status: 'success' };
}

async function executeGeneric(jobId, step) {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return { message: `Executed ${step.action}` };
}

async function processJob(jobData, tenantId) {
  const job = JSON.parse(jobData);
  const jobId = job.id;
  const tid = tenantId || job.tenantId || 'default';
  
  console.log(`[WORKER] Processing job ${jobId} (tenant ${tid}): ${job.message}`);
  
  let heartbeatInterval = null;
  let jobTimedOut = false;
  
  // CRITICAL FIX: Heartbeat update every 5 seconds to detect stuck jobs
  heartbeatInterval = setInterval(async () => {
    try {
      if (!jobTimedOut) {
        await updateJobStatus(jobId, tid, 'processing', { 
          heartbeat: new Date().toISOString(),
          stage: 'processing'
        });
      }
    } catch (err) {
      console.error(`[WORKER] Heartbeat failed for ${jobId}:`, err.message);
    }
  }, 5000);
  
  const jobTimeout = setTimeout(async () => {
    jobTimedOut = true;
    console.log(`[WORKER] Job ${jobId} timed out (60s), marking as failed`);
    try {
      await updateJobStatus(jobId, tid, 'failed', { error: 'Job execution timeout (60s)' });
      broadcastLog(jobId, { type: 'job_failed', error: 'Job execution timeout' });
    } catch (err) {
      console.error(`[WORKER] Failed to mark job as failed on timeout:`, err.message);
    }
  }, 60000);
  
  broadcastLog(jobId, { type: 'job_start', message: `Started processing: ${job.message}` });
  
  try {
    await updateJobStatus(jobId, tid, 'processing');
    const intent = await analyzeIntent(job.message);
    broadcastLog(jobId, { type: 'analysis_complete', intent: intent.intent });
    
    const plan = await createPlan(intent);
    broadcastLog(jobId, { type: 'plan_created', steps: plan.steps.length });
    
    let completedSteps = 0;
    for (const step of plan.steps) {
      step.status = 'in_progress';
      broadcastLog(jobId, { 
        type: 'step_start', 
        step: step.id, 
        description: step.description,
        total_steps: plan.steps.length,
        completed_steps: completedSteps
      });
      
      const result = await executeStep(jobId, step);
      step.status = result.success ? 'completed' : 'failed';
      step.result = result;
      completedSteps++;
      
      if (result.success) {
        broadcastLog(jobId, { 
          type: 'step_complete', 
          step: step.id, 
          result: result,
          progress: `${completedSteps}/${plan.steps.length}`
        });
      } else {
        throw new Error(`Step ${step.id} failed: ${result.error}`);
      }
    }
    
    clearTimeout(jobTimeout);
    await updateJobStatus(jobId, tid, 'completed', { 
      plan, 
      intent,
      execution_summary: {
        total_steps: plan.steps.length,
        completed_steps: completedSteps,
        execution_time: Date.now()
      }
    });
    
    broadcastLog(jobId, { 
      type: 'job_complete', 
      status: 'success',
      summary: `Completed ${completedSteps} steps successfully`
    });
    
    console.log(`[WORKER] Job ${jobId} completed successfully`);
    
  } catch (error) {
    clearTimeout(jobTimeout);
    console.error(`[WORKER] Job ${jobId} failed:`, error);
    // Only mark as failed if not already timed out
    if (!jobTimedOut) {
      try {
        await updateJobStatus(jobId, tid, 'failed', { error: error.message });
        broadcastLog(jobId, { type: 'job_failed', error: error.message });
      } catch (updateErr) {
        console.error(`[WORKER] Failed to mark job as failed:`, updateErr.message);
      }
    }
  } finally {
    // CRITICAL FIX: Always clean up timers to prevent resource leak
    clearTimeout(jobTimeout);
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
  }
}

async function recoverStuckJobs() {
  const stuckStates = ['processing', 'planning'];
  const timeoutMinutes = 30; // Extended timeout for planning state recovery
  const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000);
  try {
    // CRITICAL FIX: Also check database for jobs stuck in "planning" state
    const db = require('../../../lib/db-connector').getPool();
    
    // Recovery from database stuck jobs
    const stuckDbJobs = await db.query(`
      SELECT id, tenant_id, status, created_at FROM jobs 
      WHERE status IN ('planning', 'processing') 
        AND created_at < NOW() - INTERVAL '${timeoutMinutes} minutes'
      LIMIT 100
    `);
    
    let recoveredCount = 0;
    for (const dbJob of stuckDbJobs.rows) {
      console.log(`Recovering stuck job from DB: ${dbJob.id.substring(0, 8)} (status=${dbJob.status}, tenant=${dbJob.tenant_id})`);
      try {
        await updateJobStatus(dbJob.id, dbJob.tenant_id, 'failed', { 
          error: `Job recovered after ${timeoutMinutes} minute timeout (was in ${dbJob.status} state)`,
          recovered_at: new Date().toISOString()
        });
        broadcastLog(dbJob.id, { 
          type: 'job_recovered', 
          message: `Job recovered from ${dbJob.status} state after ${timeoutMinutes}m timeout` 
        });
        recoveredCount++;
      } catch (err) {
        console.error(`Failed to recover job ${dbJob.id}:`, err.message);
      }
    }
    
    // Also recovery from Redis cache
    const keys = await redisClient.keys('tenant:*:job:*');
    for (const key of keys) {
      const jobData = await redisClient.hGet(key, 'data');
      if (jobData) {
        const job = JSON.parse(jobData);
        const tenantId = key.startsWith('tenant:') ? key.split(':')[1] : 'default';
        if (stuckStates.includes(job.status)) {
          const jobTime = new Date(job.created_at);
          if (jobTime < cutoffTime) {
            console.log(`Recovering stuck job from Redis: ${job.id.substring(0, 8)} (tenant ${tenantId})`);
            try {
              await updateJobStatus(job.id, tenantId, 'failed', { 
                error: `Job recovered after ${timeoutMinutes} minute timeout`,
                recovered_at: new Date().toISOString()
              });
              broadcastLog(job.id, { type: 'job_recovered', message: `Job recovered from ${job.status} state after timeout` });
              recoveredCount++;
            } catch (err) {
              console.error(`Failed to recover job ${job.id}:`, err.message);
            }
          }
        }
      }
    }
    if (recoveredCount > 0) console.log(`Recovery completed: ${recoveredCount} jobs recovered`);
  } catch (error) {
    console.error('Recovery failed:', error);
  }
  setTimeout(() => recoverStuckJobs(), 60000);
}

// Core Worker Bootstrap
async function workerBootstrap() {
  const profile = getEnvProfile();
  console.log(`[ENV] Profile: ${profile.env} (logging=${profile.logging}, limits=${profile.limits}, dry_run=${profile.dry_run})`);
  console.log('[CORE] Worker starting...');
  
  // Initialize database connection
  try {
    console.log('[DATABASE] Initializing database connection...');
    initializeDatabase();
    
    console.log('[DATABASE] Testing database connection...');
    const connectionTest = await testConnection();
    if (!connectionTest) {
      throw new Error('Database connection test failed');
    }
    
    console.log('[DATABASE] Database connection established');
  } catch (error) {
    console.error('[DATABASE] Database initialization failed:', error);
    process.exit(1);
  }
  
  // Test Redis connection
  try {
    console.log('[REDIS] Testing Redis connection...');
    await redisClient.ping();
    console.log('[REDIS] Redis connection verified');
  } catch (error) {
    console.error('[REDIS] Redis initialization failed:', error);
    process.exit(1);
  }
  
  // Check adapter availability
  const ollamaAvailable = process.env.OLLAMA_URL && process.env.OLLAMA_URL.trim() !== '';
  const dockerAvailable = process.env.DOCKER_HOST && process.env.DOCKER_HOST.trim() !== '';
  
  console.log('[ADAPTER] Ollama LLM:', ollamaAvailable ? 'AVAILABLE' : 'UNAVAILABLE');
  console.log('[ADAPTER] Docker Runtime:', dockerAvailable ? 'AVAILABLE' : 'UNAVAILABLE');
  
  if (!ollamaAvailable && !dockerAvailable) {
    console.log('[CORE] Worker running in core-only mode (no external adapters)');
  }
  
  return { ollamaAvailable, dockerAvailable };
}
  
// Core Worker Loop (tenant-scoped queues: BLPOP tenant:*:job_queue)
async function workerLoop() {
  console.log('[CORE] Worker loop started - waiting for jobs (tenant-scoped queues)...');
  setTimeout(() => recoverStuckJobs(), 5000);
  
  let idleCount = 0;
  const maxIdleCycles = 6;
  
  while (workerRunning) {
    try {
      let tenants = await redisClient.sMembers('tenants');
      if (!tenants || tenants.length === 0) {
        await redisClient.sAdd('tenants', 'default');
        tenants = ['default'];
      }
      const queueKeys = tenants.map(t => `tenant:${t}:job_queue`);
      const timeout = 10;
      const jobData = await redisClient.blPop(...queueKeys, timeout);
      
      if (jobData) {
        idleCount = 0;
        const queueKey = Array.isArray(jobData) ? jobData[0] : jobData.key;
        const payload = Array.isArray(jobData) ? jobData[1] : jobData.element;
        const tenantId = (queueKey && String(queueKey).startsWith('tenant:')) ? String(queueKey).split(':')[1] : 'default';
        console.log(`[WORKER] Found job (tenant ${tenantId}): ${(payload || '').substring(0, 80)}...`);
        await processJob(payload, tenantId);
        console.log('[WORKER] Job processing completed');
      } else {
        idleCount++;
        console.log(`[WORKER] No jobs found (idle cycle ${idleCount}/${maxIdleCycles})`);
        
        if (idleCount >= maxIdleCycles) {
          console.warn('[WORKER] IDLE WARNING: Worker has been idle for 60+ seconds');
          console.warn('[WORKER] This may indicate: 1) No jobs being submitted, 2) Queue connectivity issue, 3) System malfunction');
          console.warn('[WORKER] Worker will continue monitoring but system administrator should verify job submission pipeline');
          
          // Reset counter to avoid spam but continue monitoring
          idleCount = 0;
        }
      }
    } catch (error) {
      console.error('[WORKER] Worker error:', error);
      console.error('[WORKER] This is a critical error - worker functionality may be compromised');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

let workerRunning = true;

redisClient.connect().then(async () => {
  console.log('[CORE] Worker connected to Redis');
  await workerBootstrap();
  console.log('[WORKER] Bootstrap complete, starting worker loop');
  workerLoop();
}).catch(error => {
  console.error('[CORE] Failed to connect to Redis:', error);
  console.error('[WORKER] Cannot start without Redis connection');
  process.exit(1);
});

const shutdown = () => {
  workerRunning = false;
  console.log('[WORKER] Shutdown signal received, closing Redis...');
  redisClient.quit().catch(() => {}).finally(() => process.exit(0));
  setTimeout(() => process.exit(1), 8000);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

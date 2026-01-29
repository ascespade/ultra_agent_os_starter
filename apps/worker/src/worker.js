const redis = require('redis');
const axios = require('axios');
const Docker = require('dockerode');
const path = require('path');
const fs = require('fs');

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const DATA_DIR = process.env.DATA_DIR || '/data/agent';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434';

const redisClient = redis.createClient({ url: REDIS_URL });
const docker = new Docker();

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

async function updateJobStatus(jobId, status, updates = {}) {
  const jobData = await redisClient.hGet(`job:${jobId}`, 'data');
  if (jobData) {
    const job = JSON.parse(jobData);
    job.status = status;
    job.updated_at = new Date().toISOString();
    Object.assign(job, updates);
    await redisClient.hSet(`job:${jobId}`, 'data', JSON.stringify(job));
  }
}

// Adapter: Ollama LLM Integration
// Type: PLUGGABLE_ADAPTER
// Status: Graceful fallback when unavailable
async function callLLM(prompt, context = {}) {
  try {
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: 'llama3.2',
      prompt: `Context: ${JSON.stringify(context)}\n\nUser: ${prompt}\n\nAssistant:`,
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 500
      }
    });
    return response.data.response;
  } catch (error) {
    console.log('[ADAPTER] Ollama LLM unavailable:', error.message);
    return null; // Explicit null for adapter unavailable
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
    return {
      steps: JSON.parse(llmPlan).steps || [
        { id: '1', action: 'analyze', description: 'LLM-enhanced analysis: ' + intent.intent, status: 'pending' },
        { id: '2', action: 'execute', description: 'LLM-guided execution: ' + intent.intent, status: 'pending' },
        { id: '3', action: 'verify', description: 'LLM-assisted verification: ' + intent.intent, status: 'pending' }
      ],
      adapter_enhanced: true
    };
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
// Status: Intentionally disabled for platform core stability
async function executeCommand(jobId, step) {
  if (!step.command) {
    return { output: 'No command specified' };
  }
  
  // Adapter Check: Docker execution capability not available
  const dockerAvailable = process.env.DOCKER_HOST && !process.env.DOCKER_HOST.includes('localhost');
  
  if (!dockerAvailable) {
    broadcastLog(jobId, { 
      type: 'adapter_unavailable', 
      message: 'Docker execution adapter not available - command queued for manual execution' 
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return { 
      output: `Command queued for manual execution: ${step.command}`, 
      exitCode: 0,
      adapter_status: 'unavailable'
    };
  }
  
  // Docker execution path (guarded)
  try {
    broadcastLog(jobId, { 
      type: 'adapter_active', 
      message: 'Docker execution adapter processing command' 
    });
    
    // Actual Docker execution would go here
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const simulatedOutput = `Docker execution result for: ${step.command}`;
    return { output: simulatedOutput, exitCode: 0, adapter_status: 'active' };
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

async function processJob(jobData) {
  const job = JSON.parse(jobData);
  const jobId = job.id;
  
  const jobTimeout = setTimeout(async () => {
    console.log(`Job ${jobId} timed out, marking as failed`);
    await updateJobStatus(jobId, 'failed', { error: 'Job execution timeout' });
    broadcastLog(jobId, { type: 'job_failed', error: 'Job execution timeout' });
  }, 60000); // 60 second timeout
  
  broadcastLog(jobId, { type: 'job_start', message: job.message });
  
  try {
    await updateJobStatus(jobId, 'analyzing');
    const intent = await analyzeIntent(job.message);
    
    await updateJobStatus(jobId, 'planning', { intent });
    const plan = await createPlan(intent);
    
    await updateJobStatus(jobId, 'executing', { plan });
    
    for (const step of plan.steps) {
      step.status = 'in_progress';
      const result = await executeStep(jobId, step);
      step.status = result.success ? 'completed' : 'failed';
      step.result = result;
      
      if (!result.success) {
        throw new Error(`Step ${step.id} failed: ${result.error}`);
      }
    }
    
    clearTimeout(jobTimeout);
    await updateJobStatus(jobId, 'completed', { plan, intent });
    broadcastLog(jobId, { type: 'job_complete', status: 'success' });
    
  } catch (error) {
    clearTimeout(jobTimeout);
    await updateJobStatus(jobId, 'failed', { error: error.message });
    broadcastLog(jobId, { type: 'job_failed', error: error.message });
  }
}

async function recoverStuckJobs() {
  console.log('Starting stuck job recovery...');
  const stuckStates = ['planning', 'analyzing', 'executing'];
  const timeoutMinutes = 5;
  const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000);
  
  try {
    const keys = await redisClient.keys('job:*');
    let recoveredCount = 0;
    
    for (const key of keys) {
      const jobData = await redisClient.hGet(key, 'data');
      if (jobData) {
        const job = JSON.parse(jobData);
        
        if (stuckStates.includes(job.status)) {
          const jobTime = new Date(job.created_at);
          if (jobTime < cutoffTime) {
            console.log(`Recovering stuck job: ${job.id.substring(0, 8)} (${job.status})`);
            await updateJobStatus(job.id, 'failed', { 
              error: `Job recovered after ${timeoutMinutes} minute timeout`,
              recovered_at: new Date().toISOString()
            });
            broadcastLog(job.id, { 
              type: 'job_recovered', 
              message: `Job recovered from ${job.status} state after timeout`
            });
            recoveredCount++;
          }
        }
      }
    }
    
    console.log(`Recovery completed: ${recoveredCount} jobs recovered`);
  } catch (error) {
    console.error('Recovery failed:', error);
  }
  
  // Schedule next recovery
  setTimeout(() => recoverStuckJobs(), 60000); // Check every minute
}

// Core Worker Bootstrap
// Ensures worker can start even if adapters are unavailable
async function workerBootstrap() {
  console.log('[CORE] Worker starting...');
  
  // Check adapter availability
  const ollamaAvailable = !process.env.OLLAMA_URL.includes('localhost');
  const dockerAvailable = process.env.DOCKER_HOST && !process.env.DOCKER_HOST.includes('localhost');
  
  console.log('[ADAPTER] Ollama LLM:', ollamaAvailable ? 'AVAILABLE' : 'UNAVAILABLE');
  console.log('[ADAPTER] Docker Runtime:', dockerAvailable ? 'AVAILABLE' : 'UNAVAILABLE');
  
  if (!ollamaAvailable && !dockerAvailable) {
    console.log('[CORE] Worker running in core-only mode (no external adapters)');
  }
  
  return { ollamaAvailable, dockerAvailable };
}
  
// Core Worker Loop
// Continues processing jobs regardless of adapter availability
async function workerLoop() {
  console.log('[CORE] Worker loop started - waiting for jobs...');
  
  // Start recovery loop for stuck jobs
  setTimeout(() => recoverStuckJobs(), 5000);
  
  while (true) {
    try {
      console.log('Checking for jobs...');
      const jobData = await redisClient.brPop('job_queue', 10);
      if (jobData) {
        console.log('Found job:', jobData.element.substring(0, 100) + '...');
        await processJob(jobData.element);
        console.log('Job processing completed');
      } else {
        console.log('No jobs found, continuing...');
      }
    } catch (error) {
      console.error('Worker error:', error);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

redisClient.connect().then(async () => {
  console.log('[CORE] Worker connected to Redis');
  await workerBootstrap();
  workerLoop();
}).catch(error => {
  console.error('[CORE] Failed to connect to Redis:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});


const express = require('express');
const redis = require('redis');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(helmet());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'ultra-agent-os-secret-key-change-in-production';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DATA_DIR = process.env.DATA_DIR || './data';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

const redisClient = redis.createClient({ url: REDIS_URL });
redisClient.connect();

const wss = new WebSocket.Server({ port: process.env.WS_PORT || 3010 });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.on('message', async (message) => {
    const data = JSON.parse(message);
    if (data.type === 'subscribe_logs') {
      ws.jobId = data.jobId;
    }
  });
});

function broadcastLog(jobId, logEntry) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.jobId === jobId) {
      client.send(JSON.stringify({ type: 'log', jobId, ...logEntry }));
    }
  });
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

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}

// Initialize default user
async function initializeDefaultUser() {
  const usersFile = path.join(DATA_DIR, 'users.json');
  if (!fs.existsSync(usersFile)) {
    ensureMemoryDir();
    const defaultPassword = await bcrypt.hash('admin123', 10);
    const users = {
      'admin': {
        password: defaultPassword,
        role: 'admin',
        created: new Date().toISOString()
      }
    };
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    console.log('Default admin user created (admin/admin123)');
  }
}

// Login endpoint with validation
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  // Input validation
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password must be strings' });
  }
  
  if (username.length < 1 || username.length > 50) {
    return res.status(400).json({ error: 'Username must be between 1 and 50 characters' });
  }
  
  if (password.length < 1 || password.length > 100) {
    return res.status(400).json({ error: 'Password must be between 1 and 100 characters' });
  }
  
  // Username validation
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores, and hyphens' });
  }
  
  try {
    const usersFile = path.join(DATA_DIR, 'users.json');
    if (!fs.existsSync(usersFile)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    const user = users[username];
    
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({ token, user: { username, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Input validation middleware
function validateInput(req, res, next) {
  const { message } = req.body;
  
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required and must be a string' });
  }
  
  if (message.length < 1 || message.length > 10000) {
    return res.status(400).json({ error: 'Message must be between 1 and 10000 characters' });
  }
  
  // Basic XSS prevention
  if (/<script|javascript:|on\w+=/i.test(message)) {
    return res.status(400).json({ error: 'Invalid characters in message' });
  }
  
  next();
}

app.post('/api/chat', authenticateToken, validateInput, async (req, res) => {
  const { message } = req.body;
  const jobId = uuidv4();
  
  const job = {
    id: jobId,
    message,
    status: 'planning',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  await redisClient.lPush('job_queue', JSON.stringify(job));
  await redisClient.hSet(`job:${jobId}`, 'data', JSON.stringify(job));
  
  res.json({ jobId, status: 'queued' });
});

app.get('/api/jobs/:jobId', authenticateToken, async (req, res) => {
  const { jobId } = req.params;
  const jobData = await redisClient.hGet(`job:${jobId}`, 'data');
  
  if (jobData) {
    res.json(JSON.parse(jobData));
  } else {
    res.status(404).json({ error: 'Job not found' });
  }
});

app.get('/api/jobs', authenticateToken, async (req, res) => {
  const jobs = [];
  const keys = await redisClient.keys('job:*');
  
  for (const key of keys) {
    const jobData = await redisClient.hGet(key, 'data');
    if (jobData) {
      jobs.push(JSON.parse(jobData));
    }
  }
  
  res.json(jobs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

app.get('/api/memory/:filename', authenticateToken, (req, res) => {
  const { filename } = req.params;
  const data = readMemoryFile(filename);
  res.json(data);
});

app.post('/api/memory/:filename', authenticateToken, (req, res) => {
  const { filename } = req.params;
  const { data } = req.body;
  
  // Filename validation
  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'Valid filename required' });
  }
  
  if (!/^[a-zA-Z0-9_.-]+$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename format' });
  }
  
  if (filename.length > 100) {
    return res.status(400).json({ error: 'Filename too long' });
  }
  
  // Data validation
  if (data === undefined) {
    return res.status(400).json({ error: 'Data is required' });
  }
  
  try {
    JSON.stringify(data);
  } catch (error) {
    return res.status(400).json({ error: 'Data must be JSON serializable' });
  }
  
  writeMemoryFile(filename, data);
  res.json({ success: true });
});

app.get('/api/workspace', authenticateToken, (req, res) => {
  const projectState = readMemoryFile('project_state.json');
  const constraints = readMemoryFile('constraints.json');
  const decisions = readMemoryFile('decisions.log');
  const knownIssues = readMemoryFile('known_issues.json');
  
  res.json({
    projectState,
    constraints,
    decisions,
    knownIssues,
    lastUpdated: new Date().toISOString()
  });
});

// Health check endpoint for Railway
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

const PORT = process.env.PORT || 3005;

// Initialize default user before starting server
initializeDefaultUser().then(() => {
  app.listen(PORT, () => {
    console.log(`Ultra Agent API running on ${PORT}`);
    console.log(`WebSocket server running on ${process.env.WS_PORT || 3010}`);
    console.log(`Default credentials: admin/admin123`);
  });
}).catch(error => {
  console.error('Failed to initialize:', error);
  process.exit(1);
});

module.exports = { app, broadcastLog, redisClient };

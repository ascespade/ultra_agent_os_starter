require('dotenv').config();
const WebSocket = require('ws');
const redis = require('redis');
const jwt = require('jsonwebtoken');
const pino = require('pino');

const logger = pino({
  name: 'ws-service',
  level: process.env.LOG_LEVEL || 'info'
});

const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET;
const REDIS_URL = process.env.REDIS_URL;

if (!JWT_SECRET) {
  logger.error('JWT_SECRET environment variable is required');
  process.exit(1);
}

if (!REDIS_URL) {
  logger.error('REDIS_URL environment variable is required');
  process.exit(1);
}

// Redis clients
const redisSubscriber = redis.createClient({ url: REDIS_URL });
const redisPublisher = redis.createClient({ url: REDIS_URL });

// WebSocket server
const wss = new WebSocket.Server({
  port: PORT,
  host: HOST,
  perMessageDeflate: false
});

// Connected clients
const clients = new Map();

// Health check endpoint
const healthServer = require('http').createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'ws-service',
      timestamp: new Date().toISOString(),
      connections: clients.size
    }));
  } else if (req.url === '/ready') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ready',
      service: 'ws-service',
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

// JWT validation
function validateToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Send message to specific client
function sendToClient(clientId, message) {
  const client = clients.get(clientId);
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
}

// Broadcast to all clients
function broadcast(message, excludeClientId = null) {
  const messageStr = JSON.stringify(message);
  clients.forEach((client, clientId) => {
    if (clientId !== excludeClientId && client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  const clientId = req.headers['sec-websocket-key'];
  let isAuthenticated = false;
  let user = null;

  logger.info({ clientId }, 'WebSocket connection established');

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connection',
    status: 'connected',
    message: 'Connected to WebSocket service'
  }));

  // Handle messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'auth':
          // Authenticate client
          const token = message.token;
          if (!token) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Authentication token required'
            }));
            return;
          }

          const decoded = validateToken(token);
          if (!decoded) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Invalid authentication token'
            }));
            return;
          }

          isAuthenticated = true;
          user = decoded;
          clients.set(clientId, {
            ws,
            user,
            authenticated: true,
            connectedAt: new Date()
          });

          ws.send(JSON.stringify({
            type: 'authenticated',
            user: {
              id: user.userId,
              username: user.username,
              role: user.role,
              tenantId: user.tenantId
            }
          }));

          logger.info({ 
            clientId, 
            userId: user.userId, 
            username: user.username 
          }, 'Client authenticated');

          break;

        case 'subscribe':
          // Subscribe to events
          if (!isAuthenticated) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Authentication required'
            }));
            return;
          }

          const { channel } = message;
          if (!channel) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Channel required for subscription'
            }));
            return;
          }

          // Store subscription
          const clientData = clients.get(clientId);
          if (clientData) {
            if (!clientData.subscriptions) {
              clientData.subscriptions = new Set();
            }
            clientData.subscriptions.add(channel);
            clients.set(clientId, clientData);
          }

          ws.send(JSON.stringify({
            type: 'subscribed',
            channel
          }));

          logger.info({ 
            clientId, 
            userId: user.userId, 
            channel 
          }, 'Client subscribed to channel');

          break;

        case 'ping':
          // Respond to ping
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString()
          }));
          break;

        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Unknown message type'
          }));
      }
    } catch (error) {
      logger.error({ error: error.message, clientId }, 'Error handling WebSocket message');
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });

  // Handle disconnection
  ws.on('close', () => {
    clients.delete(clientId);
    logger.info({ clientId }, 'WebSocket connection closed');
  });

  // Handle errors
  ws.on('error', (error) => {
    logger.error({ error: error.message, clientId }, 'WebSocket error');
    clients.delete(clientId);
  });
});

// Redis pub/sub for real-time events
async function setupRedisPubSub() {
  try {
    await redisSubscriber.connect();
    await redisPublisher.connect();

    logger.info('Redis pub/sub connected');

    // Subscribe to job status updates
    await redisSubscriber.subscribe('job:status', (message) => {
      try {
        const jobUpdate = JSON.parse(message);
        
        // Send to subscribed clients
        clients.forEach((client, clientId) => {
          if (client.subscriptions && client.subscriptions.has('jobs')) {
            sendToClient(clientId, {
              type: 'job_update',
              data: jobUpdate
            });
          }
        });
      } catch (error) {
        logger.error({ error: error.message }, 'Error processing job status update');
      }
    });

    // Subscribe to system notifications
    await redisSubscriber.subscribe('system:notifications', (message) => {
      try {
        const notification = JSON.parse(message);
        
        // Broadcast to all authenticated clients
        clients.forEach((client, clientId) => {
          if (client.authenticated) {
            sendToClient(clientId, {
              type: 'system_notification',
              data: notification
            });
          }
        });
      } catch (error) {
        logger.error({ error: error.message }, 'Error processing system notification');
      }
    });

  } catch (error) {
    logger.error({ error: error.message }, 'Failed to setup Redis pub/sub');
    process.exit(1);
  }
}

// Health check server
healthServer.listen(PORT + 1000, HOST, () => {
  logger.info(`Health check server listening on ${HOST}:${PORT + 1000}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  wss.close(() => {
    redisSubscriber.quit();
    redisPublisher.quit();
    healthServer.close();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  wss.close(() => {
    redisSubscriber.quit();
    redisPublisher.quit();
    healthServer.close();
    process.exit(0);
  });
});

// Start server
async function startServer() {
  try {
    await setupRedisPubSub();
    
    logger.info(`WebSocket service started on ${HOST}:${PORT}`);
    logger.info(`Health check available on ${HOST}:${PORT + 1000}`);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to start WebSocket service');
    process.exit(1);
  }
}

startServer();

// Export for testing
module.exports = { wss, clients, sendToClient, broadcast };

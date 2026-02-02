require('dotenv').config({ path: '../../.env' });
const express = require('express');
const path = require('path');
const { getAvailablePort } = require('../../../lib/port-allocator');

const app = express();
let PORT = process.env.UI_PORT || process.env.PORT || 3002;
let API_URL = process.env.API_URL;

// Railway environment variables fallback
if (!API_URL && process.env.RAILWAY_ENVIRONMENT) {
  // In Railway, use the Railway service URL
  API_URL = process.env.RAILWAY_PUBLIC_URL || `https://${process.env.RAILWAY_SERVICE_NAME}.railway.app`;
}

if (!API_URL) {
  console.error('[CRITICAL] API_URL environment variable is required');
  console.error('[CRITICAL] Set API_URL to API service URL');
  process.exit(1);
}

// Serve static files with API URL injection
app.get('/', (req, res) => {
  // Always serve the unified dashboard
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Legacy routes for backward compatibility
app.get('/admin', (req, res) => {
  res.redirect('/?admin=true');
});

app.get('/settings', (req, res) => {
  res.sendFile(path.join(__dirname, 'settings.html'));
});

app.get('/test-api', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-api.html'));
});

// Inject API URL and WebSocket port for frontend (dynamic)
app.get('/env.js', (req, res) => {
  res.type('application/javascript');
  const { getAllocatedPorts } = require('../../../lib/port-allocator');
  const ports = getAllocatedPorts();
  const wsPort = ports.websocket || 3011;
  res.send(`window.ENV = { API_URL: '${API_URL}', WS_PORT: '${wsPort}' };`);
});

app.use(express.static(__dirname));

// Start server with dynamic port allocation
async function startServer() {
  try {
    // Use UI_PORT if set, otherwise use dynamic allocation
    if (process.env.UI_PORT) {
      PORT = parseInt(process.env.UI_PORT);
      console.log(`[UI] Using fixed UI_PORT: ${PORT}`);
    } else {
      PORT = await getAvailablePort('ui', 3002);
      console.log(`[UI] Allocated dynamic port: ${PORT}`);
    }
    
    // Get API port dynamically if not set
    if (!API_URL) {
      const { getAllocatedPorts } = require('../../../lib/port-allocator');
      const ports = getAllocatedPorts();
      if (ports.api) {
        API_URL = `http://localhost:${ports.api}`;
        console.log(`[UI] Auto-detected API URL: ${API_URL}`);
      }
    } else {
      // If API_URL is set from env, update it with the dynamic port
      const { getAllocatedPorts } = require('../../../lib/port-allocator');
      const ports = getAllocatedPorts();
      if (ports.api && API_URL.includes('localhost')) {
        API_URL = `http://localhost:${ports.api}`;
        console.log(`[UI] Updated API URL to dynamic port: ${API_URL}`);
      }
    }
    
    app.listen(PORT, () => {
      console.log(`UI server running on ${PORT}`);
      console.log(`API URL: ${API_URL}`);
    });
  } catch (error) {
    console.error('[UI] Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

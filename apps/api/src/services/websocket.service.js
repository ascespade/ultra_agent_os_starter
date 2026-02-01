const WebSocket = require("ws");

let wss = null;

function initializeWebSocket(server) {
  wss = new WebSocket.Server({ server });

  // CRITICAL FIX: WebSocket connection limits and cleanup (Risk #4)
  const MAX_WS_CONNECTIONS = 1000;
  const HEARTBEAT_INTERVAL = 30000; // 30 seconds

  // Heartbeat cleanup interval
  const heartbeatCleanup = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log('[WEBSOCKET] Terminating dead connection');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL);

  wss.on('close', () => {
    clearInterval(heartbeatCleanup);
  });

  wss.on("connection", (ws, req) => {
    // CRITICAL FIX: Enforce max connections limit
    if (wss.clients.size > MAX_WS_CONNECTIONS) {
      console.warn(`[WEBSOCKET] Max connections (${MAX_WS_CONNECTIONS}) exceeded. Rejecting connection.`);
      ws.close(1008, 'Server at capacity');
      return;
    }

    console.log(`[WEBSOCKET] Client connected (total: ${wss.clients.size}/${MAX_WS_CONNECTIONS})`);
    
    // CRITICAL FIX: Initialize heartbeat
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on("message", async (message) => {
      try {
        const data = JSON.parse(message);
        if (data.type === "subscribe_logs") {
          ws.jobId = data.jobId;
          console.log(`[WEBSOCKET] Client subscribed to job ${data.jobId}`);
        }
      } catch (error) {
        console.error("[WEBSOCKET] Message parse error:", error);
      }
    });

    ws.on("close", () => {
      console.log(`[WEBSOCKET] Client disconnected (total: ${wss.clients.size}/${MAX_WS_CONNECTIONS})`);
    });

    ws.on("error", (error) => {
      console.error("[WEBSOCKET] Connection error:", error);
    });
  });

  return wss;
}

function broadcastLog(jobId, logEntry) {
  if (!wss) return;
  
  // Convert to string once
  const message = JSON.stringify({ type: "log", jobId, ...logEntry });
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.jobId === jobId) {
      client.send(message);
    }
  });
}

function closeWebSocket() {
  if (wss) {
    wss.close(() => {
      console.log("[WEBSOCKET] Server closed");
    });
  }
}

module.exports = {
  initializeWebSocket,
  broadcastLog,
  closeWebSocket
};

const net = require('net');
const fs = require('fs');
const path = require('path');

// Railway environment detection - MUST BE FIRST
const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
const railwayPort = isRailway && process.env.PORT ? parseInt(process.env.PORT) : null;

// In Railway, immediately clear API port cache to force Railway port usage
if (isRailway && railwayPort) {
  console.log(`[PORT_ALLOC] Railway detected, forcing API port to ${railwayPort}`);
  
  // Clear any existing cache file for API service
  const cacheFile = path.join(__dirname, '..', '.port-cache.json');
  try {
    if (fs.existsSync(cacheFile)) {
      const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cache.api !== railwayPort) {
        console.log(`[PORT_ALLOC] Clearing cached API port ${cache.api}, setting to Railway port ${railwayPort}`);
        cache.api = railwayPort;
        fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
      }
    }
  } catch (error) {
    // Cache file doesn't exist or is corrupted, create new one with Railway port
    console.log(`[PORT_ALLOC] Creating new cache with Railway port ${railwayPort}`);
    const cache = { api: railwayPort };
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  }
}

/**
 * Smart Dynamic Port Allocation System - Railway Fixed
 * Automatically finds available ports and prevents conflicts
 */

// Default port ranges for different services
const PORT_RANGES = {
  api: { start: 3000, end: 3099 },
  ui: { start: 4000, end: 4099 },
  worker: { start: 4100, end: 4199 },
  websocket: { start: 4200, end: 4299 }
};

// Port allocation cache file
const PORT_CACHE_FILE = path.join(__dirname, '..', '.port-cache.json');

/**
 * Check if a port is available
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.listen(port, () => {
      server.once('close', () => {
        resolve(true);
      });
      server.close();
    });
    
    server.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Load existing port allocations from cache
 */
function loadPortCache() {
  try {
    if (fs.existsSync(PORT_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(PORT_CACHE_FILE, 'utf8'));
    }
  } catch (error) {
    console.warn('[PORT_CACHE] Could not load port cache:', error.message);
  }
  return {};
}

/**
 * Save port allocations to cache
 */
function savePortCache(cache) {
  try {
    fs.writeFileSync(PORT_CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.warn('[PORT_CACHE] Could not save port cache:', error.message);
  }
}

/**
 * Get the next available port for a service
 */
async function getAvailablePort(serviceName, preferredPort = null) {
  const cache = loadPortCache();
  const range = PORT_RANGES[serviceName];
  
  if (!range) {
    throw new Error(`Unknown service: ${serviceName}`);
  }
  
  // In Railway, always use Railway's assigned port for API service
  if (serviceName === 'api' && isRailway && process.env.PORT) {
    const railwayPort = parseInt(process.env.PORT);
    console.log(`[PORT_ALLOC] Railway API service: using assigned PORT=${railwayPort}`);
    
    // Update cache with Railway port
    cache.api = railwayPort;
    savePortCache(cache);
    return railwayPort;
  }
  
  // First, try the cached port if it exists (for non-Railway or non-API services)
  if (cache[serviceName]) {
    const cachedPort = cache[serviceName];
    if (await isPortAvailable(cachedPort)) {
      console.log(`[PORT_ALLOC] Reusing cached port for ${serviceName}: ${cachedPort}`);
      return cachedPort;
    } else {
      console.log(`[PORT_ALLOC] Cached port ${cachedPort} for ${serviceName} is in use, finding new port`);
    }
  }
  
  // Try preferred port first
  if (preferredPort && preferredPort >= range.start && preferredPort <= range.end) {
    if (await isPortAvailable(preferredPort)) {
      cache[serviceName] = preferredPort;
      savePortCache(cache);
      console.log(`[PORT_ALLOC] Using preferred port for ${serviceName}: ${preferredPort}`);
      return preferredPort;
    }
  }
  
  // Find first available port in range
  for (let port = range.start; port <= range.end; port++) {
    if (await isPortAvailable(port)) {
      cache[serviceName] = port;
      savePortCache(cache);
      console.log(`[PORT_ALLOC] Allocated port for ${serviceName}: ${port}`);
      return port;
    }
  }
  
  throw new Error(`No available ports found for ${serviceName} in range ${range.start}-${range.end}`);
}

/**
 * Get all allocated ports
 */
function getAllocatedPorts() {
  return loadPortCache();
}

/**
 * Clear port cache (useful for testing or reset)
 */
function clearPortCache() {
  try {
    if (fs.existsSync(PORT_CACHE_FILE)) {
      fs.unlinkSync(PORT_CACHE_FILE);
      console.log('[PORT_ALLOC] Port cache cleared');
    }
  } catch (error) {
    console.warn('[PORT_ALLOC] Could not clear port cache:', error.message);
  }
}

/**
 * Initialize ports for all services
 */
async function initializeAllPorts() {
  const ports = {};
  
  try {
    ports.api = await getAvailablePort('api', 3001);
    ports.ui = await getAvailablePort('ui', 3002);
    ports.worker = await getAvailablePort('worker', 3003);
    ports.websocket = await getAvailablePort('websocket', 3011);
    
    console.log('[PORT_ALLOC] All ports initialized successfully:', ports);
    return ports;
  } catch (error) {
    console.error('[PORT_ALLOC] Failed to initialize ports:', error);
    throw error;
  }
}

module.exports = {
  getAvailablePort,
  getAllocatedPorts,
  clearPortCache,
  initializeAllPorts,
  PORT_RANGES
};
// Railway deployment trigger Sun Feb  1 05:09:20 AM UTC 2026

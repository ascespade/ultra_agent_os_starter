#!/usr/bin/env node

/**
 * Smart Port Manager - Ultra Agent OS
 * Handles dynamic port allocation and service coordination
 */

const { initializeAllPorts, getAllocatedPorts, clearPortCache } = require('../lib/port-allocator');
const path = require('path');
const fs = require('fs');

async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'init':
      console.log('[PORT_MANAGER] Initializing all service ports...');
      try {
        const ports = await initializeAllPorts();
        console.log('[PORT_MANAGER] Ports initialized:', ports);
        
        // Save to a shared location for all services to read
        const portsFile = path.join(__dirname, '..', '.allocated-ports.json');
        fs.writeFileSync(portsFile, JSON.stringify(ports, null, 2));
        console.log(`[PORT_MANAGER] Ports saved to: ${portsFile}`);
        
        // Export as environment variables for child processes
        Object.entries(ports).forEach(([service, port]) => {
          console.log(`export ${service.toUpperCase()}_PORT=${port}`);
        });
        
      } catch (error) {
        console.error('[PORT_MANAGER] Failed to initialize ports:', error);
        process.exit(1);
      }
      break;
      
    case 'status':
      console.log('[PORT_MANAGER] Current port allocations:');
      const ports = getAllocatedPorts();
      console.log(JSON.stringify(ports, null, 2));
      break;
      
    case 'clear':
      console.log('[PORT_MANAGER] Clearing port cache...');
      clearPortCache();
      
      // Also remove the allocated ports file
      const portsFile = path.join(__dirname, '..', '.allocated-ports.json');
      if (fs.existsSync(portsFile)) {
        fs.unlinkSync(portsFile);
        console.log(`[PORT_MANAGER] Removed: ${portsFile}`);
      }
      break;
      
    default:
      console.log('[PORT_MANAGER] Usage:');
      console.log('  node scripts/port-manager.js init    - Initialize all ports');
      console.log('  node scripts/port-manager.js status  - Show current allocations');
      console.log('  node scripts/port-manager.js clear   - Clear port cache');
      process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };

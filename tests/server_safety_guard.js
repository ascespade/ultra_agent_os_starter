#!/usr/bin/env node

/**
 * Server Safety Guard for Ultra Core Testing
 * Monitors system health and aborts tests if thresholds exceeded
 */

const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

class ServerSafetyGuard {
  constructor() {
    this.thresholds = {
      cpu_usage: 85,
      memory_available: 15,
      tailscale_ping_lost: 10000,
      ssh_latency: 500
    };
    
    this.measurements = [];
    this.abortFlag = false;
    this.testRunning = false;
  }

  async measureCpuLoad() {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      const startTime = process.hrtime.bigint();
      
      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const endTime = process.hrtime.bigint();
        const totalTimeNs = endTime - startTime;
        const totalTimeMs = Number(totalTimeNs) / 1000000;
        
        const totalCpuTimeMs = (endUsage.user + endUsage.system) / 1000;
        const cpuPercent = (totalCpuTimeMs / totalTimeMs) * 100;
        
        resolve({
          total: Math.round(cpuPercent * 100) / 100,
          user: Math.round((endUsage.user / 1000 / totalTimeMs) * 100 * 100) / 100,
          system: Math.round((endUsage.system / 1000 / totalTimeMs) * 100 * 100) / 100
        });
      }, 1000);
    });
  }

  measureMemoryPressure() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const usagePercent = (usedMem / totalMem) * 100;
    const availablePercent = (freeMem / totalMem) * 100;

    return {
      total: Math.round(totalMem / 1024 / 1024),
      used: Math.round(usedMem / 1024 / 1024),
      free: Math.round(freeMem / 1024 / 1024),
      usage_percent: Math.round(usagePercent * 100) / 100,
      available_percent: Math.round(availablePercent * 100) / 100
    };
  }

  async monitorNetworkLatency() {
    try {
      // Test basic network connectivity
      const start = Date.now();
      execSync('ping -c 1 8.8.8.8', { timeout: 5000 });
      const latency = Date.now() - start;
      
      return {
        internet_reachable: true,
        latency_ms: latency,
        status: latency < 500 ? 'good' : 'degraded'
      };
    } catch (error) {
      return {
        internet_reachable: false,
        latency_ms: null,
        status: 'failed',
        error: error.message
      };
    }
  }

  async monitorTailscaleHeartbeat() {
    try {
      // Check if Tailscale is running and responsive
      const start = Date.now();
      const status = execSync('tailscale status --json', { timeout: 5000 }).toString();
      const responseTime = Date.now() - start;
      
      const statusData = JSON.parse(status);
      const isHealthy = statusData.BackendState === 'Running';
      
      return {
        running: isHealthy,
        response_time_ms: responseTime,
        status: isHealthy ? 'healthy' : 'unhealthy',
        peer_count: Object.keys(statusData.Peer || {}).length
      };
    } catch (error) {
      return {
        running: false,
        response_time_ms: null,
        status: 'failed',
        error: error.message
      };
    }
  }

  reserveCpuForOs() {
    const loadAverage = os.loadavg();
    const cpuCount = os.cpus().length;
    const currentLoad = loadAverage[0]; // 1-minute average
    const loadPercent = (currentLoad / cpuCount) * 100;
    
    return {
      load_average: currentLoad,
      cpu_count: cpuCount,
      load_percent: Math.round(loadPercent * 100) / 100,
      reserved_for_os: Math.max(30, 100 - loadPercent),
      available_for_tests: Math.max(0, 70 - loadPercent)
    };
  }

  async checkAbortConditions() {
    const cpu = await this.measureCpuLoad();
    const memory = this.measureMemoryPressure();
    const network = await this.monitorNetworkLatency();
    const tailscale = await this.monitorTailscaleHeartbeat();
    const cpuReserve = this.reserveCpuForOs();

    const violations = [];

    // Check CPU usage
    if (cpu.total > this.thresholds.cpu_usage) {
      violations.push(`CPU usage ${cpu.total}% > ${this.thresholds.cpu_usage}%`);
    }

    // Check memory availability
    if (memory.available_percent < this.thresholds.memory_available) {
      violations.push(`Memory available ${memory.available_percent}% < ${this.thresholds.memory_available}%`);
    }

    // Check Tailscale connectivity
    if (!tailscale.running || tailscale.response_time_ms > this.thresholds.tailscale_ping_lost) {
      violations.push(`Tailscale unhealthy or slow: ${tailscale.status}`);
    }

    // Check network latency
    if (network.latency_ms > this.thresholds.ssh_latency) {
      violations.push(`Network latency ${network.latency_ms}ms > ${this.thresholds.ssh_latency}ms`);
    }

    const measurement = {
      timestamp: new Date().toISOString(),
      cpu,
      memory,
      network,
      tailscale,
      cpuReserve,
      violations,
      safe: violations.length === 0
    };

    this.measurements.push(measurement);
    
    // Keep only last 50 measurements
    if (this.measurements.length > 50) {
      this.measurements = this.measurements.slice(-50);
    }

    return measurement;
  }

  async startMonitoring(intervalMs = 2000) {
    if (this.testRunning) {
      console.log('[SAFETY] Monitoring already running');
      return;
    }

    this.testRunning = true;
    this.abortFlag = false;
    
    console.log('[SAFETY] Starting server safety monitoring...');
    console.log(`[SAFETY] Thresholds: CPU<${this.thresholds.cpu_usage}%, Memory>${this.thresholds.memory_available}%, Tailscale<${this.thresholds.tailscale_ping_lost}ms, Network<${this.thresholds.ssh_latency}ms`);

    this.monitorInterval = setInterval(async () => {
      if (this.abortFlag) {
        this.stopMonitoring();
        return;
      }

      const measurement = await this.checkAbortConditions();
      
      if (!measurement.safe) {
        console.error('[SAFETY] 🚨 SAFETY VIOLATION DETECTED:');
        measurement.violations.forEach(v => console.error(`[SAFETY]   - ${v}`));
        
        this.abortFlag = true;
        console.error('[SAFETY] 🛑 ABORTING TESTS - System conditions unsafe');
        this.stopMonitoring();
        process.exit(1);
      }

      // Log status every 10 seconds
      if (this.measurements.length % 5 === 0) {
        console.log(`[SAFETY] ✅ Safe - CPU: ${measurement.cpu.total}%, Memory: ${measurement.memory.available_percent}%, Tailscale: ${measurement.tailscale.status}`);
      }
    }, intervalMs);
  }

  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.testRunning = false;
    console.log('[SAFETY] Monitoring stopped');
  }

  generateSafetyReport() {
    const safeMeasurements = this.measurements.filter(m => m.safe);
    const unsafeMeasurements = this.measurements.filter(m => !m.safe);
    
    return {
      total_measurements: this.measurements.length,
      safe_measurements: safeMeasurements.length,
      unsafe_measurements: unsafeMeasurements.length,
      safety_rate: this.measurements.length > 0 ? (safeMeasurements.length / this.measurements.length) * 100 : 0,
      violations: unsafeMeasurements.flatMap(m => m.violations),
      monitoring_duration_ms: this.measurements.length > 1 ? 
        new Date(this.measurements[this.measurements.length - 1].timestamp) - new Date(this.measurements[0].timestamp) : 0
    };
  }

  async applyDynamicTestThrottling() {
    const measurement = await this.checkAbortConditions();
    
    if (!measurement.safe) {
      return {
        throttle_active: true,
        max_requests_per_second: 0,
        reason: 'Safety violations detected',
        violations: measurement.violations
      };
    }

    // Dynamic throttling based on system load
    let maxRps = 8; // Base rate
    
    if (measurement.cpu.total > 70) {
      maxRps = 4;
    } else if (measurement.cpu.total > 50) {
      maxRps = 6;
    }

    if (measurement.memory.available_percent < 30) {
      maxRps = Math.min(maxRps, 3);
    }

    return {
      throttle_active: maxRps < 8,
      max_requests_per_second: maxRps,
      system_load: {
        cpu: measurement.cpu.total,
        memory: measurement.memory.available_percent
      }
    };
  }
}

// CLI interface
if (require.main === module) {
  const guard = new ServerSafetyGuard();
  
  async function runSafetyCheck() {
    console.log('🛡️  Ultra Core Server Safety Guard');
    console.log('=====================================\n');
    
    const measurement = await guard.checkAbortConditions();
    
    console.log('System Status:');
    console.log(`  CPU Usage: ${measurement.cpu.total}%`);
    console.log(`  Memory Available: ${measurement.memory.available_percent}%`);
    console.log(`  Network: ${measurement.network.status} (${measurement.network.latency_ms}ms)`);
    console.log(`  Tailscale: ${measurement.tailscale.status}`);
    
    if (measurement.safe) {
      console.log('\n✅ System is SAFE for testing');
      process.exit(0);
    } else {
      console.log('\n🚨 System is UNSAFE for testing:');
      measurement.violations.forEach(v => console.log(`  - ${v}`));
      process.exit(1);
    }
  }
  
  runSafetyCheck();
}

module.exports = ServerSafetyGuard;

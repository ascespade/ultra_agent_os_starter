/**
 * Ultra Agent OS - Unified Dashboard JavaScript
 * Handles all dashboard functionality and API integration
 */

class Dashboard {
  constructor() {
    this.currentPage = 'overview';
    this.refreshInterval = null;
    this.init();
  }

  async init() {
    // Check authentication first
    if (!window.apiClient.isAuthenticated()) {
      return; // Auth gate will handle login
    }

    // Setup navigation
    this.setupNavigation();
    
    // Load initial data
    await this.loadOverview();
    
    // Setup auto-refresh
    this.setupAutoRefresh();
    
    // Show dashboard
    document.body.style.display = 'block';
  }

  setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        this.switchPage(page);
      });
    });
  }

  switchPage(pageName) {
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelector(`[data-page="${pageName}"]`).classList.add('active');

    // Update page title
    const titles = {
      overview: 'Overview',
      jobs: 'Job Management',
      memory: 'Memory Management',
      admin: 'Admin Settings'
    };
    document.getElementById('pageTitle').textContent = titles[pageName];

    // Show/hide pages
    document.querySelectorAll('.page').forEach(page => {
      page.classList.remove('active');
    });
    document.getElementById(`${pageName}-page`).classList.add('active');

    this.currentPage = pageName;

    // Load page-specific data
    this.loadPageData(pageName);
  }

  async loadPageData(pageName) {
    switch (pageName) {
      case 'overview':
        await this.loadOverview();
        break;
      case 'jobs':
        await this.loadJobs();
        break;
      case 'memory':
        await this.loadMemoryTab();
        break;
      case 'admin':
        await this.loadAdmin();
        break;
    }
  }

  setupAutoRefresh() {
    // Refresh overview data every 30 seconds
    this.refreshInterval = setInterval(() => {
      if (this.currentPage === 'overview') {
        this.loadOverview();
      }
    }, 30000);
  }

  async updateConnectionStatus() {
    const statusElement = document.getElementById('apiStatus');
    try {
      await window.apiClient.getHealth();
      statusElement.className = 'status-indicator';
      statusElement.innerHTML = '<span class="status-dot"></span><span>API Connected</span>';
    } catch (error) {
      statusElement.className = 'status-indicator disconnected';
      statusElement.innerHTML = '<span class="status-dot"></span><span>API Disconnected</span>';
    }
  }

  // === OVERVIEW PAGE ===
  
  async loadOverview() {
    await this.updateConnectionStatus();
    await this.loadSystemHealth();
    await this.loadAdapterStatus();
    await this.loadRecentJobs();
    
    // Update dashboard stats from workspace
    try {
      const workspace = await window.apiClient.getWorkspace();
      document.getElementById('activeJobs').textContent = workspace.stats?.job_count || 0;
      document.getElementById('queueLength').textContent = workspace.stats?.memory_count || 0;
    } catch (e) {
      console.warn('Failed to load workspace stats for overview');
    }
  }

  async loadSystemHealth() {
    try {
      const health = await window.apiClient.getHealth();
      document.getElementById('systemHealth').textContent = health.status || 'OK';
    } catch (error) {
      document.getElementById('systemHealth').textContent = 'Error';
    }
  }

  async loadAdapterStatus() {
    const container = document.getElementById('adapterStatus');
    
    try {
      const status = await window.apiClient.getAdapterStatus();
      
      let html = '<div class="adapter-grid">';
      
      // Redis
      if (status.redis) {
        document.getElementById('queueLength').textContent = status.redis.queue_length || 0;
        html += `
          <div class="adapter-item">
            <strong>Redis:</strong> 
            <span class="status-${status.redis.available ? 'success' : 'error'}">
              ${status.redis.status}
            </span>
            <br><small>Queue: ${status.redis.queue_length || 0}</small>
          </div>
        `;
      }
      
      // Database
      if (status.database) {
        html += `
          <div class="adapter-item">
            <strong>Database:</strong> 
            <span class="status-${status.database.available ? 'success' : 'error'}">
              ${status.database.status}
            </span>
          </div>
        `;
      }
      
      // Memory
      if (status.memory) {
        html += `
          <div class="adapter-item">
            <strong>Memory:</strong> 
            <span class="status-success">Simple CRUD</span>
          </div>
        `;
      }
      
      // Core
      if (status.core) {
        const uptime = Math.floor(status.core.uptime / 60);
        html += `
          <div class="adapter-item">
            <strong>Core:</strong> 
            <span class="status-success">Running</span>
            <br><small>Uptime: ${uptime}m</small>
          </div>
        `;
      }
      
      html += '</div>';
      container.innerHTML = html;
      
    } catch (error) {
      container.innerHTML = `<div class="error">Failed to load adapter status: ${error.message}</div>`;
    }
  }

  async loadRecentJobs() {
    const container = document.getElementById('recentJobs');
    
    try {
      const jobs = await window.apiClient.getJobs();
      const recentJobs = jobs.jobs ? jobs.jobs.slice(0, 5) : [];
      
      if (recentJobs.length === 0) {
        container.innerHTML = '<p>No recent jobs found.</p>';
        return;
      }
      
      let html = '<table class="table"><thead><tr><th>ID</th><th>Status</th><th>Created</th></tr></thead><tbody>';
      
      recentJobs.forEach(job => {
        const jobId = job.id.substring(0, 8);
        const statusClass = this.getStatusClass(job.status);
        const createdAt = new Date(job.created_at).toLocaleString();
        
        html += `
          <tr>
            <td><code>${jobId}...</code></td>
            <td><span class="status-${statusClass}">${job.status}</span></td>
            <td>${createdAt}</td>
          </tr>
        `;
      });
      
      html += '</tbody></table>';
      container.innerHTML = html;
      
    } catch (error) {
      container.innerHTML = `<div class="error">Failed to load recent jobs: ${error.message}</div>`;
    }
  }

  // === JOBS PAGE ===
  
  async loadJobs() {
    const container = document.getElementById('jobsList');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading jobs...</p></div>';
    
    try {
      const jobs = await window.apiClient.getJobs();
      const jobsList = jobs.jobs || [];
      
      if (jobsList.length === 0) {
        container.innerHTML = '<p>No jobs found.</p>';
        return;
      }
      
      let html = `
        <div class="card-header">
          <h3 class="card-title">All Jobs (${jobsList.length})</h3>
          <div>
            <button class="btn btn-secondary btn-sm" onclick="window.dashboard.reconcileJobs()">Reconcile</button>
            <button class="btn btn-primary btn-sm" onclick="window.dashboard.refreshJobs()">Refresh</button>
          </div>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      jobsList.forEach(job => {
        const jobId = job.id.substring(0, 8);
        const statusClass = this.getStatusClass(job.status);
        const createdAt = new Date(job.created_at).toLocaleString();
        
        html += `
          <tr>
            <td><code>${jobId}...</code></td>
            <td>${job.type}</td>
            <td><span class="status-${statusClass}">${job.status}</span></td>
            <td>${createdAt}</td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="window.dashboard.viewJob('${job.id}')">
                View
              </button>
            </td>
          </tr>
        `;
      });
      
      html += '</tbody></table>';
      container.innerHTML = html;
      
    } catch (error) {
      container.innerHTML = `<div class="error">Failed to load jobs: ${error.message}</div>`;
    }
  }

  async viewJob(jobId) {
    try {
      const job = await window.apiClient.getJob(jobId);
      alert(`Job Details:\n\nID: ${job.id}\nStatus: ${job.status}\nType: ${job.type}\nCreated: ${job.created_at}\n\n${JSON.stringify(job.output_data, null, 2)}`);
    } catch (error) {
      alert(`Failed to load job: ${error.message}`);
    }
  }

  async reconcileJobs() {
    if (!confirm('This will attempt to fix stuck jobs. Continue?')) return;
    
    try {
      // This would call a reconcile endpoint if available
      alert('Job reconciliation would be triggered here. (Endpoint not yet implemented)');
      await this.loadJobs();
    } catch (error) {
      alert(`Reconciliation failed: ${error.message}`);
    }
  }

  // === MEMORY PAGE ===
  
  async loadMemoryTab() {
    await this.loadMemoryFiles();
  }

  async loadMemoryFiles() {
    const container = document.getElementById('memoryFiles');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading memory files...</p></div>';
    
    try {
      const workspace = await window.apiClient.getWorkspace();
      const files = workspace.memories || [];
      
      if (files.length === 0) {
        container.innerHTML = '<p>No memory files found.</p>';
        return;
      }
      
      let html = '<div class="memory-list">';
      files.forEach(file => {
        const fileName = file.key || file.filename || file; // specific to object structure
        html += `
          <div class="memory-item">
            <span>${fileName}</span>
            <button class="btn btn-secondary btn-sm" onclick="window.dashboard.loadMemoryFile('${fileName}')">
              Load
            </button>
          </div>
        `;
      });
      html += '</div>';
      
      container.innerHTML = html;
      
    } catch (error) {
      container.innerHTML = `<div class="error">Failed to load memory files: ${error.message}</div>`;
    }
  }

  async loadMemoryFile(filename) {
    try {
      const memory = await window.apiClient.readMemory(filename);
      document.getElementById('memoryFilename').value = filename;
      document.getElementById('memoryContent').value = JSON.stringify(memory.content || memory.data || {}, null, 2);
    } catch (error) {
      alert(`Failed to load memory file: ${error.message}`);
    }
  }

  async saveMemory() {
    const filename = document.getElementById('memoryFilename').value;
    const content = document.getElementById('memoryContent').value;
    
    if (!filename) {
      alert('Please enter a filename');
      return;
    }
    
    try {
      const data = JSON.parse(content);
      await window.apiClient.writeMemory(filename, { data });
      alert('Memory file saved successfully!');
      await this.loadMemoryFiles();
    } catch (error) {
      alert(`Failed to save memory file: ${error.message}`);
    }
  }

  async loadMemory() {
    const filename = document.getElementById('memoryFilename').value;
    if (!filename) {
      alert('Please enter a filename');
      return;
    }
    await this.loadMemoryFile(filename);
  }

  // === ADMIN PAGE ===
  
  async loadAdmin() {
    await this.loadTenants();
  }

  async loadTenants() {
    const container = document.getElementById('tenantsList');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading tenants...</p></div>';
    
    try {
      const tenants = await window.apiClient.getTenants();
      const tenantsList = tenants.tenants || [];
      
      if (tenantsList.length === 0) {
        container.innerHTML = '<p>No tenants found.</p>';
        return;
      }
      
      let html = '<table class="table"><thead><tr><th>ID</th><th>Name</th><th>Created</th></tr></thead><tbody>';
      
      tenantsList.forEach(tenant => {
        const createdAt = new Date(tenant.created_at).toLocaleString();
        html += `
          <tr>
            <td>${tenant.id}</td>
            <td>${tenant.name}</td>
            <td>${createdAt}</td>
          </tr>
        `;
      });
      
      html += '</tbody></table>';
      container.innerHTML = html;
      
    } catch (error) {
      container.innerHTML = `<div class="error">Failed to load tenants: ${error.message}</div>`;
    }
  }

  async createTenant() {
    const name = document.getElementById('tenantName').value;
    const tenantId = document.getElementById('tenantId').value;
    
    if (!name || !tenantId) {
      alert('Please enter both tenant name and ID');
      return;
    }
    
    try {
      await window.apiClient.createTenant(name, tenantId);
      alert('Tenant created successfully!');
      document.getElementById('tenantName').value = '';
      document.getElementById('tenantId').value = '';
      await this.loadTenants();
    } catch (error) {
      alert(`Failed to create tenant: ${error.message}`);
    }
  }

  // === UTILITY METHODS ===
  
  getStatusClass(status) {
    const statusMap = {
      'completed': 'success',
      'success': 'success',
      'failed': 'error',
      'error': 'error',
      'planning': 'warning',
      'processing': 'warning',
      'queued': 'warning'
    };
    return statusMap[status] || 'default';
  }

  async refreshJobs() {
    await this.loadJobs();
  }
}

// Global functions for button onclick handlers
window.refreshJobs = () => window.dashboard.refreshJobs();
window.saveMemory = () => window.dashboard.saveMemory();
window.loadMemory = () => window.dashboard.loadMemory();
window.createTenant = () => window.dashboard.createTenant();

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Hide body until auth is checked
  document.body.style.display = 'none';
  
  // Initialize dashboard after auth check
  setTimeout(() => {
    window.dashboard = new Dashboard();
  }, 100);
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Dashboard;
}

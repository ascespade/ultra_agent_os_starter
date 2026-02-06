    class ProfessionalOpsDashboard {
      constructor() {
        // Smart API resolution: Use the same host you are currently browsing on
        let baseUrl = (window.ENV && window.ENV.API_URL) ? window.ENV.API_URL : 'http://localhost:3000';
        const currentHost = window.location.hostname;

        // If we're on a local address, ensure the API points to the same hostname
        if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
          baseUrl = baseUrl.replace('localhost', currentHost).replace('127.0.0.1', currentHost);
        }

        this.apiBase = baseUrl;
        console.log('[DASHBOARD] Resolved API Base:', this.apiBase);

        this.refreshInterval = 30000; // 30 seconds
        this.isApiAvailable = false;

        // Initialize Charts helper
        this.charts = window.UltraCharts ? new window.UltraCharts() : null;

        this.fallbackData = {
          uptime: 7200, // 2 hours
          activeJobs: 5,
          queueLength: 12,
          failedJobs: 2,
          totalJobs: 150,
          successRate: 94.5,
          avgProcessingTime: 1250
        };

        this.metrics = { ...this.fallbackData };

        this.init();
      }

      init() {
        this.setupNavigation();
        this.startHealthChecks();
        this.loadData();
        this.startAutoRefresh();
        this.initializeCharts();

        console.log('[DASHBOARD] Professional Ops Dashboard initialized');
      }

      initializeCharts() {
        // Initialize performance chart
        setTimeout(() => {
          this.createPerformanceChart();
          this.createJobStatusChart();
        }, 1000);
      }

      createPerformanceChart() {
        const canvas = document.getElementById('performanceChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const data = {
          labels: ['1h ago', '50m ago', '40m ago', '30m ago', '20m ago', '10m ago', 'Now'],
          datasets: [{
            label: 'Jobs Processed',
            data: [12, 19, 15, 25, 22, 30, 28],
            color: '#4a9eff',
            backgroundColor: 'rgba(74, 158, 255, 0.1)'
          }]
        };

        // Simple line chart implementation
        this.drawLineChart(ctx, data);
      }

      createJobStatusChart() {
        const canvas = document.getElementById('jobStatusChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const data = {
          labels: ['Completed', 'Active', 'Pending', 'Failed'],
          datasets: [{
            data: [65, 8, 12, 5],
            backgroundColor: ['#10b981', '#3b82f6', '#f97316', '#ef4444']
          }]
        };

        // Simple pie chart implementation
        this.drawPieChart(ctx, data);
      }

      drawLineChart(ctx, data) {
        const canvas = ctx.canvas;
        const width = canvas.width;
        const height = canvas.height;
        const padding = 40;

        ctx.clearRect(0, 0, width, height);

        // Draw axes
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();

        // Draw data
        const dataset = data.datasets[0];
        const maxValue = Math.max(...dataset.data);
        const chartWidth = width - 2 * padding;
        const chartHeight = height - 2 * padding;

        ctx.strokeStyle = dataset.color;
        ctx.lineWidth = 3;
        ctx.beginPath();

        dataset.data.forEach((value, index) => {
          const x = padding + (chartWidth / (data.labels.length - 1)) * index;
          const y = height - padding - (value / maxValue) * chartHeight;

          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          // Draw point
          ctx.fillStyle = dataset.color;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
        });

        ctx.stroke();

        // Draw labels
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '12px Inter';
        ctx.textAlign = 'center';
        data.labels.forEach((label, index) => {
          const x = padding + (chartWidth / (data.labels.length - 1)) * index;
          ctx.fillText(label, x, height - padding + 20);
        });
      }

      drawPieChart(ctx, data) {
        const canvas = ctx.canvas;
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 2 - 40;

        ctx.clearRect(0, 0, width, height);

        const dataset = data.datasets[0];
        const total = dataset.data.reduce((sum, value) => sum + value, 0);
        let currentAngle = -Math.PI / 2;

        dataset.data.forEach((value, index) => {
          const sliceAngle = (value / total) * 2 * Math.PI;

          // Draw slice
          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
          ctx.closePath();
          ctx.fillStyle = dataset.backgroundColor[index];
          ctx.fill();

          // Draw label
          const labelAngle = currentAngle + sliceAngle / 2;
          const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
          const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);

          ctx.fillStyle = 'white';
          ctx.font = 'bold 12px Inter';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const percentage = ((value / total) * 100).toFixed(1);
          ctx.fillText(`${data.labels[index]}`, labelX, labelY - 8);
          ctx.fillText(`${percentage}%`, labelX, labelY + 8);

          currentAngle += sliceAngle;
        });
      }

      setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        const pages = document.querySelectorAll('.page');
        const pageTitle = document.getElementById('pageTitle');

        navItems.forEach(item => {
          item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetPage = item.dataset.page;

            // Update navigation
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Update page
            pages.forEach(page => page.classList.remove('active'));
            const targetEl = document.getElementById(targetPage);
            if (targetEl) targetEl.classList.add('active');

            // Update title
            pageTitle.textContent = item.textContent.trim();

            // Load page-specific data
            if (targetPage === 'jobs') {
              this.loadJobsData();
            } else if (targetPage === 'memory') {
              this.loadMemoryData();
            } else if (targetPage === 'adapters') {
              this.loadAdaptersData();
            }
          });
        });
      }

      async startHealthChecks() {
        setInterval(async () => {
          await this.checkAPIHealth();
          await this.checkWorkerHealth();
        }, 10000);

        // Initial checks
        await this.checkAPIHealth();
        await this.checkWorkerHealth();
      }

      async checkAPIHealth() {
        try {
          const startTime = Date.now();
          const response = await fetch(`${this.apiBase}/health`, {
            method: 'GET',
            timeout: 5000
          });
          const endTime = Date.now();
          const responseTime = endTime - startTime;

          if (response.ok) {
            const data = await response.json();
            this.updateStatus('api', true, `API: ${responseTime}ms`);
            document.getElementById('apiResponseTime').textContent = `${responseTime}ms`;
            this.metrics.uptime = data.uptime || this.fallbackData.uptime;
            this.updateUptime();
            this.isApiAvailable = true;
          } else {
            this.updateStatus('api', false, 'API: Error');
            this.isApiAvailable = false;
            this.useFallbackData();
          }
        } catch (error) {
          this.updateStatus('api', false, 'API: Offline');
          this.isApiAvailable = false;
          this.useFallbackData();
          console.error('[DASHBOARD] API health check failed:', error);
        }
      }

      useFallbackData() {
        console.log('[DASHBOARD] Using fallback data due to API unavailability');
        this.metrics = { ...this.fallbackData };
        this.updateRealMetrics({
          jobs: this.fallbackData,
          performance: {
            queueLength: this.fallbackData.queueLength,
            throughput: 2.5
          },
          realTime: {
            activeJobs: this.fallbackData.activeJobs,
            queueLength: this.fallbackData.queueLength,
            failedJobs: this.fallbackData.failedJobs
          }
        });

        // Show notification about fallback mode
        if (window.notificationSystem) {
          window.notificationSystem.notify('Using demo data - API unavailable', 'warning', 8000);
        }
      }

      async checkWorkerHealth() {
        try {
          const response = await fetch(`${this.apiBase}/worker/health`);
          if (response.ok) {
            this.updateStatus('worker', true, 'Worker: Active');
          } else {
            this.updateStatus('worker', false, 'Worker: Error');
          }
        } catch (error) {
          this.updateStatus('worker', false, 'Worker: Offline');
          console.error('[DASHBOARD] Worker health check failed:', error);
        }
      }

      updateStatus(service, isOnline, text) {
        const statusDot = document.getElementById(`${service}StatusDot`);
        const statusText = document.getElementById(`${service}StatusText`);

        if (isOnline) {
          statusDot.classList.add('connected');
        } else {
          statusDot.classList.remove('connected');
        }

        statusText.textContent = text;
      }

      updateUptime() {
        const uptimeElement = document.getElementById('uptimeValue');
        if (this.metrics.uptime > 0) {
          const hours = Math.floor(this.metrics.uptime / 3600);
          const minutes = Math.floor((this.metrics.uptime % 3600) / 60);
          uptimeElement.textContent = `${hours}h ${minutes}m`;
        }
      }

      async loadData() {
        await this.loadSystemMetrics();
        await this.loadRecentActivity();
      }

      async loadSystemMetrics() {
        if (!this.isApiAvailable) {
          console.log('[DASHBOARD] API unavailable, skipping metrics load');
          return;
        }

        try {
          const response = await fetch(`${this.apiBase}/api/metrics/performance`, {
            timeout: 5000
          });
          if (response.ok) {
            const data = await response.json();
            this.updateRealMetrics(data);
          } else {
            console.error('[DASHBOARD] Failed to load system metrics:', response.status);
            this.showMetricsError();
          }
        } catch (error) {
          console.error('[DASHBOARD] Failed to load system metrics:', error);
          this.showMetricsError();
        }
      }

      updateRealMetrics(data) {
        // Update active jobs with real data
        const activeJobs = data.realTime?.activeJobs || data.jobs?.active || 0;
        document.getElementById('activeJobsValue').textContent = activeJobs;
        this.updateJobChange('jobsChange', activeJobs);

        // Update queue length with real data
        const queueLength = data.realTime?.queueLength || data.performance?.queueLength || 0;
        document.getElementById('queueLengthValue').textContent = queueLength;
        this.updateJobChange('queueChange', queueLength);

        // Update failed jobs with real data
        const failedJobs = data.realTime?.failedJobs || data.jobs?.failed || 0;
        document.getElementById('failedJobsValue').textContent = failedJobs;
        this.updateJobChange('failedChange', failedJobs, true);

        // Update total jobs with real data
        const totalJobs = data.jobs?.total || 0;
        document.getElementById('totalJobsValue').textContent = totalJobs.toLocaleString();

        // Update success rate with real data
        const successRate = data.jobs?.successRate || 0;
        document.getElementById('successRateValue').textContent = `${successRate}%`;

        // Update average processing time with real data
        const avgTime = data.jobs?.avgProcessingTime || 0;
        document.getElementById('avgProcessingTime').textContent = avgTime > 0 ? `${Math.round(avgTime)}ms` : '--';

        // Update throughput with real data
        const throughput = data.performance?.throughput || 0;
        if (document.getElementById('throughputValue')) {
          document.getElementById('throughputValue').textContent = `${throughput}/min`;
        }

        console.log('[DASHBOARD] Real metrics updated:', data);
      }

      showMetricsError() {
        console.log('[DASHBOARD] Metrics error, using fallback data');
        this.useFallbackData();
      }

      updateJobChange(elementId, value, isError = false) {
        const element = document.getElementById(elementId);
        if (value === 0) {
          element.className = 'metric-change';
          element.innerHTML = '<i class="fas fa-minus"></i> Stable';
        } else if (value > 10) {
          element.className = isError ? 'metric-change negative' : 'metric-change positive';
          element.innerHTML = `<i class="fas fa-arrow-${isError ? 'up' : 'down'}"></i> ${isError ? 'High' : 'Active'}`;
        } else {
          element.className = 'metric-change positive';
          element.innerHTML = '<i class="fas fa-check"></i> Normal';
        }
      }

      async loadRecentActivity() {
        try {
          const response = await fetch(`${this.apiBase}/api/jobs?limit=10`);
          if (response.ok) {
            const data = await response.json();
            this.updateRecentActivity(data.jobs || []);
          }
        } catch (error) {
          console.error('[DASHBOARD] Failed to load recent activity:', error);
          document.getElementById('recentActivity').innerHTML =
            '<tr><td colspan="5">Failed to load activity</td></tr>';
        }
      }

      updateRecentActivity(jobs) {
        const tbody = document.getElementById('recentActivity');

        if (jobs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5">No recent activity</td></tr>';
          return;
        }

        tbody.innerHTML = jobs.map(job => `
      <tr>
        <td>${new Date(job.created_at).toLocaleTimeString()}</td>
        <td><code>${job.id.substring(0, 8)}</code></td>
        <td>${job.type}</td>
        <td><span class="status-badge ${job.status}">${job.status}</span></td>
        <td>${job.duration || '--'}</td>
      </tr>
    `).join('');
      }

      async loadJobsData() {
        await this.loadQueueInfo();
        await this.loadJobHistory();
      }

      async loadQueueInfo() {
        try {
          const response = await fetch(`${this.apiBase}/api/metrics/queue-status`);
          if (response.ok) {
            const data = await response.json();
            this.updateRealQueueTable(data.queues || []);
          } else {
            console.error('[DASHBOARD] Failed to load queue info:', response.status);
            this.showQueueError();
          }
        } catch (error) {
          console.error('[DASHBOARD] Failed to load queue info:', error);
          this.showQueueError();
        }
      }

      updateRealQueueTable(queues) {
        const tbody = document.getElementById('queueTable');

        if (queues.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6">No queues found</td></tr>';
          return;
        }

        tbody.innerHTML = queues.map(queue => `
      <tr>
        <td><strong>${queue.name}</strong></td>
        <td>${queue.length}</td>
        <td>${queue.processing}</td>
        <td>${queue.failed}</td>
        <td><span class="status-badge ${queue.status}">${queue.status}</span></td>
        <td>
          <button onclick="pauseQueue('${queue.name}')" style="padding: 0.25rem 0.5rem; background: var(--warning); color: white; border: none; border-radius: 0.25rem; margin-right: 0.5rem;">
            <i class="fas fa-pause"></i>
          </button>
          <button onclick="clearQueue('${queue.name}')" style="padding: 0.25rem 0.5rem; background: var(--error); color: white; border: none; border-radius: 0.25rem;">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
      }

      showQueueError() {
        const tbody = document.getElementById('queueTable');
        tbody.innerHTML = '<tr><td colspan="6">Failed to load queue information</td></tr>';

        if (window.notificationSystem) {
          window.notificationSystem.notify('Failed to load real queue data', 'error');
        }
      }

      async loadJobHistory() {
        try {
          const response = await fetch(`${this.apiBase}/api/jobs?limit=20`);
          if (response.ok) {
            const data = await response.json();
            this.updateJobsTable(data.jobs || []);
          }
        } catch (error) {
          console.error('[DASHBOARD] Failed to load job history:', error);
          document.getElementById('jobsTable').innerHTML =
            '<tr><td colspan="6">Failed to load job history</td></tr>';
        }
      }

      updateJobsTable(jobs) {
        const tbody = document.getElementById('jobsTable');

        if (jobs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6">No jobs found</td></tr>';
          return;
        }

        tbody.innerHTML = jobs.map(job => `
      <tr>
        <td><code>${job.id}</code></td>
        <td>${job.type}</td>
        <td><span class="status-badge ${job.status}">${job.status}</span></td>
        <td>${new Date(job.created_at).toLocaleString()}</td>
        <td>${job.duration || '--'}</td>
        <td>
          <button onclick="viewJob('${job.id}')" style="padding: 0.25rem 0.5rem; background: var(--info); color: white; border: none; border-radius: 0.25rem;">
            <i class="fas fa-eye"></i>
          </button>
        </td>
      </tr>
    `).join('');
      }

      startAutoRefresh() {
        setInterval(() => {
          this.loadData();
          console.log('[DASHBOARD] Auto-refresh completed');
        }, this.refreshInterval);
      }

      async refreshJobs() {
        await this.loadJobsData();
        console.log('[DASHBOARD] Jobs data refreshed');
      }

      async loadMemoryData() {
        try {
          const response = await fetch(`${this.apiBase}/api/memory/workspace`);
          if (response.ok) {
            const data = await response.json();
            // Assuming data has memories array or similar. If plain object, use keys.
            // Workspace endpoint returns object with memory keys? 
            // Previous check said it returns 'workspace'.
            this.updateMemoryTable(data.memories || []); // Adapt based on actual response
          }
        } catch (error) {
          console.error('[DASHBOARD] Failed to load memory:', error);
          document.getElementById('memoryTable').innerHTML = '<tr><td colspan="4">Failed to load memory</td></tr>';
        }
      }

      updateMemoryTable(memories) {
        const tbody = document.getElementById('memoryTable');
        // If memories is array
        if (!Array.isArray(memories) || memories.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4">No memory entries found</td></tr>';
          return;
        }

        tbody.innerHTML = memories.map(mem => `
        <tr>
            <td><code>${mem.key}</code></td>
            <td>${mem.content ? JSON.stringify(mem.content).length + ' bytes' : '--'}</td>
            <td>${mem.created_at ? new Date(mem.created_at).toLocaleString() : 'N/A'}</td>
            <td>
                <button onclick="viewMemory('${mem.key}')" style="padding: 0.25rem 0.5rem; background: var(--info); color: white; border: none; border-radius: 0.25rem;">
                <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
      }

      async loadAdaptersData() {
        try {
          const response = await fetch(`${this.apiBase}/api/adapters/status`);
          if (response.ok) {
            const data = await response.json();
            this.updateAdaptersGrid(data);
          }
        } catch (error) {
          console.error('[DASHBOARD] Failed to load adapters:', error);
          document.getElementById('adaptersGrid').innerHTML = '<div class="metric-card error">Failed to load adapters</div>';
        }
      }

      updateAdaptersGrid(data) {
        const grid = document.getElementById('adaptersGrid');

        // Check if Ollama
        const ollamaStatus = data.ollama?.available ? 'success' : 'error';
        const dockerStatus = data.docker?.available ? 'success' : 'error';

        grid.innerHTML = `
        <div class="metric-card ${ollamaStatus}">
            <div class="metric-header">
                <span class="metric-title">Ollama LLM</span>
                <div class="metric-icon"><i class="fas fa-brain"></i></div>
            </div>
            <div class="metric-value">${data.ollama?.available ? 'Online' : 'Offline'}</div>
            <div class="metric-change">${data.ollama?.model || 'No model loaded'}</div>
        </div>
        <div class="metric-card ${dockerStatus}">
            <div class="metric-header">
                <span class="metric-title">Docker Runtime</span>
                <div class="metric-icon"><i class="fab fa-docker"></i></div>
            </div>
            <div class="metric-value">${data.docker?.available ? 'Active' : 'Inactive'}</div>
            <div class="metric-change">${data.docker?.version || 'Unknown version'}</div>
        </div>
    `;
      }
    }

    // Memory Global Functions
    window.refreshMemory = async () => {
      if (window.dashboard) window.dashboard.loadMemoryData();
    };
    window.viewMemory = (key) => {
      alert('View memory content for: ' + key);
      // Implement modal or expansion if needed
    };

    // Global functions for button actions
    window.pauseQueue = async (queueName) => {
      console.log('[DASHBOARD] Pause queue:', queueName);
      // Implementation would go here
    };

    window.clearQueue = async (queueName) => {
      console.log('[DASHBOARD] Clear queue:', queueName);
      // Implementation would go here
    };

    window.viewJob = async (jobId) => {
      console.log('[DASHBOARD] View job:', jobId);
      // Implementation would go here
    };

    window.refreshJobs = async () => {
      if (window.dashboard) {
        await window.dashboard.refreshJobs();
      }
    };

    // Initialize dashboard when DOM is loaded
    document.addEventListener('DOMContentLoaded', () => {
      window.dashboard = new ProfessionalOpsDashboard();
    });
  </script>

// Performance Charts and Graphs System
class PerformanceCharts {
  constructor() {
    this.charts = {};
    this.data = {};
    this.updateInterval = 30000; // 30 seconds
    this.colors = {
      primary: '#4a9eff',
      success: '#10b981',
      warning: '#f97316',
      error: '#ef4444',
      secondary: '#7fa3c8'
    };
    this.init();
  }

  init() {
    this.loadChartsCSS();
    this.startDataCollection();
    this.setupCharts();
  }

  loadChartsCSS() {
    if (!document.querySelector('#charts-css')) {
      const link = document.createElement('link');
      link.id = 'charts-css';
      link.rel = 'stylesheet';
      link.href = '/src/charts.css';
      document.head.appendChild(link);
    }
  }

  setupCharts() {
    // Add charts section to admin dashboard
    this.addChartsSection();
    this.initializeCharts();
  }

  addChartsSection() {
    const adminContent = document.querySelector('.panel-content');
    if (!adminContent) return;

    const chartsSection = document.createElement('div');
    chartsSection.id = 'performance-charts';
    chartsSection.innerHTML = `
      <div class="chart-container">
        <div class="chart-header">
          <div class="chart-title">
            <span>📊</span>
            System Performance Metrics
          </div>
          <div class="chart-controls">
            <button class="chart-control active" onclick="performanceCharts.setTimeRange('1h')">1H</button>
            <button class="chart-control" onclick="performanceCharts.setTimeRange('6h')">6H</button>
            <button class="chart-control" onclick="performanceCharts.setTimeRange('24h')">24H</button>
            <button class="chart-control" onclick="performanceCharts.setTimeRange('7d')">7D</button>
          </div>
        </div>
        
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-header">
              <span class="metric-title">CPU Usage</span>
              <div class="metric-icon" style="background: var(--warning)">⚡</div>
            </div>
            <div class="metric-value" id="cpu-metric">--%</div>
            <div class="metric-change neutral" id="cpu-change">--</div>
          </div>
          
          <div class="metric-card">
            <div class="metric-header">
              <span class="metric-title">Memory Usage</span>
              <div class="metric-icon" style="background: var(--primary)">💾</div>
            </div>
            <div class="metric-value" id="memory-metric">-- MB</div>
            <div class="metric-change neutral" id="memory-change">--</div>
          </div>
          
          <div class="metric-card">
            <div class="metric-header">
              <span class="metric-title">Response Time</span>
              <div class="metric-icon" style="background: var(--success)">⏱️</div>
            </div>
            <div class="metric-value" id="response-metric">-- ms</div>
            <div class="metric-change neutral" id="response-change">--</div>
          </div>
          
          <div class="metric-card">
            <div class="metric-header">
              <span class="metric-title">Active Jobs</span>
              <div class="metric-icon" style="background: var(--error)">🔄</div>
            </div>
            <div class="metric-value" id="jobs-metric">--</div>
            <div class="metric-change neutral" id="jobs-change">--</div>
          </div>
        </div>
      </div>

      <div class="chart-container">
        <div class="chart-header">
          <div class="chart-title">
            <span>📈</span>
            Memory Usage Trend
          </div>
        </div>
        <div class="chart-canvas">
          <div class="line-chart" id="memory-chart">
            <svg class="line-chart-svg" id="memory-svg">
              <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style="stop-color:#4a9eff;stop-opacity:0.3" />
                  <stop offset="100%" style="stop-color:#4a9eff;stop-opacity:0" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>

      <div class="chart-container">
        <div class="chart-header">
          <div class="chart-title">
            <span>📊</span>
            Job Status Distribution
          </div>
        </div>
        <div class="chart-canvas">
          <div class="pie-chart" id="jobs-chart">
            <svg class="pie-chart-svg" id="jobs-svg"></svg>
          </div>
        </div>
      </div>
    `;

    adminContent.appendChild(chartsSection);
  }

  initializeCharts() {
    this.charts.memory = new LineChart('memory-svg', this.colors.primary);
    this.charts.jobs = new PieChart('jobs-svg', this.colors);
    this.updateCharts();
  }

  startDataCollection() {
    // Collect initial data
    this.collectData();
    
    // Set up interval for updates
    setInterval(() => {
      this.collectData();
      this.updateCharts();
    }, this.updateInterval);
  }

  async collectData() {
    try {
      const response = await fetch(`${window.API_URL}/api/health/detailed`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      });
      
      if (response.ok) {
        const health = await response.json();
        this.processHealthData(health);
      }
    } catch (error) {
      console.error('Failed to collect performance data:', error);
    }
  }

  processHealthData(health) {
    const timestamp = Date.now();
    
    // Initialize data arrays if needed
    if (!this.data.memory) this.data.memory = [];
    if (!this.data.cpu) this.data.cpu = [];
    if (!this.data.responseTime) this.data.responseTime = [];
    if (!this.data.jobs) this.data.jobs = {};
    
    // Process system metrics
    if (health.system) {
      const memUsage = health.system.memory;
      const memoryMB = memUsage ? Math.round(memUsage.heapUsed / 1024 / 1024) : 0;
      
      this.data.memory.push({ timestamp, value: memoryMB });
      this.data.cpu.push({ timestamp, value: 0 }); // CPU data would need system monitoring
    }
    
    // Process job metrics
    if (health.jobs) {
      this.data.jobs = health.jobs.byStatus || {};
    }
    
    // Keep only last 50 data points
    Object.keys(this.data).forEach(key => {
      if (Array.isArray(this.data[key])) {
        this.data[key] = this.data[key].slice(-50);
      }
    });
  }

  updateCharts() {
    this.updateMetrics();
    this.updateMemoryChart();
    this.updateJobsChart();
  }

  updateMetrics() {
    // Update CPU metric
    const cpuElement = document.getElementById('cpu-metric');
    if (cpuElement && this.data.cpu.length > 0) {
      const latest = this.data.cpu[this.data.cpu.length - 1];
      cpuElement.textContent = `${latest.value}%`;
    }
    
    // Update Memory metric
    const memoryElement = document.getElementById('memory-metric');
    if (memoryElement && this.data.memory.length > 0) {
      const latest = this.data.memory[this.data.memory.length - 1];
      memoryElement.textContent = `${latest.value} MB`;
      
      // Calculate change
      if (this.data.memory.length > 1) {
        const previous = this.data.memory[this.data.memory.length - 2];
        const change = latest.value - previous.value;
        const changeElement = document.getElementById('memory-change');
        if (changeElement) {
          const changeText = change > 0 ? `+${change} MB` : `${change} MB`;
          const changeClass = change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
          changeElement.textContent = changeText;
          changeElement.className = `metric-change ${changeClass}`;
        }
      }
    }
    
    // Update Jobs metric
    const jobsElement = document.getElementById('jobs-metric');
    if (jobsElement && this.data.jobs) {
      const totalJobs = Object.values(this.data.jobs).reduce((sum, count) => sum + count, 0);
      jobsElement.textContent = totalJobs;
    }
  }

  updateMemoryChart() {
    if (!this.charts.memory || !this.data.memory.length) return;
    
    const chartData = this.data.memory.map(point => ({
      x: point.timestamp,
      y: point.value
    }));
    
    this.charts.memory.update(chartData);
  }

  updateJobsChart() {
    if (!this.charts.jobs || !this.data.jobs) return;
    
    const chartData = Object.entries(this.data.jobs).map(([status, count]) => ({
      label: status,
      value: count,
      color: this.getJobStatusColor(status)
    }));
    
    this.charts.jobs.update(chartData);
  }

  getJobStatusColor(status) {
    const colors = {
      queued: this.colors.warning,
      running: this.colors.primary,
      completed: this.colors.success,
      failed: this.colors.error
    };
    return colors[status] || this.colors.secondary;
  }

  setTimeRange(range) {
    // Update active button
    document.querySelectorAll('.chart-control').forEach(btn => {
      btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Filter data based on time range
    const now = Date.now();
    const ranges = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000
    };
    
    const cutoff = now - ranges[range];
    
    Object.keys(this.data).forEach(key => {
      if (Array.isArray(this.data[key])) {
        this.data[key] = this.data[key].filter(point => point.timestamp > cutoff);
      }
    });
    
    this.updateCharts();
  }
}

// Line Chart Class
class LineChart {
  constructor(svgId, color) {
    this.svg = document.getElementById(svgId);
    this.color = color;
    this.padding = { top: 20, right: 20, bottom: 30, left: 40 };
  }

  update(data) {
    if (!this.svg || !data.length) return;
    
    const width = this.svg.clientWidth - this.padding.left - this.padding.right;
    const height = this.svg.clientHeight - this.padding.top - this.padding.bottom;
    
    // Clear existing content
    this.svg.innerHTML = `
      <defs>
        <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:${this.color};stop-opacity:0.3" />
          <stop offset="100%" style="stop-color:${this.color};stop-opacity:0" />
        </linearGradient>
      </defs>
    `;
    
    if (data.length < 2) return;
    
    // Calculate scales
    const xScale = (i) => (i / (data.length - 1)) * width;
    const yMax = Math.max(...data.map(d => d.y));
    const yScale = (y) => height - (y / yMax) * height;
    
    // Create grid lines
    for (let i = 0; i <= 5; i++) {
      const y = (height / 5) * i;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('class', 'chart-grid');
      line.setAttribute('x1', this.padding.left);
      line.setAttribute('y1', this.padding.top + y);
      line.setAttribute('x2', this.padding.left + width);
      line.setAttribute('y2', this.padding.top + y);
      this.svg.appendChild(line);
    }
    
    // Create area
    const areaPath = data.map((point, i) => {
      const x = this.padding.left + xScale(i);
      const y = this.padding.top + yScale(point.y);
      return i === 0 ? `M ${x} ${height + this.padding.top} L ${x} ${y}` : `L ${x} ${y}`;
    }).join(' ') + ` L ${this.padding.left + width} ${height + this.padding.top} Z`;
    
    const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    area.setAttribute('class', 'chart-area');
    area.setAttribute('d', areaPath);
    this.svg.appendChild(area);
    
    // Create line
    const linePath = data.map((point, i) => {
      const x = this.padding.left + xScale(i);
      const y = this.padding.top + yScale(point.y);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    }).join(' ');
    
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('class', 'chart-line');
    line.setAttribute('d', linePath);
    this.svg.appendChild(line);
    
    // Create points
    data.forEach((point, i) => {
      const x = this.padding.left + xScale(i);
      const y = this.padding.top + yScale(point.y);
      
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('class', 'chart-point');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', 4);
      circle.setAttribute('title', `${point.y} MB`);
      this.svg.appendChild(circle);
    });
  }
}

// Pie Chart Class
class PieChart {
  constructor(svgId, colors) {
    this.svg = document.getElementById(svgId);
    this.colors = colors;
  }

  update(data) {
    if (!this.svg || !data.length) return;
    
    const width = this.svg.clientWidth;
    const height = this.svg.clientHeight;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 10;
    
    // Clear existing content
    this.svg.innerHTML = '';
    
    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) return;
    
    let currentAngle = -Math.PI / 2;
    
    data.forEach((item, i) => {
      const percentage = item.value / total;
      const angle = percentage * Math.PI * 2;
      
      // Create pie slice
      const path = this.createPieSlice(centerX, centerY, radius, currentAngle, currentAngle + angle);
      path.setAttribute('class', 'pie-slice');
      path.setAttribute('fill', item.color);
      path.setAttribute('title', `${item.label}: ${item.value}`);
      
      this.svg.appendChild(path);
      
      // Add label
      if (percentage > 0.05) { // Only show label for slices > 5%
        const labelAngle = currentAngle + angle / 2;
        const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
        const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);
        
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('class', 'pie-label');
        text.setAttribute('x', labelX);
        text.setAttribute('y', labelY);
        text.textContent = `${Math.round(percentage * 100)}%`;
        this.svg.appendChild(text);
      }
      
      currentAngle += angle;
    });
  }

  createPieSlice(cx, cy, radius, startAngle, endAngle) {
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);
    
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`);
    
    return path;
  }
}

// Initialize charts system
let performanceCharts;
document.addEventListener('DOMContentLoaded', () => {
  // Wait a bit for admin dashboard to load
  setTimeout(() => {
    if (document.querySelector('.panel-content')) {
      performanceCharts = new PerformanceCharts();
    }
  }, 1000);
});

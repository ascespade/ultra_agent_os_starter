// Real-time Notifications and Alerts System for Ultra Agent OS Dashboard
class NotificationSystem {
  constructor() {
    this.notifications = [];
    this.alerts = [];
    this.maxNotifications = 50;
    this.alertThresholds = {
      errorRate: 10, // percentage
      queueLength: 100,
      responseTime: 5000, // milliseconds
      memoryUsage: 90, // percentage
      cpuUsage: 80 // percentage
    };
    
    this.notificationTypes = {
      SUCCESS: 'success',
      WARNING: 'warning',
      ERROR: 'error',
      INFO: 'info'
    };
    
    this.init();
  }

  init() {
    this.createNotificationContainer();
    this.startMonitoring();
    this.setupEventListeners();
    
    console.log('[NOTIFICATIONS] Real-time notification system initialized');
  }

  createNotificationContainer() {
    // Create notification container
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      max-width: 400px;
      pointer-events: none;
    `;
    document.body.appendChild(container);

    // Create alerts panel
    const alertsPanel = document.createElement('div');
    alertsPanel.id = 'alerts-panel';
    alertsPanel.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      width: 350px;
      max-height: 400px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1rem;
      overflow-y: auto;
      display: none;
      z-index: 9998;
    `;
    document.body.appendChild(alertsPanel);
  }

  startMonitoring() {
    // Monitor system metrics every 30 seconds
    setInterval(() => {
      this.checkSystemHealth();
      this.checkPerformanceMetrics();
      this.checkQueueStatus();
    }, 30000);

    // Initial check
    setTimeout(() => {
      this.checkSystemHealth();
      this.checkPerformanceMetrics();
      this.checkQueueStatus();
    }, 5000);
  }

  setupEventListeners() {
    // Listen for custom events
    document.addEventListener('systemAlert', (event) => {
      this.handleSystemAlert(event.detail);
    });

    document.addEventListener('jobStatusChange', (event) => {
      this.handleJobStatusChange(event.detail);
    });

    // Keyboard shortcut to toggle alerts panel
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey && event.shiftKey && event.key === 'A') {
        this.toggleAlertsPanel();
      }
    });
  }

  async checkSystemHealth() {
    try {
      const response = await fetch(`${window.dashboard.apiBase}/api/metrics/health-detailed`);
      if (response.ok) {
        const health = await response.json();
        this.analyzeHealthData(health);
      }
    } catch (error) {
      console.error('[NOTIFICATIONS] Failed to check system health:', error);
      this.addNotification('Failed to check system health', this.notificationTypes.ERROR);
    }
  }

  analyzeHealthData(health) {
    // Check API response time
    if (health.services.api.responseTime > this.alertThresholds.responseTime) {
      this.createAlert('API Performance', `API response time is ${health.services.api.responseTime}ms`, this.notificationTypes.WARNING);
    }

    // Check database status
    if (health.services.database.status !== 'healthy') {
      this.createAlert('Database Issue', 'Database connection is unhealthy', this.notificationTypes.ERROR);
    }

    // Check Redis status
    if (health.services.redis.status !== 'healthy') {
      this.createAlert('Redis Issue', 'Redis connection is unhealthy', this.notificationTypes.ERROR);
    }

    // Check worker status
    if (health.services.worker.status !== 'healthy') {
      this.createAlert('Worker Issue', 'Worker service is unhealthy', this.notificationTypes.ERROR);
    }
  }

  async checkPerformanceMetrics() {
    try {
      const response = await fetch(`${window.dashboard.apiBase}/api/metrics/performance`);
      if (response.ok) {
        const metrics = await response.json();
        this.analyzePerformanceData(metrics);
      }
    } catch (error) {
      console.error('[NOTIFICATIONS] Failed to check performance metrics:', error);
    }
  }

  analyzePerformanceData(metrics) {
    // Check error rate
    if (metrics.performance.errorRate > this.alertThresholds.errorRate) {
      this.createAlert('High Error Rate', `Error rate is ${metrics.performance.errorRate}%`, this.notificationTypes.ERROR);
    }

    // Check success rate - Only if we have significant traffic
    const totalJobs = metrics.jobs.total || 0;
    if (totalJobs > 10 && metrics.jobs.successRate < 90) {
      this.createAlert('Low Success Rate', `Job success rate is ${metrics.jobs.successRate}%`, this.notificationTypes.WARNING);
    }

    // Check average processing time
    if (metrics.performance.avgProcessingTime > 10000) {
      this.createAlert('Slow Processing', `Average processing time is ${metrics.performance.avgProcessingTime}ms`, this.notificationTypes.WARNING);
    }
  }

  async checkQueueStatus() {
    try {
      const response = await fetch(`${window.dashboard.apiBase}/api/queue/status`);
      if (response.ok) {
        const queueData = await response.json();
        this.analyzeQueueData(queueData);
      }
    } catch (error) {
      console.error('[NOTIFICATIONS] Failed to check queue status:', error);
    }
  }

  analyzeQueueData(queueData) {
    // Check queue length
    if (queueData.length > this.alertThresholds.queueLength) {
      this.createAlert('Queue Backlog', `Queue length is ${queueData.length}`, this.notificationTypes.WARNING);
    }

    // Check failed jobs
    if (queueData.failed > 10) {
      this.createAlert('Failed Jobs', `${queueData.failed} jobs have failed`, this.notificationTypes.ERROR);
    }
  }

  createAlert(title, message, type = this.notificationTypes.INFO) {
    // Check for duplicate alerts within the last minute
    const duplicate = this.alerts.find(a => 
      a.title === title && 
      a.message === message && 
      (new Date() - new Date(a.timestamp)) < 60000
    );

    if (duplicate) {
      return;
    }

    const alert = {
      id: Date.now(),
      title,
      message,
      type,
      timestamp: new Date().toISOString(),
      acknowledged: false
    };

    this.alerts.unshift(alert);
    
    // Keep only recent alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(0, 100);
    }

    // Show notification
    this.addNotification(`${title}: ${message}`, type);
    
    // Update alerts panel
    this.updateAlertsPanel();
    
    console.log('[NOTIFICATIONS] Alert created:', alert);
  }

  addNotification(message, type = this.notificationTypes.INFO, duration = 5000) {
    const notification = {
      id: Date.now() + Math.random(),
      message,
      type,
      timestamp: new Date(),
      duration
    };

    this.notifications.unshift(notification);
    
    // Keep only recent notifications
    if (this.notifications.length > this.maxNotifications) {
      this.notifications = this.notifications.slice(0, this.maxNotifications);
    }

    // Show notification
    this.showNotification(notification);
    
    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        this.removeNotification(notification.id);
      }, duration);
    }
  }

  showNotification(notification) {
    const container = document.getElementById('notification-container');
    const notificationEl = document.createElement('div');
    notificationEl.id = `notification-${notification.id}`;
    notificationEl.className = `notification notification-${notification.type}`;
    notificationEl.style.cssText = `
      background: ${this.getNotificationColor(notification.type)};
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      margin-bottom: 0.5rem;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      transform: translateX(100%);
      transition: transform 0.3s ease;
      pointer-events: auto;
      cursor: pointer;
      position: relative;
      overflow: hidden;
    `;

    // Add content
    notificationEl.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <i class="fas ${this.getNotificationIcon(notification.type)}"></i>
        <div style="flex: 1;">
          <div style="font-weight: 500; margin-bottom: 0.25rem;">${notification.message}</div>
          <div style="font-size: 0.75rem; opacity: 0.8;">${this.formatTime(notification.timestamp)}</div>
        </div>
        <button onclick="window.notificationSystem.removeNotification(${notification.id})" style="background: none; border: none; color: white; cursor: pointer; padding: 0.25rem;">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;

    container.appendChild(notificationEl);

    // Animate in
    setTimeout(() => {
      notificationEl.style.transform = 'translateX(0)';
    }, 10);

    // Add click handler
    notificationEl.addEventListener('click', () => {
      this.toggleAlertsPanel();
    });
  }

  removeNotification(id) {
    const notificationEl = document.getElementById(`notification-${id}`);
    if (notificationEl) {
      notificationEl.style.transform = 'translateX(100%)';
      setTimeout(() => {
        notificationEl.remove();
      }, 300);
    }
    
    this.notifications = this.notifications.filter(n => n.id !== id);
  }

  updateAlertsPanel() {
    const panel = document.getElementById('alerts-panel');
    
    if (this.alerts.length === 0) {
      panel.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">No active alerts</div>';
      return;
    }

    const alertsHtml = this.alerts.map(alert => `
      <div class="alert-item" style="
        background: var(--bg-tertiary);
        border-left: 4px solid ${this.getAlertColor(alert.type)};
        padding: 1rem;
        margin-bottom: 0.5rem;
        border-radius: 4px;
        cursor: pointer;
        ${alert.acknowledged ? 'opacity: 0.6;' : ''}
      " onclick="window.notificationSystem.acknowledgeAlert(${alert.id})">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
          <h4 style="margin: 0; color: var(--text-primary); font-size: 0.875rem; font-weight: 600;">${alert.title}</h4>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${this.formatTime(alert.timestamp)}</span>
        </div>
        <p style="margin: 0; color: var(--text-secondary); font-size: 0.8rem;">${alert.message}</p>
        <div style="margin-top: 0.5rem;">
          <span class="status-badge ${alert.type}" style="font-size: 0.7rem;">${alert.type.toUpperCase()}</span>
          ${alert.acknowledged ? '<span class="status-badge info" style="font-size: 0.7rem; margin-left: 0.5rem;">ACKNOWLEDGED</span>' : ''}
        </div>
      </div>
    `).join('');

    panel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h3 style="margin: 0; color: var(--text-primary); font-size: 1rem; font-weight: 600;">
          <i class="fas fa-bell"></i> Active Alerts (${this.alerts.length})
        </h3>
        <button onclick="window.notificationSystem.clearAllAlerts()" style="background: var(--error); color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; cursor: pointer;">
          Clear All
        </button>
      </div>
      ${alertsHtml}
    `;
  }

  toggleAlertsPanel() {
    const panel = document.getElementById('alerts-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }

  acknowledgeAlert(id) {
    const alert = this.alerts.find(a => a.id === id);
    if (alert) {
      alert.acknowledged = true;
      this.updateAlertsPanel();
      this.addNotification(`Alert acknowledged: ${alert.title}`, this.notificationTypes.INFO, 3000);
    }
  }

  clearAllAlerts() {
    this.alerts = [];
    this.updateAlertsPanel();
    this.addNotification('All alerts cleared', this.notificationTypes.SUCCESS, 3000);
  }

  handleSystemAlert(alertData) {
    this.createAlert(alertData.title, alertData.message, alertData.type || this.notificationTypes.WARNING);
  }

  handleJobStatusChange(jobData) {
    if (jobData.status === 'failed') {
      this.createAlert('Job Failed', `Job ${jobData.id} failed: ${jobData.error}`, this.notificationTypes.ERROR);
    } else if (jobData.status === 'completed' && jobData.duration > 30000) {
      this.createAlert('Slow Job', `Job ${jobData.id} took ${jobData.duration}ms to complete`, this.notificationTypes.WARNING);
    }
  }

  getNotificationColor(type) {
    const colors = {
      [this.notificationTypes.SUCCESS]: '#10b981',
      [this.notificationTypes.WARNING]: '#f97316',
      [this.notificationTypes.ERROR]: '#ef4444',
      [this.notificationTypes.INFO]: '#3b82f6'
    };
    return colors[type] || colors[this.notificationTypes.INFO];
  }

  getAlertColor(type) {
    return this.getNotificationColor(type);
  }

  getNotificationIcon(type) {
    const icons = {
      [this.notificationTypes.SUCCESS]: 'fa-check-circle',
      [this.notificationTypes.WARNING]: 'fa-exclamation-triangle',
      [this.notificationTypes.ERROR]: 'fa-times-circle',
      [this.notificationTypes.INFO]: 'fa-info-circle'
    };
    return icons[type] || icons[this.notificationTypes.INFO];
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) {
      return 'Just now';
    } else if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}m ago`;
    } else if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  // Public methods for external use
  notify(message, type = this.notificationTypes.INFO, duration = 5000) {
    this.addNotification(message, type, duration);
  }

  alert(title, message, type = this.notificationTypes.WARNING) {
    this.createAlert(title, message, type);
  }

  getAlerts() {
    return this.alerts;
  }

  getNotifications() {
    return this.notifications;
  }
}

// Custom notification styles
const notificationStyles = `
  .notification {
    animation: slideIn 0.3s ease;
  }
  
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  .notification-success {
    background: linear-gradient(135deg, #10b981, #059669);
  }
  
  .notification-warning {
    background: linear-gradient(135deg, #f97316, #ea580c);
  }
  
  .notification-error {
    background: linear-gradient(135deg, #ef4444, #dc2626);
  }
  
  .notification-info {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
  }
  
  .alert-item:hover {
    background: var(--bg-primary) !important;
    transform: translateX(-2px);
    transition: all 0.2s ease;
  }
`;

// Add styles to page
const styleSheet = document.createElement('style');
styleSheet.textContent = notificationStyles;
document.head.appendChild(styleSheet);

// Initialize notification system when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.notificationSystem = new NotificationSystem();
});

// Export for use in dashboard
window.NotificationSystem = NotificationSystem;

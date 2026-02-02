// Notifications System - Real-time Alerts
class NotificationSystem {
  constructor() {
    this.container = null;
    this.notifications = [];
    this.maxNotifications = 5;
    this.defaultDuration = 5000;
    this.unreadCount = 0;
    this.init();
  }

  init() {
    // Create notifications container
    this.container = document.createElement('div');
    this.container.id = 'notifications-container';
    document.body.appendChild(this.container);
    
    // Add notification badge to header if exists
    this.addNotificationBadge();
    
    // Load notifications from localStorage
    this.loadStoredNotifications();
  }

  addNotificationBadge() {
    const header = document.querySelector('.header-actions, .settings-actions');
    if (header) {
      const badge = document.createElement('div');
      badge.className = 'notification-badge';
      badge.innerHTML = '🔔';
      badge.onclick = () => this.showNotificationCenter();
      header.appendChild(badge);
    }
  }

  show(message, type = 'info', title = null, duration = null) {
    const notification = {
      id: Date.now() + Math.random(),
      message,
      type,
      title: title || this.getDefaultTitle(type),
      timestamp: new Date(),
      duration: duration || this.defaultDuration
    };

    this.notifications.unshift(notification);
    this.render(notification);
    this.updateBadge();
    
    // Auto-hide after duration
    setTimeout(() => {
      this.hide(notification.id);
    }, notification.duration);

    // Store notification
    this.storeNotification(notification);
    
    return notification.id;
  }

  success(message, title = null, duration = null) {
    return this.show(message, 'success', title, duration);
  }

  warning(message, title = null, duration = null) {
    return this.show(message, 'warning', title, duration);
  }

  error(message, title = null, duration = null) {
    return this.show(message, 'error', title, duration || 8000); // Errors stay longer
  }

  info(message, title = null, duration = null) {
    return this.show(message, 'info', title, duration);
  }

  getDefaultTitle(type) {
    const titles = {
      success: '✅ Success',
      warning: '⚠️ Warning',
      error: '❌ Error',
      info: 'ℹ️ Info'
    };
    return titles[type] || 'Notification';
  }

  render(notification) {
    const element = document.createElement('div');
    element.className = `notification ${notification.type}`;
    element.id = `notification-${notification.id}`;
    
    const icon = this.getIcon(notification.type);
    const timeAgo = this.formatTime(notification.timestamp);
    
    element.innerHTML = `
      <div class="notification-header">
        <div class="notification-title">
          <div class="notification-icon">${icon}</div>
          ${notification.title}
        </div>
        <button class="notification-close" onclick="notifications.hide(${notification.id})">×</button>
      </div>
      <div class="notification-message">${notification.message}</div>
      <div class="notification-timestamp">${timeAgo}</div>
    `;

    // Add to container
    this.container.appendChild(element);
    
    // Limit visible notifications
    const visibleNotifications = this.container.children.length;
    if (visibleNotifications > this.maxNotifications) {
      this.container.removeChild(this.container.lastChild);
    }

    // Trigger animation
    setTimeout(() => {
      element.classList.add('show');
    }, 10);
  }

  getIcon(type) {
    const icons = {
      success: '✓',
      warning: '!',
      error: '✕',
      info: 'i'
    };
    return icons[type] || 'i';
  }

  hide(id) {
    const element = document.getElementById(`notification-${id}`);
    if (element) {
      element.classList.add('hide');
      setTimeout(() => {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      }, 300);
    }
    
    // Remove from array
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.updateBadge();
  }

  updateBadge() {
    const badge = document.querySelector('.notification-badge');
    if (badge) {
      const unreadCount = this.notifications.filter(n => 
        !n.read && Date.now() - n.timestamp.getTime() < 60000 // Last minute
      ).length;
      
      if (unreadCount > 0) {
        badge.setAttribute('data-count', unreadCount > 99 ? '99+' : unreadCount);
        badge.classList.add('has-notifications');
      } else {
        badge.classList.remove('has-notifications');
      }
    }
  }

  formatTime(timestamp) {
    const now = new Date();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return timestamp.toLocaleDateString();
  }

  storeNotification(notification) {
    try {
      const stored = JSON.parse(localStorage.getItem('notifications') || '[]');
      stored.unshift(notification);
      // Keep only last 50 notifications
      const limited = stored.slice(0, 50);
      localStorage.setItem('notifications', JSON.stringify(limited));
    } catch (error) {
      console.error('Failed to store notification:', error);
    }
  }

  loadStoredNotifications() {
    try {
      const stored = JSON.parse(localStorage.getItem('notifications') || '[]');
      // Show recent notifications (last 5 minutes)
      const recent = stored.filter(n => 
        Date.now() - new Date(n.timestamp).getTime() < 300000
      );
      recent.forEach(notification => {
        if (!notification.read) {
          this.render(notification);
        }
      });
    } catch (error) {
      console.error('Failed to load stored notifications:', error);
    }
  }

  showNotificationCenter() {
    // This would open a modal with all notifications
    // For now, just mark all as read
    this.notifications.forEach(n => n.read = true);
    this.updateBadge();
  }

  // System event listeners
  setupSystemListeners() {
    // Listen for system health changes
    if (window.API_URL) {
      setInterval(async () => {
        try {
          const response = await fetch(`${window.API_URL}/api/health/detailed`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
          });
          
          if (response.ok) {
            const health = await response.json();
            this.checkSystemHealth(health);
          }
        } catch (error) {
          console.error('Health check error:', error);
        }
      }, 30000); // Check every 30 seconds
    }
  }

  checkSystemHealth(health) {
    if (health.status === 'unhealthy') {
      this.error('System health degraded', 'System Alert');
    }
    
    if (health.database && !health.database.healthy) {
      this.warning('Database connection issues', 'Database Alert');
    }
    
    if (health.redis && !health.redis.healthy) {
      this.warning('Redis cache issues', 'Cache Alert');
    }
  }

  clearAll() {
    this.notifications = [];
    this.container.innerHTML = '';
    this.updateBadge();
    localStorage.removeItem('notifications');
  }
}

// Initialize global notifications system
let notifications;
document.addEventListener('DOMContentLoaded', () => {
  notifications = new NotificationSystem();
  notifications.setupSystemListeners();
  
  // Override alert for better UX
  window.showNotification = (message, type = 'info', title = null) => {
    return notifications.show(message, type, title);
  };
  
  // Replace alert with notification
  const originalAlert = window.alert;
  window.alert = (message) => {
    notifications.info(message, 'System Message');
  };
});

/**
 * Ultra Agent OS - Authentication Gate
 * Handles login flow and protects authenticated routes
 */

class AuthGate {
  constructor() {
    this.isAuthenticated = window.apiClient.isAuthenticated();
    this.currentUser = null;
    this.init();
  }

  async init() {
    // Check authentication status on load
    if (this.isAuthenticated) {
      try {
        // Verify token is still valid by making a simple API call
        await window.apiClient.getHealth();
        this.showDashboard();
      } catch (error) {
        console.log('Token validation failed:', error.message);
        this.isAuthenticated = false;
        window.apiClient.clearToken();
        this.showLogin();
      }
    } else {
      this.showLogin();
    }
  }

  showLogin() {
    document.body.innerHTML = `
      <div class="auth-container">
        <div class="auth-card">
          <div class="auth-header">
            <h1>Ultra Agent OS</h1>
            <p>Agent Terminal & Dashboard</p>
          </div>
          
          <form id="loginForm" class="login-form">
            <div class="form-group">
              <label for="username">Username</label>
              <input type="text" id="username" name="username" value="admin" required>
            </div>
            
            <div class="form-group">
              <label for="password">Password</label>
              <input type="password" id="password" name="password" value="admin" required>
            </div>
            
            <button type="submit" class="login-btn">
              <span class="btn-text">Login</span>
              <span class="btn-loading" style="display: none;">Logging in...</span>
            </button>
          </form>
          
          <div id="loginError" class="error-message" style="display: none;"></div>
          
          <div class="auth-footer">
            <p>Default credentials: admin / admin</p>
          </div>
        </div>
      </div>
      
      <style>
        .auth-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #0a1428 0%, #1a2847 100%);
          font-family: 'Inter', sans-serif;
        }
        
        .auth-card {
          background: rgba(26, 40, 71, 0.8);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(79, 122, 184, 0.2);
          border-radius: 12px;
          padding: 2rem;
          width: 100%;
          max-width: 400px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }
        
        .auth-header {
          text-align: center;
          margin-bottom: 2rem;
        }
        
        .auth-header h1 {
          color: #4a9eff;
          font-size: 2rem;
          margin-bottom: 0.5rem;
        }
        
        .auth-header p {
          color: #7fa3c8;
          font-size: 0.9rem;
        }
        
        .form-group {
          margin-bottom: 1.5rem;
        }
        
        .form-group label {
          display: block;
          color: #e8f1ff;
          margin-bottom: 0.5rem;
          font-weight: 500;
        }
        
        .form-group input {
          width: 100%;
          padding: 0.75rem;
          background: rgba(10, 20, 40, 0.5);
          border: 1px solid rgba(79, 122, 184, 0.3);
          border-radius: 6px;
          color: #e8f1ff;
          font-size: 1rem;
          transition: all 0.3s ease;
        }
        
        .form-group input:focus {
          outline: none;
          border-color: #4a9eff;
          box-shadow: 0 0 0 3px rgba(74, 158, 255, 0.1);
        }
        
        .login-btn {
          width: 100%;
          padding: 0.875rem;
          background: linear-gradient(135deg, #4a9eff 0%, #3a7ee6 100%);
          border: none;
          border-radius: 6px;
          color: white;
          font-weight: 600;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        
        .login-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 20px rgba(74, 158, 255, 0.3);
        }
        
        .login-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
        }
        
        .error-message {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #ef4444;
          padding: 0.75rem;
          border-radius: 6px;
          margin-top: 1rem;
          font-size: 0.9rem;
        }
        
        .auth-footer {
          margin-top: 2rem;
          text-align: center;
        }
        
        .auth-footer p {
          color: #7fa3c8;
          font-size: 0.8rem;
        }
      </style>
    `;

    // Attach login form handler
    document.getElementById('loginForm').addEventListener('submit', (e) => {
      this.handleLogin(e);
    });
  }

  async handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const submitBtn = document.querySelector('.login-btn');
    const errorDiv = document.getElementById('loginError');
    
    // Show loading state
    submitBtn.disabled = true;
    document.querySelector('.btn-text').style.display = 'none';
    document.querySelector('.btn-loading').style.display = 'inline';
    errorDiv.style.display = 'none';

    try {
      const response = await window.apiClient.login(username, password);
      
      if (response.token) {
        this.isAuthenticated = true;
        this.currentUser = response.user;
        this.showDashboard();
      } else {
        throw new Error('Login failed: No token received');
      }
    } catch (error) {
      errorDiv.textContent = error.message;
      errorDiv.style.display = 'block';
    } finally {
      // Reset loading state
      submitBtn.disabled = false;
      document.querySelector('.btn-text').style.display = 'inline';
      document.querySelector('.btn-loading').style.display = 'none';
    }
  }

  showDashboard() {
    // Load the main dashboard
    this.loadDashboard();
  }

  async loadDashboard() {
    // This will be overridden by the main dashboard
    window.location.reload();
  }

  logout() {
    window.apiClient.clearToken();
    this.isAuthenticated = false;
    this.currentUser = null;
    this.showLogin();
  }
}

// Create global auth gate instance
window.authGate = new AuthGate();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuthGate;
}

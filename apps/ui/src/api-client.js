/**
 * Ultra Agent OS - API Client
 * Centralized API communication with authentication and error handling
 */

class ApiClient {
  constructor() {
    this.baseURL = window.ENV?.API_URL || 'http://localhost:3000';
    this.token = localStorage.getItem('jwt_token') || null;
    this.refreshTokenPromise = null;
  }

  /**
   * Set authentication token
   */
  setToken(token) {
    this.token = token;
    localStorage.setItem('jwt_token', token);
  }

  /**
   * Clear authentication token
   */
  clearToken() {
    this.token = null;
    localStorage.removeItem('jwt_token');
  }

  /**
   * Get current authentication status
   */
  isAuthenticated() {
    return !!this.token;
  }

  /**
   * Make API request with authentication
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    // Add authentication header if token exists
    if (this.token) {
      config.headers.Authorization = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, config);
      
      // Handle 401 Unauthorized
      if (response.status === 401) {
        this.clearToken();
        throw new Error('Authentication expired. Please login again.');
      }

      // Handle other HTTP errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  /**
   * GET request
   */
  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  /**
   * POST request
   */
  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * PUT request
   */
  async put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * DELETE request
   */
  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  // === AUTHENTICATION ===
  
  async login(username, password) {
    const response = await this.post('/api/auth/login', { username, password });
    if (response.token) {
      this.setToken(response.token);
    }
    return response;
  }

  // === SYSTEM ===
  
  async getHealth() {
    return this.get('/health');
  }

  async getRoot() {
    return this.get('/');
  }

  // === ADAPTERS ===
  
  async getAdapterStatus() {
    return this.get('/api/adapters/status');
  }

  async testAdapter(adapter, testType) {
    return this.post('/api/adapters/test', { adapter, test_type: testType });
  }

  // === JOBS ===
  
  async createJob(message) {
    return this.post('/api/chat', { message });
  }

  async getJobs() {
    return this.get('/api/jobs');
  }

  async getJob(jobId) {
    return this.get(`/api/jobs/${jobId}`);
  }

  // === MEMORY ===
  
  async writeMemory(filename, data) {
    return this.post(`/api/memory/${filename}`, { data });
  }

  async readMemory(filename) {
    return this.get(`/api/memory/${filename}`);
  }

  async getWorkspace() {
    return this.get('/api/memory/');
  }

  async getWorkspaceAlt() {
    return this.get('/api/workspace');
  }

  // === ADMIN ===
  
  async getTenants() {
    return this.get('/api/admin/tenants');
  }

  async createTenant(name, tenantId) {
    return this.post('/api/admin/tenants', { name, tenantId });
  }

  // === UTILITY ===
  
  async testConnection() {
    try {
      await this.getHealth();
      return { success: true, message: 'API connection successful' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

// Create global instance
window.apiClient = new ApiClient();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ApiClient;
}

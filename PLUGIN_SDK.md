# Ultra Agent OS - Plugin SDK & Marketplace

## Plugin Development Kit

This document defines the **Plugin SDK** for Ultra Agent OS, enabling hot-pluggable extensions with isolation, governance, and failure containment.

**Orchestrator**: MARKETPLACE_PLUGIN_ORCHESTRATOR v1.0.0 — strict plugin ecosystem (discover → validate → sandbox → enable → monitor → disable).

---

## PLUGIN LIFECYCLE (Mandatory Order)

1. **discover** — Scan plugin directory / registry; list available plugins (manifest only).
2. **validate** — Check manifest (required fields, permissions), signature, and compatibility.
3. **sandbox** — Run plugin code in isolated context (timeout + try/catch; no core mutation).
4. **enable** — Load plugin, call `onInitialize`, register per tenant (tenant-scoped).
5. **monitor** — Report status/health of each enabled plugin per tenant.
6. **disable** — Call `onShutdown`, remove from registry (hot-disable safely).

Plugin failure at any step does not affect core; plugins hot-disable without crashing the platform.

---

## PLUGIN RULES

| Rule | Enforcement |
|------|--------------|
| **no_core_mutation** | Plugins cannot modify core code paths; they run in a sandboxed execution layer. |
| **sandbox_execution** | Plugin lifecycle methods run with timeout and try/catch; errors return a result object, not throw. |
| **fail_isolated** | Plugin crash or timeout is contained; core API and worker continue. |
| **tenant_scoped** | Enable/disable and state are per tenant (Redis keys `tenant:{tenantId}:plugins:enabled`). |

---

## SECURITY

- **signed_plugins_only**: Manifest must include a `signature` field. Verification: SHA256 of canonical `plugin.json`; `signature` must equal the hash or `sha256:{hash}`.
- **explicit_permissions**: Plugins declare `permissions` in the manifest; only known permissions are accepted; unknown permissions cause validation failure.

---

## API (Plugin Manager)

All plugin endpoints require authentication and tenant context (JWT or `X-TENANT-ID` for admin).

- **GET /api/plugins** — List discovered plugins with validation result and enabled status for the current tenant.
- **POST /api/plugins/:pluginId/enable** — Validate (including signature) and enable the plugin for the current tenant.
- **POST /api/plugins/:pluginId/disable** — Hot-disable: call `onShutdown`, remove from tenant registry.
- **GET /api/plugins/status** — Return status of all enabled plugins for the current tenant.

---

## DASHBOARD INTEGRATION

The Admin Control Plane includes a **Plugin Manager** view: list plugins, enable/disable per tenant, view validation and status. Data is loaded from `GET /api/plugins` and `GET /api/plugins/status`; actions use the POST enable/disable endpoints.

---

## 🔌 PLUGIN ARCHITECTURE OVERVIEW

### Plugin System Design
- **Hot-Pluggable**: Plugins can be loaded/unloaded at runtime
- **Isolated Execution**: Each plugin runs in isolated context (sandbox_execution)
- **Permission-Based**: Plugins declare required permissions (explicit_permissions)
- **Fail-Safe**: Plugin failures cannot crash core platform (fail_isolated)
- **Versioned**: Plugin compatibility matrix enforcement
- **Tenant-Scoped**: Enable/disable and state are per tenant

### Plugin Types
```javascript
const PLUGIN_TYPES = {
  ADAPTER: 'adapter',           // External service adapters
  PROCESSOR: 'processor',       // Job processing extensions
  AUTHENTICATOR: 'authenticator', // Custom authentication
  MONITOR: 'monitor',           // Monitoring and metrics
  STORAGE: 'storage',           // Custom storage providers
  UI_EXTENSION: 'ui_extension'  // UI component extensions
};
```

---

## 🏗️ PLUGIN STRUCTURE

### Plugin Manifest
```json
{
  "name": "ollama-llm-adapter",
  "version": "1.0.0",
  "type": "adapter",
  "description": "Ollama LLM integration adapter",
  "author": "Ultra Agent Team",
  "license": "MIT",
  
  "compatibility": {
    "platform_version": ">=1.0.0",
    "node_version": ">=18.0.0"
  },
  
  "permissions": [
    "network.request",
    "network.ollama",
    "storage.read",
    "storage.write"
  ],
  
  "environment_variables": {
    "OLLAMA_URL": {
      "type": "url",
      "required": true,
      "description": "Ollama API endpoint"
    },
    "OLLAMA_MODEL": {
      "type": "string",
      "required": false,
      "default": "llama3.2",
      "description": "Default LLM model"
    }
  },
  
  "entry_point": "./index.js",
  "dependencies": {
    "axios": "^1.7.0"
  },
  
  "hooks": {
    "initialize": "onInitialize",
    "job_start": "onJobStart",
    "job_complete": "onJobComplete",
    "shutdown": "onShutdown"
  }
}
```

### Plugin Entry Point
```javascript
// plugins/ollama-llm-adapter/index.js
class OllamaLLMAdapter {
  constructor(config, permissions, logger) {
    this.config = config;
    this.permissions = permissions;
    this.logger = logger;
    this.name = 'ollama-llm-adapter';
    this.version = '1.0.0';
  }

  // Plugin lifecycle hooks
  async onInitialize() {
    this.logger.info(`[${this.name}] Initializing Ollama adapter`);
    
    // Validate configuration
    if (!this.config.OLLAMA_URL) {
      throw new Error('OLLAMA_URL is required');
    }
    
    // Test connection
    await this.testConnection();
    
    this.logger.info(`[${this.name}] Initialized successfully`);
  }

  async onShutdown() {
    this.logger.info(`[${this.name}] Shutting down`);
  }

  // Core plugin functionality
  async processMessage(message, context = {}) {
    try {
      this.logger.info(`[${this.name}] Processing message: ${message.substring(0, 50)}...`);
      
      const response = await this.callOllama(message, context);
      
      this.logger.info(`[${this.name}] Message processed successfully`);
      return {
        success: true,
        data: response,
        adapter: this.name,
        metadata: {
          model: this.config.OLLAMA_MODEL,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      this.logger.error(`[${this.name}] Processing failed:`, error);
      return {
        success: false,
        error: error.message,
        adapter: this.name
      };
    }
  }

  // Private methods
  async callOllama(prompt, context) {
    const axios = require('axios');
    
    const response = await axios.post(`${this.config.OLLAMA_URL}/api/generate`, {
      model: this.config.OLLAMA_MODEL || 'llama3.2',
      prompt: this.buildPrompt(prompt, context),
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 500
      }
    });
    
    return response.data.response;
  }

  buildPrompt(prompt, context) {
    let fullPrompt = '';
    
    if (context.systemPrompt) {
      fullPrompt += `System: ${context.systemPrompt}\n\n`;
    }
    
    if (context.history && context.history.length > 0) {
      fullPrompt += 'Previous conversation:\n';
      context.history.forEach(item => {
        fullPrompt += `${item.role}: ${item.content}\n`;
      });
      fullPrompt += '\n';
    }
    
    fullPrompt += `User: ${prompt}\n\nAssistant:`;
    
    return fullPrompt;
  }

  async testConnection() {
    const axios = require('axios');
    
    try {
      await axios.get(`${this.config.OLLAMA_URL}/api/tags`);
      this.logger.info(`[${this.name}] Connection test successful`);
    } catch (error) {
      throw new Error(`Failed to connect to Ollama: ${error.message}`);
    }
  }
}

// Plugin export
module.exports = OllamaLLMAdapter;
```

---

## 🔐 PLUGIN PERMISSIONS SYSTEM

### Permission Types
```javascript
const PERMISSIONS = {
  // Network permissions
  'network.request': {
    description: 'Make HTTP requests to external services',
    risk: 'medium'
  },
  'network.external': {
    description: 'Access external network beyond allowed domains',
    risk: 'high'
  },
  
  // Storage permissions
  'storage.read': {
    description: 'Read from storage system',
    risk: 'low'
  },
  'storage.write': {
    description: 'Write to storage system',
    risk: 'medium'
  },
  'storage.delete': {
    description: 'Delete files from storage',
    risk: 'high'
  },
  
  // System permissions
  'system.process': {
    description: 'Execute system processes',
    risk: 'high'
  },
  'system.env': {
    description: 'Access environment variables',
    risk: 'medium'
  },
  
  // Database permissions
  'database.read': {
    description: 'Read from database',
    risk: 'low'
  },
  'database.write': {
    description: 'Write to database',
    risk: 'medium'
  },
  
  // Core permissions
  'core.jobs': {
    description: 'Access job queue',
    risk: 'medium'
  },
  'core.auth': {
    description: 'Access authentication system',
    risk: 'high'
  }
};
```

### Permission Enforcement
```javascript
class PermissionManager {
  constructor() {
    this.permissions = PERMISSIONS;
  }

  validatePermissions(permissions) {
    const invalid = [];
    
    for (const permission of permissions) {
      if (!this.permissions[permission]) {
        invalid.push(permission);
      }
    }
    
    if (invalid.length > 0) {
      throw new Error(`Invalid permissions: ${invalid.join(', ')}`);
    }
    
    return true;
  }

  checkPermission(plugin, permission) {
    if (!plugin.permissions.includes(permission)) {
      throw new Error(`Plugin ${plugin.name} lacks permission: ${permission}`);
    }
    
    return true;
  }

  getPermissionRisk(permissions) {
    let risk = 'low';
    
    for (const permission of permissions) {
      const permInfo = this.permissions[permission];
      if (permInfo.risk === 'high') {
        risk = 'high';
      } else if (permInfo.risk === 'medium' && risk === 'low') {
        risk = 'medium';
      }
    }
    
    return risk;
  }
}
```

---

## 🔌 PLUGIN MANAGER

### Plugin Lifecycle Management
```javascript
class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.permissionManager = new PermissionManager();
    this.logger = console;
    this.pluginDir = './plugins';
  }

  async loadPlugin(pluginName) {
    try {
      // Load plugin manifest
      const manifest = await this.loadManifest(pluginName);
      
      // Validate manifest
      this.validateManifest(manifest);
      
      // Check compatibility
      this.checkCompatibility(manifest);
      
      // Validate permissions
      this.permissionManager.validatePermissions(manifest.permissions);
      
      // Load plugin module
      const PluginClass = require(path.join(this.pluginDir, pluginName, manifest.entry_point));
      
      // Create plugin instance
      const plugin = new PluginClass(
        this.buildPluginConfig(manifest),
        manifest.permissions,
        this.createPluginLogger(pluginName)
      );
      
      // Initialize plugin
      await plugin.onInitialize();
      
      // Store plugin
      this.plugins.set(pluginName, {
        instance: plugin,
        manifest,
        loadedAt: new Date(),
        status: 'active'
      });
      
      this.logger.info(`[PLUGIN] Loaded plugin: ${pluginName} v${manifest.version}`);
      
      return plugin;
    } catch (error) {
      this.logger.error(`[PLUGIN] Failed to load plugin ${pluginName}:`, error);
      throw error;
    }
  }

  async unloadPlugin(pluginName) {
    const pluginData = this.plugins.get(pluginName);
    
    if (!pluginData) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }
    
    try {
      // Call shutdown hook
      await pluginData.instance.onShutdown();
      
      // Remove from registry
      this.plugins.delete(pluginName);
      
      this.logger.info(`[PLUGIN] Unloaded plugin: ${pluginName}`);
    } catch (error) {
      this.logger.error(`[PLUGIN] Error unloading plugin ${pluginName}:`, error);
      throw error;
    }
  }

  async executePlugin(pluginName, method, ...args) {
    const pluginData = this.plugins.get(pluginName);
    
    if (!pluginData || pluginData.status !== 'active') {
      throw new Error(`Plugin not available: ${pluginName}`);
    }
    
    try {
      const result = await pluginData.instance[method](...args);
      return result;
    } catch (error) {
      this.logger.error(`[PLUGIN] Error executing ${pluginName}.${method}:`, error);
      
      // Don't crash the system, return error result
      return {
        success: false,
        error: error.message,
        plugin: pluginName
      };
    }
  }

  async loadManifest(pluginName) {
    const manifestPath = path.join(this.pluginDir, pluginName, 'plugin.json');
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    return JSON.parse(manifestContent);
  }

  validateManifest(manifest) {
    const required = ['name', 'version', 'type', 'entry_point'];
    const missing = required.filter(field => !manifest[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required manifest fields: ${missing.join(', ')}`);
    }
    
    if (!PLUGIN_TYPES[manifest.type]) {
      throw new Error(`Invalid plugin type: ${manifest.type}`);
    }
  }

  checkCompatibility(manifest) {
    const platformVersion = require('../package.json').version;
    const requiredVersion = manifest.compatibility.platform_version;
    
    if (!this.isVersionCompatible(platformVersion, requiredVersion)) {
      throw new Error(`Plugin requires platform version ${requiredVersion}, current is ${platformVersion}`);
    }
  }

  isVersionCompatible(current, required) {
    // Simple semver compatibility check
    const currentParts = current.split('.').map(Number);
    const requiredParts = required.replace('>=', '').split('.').map(Number);
    
    for (let i = 0; i < Math.max(currentParts.length, requiredParts.length); i++) {
      const current = currentParts[i] || 0;
      const required = requiredParts[i] || 0;
      
      if (current < required) {
        return false;
      }
    }
    
    return true;
  }

  buildPluginConfig(manifest) {
    const config = {};
    
    // Load environment variables
    if (manifest.environment_variables) {
      for (const [key, config] of Object.entries(manifest.environment_variables)) {
        config[key] = process.env[key] || config.default;
      }
    }
    
    return config;
  }

  createPluginLogger(pluginName) {
    return {
      info: (message, ...args) => this.logger.info(`[PLUGIN:${pluginName}] ${message}`, ...args),
      warn: (message, ...args) => this.logger.warn(`[PLUGIN:${pluginName}] ${message}`, ...args),
      error: (message, ...args) => this.logger.error(`[PLUGIN:${pluginName}] ${message}`, ...args),
      debug: (message, ...args) => this.logger.debug(`[PLUGIN:${pluginName}] ${message}`, ...args)
    };
  }

  getPluginStatus(pluginName) {
    const plugin = this.plugins.get(pluginName);
    return plugin ? plugin.status : 'not_loaded';
  }

  listPlugins() {
    return Array.from(this.plugins.entries()).map(([name, data]) => ({
      name,
      version: data.manifest.version,
      type: data.manifest.type,
      status: data.status,
      loadedAt: data.loadedAt,
      permissions: data.manifest.permissions
    }));
  }
}
```

---

## 📦 PLUGIN DEVELOPMENT TOOLS

### Plugin Generator CLI
```javascript
// tools/plugin-generator.js
class PluginGenerator {
  constructor() {
    this.templates = {
      adapter: this.getAdapterTemplate(),
      processor: this.getProcessorTemplate(),
      monitor: this.getMonitorTemplate()
    };
  }

  generatePlugin(type, name, options = {}) {
    const template = this.templates[type];
    if (!template) {
      throw new Error(`Unknown plugin type: ${type}`);
    }

    const pluginDir = path.join('./plugins', name);
    
    // Create plugin directory
    fs.mkdirSync(pluginDir, { recursive: true });
    
    // Generate manifest
    this.generateManifest(pluginDir, name, type, options);
    
    // Generate entry point
    this.generateEntryPoint(pluginDir, name, type, options);
    
    // Generate package.json
    this.generatePackageJson(pluginDir, name, options);
    
    // Generate README
    this.generateReadme(pluginDir, name, type, options);
    
    console.log(`Generated ${type} plugin: ${name}`);
  }

  generateManifest(pluginDir, name, type, options) {
    const manifest = {
      name,
      version: "1.0.0",
      type,
      description: options.description || `${name} plugin`,
      author: options.author || "Plugin Developer",
      license: "MIT",
      compatibility: {
        platform_version: ">=1.0.0",
        node_version: ">=18.0.0"
      },
      permissions: options.permissions || [],
      environment_variables: options.environmentVariables || {},
      entry_point: "./index.js",
      dependencies: options.dependencies || {},
      hooks: options.hooks || {}
    };

    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify(manifest, null, 2)
    );
  }

  generateEntryPoint(pluginDir, name, type, options) {
    const template = this.templates[type];
    const code = template(name, options);
    
    fs.writeFileSync(path.join(pluginDir, 'index.js'), code);
  }

  getAdapterTemplate() {
    return (name, options) => `
class ${this.toPascalCase(name)}Adapter {
  constructor(config, permissions, logger) {
    this.config = config;
    this.permissions = permissions;
    this.logger = logger;
    this.name = '${name}';
    this.version = '1.0.0';
  }

  async onInitialize() {
    this.logger.info(\`[${this.name}] Initializing adapter\`);
    // TODO: Implement initialization logic
  }

  async onShutdown() {
    this.logger.info(\`[${this.name}] Shutting down\`);
    // TODO: Implement cleanup logic
  }

  async processMessage(message, context = {}) {
    try {
      this.logger.info(\`[${this.name}] Processing message: \${message.substring(0, 50)}...\`);
      
      // TODO: Implement core plugin logic
      const result = await this.processCore(message, context);
      
      this.logger.info(\`[${this.name}] Message processed successfully\`);
      return {
        success: true,
        data: result,
        adapter: this.name,
        metadata: {
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      this.logger.error(\`[${this.name}] Processing failed:\`, error);
      return {
        success: false,
        error: error.message,
        adapter: this.name
      };
    }
  }

  async processCore(message, context) {
    // TODO: Implement your plugin's core functionality
    return \`Processed: \${message}\`;
  }
}

module.exports = ${this.toPascalCase(name)}Adapter;
    `;
  }

  getProcessorTemplate() {
    return (name, options) => `
class ${this.toPascalCase(name)}Processor {
  constructor(config, permissions, logger) {
    this.config = config;
    this.permissions = permissions;
    this.logger = logger;
    this.name = '${name}';
    this.version = '1.0.0';
  }

  async onInitialize() {
    this.logger.info(\`[${this.name}] Initializing processor\`);
  }

  async onShutdown() {
    this.logger.info(\`[${this.name}] Shutting down\`);
  }

  async processJob(jobData) {
    try {
      this.logger.info(\`[${this.name}] Processing job: \${jobData.id}\`);
      
      const result = await this.processJobCore(jobData);
      
      return {
        success: true,
        result,
        processor: this.name
      };
    } catch (error) {
      this.logger.error(\`[${this.name}] Job processing failed:\`, error);
      return {
        success: false,
        error: error.message,
        processor: this.name
      };
    }
  }

  async processJobCore(jobData) {
    // TODO: Implement your job processing logic
    return {
      status: 'completed',
      output: \`Processed job \${jobData.id}\`,
      metadata: {}
    };
  }
}

module.exports = ${this.toPascalCase(name)}Processor;
    `;
  }

  toPascalCase(str) {
    return str.replace(/(?:^|[-_])(.)/g, (_, char) => char.toUpperCase());
  }
}
```

---

## 🏪 PLUGIN MARKETPLACE

### Plugin Registry
```javascript
class PluginRegistry {
  constructor() {
    this.plugins = new Map();
    this.categories = new Map();
    this.stats = {
      total_downloads: 0,
      total_plugins: 0,
      active_plugins: 0
    };
  }

  async registerPlugin(pluginData) {
    const { manifest, packageUrl, author } = pluginData;
    
    // Validate plugin
    await this.validatePluginForRegistry(pluginData);
    
    // Store in registry
    this.plugins.set(manifest.name, {
      manifest,
      packageUrl,
      author,
      registeredAt: new Date(),
      downloads: 0,
      rating: 0,
      reviews: []
    });
    
    // Update category
    const category = manifest.type;
    if (!this.categories.has(category)) {
      this.categories.set(category, []);
    }
    this.categories.get(category).push(manifest.name);
    
    this.stats.total_plugins++;
    
    console.log(`[REGISTRY] Registered plugin: ${manifest.name}`);
  }

  async installPlugin(pluginName, version = 'latest') {
    const plugin = this.plugins.get(pluginName);
    
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }
    
    // Download plugin
    const packagePath = await this.downloadPlugin(plugin.packageUrl);
    
    // Install plugin
    const pluginManager = require('./plugin-manager');
    await pluginManager.loadPlugin(pluginName);
    
    // Update stats
    plugin.downloads++;
    this.stats.total_downloads++;
    
    return packagePath;
  }

  searchPlugins(query) {
    const results = [];
    
    for (const [name, plugin] of this.plugins) {
      if (name.toLowerCase().includes(query.toLowerCase()) ||
          plugin.manifest.description.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          name,
          version: plugin.manifest.version,
          type: plugin.manifest.type,
          description: plugin.manifest.description,
          author: plugin.author,
          downloads: plugin.downloads,
          rating: plugin.rating,
          registeredAt: plugin.registeredAt
        });
      }
    }
    
    return results;
  }

  getPluginsByCategory(category) {
    const pluginNames = this.categories.get(category) || [];
    
    return pluginNames.map(name => {
      const plugin = this.plugins.get(name);
      return {
        name,
        version: plugin.manifest.version,
        description: plugin.manifest.description,
        author: plugin.author,
        downloads: plugin.downloads,
        rating: plugin.rating
      };
    });
  }

  async validatePluginForRegistry(pluginData) {
    const { manifest } = pluginData;
    
    // Required fields
    const required = ['name', 'version', 'type', 'description', 'author'];
    const missing = required.filter(field => !manifest[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
    
    // Validate name uniqueness
    if (this.plugins.has(manifest.name)) {
      throw new Error(`Plugin name already exists: ${manifest.name}`);
    }
    
    // Validate package URL
    if (!pluginData.packageUrl) {
      throw new Error('Package URL is required');
    }
    
    // Validate security
    await this.validatePluginSecurity(pluginData);
  }

  async validatePluginSecurity(pluginData) {
    const { manifest } = pluginData;
    
    // Check for high-risk permissions
    const highRiskPermissions = manifest.permissions.filter(p => 
      this.isHighRiskPermission(p)
    );
    
    if (highRiskPermissions.length > 0) {
      console.warn(`[REGISTRY] Plugin ${manifest.name} requests high-risk permissions: ${highRiskPermissions.join(', ')}`);
    }
    
    // Scan package for security issues
    await this.scanPackageSecurity(pluginData.packageUrl);
  }

  isHighRiskPermission(permission) {
    const highRisk = ['system.process', 'system.env', 'database.write', 'storage.delete'];
    return highRisk.includes(permission);
  }

  async scanPackageSecurity(packageUrl) {
    // TODO: Implement security scanning
    // This would check for known vulnerabilities, malicious code, etc.
    console.log(`[REGISTRY] Security scanning package: ${packageUrl}`);
  }
}
```

---

## 📋 PLUGIN VALIDATION RULES

### Validation Checklist
```javascript
const PLUGIN_VALIDATION_RULES = {
  manifest: {
    required_fields: ['name', 'version', 'type', 'description', 'author', 'entry_point'],
    name_format: /^[a-z0-9-]+$/,
    version_format: /^\d+\.\d+\.\d+$/,
    type_enum: ['adapter', 'processor', 'authenticator', 'monitor', 'storage', 'ui_extension']
  },
  
  code: {
    no_eval: true,
    no_process_spawn: true,
    no_file_system_access: true,
    no_network_access: true,
    error_handling: true
  },
  
  security: {
    no_hardcoded_secrets: true,
    no_sql_injection: true,
    no_xss_vulnerabilities: true,
    permission_validation: true
  },
  
  performance: {
    max_startup_time: 5000,
    max_memory_usage: 100 * 1024 * 1024, // 100MB
    no_blocking_operations: true
  }
};

class PluginValidator {
  constructor() {
    this.rules = PLUGIN_VALIDATION_RULES;
  }

  validatePlugin(pluginPath) {
    const errors = [];
    const warnings = [];
    
    // Validate manifest
    const manifestErrors = this.validateManifest(pluginPath);
    errors.push(...manifestErrors);
    
    // Validate code
    const codeErrors = this.validateCode(pluginPath);
    errors.push(...codeErrors);
    
    // Validate security
    const securityErrors = this.validateSecurity(pluginPath);
    errors.push(...securityErrors);
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  validateManifest(pluginPath) {
    const errors = [];
    
    try {
      const manifestPath = path.join(pluginPath, 'plugin.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      
      // Check required fields
      for (const field of this.rules.manifest.required_fields) {
        if (!manifest[field]) {
          errors.push(`Missing required field: ${field}`);
        }
      }
      
      // Validate name format
      if (!this.rules.manifest.name_format.test(manifest.name)) {
        errors.push(`Invalid name format: ${manifest.name}`);
      }
      
      // Validate version format
      if (!this.rules.manifest.version_format.test(manifest.version)) {
        errors.push(`Invalid version format: ${manifest.version}`);
      }
      
      // Validate type enum
      if (!this.rules.manifest.type_enum.includes(manifest.type)) {
        errors.push(`Invalid plugin type: ${manifest.type}`);
      }
      
    } catch (error) {
      errors.push(`Invalid manifest file: ${error.message}`);
    }
    
    return errors;
  }

  validateCode(pluginPath) {
    const errors = [];
    
    try {
      const entryPoint = path.join(pluginPath, 'index.js');
      const code = fs.readFileSync(entryPoint, 'utf8');
      
      // Check for eval usage
      if (code.includes('eval(')) {
        errors.push('Code contains eval() usage');
      }
      
      // Check for process spawning
      if (code.includes('require(\'child_process\')') || code.includes('spawn(')) {
        errors.push('Code attempts to spawn processes');
      }
      
      // Check for file system access
      if (code.includes('fs.') && !code.includes('fs.existsSync')) {
        errors.push('Code contains file system access');
      }
      
    } catch (error) {
      errors.push(`Error reading plugin code: ${error.message}`);
    }
    
    return errors;
  }

  validateSecurity(pluginPath) {
    const errors = [];
    
    try {
      const packagePath = path.join(pluginPath, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      // Check for hardcoded secrets
      const packageString = JSON.stringify(packageJson);
      if (/(password|secret|key|token)/i.test(packageString)) {
        errors.push('Package may contain hardcoded secrets');
      }
      
    } catch (error) {
      errors.push(`Error reading package.json: ${error.message}`);
    }
    
    return errors;
  }
}
```

---

## 🚀 PLUGIN EXAMPLES

### Example: Ollama LLM Adapter
```json
{
  "name": "ollama-llm-adapter",
  "version": "1.0.0",
  "type": "adapter",
  "description": "Ollama LLM integration adapter",
  "author": "Ultra Agent Team",
  "license": "MIT",
  "compatibility": {
    "platform_version": ">=1.0.0",
    "node_version": ">=18.0.0"
  },
  "permissions": [
    "network.request",
    "network.ollama"
  ],
  "environment_variables": {
    "OLLAMA_URL": {
      "type": "url",
      "required": true,
      "description": "Ollama API endpoint"
    },
    "OLLAMA_MODEL": {
      "type": "string",
      "required": false,
      "default": "llama3.2",
      "description": "Default LLM model"
    }
  },
  "entry_point": "./index.js",
  "dependencies": {
    "axios": "^1.7.0"
  }
}
```

### Example: Custom Job Processor
```json
{
  "name": "data-analysis-processor",
  "version": "1.0.0",
  "type": "processor",
  "description": "Data analysis and visualization processor",
  "author": "Data Science Team",
  "license": "MIT",
  "compatibility": {
    "platform_version": ">=1.0.0",
    "node_version": ">=18.0.0"
  },
  "permissions": [
    "storage.read",
    "storage.write",
    "database.read"
  ],
  "environment_variables": {
    "ANALYSIS_TYPE": {
      "type": "string",
      "required": false,
      "default": "basic",
      "description": "Type of analysis to perform"
    }
  },
  "entry_point": "./index.js",
  "dependencies": {
    "chart.js": "^4.4.0",
    "simple-statistics": "^7.8.0"
  }
}
```

---

## 📚 BEST PRACTICES

### Plugin Development Guidelines
1. **Error Handling**: Always wrap operations in try-catch blocks
2. **Logging**: Use the provided logger for all logging
3. **Permissions**: Only request permissions you actually need
4. **Configuration**: Validate all configuration values
5. **Testing**: Include comprehensive tests for your plugin

### Security Guidelines
1. **No Secrets**: Never hardcode secrets in plugin code
2. **Input Validation**: Validate all inputs before processing
3. **Output Sanitization**: Sanitize all outputs
4. **Resource Limits**: Respect memory and time limits
5. **Permission Principle**: Follow principle of least privilege

### Performance Guidelines
1. **Async Operations**: Use async/await for I/O operations
2. **Caching**: Cache expensive operations when appropriate
3. **Resource Cleanup**: Clean up resources in shutdown hook
4. **Batch Processing**: Process items in batches when possible
5. **Memory Management**: Avoid memory leaks

---

**This Plugin SDK provides a comprehensive framework for extending Ultra Agent OS with safe, isolated, and governable plugins.**

**Last Updated:** 2025-01-31  
**Plugin SDK Version:** 1.0.0

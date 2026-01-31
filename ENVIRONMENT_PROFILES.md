# Ultra Agent OS - Environment Profiles

## Environment Configuration Management

This document defines the **environment profiles** for development, staging, and production deployments with complete isolation and predictable behavior.

---

## 🌍 ENVIRONMENT PROFILES OVERVIEW

### Profile Types
- **Development**: Local development with relaxed security
- **Staging**: Pre-production testing with production-like settings
- **Production**: Live deployment with maximum security
- **Test**: Automated testing with minimal requirements

### Profile Hierarchy
```
production (highest security)
    ↓
staging (production-like)
    ↓
development (relaxed)
    ↓
test (minimal)
```

---

## 🔧 ENVIRONMENT PROFILE CONFIGURATIONS

### Production Profile
```yaml
name: "production"
security_level: "maximum"
monitoring: "full"
debug: "disabled"
features: "all_enabled"

environment_variables:
  # Core Infrastructure
  NODE_ENV: "production"
  DATABASE_URL: "${{Postgres.DATABASE_URL}}"
  REDIS_URL: "${{Redis.REDIS_URL}}"
  
  # Security
  JWT_SECRET: "${{JWT_SECRET.generate}}"
  INTERNAL_API_KEY: "${{INTERNAL_API_KEY.generate}}"
  DEFAULT_ADMIN_PASSWORD: "${{DEFAULT_ADMIN_PASSWORD.generate}}"
  
  # Services
  API_URL: "${{ultra-agent-api.RAILWAY_PUBLIC_URL}}"
  PORT: "${{PORT}}"
  
  # Optional Adapters
  OLLAMA_URL: "${{OLLAMA_URL.defaultValue}}"
  DOCKER_HOST: "${{DOCKER_HOST.defaultValue}}"
  DATA_DIR: "/data/agent"

security_settings:
  rate_limiting: "enabled"
  audit_logging: "enabled"
  security_headers: "enabled"
  https_only: "enabled"
  session_timeout: "8h"

monitoring:
  metrics: "enabled"
  health_checks: "enabled"
  performance_monitoring: "enabled"
  error_tracking: "enabled"

logging:
  level: "info"
  format: "json"
  destination: "railway_logs"
  audit_trail: "enabled"
```

### Staging Profile
```yaml
name: "staging"
security_level: "high"
monitoring: "full"
debug: "enabled"
features: "all_enabled"

environment_variables:
  # Core Infrastructure
  NODE_ENV: "staging"
  DATABASE_URL: "${{Postgres.DATABASE_URL}}"
  REDIS_URL: "${{Redis.REDIS_URL}}"
  
  # Security
  JWT_SECRET: "${{JWT_SECRET.generate}}"
  INTERNAL_API_KEY: "${{INTERNAL_API_KEY.generate}}"
  DEFAULT_ADMIN_PASSWORD: "${{DEFAULT_ADMIN_PASSWORD.generate}}"
  
  # Services
  API_URL: "${{ultra-agent-api.RAILWAY_PUBLIC_URL}}"
  PORT: "${{PORT}}"
  
  # Optional Adapters
  OLLAMA_URL: "${{OLLAMA_URL.defaultValue}}"
  DOCKER_HOST: "${{DOCKER_HOST.defaultValue}}"
  DATA_DIR: "/data/agent"

security_settings:
  rate_limiting: "enabled"
  audit_logging: "enabled"
  security_headers: "enabled"
  https_only: "enabled"
  session_timeout: "4h"

monitoring:
  metrics: "enabled"
  health_checks: "enabled"
  performance_monitoring: "enabled"
  error_tracking: "enabled"

logging:
  level: "debug"
  format: "json"
  destination: "railway_logs"
  audit_trail: "enabled"
```

### Development Profile
```yaml
name: "development"
security_level: "medium"
monitoring: "basic"
debug: "enabled"
features: "all_enabled"

environment_variables:
  # Core Infrastructure
  NODE_ENV: "development"
  DATABASE_URL: "postgres://postgres:password@localhost:5432/ultra_agent_dev"
  REDIS_URL: "redis://localhost:6379/0"
  
  # Security
  JWT_SECRET: "development-jwt-secret-key-32-chars-minimum"
  INTERNAL_API_KEY: "development-internal-api-key-32-chars"
  DEFAULT_ADMIN_PASSWORD: "admin123"
  
  # Services
  API_URL: "http://localhost:3000"
  PORT: "3000"
  
  # Optional Adapters
  OLLAMA_URL: "http://localhost:11434"
  DOCKER_HOST: "unix:///var/run/docker.sock"
  DATA_DIR: "./data"

security_settings:
  rate_limiting: "disabled"
  audit_logging: "minimal"
  security_headers: "disabled"
  https_only: "disabled"
  session_timeout: "24h"

monitoring:
  metrics: "disabled"
  health_checks: "enabled"
  performance_monitoring: "disabled"
  error_tracking: "console"

logging:
  level: "debug"
  format: "console"
  destination: "console"
  audit_trail: "minimal"
```

### Test Profile
```yaml
name: "test"
security_level: "minimal"
monitoring: "disabled"
debug: "enabled"
features: "core_only"

environment_variables:
  # Core Infrastructure
  NODE_ENV: "test"
  DATABASE_URL: "postgres://postgres:password@localhost:5432/ultra_agent_test"
  REDIS_URL: "redis://localhost:6379/1"
  
  # Security
  JWT_SECRET: "test-jwt-secret-key-32-chars-minimum"
  INTERNAL_API_KEY: "test-internal-api-key-32-chars"
  DEFAULT_ADMIN_PASSWORD: "testadmin123"
  
  # Services
  API_URL: "http://localhost:3002"
  PORT: "3002"
  
  # Optional Adapters (disabled in test)
  OLLAMA_URL: ""
  DOCKER_HOST: ""
  DATA_DIR: "/tmp/ultra-agent-test"

security_settings:
  rate_limiting: "disabled"
  audit_logging: "disabled"
  security_headers: "disabled"
  https_only: "disabled"
  session_timeout: "1h"

monitoring:
  metrics: "disabled"
  health_checks: "minimal"
  performance_monitoring: "disabled"
  error_tracking: "disabled"

logging:
  level: "debug"
  format: "console"
  destination: "console"
  audit_trail: "disabled"
```

---

## 🔒 ENVIRONMENT-SPECIFIC CONFIGURATIONS

### Security Configurations

#### Production Security
```javascript
// Production security configuration
const productionSecurity = {
  helmet: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100
  },
  cors: {
    origin: false, // Disabled in production
    credentials: false
  }
};
```

#### Development Security
```javascript
// Development security configuration
const developmentSecurity = {
  helmet: {
    contentSecurityPolicy: false // Relaxed for development
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 1000 // Higher limit for development
  },
  cors: {
    origin: true, // Allow all origins in development
    credentials: true
  }
};
```

### Database Configurations

#### Production Database
```javascript
// Production database configuration
const productionDatabase = {
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: {
    rejectUnauthorized: true
  },
  statement_timeout: '30s',
  query_timeout: '30s'
};
```

#### Development Database
```javascript
// Development database configuration
const developmentDatabase = {
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  ssl: false,
  statement_timeout: '60s',
  query_timeout: '60s'
};
```

---

## 🚀 DEPLOYMENT CONFIGURATIONS

### Railway Production Deployment
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "name": "ultra-agent-production",
  "services": [
    {
      "name": "ultra-agent-api",
      "source": ".",
      "dockerfilePath": "apps/api/Dockerfile",
      "environment": ["production"],
      "healthcheck": {
        "path": "/health",
        "interval": 30,
        "timeout": 10,
        "retries": 5
      },
      "env": {
        "NODE_ENV": "production",
        "DATABASE_URL": "${{Postgres.DATABASE_URL}}",
        "REDIS_URL": "${{Redis.REDIS_URL}}",
        "JWT_SECRET": {
          "generate": true
        },
        "INTERNAL_API_KEY": {
          "generate": true
        },
        "DEFAULT_ADMIN_PASSWORD": {
          "generate": true
        },
        "OLLAMA_URL": {
          "defaultValue": ""
        },
        "DOCKER_HOST": {
          "defaultValue": ""
        },
        "DATA_DIR": "/data/agent"
      }
    },
    {
      "name": "ultra-agent-worker",
      "source": ".",
      "dockerfilePath": "apps/worker/Dockerfile",
      "environment": ["production"],
      "healthcheck": {
        "path": "/health",
        "interval": 30,
        "timeout": 10,
        "retries": 5
      },
      "env": {
        "NODE_ENV": "production",
        "DATABASE_URL": "${{Postgres.DATABASE_URL}}",
        "REDIS_URL": "${{Redis.REDIS_URL}}",
        "INTERNAL_API_KEY": {
          "generate": true
        },
        "JWT_SECRET": {
          "generate": true
        },
        "OLLAMA_URL": {
          "defaultValue": ""
        },
        "DOCKER_HOST": {
          "defaultValue": ""
        },
        "DATA_DIR": "/data/agent"
      }
    },
    {
      "name": "ultra-agent-ui",
      "source": ".",
      "dockerfilePath": "apps/ui/Dockerfile",
      "environment": ["production"],
      "env": {
        "API_URL": "${{ultra-agent-api.RAILWAY_PUBLIC_URL}}",
        "NODE_ENV": "production"
      }
    }
  ],
  "databases": {
    "Postgres": {
      "version": "15",
      "generator": "POSTGRESQL"
    }
  },
  "redis": {
    "version": "7",
    "generator": "REDIS"
  }
}
```

### Railway Staging Deployment
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "name": "ultra-agent-staging",
  "services": [
    {
      "name": "ultra-agent-api-staging",
      "source": ".",
      "dockerfilePath": "apps/api/Dockerfile",
      "environment": ["staging"],
      "env": {
        "NODE_ENV": "staging",
        "DATABASE_URL": "${{Postgres.DATABASE_URL}}",
        "REDIS_URL": "${{Redis.REDIS_URL}}",
        "JWT_SECRET": {
          "generate": true
        },
        "INTERNAL_API_KEY": {
          "generate": true
        },
        "DEFAULT_ADMIN_PASSWORD": {
          "generate": true
        },
        "OLLAMA_URL": {
          "defaultValue": ""
        },
        "DOCKER_HOST": {
          "defaultValue": ""
        },
        "DATA_DIR": "/data/agent"
      }
    }
  ]
}
```

---

## 📋 ENVIRONMENT DETECTION

### Environment Detection Logic
```javascript
// Environment detection
function detectEnvironment() {
  const nodeEnv = process.env.NODE_ENV;
  const railwayEnv = process.env.RAILWAY_ENVIRONMENT;
  
  // Railway environments
  if (railwayEnv === 'production') return 'production';
  if (railwayEnv === 'staging') return 'staging';
  
  // Node.js environments
  if (nodeEnv === 'production') return 'production';
  if (nodeEnv === 'staging') return 'staging';
  if (nodeEnv === 'test') return 'test';
  
  // Default to development
  return 'development';
}

// Environment configuration loader
function loadEnvironmentConfig() {
  const env = detectEnvironment();
  const config = require(`./config/${env}.js`);
  
  console.log(`[CONFIG] Loading environment: ${env}`);
  return config;
}
```

### Configuration Files Structure
```
config/
├── production.js
├── staging.js
├── development.js
├── test.js
└── index.js
```

---

## 🔍 ENVIRONMENT VALIDATION

### Startup Validation
```javascript
// Environment validation
function validateEnvironment(env, config) {
  const requiredVars = config.required_variables || [];
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error(`[CONFIG] Missing required variables for ${env}: ${missing.join(', ')}`);
    process.exit(1);
  }
  
  // Validate environment-specific requirements
  if (env === 'production') {
    validateProductionSecurity();
  }
  
  console.log(`[CONFIG] Environment validation passed for ${env}`);
}

function validateProductionSecurity() {
  // Production security validations
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    console.error('[SECURITY] JWT_SECRET must be at least 32 characters in production');
    process.exit(1);
  }
  
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword === 'admin123' || adminPassword.length < 8) {
    console.error('[SECURITY] DEFAULT_ADMIN_PASSWORD must be strong in production');
    process.exit(1);
  }
}
```

---

## 📊 ENVIRONMENT MONITORING

### Environment-Specific Metrics
```javascript
// Environment monitoring configuration
const monitoringConfig = {
  production: {
    metrics: {
      enabled: true,
      interval: 30000,
      retention: '90d'
    },
    alerts: {
      enabled: true,
      channels: ['email', 'slack']
    },
    health_checks: {
      enabled: true,
      interval: 10000
    }
  },
  staging: {
    metrics: {
      enabled: true,
      interval: 60000,
      retention: '30d'
    },
    alerts: {
      enabled: true,
      channels: ['email']
    },
    health_checks: {
      enabled: true,
      interval: 30000
    }
  },
  development: {
    metrics: {
      enabled: false,
      interval: 0,
      retention: '1d'
    },
    alerts: {
      enabled: false,
      channels: []
    },
    health_checks: {
      enabled: true,
      interval: 60000
    }
  },
  test: {
    metrics: {
      enabled: false,
      interval: 0,
      retention: '1h'
    },
    alerts: {
      enabled: false,
      channels: []
    },
    health_checks: {
      enabled: false,
      interval: 0
    }
  }
};
```

---

## 🔄 ENVIRONMENT MIGRATION

### Migration Between Environments
```javascript
// Environment migration tool
async function migrateEnvironment(fromEnv, toEnv) {
  console.log(`[MIGRATION] Migrating from ${fromEnv} to ${toEnv}`);
  
  // Validate target environment
  const targetConfig = require(`./config/${toEnv}.js`);
  validateEnvironment(toEnv, targetConfig);
  
  // Backup current data if production
  if (fromEnv === 'production') {
    await createProductionBackup();
  }
  
  // Apply environment-specific migrations
  await applyEnvironmentMigrations(toEnv);
  
  // Update environment variables
  await updateEnvironmentVariables(toEnv);
  
  // Restart services with new configuration
  await restartServices();
  
  console.log(`[MIGRATION] Migration to ${toEnv} completed`);
}
```

### Data Migration Considerations
- **Production → Staging**: Anonymize sensitive data
- **Staging → Production**: Full data validation required
- **Development → Test**: Use test data fixtures
- **Any → Production**: Requires full backup and rollback plan

---

## 🛡️ SECURITY BY ENVIRONMENT

### Security Levels Matrix
| Environment | Authentication | Rate Limiting | HTTPS | Audit | Monitoring |
|------------|----------------|--------------|-------|-------|-----------|
| Production | Required | Strict | Required | Full | Full |
| Staging | Required | Moderate | Required | Full | Full |
| Development | Optional | Disabled | Optional | Minimal | Basic |
| Test | Mock | Disabled | Disabled | Disabled | Disabled |

### Environment-Specific Security Policies
```javascript
// Security policy enforcement
function enforceSecurityPolicy(env) {
  const policies = {
    production: {
      requireHttps: true,
      requireAuth: true,
      rateLimit: true,
      auditLog: true,
      sessionTimeout: 28800000 // 8 hours
    },
    staging: {
      requireHttps: true,
      requireAuth: true,
      rateLimit: true,
      auditLog: true,
      sessionTimeout: 14400000 // 4 hours
    },
    development: {
      requireHttps: false,
      requireAuth: true,
      rateLimit: false,
      auditLog: false,
      sessionTimeout: 86400000 // 24 hours
    },
    test: {
      requireHttps: false,
      requireAuth: false,
      rateLimit: false,
      auditLog: false,
      sessionTimeout: 3600000 // 1 hour
    }
  };
  
  return policies[env] || policies.development;
}
```

---

## 📚 BEST PRACTICES

### Environment Management
1. **Explicit Configuration**: Never rely on default values in production
2. **Environment Detection**: Use explicit environment variables
3. **Validation**: Validate all required variables at startup
4. **Security**: Enforce environment-specific security policies
5. **Monitoring**: Enable comprehensive monitoring in production

### Deployment Guidelines
1. **Zero-Downtime**: Use rolling updates for production
2. **Backups**: Always create backups before production changes
3. **Testing**: Test all changes in staging first
4. **Rollback**: Have rollback plans for all deployments
5. **Documentation**: Document all environment-specific configurations

### Security Guidelines
1. **Secrets Management**: Use environment-specific secrets
2. **Access Control**: Restrict access based on environment
3. **Audit Trail**: Enable comprehensive audit logging in production
4. **Network Security**: Enforce HTTPS in production and staging
5. **Data Protection**: Encrypt sensitive data in all environments

---

**This environment profile system provides complete isolation and predictable behavior across all deployment environments.**

**Last Updated:** 2025-01-31  
**Environment Profiles Version:** 1.0.0

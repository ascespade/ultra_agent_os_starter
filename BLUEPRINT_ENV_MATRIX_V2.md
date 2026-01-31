# Ultra Agent OS - Environment Matrix

## Complete Environment Variable Matrix

This document defines **all environment variables** across **all environments** with their exact behavior, validation rules, and interdependencies.

---

## 🌍 ENVIRONMENT DEFINITIONS

### Production Environment
- **Name**: `production`
- **Purpose**: Live customer deployments
- **Security**: Maximum security settings
- **Monitoring**: Full observability enabled
- **Scaling**: Auto-scaling enabled

### Staging Environment  
- **Name**: `staging`
- **Purpose**: Pre-production testing
- **Security**: Production-level security
- **Monitoring**: Full observability
- **Scaling**: Manual scaling

### Development Environment
- **Name**: `development`
- **Purpose**: Local development
- **Security**: Relaxed security for debugging
- **Monitoring**: Debug logging enabled
- **Scaling**: Single instance

### Test Environment
- **Name**: `test`
- **Purpose**: Automated testing
- **Security**: Minimal security
- **Monitoring**: Test-specific logging
- **Scaling**: Test instances only

---

## 🔧 CORE ENVIRONMENT VARIABLES

### Infrastructure Variables

#### DATABASE_URL
```yaml
required: true
services: [api, worker]
validation:
  - type: postgresql_connection_string
  - pattern: "^postgres://.*:.*@.*:.*\/.*$"
environments:
  production:
    source: railway_provided
    example: "postgres://user:pass@host:5432/dbname"
  staging:
    source: railway_provided  
    example: "postgres://user:pass@host:5432/dbname"
  development:
    source: docker_compose
    example: "postgres://postgres:password@localhost:5432/ultra_agent_dev"
  test:
    source: docker_compose
    example: "postgres://postgres:password@localhost:5432/ultra_agent_test"
error_handling:
  missing: "process.exit(1) with error message"
  invalid: "process.exit(1) with validation error"
```

#### REDIS_URL
```yaml
required: true
services: [api, worker]
validation:
  - type: redis_connection_string
  - pattern: "^redis://.*:.*@.*:.*\/.*$|^redis://.*:.*$"
environments:
  production:
    source: railway_provided
    example: "redis://user:pass@host:6379/0"
  staging:
    source: railway_provided
    example: "redis://user:pass@host:6379/0"
  development:
    source: docker_compose
    example: "redis://localhost:6379/0"
  test:
    source: docker_compose
    example: "redis://localhost:6379/1"
error_handling:
  missing: "process.exit(1) with error message"
  invalid: "process.exit(1) with validation error"
```

### Security Variables

#### JWT_SECRET
```yaml
required: true
services: [api]
validation:
  - type: string
  - min_length: 32
  - max_length: 256
environments:
  production:
    source: railway_generated
    generation: "random 64-character string"
  staging:
    source: railway_generated
    generation: "random 64-character string"
  development:
    source: env_file
    example: "development-jwt-secret-key-32-chars-minimum"
  test:
    source: env_file
    example: "test-jwt-secret-key-32-chars-minimum"
error_handling:
  missing: "process.exit(1) with security error"
  weak: "console.warning but continue in dev/test"
```

#### INTERNAL_API_KEY
```yaml
required: true
services: [api, worker]
validation:
  - type: string
  - min_length: 32
  - max_length: 256
environments:
  production:
    source: railway_generated
    generation: "random 64-character string"
  staging:
    source: railway_generated
    generation: "random 64-character string"
  development:
    source: env_file
    example: "development-internal-api-key-32-chars"
  test:
    source: env_file
    example: "test-internal-api-key-32-chars"
error_handling:
  missing: "process.exit(1) with security error"
  weak: "console.warning but continue in dev/test"
```

#### DEFAULT_ADMIN_PASSWORD
```yaml
required: true
services: [api]
validation:
  - type: string
  - min_length: 8
  - max_length: 100
  - not_common: true
environments:
  production:
    source: railway_generated
    generation: "random 16-character string"
  staging:
    source: railway_generated
    generation: "random 16-character string"
  development:
    source: env_file
    example: "admin123"
    warning: "weak password for development only"
  test:
    source: env_file
    example: "testadmin123"
error_handling:
  missing: "console.warning, skip admin creation"
  weak: "console.error, skip admin creation"
```

### Service Configuration Variables

#### API_URL
```yaml
required: true
services: [ui]
validation:
  - type: url
  - pattern: "^https?://.*"
environments:
  production:
    source: railway_dynamic
    example: "https://ultra-agent-api-production.railway.app"
  staging:
    source: railway_dynamic
    example: "https://ultra-agent-api-staging.railway.app"
  development:
    source: env_file
    example: "http://localhost:3000"
  test:
    source: env_file
    example: "http://localhost:3001"
error_handling:
  missing: "process.exit(1) with error message"
  invalid: "process.exit(1) with validation error"
```

#### PORT
```yaml
required: false
services: [api, ui]
validation:
  - type: number
  - min: 1024
  - max: 65535
environments:
  production:
    source: railway_assigned
    behavior: "Railway assigns dynamic port"
  staging:
    source: railway_assigned
    behavior: "Railway assigns dynamic port"
  development:
    source: env_file
    api: 3000
    ui: 3001
    default: 3000
  test:
    source: env_file
    api: 3002
    ui: 3003
    default: 3002
error_handling:
  missing: "use Railway-assigned port or default 3000"
  invalid: "console.warning, use default"
```

---

## 🔌 ADAPTER ENVIRONMENT VARIABLES

### LLM Adapter Variables

#### OLLAMA_URL
```yaml
required: false
services: [worker]
validation:
  - type: url
  - pattern: "^https?://.*"
  - timeout_test: true
environments:
  production:
    source: user_provided
    example: "https://ollama.company.com"
    optional: true
  staging:
    source: user_provided
    example: "https://ollama-staging.company.com"
    optional: true
  development:
    source: env_file
    example: "http://localhost:11434"
    optional: true
  test:
    source: null
    behavior: "disabled in test environment"
adapter_behavior:
  available: "enhanced job processing with LLM"
  unavailable: "core job processing continues"
  error_handling: "graceful degradation, log warning"
```

### Docker Adapter Variables

#### DOCKER_HOST
```yaml
required: false
services: [worker]
validation:
  - type: docker_socket_path
  - pattern: "^unix://.*|^tcp://.*"
  - permission_check: true
environments:
  production:
    source: user_provided
    example: "unix:///var/run/docker.sock"
    optional: true
  staging:
    source: user_provided
    example: "unix:///var/run/docker.sock"
    optional: true
  development:
    source: env_file
    example: "unix:///var/run/docker.sock"
    optional: true
  test:
    source: null
    behavior: "disabled in test environment"
adapter_behavior:
  available: "container execution capabilities"
  unavailable: "commands queued for manual execution"
  error_handling: "graceful degradation, log warning"
```

---

## 📁 STORAGE ENVIRONMENT VARIABLES

#### DATA_DIR
```yaml
required: false
services: [api, worker]
validation:
  - type: file_path
  - writable: true
  - creatable: true
environments:
  production:
    source: railway_volume
    default: "/data/agent"
    persistence: "Railway persistent volume"
  staging:
    source: railway_volume
    default: "/data/agent"
    persistence: "Railway persistent volume"
  development:
    source: env_file
    api: "./data"
    worker: "./data"
    default: "./data"
  test:
    source: temp_directory
    default: "/tmp/ultra-agent-test"
    cleanup: "automatic cleanup after tests"
usage:
  - memory file storage
  - job output persistence
  - temporary file processing
error_handling:
  missing: "use default directory"
  not_writable: "process.exit(1) with permission error"
```

---

## 🌐 NETWORKING ENVIRONMENT VARIABLES

### Railway-Specific Variables

#### RAILWAY_ENVIRONMENT
```yaml
required: false
services: [all]
source: railway_provided
validation:
  - type: string
  - values: ["production", "staging"]
environments:
  production: "production"
  staging: "staging"
  development: null
  test: null
usage:
  - environment detection
  - feature toggles
  - logging configuration
```

#### RAILWAY_SERVICE_NAME
```yaml
required: false
services: [all]
source: railway_provided
validation:
  - type: string
environments:
  production: "service-specific"
  staging: "service-specific"
  development: null
  test: null
usage:
  - service identification
  - logging prefixes
  - monitoring labels
```

#### RAILWAY_PROJECT_ID
```yaml
required: false
services: [all]
source: railway_provided
validation:
  - type: string
environments:
  production: "project-id"
  staging: "project-id"
  development: null
  test: null
usage:
  - resource tagging
  - monitoring grouping
  - audit logging
```

---

## 🔍 ENVIRONMENT VALIDATION RULES

### Startup Validation Matrix

```javascript
// Validation Logic (IMMUTABLE)
function validateEnvironment(service) {
  const required = getRequiredVariables(service);
  const missing = required.filter(var => !process.env[var]);
  
  if (missing.length > 0) {
    console.error(`[CRITICAL] Missing required variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  
  const optional = getOptionalVariables(service);
  const invalid = optional.filter(var => !isValidFormat(var, process.env[var]));
  
  if (invalid.length > 0) {
    console.warn(`[WARNING] Invalid optional variables: ${invalid.join(', ')}`);
  }
  
  return { valid: true, warnings: invalid };
}
```

### Runtime Validation Rules

#### Connection Testing
```yaml
database_connection:
  test: "SELECT 1"
  timeout: 5000
  retry_count: 3
  failure_action: "process.exit(1)"
  
redis_connection:
  test: "PING"
  timeout: 3000
  retry_count: 3
  failure_action: "process.exit(1)"
  
api_connection:
  test: "GET /health"
  timeout: 5000
  retry_count: 3
  failure_action: "console.error, continue"
```

#### Security Validation
```yaml
jwt_secret:
  min_entropy: 3.0
  common_passwords: ["password", "admin", "123456"]
  failure_action: "console.error in production, warning in dev"
  
api_key:
  min_entropy: 3.0
  pattern: "^[a-zA-Z0-9_-]{32,}$"
  failure_action: "console.error in production, warning in dev"
  
admin_password:
  min_length: 8
  common_passwords: ["admin123", "password", "123456"]
  failure_action: "skip admin creation"
```

---

## 📊 ENVIRONMENT BEHAVIOR MATRIX

### Service Startup Behavior

| Environment | Database | Redis | Adapters | Logging | Security |
|-------------|----------|-------|----------|---------|----------|
| Production | Required | Required | Optional | Info+ | Maximum |
| Staging | Required | Required | Optional | Debug+ | High |
| Development | Required | Required | Optional | Debug | Medium |
| Test | Required | Required | Disabled | Test | Minimal |

### Feature Toggle Matrix

| Feature | Production | Staging | Development | Test |
|---------|------------|---------|-------------|------|
| LLM Adapter | ✅ | ✅ | ✅ | ❌ |
| Docker Adapter | ✅ | ✅ | ✅ | ❌ |
| Debug Logging | ❌ | ✅ | ✅ | ✅ |
| Error Details | Minimal | Detailed | Full | Full |
| Rate Limiting | ✅ | ✅ | ❌ | ❌ |
| Security Headers | ✅ | ✅ | ❌ | ❌ |

---

## 🚀 DEPLOYMENT ENVIRONMENT FLOWS

### Railway Deployment Flow

```yaml
production_deployment:
  1. Railway creates PostgreSQL instance
  2. Railway creates Redis instance
  3. Railway generates DATABASE_URL
  4. Railway generates REDIS_URL
  5. Railway generates JWT_SECRET
  6. Railway generates INTERNAL_API_KEY
  7. Railway generates DEFAULT_ADMIN_PASSWORD
  8. Railway assigns dynamic ports
  9. Services validate all required variables
  10. Services start and connect to infrastructure
  11. Health checks verify service readiness
  12. Traffic routed to running services
```

### Development Setup Flow

```yaml
development_setup:
  1. Developer clones repository
  2. Developer copies .env.example to .env
  3. Developer sets DATABASE_URL (local PostgreSQL)
  4. Developer sets REDIS_URL (local Redis)
  5. Developer sets JWT_SECRET (development key)
  6. Developer sets INTERNAL_API_KEY (development key)
  7. Developer sets DEFAULT_ADMIN_PASSWORD (admin123)
  8. Developer runs docker-compose up -d
  9. Services validate environment variables
  10. Services start with debug logging enabled
  11. Developer accesses UI at http://localhost:3001
```

### Test Environment Flow

```yaml
test_execution:
  1. Test runner starts test containers
  2. Test runner sets test environment variables
  3. Test runner starts PostgreSQL test instance
  4. Test runner starts Redis test instance
  5. Services validate test environment
  6. Services start with test configuration
  7. Test suite executes against test services
  8. Test runner cleans up test resources
```

---

## 🔧 ENVIRONMENT TROUBLESHOOTING

### Common Environment Issues

#### Missing Required Variables
```bash
# Symptom: Service exits immediately
Error: [CRITICAL] DATABASE_URL environment variable is required

# Solution: Set missing variable
export DATABASE_URL="postgres://user:pass@host:5432/db"
```

#### Invalid Connection Strings
```bash
# Symptom: Service exits after connection test
Error: [DATABASE] Connection test failed: connection refused

# Solution: Verify connection string format and accessibility
psql "postgres://user:pass@host:5432/db" -c "SELECT 1"
```

#### Weak Security Variables
```bash
# Symptom: Warning messages in logs
Warning: [SECURITY] Default admin password is too weak

# Solution: Use stronger password
export DEFAULT_ADMIN_PASSWORD="SecurePassword123!"
```

#### Adapter Unavailability
```bash
# Symptom: Adapter unavailable warnings
Warning: [ADAPTER] Ollama LLM unavailable

# Solution: Configure adapter or accept graceful degradation
export OLLAMA_URL="https://your-ollama-instance.com"
```

### Environment Debug Commands

```bash
# Check all environment variables
env | grep -E "(DATABASE_URL|REDIS_URL|JWT_SECRET|API_URL)"

# Test database connection
psql $DATABASE_URL -c "SELECT 1;"

# Test Redis connection
redis-cli -u $REDIS_URL ping

# Validate JWT secret format
echo $JWT_SECRET | wc -c

# Check service health
curl http://localhost:3000/health
```

---

## 📋 ENVIRONMENT CHECKLIST

### Pre-Deployment Checklist
- [ ] All required variables defined
- [ ] Connection strings tested and valid
- [ ] Security variables meet minimum requirements
- [ ] Adapter endpoints accessible (if used)
- [ ] Data directories writable
- [ ] Ports available and not conflicting
- [ ] Environment-specific configurations applied

### Post-Deployment Checklist
- [ ] Services start without errors
- [ ] Database migrations execute successfully
- [ ] Redis connections established
- [ ] Health checks passing
- [ ] Authentication working
- [ ] Job processing functional
- [ ] WebSocket connections established
- [ ] Adapter status reporting correctly

---

**This environment matrix is the single source of truth for all Ultra Agent OS environment configurations. Any deviation must be documented and approved through the governance process.**

**Last Updated:** 2025-01-31  
**Environment Matrix Version:** 1.0.0

# Rate Limiting Rollback Plan

## Overview

This document provides step-by-step procedures for rolling back the professional rate limiting implementation to the original naive `express-rate-limit` configuration if needed.

## Rollback Triggers

### Critical Issues Requiring Immediate Rollback
1. **System instability** - Increased error rates or crashes
2. **Performance degradation** - Latency increases >50ms
3. **Authentication failures** - Users unable to access system
4. **Data corruption** - Redis or database integrity issues
5. **Memory leaks** - Unbounded memory growth

### Soft Issues Requiring Consideration
1. **Rate limit too aggressive** - Users experiencing excessive queuing
2. **Circuit breaker false positives** - Ollama unnecessarily blocked
3. **Queue processing delays** - Requests stuck in queues
4. **Metrics collection overhead** - Performance impact from monitoring

## Rollback Procedures

### Emergency Rollback (Immediate)

#### Step 1: Disable New Rate Limiting
```bash
# Backup current server.js
cp apps/api/src/server.js apps/api/src/server.js.backup

# Remove new rate limiting imports and middleware
sed -i '/const { RateLimitOrchestrator } = require/d' apps/api/src/server.js
sed -i '/const rateLimitOrchestrator = new RateLimitOrchestrator/d' apps/api/src/server.js
sed -i '/app.use.*rateLimitOrchestrator.getMiddleware/,+1d' apps/api/src/server.js
```

#### Step 2: Restore Original Rate Limiting
```bash
# Add original express-rate-limit
npm install express-rate-limit

# Add to server.js imports
sed -i '11a const rateLimit = require('"'express-rate-limit'"');' apps/api/src/server.js

# Add original rate limiting configuration
sed -i '/app.use(express.json());/a\\n// Rate limiting\nconst limiter = rateLimit({\n  windowMs: 15 * 60 * 1000, // 15 minutes\n  max: 100 // limit each IP to 100 requests per windowMs\n});\napp.use(limiter);' apps/api/src/server.js
```

#### Step 3: Remove Worker Circuit Breaker
```bash
# Backup current worker.js
cp apps/worker/src/worker.js apps/worker/src/worker.js.backup

# Remove circuit breaker imports and usage
sed -i '/const { CircuitBreaker } = require/d' apps/worker/src/worker.js
sed -i '/const ollamaCircuitBreaker = new CircuitBreaker/d' apps/worker/src/worker.js
sed -i '/await ollamaCircuitBreaker.initialize/,+8d' apps/worker/src/worker.js
```

#### Step 4: Restore Original Ollama Call
```bash
# Replace circuit breaker protected call with original
cat > /tmp/ollama_restore.txt << 'EOF'
// Adapter: Ollama LLM Integration
// Type: PLUGGABLE_ADAPTER
// Status: Graceful fallback when unavailable
async function callLLM(prompt, context = {}) {
  try {
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: 'llama3.2',
      prompt: `Context: ${JSON.stringify(context)}\n\nUser: ${prompt}\n\nAssistant:`,
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 500
      }
    });
    return response.data.response;
  } catch (error) {
    console.log('[ADAPTER] Ollama LLM unavailable:', error.message);
    return null; // Explicit null for adapter unavailable
  }
}
EOF

# Replace the function in worker.js
sed -i '/\/\/ Adapter: Ollama LLM Integration/,/^}$/c\
'"$(cat /tmp/ollama_restore.txt)" apps/worker/src/worker.js
```

#### Step 5: Restart Services
```bash
# Restart API and worker services
docker-compose restart api worker
# or if running directly:
pkill -f "node.*server.js"
pkill -f "node.*worker.js"
npm run start:api &
npm run start:worker &
```

### Graceful Rollback (Planned)

#### Phase 1: Prepare Rollback Environment
```bash
# Create rollback branch
git checkout -b rollback-rate-limit
git add .
git commit -m "Backup before rate limit rollback"

# Tag current state
git tag rate-limit-v2.0-backup
```

#### Phase 2: Test Rollback in Staging
```bash
# Deploy to staging environment
docker-compose -f docker-compose.staging.yml down
git checkout main  # Original implementation
docker-compose -f docker-compose.staging.yml up -d

# Run smoke tests
npm run test:smoke
npm run test:load
```

#### Phase 3: Production Rollback
```bash
# Schedule maintenance window
echo "Scheduled rollback at $(date +%Y-%m-%d_%H:%M:%S)"

# Backup current state
docker-compose logs api > logs/api-before-rollback.log
docker-compose logs worker > logs/worker-before-rollback.log

# Execute rollback
git checkout main
docker-compose down
docker-compose up -d

# Verify system health
curl -f http://localhost:3000/health
curl -f http://localhost:3000/api/adapters/status
```

## Rollback Validation

### Health Checks
```bash
# Check API health
curl -s http://localhost:3000/health | jq '.status'

# Check worker status
docker-compose logs worker | tail -20

# Check Redis connectivity
redis-cli ping

# Check database connectivity
docker-compose exec api npm run test:db
```

### Functionality Tests
```bash
# Test authentication
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Test job creation
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"test message"}'

# Test rate limiting (should return 429)
for i in {1..150}; do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/health
done | grep 429 | wc -l
```

### Performance Validation
```bash
# Load test with original rate limiting
npm run test:load:original

# Compare metrics
npm run metrics:compare

# Verify no performance regression
npm run test:performance
```

## Data Cleanup

### Redis Cleanup
```bash
# Remove rate limit data
redis-cli --scan --pattern "rate_limit:*" | xargs redis-cli del
redis-cli --scan --pattern "circuit_breaker:*" | xargs redis-cli del
redis-cli --scan --pattern "rate_limit_queue:*" | xargs redis-cli del

# Verify cleanup
redis-cli --scan --pattern "rate_limit:*" | wc -l
redis-cli --scan --pattern "circuit_breaker:*" | wc -l
```

### File Cleanup
```bash
# Remove rate limiter file
rm lib/rate-limiter.js

# Remove reports (optional)
rm reports/20_RATE_LIMIT_POLICY.md
rm reports/21_RATE_LIMIT_IMPLEMENTATION.md
# Keep this rollback file for reference
```

## Rollback Verification Checklist

### System Health
- [ ] API server starts without errors
- [ ] Worker starts without errors
- [ ] Database connectivity confirmed
- [ ] Redis connectivity confirmed
- [ ] Health endpoint returns 200

### Functionality
- [ ] Authentication works correctly
- [ ] Job creation and processing works
- [ ] Memory operations work
- [ ] Workspace operations work
- [ ] Adapter status endpoint works

### Rate Limiting
- [ ] Original rate limiting active (100 req/15min per IP)
- [ ] Rate limit headers present
- [ ] 429 responses on limit exceeded
- [ ] No queuing behavior

### Performance
- [ ] Response times <100ms for light endpoints
- [ ] No memory leaks detected
- [ ] CPU usage normal
- [ ] No error spikes in logs

### Ollama Integration
- [ ] Ollama calls work without circuit breaker
- [ ] Graceful fallback when Ollama unavailable
- [ ] No timeout errors
- [ ] Worker processes jobs correctly

## Post-Rollback Actions

### Monitoring
```bash
# Monitor system for 24 hours
npm run monitor:production

# Check error rates
npm run metrics:errors

# Verify user experience
npm run test:user-experience
```

### Documentation
```bash
# Document rollback reasons
echo "Rollback executed at $(date)" >> rollback.log
echo "Reason: [SPECIFY_REASON]" >> rollback.log
echo "Impact: [DESCRIBE_IMPACT]" >> rollback.log

# Update incident report
npm run incident:update
```

### Future Improvements
```bash
# Create improvement tickets
npm run ticket:create --type="improvement" --title="Rate limiting v2.1" --description="Address rollback issues"

# Schedule review
npm run schedule:review --topic="Rate limiting architecture"
```

## Emergency Contacts

### Primary Contacts
- **System Administrator**: [CONTACT_INFO]
- **Development Team**: [CONTACT_INFO]
- **Operations Team**: [CONTACT_INFO]

### Escalation
- **Level 1**: Development team
- **Level 2**: System administrator
- **Level 3**: Management

## Rollback Decision Tree

```
System Issue Detected?
├── Yes -> Is it critical?
│   ├── Yes -> Execute Emergency Rollback
│   └── No -> Can it be fixed quickly?
│       ├── Yes -> Implement hotfix
│       └── No -> Execute Graceful Rollback
└── No -> Monitor and continue
```

## Risk Assessment

### Rollback Risks
- **Service interruption**: 5-10 minutes during restart
- **Data loss**: Minimal (rate limit data only)
- **User impact**: Temporary service unavailable
- **Configuration drift**: Possible if manual changes made

### Mitigation Strategies
- **Maintenance window**: Schedule during low traffic
- **Backup current state**: Full system backup before rollback
- **Test in staging**: Validate rollback procedure
- **Monitor closely**: Watch for issues after rollback

## Success Criteria

Rollback considered successful when:
- All services start without errors
- Original functionality restored
- Performance metrics return to baseline
- No user complaints received
- System stable for 1 hour

## Lessons Learned

Document lessons learned after rollback:
- What caused the rollback?
- What could have been prevented?
- How to improve the implementation?
- What monitoring was missing?

## Future Implementation

If rollback is executed, future rate limiting improvements should:
- Address the rollback causes
- Include better testing
- Have gradual rollout strategy
- Include more comprehensive monitoring
- Have better rollback automation

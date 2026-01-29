# Platform Context Map

## Project Identity Classification

**PROJECT TYPE**: AI Agent Platform Core  
**STAGE**: Core Platform Stabilization  
**SCOPE**: Platform foundation, not production SaaS

## Core vs Adapter Analysis

### 🏗️ CORE PLATFORM COMPONENTS

#### API Service (`apps/api`)
**Responsibility**: Platform orchestration and coordination
- ✅ **Core**: Authentication system (JWT, bcrypt)
- ✅ **Core**: Job queue management (Redis)
- ✅ **Core**: WebSocket real-time communication
- ✅ **Core**: File-based memory system
- ✅ **Core**: Rate limiting and security headers
- ⚠️ **Adapter**: Ollama LLM integration (external dependency)

#### Worker Service (`apps/worker`)
**Responsibility**: Background job processing
- ✅ **Core**: Redis job queue processing
- ✅ **Core**: Job state management and persistence
- ✅ **Core**: Stuck job recovery mechanism
- ✅ **Core**: File-based memory operations
- ⚠️ **Adapter**: Docker execution environment
- ⚠️ **Adapter**: Ollama LLM calls

#### UI Service (`apps/ui`)
**Responsibility**: Platform interface and monitoring
- ✅ **Core**: Static file serving
- ✅ **Core**: Dynamic API configuration injection
- ✅ **Core**: Real-time log streaming interface
- ⚠️ **Adapter**: Assumes execution provider availability

### 🔌 PLUGGABLE ADAPTERS

#### Ollama LLM Adapter
**Type**: External AI Runtime Provider
**Current Implementation**: Direct HTTP calls to `http://ollama:11434`
**Classification**: PLUGGABLE_ADAPTER
**Status**: Intentional but incomplete
**Impact**: Non-critical - has fallback logic

#### Docker Execution Adapter
**Type**: Container Runtime Provider  
**Current Implementation**: Dockerode library with socket access
**Classification**: PLUGGABLE_ADAPTER
**Status**: Intentional stub (simulated execution)
**Impact**: Non-critical - worker can idle safely

#### PostgreSQL Database Adapter
**Type**: Persistent Storage Provider
**Current Implementation**: Configured but not used
**Classification**: OUT_OF_SCOPE_FOR_CORE (currently)
**Status**: Redis used instead for core functionality
**Impact**: No impact on core platform operation

## External Dependencies Mapping

### Critical Dependencies (Core Platform)
- **Redis**: Job queue, caching, session storage ✅
- **Node.js Runtime**: Platform execution environment ✅
- **File System**: Memory persistence ✅

### Optional Dependencies (Adapters)
- **Ollama**: LLM inference ⚠️ (pluggable)
- **Docker**: Container execution ⚠️ (pluggable)
- **PostgreSQL**: Persistent storage ⚠️ (out of scope)

## Service Interaction Patterns

### Core Platform Flow
1. **API Service** receives authenticated requests
2. **API Service** queues jobs via Redis
3. **Worker Service** processes jobs from Redis
4. **UI Service** displays real-time status via WebSocket

### Adapter Integration Points
1. **LLM Calls**: Worker → Ollama (with fallback)
2. **Container Execution**: Worker → Docker (simulated)
3. **Database**: Configured but Redis used instead

## Current Implementation State

### What Works (Core Platform)
- ✅ Authentication and authorization
- ✅ Job queuing and processing
- ✅ Real-time communication
- ✅ File-based memory system
- ✅ Basic error handling
- ✅ Service discovery and health checks

### What's Intentionally Incomplete (Adapters)
- ⚠️ LLM integration (has graceful fallback)
- ⚠️ Docker execution (intentionally simulated)
- ⚠️ Database persistence (Redis used instead)

### What's Out of Scope
- ❌ Production SaaS features
- ❌ Multi-tenancy
- ❌ Advanced security hardening
- ❌ Performance optimization

## Architecture Intent vs Implementation

### Intent: AI Agent Platform Core
**Reality**: Core platform functional with adapter stubs

### Intent: Pluggable Runtime Providers
**Reality**: Docker and Ollama adapters present but guarded

### Intent: Development-First Platform
**Reality**: Suitable for development and testing

## Next Phase Implications

### Core Platform is STABLE
- Authentication works
- Job processing works
- Real-time communication works
- File persistence works

### Adapters Need ALIGNMENT
- Clear labeling required
- Graceful failure handling needed
- UI expectation alignment required

### Deployment Context is COMPATIBLE
- Railway configuration matches apps/ structure
- No hardcoded deployment assumptions
- Services can start without adapters

## Classification Summary

| Component | Type | Status | Production Ready |
|-----------|------|--------|------------------|
| Authentication | CORE | ✅ COMPLETE | Yes (with env secrets) |
| Job Queue | CORE | ✅ COMPLETE | Yes |
| WebSocket Comm | CORE | ✅ COMPLETE | Yes |
| File Memory | CORE | ✅ COMPLETE | Yes |
| Ollama LLM | ADAPTER | ⚠️ INCOMPLETE | Intentionally |
| Docker Runtime | ADAPTER | ⚠️ STUB | Intentionally |
| PostgreSQL | OUT_OF_SCOPE | ❌ NOT USED | Intentionally |

**CONCLUSION**: Core platform is stable and functional. Adapters are intentionally incomplete and should be treated as pluggable components, not bugs.

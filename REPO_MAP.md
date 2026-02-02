# REPO_MAP - Current Architecture Analysis
**Date:** 2026-02-02T01:50:00+03:00
**Orchestration:** ONE_PROMPT_TOTAL_ENTERPRISE_REBUILD_DASHBOARD_LINK_VALIDATE_AND_HARD_FREEZE

## 📊 CURRENT STRUCTURE ANALYSIS

### **🏗️ Architecture Type: SINGLE PROCESS (VIOLATION)**
**Current State:** Monolithic single-process architecture  
**Issue:** API server includes WebSocket server and UI serving - violates `no_single_process_architecture` guardrail

```
┌─────────────────────────────────────────────────────────────┐
│                    SINGLE PROCESS VIOLATION                    │
├─────────────────────────────────────────────────────────────┤
│  API Server (Port 3000)                                     │
│  ├── Express REST API                                        │
│  ├── WebSocket Server (embedded)                             │
│  ├── UI Static Serving (embedded)                            │
│  └── All Business Logic                                      │
├─────────────────────────────────────────────────────────────┤
│  Worker Service (Separate)                                   │
│  UI Service (Separate but serves static files)               │
│  PostgreSQL + Redis (Data Layer)                             │
└─────────────────────────────────────────────────────────────┘
```

### **🔍 Dependency Graph**

#### **Current Services & Ports**
| Service | Port | Type | Status |
|---------|------|------|--------|
| API Server | 3000 | REST + WS + UI | ❌ Mixed concerns |
| Worker | - | Background processor | ✅ Separate |
| UI Service | 4000 | Static files | ✅ Separate |
| PostgreSQL | 5432 | Database | ✅ Separate |
| Redis | 6379 | Queue/Cache | ✅ Separate |

#### **Service Dependencies**
```
API Server (3000)
├── PostgreSQL (5432) - Direct connection
├── Redis (6379) - Direct connection
├── WebSocket Server (embedded)
└── UI Static Serving (embedded)

Worker Service
├── PostgreSQL (5432) - Direct connection
└── Redis (6379) - Queue processing

UI Service (4000)
└── API Server (3000) - API calls
```

### **📁 Directory Structure**

#### **Apps Directory**
```
apps/
├── api/                    # Main API service (MONOLITHIC)
│   ├── src/
│   │   ├── server.js       # Single entry point with WS + UI
│   │   ├── core/
│   │   │   ├── app.js       # Express app with UI routes
│   │   │   └── init.js      # Initialization
│   │   ├── services/
│   │   │   ├── redis.service.js
│   │   │   ├── websocket.service.js  # EMBEDDED
│   │   │   └── ui.service.js        # EMBEDDED
│   │   ├── routes/         # API routes
│   │   ├── controllers/    # API controllers
│   │   └── middleware/     # Express middleware
│   └── Dockerfile
├── ui/                     # Frontend service
│   ├── src/
│   │   ├── server.js       # Express static server
│   │   ├── dashboard.html  # Unified dashboard
│   │   ├── dashboard.js    # Dashboard logic
│   │   ├── api-client.js   # API client
│   │   └── auth-gate.js    # Authentication
│   └── Dockerfile
└── worker/                 # Background processor
    ├── src/
    │   └── worker.js
    └── Dockerfile
```

#### **Key Issues Identified**
1. **WebSocket embedded in API server** - Should be separate service
2. **UI serving embedded in API server** - Should be separate service  
3. **Single process handling multiple concerns** - Violates enterprise architecture
4. **No reverse proxy** - Direct service exposure

---

## 🎯 CURRENT API SURFACE

### **API Endpoints (from API_LIST.md)**
```
GET /                    - Root status
GET /health              - System health
POST /api/auth/login     - Authentication
POST /api/chat           - Create job
GET /api/jobs            - List jobs
GET /api/jobs/:id        - Get job
POST /api/memory/:file   - Write memory
GET /api/memory/:file    - Read memory
GET /api/memory/          - Get workspace
GET /api/workspace       - Alternative workspace
GET /api/adapters/status - Adapter status
POST /api/adapters/test  - Test adapter
GET /api/admin/tenants   - List tenants
POST /api/admin/tenants  - Create tenant
```

**Total:** 14 endpoints  
**Status:** ✅ All functional (from previous validation)

### **WebSocket Endpoints**
```
WebSocket Server (embedded in API)
├── /ws (default route)
├── Job status updates
└── System notifications
```

---

## 🖥️ CURRENT DASHBOARD ANALYSIS

### **Dashboard Structure**
```
apps/ui/src/dashboard.html (UNIFIED)
├── Navigation: Overview | Jobs | Memory | Admin
├── Real-time API integration
├── JWT authentication
└── WebSocket connections
```

### **Current Screens (4 unified)**
1. **Overview** - System health, adapter status, recent jobs
2. **Jobs** - Job management, status monitoring
3. **Memory** - Memory file CRUD operations
4. **Admin** - Tenant management, settings

**Status:** ✅ Already unified (from previous orchestration)

---

## 🚨 CRITICAL ISSUES FOR ENTERPRISE REBUILD

### **🔴 MUST FIX (Guardrail Violations)**
1. **Single Process Architecture** - API server includes WS + UI
2. **No Service Separation** - Mixed concerns in single container
3. **No Reverse Proxy** - Services exposed directly
4. **No Enterprise Observability** - Basic logging only

### **🟡 SHOULD IMPROVE**
1. **No Zod Validation** - Basic input validation only
2. **No Structured Logging** - Console.log only
3. **No Metrics Collection** - No Prometheus/OpenTelemetry
4. **No Health Checks per Service** - Basic health endpoint only

### **🟢 ALREADY GOOD**
1. **Docker Compose Setup** - Multi-container ready
2. **Database Separation** - PostgreSQL + Redis separate
3. **Worker Separation** - Background processing separate
4. **Dashboard Unification** - Already completed

---

## 📋 ENTERPRISE ARCHITECTURE TARGET

### **Required Service Separation**
```
┌─────────────────────────────────────────────────────────────┐
│                    ENTERPRISE TARGET ARCHITECTURE              │
├─────────────────────────────────────────────────────────────┤
│  nginx (Port 80/443) - Reverse Proxy & Static Serving      │
│  ├── / → UI Service (static files)                         │
│  ├── /api/* → API Service (REST only)                      │
│  └── /ws/* → WebSocket Service                              │
├─────────────────────────────────────────────────────────────┤
│  api-service (Port 3001) - REST API Only                  │
│  ├── Express routes                                         │
│  ├── Zod validation middleware                              │
│  ├── Structured logging                                     │
│  └── Health checks                                          │
├─────────────────────────────────────────────────────────────┤
│  ws-service (Port 3002) - WebSocket Only                   │
│  ├── WebSocket server                                       │
│  ├── Redis pub/sub                                          │
│  └── Real-time events                                       │
├─────────────────────────────────────────────────────────────┤
│  ui-service (Port 3003) - Static Build Only               │
│  ├── nginx static serving                                   │
│  ├── Built assets                                           │
│  └── No server-side logic                                   │
├─────────────────────────────────────────────────────────────┤
│  worker-service (Port 3004) - Background Processing        │
│  ├── Job queue processing                                   │
│  ├── Retry policies                                         │
│  └── Dead letter handling                                   │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL + Redis (Data Layer)                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 NEXT STEPS FOR PHASE 1

### **Immediate Actions Required**
1. **Extract WebSocket Service** - Move to separate container
2. **Remove UI from API Server** - API should be REST-only
3. **Create Reverse Proxy** - nginx for routing
4. **Separate UI Build** - Static build + nginx serving
5. **Add Service Discovery** - Clear port assignments

### **Port Allocation Plan**
- nginx: 80 (public)
- api-service: 3001 (internal)
- ws-service: 3002 (internal)
- ui-service: 3003 (internal)
- worker-service: 3004 (internal)

---

## 📊 CURRENT STATE SUMMARY

| Aspect | Current | Target | Status |
|--------|---------|--------|--------|
| Architecture | Single Process | Multi-Service | ❌ Violation |
| API Separation | Mixed | REST-only | ❌ Needs Fix |
| WebSocket | Embedded | Separate Service | ❌ Needs Fix |
| UI Serving | Embedded + Separate | Static Only | ❌ Needs Fix |
| Dashboard | Unified | Unified | ✅ Good |
| Docker | Multi-container | Multi-container | ✅ Good |
| Database | Separate | Separate | ✅ Good |

---

**REPO_MAP STATUS:** ✅ **COMPLETE** - Current architecture analyzed and enterprise rebuild requirements identified

**Critical Finding:** Current architecture violates `no_single_process_architecture` guardrail and requires complete service separation for enterprise rebuild.

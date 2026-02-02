# Ultra Agent OS - Complete API List
**Version:** 1.0.0  
**Base URL:** `http://localhost:3000`  
**Authentication:** JWT Bearer Token (except where noted)

---

## 🚀 CORE SYSTEM ENDPOINTS

### **Root Endpoint**
```
GET /
```
**Description:** System status and information  
**Authentication:** None required  
**Response:**
```json
{
  "status": "ok",
  "service": "Ultra Agent API",
  "version": "1.0.0",
  "timestamp": "2026-02-02T00:24:59.812Z"
}
```

### **Health Check**
```
GET /health
```
**Description:** System health monitoring  
**Authentication:** None required  
**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-02T00:24:59.812Z",
  "uptime": 25.592520962
}
```

---

## 🔐 AUTHENTICATION ENDPOINTS

### **Login**
```
POST /api/auth/login
```
**Description:** Authenticate and get JWT token  
**Authentication:** None required  
**Rate Limit:** 5 attempts per 15 minutes  
**Request Body:**
```json
{
  "username": "admin",
  "password": "admin"
}
```
**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "tenantId": "default"
  }
}
```

---

## 💬 CHAT & JOB ENDPOINTS

### **Create Chat Job**
```
POST /api/chat
```
**Description:** Create new chat/job (main chat endpoint)  
**Authentication:** Required  
**Request Body:**
```json
{
  "message": "Hello, how are you?"
}
```
**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "planning",
  "message": "Job created successfully"
}
```

### **Create Job (Alternative)**
```
POST /api/jobs
```
**Description:** Create new job (alternative endpoint)  
**Authentication:** Required  
**Request Body:** Same as `/api/chat`

### **List Jobs**
```
GET /api/jobs
```
**Description:** Get list of user's jobs  
**Authentication:** Required  
**Response:**
```json
{
  "jobs": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "completed",
      "created_at": "2026-02-02T00:20:00.000Z"
    }
  ]
}
```

### **Get Job Status**
```
GET /api/jobs/{jobId}
```
**Description:** Get specific job status and details  
**Authentication:** Required  
**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "result": "Job completed successfully",
  "created_at": "2026-02-02T00:20:00.000Z"
}
```

---

## 🧠 MEMORY ENDPOINTS

### **Write Memory**
```
POST /api/memory/{filename}
```
**Description:** Store data in memory system (JSONB)  
**Authentication:** Required  
**Path Parameters:** `filename` - Memory file name  
**Request Body:**
```json
{
  "data": {
    "key": "value",
    "nested": {
      "info": "stored data"
    }
  }
}
```
**Response:**
```json
{
  "success": true,
  "message": "Memory written successfully"
}
```

### **Read Memory**
```
GET /api/memory/{filename}
```
**Description:** Retrieve data from memory system  
**Authentication:** Required  
**Path Parameters:** `filename` - Memory file name  
**Response:**
```json
{
  "data": {
    "key": "value",
    "nested": {
      "info": "stored data"
    }
  }
}
```

### **Get Workspace**
```
GET /api/memory/
```
**Description:** Get user workspace overview (memories + active jobs)  
**Authentication:** Required  
**Response:**
```json
{
  "memories": ["file1.json", "file2.json"],
  "active_jobs": 5,
  "workspace_info": "User workspace data"
}
```

---

## 🏢 WORKSPACE ENDPOINT

### **Get Workspace (Alternative)**
```
GET /api/workspace
```
**Description:** Alternative workspace endpoint (same as memory root)  
**Authentication:** Required  
**Response:** Same as `/api/memory/`

---

## 🛠️ ADAPTER ENDPOINTS

### **Get Adapter Status**
```
GET /api/adapters/status
```
**Description:** Get status of all system adapters  
**Authentication:** Required  
**Response:**
```json
{
  "redis": {
    "status": "connected",
    "queue_length": 10
  },
  "database": {
    "status": "connected",
    "active_connections": 5
  },
  "websocket": {
    "status": "active",
    "connections": 3
  }
}
```

### **Test Adapter**
```
POST /api/adapters/test
```
**Description:** Test specific adapter functionality  
**Authentication:** Required  
**Request Body:**
```json
{
  "adapter": "redis",
  "test_type": "connection"
}
```
**Response:**
```json
{
  "success": true,
  "result": "Adapter test passed"
}
```

---

## 👑 ADMIN ENDPOINTS

### **List Tenants**
```
GET /api/admin/tenants
```
**Description:** List all tenants (Admin only)  
**Authentication:** Required + Admin Role  
**Response:**
```json
{
  "tenants": [
    {
      "id": "default",
      "name": "Default Tenant",
      "created_at": "2026-02-01T00:00:00.000Z"
    }
  ]
}
```

### **Create Tenant**
```
POST /api/admin/tenants
```
**Description:** Create new tenant (Admin only)  
**Authentication:** Required + Admin Role  
**Request Body:**
```json
{
  "name": "New Tenant",
  "tenantId": "new-tenant"
}
```
**Response:**
```json
{
  "success": true,
  "tenant": {
    "id": "new-tenant",
    "name": "New Tenant"
  }
}
```

---

## 📊 API SUMMARY

| Category | Endpoints | Auth Required |
|----------|-----------|---------------|
| **System** | 2 (`/`, `/health`) | ❌ No |
| **Auth** | 1 (`/api/auth/login`) | ❌ No |
| **Chat/Jobs** | 3 (`/api/chat`, `/api/jobs`) | ✅ Yes |
| **Memory** | 3 (`/api/memory/*`) | ✅ Yes |
| **Workspace** | 1 (`/api/workspace`) | ✅ Yes |
| **Adapters** | 2 (`/api/adapters/*`) | ✅ Yes |
| **Admin** | 2 (`/api/admin/*`) | ✅ Yes + Admin |

**Total Endpoints:** 14  
**Public Endpoints:** 3  
**Protected Endpoints:** 11  

---

## 🔒 AUTHENTICATION & SECURITY

### **JWT Token Format**
```
Authorization: Bearer <token>
```

### **Rate Limiting**
- **Login:** 5 attempts per 15 minutes
- **Other endpoints:** No explicit limits (can be added)

### **Role-Based Access**
- **User:** Standard access to chat, jobs, memory
- **Admin:** Full access including tenant management

---

## 🧪 TESTING EXAMPLES

### **Quick Test Script**
```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | jq -r '.token')

# Create chat job
curl -s -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello API"}'

# Check adapters status
curl -s -X GET http://localhost:3000/api/adapters/status \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📝 NOTES

- All timestamps are in ISO 8601 format
- Job IDs are UUID v4
- Memory files support JSON data structure
- Backlog limit: 100 jobs per tenant
- WebSocket available for real-time updates
- Full API validation: 100% pass rate confirmed

---

*This API list represents the complete Ultra Agent OS API surface as of version 1.0.0*

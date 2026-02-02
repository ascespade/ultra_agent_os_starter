# MEMORY SPEC - Enterprise Memory System Specification
**Date:** 2026-02-02T02:10:00+03:00
**Orchestration:** ONE_PROMPT_TOTAL_ENTERPRISE_REBUILD_DASHBOARD_LINK_VALIDATE_AND_HARD_FREEZE

## 🎯 OBJECTIVE
Implement enterprise-grade memory system with full CRUD operations, search capabilities, retention policies, and metadata indexing.

---

## 📊 MEMORY SYSTEM ARCHITECTURE

### **🗄️ Storage Layer**
**Primary Storage:** PostgreSQL  
**Cache Layer:** Redis  
**File System:** Persistent file storage  
**Indexing:** Full-text search capabilities

### **🔍 Search Capabilities**
- Full-text search across memory content
- Metadata-based filtering
- Tag-based categorization
- Date range queries
- Tenant isolation

### **⏰ Retention Policies**
- Automatic cleanup based on age
- Size-based retention limits
- Manual memory management
- Archive capabilities

---

## 📋 MEMORY DATA MODEL

### **Memory Record Structure**
```sql
CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(50) NOT NULL,
  user_id INTEGER NOT NULL,
  filename VARCHAR(255) NOT NULL,
  content JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  size_bytes INTEGER DEFAULT 0,
  access_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_archived BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_memories_tenant_id ON memories(tenant_id);
CREATE INDEX idx_memories_user_id ON memories(user_id);
CREATE INDEX idx_memories_filename ON memories(filename);
CREATE INDEX idx_memories_tags ON memories USING GIN(tags);
CREATE INDEX idx_memories_content ON memories USING GIN(to_tsvector('english', content::text));
CREATE INDEX idx_memories_created_at ON memories(created_at);
CREATE INDEX idx_memories_expires_at ON memories(expires_at);
```

### **Memory Metadata Structure**
```json
{
  "type": "user_preference",
  "source": "manual_upload",
  "version": "1.0",
  "description": "User preference data",
  "schema_version": "1.0",
  "encryption": "none",
  "compression": "gzip",
  "checksum": "sha256:abc123..."
}
```

---

## 🔧 MEMORY OPERATIONS

### **✅ CRUD Operations**

#### **Create Memory**
```javascript
POST /api/memory/{filename}
{
  "data": { ... },
  "metadata": { ... },
  "tags": ["tag1", "tag2"],
  "expires_at": "2026-03-02T02:10:00Z"
}

Response:
{
  "success": true,
  "memory": {
    "id": "uuid",
    "filename": "user_preferences.json",
    "size_bytes": 1024,
    "created_at": "2026-02-02T02:10:00Z"
  }
}
```

#### **Read Memory**
```javascript
GET /api/memory/{filename}

Response:
{
  "data": { ... },
  "metadata": { ... },
  "tags": ["tag1", "tag2"],
  "created_at": "2026-02-02T02:10:00Z",
  "updated_at": "2026-02-02T02:10:00Z",
  "access_count": 5,
  "last_accessed": "2026-02-02T02:10:00Z"
}
```

#### **Update Memory**
```javascript
PUT /api/memory/{filename}
{
  "data": { ... },
  "metadata": { ... },
  "tags": ["tag1", "tag2", "tag3"]
}

Response:
{
  "success": true,
  "memory": {
    "id": "uuid",
    "updated_at": "2026-02-02T02:10:00Z"
  }
}
```

#### **Delete Memory**
```javascript
DELETE /api/memory/{filename}

Response:
{
  "success": true,
  "message": "Memory deleted successfully"
}
```

### **✅ Search Operations**

#### **Full-Text Search**
```javascript
GET /api/memory/search?q=keyword&limit=20&page=1

Response:
{
  "results": [
    {
      "id": "uuid",
      "filename": "search_result.json",
      "snippet": "...matching content...",
      "score": 0.95,
      "metadata": { ... }
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

#### **Tag-Based Search**
```javascript
GET /api/memory/search?tags=tag1,tag2&limit=20&page=1

Response:
{
  "results": [...],
  "total": 15,
  "page": 1,
  "limit": 20
}
```

#### **Metadata Search**
```javascript
GET /api/memory/search?metadata.type=user_preference&limit=20&page=1

Response:
{
  "results": [...],
  "total": 8,
  "page": 1,
  "limit": 20
}
```

### **✅ Workspace Operations**

#### **Get Workspace Overview**
```javascript
GET /api/memory/workspace

Response:
{
  "memories": [
    {
      "id": "uuid",
      "filename": "config.json",
      "size_bytes": 512,
      "created_at": "2026-02-02T02:10:00Z",
      "tags": ["config"],
      "metadata": { "type": "configuration" }
    }
  ],
  "total_count": 25,
  "total_size": 1048576,
  "active_jobs": 3,
  "workspace_info": {
    "tenant_id": "default",
    "user_id": 1,
    "created_at": "2026-01-01T00:00:00Z"
  }
}
```

---

## 🗂️ MEMORY MANAGEMENT

### **✅ Retention Policies**

#### **Age-Based Retention**
```javascript
POST /api/admin/memory/retention/age
{
  "days": 30,
  "dry_run": true
}

Response:
{
  "affected_memories": 15,
  "total_size_freed": 5242880,
  "dry_run": true
}
```

#### **Size-Based Retention**
```javascript
POST /api/admin/memory/retention/size
{
  "max_size_bytes": 104857600,
  "dry_run": false
}

Response:
{
  "affected_memories": 8,
  "total_size_freed": 20971520,
  "dry_run": false
}
```

#### **Tag-Based Retention**
```javascript
POST /api/admin/memory/retention/tags
{
  "tags": ["temp", "cache"],
  "dry_run": false
}

Response:
{
  "affected_memories": 12,
  "total_size_freed": 31457280,
  "dry_run": false
}
```

### **✅ Archive Operations**

#### **Archive Memory**
```javascript
POST /api/memory/{filename}/archive

Response:
{
  "success": true,
  "archived_at": "2026-02-02T02:10:00Z"
}
```

#### **Restore Memory**
```javascript
POST /api/memory/{filename}/restore

Response:
{
  "success": true,
  "restored_at": "2026-02-02T02:10:00Z"
}
```

---

## 🔍 SEARCH IMPLEMENTATION

### **✅ Full-Text Search**
```javascript
// PostgreSQL full-text search
const searchQuery = `
  SELECT 
    id, filename, content, metadata, tags, created_at, updated_at,
    ts_rank(search_vector, plainto_tsquery($1)) as score,
    ts_headline('english', content::text, plainto_tsquery($1)) as snippet
  FROM memories 
  WHERE 
    tenant_id = $2 AND 
    user_id = $3 AND
    is_deleted = false AND
    search_vector @@ plainto_tsquery($1)
  ORDER BY score DESC
  LIMIT $4 OFFSET $5
`;
```

### **✅ Tag Search**
```javascript
// PostgreSQL array search
const tagSearchQuery = `
  SELECT id, filename, content, metadata, tags, created_at, updated_at
  FROM memories 
  WHERE 
    tenant_id = $1 AND 
    user_id = $2 AND
    is_deleted = false AND
    tags && $3
  ORDER BY created_at DESC
  LIMIT $4 OFFSET $5
`;
```

### **✅ Metadata Search**
```javascript
// JSONB metadata search
const metadataSearchQuery = `
  SELECT id, filename, content, metadata, tags, created_at, updated_at
  FROM memories 
  WHERE 
    tenant_id = $1 AND 
    user_id = $2 AND
    is_deleted = false AND
    metadata @> $3
  ORDER BY created_at DESC
  LIMIT $4 OFFSET $5
`;
```

---

## 📊 PERFORMANCE OPTIMIZATIONS

### **✅ Caching Strategy**
- Redis cache for frequently accessed memories
- Cache invalidation on updates
- TTL-based cache expiration
- Memory-efficient serialization

### **✅ Indexing Strategy**
- GIN indexes for full-text search
- B-tree indexes for common queries
- Partial indexes for active memories
- Composite indexes for complex queries

### **✅ Pagination**
- Cursor-based pagination for large datasets
- Efficient offset/limit implementation
- Total count caching
- Search result caching

---

## 🛡️ SECURITY CONSIDERATIONS

### **✅ Tenant Isolation**
- All queries filtered by tenant_id
- Row-level security policies
- Cross-tenant access prevention
- Audit logging for access attempts

### **✅ Input Validation**
- Filename validation with path traversal prevention
- Content size limits
- Metadata schema validation
- Tag format validation

### **✅ Access Control**
- User-based memory ownership
- Admin override capabilities
- Role-based access to management functions
- API rate limiting

---

## 📋 MEMORY CONTROLLERS

### **✅ Memory Controller**
**Location:** `apps/api/src/controllers/memory.controller.js`
**Methods:**
- `writeMemory()` - Create/update memory
- `readMemory()` - Read memory by filename
- `deleteMemory()` - Soft delete memory
- `searchMemory()` - Full-text search
- `getWorkspace()` - Get workspace overview

### **✅ Memory Admin Controller**
**Location:** `apps/api/src/controllers/memory-admin.controller.js`
**Methods:**
- `applyRetentionPolicy()` - Apply retention policies
- `archiveMemory()` - Archive memory
- `restoreMemory()` - Restore memory
- `getMemoryStats()` - Get memory statistics
- `cleanupExpired()` - Clean expired memories

---

## 🔧 MEMORY SERVICES

### **✅ Memory Service**
**Location:** `apps/api/src/services/memory.service.js`
**Features:**
- Database operations abstraction
- Cache management
- Search implementation
- Metadata handling

### **✅ Memory Cache Service**
**Location:** `apps/api/src/services/memory-cache.service.js`
**Features:**
- Redis caching layer
- Cache invalidation
- Performance monitoring
- Cache warming

---

## 📊 MONITORING & METRICS

### **✅ Memory Metrics**
- Total memory count per tenant
- Memory size distribution
- Access frequency tracking
- Search performance metrics
- Cache hit/miss ratios

### **✅ Performance Monitoring**
- Query execution time
- Index usage statistics
- Memory usage patterns
- Search result relevance
- Error rates

---

## 🎯 IMPLEMENTATION PHASES

### **Phase 3.1: Core CRUD**
- Basic memory operations
- Database schema creation
- Controller implementation
- Basic validation

### **Phase 3.2: Search Implementation**
- Full-text search
- Tag-based search
- Metadata search
- Performance optimization

### **Phase 3.3: Management Features**
- Retention policies
- Archive/restore
- Admin functions
- Bulk operations

### **Phase 3.4: Performance & Security**
- Caching implementation
- Security hardening
- Performance monitoring
- Load testing

---

## 📋 TESTING STRATEGY

### **✅ Unit Tests**
- Memory service functions
- Controller methods
- Validation logic
- Search algorithms

### **✅ Integration Tests**
- Database operations
- Cache integration
- Search functionality
- API endpoints

### **✅ Performance Tests**
- Search performance
- Large dataset handling
- Concurrent access
- Cache efficiency

---

**MEMORY_SPEC STATUS:** ✅ **COMPLETE** - Enterprise memory system specification ready for implementation

The Ultra Agent OS memory system will provide enterprise-grade data persistence with full CRUD operations, advanced search capabilities, and comprehensive management features.

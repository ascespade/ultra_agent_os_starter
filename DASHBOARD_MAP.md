# Ultra Agent OS - Dashboard Architecture Map
**Date:** 2026-02-02T01:30:00+03:00
**Version:** 1.0.0 (Unified Dashboard)

## 🎯 Dashboard Overview

The Ultra Agent OS has been unified from 4 separate screens into a single, cohesive dashboard with proper navigation and real API integration.

## 📱 Dashboard Structure

### **Main Navigation**
```
Ultra Agent OS Unified Dashboard
├── 📊 Overview (System Health & Status)
├── 💼 Jobs (Job Management & Monitoring)
├── 🧠 Memory (Memory File Management)
└── ⚙️ Admin (Tenant Management & Settings)
```

### **Technical Architecture**
```
apps/ui/src/
├── dashboard.html          # Main unified dashboard UI
├── dashboard.js            # Dashboard JavaScript logic
├── api-client.js           # Centralized API client
├── auth-gate.js            # Authentication flow
├── server.js               # Express server (updated)
└── [legacy files]          # Original screens (preserved)
```

## 🔄 Data Flow Architecture

### **API Integration**
```
Browser Dashboard
    ↓ (fetch via api-client.js)
API Client (JWT Auth)
    ↓ (HTTP requests)
Backend API (localhost:3000)
    ↓ (database/redis)
Data Layer
```

### **Authentication Flow**
```
1. User visits dashboard
2. AuthGate checks for JWT token
3. If no token → Show login form
4. Login → Store JWT in localStorage
5. All API calls include Bearer token
6. Token expired → Auto logout
```

## 📊 Page-by-Page Data Sources

### **1. Overview Page**
**Purpose:** System health monitoring and quick status

**Data Sources:**
- `GET /health` - System health status
- `GET /api/adapters/status` - Redis, Database, Core status
- `GET /api/jobs` - Recent jobs list

**Real-time Updates:**
- Auto-refresh every 30 seconds
- Connection status indicator
- Queue length monitoring

**Components:**
- System Health Card
- Queue Length Card  
- Active Jobs Card
- Adapter Status Panel
- Recent Jobs Table

### **2. Jobs Page**
**Purpose:** Job management and monitoring

**Data Sources:**
- `GET /api/jobs` - All jobs list
- `GET /api/jobs/{id}` - Individual job details
- `POST /api/chat` - Create new job

**Features:**
- Jobs table with status indicators
- Job detail viewer
- Manual refresh button
- Reconcile stuck jobs (admin only)

### **3. Memory Page**
**Purpose:** Memory file management

**Data Sources:**
- `GET /api/memory/` - Workspace overview
- `GET /api/memory/{filename}` - Read memory file
- `POST /api/memory/{filename}` - Write memory file

**Features:**
- Memory files list
- JSON editor with validation
- Save/Load functionality
- File browser

### **4. Admin Page**
**Purpose:** Administrative functions

**Data Sources:**
- `GET /api/admin/tenants` - List tenants
- `POST /api/admin/tenants` - Create tenant

**Features:**
- Tenant creation form
- Existing tenants table
- Admin-only access control

## 🔐 Security Model

### **Authentication**
- JWT-based authentication
- Token stored in localStorage
- Automatic token refresh on 401
- Secure logout with token cleanup

### **Authorization**
- Role-based access (admin/user)
- Admin-only functions protected
- API endpoints enforce roles

### **API Security**
- All requests include Bearer token
- Rate limiting on login endpoint
- Input validation on all endpoints

## 🎨 UI/UX Design

### **Design System**
- **Colors:** Dark theme with blue accent (#4a9eff)
- **Typography:** Inter font for UI, JetBrains Mono for code
- **Layout:** Sidebar navigation + main content area
- **Responsive:** Mobile-friendly design

### **Navigation**
- Fixed sidebar with 4 main sections
- Active state indicators
- Breadcrumb-style page titles
- Logout button in sidebar footer

### **Status Indicators**
- Color-coded status (success/warning/error)
- Real-time connection status
- Loading states with spinners
- Error messages with context

## 🔧 Technical Implementation

### **Frontend Technologies**
- **Vanilla JavaScript** (no frameworks)
- **CSS Grid/Flexbox** for layout
- **Fetch API** for HTTP requests
- **LocalStorage** for token persistence

### **API Client Features**
- Centralized error handling
- Automatic authentication headers
- Request/response interceptors
- Connection status monitoring

### **State Management**
- Simple component-based state
- No complex state management library
- API-driven state updates
- Real-time data refresh

## 📡 Real-time Features

### **Auto-refresh**
- Overview page: 30-second intervals
- Manual refresh buttons on all pages
- Connection status monitoring

### **Status Updates**
- Live API connection indicator
- Real-time queue length updates
- Job status changes

## 🔄 Legacy Compatibility

### **Preserved Routes**
- `/admin` → Redirects to unified dashboard
- `/settings` → Original settings page
- `/test-api` → Original API test studio

### **Backward Compatibility**
- Original HTML files preserved
- Legacy functionality maintained
- Gradual migration path

## 🚀 Performance Optimizations

### **Frontend**
- Minimal JavaScript bundle
- CSS-only animations
- Efficient DOM updates
- Lazy loading of data

### **API**
- Efficient database queries
- Redis caching for status
- Connection pooling
- Rate limiting

## 📈 Monitoring & Analytics

### **Built-in Monitoring**
- API connection status
- Request/response times
- Error tracking
- User activity logging

### **Health Checks**
- System health endpoint
- Adapter status monitoring
- Database connectivity
- Redis queue status

## 🔮 Future Enhancements

### **Planned Features**
- WebSocket real-time updates
- Advanced job scheduling
- Memory file versioning
- Enhanced admin controls

### **Scalability**
- Multi-tenant support
- Horizontal scaling ready
- Load balancer compatible
- Container optimized

---

## 📋 Deployment Summary

### **Current State**
- ✅ Unified dashboard implemented
- ✅ All 4 pages integrated with real APIs
- ✅ Authentication flow complete
- ✅ Real-time monitoring active
- ✅ Mobile responsive design

### **API Endpoints Used**
- `GET /health` - System health
- `POST /api/auth/login` - Authentication
- `GET /api/adapters/status` - Adapter status
- `GET /api/jobs` - Jobs list
- `GET /api/jobs/{id}` - Job details
- `POST /api/chat` - Create job
- `GET /api/memory/` - Workspace
- `GET /api/memory/{filename}` - Read memory
- `POST /api/memory/{filename}` - Write memory
- `GET /api/admin/tenants` - List tenants
- `POST /api/admin/tenants` - Create tenant

### **Files Created/Modified**
- `apps/ui/src/dashboard.html` - Main dashboard
- `apps/ui/src/dashboard.js` - Dashboard logic
- `apps/ui/src/api-client.js` - API client
- `apps/ui/src/auth-gate.js` - Authentication
- `apps/ui/src/server.js` - Updated server
- `DASHBOARD_MAP.md` - This documentation

---

**Status:** ✅ **COMPLETE** - Unified dashboard successfully implemented with full API integration

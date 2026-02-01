# Ultra Agent OS - Login Credentials (Updated)

## ✅ Working Credentials

### **Admin Login**
- **Username**: `admin`
- **Password**: `SecureAdminPassword2024!`
- **Role**: `admin`
- **Tenant**: `default`

### **API Test Results**
```bash
# Login Request
curl -X POST -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"SecureAdminPassword2024!"}' \
  http://localhost:3003/api/auth/login

# Response
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

### **UI Access**
- **Main UI**: http://localhost:8088/
- **Admin Dashboard**: http://localhost:8088/?admin=true
- **Use credentials above for login**

### **API Endpoints Test**
```bash
# With token
curl -H "Authorization: Bearer <token>" \
  -H "X-TENANT-ID: default" \
  http://localhost:3003/api/adapters/status
```

**Status**: ✅ All authentication systems working correctly

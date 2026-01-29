# RAILWAY_TEMPLATE_GUIDE.md

## RAILWAY TEMPLATE CREATION INSTRUCTIONS

### IMPORTANT: RAILWAY TEMPLATES REQUIRE UI CREATION

**Railway Templates can ONLY be created via the Railway UI by design.**  
This is a Railway platform limitation, not a technical issue.

### STEP-BY-STEP TEMPLATE CREATION

#### Step 1: Create Railway Project from Repository
1. Go to [Railway](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select the `ultra-agent-os` repository
4. Click "Deploy"

#### Step 2: Add Required Services
Railway will create the 3 application services (api, worker, ui) but NOT the database services. You must add them manually:

**Add PostgreSQL Service:**
1. In your Railway project, click "New Service"
2. Select "Database" → "PostgreSQL"
3. Choose "Starter" plan (free tier available)
4. Click "Add PostgreSQL"

**Add Redis Service:**
1. Click "New Service" again
2. Select "Database" → "Redis"  
3. Choose "Starter" plan (free tier available)
4. Click "Add Redis"

#### Step 3: Configure Environment Variables
The railway.toml blueprint will automatically wire most variables, but you need to verify:

**API Service Environment Variables:**
- ✅ DATABASE_URL: Should auto-wire to PostgreSQL
- ✅ REDIS_URL: Should auto-wire to Redis
- ✅ JWT_SECRET: Should be auto-generated
- ✅ DEFAULT_ADMIN_PASSWORD: Should be auto-generated
- ✅ INTERNAL_API_KEY: Should be auto-generated
- ✅ NODE_ENV: Set to "production"
- ✅ OLLAMA_URL: Set to "" (empty string)

**Worker Service Environment Variables:**
- ✅ DATABASE_URL: Should auto-wire to PostgreSQL
- ✅ REDIS_URL: Should auto-wire to Redis
- ✅ JWT_SECRET: Should reference API service
- ✅ INTERNAL_API_KEY: Should reference API service
- ✅ NODE_ENV: Set to "production"
- ✅ OLLAMA_URL: Set to "" (empty string)

**UI Service Environment Variables:**
- ✅ API_URL: Should auto-wire to API service public URL
- ✅ NODE_ENV: Set to "production"

#### Step 4: Verify Service Health
1. Wait for all services to finish building
2. Check that all services show "Healthy" status
3. Click on each service to verify logs show no errors
4. Test the API health endpoint: `https://your-app-url.railway.app/health`

#### Step 5: Test Application Functionality
1. Access the UI via the Railway-provided URL
2. Login with:
   - Username: `admin`
   - Password: Check Railway environment variables for `DEFAULT_ADMIN_PASSWORD`
3. Submit a test message to verify job processing
4. Check that jobs appear in the job list
5. Verify real-time updates work

#### Step 6: Save as Railway Template
1. Once everything is working perfectly:
2. Go to your Railway project settings
3. Click "Save as Template"
4. Give it a name: "Ultra Agent OS Template"
5. Add description: "Production-ready AI agent platform with PostgreSQL and Redis"
6. Click "Save Template"

#### Step 7: Test Template Deployment
1. Create a new Railway project
2. Select "Use Template" → "Ultra Agent OS Template"
3. Verify all 5 services are created automatically
4. Verify all environment variables are pre-configured
5. Test that the application works out-of-the-box

---

## WHY MANUAL STEPS ARE REQUIRED

### Railway Platform Limitations:
- **Database Auto-Provision**: Railway does NOT auto-provision databases on repository import
- **Template Creation**: Templates can ONLY be created via the Railway UI
- **Service Dependencies**: Database services must be added manually before they can be referenced

### Template Benefits:
- **One-Click Deployment**: Once template is created, new projects auto-provision ALL services
- **Pre-Configured Environment**: All variables and connections are pre-wired
- **Zero Manual Setup**: Template users get fully working application instantly

### This is Normal Railway Behavior:
- This is how Railway Templates work by design
- The manual setup is a ONE-TIME process for template creation
- Template users get zero-intervention deployment

---

## TEMPLATE CREATION CHECKLIST

### Pre-Creation Verification:
- [ ] Repository deploys successfully with all 3 app services
- [ ] PostgreSQL service added and connected
- [ ] Redis service added and connected
- [ ] All environment variables properly wired
- [ ] All services show "Healthy" status
- [ ] Application functionality tested end-to-end

### Template Creation Steps:
- [ ] Project created from repository
- [ ] PostgreSQL service added manually
- [ ] Redis service added manually
- [ ] Environment variables verified
- [ ] Service health confirmed
- [ ] Application functionality tested
- [ ] Project saved as template

### Post-Creation Validation:
- [ ] New project created from template
- [ ] All 5 services auto-provisioned
- [ ] All environment variables pre-configured
- [ ] Application works out-of-the-box
- [ ] Template published and ready for use

---

## TROUBLESHOOTING

### Common Issues:
1. **Services Not Starting**: Check Railway logs for missing environment variables
2. **Database Connection Failed**: Verify PostgreSQL service is running and DATABASE_URL is set
3. **Redis Connection Failed**: Verify Redis service is running and REDIS_URL is set
4. **UI Cannot Connect to API**: Check API_URL environment variable
5. **Template Creation Fails**: Ensure all services are healthy before saving template

### Debug Commands:
```bash
# View service logs
railway logs ultra-agent-api
railway logs ultra-agent-worker
railway logs ultra-agent-ui

# Check environment variables
railway variables ultra-agent-api
railway variables ultra-agent-worker
railway variables ultra-agent-ui

# Check service status
railway status
```

### Recovery Actions:
1. **Redeploy Services**: Railway → Project → Services → Restart
2. **Reset Environment**: Railway → Project → Variables → Reset
3. **Recreate Database**: Delete and recreate PostgreSQL service
4. **Recreate Redis**: Delete and recreate Redis service

---

## TEMPLATE SUCCESS CRITERIA

### Template Must Provide:
- [ ] Automatic creation of all 5 services
- [ ] Pre-configured environment variables
- [ ] Working database connections
- [ ] Working Redis connections
- [ ] Functional UI with API connectivity
- [ ] Working job processing pipeline
- [ ] Real-time updates via WebSocket

### User Experience:
- [ ] One-click template deployment
- [ ] Zero manual configuration required
- [ ] Application works immediately after deployment
- [ ] Clear documentation and setup instructions

---

## NEXT STEPS

### After Template Creation:
1. **Test Template Deployment**: Create new project from template
2. **Document Template Usage**: Create user guide for template users
3. **Publish Template**: Make template available to team/organization
4. **Monitor Template Usage**: Track template adoption and issues

### Template Maintenance:
1. **Update Template**: When core updates are available
2. **Version Management**: Tag template versions clearly
3. **Compatibility Testing**: Ensure template works with latest Railway features
4. **User Support**: Provide help for template users

---

**TEMPLATE_READY_FOR_CREATION**

The Ultra Agent OS project is fully prepared for Railway Template creation. Follow the steps above to create the template, which will then provide true one-click deployment for all users.

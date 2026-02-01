# Ultra Agent OS – Credentials and Environment Setup

## Local Development

### Quick Setup

Run the environment setup script to generate `.env.local` with secure random keys:

```bash
node scripts/setup-env.js
```

This creates `.env.local` with:
- `JWT_SECRET` (64 characters)
- `INTERNAL_API_KEY` (64 characters)
- `DATABASE_ENCRYPTION_KEY` (64 characters)
- `SESSION_SECRET` (64 characters)
- `DEFAULT_ADMIN_PASSWORD=admin123`

### Default Credentials

| Field    | Value     |
|----------|-----------|
| Username | `admin`   |
| Password | `admin123` |

### Manual Key Generation

If you need to generate keys manually:

```bash
# Generate a 64-character hex key (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Docker Compose

### Credentials

| Field    | Value                      |
|----------|----------------------------|
| Username | `admin`                    |
| Password | `SecureAdminPassword2024!` |

Set in `docker-compose.yml` via `DEFAULT_ADMIN_PASSWORD`.

### UI Access

- Main UI: http://localhost:3000/ui/
- Admin Dashboard: http://localhost:3000/ui/?admin=true
- API Test Studio: http://localhost:3000/ui/test-api

---

## Railway Production

### Required Environment Variables

You **MUST** set these environment variables in Railway dashboard before deployment:

#### Security Keys (Required)

```bash
# Generate each key with:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Then set in Railway:
JWT_SECRET=<generated-64-char-hex>
INTERNAL_API_KEY=<generated-64-char-hex>
DEFAULT_ADMIN_PASSWORD=<your-secure-password-min-8-chars>
```

#### Infrastructure (Auto-provided by Railway)

- `DATABASE_URL` - Auto-set by Postgres plugin
- `REDIS_URL` - Auto-set by Redis plugin
- `PORT` - Auto-set by Railway

#### Optional Adapters

- `OLLAMA_URL` - Leave empty if not using Ollama
- `DOCKER_HOST` - Leave empty if not using Docker execution

### Login Credentials

Username is always `admin`.

Password is the value you set for `DEFAULT_ADMIN_PASSWORD` in Railway environment variables.

### UI Access

- Main UI: https://your-app.railway.app/ui/
- Admin Dashboard: https://your-app.railway.app/ui/?admin=true
- API Test Studio: https://your-app.railway.app/ui/test-api

---

## Changing the Password

### Local Development

1. Update `DEFAULT_ADMIN_PASSWORD` in `.env.local`
2. Restart the API: `npm run start:prod`
3. Password is automatically synced on startup

### Docker

1. Update `DEFAULT_ADMIN_PASSWORD` in `docker-compose.yml`
2. Restart containers: `docker compose restart api`

### Railway

1. Update `DEFAULT_ADMIN_PASSWORD` in Railway dashboard (Variables)
2. Redeploy or restart the service
3. Password is automatically synced on startup

---

## Security Best Practices

### Key Requirements

- **JWT_SECRET**: Minimum 32 characters (64 recommended)
- **INTERNAL_API_KEY**: Minimum 32 characters (64 recommended)
- **DEFAULT_ADMIN_PASSWORD**: Minimum 8 characters (16+ recommended)

### Never Do This

❌ Commit `.env.local` to git  
❌ Use the same keys in development and production  
❌ Share production keys via insecure channels  
❌ Use weak passwords like "admin", "password", "123456"  

### Always Do This

✅ Generate unique keys for each environment  
✅ Use `scripts/setup-env.js` for local development  
✅ Set production keys manually in Railway dashboard  
✅ Use strong, random passwords (16+ characters)  
✅ Rotate keys periodically (every 90 days recommended)

---

## Troubleshooting

### "JWT_SECRET environment variable is required"

**Cause**: JWT_SECRET not set

**Fix**:
- **Local**: Run `node scripts/setup-env.js`
- **Railway**: Set JWT_SECRET in environment variables

### "JWT_SECRET must be at least 32 characters"

**Cause**: JWT_SECRET too short

**Fix**: Generate a new key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### "Invalid credentials" on login

**Cause**: Wrong username or password

**Fix**:
- Username is always `admin`
- Check `DEFAULT_ADMIN_PASSWORD` value in your environment
- For Railway: Check Variables in dashboard
- For local: Check `.env.local` file

### Password not syncing after change

**Cause**: Service not restarted

**Fix**: Restart the API service to sync the new password

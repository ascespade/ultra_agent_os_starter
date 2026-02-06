#!/usr/bin/env node

/**
 * Environment Setup Script
 * 
 * Generates .env.local for LOCAL DEVELOPMENT ONLY
 * NEVER use this in production - production must use explicit env vars
 * 
 * Usage:
 *   node scripts/setup-env.js          # Create .env.local (fails if exists)
 *   node scripts/setup-env.js --force  # Overwrite existing .env.local
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '..', '.env.local');
const FORCE = process.argv.includes('--force');

// Check if file exists
if (fs.existsSync(ENV_FILE) && !FORCE) {
  console.error('[ERROR] .env.local already exists');
  console.error('[ERROR] Use --force to overwrite');
  process.exit(1);
}

// Generate secure random keys
// Note: randomBytes(n).toString('hex') produces 2n characters
function generateKey(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

// Generate environment file content
const envContent = `# Ultra Agent OS - Local Development Environment
# Generated: ${new Date().toISOString()}
# WARNING: This file is for LOCAL DEVELOPMENT ONLY
# DO NOT commit this file to git
# DO NOT use these values in production

# ===== CORE INFRASTRUCTURE =====
NODE_ENV=development
HOST=localhost
PORT=3000

# ===== DATABASE =====
DATABASE_URL=postgresql://postgres:password@localhost:5432/ultra_agent

# ===== REDIS =====
REDIS_URL=redis://localhost:6379

# ===== SECURITY KEYS (64 chars each) =====
# These are randomly generated for local dev
JWT_SECRET=${generateKey(32)}
INTERNAL_API_KEY=${generateKey(32)}
DATABASE_ENCRYPTION_KEY=${generateKey(32)}
SESSION_SECRET=${generateKey(32)}

# ===== ADMIN CREDENTIALS =====
# Default admin password for local development
DEFAULT_ADMIN_PASSWORD=admin123

# ===== ADAPTERS (Optional) =====
OLLAMA_URL=http://localhost:11434
DOCKER_HOST=unix:///var/run/docker.sock
DATA_DIR=./data

# ===== UI CONFIGURATION =====
UI_ENABLED=true
UI_PATH=/ui

# ===== RATE LIMITING =====
RATE_LIMIT_AI_RATE_SEC=8
RATE_LIMIT_AI_BURST=25
RATE_LIMIT_LIGHT_RATE_SEC=50
RATE_LIMIT_LIGHT_BURST=100

# ===== MULTI-TENANT =====
DEFAULT_TENANT_ID=default
TENANT_ISOLATION_ENABLED=true

# ===== MONITORING =====
METRICS_ENABLED=true
HEALTH_CHECK_INTERVAL=30000
LOG_LEVEL=debug
`;

// Write file
try {
  fs.writeFileSync(ENV_FILE, envContent, 'utf8');
  console.log('[SUCCESS] Created .env.local');
  console.log('[INFO] File location:', ENV_FILE);
  console.log('');
  console.log('[SECURITY] Generated keys:');
  console.log('  - JWT_SECRET (64 chars)');
  console.log('  - INTERNAL_API_KEY (64 chars)');
  console.log('  - DATABASE_ENCRYPTION_KEY (64 chars)');
  console.log('  - SESSION_SECRET (64 chars)');
  console.log('');
  console.log('[NEXT STEPS]');
  console.log('  1. Review .env.local and adjust values as needed');
  console.log('  2. Start services: npm run start:dev');
  console.log('  3. Access UI: http://localhost:3000/ui/');
  console.log('');
  console.log('[WARNING] This file is for LOCAL DEVELOPMENT ONLY');
  console.log('[WARNING] For production, set environment variables explicitly');
} catch (error) {
  console.error('[ERROR] Failed to create .env.local:', error.message);
  process.exit(1);
}

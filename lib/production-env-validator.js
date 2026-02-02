/**
 * Production Environment Validation Utility
 * 
 * Enforces strict environment requirements in production/Railway deployments:
 * - Disables dotenv in production
 * - Requires REDIS_URL and DATABASE_URL
 * - Prevents localhost fallbacks
 * - Provides fatal exit on misconfiguration
 */

/**
 * Gets current environment detection state
 * @returns {Object} Environment detection results
 */
function getEnvironmentState() {
  const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
  const isProd = process.env.NODE_ENV === 'production';
  const isProduction = isRailway || isProd;
  
  return {
    isProduction,
    isRailway,
    isProd,
    nodeEnv: process.env.NODE_ENV || 'development',
    railwayEnv: process.env.RAILWAY_ENVIRONMENT || null,
    railwayService: process.env.RAILWAY_SERVICE_NAME || null,
    railwayProject: process.env.RAILWAY_PROJECT_ID || null
  };
}

// Production environment detection and dotenv handling
// Load dotenv immediately if not in production
const isProdCheck = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;

if (!isProdCheck) {
  try {
    const path = require('path');
    // Try loading from current directory
    require('dotenv').config();
    // Also try looking in root if we are deep in subfolders
    require('dotenv').config({ path: path.join(process.cwd(), '.env') });
  } catch (e) {
    // dotenv not available or failed
  }
}

const envState = getEnvironmentState();

if (envState.isProduction) {
  console.log('[ENV] Production environment detected - dotenv disabled');
  console.log('[ENV] All environment variables must be provided by platform');
} else {
    // Already loaded above
}

/**
 * Validates that required environment variables are present
 * @param {string[]} requiredVars - Array of required environment variable names
 * @param {boolean} fatalExit - Whether to exit process on failure (default: true)
 * @returns {boolean} True if all required variables are present
 */
function validateRequiredEnvVars(requiredVars, fatalExit = true) {
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('[ENV] Missing required environment variables:');
    missing.forEach(varName => {
      console.error(`[ENV] - ${varName} is required`);
    });
    
    // In production, provide fallback URLs if Railway variables aren't working
    const currentEnv = getEnvironmentState();
    if (currentEnv.isProduction && (missing.includes('REDIS_URL') || missing.includes('DATABASE_URL'))) {
      console.log('[ENV] Attempting Railway environment variable fallback...');
      
      // Try Railway-specific environment variable names
      const railwayRedisUrl = process.env.RAILWAY_REDIS_URL || 
                             process.env.REDIS_URL ||
                             process.env.RAILWAY_REDIS_CONNECTION_URL ||
                             process.env.REDIS_CONNECTION_URL;
      
      const railwayDbUrl = process.env.RAILWAY_DATABASE_URL || 
                          process.env.DATABASE_URL ||
                          process.env.RAILWAY_POSTGRES_URL ||
                          process.env.POSTGRES_URL ||
                          process.env.RAILWAY_POSTGRESQL_URL ||
                          process.env.POSTGRESQL_URL;
      
      if (missing.includes('REDIS_URL') && railwayRedisUrl) {
        process.env.REDIS_URL = railwayRedisUrl;
        console.log('[ENV] Set REDIS_URL from Railway variable');
        missing.splice(missing.indexOf('REDIS_URL'), 1);
      }
      
      if (missing.includes('DATABASE_URL') && railwayDbUrl) {
        process.env.DATABASE_URL = railwayDbUrl;
        console.log('[ENV] Set DATABASE_URL from Railway variable');
        missing.splice(missing.indexOf('DATABASE_URL'), 1);
      }
      
      // If still missing after fallback, exit
      if (missing.length > 0) {
        console.error('[ENV] Fallback failed - still missing variables');
        if (fatalExit) {
          console.error('[ENV] Fatal: Cannot start without required environment variables');
          process.exit(1);
        }
        return false;
      } else {
        console.log('[ENV] Environment variables resolved via fallback');
        return true;
      }
    }
    
    if (fatalExit) {
      console.error('[ENV] Fatal: Cannot start without required environment variables');
      process.exit(1);
    }
    
    return false;
  }
  
  return true;
}

/**
 * Validates that connection URLs are not localhost in production
 * @param {string[]} urlVars - Array of environment variable names containing URLs
 * @param {boolean} fatalExit - Whether to exit process on failure (default: true)
 * @returns {boolean} True if all URLs are valid for production
 */
function validateProductionUrls(urlVars, fatalExit = true) {
  const currentEnv = getEnvironmentState();
  
  if (!currentEnv.isProduction) {
    return true; // Skip validation in development
  }
  
  const invalidUrls = urlVars.filter(varName => {
    const url = process.env[varName];
    return url && (url.includes('localhost') || url.includes('127.0.0.1'));
  });
  
  if (invalidUrls.length > 0) {
    console.error('[ENV] localhost URLs are not allowed in production:');
    invalidUrls.forEach(varName => {
      console.error(`[ENV] - ${varName} cannot use localhost/127.0.0.1`);
    });
    
    if (fatalExit) {
      console.error('[ENV] Fatal: Cannot use localhost URLs in production');
      process.exit(1);
    }
    
    return false;
  }
  
  return true;
}

/**
 * Performs comprehensive production environment validation
 * @param {Object} options - Validation options
 * @param {string[]} options.requiredVars - Required environment variables
 * @param {string[]} options.urlVars - URL variables to validate for localhost
 * @param {boolean} options.fatalExit - Whether to exit on validation failure
 * @returns {boolean} True if validation passes
 */
function validateProductionEnv(options = {}) {
  const {
    requiredVars = ['REDIS_URL', 'DATABASE_URL'],
    urlVars = ['REDIS_URL', 'DATABASE_URL'],
    fatalExit = true
  } = options;
  
  const currentEnv = getEnvironmentState();
  console.log(`[ENV] Environment validation (isProduction=${currentEnv.isProduction}, isRailway=${currentEnv.isRailway})`);
  
  // Skip validation in development for Phase 0 testing
  if (!currentEnv.isProduction) {
    console.log('[ENV] Development environment - skipping validation for Phase 0');
    return true;
  }
  
  // Validate required variables
  const requiredValid = validateRequiredEnvVars(requiredVars, fatalExit);
  
  // Validate production URLs
  const urlsValid = validateProductionUrls(urlVars, fatalExit);
  
  if (requiredValid && urlsValid) {
    console.log('[ENV] Environment validation passed');
    return true;
  }
  
  return false;
}

/**
 * Gets environment profile information
 * @returns {Object} Environment profile details
 */
function getEnvironmentProfile() {
  return getEnvironmentState();
}

module.exports = {
  isProduction: envState.isProduction,
  isRailway: envState.isRailway,
  isProd: envState.isProd,
  validateRequiredEnvVars,
  validateProductionUrls,
  validateProductionEnv,
  getEnvironmentProfile,
  getEnvironmentState
};

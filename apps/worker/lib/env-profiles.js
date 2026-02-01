/**
 * ENVIRONMENT_PROFILES_ORCHESTRATOR
 * Behavior matrix: dev | staging | prod. Env selected at boot (APP_ENV).
 * No code branching: single path reads from profile.
 */

const BEHAVIOR_MATRIX = {
  dev: {
    logging: 'verbose',
    limits: 'relaxed',
    dry_run: false
  },
  staging: {
    logging: 'normal',
    limits: 'prod-like',
    dry_run: true
  },
  prod: {
    logging: 'minimal',
    limits: 'strict',
    dry_run: false
  }
};

const LIMITS_BY_PROFILE = {
  relaxed: {
    ai: { rate: 16, burst: 50 },
    light: { rate: 100, burst: 200 }
  },
  'prod-like': {
    ai: { rate: 8, burst: 25 },
    light: { rate: 50, burst: 100 }
  },
  strict: {
    ai: { rate: 8, burst: 25 },
    light: { rate: 50, burst: 100 }
  }
};

const LOG_LEVEL_ORDER = { verbose: 0, normal: 1, minimal: 2 };

let _profile = null;

function getEnvProfile() {
  if (_profile) return _profile;
  const env = (process.env.APP_ENV || process.env.PLATFORM_ENV || 'dev').toLowerCase();
  const resolved = env === 'staging' ? 'staging' : env === 'prod' ? 'prod' : 'dev';
  const base = BEHAVIOR_MATRIX[resolved] || BEHAVIOR_MATRIX.dev;
  const limitsKey = base.limits === 'relaxed' ? 'relaxed' : base.limits === 'prod-like' ? 'prod-like' : 'strict';
  _profile = {
    env: resolved,
    logging: base.logging,
    limits: base.limits,
    dry_run: !!base.dry_run,
    limitsConfig: LIMITS_BY_PROFILE[limitsKey] || LIMITS_BY_PROFILE.strict
  };
  return _profile;
}

function envLog(level, ...args) {
  const profile = getEnvProfile();
  const minLevel = profile.logging;
  const order = LOG_LEVEL_ORDER[minLevel] ?? 0;
  const levelOrder = LOG_LEVEL_ORDER[level] ?? 0;
  if (levelOrder >= order) {
    if (level === 'verbose' && typeof console.debug === 'function') {
      console.debug(...args);
    } else if (level === 'minimal' && (args[0] && typeof args[0] === 'string' && args[0].includes('ERROR'))) {
      console.error(...args);
    } else {
      console.log(...args);
    }
  }
}

module.exports = {
  BEHAVIOR_MATRIX,
  LIMITS_BY_PROFILE,
  getEnvProfile,
  envLog
};

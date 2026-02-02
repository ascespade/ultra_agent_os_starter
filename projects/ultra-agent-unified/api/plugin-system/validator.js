'use strict';

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { KNOWN_PERMISSIONS } = require('./constants');

function validate(pluginMeta, pluginDir, options = {}) {
  const { signedOnly = true } = options;
  const errors = [];

  if (!pluginMeta.permissions || !Array.isArray(pluginMeta.permissions)) {
    errors.push('permissions must be an array (explicit_permissions)');
  } else {
    for (const p of pluginMeta.permissions) {
      if (!KNOWN_PERMISSIONS.has(p)) {
        errors.push(`unknown permission: ${p}`);
      }
    }
  }

  if (signedOnly && !pluginMeta.signature) {
    errors.push('signed_plugins_only: manifest must include signature');
  }

  if (pluginMeta.signature) {
    const ok = verifySignature(pluginMeta, pluginDir);
    if (!ok) errors.push('signature verification failed');
  }

  return { valid: errors.length === 0, errors };
}

function verifySignature(pluginMeta, pluginDir) {
  try {
    const manifestPath = path.join(pluginDir, pluginMeta.id || pluginMeta.name, 'plugin.json');
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const canonical = raw.trim();
    const hash = crypto.createHash('sha256').update(canonical).digest('hex');
    return pluginMeta.signature === hash || pluginMeta.signature === `sha256:${hash}`;
  } catch (e) {
    return false;
  }
}

module.exports = { validate, verifySignature };

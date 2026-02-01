'use strict';

const path = require('path');
const fs = require('fs');
const { PLUGIN_TYPES } = require('./constants');

const DEFAULT_PLUGIN_DIR = path.join(__dirname, '..', '..', '..', '..', 'plugins');

function discover(pluginDir = process.env.PLUGIN_DIR || DEFAULT_PLUGIN_DIR) {
  const results = { available: [], errors: [] };
  if (!fs.existsSync(pluginDir)) {
    return results;
  }
  const entries = fs.readdirSync(pluginDir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const manifestPath = path.join(pluginDir, ent.name, 'plugin.json');
    if (!fs.existsSync(manifestPath)) {
      results.errors.push({ plugin: ent.name, error: 'plugin.json not found' });
      continue;
    }
    try {
      const raw = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(raw);
      if (!manifest.name || !manifest.version || !manifest.type) {
        results.errors.push({ plugin: ent.name, error: 'manifest missing name/version/type' });
        continue;
      }
      if (!Object.values(PLUGIN_TYPES).includes(manifest.type)) {
        results.errors.push({ plugin: ent.name, error: `invalid type: ${manifest.type}` });
        continue;
      }
      results.available.push({
        id: manifest.name,
        name: manifest.name,
        version: manifest.version,
        type: manifest.type,
        description: manifest.description || '',
        permissions: manifest.permissions || [],
        entry_point: manifest.entry_point || './index.js',
        signature: manifest.signature || null
      });
    } catch (e) {
      results.errors.push({ plugin: ent.name, error: e.message });
    }
  }
  return results;
}

module.exports = { discover };

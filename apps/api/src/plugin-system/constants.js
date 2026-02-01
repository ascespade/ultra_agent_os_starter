'use strict';

const PLUGIN_LIFECYCLE = ['discover', 'validate', 'sandbox', 'enable', 'monitor', 'disable'];
const PLUGIN_TYPES = {
  ADAPTER: 'adapter',
  PROCESSOR: 'processor',
  AUTHENTICATOR: 'authenticator',
  MONITOR: 'monitor',
  STORAGE: 'storage',
  UI_EXTENSION: 'ui_extension'
};
const KNOWN_PERMISSIONS = new Set([
  'network.request', 'network.external', 'network.ollama',
  'storage.read', 'storage.write', 'storage.delete',
  'system.process', 'system.env',
  'database.read', 'database.write',
  'core.jobs', 'core.auth'
]);

module.exports = { PLUGIN_LIFECYCLE, PLUGIN_TYPES, KNOWN_PERMISSIONS };

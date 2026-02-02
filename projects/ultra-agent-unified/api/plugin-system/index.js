'use strict';

const { discover } = require('./discovery');
const { validate } = require('./validator');
const { runSandboxed } = require('./sandbox');
const registry = require('./registry');
const { PLUGIN_LIFECYCLE } = require('./constants');

function getPluginDir() {
  return registry.PLUGIN_DIR;
}

function discoverPlugins(pluginDir) {
  return discover(pluginDir || getPluginDir());
}

function validatePlugin(pluginMeta, pluginDir, options) {
  return validate(pluginMeta, pluginDir || getPluginDir(), options);
}

function sandboxRun(pluginDir, pluginId, entryPoint, methodName, args) {
  return runSandboxed(pluginDir || getPluginDir(), pluginId, entryPoint || 'index.js', methodName, args || []);
}

async function enablePlugin(redisClient, tenantId, pluginId, meta) {
  return registry.enable(redisClient, tenantId, pluginId, meta);
}

async function disablePlugin(redisClient, tenantId, pluginId) {
  return registry.disable(redisClient, tenantId, pluginId);
}

function monitorPlugin(tenantId, pluginId) {
  return registry.monitor(tenantId, pluginId);
}

async function getEnabledPlugins(redisClient, tenantId) {
  return registry.getEnabledForTenant(redisClient, tenantId);
}

module.exports = {
  PLUGIN_LIFECYCLE,
  discoverPlugins,
  validatePlugin,
  sandboxRun,
  enablePlugin,
  disablePlugin,
  monitorPlugin,
  getEnabledPlugins,
  getPluginDir
};

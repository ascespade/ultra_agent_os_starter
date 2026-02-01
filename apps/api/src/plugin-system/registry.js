'use strict';

const path = require('path');
const fs = require('fs');
const { runSandboxed, EXEC_TIMEOUT_MS } = require('./sandbox');

const PLUGIN_DIR = process.env.PLUGIN_DIR || path.join(__dirname, '..', '..', '..', '..', 'plugins');
const REDIS_KEY_ENABLED = (tenantId) => `tenant:${tenantId}:plugins:enabled`;
const REDIS_KEY_STATUS = (tenantId, pluginId) => `tenant:${tenantId}:plugin:${pluginId}:status`;

const instances = new Map();

function instanceKey(tenantId, pluginId) {
  return `${tenantId}:${pluginId}`;
}

function callWithTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
  ]);
}

async function enable(redisClient, tenantId, pluginId, meta) {
  const key = instanceKey(tenantId, pluginId);
  if (instances.get(key)) {
    return { success: true, message: 'already enabled' };
  }
  const entryPath = path.join(PLUGIN_DIR, pluginId, meta.entry_point || 'index.js');
  if (!fs.existsSync(entryPath)) {
    return { success: false, error: 'entry point not found' };
  }
  let Mod;
  try {
    Mod = require(entryPath);
  } catch (e) {
    return { success: false, error: e.message };
  }
  const Ctor = typeof Mod === 'function' ? Mod : Mod.default;
  const config = {};
  const logger = { info: () => {}, warn: () => {}, error: () => {} };
  let instance;
  try {
    instance = new Ctor(config, meta.permissions || [], logger);
  } catch (e) {
    return { success: false, error: e.message };
  }
  try {
    await callWithTimeout(Promise.resolve(instance.onInitialize && instance.onInitialize()), EXEC_TIMEOUT_MS);
  } catch (e) {
    return { success: false, error: e.message };
  }
  instances.set(key, { instance, meta, tenantId, pluginId, enabledAt: Date.now() });
  if (redisClient) {
    await redisClient.sAdd(REDIS_KEY_ENABLED(tenantId), pluginId);
    await redisClient.hSet(REDIS_KEY_STATUS(tenantId, pluginId), 'status', 'enabled', 'at', String(Date.now()));
  }
  return { success: true };
}

async function disable(redisClient, tenantId, pluginId) {
  const key = instanceKey(tenantId, pluginId);
  const rec = instances.get(key);
  if (!rec) {
    if (redisClient) await redisClient.sRem(REDIS_KEY_ENABLED(tenantId), pluginId);
    return { success: true, message: 'was not enabled' };
  }
  let shutdownOk = true;
  try {
    if (rec.instance.onShutdown) {
      await callWithTimeout(Promise.resolve(rec.instance.onShutdown()), EXEC_TIMEOUT_MS);
    }
  } catch (e) {
    shutdownOk = false;
  }
  instances.delete(key);
  if (redisClient) {
    await redisClient.sRem(REDIS_KEY_ENABLED(tenantId), pluginId);
    await redisClient.hSet(REDIS_KEY_STATUS(tenantId, pluginId), 'status', 'disabled', 'at', String(Date.now()));
  }
  return { success: true, shutdownOk };
}

function monitor(tenantId, pluginId) {
  const key = instanceKey(tenantId, pluginId);
  const rec = instances.get(key);
  if (!rec) return { status: 'disabled' };
  return { status: 'enabled', enabledAt: rec.enabledAt, permissions: rec.meta.permissions };
}

async function getEnabledForTenant(redisClient, tenantId) {
  if (!redisClient) return [];
  const list = await redisClient.sMembers(REDIS_KEY_ENABLED(tenantId));
  return list || [];
}

module.exports = {
  enable,
  disable,
  monitor,
  getEnabledForTenant,
  instances,
  PLUGIN_DIR,
  REDIS_KEY_ENABLED,
  REDIS_KEY_STATUS
};

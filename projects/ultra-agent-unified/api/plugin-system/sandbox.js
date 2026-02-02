'use strict';

const path = require('path');
const fs = require('fs');

const EXEC_TIMEOUT_MS = 15000;

function runSandboxed(pluginDir, pluginId, entryPoint, methodName, args = []) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ success: false, error: 'sandbox timeout', plugin: pluginId });
    }, EXEC_TIMEOUT_MS);
    try {
      const entryPath = path.join(pluginDir, pluginId, entryPoint);
      if (!fs.existsSync(entryPath)) {
        clearTimeout(timeout);
        return resolve({ success: false, error: 'entry point not found', plugin: pluginId });
      }
      const mod = require(entryPath);
      const fn = typeof mod === 'function' ? mod : (mod && mod[methodName]);
      if (typeof fn !== 'function') {
        clearTimeout(timeout);
        return resolve({ success: false, error: `method ${methodName} not found`, plugin: pluginId });
      }
      const p = Promise.resolve().then(() => fn(...args));
      p.then(
        (result) => {
          clearTimeout(timeout);
          resolve({ success: true, result, plugin: pluginId });
        },
        (err) => {
          clearTimeout(timeout);
          resolve({ success: false, error: err.message, plugin: pluginId });
        }
      );
    } catch (err) {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message, plugin: pluginId });
    }
  });
}

module.exports = { runSandboxed, EXEC_TIMEOUT_MS };

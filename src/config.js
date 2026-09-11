'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  // Severities that fail the pre-commit check when found in `npm/pnpm/yarn audit`.
  blockOnVulnerabilitySeverities: ['critical', 'high'],
  // Any detected secret blocks the commit by default.
  blockOnSecrets: true,
  // Code-quality / modularity / scalability findings are informational unless enabled here.
  blockOnQuality: false,

  thresholds: {
    maxFileLines: 500,
    maxFunctionLines: 80,
    maxCyclomaticComplexity: 15,
    maxImportFanOut: 20,
    maxDependencies: 150,
    maxDirectoryDepth: 8,
  },

  ignore: [],

  // In hook mode, restrict the fast scanners (secrets, quality) to staged files only.
  scanStagedOnlyInHook: true,
};

function loadUserConfig(cwd) {
  const candidates = [
    'precommit-sentinel.config.js',
    '.precommit-sentinel.js',
    '.precommit-sentinelrc.json',
  ];

  for (const file of candidates) {
    const full = path.join(cwd, file);
    if (fs.existsSync(full)) {
      try {
        if (file.endsWith('.json')) {
          return JSON.parse(fs.readFileSync(full, 'utf8'));
        }
        delete require.cache[require.resolve(full)];
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const loaded = require(full);
        return loaded && loaded.__esModule ? loaded.default : loaded;
      } catch (err) {
        console.error(`precommit-sentinel: failed to load config ${file}: ${err.message}`);
        return {};
      }
    }
  }

  try {
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.precommitSentinel) return pkg.precommitSentinel;
    }
  } catch (_) {
    // ignore malformed package.json here; other parts of the tool will surface it
  }

  return {};
}

function mergeDeep(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override || {})) {
    if (
      typeof override[key] === 'object' &&
      override[key] !== null &&
      !Array.isArray(override[key]) &&
      typeof base[key] === 'object' &&
      base[key] !== null
    ) {
      result[key] = mergeDeep(base[key], override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

function loadConfig(cwd = process.cwd()) {
  const userConfig = loadUserConfig(cwd);
  return mergeDeep(DEFAULT_CONFIG, userConfig);
}

module.exports = { loadConfig, DEFAULT_CONFIG };

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function detectPackageManager(cwd) {
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(cwd, 'package-lock.json'))) return 'npm';
  if (fs.existsSync(path.join(cwd, 'package.json'))) return 'npm';
  return null;
}

function auditCommandFor(pm) {
  if (pm === 'pnpm') return ['pnpm', ['audit', '--json']];
  if (pm === 'yarn') return ['yarn', ['audit', '--json']];
  return ['npm', ['audit', '--json']];
}

function safeExec(cmd, args, cwd) {
  try {
    return { stdout: execFileSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 * 50 }) };
  } catch (err) {
    // audit tools exit non-zero when vulnerabilities are found; the JSON is still on stdout
    return { stdout: err.stdout ? err.stdout.toString() : '', error: err };
  }
}

const EMPTY_COUNTS = { critical: 0, high: 0, moderate: 0, low: 0, info: 0 };

function parseNpmStyle(json) {
  // npm 7+ / pnpm both broadly follow { vulnerabilities: { name: { severity, via, range, fixAvailable } } }
  const counts = { ...EMPTY_COUNTS };
  const packages = [];

  if (json && json.vulnerabilities && typeof json.vulnerabilities === 'object') {
    for (const [name, info] of Object.entries(json.vulnerabilities)) {
      const severity = info.severity || 'unknown';
      if (counts[severity] !== undefined) counts[severity] += 1;
      packages.push({
        name,
        severity,
        via: Array.isArray(info.via)
          ? info.via.map((v) => (typeof v === 'string' ? v : v.title || v.name)).filter(Boolean)
          : [],
        fixAvailable: Boolean(info.fixAvailable),
      });
    }
    return { counts, packages, total: packages.length };
  }

  // legacy npm audit v1: { advisories: { id: { module_name, severity, title } } }
  if (json && json.advisories && typeof json.advisories === 'object') {
    for (const advisory of Object.values(json.advisories)) {
      const severity = advisory.severity || 'unknown';
      if (counts[severity] !== undefined) counts[severity] += 1;
      packages.push({
        name: advisory.module_name,
        severity,
        via: [advisory.title].filter(Boolean),
        fixAvailable: Boolean(advisory.patched_versions && advisory.patched_versions !== '<0.0.0'),
      });
    }
    return { counts, packages, total: packages.length };
  }

  return null;
}

function parseYarnNdjson(stdout) {
  const counts = { ...EMPTY_COUNTS };
  const packages = [];
  const seen = new Set();

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch (_) {
      continue;
    }
    if (obj.type === 'auditAdvisory' && obj.data && obj.data.advisory) {
      const advisory = obj.data.advisory;
      const key = `${advisory.module_name}:${advisory.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const severity = advisory.severity || 'unknown';
      if (counts[severity] !== undefined) counts[severity] += 1;
      packages.push({
        name: advisory.module_name,
        severity,
        via: [advisory.title].filter(Boolean),
        fixAvailable: Boolean(advisory.patched_versions && advisory.patched_versions !== '<0.0.0'),
      });
    }
  }

  if (packages.length === 0) return null;
  return { counts, packages, total: packages.length };
}

function runVulnerabilityScan(cwd) {
  const pm = detectPackageManager(cwd);
  if (!pm) {
    return { status: 'skipped', reason: 'No package.json found', packageManager: null };
  }
  if (!fs.existsSync(path.join(cwd, 'node_modules'))) {
    return {
      status: 'skipped',
      reason: 'node_modules not found — run install before auditing dependencies',
      packageManager: pm,
    };
  }

  const [cmd, args] = auditCommandFor(pm);
  const { stdout, error } = safeExec(cmd, args, cwd);

  if (!stdout || !stdout.trim()) {
    return {
      status: 'error',
      reason: error ? `Failed to run "${cmd} ${args.join(' ')}": ${error.message}` : 'No output from audit command',
      packageManager: pm,
    };
  }

  let parsed = null;
  if (pm === 'yarn') {
    parsed = parseYarnNdjson(stdout);
  } else {
    try {
      const json = JSON.parse(stdout);
      parsed = parseNpmStyle(json);
    } catch (_) {
      parsed = parseYarnNdjson(stdout); // some npm versions/registries emit ndjson too
    }
  }

  if (!parsed) {
    return { status: 'ok', packageManager: pm, counts: { ...EMPTY_COUNTS }, packages: [], total: 0 };
  }

  return { status: 'ok', packageManager: pm, ...parsed };
}

module.exports = { runVulnerabilityScan, detectPackageManager, parseNpmStyle, parseYarnNdjson };

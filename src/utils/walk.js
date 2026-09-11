'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  '.turbo',
  '.vercel',
  '.svelte-kit',
  'vendor',
]);

const CODE_EXTENSIONS = new Set([
  '.js', '.jsx', '.mjs', '.cjs',
  '.ts', '.tsx', '.mts', '.cts',
  '.vue', '.svelte',
]);

function readGitignorePatterns(rootDir) {
  const patterns = [];
  try {
    const content = fs.readFileSync(path.join(rootDir, '.gitignore'), 'utf8');
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      patterns.push(line.replace(/^\/+/, '').replace(/\/+$/, ''));
    }
  } catch (_) {
    // no .gitignore, that's fine
  }
  return patterns;
}

function isIgnoredByGitignore(relPath, patterns) {
  for (const pattern of patterns) {
    if (!pattern) continue;
    if (relPath === pattern) return true;
    if (relPath.startsWith(pattern + path.sep)) return true;
    // simple trailing wildcard support, e.g. "*.log"
    if (pattern.startsWith('*.') && relPath.endsWith(pattern.slice(1))) return true;
  }
  return false;
}

/**
 * Recursively walk a directory, skipping common build/dependency folders
 * and anything matched by a top-level .gitignore (best-effort, not full glob support).
 */
function walk(rootDir, options = {}) {
  const {
    extraIgnoreDirs = [],
    onlyExtensions = null,
    maxFileSizeBytes = 5 * 1024 * 1024,
  } = options;

  const ignoreDirs = new Set([...DEFAULT_IGNORE_DIRS, ...extraIgnoreDirs]);
  const gitignorePatterns = readGitignorePatterns(rootDir);
  const results = [];

  function visit(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(rootDir, fullPath);

      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name)) continue;
        if (isIgnoredByGitignore(relPath, gitignorePatterns)) continue;
        visit(fullPath);
      } else if (entry.isFile()) {
        if (isIgnoredByGitignore(relPath, gitignorePatterns)) continue;
        const ext = path.extname(entry.name);
        if (onlyExtensions && !onlyExtensions.has(ext)) continue;

        let stat;
        try {
          stat = fs.statSync(fullPath);
        } catch (_) {
          continue;
        }
        if (stat.size > maxFileSizeBytes) continue;

        results.push({ absPath: fullPath, relPath, size: stat.size, ext });
      }
    }
  }

  visit(rootDir);
  return results;
}

module.exports = { walk, DEFAULT_IGNORE_DIRS, CODE_EXTENSIONS };

'use strict';

const { execFileSync } = require('child_process');

function run(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (_) {
    return null;
  }
}

function isGitRepo(cwd) {
  const out = run(['rev-parse', '--is-inside-work-tree'], cwd);
  return out !== null && out.trim() === 'true';
}

function getRepoRoot(cwd) {
  const out = run(['rev-parse', '--show-toplevel'], cwd);
  return out ? out.trim() : cwd;
}

function getStagedFiles(cwd) {
  const out = run(['diff', '--cached', '--name-only', '--diff-filter=ACM'], cwd);
  if (out === null) return [];
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

function getTrackedFiles(cwd) {
  const out = run(['ls-files'], cwd);
  if (out === null) return [];
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

module.exports = { isGitRepo, getRepoRoot, getStagedFiles, getTrackedFiles };

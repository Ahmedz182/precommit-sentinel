'use strict';

const fs = require('fs');
const path = require('path');
const git = require('./utils/git');

const MARKER_START = '# >>> precommit-sentinel >>>';
const MARKER_END = '# <<< precommit-sentinel <<<';

const HOOK_SNIPPET = `${MARKER_START}
npx --no-install precommit-sentinel scan
SENTINEL_EXIT=$?
if [ $SENTINEL_EXIT -ne 0 ]; then
  exit $SENTINEL_EXIT
fi
${MARKER_END}`;

function installHook(cwd = process.cwd()) {
  if (!git.isGitRepo(cwd)) {
    return { installed: false, reason: 'Not a git repository' };
  }

  const repoRoot = git.getRepoRoot(cwd);
  const hooksDir = path.join(repoRoot, '.git', 'hooks');
  const hookPath = path.join(hooksDir, 'pre-commit');

  if (!fs.existsSync(hooksDir)) {
    return { installed: false, reason: `.git/hooks directory not found at ${hooksDir}` };
  }

  let existing = '';
  if (fs.existsSync(hookPath)) {
    existing = fs.readFileSync(hookPath, 'utf8');
    if (existing.includes(MARKER_START)) {
      return { installed: false, reason: 'Hook already installed', hookPath };
    }
  }

  const content = existing.trim().length
    ? `${existing.trimEnd()}\n\n${HOOK_SNIPPET}\n`
    : `#!/bin/sh\n${HOOK_SNIPPET}\n`;

  fs.writeFileSync(hookPath, content, { mode: 0o755 });
  fs.chmodSync(hookPath, 0o755);

  return { installed: true, hookPath, appended: existing.trim().length > 0 };
}

function uninstallHook(cwd = process.cwd()) {
  if (!git.isGitRepo(cwd)) {
    return { removed: false, reason: 'Not a git repository' };
  }
  const repoRoot = git.getRepoRoot(cwd);
  const hookPath = path.join(repoRoot, '.git', 'hooks', 'pre-commit');

  if (!fs.existsSync(hookPath)) {
    return { removed: false, reason: 'No pre-commit hook found' };
  }

  const content = fs.readFileSync(hookPath, 'utf8');
  if (!content.includes(MARKER_START)) {
    return { removed: false, reason: 'precommit-sentinel block not found in hook' };
  }

  const cleaned = content.replace(new RegExp(`\\n?${MARKER_START}[\\s\\S]*?${MARKER_END}\\n?`), '\n');
  const trimmed = cleaned.trim();

  if (!trimmed || trimmed === '#!/bin/sh') {
    fs.unlinkSync(hookPath);
    return { removed: true, deleted: true };
  }

  fs.writeFileSync(hookPath, cleaned, { mode: 0o755 });
  return { removed: true, deleted: false };
}

module.exports = { installHook, uninstallHook };

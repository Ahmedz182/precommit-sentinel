'use strict';

// Best-effort, non-blocking: never fail install because of this script.
try {
  const path = require('path');
  const git = require('../src/utils/git');

  // Skip entirely when this package is installed as a dependency inside
  // another package's node_modules — only nudge when it's a direct devDependency
  // at the project root (npm/pnpm set INIT_CWD to the directory `install` was run from).
  const projectRoot = process.env.INIT_CWD || process.cwd();
  // __dirname is <project>/node_modules/precommit-sentinel/scripts when installed as a dependency.
  if (path.basename(path.dirname(path.dirname(__dirname))) !== 'node_modules') {
    // running from a local clone/dev checkout, nothing to do
    process.exit(0);
  }

  if (git.isGitRepo(projectRoot)) {
    console.log('');
    console.log('precommit-sentinel installed. Run `npx precommit-sentinel install-hook` to enable it as a git pre-commit check.');
    console.log('');
  }
} catch (_) {
  // never break installs
}

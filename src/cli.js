'use strict';

const fs = require('fs');
const path = require('path');
const { runScan } = require('./index');
const { printReport } = require('./report');
const { installHook, uninstallHook } = require('./installHook');
const c = require('./utils/color');

const HELP = `precommit-sentinel — scan for vulnerabilities/secrets and report code quality, modularity & scalability

Usage:
  precommit-sentinel [command] [options]

Commands:
  scan            Run the scanner (default). In a git repo, restricts fast checks to staged files.
  report          Full-project scan, informational only (never blocks, ignores staged-only mode).
  install-hook    Install a git pre-commit hook that runs "precommit-sentinel scan".
  uninstall-hook  Remove the git pre-commit hook installed by this tool.
  init            Write a default precommit-sentinel.config.js to the project root.
  help            Show this help message.

Options:
  --json          Print the raw JSON report instead of the formatted report.
  --full          Scan all tracked files, not just staged ones.
  --no-block      Always exit 0, even if blocking issues are found.
  --quiet         Suppress verbose per-finding detail lines.
`;

const CONFIG_TEMPLATE = `module.exports = {
  // Severities from npm/pnpm/yarn audit that block a commit.
  blockOnVulnerabilitySeverities: ['critical', 'high'],
  // Block the commit if any secret-like pattern is found in staged files.
  blockOnSecrets: true,
  // Code quality / modularity findings are informational by default; set true to block on them too.
  blockOnQuality: false,

  thresholds: {
    maxFileLines: 500,
    maxFunctionLines: 80,
    maxCyclomaticComplexity: 15,
    maxImportFanOut: 20,
    maxDependencies: 150,
    maxDirectoryDepth: 8,
  },

  // Extra directory names to skip, beyond the built-in defaults (node_modules, dist, build, ...).
  ignore: [],

  // Restrict secrets/quality scanners to staged files when running as a pre-commit hook.
  scanStagedOnlyInHook: true,
};
`;

function parseArgs(argv) {
  const args = { command: 'scan', json: false, full: false, block: true, quiet: false };
  const rest = [];

  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--full') args.full = true;
    else if (arg === '--no-block') args.block = false;
    else if (arg === '--quiet') args.quiet = true;
    else if (arg === '-h' || arg === '--help') args.command = 'help';
    else rest.push(arg);
  }

  if (rest.length > 0 && !rest[0].startsWith('-')) {
    args.command = rest[0];
  }

  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  const cwd = process.cwd();

  switch (args.command) {
    case 'help': {
      process.stdout.write(HELP);
      return 0;
    }

    case 'init': {
      const target = path.join(cwd, 'precommit-sentinel.config.js');
      if (fs.existsSync(target)) {
        console.log(c.yellow(`Config already exists at ${target}`));
        return 0;
      }
      fs.writeFileSync(target, CONFIG_TEMPLATE);
      console.log(c.green(`Created ${target}`));
      return 0;
    }

    case 'install-hook': {
      const result = installHook(cwd);
      if (result.installed) {
        console.log(c.green(`Installed pre-commit hook at ${result.hookPath}`));
      } else {
        console.log(c.yellow(`Hook not installed: ${result.reason}`));
      }
      return 0;
    }

    case 'uninstall-hook': {
      const result = uninstallHook(cwd);
      if (result.removed) {
        console.log(c.green('Removed precommit-sentinel from the pre-commit hook.'));
      } else {
        console.log(c.yellow(`Nothing removed: ${result.reason}`));
      }
      return 0;
    }

    case 'report':
    case 'scan': {
      const staged = args.command === 'scan' && !args.full;
      const report = runScan({ cwd, staged });

      if (args.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(printReport(report, { verbose: !args.quiet }));
      }

      const shouldBlock = args.command === 'scan' && args.block && report.blocking;
      return shouldBlock ? 1 : 0;
    }

    default: {
      console.error(c.red(`Unknown command: ${args.command}\n`));
      process.stdout.write(HELP);
      return 1;
    }
  }
}

module.exports = { main };

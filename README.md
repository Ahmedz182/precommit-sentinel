# precommit-sentinel

A zero-dependency npm/pnpm package that scans your project **before every commit** and tells you, in one report:

- **Vulnerabilities** — wraps `npm audit` / `pnpm audit` / `yarn audit` and summarizes results by severity.
- **Secrets** — regex-based detection of AWS keys, private keys, GitHub/Slack/Stripe tokens, hardcoded passwords, DB connection strings with credentials, etc.
- **Code quality** — long files, long functions, high cyclomatic complexity, leftover `debugger` statements, `TODO`/`FIXME` counts, duplicated code blocks.
- **Modularity** — circular dependency detection, per-file import fan-out (coupling), orphan modules.
- **Scalability** — dependency count, directory nesting depth, largest files, whether the project has any tests at all.

Everything is scored (0–100, A–F) and rolled into one overall grade. Commits are blocked by default only on **critical/high vulnerabilities** and **detected secrets** — code quality/modularity/scalability findings are informational unless you opt in to blocking on them too.

No dependencies are installed — it uses Node's built-ins and shells out to your existing package manager for the audit step.

## Install

```bash
npm install --save-dev precommit-sentinel
# or
pnpm add -D precommit-sentinel
```

## Set up the git hook

```bash
npx precommit-sentinel install-hook
```

This appends a small block to `.git/hooks/pre-commit` (creating the file if needed, and leaving any existing hook content alone). Every `git commit` will now run a fast scan restricted to your **staged files** and block the commit if a blocking issue is found.

To remove it:

```bash
npx precommit-sentinel uninstall-hook
```

If you use [Husky](https://typicode.github.io/husky/), skip `install-hook` and instead add this line to `.husky/pre-commit`:

```bash
npx precommit-sentinel scan
```

## Usage

```bash
precommit-sentinel scan            # staged files only (what the git hook runs)
precommit-sentinel scan --full     # scan the whole project, still exits non-zero on blocking issues
precommit-sentinel report          # full-project scan, informational only, never blocks
precommit-sentinel init            # write a default precommit-sentinel.config.js
precommit-sentinel install-hook    # install the git pre-commit hook
precommit-sentinel uninstall-hook  # remove it
```

Flags: `--json` (machine-readable output), `--no-block` (always exit 0), `--quiet` (less verbose).

## Configuration

Run `precommit-sentinel init` to generate `precommit-sentinel.config.js`, or add a `precommitSentinel` key to `package.json`:

```js
module.exports = {
  blockOnVulnerabilitySeverities: ['critical', 'high'],
  blockOnSecrets: true,
  blockOnQuality: false,

  thresholds: {
    maxFileLines: 500,
    maxFunctionLines: 80,
    maxCyclomaticComplexity: 15,
    maxImportFanOut: 20,
    maxDependencies: 150,
    maxDirectoryDepth: 8,
  },

  ignore: [],                    // extra directory names to skip
  scanStagedOnlyInHook: true,
};
```

## Suppressing a known false positive

Add a comment on the same line as the flagged value:

```js
const key = "AKIA_EXAMPLE_NOT_REAL"; // precommit-sentinel-ignore
```

(`pragma: allowlist-secret` also works, for compatibility with other scanners' conventions.)

## Programmatic use

```js
const { runScan } = require('precommit-sentinel');

const report = runScan({ cwd: process.cwd(), staged: false });
console.log(report.overall, report.grade, report.blocking);
```

## Limitations

This is a fast, dependency-free heuristic scanner, not a full AST-based linter or a CVE database client:

- Complexity/function-length analysis uses brace-matching + keyword counting, not a real parser — it can misjudge unusual formatting.
- Secret detection is regex-based and will occasionally flag high-entropy strings that aren't secrets (suppress with the comment above) or miss obfuscated ones.
- Vulnerability data is only as good as your package manager's audit database and requires `node_modules` to be installed.

For deeper static analysis, pair this with ESLint; for authoritative vulnerability data, pair it with Snyk/Dependabot. `precommit-sentinel` is meant to be the fast, zero-setup first line of defense that runs on every commit.

## License

MIT

# precommit-sentinel

A **zero-dependency** npm/pnpm CLI that scans your project before every commit and gives you one report covering:

| Category | What it checks |
|---|---|
| 🔒 **Vulnerabilities** | Wraps `npm audit` / `pnpm audit` / `yarn audit` and summarizes known CVEs in your dependencies by severity |
| 🔑 **Secrets** | Regex-based detection of AWS keys, private keys, GitHub/Slack/Stripe tokens, hardcoded passwords, DB connection strings with embedded credentials |
| 🧹 **Code quality** | Long files, long functions, high cyclomatic complexity, leftover `debugger` statements, `TODO`/`FIXME` counts, duplicated code blocks |
| 🧩 **Modularity** | Circular dependency detection, per-file import fan-out (coupling), orphan modules |
| 📈 **Scalability** | Dependency count, directory nesting depth, largest files, whether the project has any tests |

Everything rolls up into a **0–100 score with an A–F grade**, overall and per category. By default a commit is only **blocked** on critical/high vulnerabilities or a detected secret — code quality, modularity, and scalability findings are informational unless you turn on `blockOnQuality`.

It has **no runtime dependencies**: it uses Node's built-ins (`fs`, `child_process`, regex) and shells out to whichever package manager your project already uses for the audit step. Nothing extra gets installed.

---

## Table of contents

1. [Requirements](#1-requirements)
2. [Step 1 — Install](#2-step-1--install)
3. [Step 2 — Run your first scan](#3-step-2--run-your-first-scan)
4. [Step 3 — Reading the report](#4-step-3--reading-the-report)
5. [Step 4 — Install the git hook](#5-step-4--install-the-git-hook)
6. [Step 5 — Try it end-to-end](#6-step-5--try-it-end-to-end)
7. [Using it with Husky instead](#7-using-it-with-husky-instead)
8. [All commands](#8-all-commands)
9. [All flags](#9-all-flags)
10. [Configuration reference](#10-configuration-reference)
11. [Suppressing a false positive](#11-suppressing-a-false-positive)
12. [CI usage](#12-ci-usage)
13. [Programmatic API](#13-programmatic-api)
14. [Uninstalling](#14-uninstalling)
15. [Troubleshooting](#15-troubleshooting)
16. [How each scanner works](#16-how-each-scanner-works)
17. [Limitations](#17-limitations)
18. [Development](#18-development)

---

## 1. Requirements

- Node.js 16 or newer
- A git repository (for the pre-commit hook and staged-file scanning; `report` mode works without git too)
- npm, pnpm, or yarn (whichever you already use — the tool detects it from your lockfile)

---

## 2. Step 1 — Install

From your project root:

```bash
npm install --save-dev precommit-sentinel
```

or with pnpm:

```bash
pnpm add -D precommit-sentinel
```

or with yarn:

```bash
yarn add -D precommit-sentinel
```

This adds one entry to `devDependencies` and installs nothing else — check `node_modules/precommit-sentinel` and you'll find no nested `node_modules` of its own.

---

## 3. Step 2 — Run your first scan

Before wiring up any git hook, just try it manually so you can see what it finds:

```bash
npx precommit-sentinel report
```

`report` always scans the **whole project** and never blocks (exit code is always `0`), so it's the safest way to see a baseline before enabling enforcement.

---

## 4. Step 3 — Reading the report

A run looks like this:

```
precommit-sentinel report
──────────────────────────────────────────────────

Vulnerabilities  PASS
  critical: 0  high: 0  moderate: 0  low: 0  (via npm audit)

Secrets  FAIL
  [high] Hardcoded Password — src/config.js:14
    const password = "hunter2superSecret";

Code Quality  90/100 (A)
  files scanned: 42
  1 function(s) exceed length threshold
  1 function(s) exceed complexity threshold
  4 TODO/FIXME comment(s)
    long function: src/report.js:108 (101 lines)
    complex function: src/report.js:108 (complexity 35)

Modularity  100/100 (A)
  files analyzed: 38, avg internal fan-out: 1.11
  no circular dependencies detected

Scalability  100/100 (A)
  38 source files, 1571 lines of code
  dependencies: 3 runtime, 12 dev
  max directory depth: 2
  largest files:
    src/report.js (211 lines)
    src/scanners/quality.js (185 lines)

──────────────────────────────────────────────────
Overall score: 92/100 (A)

COMMIT BLOCKED:
  - 1 potential secret(s) found in code
```

How to read it:

- Each of the 5 sections shows either a **PASS/FAIL** badge (vulnerabilities, secrets) or a **score/grade** (quality, modularity, scalability) — all five feed into the weighted overall score at the bottom (30% vulnerabilities, 20% secrets, 20% quality, 15% modularity, 15% scalability).
- The **`COMMIT BLOCKED`** section only appears when something matches your blocking rules (see [§10](#10-configuration-reference)). If nothing is blocking, you'll see `No blocking issues found.` instead.
- Findings for quality/modularity/scalability are shown even when they don't block, so you always see the full picture — blocking is just about what stops the commit.

---

## 5. Step 4 — Install the git hook

Once you're happy with the config, wire it into git so it runs automatically on every `git commit`:

```bash
npx precommit-sentinel install-hook
```

What this does:

- Writes (or appends to) `.git/hooks/pre-commit`, wrapped in `# >>> precommit-sentinel >>>` / `# <<< precommit-sentinel <<<` markers.
- If you already have a pre-commit hook (from another tool), it's left alone — the sentinel block is appended after it, not overwritten.
- Makes the hook file executable.
- Running `install-hook` a second time is a no-op ("Hook already installed") rather than duplicating the block.

From now on, `git commit` will:

1. Run `precommit-sentinel scan` automatically.
2. Restrict the fast checks (secrets, code quality) to your **staged files only** — vulnerabilities/modularity/scalability are still evaluated project-wide since they're not really per-file concepts.
3. Abort the commit if a blocking issue is found, printing the report so you can see exactly why.

---

## 6. Step 5 — Try it end-to-end

Confirm the hook actually blocks a bad commit:

```bash
echo 'const dbPassword = "Sup3rSecretPassw0rd!";' >> src/example.js
git add src/example.js
git commit -m "test"
```

You should see the report print and the commit refuse to go through (non-zero exit from the hook). Remove the line, `git add` again, and the same commit should now succeed.

---

## 7. Using it with Husky instead

If your project already manages git hooks with [Husky](https://typicode.github.io/husky/), don't run `install-hook` — just add one line to your existing hook file instead:

```bash
# .husky/pre-commit
npx precommit-sentinel scan
```

Husky will handle making it executable and running it at the right time; precommit-sentinel doesn't need to touch `.git/hooks` at all in that setup.

---

## 8. All commands

| Command | What it does | Blocks? |
|---|---|---|
| `scan` (default) | Runs the scanner. In a git repo with staged changes, restricts secrets/quality checks to staged files. If nothing is staged, falls back to scanning the whole project. | Yes, unless `--no-block` |
| `scan --full` | Same as `scan`, but always scans every tracked/walked file regardless of what's staged. | Yes, unless `--no-block` |
| `report` | Full-project scan. Equivalent to `scan --full --no-block` — always exits `0`. | Never |
| `install-hook` | Installs the git pre-commit hook described in [§5](#5-step-4--install-the-git-hook). | — |
| `uninstall-hook` | Removes just the precommit-sentinel block from `.git/hooks/pre-commit`. If that block was the entire file, the file is deleted; otherwise the rest of your hook is preserved. | — |
| `init` | Writes a `precommit-sentinel.config.js` with all defaults spelled out, ready to edit. Won't overwrite an existing one. | — |
| `help` / `-h` | Prints usage. | — |

---

## 9. All flags

| Flag | Effect |
|---|---|
| `--json` | Print the full report as JSON instead of the formatted text report — useful for CI or piping into other tools. |
| `--full` | Scan all files the walker finds, not just staged ones (only meaningful with `scan`). |
| `--no-block` | Always exit `0`, even if blocking issues are found. The report still prints and still shows `COMMIT BLOCKED` if applicable — this flag only changes the exit code. |
| `--quiet` | Hide the verbose per-finding detail lines (code snippets, individual long-function locations, etc.) and just show the summary counts. |

Flags can be combined, e.g. `precommit-sentinel scan --full --json --quiet`.

---

## 10. Configuration reference

Generate a starting point with:

```bash
npx precommit-sentinel init
```

which writes `precommit-sentinel.config.js` at your project root:

```js
module.exports = {
  // Severities from npm/pnpm/yarn audit that block a commit.
  blockOnVulnerabilitySeverities: ['critical', 'high'],

  // Block the commit if any secret-like pattern is found in scanned files.
  blockOnSecrets: true,

  // Code quality / modularity findings (long functions, cycles, debugger
  // statements, etc.) are informational by default; set true to block on them too.
  blockOnQuality: false,

  thresholds: {
    maxFileLines: 500,            // flag files longer than this
    maxFunctionLines: 80,         // flag functions longer than this
    maxCyclomaticComplexity: 15,  // flag functions more "branchy" than this
    maxImportFanOut: 20,          // flag files that internally import more than this many modules
    maxDependencies: 150,         // flag package.json if dependencies + devDependencies exceeds this
    maxDirectoryDepth: 8,         // flag if any file lives this many folders deep
  },

  // Extra directory names to skip during scanning, on top of the built-in
  // defaults (node_modules, .git, dist, build, coverage, .next, .cache, ...).
  ignore: [],

  // In hook mode, restrict the fast scanners (secrets, quality) to staged
  // files only. Set false to always scan the whole project even from the hook.
  scanStagedOnlyInHook: true,
};
```

Alternative config locations (checked in this order, first match wins):

1. `precommit-sentinel.config.js`
2. `.precommit-sentinel.js`
3. `.precommit-sentinelrc.json`
4. a `"precommitSentinel"` key inside `package.json`:

```json
{
  "name": "my-app",
  "precommitSentinel": {
    "blockOnSecrets": false,
    "thresholds": { "maxFileLines": 800 }
  }
}
```

You only need to specify the keys you want to override — everything else falls back to the defaults shown above (deep-merged, so `thresholds: { maxFileLines: 800 }` alone won't reset the other thresholds).

### What each blocking option actually controls

- **`blockOnVulnerabilitySeverities`** — an array subset of `['critical', 'high', 'moderate', 'low']`. Any severity you list, if present in the audit output, adds a blocking reason.
- **`blockOnSecrets`** — boolean. If `true`, any secret finding (regardless of its own severity label) blocks.
- **`blockOnQuality`** — boolean. If `true`, adds blocking reasons for leftover `debugger` statements and circular dependency chains found by the quality/modularity scanners. (Long files/functions and TODOs never block even with this on — they're reported but treated as pure style signals.)

---

## 11. Suppressing a false positive

Secret detection is regex-based, so it will occasionally flag something that isn't a real secret (a test fixture, an example value, a high-entropy string that happens to match a pattern). Suppress a specific line with a trailing comment:

```js
const key = "AKIA_EXAMPLE_NOT_REAL_1234567"; // precommit-sentinel-ignore
```

For compatibility with other scanners you may already use, this also works:

```js
const key = "AKIA_EXAMPLE_NOT_REAL_1234567"; // pragma: allowlist-secret
```

Obvious placeholders (`YOUR_API_KEY_HERE`, `example`, `changeme`, `xxxx...`, `0000...`, `<PLACEHOLDER>`) are already ignored automatically — you shouldn't need the comment for those.

---

## 12. CI usage

Run a full, blocking scan in CI the same way the hook does locally:

```bash
npx precommit-sentinel scan --full
```

The process exit code is non-zero when blocking issues are found, so most CI systems will fail the job automatically. For a machine-readable artifact instead:

```bash
npx precommit-sentinel scan --full --json > sentinel-report.json
```

---

## 13. Programmatic API

```js
const { runScan, loadConfig } = require('precommit-sentinel');

const report = runScan({ cwd: process.cwd(), staged: false });

console.log(report.overall);        // 0-100
console.log(report.grade);          // 'A' | 'B' | 'C' | 'D' | 'F'
console.log(report.blocking);       // boolean
console.log(report.blockingReasons);// string[]
console.log(report.scores);         // { vulnerabilities, secrets, quality, modularity, scalability }
console.log(report.secrets.findings);       // detailed secret findings
console.log(report.quality.longFunctions);  // detailed quality findings
console.log(report.modularity.cycles);      // circular dependency chains
```

`runScan(options)`:

| Option | Default | Meaning |
|---|---|---|
| `cwd` | `process.cwd()` | Project root to scan |
| `staged` | value of `scanStagedOnlyInHook` from config | Restrict secrets/quality scanners to `git diff --cached` files |

---

## 14. Uninstalling

Remove the git hook first, then the package:

```bash
npx precommit-sentinel uninstall-hook
npm uninstall precommit-sentinel
```

`uninstall-hook` only removes the block it added — if you had other hook logic before installing, that logic is preserved.

---

## 15. Troubleshooting

**"Vulnerabilities: SKIPPED — node_modules not found"**
Run `npm install` / `pnpm install` first. The audit step needs an installed dependency tree to check against; there's nothing to reason about before that.

**The hook doesn't seem to run at all**
Check the file exists and is executable: `ls -l .git/hooks/pre-commit`. If you're using Husky, make sure you didn't also run `install-hook` (the two approaches shouldn't be combined).

**`npx precommit-sentinel` fails inside the hook with "command not found"**
The hook uses `npx --no-install`, which requires the package to already be in your `node_modules` (i.e. installed as a `devDependency`, per [§2](#2-step-1--install)) rather than fetched on the fly.

**A secret finding is a false positive**
See [§11](#11-suppressing-a-false-positive).

**Score seems harsh on a big legacy file**
Raise the relevant threshold in your config (§10) rather than fighting the defaults — the defaults are tuned for typical modern app code, not vendored or generated files (which should usually just be added to `ignore` instead).

---

## 16. How each scanner works

- **Vulnerabilities** — detects your package manager from the lockfile present (`pnpm-lock.yaml`, `yarn.lock`, or `package-lock.json`), runs its native `audit --json` (or the yarn-classic NDJSON equivalent), and normalizes the result into severity counts and a package list.
- **Secrets** — reads each scanned file (skipping binaries, lockfiles, and minified bundles), and matches ~10 patterns (AWS keys, private key blocks, GitHub/Slack/Stripe tokens, JWTs, generic `key`/`secret`/`password` assignments, DB connection strings) line by line, filtering out obvious placeholder values.
- **Code quality** — strips string/comment contents to avoid false triggers, then walks each JS/TS-family file tracking brace depth to approximate function boundaries; counts branching keywords (`if`, `for`, `while`, `case`, `catch`, `&&`, `||`) inside each function as a cyclomatic-complexity proxy. Also flags `TODO`/`FIXME`/`HACK`, `debugger;` statements, `console.*` calls, and lines duplicated 3+ times across the project.
- **Modularity** — extracts `require(...)`/`import ... from ...` specifiers from every file, resolves relative imports against the filesystem to build a directed import graph, then runs a DFS to find circular dependency chains and computes per-file fan-out (how many internal modules each file imports) as a coupling signal.
- **Scalability** — counts source files and total lines, reads dependency counts from `package.json`, measures maximum directory nesting depth, lists the largest files by line count, and checks whether any test files (`*.test.js`, `*.spec.ts`, `__tests__/`, etc.) exist at all.

---

## 17. Limitations

This is a fast, dependency-free **heuristic** scanner — not a full AST-based linter or a CVE database client. Trade-offs to know about:

- Complexity/function-length analysis uses brace-matching + keyword counting rather than a real parser, so unusual formatting (e.g. braces inside template literals it fails to strip) can throw it off occasionally.
- Secret detection is regex-based: it can flag a high-entropy string that isn't actually a secret (suppress with the comment in §11), and it can miss a secret that's been split, encoded, or otherwise obfuscated.
- Vulnerability data is only as good as your package manager's audit database, and requires `node_modules` to already be installed.
- The import graph only follows relative (`./`, `../`) specifiers — it doesn't resolve TypeScript path aliases or monorepo package references, so cross-package cycles in those setups won't be caught.

For deeper static analysis, pair this with ESLint/TypeScript; for authoritative, continuously updated vulnerability data, pair it with Snyk/Dependabot/GitHub Advanced Security. `precommit-sentinel` is meant to be the fast, zero-setup first line of defense that runs on every single commit, not a replacement for those tools.

---

## 18. Development

Clone the repo and run the test suite (Node's built-in test runner, no dependencies needed):

```bash
npm test
```

Try the CLI against the tool's own source as a live example:

```bash
node bin/precommit-sentinel.js report
```

Project layout:

```
bin/precommit-sentinel.js   CLI entry point (shebang script)
src/cli.js                  argument parsing + command dispatch
src/index.js                orchestrates all scanners into one report
src/config.js               config file discovery + defaults merge
src/report.js               scoring, grading, and console/JSON output
src/installHook.js          git pre-commit hook install/uninstall
src/scanners/*.js           one file per category (vulnerabilities, secrets, quality, modularity, scalability)
src/utils/*.js              git helpers, file-tree walker, ANSI color helpers
test/*.test.js              unit tests for the regex patterns, parsers, and heuristics
```

## License

MIT

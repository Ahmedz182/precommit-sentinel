'use strict';

const c = require('./utils/color');

const SEVERITY_WEIGHT = { critical: 40, high: 20, moderate: 8, low: 3, info: 1 };

function scoreVulnerabilities(vuln) {
  if (vuln.status !== 'ok') return 100;
  const counts = vuln.counts || {};
  let penalty = 0;
  for (const [severity, weight] of Object.entries(SEVERITY_WEIGHT)) {
    penalty += (counts[severity] || 0) * weight;
  }
  return Math.max(0, 100 - penalty);
}

function scoreSecrets(secrets) {
  if (!secrets.findings.length) return 100;
  const penalty = secrets.findings.reduce((sum, f) => sum + (SEVERITY_WEIGHT[f.severity] || 10), 0);
  return Math.max(0, 100 - penalty);
}

function scoreQuality(quality) {
  let penalty = 0;
  penalty += quality.longFiles.length * 4;
  penalty += quality.longFunctions.length * 3;
  penalty += quality.highComplexityFunctions.length * 5;
  penalty += Math.min(quality.debuggerCount * 5, 20);
  penalty += Math.min(quality.todoCount * 0.5, 15);
  penalty += Math.min(quality.duplicateLines.length * 2, 20);
  return Math.max(0, 100 - penalty);
}

function scoreModularity(mod) {
  let penalty = 0;
  penalty += mod.cycles.length * 15;
  penalty += mod.highFanOutFiles.length * 5;
  return Math.max(0, 100 - penalty);
}

function scoreScalability(scal) {
  let penalty = 0;
  if (scal.tooManyDependencies) penalty += 15;
  if (scal.directoryTooDeep) penalty += 10;
  if (!scal.hasTests && scal.fileCount > 5) penalty += 20;
  const oversizedFiles = scal.largestFiles.filter((f) => f.lines > 800).length;
  penalty += oversizedFiles * 5;
  return Math.max(0, 100 - penalty);
}

function grade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function buildReport({ vulnerabilities, secrets, quality, modularity, scalability, config }) {
  const scores = {
    vulnerabilities: Math.round(scoreVulnerabilities(vulnerabilities)),
    secrets: Math.round(scoreSecrets(secrets)),
    quality: Math.round(scoreQuality(quality)),
    modularity: Math.round(scoreModularity(modularity)),
    scalability: Math.round(scoreScalability(scalability)),
  };

  const weights = { vulnerabilities: 0.3, secrets: 0.2, quality: 0.2, modularity: 0.15, scalability: 0.15 };
  const overall = Object.entries(weights).reduce((sum, [key, w]) => sum + scores[key] * w, 0);

  const blockingReasons = [];
  if (vulnerabilities.status === 'ok') {
    for (const severity of config.blockOnVulnerabilitySeverities) {
      const count = (vulnerabilities.counts || {})[severity] || 0;
      if (count > 0) blockingReasons.push(`${count} ${severity} vulnerabilit${count === 1 ? 'y' : 'ies'} found`);
    }
  }
  if (config.blockOnSecrets && secrets.findings.length > 0) {
    blockingReasons.push(`${secrets.findings.length} potential secret(s) found in code`);
  }
  if (config.blockOnQuality) {
    if (quality.debuggerCount > 0) blockingReasons.push(`${quality.debuggerCount} debugger statement(s) found`);
    if (modularity.cycles.length > 0) blockingReasons.push(`${modularity.cycles.length} circular dependency chain(s) found`);
  }

  return {
    scores,
    overall: Math.round(overall),
    grade: grade(overall),
    blocking: blockingReasons.length > 0,
    blockingReasons,
    vulnerabilities,
    secrets,
    quality,
    modularity,
    scalability,
  };
}

function statusBadge(ok) {
  return ok ? c.green('PASS') : c.red('FAIL');
}

function badgeFor(text) {
  return c.gray(text);
}

function printReport(report, { verbose = true } = {}) {
  const lines = [];
  const push = (s = '') => lines.push(s);

  push(c.bold(c.cyan('\nprecommit-sentinel report')));
  push(c.gray('─'.repeat(50)));

  // Vulnerabilities
  const v = report.vulnerabilities;
  const vulnBadge =
    v.status === 'ok' ? statusBadge(Object.values(v.counts || {}).every((n) => n === 0)) : badgeFor('SKIPPED');
  push(`\n${c.bold('Vulnerabilities')}  ${vulnBadge}`);
  if (v.status === 'skipped') {
    push(c.gray(`  skipped: ${v.reason}`));
  } else if (v.status === 'error') {
    push(c.yellow(`  could not run audit: ${v.reason}`));
  } else {
    const counts = v.counts;
    push(
      `  ${c.red(`critical: ${counts.critical}`)}  ${c.red(`high: ${counts.high}`)}  ${c.yellow(`moderate: ${counts.moderate}`)}  low: ${counts.low}  (via ${v.packageManager} audit)`
    );
    if (verbose && v.packages && v.packages.length) {
      for (const pkg of v.packages.slice(0, 10)) {
        push(c.gray(`    - ${pkg.name} [${pkg.severity}]${pkg.fixAvailable ? ' (fix available)' : ''}`));
      }
      if (v.packages.length > 10) push(c.gray(`    ... and ${v.packages.length - 10} more`));
    }
  }

  // Secrets
  const s = report.secrets;
  push(`\n${c.bold('Secrets')}  ${statusBadge(s.findings.length === 0)}`);
  if (s.findings.length === 0) {
    push(c.gray('  no obvious secrets detected'));
  } else {
    for (const f of s.findings.slice(0, 15)) {
      push(c.red(`  [${f.severity}] ${f.type} — ${f.file}:${f.line}`));
      if (verbose) push(c.gray(`    ${f.snippet}`));
    }
    if (s.findings.length > 15) push(c.gray(`  ... and ${s.findings.length - 15} more`));
  }

  // Quality
  const q = report.quality;
  push(`\n${c.bold('Code Quality')}  ${c.cyan(`${report.scores.quality}/100 (${grade(report.scores.quality)})`)}`);
  push(c.gray(`  files scanned: ${q.filesScanned}`));
  if (q.longFiles.length) push(c.yellow(`  ${q.longFiles.length} file(s) exceed length threshold`));
  if (q.longFunctions.length) push(c.yellow(`  ${q.longFunctions.length} function(s) exceed length threshold`));
  if (q.highComplexityFunctions.length) push(c.yellow(`  ${q.highComplexityFunctions.length} function(s) exceed complexity threshold`));
  if (q.debuggerCount) push(c.red(`  ${q.debuggerCount} debugger statement(s) left in code`));
  if (q.todoCount) push(c.gray(`  ${q.todoCount} TODO/FIXME comment(s)`));
  if (q.duplicateLines.length) push(c.gray(`  ${q.duplicateLines.length} duplicated line group(s) detected`));
  if (verbose) {
    for (const f of q.longFunctions.slice(0, 5)) push(c.gray(`    long function: ${f.file}:${f.line} (${f.lines} lines)`));
    for (const f of q.highComplexityFunctions.slice(0, 5)) push(c.gray(`    complex function: ${f.file}:${f.line} (complexity ${f.complexity})`));
  }

  // Modularity
  const m = report.modularity;
  push(`\n${c.bold('Modularity')}  ${c.cyan(`${report.scores.modularity}/100 (${grade(report.scores.modularity)})`)}`);
  push(c.gray(`  files analyzed: ${m.filesAnalyzed}, avg internal fan-out: ${m.avgFanOut}`));
  if (m.cycles.length) {
    push(c.red(`  ${m.cycles.length} circular dependency chain(s) found:`));
    for (const cycle of m.cycles.slice(0, 5)) push(c.gray(`    ${cycle.join(' -> ')}`));
  } else {
    push(c.gray('  no circular dependencies detected'));
  }
  if (m.highFanOutFiles.length) {
    push(c.yellow(`  ${m.highFanOutFiles.length} file(s) import too many internal modules (high coupling)`));
    if (verbose) {
      for (const f of m.highFanOutFiles.slice(0, 5)) push(c.gray(`    ${f.file} (fan-out ${f.fanOut})`));
    }
  }

  // Scalability
  const sc = report.scalability;
  push(`\n${c.bold('Scalability')}  ${c.cyan(`${report.scores.scalability}/100 (${grade(report.scores.scalability)})`)}`);
  push(c.gray(`  ${sc.fileCount} source files, ${sc.totalLines} lines of code`));
  push(c.gray(`  dependencies: ${sc.dependencyCounts.deps} runtime, ${sc.dependencyCounts.devDeps} dev`));
  if (sc.tooManyDependencies) push(c.yellow('  dependency count is high — audit for unused packages'));
  push(c.gray(`  max directory depth: ${sc.maxDirectoryDepth}`));
  if (sc.directoryTooDeep) push(c.yellow('  directory nesting is deep — consider flattening structure'));
  if (!sc.hasTests) push(c.yellow('  no test files detected'));
  if (verbose && sc.largestFiles.length) {
    push(c.gray('  largest files:'));
    for (const f of sc.largestFiles) push(c.gray(`    ${f.file} (${f.lines} lines)`));
  }

  // Summary
  push(c.gray('\n' + '─'.repeat(50)));
  push(c.bold(`Overall score: ${report.overall}/100 (${report.grade})`));
  if (report.blocking) {
    push(c.red(c.bold('\nCOMMIT BLOCKED:')));
    for (const reason of report.blockingReasons) push(c.red(`  - ${reason}`));
  } else {
    push(c.green('\nNo blocking issues found.'));
  }
  push('');

  return lines.join('\n');
}

module.exports = { buildReport, printReport, grade };

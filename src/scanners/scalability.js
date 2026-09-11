'use strict';

const fs = require('fs');
const path = require('path');

function maxDepthOf(files, rootDir) {
  let max = 0;
  for (const file of files) {
    const depth = file.relPath.split(path.sep).length - 1;
    if (depth > max) max = depth;
  }
  return max;
}

function getDependencyCounts(cwd) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    const deps = Object.keys(pkg.dependencies || {}).length;
    const devDeps = Object.keys(pkg.devDependencies || {}).length;
    return { deps, devDeps, total: deps + devDeps };
  } catch (_) {
    return { deps: 0, devDeps: 0, total: 0 };
  }
}

function hasTestSetup(files) {
  return files.some((f) => /\.(test|spec)\.[jt]sx?$/.test(f.relPath) || /(^|\/)(__tests__|test|tests)\//.test(f.relPath));
}

function runScalabilityScan(files, cwd, thresholds) {
  const codeFiles = files.filter((f) => /\.(js|jsx|ts|tsx|mjs|cjs|vue)$/.test(f.ext));

  const fileLineCounts = codeFiles.map((f) => {
    let lines = 0;
    try {
      lines = fs.readFileSync(f.absPath, 'utf8').split('\n').length;
    } catch (_) {
      lines = 0;
    }
    return { file: f.relPath, lines };
  });

  const totalCodeLines = fileLineCounts.reduce((sum, f) => sum + f.lines, 0);
  const largestFiles = [...fileLineCounts].sort((a, b) => b.lines - a.lines).slice(0, 5);

  const dependencyCounts = getDependencyCounts(cwd);
  const maxDepth = maxDepthOf(codeFiles, cwd);

  return {
    fileCount: codeFiles.length,
    totalLines: totalCodeLines,
    dependencyCounts,
    tooManyDependencies: dependencyCounts.total > thresholds.maxDependencies,
    maxDirectoryDepth: maxDepth,
    directoryTooDeep: maxDepth > thresholds.maxDirectoryDepth,
    largestFiles,
    hasTests: hasTestSetup(files),
  };
}

module.exports = { runScalabilityScan };

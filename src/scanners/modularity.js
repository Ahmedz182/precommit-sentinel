'use strict';

const fs = require('fs');
const path = require('path');

const IMPORT_RE = /(?:import\s+(?:[\w*{}\s,]+\s+from\s+)?|require\s*\(\s*|import\s*\()\s*['"]([^'"]+)['"]/g;

const RESOLVE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue'];

function extractImports(content) {
  const specifiers = [];
  let match;
  IMPORT_RE.lastIndex = 0;
  while ((match = IMPORT_RE.exec(content)) !== null) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

function resolveRelative(fromAbsPath, specifier, existingFilesSet) {
  const baseDir = path.dirname(fromAbsPath);
  const target = path.resolve(baseDir, specifier);

  const candidates = [target, ...RESOLVE_EXTENSIONS.map((ext) => target + ext)];
  for (const ext of RESOLVE_EXTENSIONS) {
    candidates.push(path.join(target, 'index' + ext));
  }

  for (const candidate of candidates) {
    if (existingFilesSet.has(candidate)) return candidate;
  }
  return null;
}

function buildImportGraph(files) {
  const existingFilesSet = new Set(files.map((f) => f.absPath));
  const graph = new Map(); // absPath -> { relPath, internalImports: Set, externalImports: Set }

  for (const file of files) {
    if (!/\.(js|jsx|ts|tsx|mjs|cjs|vue)$/.test(file.ext)) continue;
    let content;
    try {
      content = fs.readFileSync(file.absPath, 'utf8');
    } catch (_) {
      continue;
    }

    const specifiers = extractImports(content);
    const internalImports = new Set();
    const externalImports = new Set();

    for (const specifier of specifiers) {
      if (specifier.startsWith('.')) {
        const resolved = resolveRelative(file.absPath, specifier, existingFilesSet);
        if (resolved && resolved !== file.absPath) internalImports.add(resolved);
      } else {
        externalImports.add(specifier.split('/')[0].startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]);
      }
    }

    graph.set(file.absPath, { relPath: file.relPath, internalImports, externalImports });
  }

  return graph;
}

function findCycles(graph) {
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function dfs(node) {
    visiting.add(node);
    stack.push(node);

    const entry = graph.get(node);
    if (entry) {
      for (const neighbor of entry.internalImports) {
        if (!graph.has(neighbor)) continue;
        if (visiting.has(neighbor)) {
          const cycleStart = stack.indexOf(neighbor);
          const cyclePath = stack.slice(cycleStart).concat(neighbor);
          cycles.push(cyclePath.map((p) => graph.get(p) ? graph.get(p).relPath : p));
        } else if (!visited.has(neighbor)) {
          dfs(neighbor);
        }
      }
    }

    stack.pop();
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) dfs(node);
  }

  // de-duplicate cycles that describe the same loop
  const seen = new Set();
  return cycles.filter((cycle) => {
    const key = [...cycle].sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function runModularityScan(files, thresholds) {
  const graph = buildImportGraph(files);
  const cycles = findCycles(graph);

  const fanOutEntries = [...graph.entries()].map(([absPath, entry]) => ({
    file: entry.relPath,
    fanOut: entry.internalImports.size,
    externalFanOut: entry.externalImports.size,
  }));

  const highFanOutFiles = fanOutEntries
    .filter((e) => e.fanOut > thresholds.maxImportFanOut)
    .sort((a, b) => b.fanOut - a.fanOut);

  const totalFanOut = fanOutEntries.reduce((sum, e) => sum + e.fanOut, 0);
  const avgFanOut = fanOutEntries.length ? totalFanOut / fanOutEntries.length : 0;

  // fan-in: how many files import each file
  const fanIn = new Map();
  for (const entry of graph.values()) {
    for (const target of entry.internalImports) {
      fanIn.set(target, (fanIn.get(target) || 0) + 1);
    }
  }
  const orphanModules = [...graph.entries()]
    .filter(([absPath]) => !fanIn.has(absPath))
    .map(([, entry]) => entry.relPath);

  return {
    filesAnalyzed: graph.size,
    cycles,
    highFanOutFiles,
    avgFanOut: Number(avgFanOut.toFixed(2)),
    orphanModuleCount: orphanModules.length,
  };
}

module.exports = { runModularityScan, buildImportGraph, findCycles };

'use strict';

const fs = require('fs');

const DECISION_KEYWORDS = /\b(if|else if|for|while|case|catch)\b|&&|\|\||\?\./g;
const FUNCTION_START = /(function\s*[*]?\s*[A-Za-z0-9_$]*\s*\([^)]*\)\s*{)|(\([^)]*\)\s*=>\s*{)|([A-Za-z0-9_$]+\s*\([^)]*\)\s*{)/;

function stripStringsAndComments(line) {
  // Best-effort: blank out string/template contents and line comments so brace
  // counting and keyword matching aren't thrown off by braces/keywords inside them.
  return line
    .replace(/\/\/.*$/, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

function countBraces(line) {
  let open = 0;
  let close = 0;
  for (const ch of line) {
    if (ch === '{') open++;
    else if (ch === '}') close++;
  }
  return { open, close };
}

function analyzeFunctions(cleanLines) {
  const functions = [];
  let i = 0;
  while (i < cleanLines.length) {
    if (FUNCTION_START.test(cleanLines[i])) {
      const startLine = i;
      let depth = 0;
      let seenOpen = false;
      let j = i;
      let bodyLines = 0;
      let complexity = 1;

      for (; j < cleanLines.length; j++) {
        const { open, close } = countBraces(cleanLines[j]);
        if (open > 0) seenOpen = true;
        depth += open - close;
        const decisions = cleanLines[j].match(DECISION_KEYWORDS);
        if (decisions) complexity += decisions.length;
        bodyLines++;
        if (seenOpen && depth <= 0) break;
        if (bodyLines > 5000) break; // safety valve against pathological files
      }

      functions.push({
        startLine: startLine + 1,
        endLine: Math.min(j, cleanLines.length - 1) + 1,
        lines: bodyLines,
        complexity,
      });

      i = Math.max(j, i) + 1;
    } else {
      i++;
    }
  }
  return functions;
}

function analyzeFile(absPath, relPath, thresholds) {
  let content;
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch (_) {
    return null;
  }

  const rawLines = content.split('\n');
  const cleanLines = rawLines.map(stripStringsAndComments);

  const totalLines = rawLines.length;
  const longFunctions = [];
  const highComplexityFunctions = [];

  const isJsLike = /\.(js|jsx|mjs|cjs|ts|tsx|mts|cts|vue)$/.test(relPath);
  let functions = [];
  if (isJsLike) {
    functions = analyzeFunctions(cleanLines);
    for (const fn of functions) {
      if (fn.lines > thresholds.maxFunctionLines) {
        longFunctions.push({ file: relPath, line: fn.startLine, lines: fn.lines });
      }
      if (fn.complexity > thresholds.maxCyclomaticComplexity) {
        highComplexityFunctions.push({ file: relPath, line: fn.startLine, complexity: fn.complexity });
      }
    }
  }

  let todoCount = 0;
  let consoleCount = 0;
  let debuggerCount = 0;
  const notableLines = [];

  rawLines.forEach((line, idx) => {
    if (/\b(TODO|FIXME|HACK|XXX)\b/.test(line)) {
      todoCount++;
      notableLines.push({ file: relPath, line: idx + 1, type: 'todo', text: line.trim().slice(0, 120) });
    }
    if (/\bconsole\.(log|debug|warn|error|info)\s*\(/.test(line)) consoleCount++;
    if (/(^|[;{}(),:])\s*debugger\s*;/.test(line)) {
      debuggerCount++;
      notableLines.push({ file: relPath, line: idx + 1, type: 'debugger', text: line.trim().slice(0, 120) });
    }
  });

  return {
    file: relPath,
    totalLines,
    isLong: totalLines > thresholds.maxFileLines,
    longFunctions,
    highComplexityFunctions,
    todoCount,
    consoleCount,
    debuggerCount,
    notableLines,
    functionCount: functions.length,
  };
}

function findDuplicateLines(fileResults, allLinesByFile) {
  const lineOccurrences = new Map();
  for (const [relPath, lines] of allLinesByFile) {
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.length < 60) return;
      if (!lineOccurrences.has(trimmed)) lineOccurrences.set(trimmed, []);
      lineOccurrences.get(trimmed).push({ file: relPath, line: idx + 1 });
    });
  }

  const duplicates = [];
  for (const [text, locations] of lineOccurrences) {
    if (locations.length >= 3) {
      duplicates.push({ text: text.slice(0, 100), occurrences: locations.length, locations: locations.slice(0, 5) });
    }
  }
  return duplicates.sort((a, b) => b.occurrences - a.occurrences).slice(0, 20);
}

function runQualityScan(files, thresholds) {
  const results = [];
  const allLinesByFile = [];

  for (const file of files) {
    const analysis = analyzeFile(file.absPath, file.relPath, thresholds);
    if (!analysis) continue;
    results.push(analysis);
    try {
      const content = fs.readFileSync(file.absPath, 'utf8');
      allLinesByFile.push([file.relPath, content.split('\n')]);
    } catch (_) {
      // ignore
    }
  }

  const longFiles = results.filter((r) => r.isLong).map((r) => ({ file: r.file, lines: r.totalLines }));
  const longFunctions = results.flatMap((r) => r.longFunctions);
  const highComplexityFunctions = results.flatMap((r) => r.highComplexityFunctions);
  const todoCount = results.reduce((sum, r) => sum + r.todoCount, 0);
  const consoleCount = results.reduce((sum, r) => sum + r.consoleCount, 0);
  const debuggerCount = results.reduce((sum, r) => sum + r.debuggerCount, 0);
  const notableLines = results.flatMap((r) => r.notableLines);
  const duplicateLines = findDuplicateLines(results, allLinesByFile);

  return {
    filesScanned: results.length,
    longFiles,
    longFunctions,
    highComplexityFunctions,
    todoCount,
    consoleCount,
    debuggerCount,
    notableLines,
    duplicateLines,
  };
}

module.exports = { runQualityScan, analyzeFile };

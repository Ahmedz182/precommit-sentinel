'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { analyzeFile } = require('../src/scanners/quality');

const thresholds = {
  maxFileLines: 10,
  maxFunctionLines: 5,
  maxCyclomaticComplexity: 3,
};

function writeTempFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-quality-'));
  const file = path.join(dir, 'sample.js');
  fs.writeFileSync(file, content);
  return file;
}

test('flags a file over the max line threshold', () => {
  const content = Array.from({ length: 20 }, (_, i) => `const x${i} = ${i};`).join('\n');
  const file = writeTempFile(content);
  const result = analyzeFile(file, 'sample.js', thresholds);
  assert.strictEqual(result.isLong, true);
});

test('flags an over-complex function', () => {
  const content = `
function complex(a) {
  if (a === 1) { return 1; }
  else if (a === 2) { return 2; }
  else if (a === 3) { return 3; }
  else if (a === 4) { return 4; }
  return 0;
}
`;
  const file = writeTempFile(content);
  const result = analyzeFile(file, 'sample.js', thresholds);
  assert.ok(result.highComplexityFunctions.length > 0);
});

test('counts TODO comments and debugger statements', () => {
  const content = '// TODO: fix this\nfunction f() {\n  debugger;\n  return 1;\n}\n';
  const file = writeTempFile(content);
  const result = analyzeFile(file, 'sample.js', thresholds);
  assert.strictEqual(result.todoCount, 1);
  assert.strictEqual(result.debuggerCount, 1);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runModularityScan } = require('../src/scanners/modularity');

function writeProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-mod-'));
  const entries = [];
  for (const [relPath, content] of Object.entries(files)) {
    const abs = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    entries.push({ absPath: abs, relPath, ext: path.extname(relPath) });
  }
  return entries;
}

const thresholds = { maxImportFanOut: 20 };

test('detects a circular dependency between two files', () => {
  const files = writeProject({
    'a.js': "const b = require('./b');\nmodule.exports = { a: 1 };\n",
    'b.js': "const a = require('./a');\nmodule.exports = { b: 1 };\n",
  });
  const result = runModularityScan(files, thresholds);
  assert.ok(result.cycles.length > 0);
});

test('no cycle for a simple linear dependency chain', () => {
  const files = writeProject({
    'a.js': "const b = require('./b');\nmodule.exports = { a: 1 };\n",
    'b.js': "module.exports = { b: 1 };\n",
  });
  const result = runModularityScan(files, thresholds);
  assert.strictEqual(result.cycles.length, 0);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { scanFileForSecrets } = require('../src/scanners/secrets');

function writeTempFile(content, ext = '.js') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-test-'));
  const file = path.join(dir, `sample${ext}`);
  fs.writeFileSync(file, content);
  return file;
}

test('detects an AWS access key id', () => {
  const file = writeTempFile('const key = "AKIAABCDEFGHIJKLMNOP";\n'); // precommit-sentinel-ignore
  const findings = scanFileForSecrets(file, 'sample.js');
  assert.ok(findings.some((f) => f.type === 'AWS Access Key ID'));
});

test('detects a hardcoded password assignment', () => {
  const file = writeTempFile('const password = "SuperSecret123";\n'); // precommit-sentinel-ignore
  const findings = scanFileForSecrets(file, 'sample.js');
  assert.ok(findings.some((f) => f.type === 'Hardcoded Password'));
});

test('ignores obvious placeholder values', () => {
  const file = writeTempFile('const apiKey = "YOUR_API_KEY_HERE_PLACEHOLDER";\n');
  const findings = scanFileForSecrets(file, 'sample.js');
  assert.strictEqual(findings.length, 0);
});

test('detects a private key block', () => {
  const file = writeTempFile('-----BEGIN RSA PRIVATE KEY-----\nMIIC...\n-----END RSA PRIVATE KEY-----\n'); // precommit-sentinel-ignore
  const findings = scanFileForSecrets(file, 'sample.pem');
  assert.ok(findings.some((f) => f.type === 'Private Key'));
});

test('clean file produces no findings', () => {
  const file = writeTempFile('function add(a, b) {\n  return a + b;\n}\n');
  const findings = scanFileForSecrets(file, 'sample.js');
  assert.strictEqual(findings.length, 0);
});

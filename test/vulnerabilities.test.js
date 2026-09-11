'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { parseNpmStyle, parseYarnNdjson } = require('../src/scanners/vulnerabilities');

test('parses npm 7+ audit JSON and counts severities', () => {
  const json = {
    vulnerabilities: {
      'lodash': { severity: 'high', via: ['Prototype Pollution'], fixAvailable: true },
      'minimist': { severity: 'critical', via: [{ title: 'Prototype Pollution' }], fixAvailable: false },
    },
  };
  const result = parseNpmStyle(json);
  assert.strictEqual(result.counts.high, 1);
  assert.strictEqual(result.counts.critical, 1);
  assert.strictEqual(result.total, 2);
  assert.strictEqual(result.packages[0].name, 'lodash');
});

test('parses legacy npm audit v1 advisories format', () => {
  const json = {
    advisories: {
      '1001': { module_name: 'event-stream', severity: 'critical', title: 'Malicious code', patched_versions: '<0.0.0' },
    },
  };
  const result = parseNpmStyle(json);
  assert.strictEqual(result.counts.critical, 1);
  assert.strictEqual(result.packages[0].fixAvailable, false);
});

test('returns null for unrecognized JSON shape', () => {
  const result = parseNpmStyle({ foo: 'bar' });
  assert.strictEqual(result, null);
});

test('parses yarn classic ndjson audit output', () => {
  const stdout = [
    JSON.stringify({ type: 'auditAdvisory', data: { advisory: { module_name: 'foo', id: 1, severity: 'moderate', title: 'x', patched_versions: '<0.0.0' } } }),
    JSON.stringify({ type: 'auditSummary', data: {} }),
  ].join('\n');
  const result = parseYarnNdjson(stdout);
  assert.strictEqual(result.counts.moderate, 1);
  assert.strictEqual(result.total, 1);
});

'use strict';

const fs = require('fs');
const path = require('path');

const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp', '.pdf',
  '.zip', '.gz', '.tar', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3',
  '.lock',
]);

const SKIP_FILENAME_PATTERNS = [/\.min\.js$/, /package-lock\.json$/, /pnpm-lock\.yaml$/, /yarn\.lock$/];

const BENIGN_VALUE_PATTERNS = [
  /example/i,
  /placeholder/i,
  /your[-_]?api[-_]?key/i,
  /xxxx+/i,
  /0000000000/,
  /changeme/i,
  /dummy/i,
  /<[^>]+>/, // <YOUR_KEY_HERE>
];

const PATTERNS = [
  { name: 'AWS Access Key ID', severity: 'critical', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'AWS Secret Access Key', severity: 'critical', regex: /aws(.{0,20})?(secret|access)?[_-]?key["']?\s*[:=]\s*["'][A-Za-z0-9/+=]{40}["']/gi },
  { name: 'Private Key', severity: 'critical', regex: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g },
  { name: 'GitHub Token', severity: 'critical', regex: /gh[pousr]_[A-Za-z0-9]{30,255}/g },
  { name: 'Slack Token', severity: 'high', regex: /xox[baprs]-[0-9A-Za-z-]{10,72}/g },
  { name: 'Google API Key', severity: 'high', regex: /AIza[0-9A-Za-z\-_]{35}/g },
  { name: 'Stripe Key', severity: 'critical', regex: /(sk|rk)_(live|test)_[0-9A-Za-z]{16,}/g },
  { name: 'JWT', severity: 'medium', regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  {
    name: 'Generic API Key / Secret Assignment',
    severity: 'high',
    regex: /\b(api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)\b\s*[:=]\s*["']([A-Za-z0-9/_\-+=]{12,})["']/gi,
  },
  {
    name: 'Hardcoded Password',
    severity: 'high',
    regex: /\b(password|passwd|pwd)\b\s*[:=]\s*["']([^"'\s]{6,})["']/gi,
  },
  {
    name: 'Database Connection String with Credentials',
    severity: 'high',
    regex: /(mongodb(\+srv)?|postgres(ql)?|mysql|redis):\/\/[^:\s"']+:[^@\s"']+@[^\s"']+/gi,
  },
];

const SUPPRESS_MARKER = /precommit-sentinel-ignore|pragma:\s*allowlist[- ]secret/i;

function isBenign(value) {
  return BENIGN_VALUE_PATTERNS.some((p) => p.test(value));
}

function looksBinary(buffer) {
  const len = Math.min(buffer.length, 512);
  for (let i = 0; i < len; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

function scanFileForSecrets(absPath, relPath) {
  const findings = [];
  const ext = path.extname(absPath);
  if (SKIP_EXTENSIONS.has(ext)) return findings;
  if (SKIP_FILENAME_PATTERNS.some((p) => p.test(relPath))) return findings;

  let buffer;
  try {
    buffer = fs.readFileSync(absPath);
  } catch (_) {
    return findings;
  }
  if (looksBinary(buffer)) return findings;

  const content = buffer.toString('utf8');
  const lines = content.split('\n');

  for (const { name, severity, regex } of PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (SUPPRESS_MARKER.test(line)) continue;
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(line)) !== null) {
        const value = match[2] || match[0];
        if (isBenign(value)) continue;
        findings.push({
          file: relPath,
          line: i + 1,
          type: name,
          severity,
          snippet: line.trim().slice(0, 140),
        });
        if (regex.lastIndex === match.index) regex.lastIndex++; // avoid infinite loop on zero-width match
      }
    }
  }

  return findings;
}

function runSecretScan(files) {
  const findings = [];
  for (const file of files) {
    findings.push(...scanFileForSecrets(file.absPath, file.relPath));
  }
  return {
    status: findings.length > 0 ? 'found' : 'clean',
    findings,
  };
}

module.exports = { runSecretScan, scanFileForSecrets, PATTERNS };

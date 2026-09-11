'use strict';

const path = require('path');
const { loadConfig } = require('./config');
const git = require('./utils/git');
const { walk, CODE_EXTENSIONS } = require('./utils/walk');
const { runVulnerabilityScan } = require('./scanners/vulnerabilities');
const { runSecretScan } = require('./scanners/secrets');
const { runQualityScan } = require('./scanners/quality');
const { runModularityScan } = require('./scanners/modularity');
const { runScalabilityScan } = require('./scanners/scalability');
const { buildReport } = require('./report');

/**
 * Run a full scan of the project.
 *
 * @param {object} options
 * @param {string} [options.cwd] project root
 * @param {boolean} [options.staged] restrict the fast scanners (secrets, quality) to staged files
 * @returns {object} report
 */
function runScan(options = {}) {
  const cwd = options.cwd || process.cwd();
  const config = loadConfig(cwd);
  const useStagedOnly = options.staged !== undefined ? options.staged : config.scanStagedOnlyInHook;

  const allFiles = walk(cwd, { extraIgnoreDirs: config.ignore });

  let targetFiles = allFiles;
  if (useStagedOnly && git.isGitRepo(cwd)) {
    const staged = new Set(git.getStagedFiles(cwd));
    if (staged.size > 0) {
      targetFiles = allFiles.filter((f) => staged.has(f.relPath));
    }
  }

  const vulnerabilities = runVulnerabilityScan(cwd);
  const secrets = runSecretScan(targetFiles);
  const quality = runQualityScan(targetFiles, config.thresholds);
  // Modularity and scalability are project-wide concepts; always analyze the full tree.
  const modularity = runModularityScan(allFiles, config.thresholds);
  const scalability = runScalabilityScan(allFiles, cwd, config.thresholds);

  return buildReport({ vulnerabilities, secrets, quality, modularity, scalability, config });
}

module.exports = { runScan, loadConfig };

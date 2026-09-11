#!/usr/bin/env node
'use strict';

const { main } = require('../src/cli');

const exitCode = main(process.argv.slice(2));
process.exit(exitCode);

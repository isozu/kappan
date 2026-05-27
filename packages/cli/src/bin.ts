#!/usr/bin/env node
import { createCli } from './index.js';

const cli = createCli();
await cli.runExit(process.argv.slice(2), {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
});

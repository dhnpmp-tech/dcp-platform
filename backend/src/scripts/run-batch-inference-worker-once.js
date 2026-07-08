#!/usr/bin/env node
'use strict';

const db = require('../db');
const {
  runBatchInferenceWorkerOnce,
} = require('../workers/batchInferenceWorker');

function parseLimit(argv) {
  const index = argv.indexOf('--limit');
  if (index === -1) return undefined;
  return Number(argv[index + 1]);
}

async function main() {
  const result = await runBatchInferenceWorkerOnce(db, {
    limit: parseLimit(process.argv.slice(2)),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[batch-worker] fatal:', error && error.message ? error.message : error);
    process.exit(1);
  });

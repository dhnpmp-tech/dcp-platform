#!/usr/bin/env node
'use strict';

const db = require('../db');
const {
  runLoraTrainingWorkerOnce,
} = require('../workers/loraTrainingWorker');

function parseLimit(argv) {
  const index = argv.indexOf('--limit');
  if (index === -1) return undefined;
  return Number(argv[index + 1]);
}

async function main() {
  const result = await runLoraTrainingWorkerOnce(db, {
    limit: parseLimit(process.argv.slice(2)),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[lora-training-worker] fatal:', error && error.message ? error.message : error);
    process.exit(1);
  });

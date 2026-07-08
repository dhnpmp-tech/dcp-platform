#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const CONTRACT_DIR = path.join(REPO_ROOT, 'backend/docker-templates');
const CONTRACT_PATH = path.join(CONTRACT_DIR, 'pod-image-contracts.json');
const BUILD_SCRIPT_PATH = path.join(CONTRACT_DIR, 'build-pod-images.sh');
const ENTRYPOINT_PATH = path.join(CONTRACT_DIR, 'dcp-pod-entrypoint.sh');
const PODS_ROUTE_PATH = path.join(REPO_ROOT, 'backend/src/routes/pods.js');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pushError(errors, message) {
  errors.push(message);
}

function assertIncludes(haystack, needle, errors, context) {
  if (!haystack.includes(needle)) {
    pushError(errors, `${context}: missing '${needle}'`);
  }
}

function assertRegex(haystack, regex, errors, context) {
  if (!regex.test(haystack)) {
    pushError(errors, `${context}: missing pattern ${regex}`);
  }
}

function loadContracts(contractPath = CONTRACT_PATH) {
  return JSON.parse(readText(contractPath));
}

function packageNameToken(pkg) {
  return String(pkg).split(/[<>=!~\s]/)[0].trim();
}

function verifyImageContract(image, shared, errors) {
  const context = `image '${image && image.alias}'`;
  if (!isObject(image)) {
    pushError(errors, 'image entry must be an object');
    return;
  }

  for (const field of ['alias', 'tag', 'dockerfile', 'description']) {
    if (typeof image[field] !== 'string' || image[field].trim().length === 0) {
      pushError(errors, `${context}: ${field} must be a non-empty string`);
    }
  }

  if (image.bootstrap !== false) {
    pushError(errors, `${context}: pre-baked pod images must declare bootstrap=false`);
  }

  const dockerfilePath = path.join(CONTRACT_DIR, image.dockerfile || '');
  if (!fs.existsSync(dockerfilePath)) {
    pushError(errors, `${context}: dockerfile not found: ${image.dockerfile}`);
    return;
  }

  const dockerfile = readText(dockerfilePath);
  assertIncludes(dockerfile, 'COPY dcp-pod-entrypoint.sh /usr/local/bin/dcp-pod-entrypoint.sh', errors, context);
  assertIncludes(dockerfile, 'ENTRYPOINT ["/usr/local/bin/dcp-pod-entrypoint.sh"]', errors, context);
  assertIncludes(dockerfile, 'openssh-server', errors, context);

  const buildPattern = new RegExp(`${escapeRegExp(image.alias)}\\)\\s+build\\s+${escapeRegExp(image.tag)}\\s+${escapeRegExp(image.dockerfile)}\\s+;;`);
  assertRegex(shared.buildScript, buildPattern, errors, `${context} build script`);

  const aliasPattern = new RegExp(`${escapeRegExp(image.alias)}:\\s*['"]${escapeRegExp(image.tag)}['"]`);
  assertRegex(shared.podsRoute, aliasPattern, errors, `${context} pods route alias`);

  if (image.ships_jupyter) {
    const hasJupyter = dockerfile.includes('jupyterlab') || (image.requirements && readText(path.join(CONTRACT_DIR, image.requirements)).includes('jupyterlab'));
    if (!hasJupyter) {
      pushError(errors, `${context}: ships_jupyter=true but jupyterlab is not installed by the Dockerfile or requirements`);
    }
  }

  if (image.requirements) {
    const requirementsPath = path.join(CONTRACT_DIR, image.requirements);
    if (!fs.existsSync(requirementsPath)) {
      pushError(errors, `${context}: requirements file not found: ${image.requirements}`);
    } else {
      assertIncludes(dockerfile, `COPY ${image.requirements} /opt/dcp/${image.requirements}`, errors, context);
      assertIncludes(dockerfile, `-r /opt/dcp/${image.requirements}`, errors, context);
      const requirements = readText(requirementsPath);
      for (const pkg of image.required_packages || []) {
        assertRegex(requirements, new RegExp(`(^|\\n)${escapeRegExp(packageNameToken(pkg))}([<>=!~\\s]|$)`), errors, `${context} requirements`);
      }
    }
  }

  const examples = Array.isArray(image.examples) ? image.examples : [];
  for (const example of examples) {
    const examplePath = path.join(CONTRACT_DIR, example);
    if (!fs.existsSync(examplePath)) {
      pushError(errors, `${context}: example not found: ${example}`);
      continue;
    }
    const base = path.basename(example);
    assertIncludes(dockerfile, `COPY ${example} /opt/dcp/examples/${base}`, errors, context);
    assertIncludes(shared.entrypoint, '/workspace/examples', errors, `${context} entrypoint`);
  }

  if (image.smoke_script) {
    const smokePath = path.join(CONTRACT_DIR, image.smoke_script);
    if (!fs.existsSync(smokePath)) {
      pushError(errors, `${context}: smoke script not found: ${image.smoke_script}`);
    } else {
      const smoke = readText(smokePath);
      for (const example of examples) {
        assertIncludes(smoke, `/opt/dcp/examples/${path.basename(example)}`, errors, `${context} smoke script`);
      }
      assertIncludes(smoke, '--require-gpu', errors, `${context} smoke script`);
      assertIncludes(smoke, 'MAX_IMPORT_SECONDS', errors, `${context} smoke script`);
      assertIncludes(smoke, 'dcp.lora_pod_image_proof.v1', errors, `${context} smoke script`);
      assertIncludes(smoke, 'DCP_LORA_IMAGE_PROOF_REPORT_DIR', errors, `${context} smoke script`);
      assertIncludes(smoke, 'DC1_RESULT_JSON', errors, `${context} smoke script`);
      assertIncludes(smoke, 'docs/reports/reliability', errors, `${context} smoke script`);
    }
  }

  if (Array.isArray(image.required_smoke_modules) && image.required_smoke_modules.length > 0) {
    const stackSmoke = examples
      .map((example) => path.join(CONTRACT_DIR, example))
      .find((examplePath) => path.basename(examplePath) === 'lora_stack_smoke.py');
    if (!stackSmoke || !fs.existsSync(stackSmoke)) {
      pushError(errors, `${context}: required_smoke_modules declared without lora_stack_smoke.py`);
    } else {
      const smokeSource = readText(stackSmoke);
      for (const moduleName of image.required_smoke_modules) {
        assertIncludes(smokeSource, `("${moduleName}", "${moduleName}")`, errors, `${context} stack smoke`);
      }
    }
  }
}

function verifyContracts(options = {}) {
  const contractPath = options.contractPath || CONTRACT_PATH;
  const errors = [];

  if (!fs.existsSync(contractPath)) {
    return { errors: [`contract file not found: ${contractPath}`], manifest: null };
  }
  if (!fs.existsSync(BUILD_SCRIPT_PATH)) pushError(errors, `build script not found: ${BUILD_SCRIPT_PATH}`);
  if (!fs.existsSync(ENTRYPOINT_PATH)) pushError(errors, `entrypoint not found: ${ENTRYPOINT_PATH}`);
  if (!fs.existsSync(PODS_ROUTE_PATH)) pushError(errors, `pods route not found: ${PODS_ROUTE_PATH}`);

  let manifest;
  try {
    manifest = loadContracts(contractPath);
  } catch (error) {
    return { errors: [`failed to read contract JSON: ${error.message}`], manifest: null };
  }

  if (manifest.contract !== 'dcp.pod_image_contracts.v1') {
    pushError(errors, 'manifest.contract must be dcp.pod_image_contracts.v1');
  }
  if (typeof manifest.version !== 'string' || !manifest.version.trim()) {
    pushError(errors, 'manifest.version must be a non-empty string');
  }
  if (!Array.isArray(manifest.images) || manifest.images.length === 0) {
    pushError(errors, 'manifest.images must be a non-empty array');
  }

  const shared = {
    buildScript: fs.existsSync(BUILD_SCRIPT_PATH) ? readText(BUILD_SCRIPT_PATH) : '',
    entrypoint: fs.existsSync(ENTRYPOINT_PATH) ? readText(ENTRYPOINT_PATH) : '',
    podsRoute: fs.existsSync(PODS_ROUTE_PATH) ? readText(PODS_ROUTE_PATH) : '',
  };

  const aliases = new Set();
  const tags = new Set();
  for (const image of manifest.images || []) {
    if (isObject(image)) {
      if (aliases.has(image.alias)) pushError(errors, `duplicate image alias: ${image.alias}`);
      if (tags.has(image.tag)) pushError(errors, `duplicate image tag: ${image.tag}`);
      aliases.add(image.alias);
      tags.add(image.tag);
    }
    verifyImageContract(image, shared, errors);
  }

  for (const alias of aliases) {
    assertRegex(shared.buildScript, new RegExp(`TARGETS=.*${escapeRegExp(alias)}`), errors, `build script target list for '${alias}'`);
  }

  return { errors, manifest };
}

function main() {
  const { errors, manifest } = verifyContracts();
  if (errors.length > 0) {
    console.error('Pod image contract verification failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(`Pod image contract verification passed (${manifest.images.length} images checked)`);
}

if (require.main === module) {
  main();
}

module.exports = {
  verifyContracts,
};

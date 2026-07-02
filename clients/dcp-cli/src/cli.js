import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { readConfig, writeConfig, resolveBaseUrl } from './config.js';
import { getCodingModels, getBalance } from './api.js';
import { loginWithKey, loginWithBrowser } from './auth.js';
import { launchAgent } from './launch.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const HALALA_PER_SAR = 100;

const formatSAR = (halala) => `${(Number(halala || 0) / HALALA_PER_SAR).toFixed(2)} SAR`;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exitCode = 1;
}

/** Returns the config when a token is stored, otherwise errors and returns null. */
function requireLogin() {
  const config = readConfig();
  if (!config.token) {
    fail('Not logged in. Run: dcp login');
    return null;
  }
  return config;
}

function formatModelLine(model) {
  const dot = model.status === 'available' ? '●' : '○';
  const priceIn = formatSAR(model.price_in_halala_per_1m);
  const priceOut = formatSAR(model.price_out_halala_per_1m);
  return `  ${dot} ${model.id}  ${model.label}  in ${priceIn} / out ${priceOut} per 1M tokens  [${model.status}]`;
}

/** Bare `dcp` (pre-TUI placeholder): login if needed, list models + balance + hint. */
async function defaultAction() {
  let config = readConfig();
  if (!config.token) {
    console.log('Not logged in — starting browser login.');
    await loginWithBrowser();
    config = readConfig();
  }
  const baseUrl = resolveBaseUrl(config);
  const [models, me] = await Promise.all([
    getCodingModels(baseUrl),
    getBalance(baseUrl, config.token),
  ]);
  console.log('DCP coding models:');
  for (const model of models) console.log(formatModelLine(model));
  console.log(`Balance: ${formatSAR(me.balance_halala)} (${me.email})`);
  const pick = models.find((m) => m.status === 'available') || models[0];
  if (pick) console.log(`Run: dcp launch claude --model ${pick.id}`);
  console.log('(Interactive picker coming soon.)');
}

export function buildProgram() {
  const program = new Command();
  program
    .name('dcp')
    .description('DCP — launch coding agents on DCP consumer-GPU inference')
    .version(pkg.version);

  program
    .command('login')
    .description('Log in to DCP (browser device flow, or --key to paste an API key)')
    .option('--key <key>', 'DCP renter API key')
    .action(async (opts) => {
      if (opts.key) {
        const { email, balance_halala } = await loginWithKey(opts.key);
        console.log(`Logged in as ${email} — balance ${formatSAR(balance_halala)}`);
      } else {
        const { renter_id } = await loginWithBrowser();
        console.log(`Logged in (renter ${renter_id}).`);
      }
    });

  program
    .command('logout')
    .description('Log out of DCP (clears the stored token, keeps preferences)')
    .action(() => {
      writeConfig({ token: undefined });
      console.log('Logged out.');
    });

  program
    .command('status')
    .description('Show login, balance, API base, and last-used model')
    .action(async () => {
      const config = requireLogin();
      if (!config) return;
      const baseUrl = resolveBaseUrl(config);
      const me = await getBalance(baseUrl, config.token);
      console.log(`Logged in as: ${me.email}`);
      console.log(`Balance:      ${formatSAR(me.balance_halala)}`);
      console.log(`API base:     ${baseUrl}`);
      console.log(`Last model:   ${config.lastModel || '(none)'}`);
      console.log(`Last agent:   ${config.lastAgent || '(none)'}`);
    });

  program
    .command('launch')
    .description('Launch a coding agent on a DCP model')
    .argument('<agent>', 'agent to launch (claude; codex/cursor coming soon)')
    .option('--model <id>', 'DCP coding model id (defaults to the last-used model)')
    .action(async (agent, opts) => {
      const config = requireLogin();
      if (!config) return;
      const modelId = opts.model || config.lastModel;
      if (!modelId) {
        fail('No model selected. Run: dcp launch claude --model <id> (run `dcp` to list models)');
        return;
      }
      process.exitCode = await launchAgent({ agent, modelId, config });
    });

  program.action(defaultAction);

  return program;
}

/** Parse argv; any command error becomes one clear stderr line + exit code 1. */
export async function run(argv) {
  try {
    await buildProgram().parseAsync(argv);
  } catch (err) {
    fail(err.message);
  }
}

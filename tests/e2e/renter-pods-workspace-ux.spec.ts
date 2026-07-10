import crypto from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const SESSION_COOKIE = '__dc1_session';
const SESSION_SECRET = process.env.DC1_SESSION_SECRET || 'dc1-dev-only-insecure-session-secret-change-me';
const RENTER_KEY = 'dcp-renter-ui-smoke-fake-key-0000000000';

function buildSessionCookie(role: 'renter' | 'provider' | 'admin' = 'renter'): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = `${role}.${exp}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

async function mockPodsApis(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/templates/catalog') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version: 'dcp.test.templates.v1',
          templates: [
            { id: 'pytorch-single-gpu', model_name: 'PyTorch', min_vram_gb: 8, deploy_defaults: { duration_minutes: 60 } },
            { id: 'lora-finetune', model_name: 'LoRA SFT', min_vram_gb: 16, deploy_defaults: { duration_minutes: 240 } },
            { id: 'qlora-finetune', model_name: 'QLoRA SFT', min_vram_gb: 12, deploy_defaults: { duration_minutes: 240 } },
            { id: 'vllm-serve', model_name: 'vLLM', min_vram_gb: 24, deploy_defaults: { duration_minutes: 120 } },
            { id: 'arabic-embeddings', model_name: 'Arabic embeddings', min_vram_gb: 8, deploy_defaults: { duration_minutes: 120 } },
            { id: 'arabic-reranker', model_name: 'Arabic reranker', min_vram_gb: 8, deploy_defaults: { duration_minutes: 120 } },
            { id: 'whisper-large-v3', model_name: 'Whisper Large-v3', min_vram_gb: 8, deploy_defaults: { duration_minutes: 60 } },
          ],
        }),
      });
    }

    if (path === '/api/pods') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pods: [] }),
      });
    }

    if (path === '/api/pods/trial-routing/readiness') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          object: 'pod_trial_routing_readiness',
          version: 'dcp.pod_trial_routing_readiness.v1',
          account_classification: {
            explicit_trial_account_tag_live: false,
            trial_credit_source: 'renters.trial_grant_halala',
            paid_credit_source: 'payments.status=paid',
          },
          routing_policy: {
            trial_capacity_copy: 'Trial credit: native/community GPUs',
            high_demand_capacity_copy: 'High-demand capacity: paid credit only',
            trial_credit_allowed_supply_tiers: ['dcp_owned', 'provider'],
            paid_credit_required_supply_tiers: ['on_demand'],
            provider_visibility: {
              exposes_provider_id_to_renter: false,
              exposes_vendor_to_renter: false,
              exposes_supply_tier_to_renter: false,
            },
          },
          claim_guards: {
            launches_pod: false,
            mutates_balance: false,
            changes_billing: false,
            changes_trial_accounting: false,
            exposes_vendor_or_provider: false,
            claims_workspace_live_acceptance: false,
            claims_lora_pod_image_gpu_ready: false,
            claims_fine_tuning_ready_pods: false,
          },
          infrastructure_proofs: {
            workspace_pod_contract: {
              status: 'ci_safe',
              command: 'npm run workspace-pods:verify-contracts',
              local_roadmap_gate: 'workspace_pod_contracts',
            },
            workspace_live_acceptance: {
              status: 'blocked_external',
              command: 'DCP_WORKSPACE_POD_ALLOW_LAUNCH=1 npm run proof:workspace-pod',
              live_acceptance_gate: 'workspace_pod_live_launch',
              blocked_on: ['funded renter key', 'active portable volume', 'launchable GPU capacity'],
            },
            lora_pod_image_provider_host: {
              status: 'blocked_external',
              command: 'npm run proof:lora-pod-image',
              live_acceptance_gate: 'lora_pod_image_provider_host',
              blocked_on: ['provider GPU host', 'Docker with NVIDIA runtime', 'built dcp-compute:lora image'],
            },
          },
        }),
      });
    }

    if (path === '/api/renters/me') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ renter: { name: 'Tareq Trial', email: 'tareq@example.test' } }),
      });
    }

    if (path === '/api/renters/me/minimum-balances') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          object: 'minimum_balance_readiness',
          version: 'dcp.minimum_balance_readiness.v1',
          current_mode: 'read_only_policy_contract',
          account: {
            balance_halala: 25000,
            balance_sar: 250,
            trial_grant_halala: 2000,
            trial_grant_sar: 20,
            paid_funding_halala: 5000,
            paid_funding_sar: 50,
            on_demand_committed_halala: 1200,
            on_demand_committed_sar: 12,
            paid_available_halala: 3800,
            paid_available_sar: 38,
          },
          credit_policy: {
            current_mode: 'grant_credit_provenance_plus_paid_credit_gate',
            source_contract: 'GET /api/pods/trial-routing/readiness',
            explicit_trial_account_tag_live: false,
            trial_credit_source: 'renters.trial_grant_halala',
            trial_grant_halala: 2000,
            trial_grant_sar: 20,
            has_trial_grant: true,
            paid_credit_source: 'payments.status=paid/refunded minus active high-demand pod commitments',
            paid_available_halala: 3800,
            paid_available_sar: 38,
            trial_credit_allowed_capacity: 'DCP/community/provider GPU capacity when normal quote checks pass',
            trial_credit_unlocks_high_demand: false,
            high_demand_requires_paid_credit: true,
          },
          rails: {
            gpu_pods_provider_supply: {
              status: 'live_quote_preflight',
              minimum_type: 'quoted_pod_cost',
              available_balance_halala: 25000,
              enforcement_live: true,
            },
            gpu_pods_on_demand_supply: {
              status: 'live_paid_credit_preflight',
              minimum_type: 'quoted_pod_cost_paid_credit',
              paid_available_halala: 3800,
              enforcement_live: true,
            },
            batch_inference: { status: 'contract_only', enforcement_live: false },
            prompt_cache_discount: { status: 'measurement_only', enforcement_live: false },
            lora_training: { status: 'metadata_and_artifact_proof_only', enforcement_live: false },
            adapter_deployments: { status: 'load_and_billing_policy_required', enforcement_live: false },
          },
          claim_guards: {
            mutates_balance: false,
            creates_payment: false,
            creates_pod: false,
            dispatches_inference: false,
            creates_batch: false,
            creates_lora_training_job: false,
            creates_adapter_deployment: false,
            enables_discount: false,
            changes_enforcement: false,
            changes_trial_accounting: false,
            changes_paid_credit_policy: false,
          },
        }),
      });
    }

    if (path === '/api/renters/available-providers') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          providers: [
            { id: 1, gpu_model: 'NVIDIA GeForce RTX 4090', vram_gb: 24, available: true, sar_per_hour: 12 },
            { id: 2, gpu_model: 'NVIDIA H100 80GB HBM3', vram_gb: 80, available: true, sar_per_hour: 48 },
          ],
        }),
      });
    }

    if (path === '/api/volumes/me') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          volume: {
            id: 'vol_test',
            size_gb: 20,
            used_gb: 4.5,
            used_pct: 22.5,
            price_sar_per_month: 20,
          },
          options: [],
        }),
      });
    }

    if (path === '/api/workspace/files') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          files: [
            { key: 'datasets/train.jsonl', size: 1200, last_modified: '2026-07-09T08:00:00Z' },
            { key: 'datasets/valid.jsonl', size: 800, last_modified: '2026-07-09T08:01:00Z' },
            { key: 'notebooks/demo.ipynb', size: 2048, last_modified: '2026-07-09T08:02:00Z' },
            { key: 'checkpoints/epoch-1.bin', size: 4096, last_modified: '2026-07-09T08:03:00Z' },
            { key: 'readme.md', size: 400, last_modified: '2026-07-09T08:04:00Z' },
          ],
        }),
      });
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: `Unhandled mocked route: ${path}` }),
    });
  });
}

async function mockPlaygroundV1Apis(page: Page) {
  await page.route('**/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/v1/models') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          object: 'list',
          data: [
            {
              id: 'qwen3-32b',
              name: 'Qwen3 32B',
              provider_count: 1,
              pricing: { sar_per_1m_input_tokens: 1.2, sar_per_1m_output_tokens: 3.6 },
              capability_flags: { chat_completions: true, streaming: true, multilingual: true },
              feature_readiness: {
                prompt_caching: { status: 'measurement_only', available: false },
                batch: { status: 'contract_only', available: false },
                lora: { status: 'metadata_only', available: false },
                dedicated_deployment: { status: 'contract_only', available: false },
              },
            },
          ],
        }),
      });
    }

    if (path === '/v1/router/policies') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          object: 'router_policy_list',
          default_policy: 'balanced',
          request_selectable: true,
          data: [
            {
              id: 'balanced',
              label: 'Balanced',
              status: 'available',
              available: true,
              default: true,
              request_selectable: true,
            },
          ],
        }),
      });
    }

    if (path === '/v1/prompt-cache/readiness') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          object: 'prompt_cache_readiness',
          current_mode: 'measurement_only',
          measurement: { hash_only: true, tracks_cached_input_tokens: true },
          billing: { discounts_enabled: false },
          claims: { prompt_cache_discount: false },
        }),
      });
    }

    if (path === '/v1/prompt-cache/settlement/readiness') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          object: 'prompt_cache_settlement_readiness',
          version: 'dcp.prompt_cache_settlement_readiness.v1',
          current_mode: 'settlement_policy_contract_only',
          endpoints: {
            settlement_readiness: 'GET /v1/prompt-cache/settlement/readiness',
            prompt_cache_readiness: 'GET /v1/prompt-cache/readiness',
          },
          policy: {
            cached_input_discounts_enabled: false,
            settlement_discounts_enabled: false,
            settlement_mutations_enabled: false,
            provider_cache_hit_evidence: { status: 'blocked_external', required: true },
            discount_policy: { status: 'policy_pending', discount_bps_live: 0 },
          },
          denial_codes: ['prompt_cache_discount_disabled', 'prompt_cache_provider_hit_required'],
          claim_guards: {
            mutates_balance: false,
            records_usage_event: false,
            dispatches_inference: false,
            stores_raw_prompt: false,
          },
        }),
      });
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: `Unhandled mocked route: ${path}` }),
    });
  });
}

test('renter pods launch keeps workspace compact and compute selection explicit', async ({ page, context }) => {
  await context.addCookies([{
    name: SESSION_COOKIE,
    value: buildSessionCookie('renter'),
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    expires: Math.floor(Date.now() / 1000) + 3600,
  }]);
  await page.addInitScript((key) => {
    window.localStorage.setItem('dc1_renter_key', key);
  }, RENTER_KEY);
  await mockPodsApis(page);

  await page.goto('/renter/pods');

  await expect(page.getByRole('navigation', { name: 'Pod launch stages' })).toBeVisible();
  await expect(page.locator('#pod-stage-1 .pod-stage-no')).toHaveText('Stage 1 of 3');
  await expect(page.locator('#pod-stage-2 .pod-stage-no')).toHaveText('Stage 2 of 3');
  await expect(page.locator('#pod-stage-3 .pod-stage-no')).toHaveText('Stage 3 of 3');
  await expect(page.getByRole('navigation', { name: 'Pod launch stages' })).toContainText('Stage 1 of 3');
  await expect(page.getByRole('navigation', { name: 'Pod launch stages' })).toContainText('Stage 2 of 3');
  await expect(page.getByRole('navigation', { name: 'Pod launch stages' })).toContainText('Stage 3 of 3');
  await expect(page.locator('.pod-stage-nav').getByRole('link', { name: /Stage 2.*Actual launch GPU.*Auto-pick/ })).toBeVisible();
  const stickyDecision = page.getByLabel('Sticky launch decision');
  await expect(stickyDecision).toContainText('Launch request');
  await expect(stickyDecision).toContainText('Auto-pick GPU');
  await expect(stickyDecision).toContainText('gpu_type omitted = auto-pick');
  await expect(stickyDecision).toContainText('Workspace');
  await expect(stickyDecision).toContainText('5 files · 3 folders');
  await expect(stickyDecision).toContainText('Runtime');
  await expect(stickyDecision).toContainText('PyTorch · 1h');
  await expect(stickyDecision).toContainText('Trial route');
  await expect(stickyDecision).toContainText('No trial-account tag live · Trial route: native/community GPU pool');
  const commandCenter = page.getByLabel('Launch command center');
  await expect(commandCenter).toBeVisible();
  await expect(commandCenter).toContainText('Main decision · Stage 2 of 3');
  await expect(commandCenter).toContainText('Auto-pick GPU');
  await expect(commandCenter).toContainText('No fixed GPU card pinned');
  await expect(commandCenter).toContainText('Will send');
  await expect(commandCenter).toContainText('gpu_type omitted = auto-pick');
  await expect(commandCenter.getByRole('link', { name: 'Review Stage 2 GPU' })).toBeVisible();
  await expect(commandCenter.getByRole('button', { name: 'Collapse Stage 1 files' })).toBeVisible();
  await expect(commandCenter.getByRole('link', { name: 'Stage 3 launch' })).toBeVisible();
  await expect(commandCenter).toContainText('5 files · 3 folders');
  await expect(commandCenter).toContainText('Stage 1 files are collapsed');
  await expect(commandCenter).toContainText('No trial-account tag live');
  await expect(commandCenter).toContainText('High-demand GPUs: paid credit only');
  const fastPath = page.getByLabel('Fast path to Stage 2');
  await expect(fastPath).toContainText('Main decision');
  await expect(fastPath).toContainText('Go straight to Stage 2 of 3');
  await expect(fastPath).toContainText('Auto-pick is active; no fixed GPU is selected.');
  await expect(fastPath).toContainText('Workspace is collapsible');
  await expect(fastPath).toContainText('Skip file-by-file review when the folder summary looks right.');
  await expect(fastPath).toContainText('No trial-account tag live');
  await expect(fastPath.getByRole('link', { name: /Go straight to Stage 2/ })).toBeVisible();

  const stage1Checkpoint = page.getByLabel('Stage 1 workspace checkpoint');
  await expect(stage1Checkpoint).toContainText('Workspace details collapsed');
  await expect(stage1Checkpoint).toContainText('Stage 1 ready: 5 files grouped in 3 folders');
  await expect(stage1Checkpoint).toContainText('Collapsed by default');
  await expect(stage1Checkpoint).toContainText('20 GB /workspace');
  await expect(stage1Checkpoint).toContainText('5 staged files');
  await expect(stage1Checkpoint).toContainText('3 folders');
  await expect(stage1Checkpoint).toContainText('Stage 1 can stay collapsed');
  await expect(stage1Checkpoint.getByRole('link', { name: 'Skip to Stage 2' })).toBeVisible();
  await expect(stage1Checkpoint.getByRole('button', { name: 'Expand Stage 1 workspace' })).toBeVisible();
  await expect(page.getByText('Stage 1 manifest')).toBeHidden();
  await expect(page.getByText('datasets/train.jsonl')).toBeHidden();
  const folderPreview = page.getByLabel('Stage 1 folder preview');
  await expect(folderPreview).toContainText('Folder checkpoint');
  await expect(folderPreview).toContainText('Top folders, not every file');
  await expect(folderPreview).toContainText('datasets/');
  await expect(folderPreview).toContainText('2 files');
  await expect(folderPreview).toContainText('1.95 KiB');
  await expect(folderPreview).toContainText('notebooks/');
  await expect(folderPreview).toContainText('checkpoints/');

  await stage1Checkpoint.getByRole('button', { name: 'Expand Stage 1 workspace' }).click();
  await expect(stage1Checkpoint).toContainText('Workspace details open');
  await expect(folderPreview).toBeHidden();
  await expect(page.getByLabel('Stage 1 workspace summary')).toContainText('Stage 1 folder summary');
  await expect(page.getByLabel('Stage 1 workspace summary')).toContainText('5 files staged');
  await expect(page.getByLabel('Stage 1 workspace summary')).toContainText('20 GB /workspace');
  await expect(page.getByLabel('Stage 1 workspace summary')).toContainText('datasets/');
  await expect(page.getByLabel('Stage 1 workspace summary')).toContainText('1.95 KiB');
  await expect(page.getByLabel('Stage 1 workspace summary')).toContainText('Large workspace: folder index stays collapsed until you open it');
  await expect(page.getByLabel('Stage 1 workspace summary')).toContainText('No need to scroll every file');
  await expect(page.getByLabel('Stage 1 workspace summary')).toContainText('Stage 1 can stay collapsed');
  await expect(page.getByLabel('Stage 1 workspace summary')).toContainText('Stage 2 launches with the whole /workspace volume attached');
  await expect(page.getByLabel('Stage 1 folder navigator')).toContainText('Folder map');
  await expect(page.getByLabel('Stage 1 folder navigator')).toContainText('3 folders · busiest folder datasets/');
  await expect(page.getByLabel('Stage 1 folder navigator')).toContainText('Open one folder');
  await expect(page.getByLabel('Stage 1 folder navigator')).toContainText('2 files there · 3 files stay collapsed');
  await expect(page.getByLabel('Stage 1 folder navigator')).toContainText('Launch uses the full /workspace volume');
  await expect(page.getByLabel('Stage 1 workspace summary').getByRole('button', { name: 'Browse folders' })).toBeVisible();
  await expect(page.getByLabel('Stage 1 workspace summary').getByRole('button', { name: 'Manage files' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue to Stage 2' })).toBeVisible();
  await expect(page.getByText('Stage 1 manifest')).toBeHidden();
  await expect(page.getByText('datasets/train.jsonl')).toBeHidden();
  await expect(page.getByLabel('Stage 1 folder index')).toBeHidden();

  await page.getByLabel('Stage 1 workspace summary').getByRole('button', { name: 'Browse folders' }).click();
  await expect(page.getByLabel('Stage 1 folder index')).toContainText('Folder tree, not a file wall');
  await expect(page.getByLabel('Stage 1 folder index')).toContainText('Busiest folders first. Open one folder, search by file name, or continue to Stage 2 with the manifest closed.');
  await expect(page.getByLabel('Stage 1 folder index').getByRole('link', { name: 'Go to Stage 2' })).toBeVisible();
  await expect(page.getByLabel('Stage 1 folder index').getByRole('button', { name: 'Full file manager' })).toBeVisible();
  await expect(page.getByLabel('Stage 1 folder index').getByRole('button', { name: /Open notebooks\/ with 1 files/ })).toBeVisible();
  await page.getByLabel('Search Stage 1 folders and files').fill('notebooks');
  await expect(page.getByLabel('Stage 1 folder index')).toContainText('notebooks/');
  await expect(page.getByLabel('Stage 1 folder index')).not.toContainText('datasets/');
  await page.getByLabel('Search Stage 1 folders and files').fill('');
  await expect(page.getByText('Stage 1 manifest')).toBeHidden();
  await page.getByLabel('Stage 1 workspace summary').getByRole('button', { name: 'Hide folders' }).click();
  await expect(page.getByLabel('Stage 1 folder index')).toBeHidden();

  const launchChecklist = page.getByLabel('Launch checklist');
  await expect(launchChecklist).toContainText('Stage 1');
  await expect(launchChecklist).toContainText('Workspace');
  await expect(launchChecklist).toContainText('5 files · 3 folders');
  await expect(launchChecklist).toContainText('Stage 1 can stay collapsed');
  await expect(launchChecklist).toContainText('Stage 2');
  await expect(launchChecklist).toContainText('Actual GPU request');
  await expect(launchChecklist).toContainText('Auto-pick · no fixed GPU');
  await expect(launchChecklist).toContainText('Backend picks an available GPU type at launch');
  await expect(launchChecklist).toContainText('Trial');
  await expect(launchChecklist).toContainText('Trial accounts: grant-credit provenance');
  await expect(launchChecklist).toContainText('Trial route: native/community GPU pool; High-demand GPUs: paid credit only');
  await expect(launchChecklist).toContainText('Credit');
  await expect(launchChecklist).toContainText('Credit gates synced');
  await expect(launchChecklist).toContainText('Paid available SAR 38.00 · high-demand requires paid credit');

  const stageControlMap = page.getByLabel('What each stage controls');
  await expect(stageControlMap).toContainText('Stage 1');
  await expect(stageControlMap).toContainText('Workspace tree');
  await expect(stageControlMap).toContainText('Accordion collapsed by default');
  await expect(stageControlMap).toContainText('Stage 2');
  await expect(stageControlMap).toContainText('Actual launch GPU');
  await expect(stageControlMap).toContainText('Auto-pick is still active');
  await expect(stageControlMap).toContainText('Stage 3');
  await expect(stageControlMap).toContainText('Runtime and launch');

  await page.getByRole('link', { name: 'Continue to Stage 2' }).click();
  await expect(page).toHaveURL(/#pod-stage-2$/);
  await page.locator('#pod-stage-1').scrollIntoViewIfNeeded();
  await page.getByLabel('Stage 1 workspace summary').getByRole('button', { name: 'Manage files' }).click();
  await expect(page.getByRole('heading', { name: 'Staged files' })).toBeVisible();
  await expect(page.getByText('Stage 1 manifest')).toBeVisible();
  await expect(page.locator('.ws-launch-manifest')).toContainText('5 files · 4 groups');
  await expect(page.getByText('Review folders')).toBeVisible();
  await expect(page.getByText('Folder-first workspace')).toBeVisible();
  await expect(page.getByText('Large manifest collapsed. Open one folder, search by name, or show the full manifest only when needed.')).toBeVisible();
  await expect(page.getByLabel('Workspace folder summary')).toContainText('datasets/');
  await expect(page.getByLabel('Workspace folder summary')).toContainText('checkpoints/');
  await page.getByLabel('Search staged folders and files').fill('checkpoints');
  await expect(page.getByLabel('Workspace folder summary')).toContainText('checkpoints/');
  await expect(page.getByLabel('Workspace folder summary')).not.toContainText('datasets/');
  await page.getByLabel('Search staged folders and files').fill('');
  await expect(page.getByRole('button', { name: /Open datasets\/ with 2 files/ })).toBeVisible();
  await page.getByRole('button', { name: /Open datasets\/ with 2 files/ }).click();
  await expect(page.getByText('datasets/train.jsonl')).toBeVisible();
  await expect(page.getByText('notebooks/demo.ipynb')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /datasets\/.*2/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Expand all' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(page.getByText('notebooks/demo.ipynb')).toBeVisible();
  await page.getByRole('button', { name: 'Collapse all' }).click();
  await expect(page.getByText('datasets/train.jsonl')).toHaveCount(0);

  const computeSummary = page.locator('.pod-compute-summary');
  await expect(computeSummary).toContainText('Stage 2 actual launch GPU');
  await expect(page.getByLabel('Stage 2 primary GPU decision')).toContainText('Primary Stage 2 decision');
  await expect(page.getByLabel('Stage 2 primary GPU decision')).toContainText('Auto-pick GPU');
  await expect(page.getByLabel('Stage 2 primary GPU decision')).toContainText('Auto-pick is the launch request');
  await expect(page.getByLabel('Stage 2 primary GPU decision')).toContainText('gpu_type omitted = auto-pick');
  await expect(page.getByLabel('Stage 2 primary GPU decision')).toContainText('Choose fixed GPU card');
  await expect(page.getByLabel('Stage 2 primary GPU decision')).toContainText('VRAM chips are browse filters only');
  await expect(page.getByLabel('Stage 2 primary GPU decision')).toContainText('Trial grant SAR 20.00');
  await expect(page.getByLabel('Stage 2 primary GPU decision')).toContainText('High-demand paid-credit gate live');
  const finalGpuRequest = page.getByLabel('Final GPU request');
  await expect(finalGpuRequest).toContainText('Final GPU request');
  await expect(finalGpuRequest).toContainText('Auto-pick GPU');
  await expect(finalGpuRequest).toContainText('gpu_type omitted = auto-pick');
  await expect(finalGpuRequest).toContainText('No fixed GPU card pinned');
  await expect(computeSummary).toContainText('Template');
  await expect(computeSummary).toContainText('Actual GPU');
  await expect(computeSummary).toContainText('Auto-pick GPU');
  await expect(computeSummary).toContainText('Launch mode');
  await expect(computeSummary).toContainText('Auto-pick is selected for launch');
  await expect(computeSummary).toContainText('Templates, workload presets, and VRAM chips only narrow or highlight cards');
  await expect(page.getByLabel('Launch request preview')).toContainText('What DCP will send');
  await expect(page.getByLabel('Launch request preview')).toContainText('gpu_type omitted = auto-pick');
  await expect(page.getByLabel('Launch request preview')).toContainText('No GPU card is pinned; filters and template hints stay browse-only');
  await expect(computeSummary).toContainText('VRAM chips are browse filters, not the selected launch GPU');
  await expect(computeSummary).toContainText('No browse filter');
  await expect(computeSummary).toContainText('Auto-pick at launch · no GPU pinned');
  await expect(computeSummary).toContainText('Launch will auto-pick an available GPU type');
  await expect(computeSummary).toContainText('Request mode: Auto-pick request');
  await expect(computeSummary).toContainText('Affects launch');
  await expect(computeSummary).toContainText('Auto-pick toggle or a selected GPU card');
  await expect(computeSummary).toContainText('Browse only');
  await expect(computeSummary).toContainText('Template hint, VRAM chips, search, and sort');
  await expect(computeSummary).toContainText('Launch selection rule');
  await expect(computeSummary).toContainText('Only Auto-pick or a GPU card selected with Use as launch GPU changes what DCP sends.');
  await expect(computeSummary).toContainText('Trial accounts');
  await expect(computeSummary).toContainText('No separate trial tag; grant credit decides; Trial route: native/community GPU pool.');
  await expect(computeSummary).toContainText('Credit policy: synced');
  await expect(computeSummary).toContainText('Trial credit: native/community GPUs');
  await expect(computeSummary).toContainText('High-demand capacity: paid credit only');
  await expect(computeSummary).toContainText('Trial route: native/community GPU pool');
  await expect(computeSummary).toContainText('High-demand GPUs: paid credit only');
  await expect(computeSummary).toContainText('Trial accounts: grant-credit provenance');
  await expect(computeSummary).toContainText('No trial-account tag live');
  await expect(computeSummary).toContainText('No separate trial tag; grant credit decides');
  await expect(computeSummary).toContainText('Trial source: grant balance');
  await expect(computeSummary.getByRole('button', { name: 'Auto-pick', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(computeSummary.getByRole('button', { name: 'Fixed GPU', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('GPU selection source of truth')).toContainText('Before filtering');
  await expect(page.getByLabel('GPU selection source of truth')).toContainText('The launch GPU is only Auto-pick or a card marked Selected launch GPU');
  await expect(page.getByLabel('GPU selection source of truth')).toContainText('VRAM chips, workload guide, search, and sort change the list you see');
  await expect(page.getByLabel('Trial routing policy')).toContainText('Trial accounts use grant-credit provenance');
  await expect(page.getByLabel('Trial routing policy')).toContainText('No separate trial tag is live.');
  await expect(page.getByLabel('Trial routing policy')).toContainText('Minimum-balance credit policy: synced');
  await expect(page.getByLabel('Trial routing policy')).toContainText('Backend policy: synced');
  await expect(page.getByLabel('Trial routing policy')).toContainText('Trial accounts: grant-credit provenance');
  await expect(page.getByLabel('Trial routing policy')).toContainText('No trial-account tag live');
  await expect(page.getByLabel('Trial routing policy')).toContainText('Trial source: grant balance');
  await expect(page.getByLabel('Trial routing policy')).toContainText('Trial grant SAR 20.00');
  await expect(page.getByLabel('Trial routing policy')).toContainText('Trial route: native/community GPU pool');
  await expect(page.getByLabel('Trial routing policy')).toContainText('High-demand GPUs: paid credit only');
  await expect(page.getByLabel('Trial routing policy')).toContainText('No separate trial tag; grant credit decides');
  await expect(page.getByLabel('Trial routing policy')).toContainText('Provider identity hidden');
  await expect(page.getByLabel('Minimum balance policy')).toContainText('Credit gates are visible before launch');
  await expect(page.getByLabel('Minimum balance policy')).toContainText('Minimum balance: synced');
  await expect(page.getByLabel('Minimum balance policy')).toContainText('Provider/community pods: quote preflight');
  await expect(page.getByLabel('Minimum balance policy')).toContainText('On-demand pods: paid credit preflight');
  await expect(page.getByLabel('Minimum balance policy')).toContainText('Paid available SAR 38.00');
  await expect(page.getByLabel('Minimum balance policy')).toContainText('Trial credit does not unlock high-demand GPUs');
  await expect(page.getByLabel('Minimum balance policy')).toContainText('No trial-accounting change');
  await expect(page.getByLabel('Minimum balance policy')).toContainText('No paid-credit policy change');
  await expect(page.getByLabel('Minimum balance policy')).toContainText('Read-only: no enforcement change');
  await expect(page.getByLabel('Minimum balance policy')).toContainText('4 future billing rails blocked');
  await expect(page.getByLabel('Pod proof gates')).toContainText('Workspace and LoRA image evidence');
  await expect(page.getByLabel('Pod proof gates')).toContainText('Workspace contract: CI safe');
  await expect(page.getByLabel('Pod proof gates')).toContainText('Workspace live: provider window');
  await expect(page.getByLabel('Pod proof gates')).toContainText('LoRA image: GPU-host proof');

  const gpuSelectionStrip = page.locator('.gpu-selection-strip');
  const gpuPickerStatus = page.getByLabel('GPU picker selected launch state');
  await expect(gpuPickerStatus).toContainText('Actual launch request');
  await expect(gpuPickerStatus).toContainText('Selected for launch: Auto-pick');
  await expect(gpuPickerStatus).toContainText('No card is pinned yet');
  await expect(gpuPickerStatus).toContainText('VRAM chips are filters only');
  await expect(gpuPickerStatus).toContainText('gpu_type omitted');
  await expect(gpuPickerStatus.getByRole('link', { name: 'Choose a GPU card' })).toBeVisible();
  await expect(gpuSelectionStrip).toContainText('Stage 2 selected launch GPU');
  await expect(gpuSelectionStrip).toContainText('Auto-pick: no fixed GPU');
  await expect(gpuSelectionStrip).toContainText('Request: auto-pick');
  await expect(gpuSelectionStrip).toContainText('Mode: auto-pick selected');
  await expect(gpuSelectionStrip).toContainText('Final launch request');
  await expect(gpuSelectionStrip).toContainText('gpu_type omitted = auto-pick');
  await expect(gpuSelectionStrip).toContainText('Any VRAM');
  await expect(gpuSelectionStrip).toContainText('2 shown');
  await expect(page.getByText('Browse filter only. Launch stays Auto-pick until you choose Use as launch GPU on a card.')).toBeVisible();
  await expect(page.getByText('Launch request: Auto-pick')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Launch auto-picked GPU pod' })).toBeVisible();
  await expect(page.getByText('Use as launch GPU').first()).toBeVisible();
  await expect(page.getByText('Browse filter only: VRAM')).toBeVisible();
  await page.getByRole('button', { name: /Not sure which GPU/ }).click();
  await page.getByRole('button', { name: /Fine-tune 7/ }).click();
  await expect(page.getByText(/Workload preset applied: Fine-tune 7/)).toBeVisible();
  await expect(page.getByText(/Launch remains Auto-pick until you choose Use as launch GPU/)).toBeVisible();
  await expect(page.getByText('Workload match').first()).toBeVisible();
  await expect(gpuSelectionStrip).toContainText('Browse filter 24 GB+');
  await expect(gpuSelectionStrip).toContainText('Fine-tune 7–13B');
  await expect(gpuPickerStatus).toContainText('Selected for launch: Auto-pick');
  await expect(gpuPickerStatus).toContainText('gpu_type omitted');
  await expect(page.getByLabel('Launch request preview')).toContainText('gpu_type omitted = auto-pick');
  await gpuSelectionStrip.getByRole('button', { name: 'Clear filters' }).click();
  await expect(gpuSelectionStrip).toContainText('No workload filter');
  await page.getByRole('button', { name: '80 GB+', exact: true }).click();
  await expect(finalGpuRequest).toContainText('Auto-pick GPU');
  await expect(finalGpuRequest).toContainText('gpu_type omitted = auto-pick');
  await expect(gpuSelectionStrip).toContainText('Browse filter 80 GB+');
  await expect(gpuSelectionStrip).toContainText('1 shown');
  await expect(computeSummary).toContainText('Browse filter 80 GB+');
  await expect(computeSummary).toContainText('Auto-pick at launch');
  await expect(computeSummary).toContainText('Filter only; not the launch GPU');
  await gpuSelectionStrip.getByRole('button', { name: 'Clear filters' }).click();
  await expect(gpuSelectionStrip).toContainText('Any VRAM');
  await expect(gpuSelectionStrip).toContainText('2 shown');
  await expect(page.getByLabel('Launch review')).toContainText('Stage 2');
  await expect(page.getByLabel('Launch review')).toContainText('Auto-pick GPU');
  await expect(page.getByLabel('Launch review')).toContainText('Trial via grant credit · native/community GPUs');

  await page.getByRole('radio', { name: /RTX 4090/ }).click();
  await expect(page.getByLabel('Stage 2 primary GPU decision')).toContainText('RTX 4090');
  await expect(page.getByLabel('Stage 2 primary GPU decision')).toContainText('Fixed request: RTX 4090');
  await expect(page.getByLabel('Stage 2 primary GPU decision')).toContainText('gpu_type = RTX 4090');
  await expect(finalGpuRequest).toContainText('RTX 4090');
  await expect(finalGpuRequest).toContainText('gpu_type = RTX 4090');
  await expect(finalGpuRequest).toContainText('Pinned card · 24 GB VRAM');
  await expect(computeSummary).toContainText('RTX 4090');
  await expect(computeSummary).toContainText('Actual GPU');
  await expect(computeSummary).toContainText('Fixed GPU selected for launch');
  await expect(computeSummary).toContainText('Request mode: Fixed GPU request');
  await expect(page.getByLabel('Launch request preview')).toContainText('gpu_type = RTX 4090');
  await expect(page.getByLabel('Launch request preview')).toContainText('This selected GPU card is pinned in the final launch request');
  await expect(computeSummary).toContainText('24 GB VRAM');
  await expect(computeSummary).toContainText('Quote: ~SAR');
  await expect(computeSummary.getByRole('button', { name: 'Auto-pick', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(computeSummary.getByRole('button', { name: 'Fixed GPU', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(launchChecklist).toContainText('RTX 4090');
  await expect(launchChecklist).toContainText('Fixed launch request · 24 GB · SAR 12.00/hr');
  await expect(page.getByLabel('Launch review')).toContainText('RTX 4090');
  await expect(gpuPickerStatus).toContainText('Selected for launch: RTX 4090');
  await expect(gpuPickerStatus).toContainText('Changing templates, VRAM chips, search, or sort will not replace the pinned GPU card.');
  await expect(gpuPickerStatus).toContainText('gpu_type = RTX 4090');
  await expect(stickyDecision).toContainText('RTX 4090');
  await expect(stickyDecision).toContainText('gpu_type = RTX 4090');
  await expect(gpuSelectionStrip).toContainText('RTX 4090');
  await expect(gpuSelectionStrip).toContainText('SAR 12.00/hr');
  await expect(gpuSelectionStrip).toContainText('Mode: fixed GPU selected');
  await expect(gpuSelectionStrip).toContainText('gpu_type = RTX 4090');
  await expect(stageControlMap).toContainText('A GPU card is pinned');
  await expect(page.locator('.gpu-card[aria-checked="true"]')).toContainText('Selected launch GPU');
  await expect(page.getByText('Browse filter only. Launch stays RTX 4090 until you choose another card or return to auto-pick.')).toBeVisible();
  await expect(page.getByText('Launch request: RTX 4090')).toBeVisible();
  await expect(page.getByText('Launch GPU selected').first()).toBeVisible();
  await expect(gpuSelectionStrip.getByRole('button', { name: 'Back to auto-pick' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use auto-pick' })).toBeVisible();
});

test('renter pods Stage 1 remembers collapse state and focuses folder previews', async ({ page, context }) => {
  await context.addCookies([{
    name: SESSION_COOKIE,
    value: buildSessionCookie('renter'),
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    expires: Math.floor(Date.now() / 1000) + 3600,
  }]);
  await page.addInitScript((key) => {
    window.localStorage.setItem('dc1_renter_key', key);
  }, RENTER_KEY);
  await mockPodsApis(page);
  await page.goto('/renter/pods');

  const stage1Checkpoint = page.getByLabel('Stage 1 workspace checkpoint');
  await expect(stage1Checkpoint).toContainText('Workspace details collapsed');
  const folderPreview = page.getByLabel('Stage 1 folder preview');
  await folderPreview.getByRole('button', { name: /Open Stage 1 with checkpoints\/ focused/ }).click();

  await expect(stage1Checkpoint).toContainText('Workspace details open');
  await expect(page.getByText('Stage 1 manifest')).toBeVisible();
  await expect(page.getByText('checkpoints/epoch-1.bin')).toBeVisible();
  await expect(page.getByText('datasets/train.jsonl')).toHaveCount(0);
  await expect(page.getByText('notebooks/demo.ipynb')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('dcp_pods_workspace_stage_open'))).toBe('open');

  await stage1Checkpoint.getByRole('button', { name: 'Collapse Stage 1 workspace' }).click();
  await expect(stage1Checkpoint).toContainText('Workspace details collapsed');
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('dcp_pods_workspace_stage_open'))).toBe('closed');

  await page.reload();
  await expect(page.getByLabel('Stage 1 workspace checkpoint')).toContainText('Workspace details collapsed');
  await expect(page.getByText('Stage 1 manifest')).toBeHidden();
});

test('playground workspace tab opens large manifests as a folder-first summary', async ({ page, context }) => {
  await context.addCookies([{
    name: SESSION_COOKIE,
    value: buildSessionCookie('renter'),
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    expires: Math.floor(Date.now() / 1000) + 3600,
  }]);
  await page.addInitScript((key) => {
    window.localStorage.setItem('dc1_renter_key', key);
  }, RENTER_KEY);
  await mockPodsApis(page);
  await mockPlaygroundV1Apis(page);

  await page.goto('/renter/playground?surface=workspace');

  await expect(page.getByRole('tab', { name: 'Workspace' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Workspace' })).toBeVisible();

  const folderSummary = page.getByLabel('Workspace folder summary');
  await expect(folderSummary).toContainText('Folder-first workspace');
  await expect(folderSummary).toContainText('5 files');
  await expect(folderSummary).toContainText('4 groups');
  await expect(folderSummary).toContainText('Large manifest collapsed');
  await expect(folderSummary).toContainText('datasets/');
  await expect(folderSummary).toContainText('notebooks/');
  await expect(page.getByText('datasets/train.jsonl')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Show full manifest' })).toBeVisible();

  await page.getByLabel('Search staged folders and files').fill('notebooks');
  await expect(folderSummary).toContainText('notebooks/');
  await expect(folderSummary).not.toContainText('datasets/');
  await page.getByLabel('Search staged folders and files').fill('');

  await folderSummary.getByRole('button', { name: /Open datasets\/ with 2 files/ }).click();
  await expect(page.getByText('datasets/train.jsonl')).toBeVisible();
  await expect(page.getByText('datasets/valid.jsonl')).toBeVisible();
  await expect(page.getByText('notebooks/demo.ipynb')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Collapse manifest' })).toBeVisible();
});

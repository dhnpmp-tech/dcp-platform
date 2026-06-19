#!/usr/bin/env node
/**
 * DCP MCP server — exposes DCP (Saudi Arabia's sovereign AI compute platform)
 * as Model Context Protocol tools, so any MCP-capable agent can run inference,
 * rent and manage GPUs (pods), and rent persistent storage on DCP.
 *
 * Auth: set DCP_API_KEY to a renter API key (Bearer). Get one + fund the wallet
 * at https://dcp.sa. Override the host with DCP_API_BASE (default https://api.dcp.sa).
 *
 * Run:  DCP_API_KEY=dc1-sk-... npx @dcp/mcp
 * Or wire it into an MCP client config as a stdio server (see README).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const API_BASE = (process.env.DCP_API_BASE || 'https://api.dcp.sa').replace(/\/$/, '');
const API_KEY = process.env.DCP_API_KEY || '';

async function dcp(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
    headers['x-renter-key'] = API_KEY; // DCP accepts either; belt + braces
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.error?.message || data.error || data.message)) || `HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

function ok(obj) {
  return { content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] };
}
function err(message) {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

const TOOLS = [
  {
    name: 'register_agent',
    description: 'Self-register a new DCP renter account in one call and get a REAL, immediately-usable API key plus a small SAR trial credit — no human, no email click. Use this first when DCP_API_KEY is not set. Save the returned api_key (set it as DCP_API_KEY) and you can immediately call list_gpus, create_pod, and chat. Email is optional (captured for recovery only).',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Optional contact email for account recovery/audit. Not required.' },
        label: { type: 'string', description: 'Optional free-text tag for this agent account (e.g. "research-bot").' },
        use_case: { type: 'string', description: 'Optional short description of what the account is for.' },
      },
    },
    // Unauthenticated by design — this is how an agent gets its first key.
    run: async (a) => {
      const body = {};
      if (a.email) body.email = a.email;
      if (a.label) body.label = a.label;
      if (a.use_case) body.use_case = a.use_case;
      const r = await dcp('POST', '/api/renters/agent-register', body);
      return ok({
        api_key: r.api_key,
        trial_credit_sar: r.trial_credit_sar,
        balance_sar: r.balance_sar,
        next: 'Set DCP_API_KEY to this api_key, then call list_gpus and create_pod.',
      });
    },
  },
  {
    name: 'list_models',
    description: 'List the AI models available for inference on DCP right now. Returns OpenAI-style model entries; only models with available=true are currently serveable.',
    inputSchema: { type: 'object', properties: { only_available: { type: 'boolean', description: 'If true (default), return only currently-serveable models.' } } },
    run: async (a) => {
      const r = await dcp('GET', '/v1/models');
      let data = (r && r.data) || [];
      if (a.only_available !== false) data = data.filter((m) => m.available);
      return ok({ count: data.length, models: data.map((m) => ({ id: m.id, available: m.available })) });
    },
  },
  {
    name: 'chat',
    description: 'Run a chat completion on DCP (OpenAI-compatible). Sovereign, in-Kingdom inference. Pick a model id from list_models (must be available).',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Model id (from list_models).' },
        messages: { type: 'array', description: 'OpenAI-style messages array: [{role, content}].', items: { type: 'object' } },
        max_tokens: { type: 'number' },
        temperature: { type: 'number' },
      },
      required: ['model', 'messages'],
    },
    run: async (a) => {
      const r = await dcp('POST', '/v1/chat/completions', {
        model: a.model, messages: a.messages,
        ...(a.max_tokens ? { max_tokens: a.max_tokens } : {}),
        ...(a.temperature != null ? { temperature: a.temperature } : {}),
      });
      const choice = r && r.choices && r.choices[0];
      return ok({ content: choice?.message?.content ?? '', finish_reason: choice?.finish_reason, usage: r?.usage });
    },
  },
  {
    name: 'get_balance',
    description: 'Get the renter wallet balance (SAR). Inference, pods, and volumes are all prepaid from this balance.',
    inputSchema: { type: 'object', properties: {} },
    run: async () => ok(await dcp('GET', '/api/renters/balance')),
  },
  {
    name: 'list_gpus',
    description: 'List the GPU types you can rent on DCP right now. Returns each available GPU TYPE with its VRAM and live availability — pick a gpu_type string from here (e.g. "H100", "RTX 4090") and pass it to create_pod. Only entries with available=true can be rented this moment.',
    inputSchema: { type: 'object', properties: { only_available: { type: 'boolean', description: 'If true (default), return only GPU types that are rentable right now.' } } },
    run: async (a) => {
      const r = await dcp('GET', '/api/renters/available-providers');
      let rows = (r && r.providers) || [];
      if (a.only_available !== false) rows = rows.filter((p) => p.available !== false);
      // Type-only view: GPU model + VRAM + availability. No provider_id / machine
      // name / vendor is ever exposed by the backend; we surface only the fields
      // an agent needs to choose a type.
      const gpus = rows.map((p) => ({
        gpu_type: p.gpu_model || null,
        vram_gb: p.vram_gb ?? (p.vram_mib ? Math.round(p.vram_mib / 1024) : null),
        available: p.available !== false,
        on_demand: p.on_demand === true,
      }));
      return ok({ count: gpus.length, gpus });
    },
  },
  {
    name: 'create_pod',
    description: 'Rent a whole GPU as an interactive pod (root + Jupyter + SSH), prepaid per minute in SAR. Pick a GPU type with the gpu_type argument (call list_gpus first to see the available types, e.g. "H100", "RTX 4090"); omit it to get an auto-picked GPU. Poll get_pod for the access_url once it is running.',
    inputSchema: {
      type: 'object',
      properties: {
        duration_minutes: { type: 'number', description: 'Rental duration in minutes (5–1440).' },
        gpu_type: { type: 'string', description: 'GPU type to rent, from list_gpus (e.g. "H100", "H200", "A100", "L40S", "RTX 5090", "RTX 4090"). Optional — omit for an auto-picked GPU. If the chosen type is out of stock the call fails clearly instead of substituting a different GPU.' },
      },
      required: ['duration_minutes'],
    },
    run: async (a) => ok(await dcp('POST', '/api/pods', {
      duration_minutes: a.duration_minutes,
      ...(a.gpu_type ? { gpu_type: a.gpu_type } : {}),
    })),
  },
  {
    name: 'get_pod',
    description: 'Get a pod\'s status and access details (status, access_url for Jupyter, ssh_command, ends_at, seconds_remaining).',
    inputSchema: { type: 'object', properties: { pod_id: { type: 'string' } }, required: ['pod_id'] },
    run: async (a) => ok(await dcp('GET', `/api/pods/${encodeURIComponent(a.pod_id)}`)),
  },
  {
    name: 'extend_pod',
    description: 'Add time to a running pod without restarting it. Charges the increment at the same rate; the workspace and Jupyter token are unchanged.',
    inputSchema: {
      type: 'object',
      properties: { pod_id: { type: 'string' }, extend_minutes: { type: 'number', description: '5–1440.' } },
      required: ['pod_id', 'extend_minutes'],
    },
    run: async (a) => ok(await dcp('POST', `/api/pods/${encodeURIComponent(a.pod_id)}/extend`, { extend_minutes: a.extend_minutes })),
  },
  {
    name: 'stop_pod',
    description: 'Stop a pod early. Unused prepaid time is refunded to the wallet.',
    inputSchema: { type: 'object', properties: { pod_id: { type: 'string' } }, required: ['pod_id'] },
    run: async (a) => ok(await dcp('DELETE', `/api/pods/${encodeURIComponent(a.pod_id)}`)),
  },
  {
    name: 'rent_volume',
    description: 'Rent an exclusive, in-Kingdom persistent storage volume (10/20/30 GB). With an active volume, a pod\'s /workspace persists across pods and providers.',
    inputSchema: {
      type: 'object',
      properties: { size_gb: { type: 'number', enum: [10, 20, 30] } },
      required: ['size_gb'],
    },
    run: async (a) => ok(await dcp('POST', '/api/volumes/rent', { size_gb: a.size_gb })),
  },
  {
    name: 'get_volume',
    description: 'Get the renter\'s active persistent volume (size, usage, price, pool availability).',
    inputSchema: { type: 'object', properties: {} },
    run: async () => ok(await dcp('GET', '/api/volumes/me')),
  },
];

const server = new Server(
  { name: 'dcp-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find((t) => t.name === req.params.name);
  if (!tool) return err(`unknown tool: ${req.params.name}`);
  // register_agent is the bootstrap tool — it mints the first key, so it must
  // run WITHOUT one. Every other tool needs an authenticated renter key.
  if (!API_KEY && req.params.name !== 'register_agent') {
    return err('DCP_API_KEY is not set. Call register_agent first to mint one (zero-human), or get a key at https://dcp.sa.');
  }
  try {
    return await tool.run(req.params.arguments || {});
  } catch (e) {
    return err(e.message || String(e));
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
// stderr only — stdout is the MCP transport.
console.error(`[dcp-mcp] connected · base=${API_BASE} · key=${API_KEY ? 'set' : 'MISSING'}`);

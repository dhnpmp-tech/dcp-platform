#!/usr/bin/env node
/**
 * DCP MCP server — exposes DCP (Saudi Arabia's sovereign AI compute platform)
 * as Model Context Protocol tools, so any MCP-capable agent can run inference,
 * rent and manage GPUs (pods), and rent persistent storage on DCP.
 *
 * Auth: set DCP_API_KEY to a renter API key (Bearer). Get one + fund the wallet
 * at https://dcp.sa. Override the host with DCP_API_BASE (default https://api.dcp.sa).
 *
 * Run:  DCP_API_KEY=dcp-renter-... npx @dcp/mcp
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
    name: 'create_pod',
    description: 'Rent a whole GPU as an interactive pod (root + Jupyter + SSH), prepaid per minute in SAR. Poll get_pod for the access_url once it is running.',
    inputSchema: {
      type: 'object',
      properties: { duration_minutes: { type: 'number', description: 'Rental duration in minutes (5–1440).' } },
      required: ['duration_minutes'],
    },
    run: async (a) => ok(await dcp('POST', '/api/pods', { duration_minutes: a.duration_minutes })),
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
  if (!API_KEY) return err('DCP_API_KEY is not set. Get a renter key + fund the wallet at https://dcp.sa.');
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

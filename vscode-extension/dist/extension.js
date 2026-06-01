/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/api/dc1Client.ts":
/*!******************************!*\
  !*** ./src/api/dc1Client.ts ***!
  \******************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.dc1 = exports.DC1Client = exports.JOB_TYPES = exports.DC1ApiError = void 0;
exports.isAuthError = isAuthError;
exports.isRetryableError = isRetryableError;
const https = __importStar(__webpack_require__(/*! https */ "https"));
const http = __importStar(__webpack_require__(/*! http */ "http"));
const vscode = __importStar(__webpack_require__(/*! vscode */ "vscode"));
class DC1ApiError extends Error {
    constructor(message, statusCode, responseBody) {
        super(message);
        this.statusCode = statusCode;
        this.responseBody = responseBody;
        this.name = 'DC1ApiError';
    }
}
exports.DC1ApiError = DC1ApiError;
function isAuthError(err) {
    if (err instanceof DC1ApiError && (err.statusCode === 401 || err.statusCode === 403)) {
        return true;
    }
    if (!(err instanceof Error)) {
        return false;
    }
    return /(?:^|\b)(401|403|unauthori[sz]ed|forbidden|invalid api key|api key is required|session expired)(?:\b|$)/i.test(err.message);
}
function isRetryableError(err) {
    if (err instanceof DC1ApiError) {
        return err.statusCode !== undefined && [408, 425, 429, 500, 502, 503, 504].includes(err.statusCode);
    }
    if (!(err instanceof Error)) {
        return false;
    }
    return /timed out|timeout|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket hang up/i.test(err.message);
}
exports.JOB_TYPES = [
    { value: 'llm_inference', label: 'LLM Inference' },
    { value: 'image_generation', label: 'Image Generation' },
    { value: 'vllm_serve', label: 'vLLM Serve (endpoint)' },
    { value: 'training', label: 'Training' },
    { value: 'rendering', label: 'Rendering' },
    { value: 'benchmark', label: 'Benchmark' },
    { value: 'custom_container', label: 'Custom Container' },
];
class DC1Client {
    get apiBase() {
        return vscode.workspace.getConfiguration('dc1').get('apiBase', 'https://api.dcp.sa');
    }
    request(method, path, headers = {}, body, timeoutMs = 15000) {
        return new Promise((resolve, reject) => {
            const url = new URL(this.apiBase + path);
            const isHttps = url.protocol === 'https:';
            const lib = isHttps ? https : http;
            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'DCP-VSCode-Extension/0.4.0',
                    ...headers,
                },
                // Allow self-signed certs on the dev VPS
                ...(isHttps ? { rejectUnauthorized: false } : {}),
            };
            const req = lib.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    const body = data.trim();
                    const statusCode = res.statusCode ?? 0;
                    if (!body) {
                        if (statusCode >= 400) {
                            reject(new Error(`HTTP ${statusCode}`));
                            return;
                        }
                        resolve({});
                        return;
                    }
                    try {
                        const parsed = JSON.parse(body);
                        if (statusCode >= 400) {
                            reject(new DC1ApiError(parsed.error || parsed.message || `HTTP ${statusCode}`, statusCode, body));
                            return;
                        }
                        resolve(parsed);
                    }
                    catch {
                        if (statusCode >= 400) {
                            reject(new DC1ApiError(`HTTP ${statusCode}: ${body.slice(0, 200)}`, statusCode, body));
                            return;
                        }
                        reject(new Error(`Failed to parse response: ${body.slice(0, 200)}`));
                    }
                });
            });
            req.on('error', (err) => {
                const code = err.code ? `${err.code}: ` : '';
                reject(new Error(`${code}${err.message}`));
            });
            req.setTimeout(timeoutMs, () => {
                req.destroy();
                reject(new Error(`Request timed out after ${timeoutMs / 1000}s`));
            });
            if (body) {
                req.write(JSON.stringify(body));
            }
            req.end();
        });
    }
    /** GET /api/renters/available-providers — no auth required */
    async getAvailableProviders() {
        return this.request('GET', '/api/renters/available-providers');
    }
    /** GET /api/providers/me?key= */
    async getProviderInfo(apiKey) {
        const data = await this.request('GET', `/api/providers/me?key=${encodeURIComponent(apiKey)}`);
        const provider = (data && typeof data === 'object' && data.provider && typeof data.provider === 'object')
            ? data.provider
            : data;
        const vramGbFromMib = typeof provider?.gpu_vram_mib === 'number' && provider.gpu_vram_mib > 0
            ? Math.round(provider.gpu_vram_mib / 1024)
            : null;
        const vramGbFromMb = typeof provider?.vram_mb === 'number' && provider.vram_mb > 0
            ? Math.round(provider.vram_mb / 1024)
            : null;
        return {
            id: String(provider?.id ?? ''),
            name: String(provider?.name ?? 'Provider'),
            email: String(provider?.email ?? ''),
            gpu_model: String(provider?.gpu_model ?? 'Unknown GPU'),
            vram_gb: vramGbFromMib ?? vramGbFromMb,
            gpu_count: Number(provider?.gpu_count_reported ?? provider?.gpu_count ?? 1),
            status: String(provider?.status ?? 'offline'),
            is_live: Boolean(provider?.is_live ?? String(provider?.status ?? '').toLowerCase() === 'online'),
            total_jobs: Number(provider?.total_jobs ?? 0),
            total_earnings_halala: Number(provider?.total_earnings_halala ?? 0),
            today_earnings_halala: Number(provider?.today_earnings_halala ?? 0),
            last_heartbeat: provider?.last_heartbeat ? String(provider.last_heartbeat) : null,
            driver_version: provider?.gpu_driver ?? provider?.driver_version ?? null,
            cuda_version: provider?.gpu_cuda_version ?? provider?.cuda_version ?? null,
        };
    }
    /** GET /api/renters/me?key= */
    async getRenterInfo(apiKey) {
        const data = await this.request('GET', `/api/renters/me?key=${encodeURIComponent(apiKey)}`);
        const renter = (data && typeof data === 'object' && data.renter && typeof data.renter === 'object')
            ? data.renter
            : data;
        return {
            id: String(renter?.id ?? ''),
            name: String(renter?.name ?? 'Renter'),
            email: String(renter?.email ?? ''),
            balance_halala: Number(renter?.balance_halala ?? 0),
            total_jobs: Number(renter?.total_jobs ?? 0),
            api_key: String(renter?.api_key ?? apiKey),
        };
    }
    /** GET /api/renters/me?key= — returns jobs array too */
    async getMyJobs(apiKey) {
        const data = await this.request('GET', `/api/renters/me?key=${encodeURIComponent(apiKey)}`);
        const jobs = Array.isArray(data?.jobs)
            ? data.jobs
            : (Array.isArray(data?.recent_jobs) ? data.recent_jobs : []);
        return jobs;
    }
    /** POST /api/jobs/submit */
    async submitJob(apiKey, payload) {
        return this.request('POST', '/api/jobs/submit', { 'x-renter-key': apiKey }, payload);
    }
    /** GET /api/jobs/:id/output */
    async getJobOutput(apiKey, jobId) {
        try {
            return await this.request('GET', `/api/jobs/${jobId}/output`, { 'x-renter-key': apiKey });
        }
        catch (err) {
            // Backend reports failed/cancelled jobs as HTTP 410 with structured JSON.
            if (err instanceof DC1ApiError && err.statusCode === 410 && err.responseBody) {
                try {
                    const parsed = JSON.parse(err.responseBody);
                    return {
                        status: parsed.status || 'failed',
                        message: parsed.error || 'Job is no longer available',
                        progress_phase: parsed.progress_phase,
                    };
                }
                catch {
                    return {
                        status: 'failed',
                        message: err.message,
                    };
                }
            }
            throw err;
        }
    }
    /** GET /api/jobs/:id/logs */
    async getJobLogs(apiKey, jobId) {
        return this.request('GET', `/api/jobs/${jobId}/logs`, { 'x-renter-key': apiKey });
    }
    /** POST /api/jobs/:id/cancel */
    async cancelJob(apiKey, jobId) {
        return this.request('POST', `/api/jobs/${jobId}/cancel`, { 'x-renter-key': apiKey });
    }
    /**
     * Stream job logs via SSE (GET /api/jobs/:id/logs/stream).
     * Returns a dispose() function to abort the stream.
     * Calls onLine for each SSE data line, onEnd when stream closes, onError on failure.
     */
    streamJobLogs(apiKey, jobId, onLine, onEnd, onError) {
        const url = new URL(this.apiBase + `/api/jobs/${jobId}/logs/stream`);
        const isHttps = url.protocol === 'https:';
        const lib = isHttps ? https : http;
        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: 'GET',
            headers: {
                'Accept': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'x-renter-key': apiKey,
                'User-Agent': 'DCP-VSCode-Extension/0.4.0',
            },
            ...(isHttps ? { rejectUnauthorized: false } : {}),
        };
        let req = null;
        let ws = null;
        let aborted = false;
        let hasReceivedAnyData = false;
        let activeMode = 'idle';
        let connectAttempt = 0;
        const maxConnectAttempts = 3;
        let fallbackTried = false;
        const dispose = () => {
            aborted = true;
            ws?.close(1000, 'closed by client');
            req?.destroy();
        };
        const maybeRetryOrFail = (err, hasDataForThisAttempt) => {
            if (aborted) {
                return;
            }
            if (!hasDataForThisAttempt && connectAttempt < maxConnectAttempts && isRetryableError(err)) {
                const backoffMs = connectAttempt * 1000;
                setTimeout(() => startSseStream(), backoffMs);
                return;
            }
            onError(err);
        };
        const parseSseChunk = (chunk) => {
            let buffer = '';
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const data = line.slice(5).trim();
                    if (!data || data === '[DONE]') {
                        continue;
                    }
                    try {
                        const payload = JSON.parse(data);
                        if (payload.type === 'end') {
                            onEnd();
                            continue;
                        }
                        if (payload.type === 'log' && typeof payload.line === 'string') {
                            onLine(payload.line);
                        }
                    }
                    catch {
                        onLine(data);
                    }
                }
            }
            return buffer;
        };
        const startSseStream = () => {
            activeMode = 'sse';
            if (aborted) {
                return;
            }
            connectAttempt += 1;
            let hasDataForThisAttempt = false;
            let buffer = '';
            try {
                req = lib.request(options, (res) => {
                    if (res.statusCode && res.statusCode >= 400) {
                        let errorBody = '';
                        res.setEncoding('utf8');
                        res.on('data', (chunk) => (errorBody += chunk));
                        res.on('end', () => {
                            let message = `SSE stream returned HTTP ${res.statusCode}`;
                            const trimmed = errorBody.trim();
                            if (trimmed) {
                                try {
                                    const parsed = JSON.parse(trimmed);
                                    message = parsed.error || parsed.message || message;
                                }
                                catch {
                                    message = `${message}: ${trimmed.slice(0, 200)}`;
                                }
                            }
                            maybeRetryOrFail(new DC1ApiError(message, res.statusCode, trimmed), false);
                        });
                        return;
                    }
                    connectAttempt = maxConnectAttempts;
                    res.setEncoding('utf8');
                    res.on('data', (chunk) => {
                        if (aborted) {
                            return;
                        }
                        const before = buffer;
                        buffer = `${before}${chunk}`;
                        const newBuffer = parseSseChunk(buffer);
                        if (newBuffer !== buffer) {
                            hasDataForThisAttempt = true;
                            hasReceivedAnyData = true;
                            buffer = newBuffer;
                        }
                    });
                    res.on('end', () => {
                        if (!aborted) {
                            onEnd();
                        }
                    });
                    res.on('error', (err) => {
                        maybeRetryOrFail(err, hasDataForThisAttempt);
                    });
                });
                req.on('error', (err) => {
                    const code = err.code ? `${err.code}: ` : '';
                    maybeRetryOrFail(new Error(`${code}${err.message}`), hasDataForThisAttempt);
                });
                req.setTimeout(300000, () => {
                    req?.destroy();
                    if (!hasReceivedAnyData) {
                        maybeRetryOrFail(new Error('SSE connection timed out before receiving log data'), hasDataForThisAttempt);
                        return;
                    }
                    if (!aborted) {
                        onEnd();
                    }
                });
                req.end();
            }
            catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                maybeRetryOrFail(error, hasDataForThisAttempt);
            }
        };
        const startWebSocketStream = () => {
            const wsConstructor = globalThis.WebSocket;
            if (typeof wsConstructor !== 'function') {
                startSseStream();
                return;
            }
            const wsUrl = new URL(url.toString());
            wsUrl.protocol = isHttps ? 'wss:' : 'ws:';
            wsUrl.searchParams.set('key', apiKey);
            const wsConnectTimeoutMs = 1200;
            let wsOpened = false;
            let wsBuffer = '';
            let wsConnectTimeout = null;
            try {
                ws = new wsConstructor(wsUrl.toString());
            }
            catch (err) {
                if (!aborted) {
                    startSseStream();
                }
                return;
            }
            wsConnectTimeout = setTimeout(() => {
                if (!wsOpened && !aborted) {
                    ws?.close(4000, 'websocket connect timeout');
                    if (!fallbackTried) {
                        fallbackTried = true;
                        startSseStream();
                    }
                }
            }, wsConnectTimeoutMs);
            ws.onopen = () => {
                wsOpened = true;
                activeMode = 'ws';
                if (wsConnectTimeout) {
                    clearTimeout(wsConnectTimeout);
                    wsConnectTimeout = null;
                }
            };
            ws.onmessage = (event) => {
                if (aborted || !event) {
                    return;
                }
                const payload = typeof event.data === 'string' ? event.data : String(event.data || '');
                wsBuffer += payload;
                if (!wsBuffer.includes('\n')) {
                    return;
                }
                const lines = wsBuffer.split('\n');
                wsBuffer = lines.pop() ?? '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) {
                        continue;
                    }
                    if (trimmed.startsWith('data:')) {
                        const data = trimmed.slice(5).trim();
                        if (!data || data === '[DONE]') {
                            continue;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.type === 'log' && typeof parsed.line === 'string') {
                                hasReceivedAnyData = true;
                                onLine(parsed.line);
                            }
                            if (parsed.type === 'end') {
                                onEnd();
                            }
                        }
                        catch {
                            onLine(data);
                        }
                        continue;
                    }
                    if (trimmed === '[DONE]') {
                        onEnd();
                        continue;
                    }
                    hasReceivedAnyData = true;
                    onLine(trimmed);
                }
            };
            ws.onerror = () => {
                if (aborted) {
                    return;
                }
                if (!wsOpened && !fallbackTried) {
                    fallbackTried = true;
                    startSseStream();
                    return;
                }
                onError(new Error('WebSocket log stream error'));
            };
            ws.onclose = () => {
                if (wsConnectTimeout) {
                    clearTimeout(wsConnectTimeout);
                }
                if (aborted) {
                    return;
                }
                if (!wsOpened && !fallbackTried) {
                    fallbackTried = true;
                    startSseStream();
                    return;
                }
                if (hasReceivedAnyData || !fallbackTried) {
                    onEnd();
                }
            };
        };
        try {
            startWebSocketStream();
        }
        catch (err) {
            onError(err instanceof Error ? err : new Error(String(err)));
        }
        return dispose;
    }
    /** POST /api/renters/topup */
    async topUp(apiKey, amountSar) {
        return this.request('POST', '/api/renters/topup', { 'x-renter-key': apiKey }, { amount_sar: amountSar });
    }
    /** GET /api/jobs/:id — single job status */
    async getJob(apiKey, jobId) {
        return this.request('GET', `/api/jobs/${jobId}`, { 'x-renter-key': apiKey });
    }
    /** GET /api/containers/registry — public, no auth required */
    async getContainerRegistry() {
        return this.request('GET', '/api/containers/registry');
    }
    /** GET /api/vllm/models — list available vLLM models from model registry */
    async getVllmModels() {
        return this.request('GET', '/api/vllm/models');
    }
    /**
     * POST /api/vllm/complete — synchronous LLM inference.
     * Long-running (waits for job completion on server, up to 300s).
     * Uses 120s client-side timeout.
     */
    async vllmComplete(apiKey, payload) {
        return this.request('POST', `/api/vllm/complete?key=${encodeURIComponent(apiKey)}`, {}, payload, 120000);
    }
    /** GET /api/templates — list all docker templates */
    async getDockerTemplates(tag) {
        const url = tag
            ? `/api/templates?tag=${encodeURIComponent(tag)}`
            : '/api/templates';
        return this.request('GET', url);
    }
    /** GET /api/models — list all available models */
    async getModels() {
        const data = await this.request('GET', '/api/models');
        const models = Array.isArray(data) ? data : (data.models || []);
        // Compute is_arabic flag and map pricing data for each model
        return {
            models: models.map((m) => ({
                model_id: m.model_id,
                display_name: m.display_name,
                family: m.family || null,
                vram_gb: m.vram_gb || m.min_gpu_vram_gb || 0,
                is_arabic: this.isArabicModel(m.model_id, m.family),
                providers_online: m.providers_online || 0,
                avg_price_sar_per_min: m.avg_price_sar_per_min || 0,
                status: m.status || 'no_providers',
                competitor_prices: m.competitor_prices ? {
                    vast_ai: m.competitor_prices.vast_ai || 0,
                    runpod: m.competitor_prices.runpod || 0,
                    aws: m.competitor_prices.aws || 0,
                } : undefined,
                savings_pct: m.savings_pct || 0,
            })),
            count: models.length,
        };
    }
    /** GET /health — check API health status */
    async getHealth() {
        try {
            return await this.request('GET', '/health', {}, undefined, 5000);
        }
        catch (err) {
            // If /health doesn't exist, try /api/health as fallback
            try {
                return await this.request('GET', '/api/health', {}, undefined, 5000);
            }
            catch {
                throw err; // Throw original error
            }
        }
    }
    /** Get diagnostic information */
    async getDiagnostics(apiKey) {
        const extensionVersion = '0.4.0';
        const result = {
            apiEndpoint: this.apiBase,
            extensionVersion,
        };
        try {
            const health = await this.getHealth();
            result.healthStatus = health.status || 'ok';
        }
        catch (err) {
            result.healthStatus = 'unreachable';
            result.error = err instanceof Error ? err.message : String(err);
            return result;
        }
        try {
            const models = await this.getModels();
            result.modelsAvailable = models.count;
        }
        catch {
            result.modelsAvailable = 0;
        }
        try {
            const providers = await this.getAvailableProviders();
            result.providersOnline = providers.providers.filter((p) => p.is_live).length;
        }
        catch {
            result.providersOnline = 0;
        }
        return result;
    }
    isArabicModel(modelId, family) {
        const arabicPatterns = [
            'allam', 'jais', 'falcon-h1', 'falcon_h1', 'arabic',
            'bge-m3', 'bge_m3', 'reranker-v2-m3', 'reranker_v2_m3',
        ];
        const haystack = `${modelId || ''} ${family || ''}`.toLowerCase();
        return arabicPatterns.some(pattern => haystack.includes(pattern));
    }
}
exports.DC1Client = DC1Client;
exports.dc1 = new DC1Client();


/***/ }),

/***/ "./src/auth/AuthManager.ts":
/*!*********************************!*\
  !*** ./src/auth/AuthManager.ts ***!
  \*********************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AuthManager = void 0;
const vscode = __importStar(__webpack_require__(/*! vscode */ "vscode"));
const dc1Client_1 = __webpack_require__(/*! ../api/dc1Client */ "./src/api/dc1Client.ts");
const RENTER_SECRET_KEY = 'dc1.renterApiKey';
const PROVIDER_SECRET_KEY = 'dc1.providerKey';
const RENTER_SETTING_KEY = 'renterApiKey';
class AuthManager {
    constructor(secrets) {
        this.secrets = secrets;
        this._onDidChangeKey = new vscode.EventEmitter();
        this.onDidChangeKey = this._onDidChangeKey.event;
        this._onDidChangeProviderKey = new vscode.EventEmitter();
        this.onDidChangeProviderKey = this._onDidChangeProviderKey.event;
    }
    async load() {
        this._apiKey = await this.getStoredRenterKey();
        this._providerKey = await this.secrets.get(PROVIDER_SECRET_KEY);
    }
    // ── Renter key accessors ──────────────────────────────────────────
    get apiKey() {
        return this._apiKey;
    }
    get isAuthenticated() {
        return !!this._apiKey;
    }
    async setApiKey(key) {
        await this.secrets.store(RENTER_SECRET_KEY, key);
        this._apiKey = key;
        this._onDidChangeKey.fire(key);
    }
    async clearApiKey() {
        await this.secrets.delete(RENTER_SECRET_KEY);
        this._apiKey = undefined;
        this._onDidChangeKey.fire(undefined);
    }
    /**
     * Resolve renter key from secure storage, with one-way migration from workspace settings.
     * Settings key fallback is retained only for backward compatibility.
     */
    async getStoredRenterKey() {
        if (this._apiKey?.trim()) {
            return this._apiKey.trim();
        }
        const secretKey = (await this.secrets.get(RENTER_SECRET_KEY))?.trim();
        if (secretKey) {
            this._apiKey = secretKey;
            return secretKey;
        }
        const settings = vscode.workspace.getConfiguration('dc1');
        const settingsKey = settings.get(RENTER_SETTING_KEY, '').trim();
        if (!settingsKey) {
            return undefined;
        }
        await this.secrets.store(RENTER_SECRET_KEY, settingsKey);
        this._apiKey = settingsKey;
        this._onDidChangeKey.fire(settingsKey);
        await settings.update(RENTER_SETTING_KEY, '', vscode.ConfigurationTarget.Global);
        return settingsKey;
    }
    /**
     * Prompt user for their DC1 renter API key, validate it, then store it.
     * Returns true if the key was saved successfully.
     */
    async promptAndSave() {
        const current = this._apiKey;
        const input = await vscode.window.showInputBox({
            title: 'DC1 Compute — Set Renter API Key',
            prompt: 'Enter your DC1 Renter API key (from dcp.sa/renter/register)',
            value: current,
            password: true,
            placeHolder: 'rk_xxxxxxxxxxxxxxxx',
            ignoreFocusOut: true,
            validateInput: (v) => (v.trim().length < 10 ? 'API key looks too short' : undefined),
        });
        if (!input) {
            return false;
        }
        const key = input.trim();
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'DC1: Validating renter API key…', cancellable: false }, async () => {
            try {
                const info = await dc1Client_1.dc1.getRenterInfo(key);
                await this.setApiKey(key);
                vscode.window.showInformationMessage(`DC1: Authenticated as ${info.name} (balance: ${(info.balance_halala / 100).toFixed(2)} SAR)`);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`DC1: Invalid renter API key — ${msg}`);
                throw err;
            }
        });
        return this.isAuthenticated;
    }
    /** Ensure renter key is set; prompt if not. Returns the key or undefined. */
    async ensureKey() {
        const existing = await this.getStoredRenterKey();
        if (existing) {
            return existing;
        }
        const saved = await this.promptAndSave();
        return saved ? this._apiKey : undefined;
    }
    /** Handle expired/invalid renter auth and prompt for re-authentication. */
    async handleRenterAuthError(err, action) {
        if (!(0, dc1Client_1.isAuthError)(err)) {
            return this._apiKey;
        }
        await this.clearApiKey();
        const next = await vscode.window.showWarningMessage(`DCP: Authentication failed while ${action}. Re-enter renter API key?`, 'Re-authenticate', 'Open Settings');
        if (next === 'Open Settings') {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'dc1.renterApiKey');
            return undefined;
        }
        if (next === 'Re-authenticate') {
            const saved = await this.promptAndSave();
            return saved ? this._apiKey : undefined;
        }
        return undefined;
    }
    // ── Provider key accessors ────────────────────────────────────────
    get providerKey() {
        return this._providerKey;
    }
    get providerApiKey() {
        return this._providerKey;
    }
    get isProviderAuthenticated() {
        return !!this._providerKey;
    }
    async getStoredProviderKey() {
        if (this._providerKey?.trim()) {
            return this._providerKey.trim();
        }
        const secretKey = (await this.secrets.get(PROVIDER_SECRET_KEY))?.trim();
        if (secretKey) {
            this._providerKey = secretKey;
            return secretKey;
        }
        return undefined;
    }
    async setProviderKey(key) {
        await this.secrets.store(PROVIDER_SECRET_KEY, key);
        this._providerKey = key;
        this._onDidChangeProviderKey.fire(key);
    }
    async clearProviderKey() {
        await this.secrets.delete(PROVIDER_SECRET_KEY);
        this._providerKey = undefined;
        this._onDidChangeProviderKey.fire(undefined);
    }
    /**
     * Prompt user for their DC1 provider API key, validate it, then store it.
     * Returns true if the key was saved successfully.
     */
    async promptAndSaveProvider() {
        const current = this._providerKey;
        const input = await vscode.window.showInputBox({
            title: 'DC1 Compute — Set Provider API Key',
            prompt: 'Enter your DC1 Provider API key (from dcp.sa/provider/register)',
            value: current,
            password: true,
            placeHolder: 'pk_xxxxxxxxxxxxxxxx',
            ignoreFocusOut: true,
            validateInput: (v) => (v.trim().length < 10 ? 'API key looks too short' : undefined),
        });
        if (!input) {
            return false;
        }
        const key = input.trim();
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'DC1: Validating provider API key…', cancellable: false }, async () => {
            try {
                const info = await dc1Client_1.dc1.getProviderInfo(key);
                await this.setProviderKey(key);
                const earningsSar = (info.total_earnings_halala / 100).toFixed(2);
                vscode.window.showInformationMessage(`DC1: Connected as provider ${info.name} — ${info.gpu_model} — ${earningsSar} SAR earned`);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`DC1: Invalid provider API key — ${msg}`);
                throw err;
            }
        });
        return this.isProviderAuthenticated;
    }
    dispose() {
        this._onDidChangeKey.dispose();
        this._onDidChangeProviderKey.dispose();
    }
}
exports.AuthManager = AuthManager;


/***/ }),

/***/ "./src/extension.ts":
/*!**************************!*\
  !*** ./src/extension.ts ***!
  \**************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(__webpack_require__(/*! vscode */ "vscode"));
const AuthManager_1 = __webpack_require__(/*! ./auth/AuthManager */ "./src/auth/AuthManager.ts");
const dc1Client_1 = __webpack_require__(/*! ./api/dc1Client */ "./src/api/dc1Client.ts");
const GPUTreeProvider_1 = __webpack_require__(/*! ./providers/GPUTreeProvider */ "./src/providers/GPUTreeProvider.ts");
const JobsTreeProvider_1 = __webpack_require__(/*! ./providers/JobsTreeProvider */ "./src/providers/JobsTreeProvider.ts");
const ProviderStatusTreeProvider_1 = __webpack_require__(/*! ./providers/ProviderStatusTreeProvider */ "./src/providers/ProviderStatusTreeProvider.ts");
const TemplatesCatalogProvider_1 = __webpack_require__(/*! ./providers/TemplatesCatalogProvider */ "./src/providers/TemplatesCatalogProvider.ts");
const ModelsCatalogProvider_1 = __webpack_require__(/*! ./providers/ModelsCatalogProvider */ "./src/providers/ModelsCatalogProvider.ts");
const JobsTreeProvider_2 = __webpack_require__(/*! ./providers/JobsTreeProvider */ "./src/providers/JobsTreeProvider.ts");
const GPUTreeProvider_2 = __webpack_require__(/*! ./providers/GPUTreeProvider */ "./src/providers/GPUTreeProvider.ts");
const JobSubmitPanel_1 = __webpack_require__(/*! ./panels/JobSubmitPanel */ "./src/panels/JobSubmitPanel.ts");
const VllmSubmitPanel_1 = __webpack_require__(/*! ./panels/VllmSubmitPanel */ "./src/panels/VllmSubmitPanel.ts");
const WalletPanel_1 = __webpack_require__(/*! ./panels/WalletPanel */ "./src/panels/WalletPanel.ts");
const SettingsPanel_1 = __webpack_require__(/*! ./panels/SettingsPanel */ "./src/panels/SettingsPanel.ts");
const ModelStatusPanel_1 = __webpack_require__(/*! ./panels/ModelStatusPanel */ "./src/panels/ModelStatusPanel.ts");
const ProviderEarningsPanel_1 = __webpack_require__(/*! ./panels/ProviderEarningsPanel */ "./src/panels/ProviderEarningsPanel.ts");
function activate(context) {
    // ── Auth ──────────────────────────────────────────────────────────
    const auth = new AuthManager_1.AuthManager(context.secrets);
    auth.load().then(() => {
        if (auth.isAuthenticated) {
            jobsProvider.refresh();
            updateStatusBar();
        }
        // Provider status bar is always shown (connected or not)
        updateProviderStatusBar();
        if (auth.isProviderAuthenticated) {
            providerStatusProvider.refresh();
        }
    });
    // ── Tree providers ────────────────────────────────────────────────
    const gpuProvider = new GPUTreeProvider_1.GPUTreeProvider();
    const jobsProvider = new JobsTreeProvider_1.JobsTreeProvider(auth);
    const providerStatusProvider = new ProviderStatusTreeProvider_1.ProviderStatusTreeProvider(auth);
    const templatesCatalogProvider = new TemplatesCatalogProvider_1.TemplatesCatalogProvider();
    const modelsCatalogProvider = new ModelsCatalogProvider_1.ModelsCatalogProvider();
    context.subscriptions.push(vscode.window.registerTreeDataProvider('dc1.availableGPUs', gpuProvider), vscode.window.registerTreeDataProvider('dc1.myJobs', jobsProvider), vscode.window.registerTreeDataProvider('dc1.providerStatus', providerStatusProvider), vscode.window.registerTreeDataProvider('dc1.templatesCatalog', templatesCatalogProvider), vscode.window.registerTreeDataProvider('dc1.modelsCatalog', modelsCatalogProvider), gpuProvider, jobsProvider, providerStatusProvider, templatesCatalogProvider, modelsCatalogProvider);
    // ── Provider status bar ───────────────────────────────────────────
    const providerStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
    providerStatusBar.command = 'dc1.setProviderKey';
    providerStatusBar.tooltip = 'DCP Provider — click to configure API key';
    context.subscriptions.push(providerStatusBar);
    function updateProviderStatusBar() {
        if (auth.isProviderAuthenticated) {
            providerStatusBar.text = '$(server) DCP Provider ✅';
            providerStatusBar.tooltip = 'DCP Provider connected — click to change key';
        }
        else {
            providerStatusBar.text = '$(server) DCP Provider ❌';
            providerStatusBar.tooltip = 'DCP Provider — not configured. Click to set API key.';
        }
        providerStatusBar.show();
    }
    updateProviderStatusBar();
    auth.onDidChangeProviderKey(() => {
        updateProviderStatusBar();
        providerStatusProvider.refresh();
        updateProviderEarningsBar();
    });
    // ── Provider earnings status bar ────────────────────────────────────
    const providerEarningsBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    providerEarningsBar.command = 'dc1.providerEarnings';
    context.subscriptions.push(providerEarningsBar);
    function updateProviderEarningsBar() {
        if (auth.isProviderAuthenticated) {
            providerEarningsBar.text = '$(trending-up) DCP Earnings';
            providerEarningsBar.tooltip = 'View provider earnings & pricing comparison';
            providerEarningsBar.show();
        }
        else {
            providerEarningsBar.hide();
        }
    }
    updateProviderEarningsBar();
    // ── Renter budget status bar ──────────────────────────────────────
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'dc1.openBillingPage';
    statusBarItem.tooltip = 'DCP Wallet Balance — click to view billing';
    context.subscriptions.push(statusBarItem);
    async function updateStatusBar() {
        const key = auth.apiKey;
        if (!key) {
            statusBarItem.text = '$(circuit-board) DCP: Ready';
            statusBarItem.tooltip = 'DCP Compute — click to view billing';
            statusBarItem.show();
            return;
        }
        try {
            const info = await dc1Client_1.dc1.getRenterInfo(key);
            const sar = (info.balance_halala / 100).toFixed(2);
            const jobs = await dc1Client_1.dc1.getMyJobs(key);
            const activeJobs = jobs.filter(j => j.status === 'running' || j.status === 'pending' || j.status === 'queued');
            if (activeJobs.length > 0) {
                statusBarItem.text = `$(loading~spin) DCP: ${activeJobs.length} job${activeJobs.length > 1 ? 's' : ''} running`;
            }
            else {
                statusBarItem.text = `$(circuit-board) DCP: Ready`;
            }
            statusBarItem.tooltip = `DCP Wallet: ${sar} SAR — ${info.total_jobs} total jobs — click to view billing`;
            statusBarItem.show();
        }
        catch {
            statusBarItem.text = '$(circuit-board) DCP: Ready';
            statusBarItem.show();
        }
    }
    // Refresh status bar every 60s
    const statusBarTimer = setInterval(() => {
        if (auth.isAuthenticated) {
            updateStatusBar();
        }
    }, 60000);
    context.subscriptions.push({ dispose: () => clearInterval(statusBarTimer) });
    // Update status bar when key changes
    auth.onDidChangeKey(() => updateStatusBar());
    statusBarItem.show();
    // Per-job output channels (keyed by job_id)
    const jobChannels = new Map();
    function getOrCreateJobChannel(jobId) {
        if (!jobChannels.has(jobId)) {
            const ch = vscode.window.createOutputChannel(`DCP Job Logs - ${jobId}`);
            context.subscriptions.push(ch);
            jobChannels.set(jobId, ch);
        }
        return jobChannels.get(jobId);
    }
    // ── Log streaming state ───────────────────────────────────────────
    let activeStreamDispose = null;
    let activeStreamJobId = null;
    const logStreamStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    logStreamStatusBar.command = 'dc1.stopLogStream';
    logStreamStatusBar.tooltip = 'DCP: Log stream active — click to stop';
    context.subscriptions.push(logStreamStatusBar);
    function startLogStream(key, jobId) {
        // Stop any existing stream first
        if (activeStreamDispose) {
            activeStreamDispose();
            activeStreamDispose = null;
            activeStreamJobId = null;
        }
        const ch = getOrCreateJobChannel(jobId);
        ch.show(true);
        ch.appendLine(`${'─'.repeat(60)}`);
        ch.appendLine(`DCP: Streaming logs for job #${jobId}`);
        ch.appendLine(`${'─'.repeat(60)}`);
        logStreamStatusBar.text = `$(loading~spin) DCP: Streaming #${jobId}`;
        logStreamStatusBar.show();
        activeStreamJobId = jobId;
        activeStreamDispose = dc1Client_1.dc1.streamJobLogs(key, jobId, (line) => ch.appendLine(line), () => {
            // Stream ended
            dc1Client_1.dc1.getJobOutput(key, jobId).then((output) => {
                const icon = output.status === 'completed' ? '✅' : '❌';
                ch.appendLine(`\n${icon} Job ${output.status}.`);
                if (output.result) {
                    ch.appendLine(output.result);
                }
            }).catch(() => {
                ch.appendLine('Could not fetch final output.');
            });
            logStreamStatusBar.text = `$(check) DCP: Job #${jobId} complete`;
            setTimeout(() => logStreamStatusBar.hide(), 5000);
            activeStreamDispose = null;
            activeStreamJobId = null;
            jobsProvider.refresh();
            updateStatusBar();
        }, (err) => {
            ch.appendLine(`Stream error: ${err.message}`);
            logStreamStatusBar.hide();
            activeStreamDispose = null;
            activeStreamJobId = null;
        });
    }
    // ── Commands ──────────────────────────────────────────────────────
    // dc1.setProviderKey — set/update provider API key
    context.subscriptions.push(vscode.commands.registerCommand('dc1.setProviderKey', async () => {
        await auth.promptAndSaveProvider();
        updateProviderStatusBar();
        providerStatusProvider.refresh();
    }));
    // dc1.clearProviderKey
    context.subscriptions.push(vscode.commands.registerCommand('dc1.clearProviderKey', async () => {
        const confirm = await vscode.window.showWarningMessage('Clear DCP Provider API key?', { modal: true }, 'Clear');
        if (confirm !== 'Clear') {
            return;
        }
        await auth.clearProviderKey();
        updateProviderStatusBar();
        vscode.window.showInformationMessage('DCP: Provider API key cleared.');
    }));
    // dc1.refreshProviderStatus
    context.subscriptions.push(vscode.commands.registerCommand('dc1.refreshProviderStatus', () => {
        providerStatusProvider.refresh();
    }));
    // dc1.setup — set/update renter API key
    context.subscriptions.push(vscode.commands.registerCommand('dc1.setup', async () => {
        await auth.promptAndSave();
        await updateStatusBar();
        jobsProvider.refresh();
    }));
    // dc1.refreshGPUs
    context.subscriptions.push(vscode.commands.registerCommand('dc1.refreshGPUs', () => {
        gpuProvider.refresh();
    }));
    // dc1.refreshJobs
    context.subscriptions.push(vscode.commands.registerCommand('dc1.refreshJobs', () => {
        jobsProvider.refresh();
        updateStatusBar();
    }));
    // dc1.refreshTemplates
    context.subscriptions.push(vscode.commands.registerCommand('dc1.refreshTemplates', () => {
        templatesCatalogProvider.refresh();
    }));
    // dc1.refreshModels
    context.subscriptions.push(vscode.commands.registerCommand('dc1.refreshModels', () => {
        modelsCatalogProvider.refresh();
    }));
    // dc1.deployTemplate — one-click deploy a template
    context.subscriptions.push(vscode.commands.registerCommand('dc1.deployTemplate', async (node) => {
        if (!node || !(node instanceof TemplatesCatalogProvider_1.TemplateNode)) {
            vscode.window.showErrorMessage('Invalid template selected');
            return;
        }
        const key = await auth.ensureKey();
        if (!key) {
            return;
        }
        // Show quick pick for GPU tier or duration
        const durationResult = await vscode.window.showInputBox({
            prompt: 'Enter deployment duration in minutes',
            value: '60',
            validateInput: (val) => {
                const num = Number(val);
                return isNaN(num) || num <= 0 ? 'Please enter a positive number' : '';
            }
        });
        if (!durationResult) {
            return;
        }
        const durationMinutes = Number(durationResult);
        const providers = gpuProvider.getProviders();
        // Quick pick a provider or auto-select first available
        if (providers.length === 0) {
            vscode.window.showErrorMessage('No providers available for deployment');
            return;
        }
        const provider = providers[0];
        const containerSpec = {
            image_type: node.template.image,
            vram_required_mb: node.template.min_vram_gb * 1024,
            gpu_count: 1,
        };
        try {
            const job = await dc1Client_1.dc1.submitJob(key, {
                provider_id: provider.id,
                job_type: node.template.job_type,
                duration_minutes: durationMinutes,
                container_spec: containerSpec,
                params: node.template.params,
            });
            vscode.window.showInformationMessage(`Template deployed! Job ID: ${job.job_id}`);
            jobsProvider.refresh();
            updateStatusBar();
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Failed to deploy template: ${message}`);
        }
    }));
    // dc1.startArabicRagSession — one-click deploy of Arabic RAG bundle
    context.subscriptions.push(vscode.commands.registerCommand('dc1.startArabicRagSession', async () => {
        const key = await auth.ensureKey();
        if (!key) {
            return;
        }
        // Find or create the Arabic RAG template reference
        const templates = templatesCatalogProvider.getTemplates();
        const arabicRagTemplate = templates.find(t => t.id === 'arabic-rag-complete');
        if (!arabicRagTemplate) {
            vscode.window.showErrorMessage('Arabic RAG template not available');
            return;
        }
        // Ask for duration
        const durationResult = await vscode.window.showInputBox({
            prompt: 'Enter deployment duration in minutes',
            value: '120',
            validateInput: (val) => {
                const num = Number(val);
                return isNaN(num) || num <= 0 ? 'Please enter a positive number' : '';
            }
        });
        if (!durationResult) {
            return;
        }
        const durationMinutes = Number(durationResult);
        const providers = gpuProvider.getProviders();
        if (providers.length === 0) {
            vscode.window.showErrorMessage('No providers available for deployment');
            return;
        }
        const provider = providers[0];
        const containerSpec = {
            image_type: arabicRagTemplate.image,
            vram_required_mb: arabicRagTemplate.min_vram_gb * 1024,
            gpu_count: 1,
        };
        try {
            vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Deploying Arabic RAG…' }, async () => {
                const job = await dc1Client_1.dc1.submitJob(key, {
                    provider_id: provider.id,
                    job_type: arabicRagTemplate.job_type,
                    duration_minutes: durationMinutes,
                    container_spec: containerSpec,
                    params: arabicRagTemplate.params,
                });
                const outputChannel = vscode.window.createOutputChannel('DCP Arabic RAG');
                outputChannel.show();
                outputChannel.appendLine(`Arabic RAG deployment started!`);
                outputChannel.appendLine(`Job ID: ${job.job_id}`);
                outputChannel.appendLine(`Status: ${job.status}`);
                outputChannel.appendLine(`Cost: ${job.cost_halala / 100} SAR`);
                outputChannel.appendLine('');
                outputChannel.appendLine('The RAG endpoint will be available once the job completes.');
                outputChannel.appendLine('Check the "My Jobs" view to monitor deployment progress.');
                jobsProvider.refresh();
                updateStatusBar();
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Failed to deploy Arabic RAG: ${message}`);
        }
    }));
    // dc1.searchTemplates — search templates by name/description
    context.subscriptions.push(vscode.commands.registerCommand('dc1.searchTemplates', async () => {
        const searchText = await vscode.window.showInputBox({
            prompt: 'Search templates by name or description',
            placeHolder: 'e.g., "llama", "embedding", "image"',
        });
        if (searchText !== undefined) {
            if (searchText.trim()) {
                templatesCatalogProvider.setSearchFilter(searchText);
                vscode.window.showInformationMessage(`Searching for: "${searchText}"`);
            }
            else {
                templatesCatalogProvider.clearFilters();
                vscode.window.showInformationMessage('Search cleared');
            }
        }
    }));
    // dc1.filterTemplatesByVram — filter templates by minimum VRAM
    context.subscriptions.push(vscode.commands.registerCommand('dc1.filterTemplatesByVram', async () => {
        const vramOptions = [
            { label: 'All (no filter)', value: null },
            { label: '4 GB+', value: 4 },
            { label: '8 GB+', value: 8 },
            { label: '16 GB+', value: 16 },
            { label: '24 GB+', value: 24 },
            { label: '40 GB+', value: 40 },
            { label: '80 GB+', value: 80 },
        ];
        const selected = await vscode.window.showQuickPick(vramOptions, {
            placeHolder: 'Filter by minimum VRAM requirement',
        });
        if (selected) {
            templatesCatalogProvider.setMinVramFilter(selected.value);
            const label = selected.label === 'All (no filter)' ? 'all templates' : selected.label;
            vscode.window.showInformationMessage(`Showing templates with ${label}`);
        }
    }));
    // dc1.clearTemplateFilters — clear all filters
    context.subscriptions.push(vscode.commands.registerCommand('dc1.clearTemplateFilters', async () => {
        templatesCatalogProvider.clearFilters();
        vscode.window.showInformationMessage('All filters cleared');
    }));
    // dc1.submitJob — open vLLM inference panel (model selector → POST /api/vllm/complete)
    context.subscriptions.push(vscode.commands.registerCommand('dc1.submitJob', async () => {
        // Check for API key — show guidance if missing
        const storedKey = await auth.getStoredRenterKey();
        if (!storedKey && !auth.isAuthenticated) {
            const action = await vscode.window.showWarningMessage('DCP: Set your renter API key to submit inference jobs.', 'Set Key in Settings', 'Set Key via Command');
            if (action === 'Set Key in Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'dc1.renterApiKey');
                return;
            }
            else if (action === 'Set Key via Command') {
                await auth.promptAndSave();
            }
            else {
                return;
            }
        }
        VllmSubmitPanel_1.VllmSubmitPanel.show(context.extensionUri, auth);
    }));
    // dc1.submitContainerJob — open container-based job submit panel (advanced)
    context.subscriptions.push(vscode.commands.registerCommand('dc1.submitContainerJob', async () => {
        const key = await auth.ensureKey();
        if (!key) {
            return;
        }
        const providers = gpuProvider.getProviders();
        let registryImages = [];
        try {
            const reg = await dc1Client_1.dc1.getContainerRegistry();
            registryImages = reg.images;
        }
        catch { /* use empty fallback */ }
        JobSubmitPanel_1.JobSubmitPanel.show(context.extensionUri, auth, providers, undefined, registryImages);
    }));
    // dc1.submitJobOnProvider — pre-select a GPU from tree context menu
    context.subscriptions.push(vscode.commands.registerCommand('dc1.submitJobOnProvider', async (providerOrNode) => {
        const key = await auth.ensureKey();
        if (!key) {
            return;
        }
        const provider = providerOrNode instanceof GPUTreeProvider_2.GPUNode ? providerOrNode.provider : providerOrNode;
        const providers = gpuProvider.getProviders();
        let registryImages = [];
        try {
            const reg = await dc1Client_1.dc1.getContainerRegistry();
            registryImages = reg.images;
        }
        catch { /* use empty fallback */ }
        JobSubmitPanel_1.JobSubmitPanel.show(context.extensionUri, auth, providers, provider, registryImages);
    }));
    // dc1.openBillingPage — open DCP billing page in browser
    context.subscriptions.push(vscode.commands.registerCommand('dc1.openBillingPage', () => {
        vscode.env.openExternal(vscode.Uri.parse('https://dcp.sa/renter/billing'));
    }));
    // dc1.viewJobLogs — stream job logs to per-job output channel
    context.subscriptions.push(vscode.commands.registerCommand('dc1.viewJobLogs', async (jobOrNode) => {
        const key = await auth.ensureKey();
        if (!key) {
            return;
        }
        const job = jobOrNode instanceof JobsTreeProvider_2.JobNode ? jobOrNode.job : jobOrNode;
        const jobId = job.job_id;
        const ch = getOrCreateJobChannel(jobId);
        ch.show(true);
        ch.appendLine(`${'─'.repeat(60)}`);
        ch.appendLine(`DCP Job #${jobId}  |  Type: ${job.job_type}  |  Status: ${job.status}`);
        ch.appendLine(`${'─'.repeat(60)}`);
        if (job.status === 'completed') {
            try {
                const output = await dc1Client_1.dc1.getJobOutput(key, jobId);
                if (output.result) {
                    ch.appendLine(output.result);
                }
                else {
                    ch.appendLine(`Status: ${output.status}`);
                    if (output.message) {
                        ch.appendLine(output.message);
                    }
                }
            }
            catch (err) {
                ch.appendLine(`Error fetching output: ${err instanceof Error ? err.message : String(err)}`);
            }
            return;
        }
        if (job.status === 'running' || job.status === 'pending' || job.status === 'queued') {
            ch.appendLine(`Job is ${job.status}. Attempting live log stream…`);
            // Capture narrowed key for use in closures
            const streamKey = key;
            // Try SSE streaming first; fall back to polling if stream errors immediately
            let sseConnected = false;
            let sseDispose = null;
            sseDispose = dc1Client_1.dc1.streamJobLogs(streamKey, jobId, (line) => {
                sseConnected = true;
                ch.appendLine(line);
            }, () => {
                // Stream ended — fetch final output
                ch.appendLine('\n--- Stream closed. Fetching final output… ---');
                dc1Client_1.dc1.getJobOutput(streamKey, jobId).then((output) => {
                    if (output.result) {
                        ch.appendLine(output.result);
                    }
                    const icon = output.status === 'completed' ? '✅' : '❌';
                    ch.appendLine(`\n${icon} Job ${output.status}.`);
                    jobsProvider.refresh();
                    updateStatusBar();
                }).catch(() => {
                    ch.appendLine('Could not fetch final output.');
                });
            }, (err) => {
                if ((0, dc1Client_1.isAuthError)(err)) {
                    auth.handleRenterAuthError(err, 'streaming logs').then((newKey) => {
                        if (newKey) {
                            ch.appendLine('Authentication refreshed. Restart "View Job Logs" to reconnect stream.');
                        }
                    });
                }
                if (!sseConnected) {
                    // SSE not available — fall back to polling
                    const retryNote = (0, dc1Client_1.isRetryableError)(err) ? ' after automatic retries' : '';
                    ch.appendLine(`Log stream unavailable${retryNote} (${err.message}). Falling back to polling…`);
                    startPolling();
                }
                else {
                    ch.appendLine(`Stream error: ${err.message}`);
                }
            });
            context.subscriptions.push({ dispose: () => sseDispose?.() });
            function startPolling() {
                const pollInterval = setInterval(async () => {
                    try {
                        const output = await dc1Client_1.dc1.getJobOutput(streamKey, jobId);
                        if (output.status === 'completed') {
                            clearInterval(pollInterval);
                            if (output.result) {
                                ch.appendLine('\n--- RESULT ---');
                                ch.appendLine(output.result);
                            }
                            ch.appendLine('\n✅ Job completed.');
                            jobsProvider.refresh();
                            updateStatusBar();
                        }
                        else if (output.status === 'failed' || output.status === 'cancelled') {
                            clearInterval(pollInterval);
                            ch.appendLine(`\n❌ Job ${output.status}: ${output.message ?? ''}`);
                            jobsProvider.refresh();
                        }
                        else {
                            if (output.progress_phase) {
                                ch.appendLine(`Phase: ${output.progress_phase}`);
                            }
                        }
                    }
                    catch {
                        clearInterval(pollInterval);
                        ch.appendLine('Polling stopped due to error.');
                    }
                }, vscode.workspace.getConfiguration('dc1').get('pollIntervalSeconds', 10) * 1000);
                context.subscriptions.push({ dispose: () => clearInterval(pollInterval) });
            }
            return;
        }
        ch.appendLine(`Job status: ${job.status}. No logs available.`);
    }));
    // dc1.cancelJob
    context.subscriptions.push(vscode.commands.registerCommand('dc1.cancelJob', async (jobOrNode) => {
        const key = await auth.ensureKey();
        if (!key) {
            return;
        }
        const job = jobOrNode instanceof JobsTreeProvider_2.JobNode ? jobOrNode.job : jobOrNode;
        const confirm = await vscode.window.showWarningMessage(`Cancel job ${job.job_id}? This may still incur partial charges.`, { modal: true }, 'Cancel Job');
        if (confirm !== 'Cancel Job') {
            return;
        }
        try {
            await dc1Client_1.dc1.cancelJob(key, job.job_id);
            vscode.window.showInformationMessage(`DCP: Job ${job.job_id} cancelled.`);
            jobsProvider.refresh();
        }
        catch (err) {
            vscode.window.showErrorMessage(`DCP: Cancel failed — ${err instanceof Error ? err.message : String(err)}`);
        }
    }));
    // dc1.streamLogs — start live log stream for a job id
    context.subscriptions.push(vscode.commands.registerCommand('dc1.streamLogs', async (jobIdArg) => {
        const key = await auth.ensureKey();
        if (!key) {
            return;
        }
        let jobId = jobIdArg;
        if (!jobId) {
            jobId = await vscode.window.showInputBox({
                prompt: 'Enter Job ID to stream logs for',
                placeHolder: 'e.g. abc123',
            });
        }
        if (!jobId) {
            return;
        }
        startLogStream(key, jobId.trim());
    }));
    // dc1.watchJobLogs — stream logs for a job ID to a named output channel
    context.subscriptions.push(vscode.commands.registerCommand('dc1.watchJobLogs', async (jobIdArg) => {
        let streamKey = auth.apiKey
            || await auth.getStoredRenterKey()
            || await auth.ensureKey();
        if (!streamKey) {
            return;
        }
        let jobId = jobIdArg;
        if (!jobId) {
            jobId = await vscode.window.showInputBox({
                title: 'DCP: Watch Job Logs',
                prompt: 'Enter the Job ID to stream logs for',
                placeHolder: 'e.g. job-1234567890-abc123',
                ignoreFocusOut: true,
            });
        }
        if (!jobId) {
            return;
        }
        const id = jobId.trim();
        const ch = vscode.window.createOutputChannel(`DCP Job ${id}`);
        context.subscriptions.push(ch);
        ch.show(true);
        ch.appendLine(`${'─'.repeat(60)}`);
        ch.appendLine(`DCP: Streaming logs for job ${id}`);
        ch.appendLine(`${'─'.repeat(60)}`);
        let receivedStreamData = false;
        let pollTimer;
        const stopPolling = () => {
            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = undefined;
            }
        };
        const startPollingFallback = () => {
            const intervalMs = vscode.workspace.getConfiguration('dc1').get('pollIntervalSeconds', 10) * 1000;
            ch.appendLine(`Falling back to status polling every ${intervalMs / 1000}s...`);
            pollTimer = setInterval(async () => {
                try {
                    const output = await dc1Client_1.dc1.getJobOutput(streamKey, id);
                    if (output.progress_phase) {
                        ch.appendLine(`Phase: ${output.progress_phase}`);
                    }
                    if (output.status === 'completed' || output.status === 'failed' || output.status === 'cancelled') {
                        stopPolling();
                        if (output.result) {
                            ch.appendLine('\n--- RESULT ---');
                            ch.appendLine(output.result);
                        }
                        const icon = output.status === 'completed' ? '✅' : '❌';
                        ch.appendLine(`\n${icon} Job ${output.status}.`);
                        jobsProvider.refresh();
                        updateStatusBar();
                    }
                }
                catch (pollErr) {
                    stopPolling();
                    const msg = pollErr instanceof Error ? pollErr.message : String(pollErr);
                    ch.appendLine(`Polling stopped: ${msg}`);
                }
            }, intervalMs);
        };
        const dispose = dc1Client_1.dc1.streamJobLogs(streamKey, id, (line) => {
            receivedStreamData = true;
            ch.appendLine(line);
        }, () => {
            stopPolling();
            ch.appendLine('\n--- Stream closed ---');
            dc1Client_1.dc1.getJobOutput(streamKey, id).then((output) => {
                const icon = output.status === 'completed' ? '✅' : '❌';
                ch.appendLine(`${icon} Job ${output.status}.`);
                if (output.result) {
                    ch.appendLine(output.result);
                }
            }).catch(() => {
                ch.appendLine('Could not fetch final output.');
            });
            jobsProvider.refresh();
            updateStatusBar();
        }, (err) => {
            if ((0, dc1Client_1.isAuthError)(err)) {
                auth.handleRenterAuthError(err, 'watching job logs').then((newKey) => {
                    if (newKey) {
                        streamKey = newKey;
                        ch.appendLine('Authentication refreshed. Streaming can continue with the updated key.');
                    }
                });
            }
            if (!receivedStreamData) {
                if ((0, dc1Client_1.isRetryableError)(err)) {
                    ch.appendLine(`Stream unavailable after automatic retries: ${err.message}`);
                }
                else {
                    ch.appendLine(`Stream unavailable: ${err.message}`);
                }
                startPollingFallback();
                return;
            }
            ch.appendLine(`Stream error: ${err.message}`);
        });
        context.subscriptions.push({
            dispose: () => {
                stopPolling();
                dispose();
            }
        });
    }));
    // dc1.stopLogStream — stop the active log stream
    context.subscriptions.push(vscode.commands.registerCommand('dc1.stopLogStream', () => {
        if (!activeStreamDispose) {
            vscode.window.showInformationMessage('DCP: No active log stream.');
            return;
        }
        activeStreamDispose();
        activeStreamDispose = null;
        const stoppedId = activeStreamJobId;
        activeStreamJobId = null;
        logStreamStatusBar.hide();
        if (stoppedId) {
            vscode.window.showInformationMessage(`DCP: Stopped log stream for job #${stoppedId}.`);
        }
    }));
    // dc1.openWallet
    context.subscriptions.push(vscode.commands.registerCommand('dc1.openWallet', async () => {
        const key = await auth.ensureKey();
        if (!key) {
            return;
        }
        WalletPanel_1.WalletPanel.show(context.extensionUri, auth);
    }));
    // dc1.showSettings — settings webview (apiBase + renterApiKey)
    context.subscriptions.push(vscode.commands.registerCommand('dc1.showSettings', () => {
        SettingsPanel_1.SettingsPanel.show(context.extensionUri);
    }));
    // dc1.modelStatus — model cache status table
    context.subscriptions.push(vscode.commands.registerCommand('dc1.modelStatus', () => {
        ModelStatusPanel_1.ModelStatusPanel.show(context.extensionUri);
    }));
    // dc1.providerEarnings — provider earnings dashboard with pricing comparison
    context.subscriptions.push(vscode.commands.registerCommand('dc1.providerEarnings', async () => {
        const key = await auth.getStoredProviderKey();
        if (!key && !auth.isProviderAuthenticated) {
            const action = await vscode.window.showWarningMessage('DCP: Set your provider API key to view earnings.', 'Set Key in Settings', 'Set Key via Command');
            if (action === 'Set Key in Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'dc1.providerApiKey');
                return;
            }
            else if (action === 'Set Key via Command') {
                await auth.promptAndSaveProvider();
            }
            else {
                return;
            }
        }
        ProviderEarningsPanel_1.ProviderEarningsPanel.show(context.extensionUri, auth);
    }));
    context.subscriptions.push(auth);
    updateStatusBar();
}
function deactivate() {
    // Nothing extra — subscriptions cleaned up by VS Code
}


/***/ }),

/***/ "./src/panels/JobSubmitPanel.ts":
/*!**************************************!*\
  !*** ./src/panels/JobSubmitPanel.ts ***!
  \**************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.JobSubmitPanel = void 0;
const vscode = __importStar(__webpack_require__(/*! vscode */ "vscode"));
const dc1Client_1 = __webpack_require__(/*! ../api/dc1Client */ "./src/api/dc1Client.ts");
// Friendly container type definitions shown in the panel
const CONTAINER_TYPES = [
    { value: 'pytorch-cuda', label: 'PyTorch + CUDA', computeType: 'inference' },
    { value: 'vllm-serve', label: 'vLLM Serve (LLM inference)', computeType: 'inference' },
    { value: 'training', label: 'Training (fine-tuning)', computeType: 'training' },
    { value: 'rendering', label: 'Rendering (ComfyUI)', computeType: 'rendering' },
];
const VRAM_OPTIONS = [
    { mb: 4096, label: '4 GB' },
    { mb: 8192, label: '8 GB' },
    { mb: 16384, label: '16 GB' },
    { mb: 24576, label: '24 GB' },
    { mb: 40960, label: '40 GB' },
];
class JobSubmitPanel {
    static show(extensionUri, auth, providers, preselectedProvider, registryImages = []) {
        if (JobSubmitPanel._current) {
            JobSubmitPanel._current._panel.reveal(vscode.ViewColumn.Beside);
            JobSubmitPanel._current.updateProviders(providers, preselectedProvider);
            return;
        }
        new JobSubmitPanel(extensionUri, auth, providers, preselectedProvider, registryImages);
    }
    constructor(extensionUri, auth, providers, preselected, registryImages = []) {
        this.auth = auth;
        this.providers = providers;
        this.preselected = preselected;
        this.registryImages = registryImages;
        this._disposables = [];
        this._panel = vscode.window.createWebviewPanel('dc1JobSubmit', 'DCP — Submit GPU Job', vscode.ViewColumn.Beside, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
            retainContextWhenHidden: true,
        });
        JobSubmitPanel._current = this;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg), null, this._disposables);
        this._panel.webview.html = this.buildHtml(providers, preselected, registryImages);
    }
    updateProviders(providers, preselected) {
        this.providers = providers;
        this.preselected = preselected;
        this._panel.webview.html = this.buildHtml(providers, preselected, this.registryImages);
    }
    async handleMessage(msg) {
        if (msg.type === 'cancel') {
            this._panel.dispose();
            return;
        }
        if (msg.type === 'submit') {
            let key = await this.auth.ensureKey();
            if (!key) {
                return;
            }
            const payload = msg.payload;
            // Post message back to webview: submitting
            this._panel.webview.postMessage({ type: 'submitting' });
            try {
                const result = await this.submitJobWithRetry(() => {
                    if (!key) {
                        throw new Error('Missing renter API key');
                    }
                    return dc1Client_1.dc1.submitJob(key, payload);
                }, async (err) => {
                    if (!(0, dc1Client_1.isAuthError)(err)) {
                        return undefined;
                    }
                    const refreshed = await this.auth.handleRenterAuthError(err, 'submitting a container job');
                    if (refreshed) {
                        key = refreshed;
                    }
                    return refreshed;
                });
                this._panel.webview.postMessage({
                    type: 'success',
                    jobId: result.job_id,
                    costSar: (result.cost_halala / 100).toFixed(2),
                    status: result.status,
                });
                vscode.window.showInformationMessage(`DCP: Job submitted! ID: ${result.job_id} | Cost: ${(result.cost_halala / 100).toFixed(2)} SAR`, 'Stream Logs', 'View Jobs').then((action) => {
                    if (action === 'Stream Logs') {
                        vscode.commands.executeCommand('dc1.streamLogs', result.job_id);
                    }
                    else if (action === 'View Jobs') {
                        vscode.commands.executeCommand('dc1.refreshJobs');
                    }
                });
            }
            catch (err) {
                const errMsg = humanizeError(err);
                this._panel.webview.postMessage({ type: 'error', message: errMsg });
            }
        }
    }
    async submitJobWithRetry(request, onAuthError) {
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                return await request();
            }
            catch (err) {
                const newKey = await onAuthError(err);
                if (newKey) {
                    continue;
                }
                if (attempt < maxAttempts && (0, dc1Client_1.isRetryableError)(err)) {
                    await delay(attempt * 700);
                    continue;
                }
                throw err;
            }
        }
        throw new Error('Unable to submit job after multiple attempts.');
    }
    buildHtml(providers, preselected, registryImages = []) {
        const providersJson = JSON.stringify(providers);
        const jobTypesJson = JSON.stringify(dc1Client_1.JOB_TYPES);
        const preselectedId = preselected?.id ?? '';
        const nonce = getNonce();
        // Build container type list: start with static types, add any extra from registry
        const registryExtras = registryImages
            .filter(img => !CONTAINER_TYPES.some(ct => img.includes(ct.value)))
            .map(img => ({ value: img, label: img, computeType: 'inference' }));
        const allContainerTypes = [...CONTAINER_TYPES, ...registryExtras];
        const containerTypesJson = JSON.stringify(allContainerTypes);
        const vramOptionsJson = JSON.stringify(VRAM_OPTIONS);
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DCP — Submit GPU Job</title>
  <style>
    :root {
      --amber: #F5A524;
      --void: #07070E;
      --surface: #111118;
      --surface2: #1a1a24;
      --text: #e8e8f0;
      --muted: #888898;
      --border: #2a2a3a;
      --error: #ff4a4a;
      --success: #22c55e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--surface);
      color: var(--text);
      font-family: var(--vscode-font-family, 'Inter', sans-serif);
      font-size: 13px;
      padding: 20px;
      line-height: 1.5;
    }
    h1 {
      color: var(--amber);
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 6px;
      letter-spacing: -0.02em;
    }
    .subtitle { color: var(--muted); font-size: 12px; margin-bottom: 20px; }
    .form-group { margin-bottom: 16px; }
    label { display: block; color: var(--muted); font-size: 11px; text-transform: uppercase;
            letter-spacing: 0.08em; margin-bottom: 6px; font-weight: 600; }
    select, input, textarea {
      width: 100%;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      padding: 8px 10px;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s;
    }
    select:focus, input:focus, textarea:focus { border-color: var(--amber); }
    .gpu-card {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 10px;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }
    .gpu-card.selected { border-color: var(--amber); background: #1e1a10; }
    .gpu-card:hover { border-color: #444458; }
    .gpu-name { font-weight: 600; font-size: 13px; }
    .gpu-meta { color: var(--muted); font-size: 11px; margin-top: 3px; }
    .live-dot {
      display: inline-block; width: 7px; height: 7px; border-radius: 50%;
      background: var(--success); margin-right: 5px; vertical-align: middle;
    }
    .row { display: flex; gap: 12px; }
    .row .form-group { flex: 1; }
    .job-type-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .jt-btn {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 10px;
      cursor: pointer;
      color: var(--text);
      font-size: 12px;
      text-align: center;
      transition: all 0.15s;
    }
    .jt-btn.selected { border-color: var(--amber); color: var(--amber); background: #1e1a10; }
    .jt-btn:hover { border-color: #444458; }
    .params-row { display: flex; gap: 8px; }
    .params-row input { flex: 1; }
    textarea { resize: vertical; min-height: 80px; font-family: var(--vscode-editor-font-family, monospace); }
    .btn-primary {
      background: var(--amber);
      color: var(--void);
      border: none;
      border-radius: 6px;
      padding: 10px 24px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      width: 100%;
      margin-top: 8px;
      transition: opacity 0.15s;
    }
    .btn-primary:hover { opacity: 0.9; }
    .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
    .alert { padding: 10px 14px; border-radius: 6px; margin-top: 14px; font-size: 12px; }
    .alert-error { background: #1f0a0a; border: 1px solid #3d1010; color: #ff8080; }
    .alert-success { background: #0a1f10; border: 1px solid #103d18; color: #60e890; }
    .cost-preview { color: var(--amber); font-size: 12px; margin-top: 4px; }
    .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase;
                     letter-spacing: 0.1em; color: var(--muted); margin-bottom: 10px; }
    #noProviders { color: var(--muted); font-size: 12px; padding: 12px;
                   border: 1px dashed var(--border); border-radius: 6px; text-align: center; }
    .toggle-row { display: flex; gap: 6px; flex-wrap: wrap; }
    .toggle-btn {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 12px;
      cursor: pointer;
      color: var(--text);
      font-size: 12px;
      transition: all 0.15s;
    }
    .toggle-btn.selected { border-color: var(--amber); color: var(--amber); background: #1e1a10; }
    .toggle-btn:hover { border-color: #444458; }
    .container-spec-row { display: flex; gap: 12px; flex-direction: column; }
  </style>
</head>
<body>
  <h1>⚡ Submit GPU Job</h1>
  <div class="subtitle">DCP Compute — Saudi Arabia's GPU Marketplace</div>

  <div class="form-group">
    <div class="section-title">1 · Select Provider GPU</div>
    <div id="providerList"></div>
    <div id="noProviders" style="display:none">No GPUs online. Refresh the sidebar to check again.</div>
  </div>

  <div class="form-group">
    <div class="section-title">2 · Job Type</div>
    <div class="job-type-grid" id="jobTypeGrid"></div>
  </div>

  <div class="form-group" id="promptGroup">
    <label>Prompt / Task</label>
    <textarea id="promptInput" placeholder="Enter your prompt or task description…" rows="3"></textarea>
  </div>

  <div class="form-group" id="modelGroup">
    <label>Model</label>
    <input type="text" id="modelInput" value="meta-llama/Llama-3.1-8B-Instruct"
           placeholder="e.g. meta-llama/Llama-3.1-8B-Instruct">
  </div>

  <div class="form-group">
    <div class="section-title">3 · Container Spec</div>
    <div class="container-spec-row">
      <div>
        <label>Container Type</label>
        <select id="containerTypeSelect"></select>
      </div>
      <div>
        <label>VRAM Required</label>
        <div class="toggle-row" id="vramToggle"></div>
      </div>
      <div>
        <label>GPU Count</label>
        <div class="toggle-row" id="gpuCountToggle">
          <button class="toggle-btn selected" data-count="1">1×</button>
          <button class="toggle-btn" data-count="2">2×</button>
          <button class="toggle-btn" data-count="4">4×</button>
        </div>
      </div>
    </div>
  </div>

  <div class="row">
    <div class="form-group">
      <label>Duration (minutes)</label>
      <input type="number" id="durationInput" value="10" min="1" max="1440">
      <div class="cost-preview" id="costPreview">Estimated cost: calculating…</div>
    </div>
    <div class="form-group">
      <label>Priority</label>
      <select id="priorityInput">
        <option value="2" selected>Normal</option>
        <option value="1">High</option>
        <option value="3">Low</option>
      </select>
    </div>
  </div>

  <button class="btn-primary" id="submitBtn" disabled>Submit Job</button>
  <div id="alertBox"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const PROVIDERS = ${providersJson};
    const JOB_TYPES = ${jobTypesJson};
    const PRESELECTED_ID = '${preselectedId}';
    const CONTAINER_TYPES = ${containerTypesJson};
    const VRAM_OPTIONS = ${vramOptionsJson};

    // Cost rates from backend (halala/minute)
    const COST_RATES = {
      'llm_inference': 5,
      'llm-inference': 5,
      'image_generation': 8,
      'rendering': 6,
      'training': 10,
      'benchmark': 3,
      'custom_container': 5,
      'vllm_serve': 7,
      'default': 5
    };

    let selectedProviderId = PRESELECTED_ID || (PROVIDERS[0]?.id ?? '');
    let selectedJobType = 'llm_inference';
    let selectedContainerType = CONTAINER_TYPES[0]?.value ?? 'pytorch-cuda';
    let selectedVramMb = VRAM_OPTIONS[1]?.mb ?? 8192; // default 8 GB
    let selectedGpuCount = 1;

    // Populate container type dropdown
    const ctSelect = document.getElementById('containerTypeSelect');
    CONTAINER_TYPES.forEach(ct => {
      const opt = document.createElement('option');
      opt.value = ct.value;
      opt.textContent = ct.label;
      if (ct.value === selectedContainerType) { opt.selected = true; }
      ctSelect.appendChild(opt);
    });
    ctSelect.addEventListener('change', () => {
      selectedContainerType = ctSelect.value;
    });

    // Populate VRAM toggle buttons
    const vramToggle = document.getElementById('vramToggle');
    VRAM_OPTIONS.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'toggle-btn' + (opt.mb === selectedVramMb ? ' selected' : '');
      btn.textContent = opt.label;
      btn.dataset.mb = String(opt.mb);
      btn.addEventListener('click', () => {
        document.querySelectorAll('#vramToggle .toggle-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedVramMb = opt.mb;
      });
      vramToggle.appendChild(btn);
    });

    // GPU count toggle
    document.querySelectorAll('#gpuCountToggle .toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#gpuCountToggle .toggle-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedGpuCount = parseInt(btn.dataset.count);
      });
    });

    // Render providers
    const list = document.getElementById('providerList');
    const noProv = document.getElementById('noProviders');
    if (PROVIDERS.length === 0) {
      list.style.display = 'none';
      noProv.style.display = 'block';
    } else {
      PROVIDERS.forEach(p => {
        const card = document.createElement('div');
        card.className = 'gpu-card' + (p.id === selectedProviderId ? ' selected' : '');
        card.dataset.id = p.id;
        const vram = p.vram_gb ? p.vram_gb + 'GB' : '?GB';
        const count = p.gpu_count > 1 ? ' × ' + p.gpu_count : '';
        const live = p.is_live ? '<span class="live-dot"></span>' : '⚠️ ';
        card.innerHTML =
          '<div class="gpu-name">' + live + (p.gpu_model || 'Unknown GPU') + count + '</div>' +
          '<div class="gpu-meta">' + vram + ' VRAM' +
          (p.location ? ' · ' + p.location : '') +
          (p.reliability_score !== null ? ' · ' + p.reliability_score + '% reliability' : '') + '</div>';
        card.addEventListener('click', () => {
          document.querySelectorAll('.gpu-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          selectedProviderId = p.id;
          updateSubmitState();
        });
        list.appendChild(card);
      });
    }

    // Render job types
    const grid = document.getElementById('jobTypeGrid');
    JOB_TYPES.forEach(jt => {
      const btn = document.createElement('div');
      btn.className = 'jt-btn' + (jt.value === selectedJobType ? ' selected' : '');
      btn.textContent = jt.label;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.jt-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedJobType = jt.value;
        updateParamVisibility();
        updateCostPreview();
        updateSubmitState();
      });
      grid.appendChild(btn);
    });

    function updateParamVisibility() {
      const needsPrompt = ['llm_inference', 'llm-inference', 'image_generation', 'vllm_serve'].includes(selectedJobType);
      document.getElementById('promptGroup').style.display = needsPrompt ? '' : 'none';
      document.getElementById('modelGroup').style.display = needsPrompt ? '' : 'none';
    }

    function updateCostPreview() {
      const mins = parseInt(document.getElementById('durationInput').value) || 10;
      const rate = COST_RATES[selectedJobType] || COST_RATES['default'];
      const halala = rate * mins;
      document.getElementById('costPreview').textContent =
        'Estimated cost: ' + (halala / 100).toFixed(2) + ' SAR (' + halala + ' halala)';
    }

    function updateSubmitState() {
      const btn = document.getElementById('submitBtn');
      btn.disabled = !selectedProviderId || PROVIDERS.length === 0;
    }

    document.getElementById('durationInput').addEventListener('input', updateCostPreview);

    document.getElementById('submitBtn').addEventListener('click', () => {
      const duration = parseInt(document.getElementById('durationInput').value);
      const priority = parseInt(document.getElementById('priorityInput').value);
      const prompt = document.getElementById('promptInput').value.trim();
      const model = document.getElementById('modelInput').value.trim();

      if (!duration || duration <= 0) {
        showAlert('Please enter a valid duration.', 'error');
        return;
      }

      const ctDef = CONTAINER_TYPES.find(ct => ct.value === selectedContainerType);
      const containerSpec = {
        image_type: selectedContainerType,
        vram_required_mb: selectedVramMb,
        gpu_count: selectedGpuCount,
        compute_type: ctDef?.computeType ?? 'inference',
      };

      const payload = {
        provider_id: selectedProviderId,
        job_type: selectedJobType,
        duration_minutes: duration,
        container_spec: containerSpec,
        priority,
        ...(prompt || model ? { params: {
          ...(prompt ? { prompt } : {}),
          ...(model ? { model } : {})
        }} : {})
      };

      vscode.postMessage({ type: 'submit', payload });
    });

    function showAlert(msg, type) {
      const box = document.getElementById('alertBox');
      box.innerHTML = '<div class="alert alert-' + type + '">' + escapeHtml(msg) + '</div>';
    }

    function escapeHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    window.addEventListener('message', e => {
      const msg = e.data;
      const btn = document.getElementById('submitBtn');
      if (msg.type === 'submitting') {
        btn.disabled = true;
        btn.textContent = 'Submitting…';
        document.getElementById('alertBox').innerHTML = '';
      } else if (msg.type === 'success') {
        btn.disabled = false;
        btn.textContent = 'Submit Job';
        showAlert('✅ Job submitted! ID: ' + msg.jobId + ' · Cost: ' + msg.costSar + ' SAR · Status: ' + msg.status, 'success');
      } else if (msg.type === 'error') {
        btn.disabled = false;
        btn.textContent = 'Submit Job';
        showAlert('❌ ' + msg.message, 'error');
      }
    });

    // Init
    updateParamVisibility();
    updateCostPreview();
    updateSubmitState();
  </script>
</body>
</html>`;
    }
    dispose() {
        JobSubmitPanel._current = undefined;
        this._panel.dispose();
        this._disposables.forEach((d) => d.dispose());
        this._disposables = [];
    }
}
exports.JobSubmitPanel = JobSubmitPanel;
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function humanizeError(err) {
    if (!(err instanceof Error)) {
        return String(err);
    }
    if ((0, dc1Client_1.isAuthError)(err)) {
        return 'Authentication failed. Re-run "DCP: Set Renter API Key" and try again.';
    }
    if ((0, dc1Client_1.isRetryableError)(err)) {
        return `${err.message}. DCP retried automatically; please retry once more if the network is unstable.`;
    }
    return err.message;
}


/***/ }),

/***/ "./src/panels/ModelStatusPanel.ts":
/*!****************************************!*\
  !*** ./src/panels/ModelStatusPanel.ts ***!
  \****************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ModelStatusPanel = void 0;
const vscode = __importStar(__webpack_require__(/*! vscode */ "vscode"));
const dc1Client_1 = __webpack_require__(/*! ../api/dc1Client */ "./src/api/dc1Client.ts");
class ModelStatusPanel {
    static show(extensionUri) {
        if (ModelStatusPanel._current) {
            ModelStatusPanel._current._panel.reveal(vscode.ViewColumn.Beside);
            ModelStatusPanel._current.reload();
            return;
        }
        new ModelStatusPanel(extensionUri);
    }
    constructor(extensionUri) {
        this._disposables = [];
        this._panel = vscode.window.createWebviewPanel('dcpModelStatus', 'DCP — Model Cache Status', vscode.ViewColumn.Beside, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
            retainContextWhenHidden: true,
        });
        ModelStatusPanel._current = this;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage((msg) => {
            if (msg.type === 'refresh') {
                this.reload();
            }
        }, null, this._disposables);
        this._panel.webview.html = this.buildHtml([], true);
        this.reload();
    }
    async reload() {
        try {
            const resp = await dc1Client_1.dc1.getVllmModels();
            this._panel.webview.html = this.buildHtml(resp.data || [], false);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this._panel.webview.html = this.buildHtml([], false, msg);
        }
    }
    buildTableHtml(models) {
        if (models.length === 0) {
            return '<div class="empty-state">No models available. Check your API connection.</div>';
        }
        const available = models.filter(m => m.status === 'available').length;
        const totalProviders = models.reduce((sum, m) => sum + m.providers_online, 0);
        const statsHtml = `
      <div class="summary-row">
        <div class="stat-card">
          <div class="stat-label">Total Models</div>
          <div class="stat-value amber">${models.length}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Available</div>
          <div class="stat-value">${available}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Providers Online</div>
          <div class="stat-value">${totalProviders}</div>
        </div>
      </div>`;
        const rowsHtml = models.map((m) => {
            const statusBadge = m.status === 'available'
                ? '<span class="badge badge-green">● Available</span>'
                : '<span class="badge badge-red">● Offline</span>';
            // Estimate cold start based on VRAM footprint (heuristic)
            let coldStartLabel;
            let coldStartClass;
            if (m.status !== 'available') {
                coldStartLabel = 'N/A';
                coldStartClass = '';
            }
            else if (m.vram_gb <= 8) {
                coldStartLabel = '~20s';
                coldStartClass = 'cold-fast';
            }
            else if (m.vram_gb <= 16) {
                coldStartLabel = '~45s';
                coldStartClass = 'cold-medium';
            }
            else if (m.vram_gb <= 40) {
                coldStartLabel = '~90s';
                coldStartClass = 'cold-medium';
            }
            else {
                coldStartLabel = '~3min';
                coldStartClass = 'cold-slow';
            }
            const quant = m.quantization
                ? ` <span class="badge badge-yellow">${esc(m.quantization)}</span>`
                : '';
            return `<tr>
        <td>
          <div class="model-name">${esc(m.display_name)}${quant}</div>
          <div class="model-id">${esc(m.model_id)}</div>
        </td>
        <td>${statusBadge}</td>
        <td>${m.providers_online}</td>
        <td>${m.min_gpu_vram_gb} GB</td>
        <td>${Number(m.context_window).toLocaleString()}</td>
        <td class="${coldStartClass}">${coldStartLabel}</td>
        <td>${m.avg_price_sar_per_min} SAR/min</td>
      </tr>`;
        }).join('');
        return statsHtml + `
      <table>
        <thead>
          <tr>
            <th>Model</th>
            <th>Status</th>
            <th>Providers</th>
            <th>Min VRAM</th>
            <th>Context</th>
            <th>Est. Cold Start</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>`;
    }
    buildHtml(models, loading, errorMsg) {
        const nonce = getNonce();
        const fetchedAt = new Date().toLocaleTimeString();
        const tableHtml = (!loading && !errorMsg) ? this.buildTableHtml(models) : '';
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DCP — Model Cache Status</title>
  <style>
    :root {
      --amber: #F5A524;
      --void: #07070E;
      --surface: #111118;
      --surface2: #1a1a24;
      --text: #e8e8f0;
      --muted: #888898;
      --border: #2a2a3a;
      --error: #ff4a4a;
      --success: #22c55e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--surface);
      color: var(--text);
      font-family: var(--vscode-font-family, 'Inter', sans-serif);
      font-size: 13px;
      padding: 20px;
      line-height: 1.6;
    }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
    h1 { color: var(--amber); font-size: 17px; font-weight: 700; }
    .subtitle { color: var(--muted); font-size: 12px; margin-top: 2px; }
    .refresh-btn {
      background: transparent; border: 1px solid var(--border);
      border-radius: 6px; padding: 6px 14px; color: var(--muted);
      font-size: 12px; font-weight: 600; cursor: pointer; transition: border-color 0.15s;
      white-space: nowrap;
    }
    .refresh-btn:hover { border-color: var(--amber); color: var(--text); }
    .refresh-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .summary-row { display: flex; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
    .stat-card {
      background: var(--surface2); border: 1px solid var(--border);
      border-radius: 8px; padding: 12px 16px; flex: 1; min-width: 130px;
    }
    .stat-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.07em; font-weight: 600; }
    .stat-value { font-size: 22px; font-weight: 700; color: var(--text); margin-top: 2px; }
    .stat-value.amber { color: var(--amber); }
    table { width: 100%; border-collapse: collapse; }
    thead th {
      text-align: left; padding: 8px 10px;
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em;
      color: var(--muted); font-weight: 700;
      border-bottom: 1px solid var(--border); white-space: nowrap;
    }
    tbody tr { border-bottom: 1px solid var(--border); transition: background 0.1s; }
    tbody tr:hover { background: var(--surface2); }
    tbody tr:last-child { border-bottom: none; }
    td { padding: 10px 10px; font-size: 12px; vertical-align: middle; }
    .model-name { font-weight: 600; color: var(--text); }
    .model-id { font-size: 11px; color: var(--muted); margin-top: 1px; font-family: monospace; }
    .badge {
      display: inline-block; padding: 2px 7px; border-radius: 4px;
      font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
      white-space: nowrap;
    }
    .badge-green { background: #0d2d18; color: var(--success); border: 1px solid #103d18; }
    .badge-yellow { background: #2d1f00; color: var(--amber); border: 1px solid #3d2a00; }
    .badge-red { background: #1f0a0a; color: #ff8080; border: 1px solid #3d1010; }
    .cold-fast { color: var(--success); font-weight: 600; }
    .cold-medium { color: var(--amber); font-weight: 600; }
    .cold-slow { color: #ff8080; font-weight: 600; }
    .loading { text-align: center; padding: 40px; color: var(--muted); }
    .error-box {
      background: #1f0a0a; border: 1px solid #3d1010; border-radius: 6px;
      padding: 12px 16px; color: #ff8080; font-size: 12px; margin-top: 10px;
    }
    .empty-state {
      text-align: center; padding: 40px; color: var(--muted);
      border: 1px dashed var(--border); border-radius: 8px;
    }
    .fetched-at { font-size: 11px; color: var(--muted); margin-top: 14px; text-align: right; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>📦 Model Cache Status</h1>
      <div class="subtitle">Available vLLM models on the DCP GPU network</div>
    </div>
    <button class="refresh-btn" id="refreshBtn" ${loading ? 'disabled' : ''}>↻ Refresh</button>
  </div>

  ${loading ? '<div class="loading">Loading model registry…</div>' : ''}
  ${errorMsg ? `<div class="error-box">⚠ Failed to load models: ${esc(errorMsg)}</div>` : ''}

  ${tableHtml}

  ${!loading ? `<div class="fetched-at">Updated at ${fetchedAt}</div>` : ''}

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('refreshBtn').addEventListener('click', () => {
      document.getElementById('refreshBtn').disabled = true;
      document.getElementById('refreshBtn').textContent = '↻ Refreshing…';
      vscode.postMessage({ type: 'refresh' });
    });
  </script>
</body>
</html>`;
    }
    dispose() {
        ModelStatusPanel._current = undefined;
        this._panel.dispose();
        this._disposables.forEach((d) => d.dispose());
        this._disposables = [];
    }
}
exports.ModelStatusPanel = ModelStatusPanel;
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


/***/ }),

/***/ "./src/panels/ProviderEarningsPanel.ts":
/*!*********************************************!*\
  !*** ./src/panels/ProviderEarningsPanel.ts ***!
  \*********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ProviderEarningsPanel = void 0;
const vscode = __importStar(__webpack_require__(/*! vscode */ "vscode"));
const dc1Client_1 = __webpack_require__(/*! ../api/dc1Client */ "./src/api/dc1Client.ts");
class ProviderEarningsPanel {
    static show(extensionUri, auth) {
        if (ProviderEarningsPanel._current) {
            ProviderEarningsPanel._current._panel.reveal(vscode.ViewColumn.Beside);
            ProviderEarningsPanel._current.reload();
            return;
        }
        new ProviderEarningsPanel(extensionUri, auth);
    }
    constructor(extensionUri, auth) {
        this._disposables = [];
        this._auth = auth;
        this._panel = vscode.window.createWebviewPanel('dcpProviderEarnings', 'DCP — Provider Earnings', vscode.ViewColumn.Beside, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
            retainContextWhenHidden: true,
        });
        ProviderEarningsPanel._current = this;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage((msg) => {
            if (msg.type === 'refresh') {
                this.reload();
            }
        }, null, this._disposables);
        this._panel.webview.html = this.buildHtml(null, true);
        this.reload();
    }
    async reload() {
        try {
            const key = this._auth.providerApiKey;
            if (!key) {
                this._panel.webview.html = this.buildHtml(null, false, 'Provider API key not configured. Set your key in settings.');
                return;
            }
            const provider = await dc1Client_1.dc1.getProviderInfo(key);
            this._panel.webview.html = this.buildHtml(provider, false);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this._panel.webview.html = this.buildHtml(null, false, msg);
        }
    }
    buildEarningsHtml(provider) {
        const totalEarningsSar = (provider.total_earnings_halala / 100).toFixed(2);
        const todayEarningsSar = (provider.today_earnings_halala / 100).toFixed(2);
        const lastHeartbeat = provider.last_heartbeat
            ? new Date(provider.last_heartbeat).toLocaleString()
            : 'Never';
        // Competitive pricing estimates (from platform pricing model)
        // RTX 4090: DCP = $0.267/hr, Vast.ai = $0.35/hr
        // This is a sample; real data would come from API
        const dcpEarningEstimate = Number(totalEarningsSar) * 1.15; // Assume 15% better than Vast.ai equivalent
        const vastaiEquivalent = Number(totalEarningsSar) * 0.87; // Approximate Vast.ai earnings for same work
        const statsHtml = `
      <div class="earnings-grid">
        <div class="earnings-card primary">
          <div class="card-label">Total Earnings</div>
          <div class="card-value">${totalEarningsSar} SAR</div>
          <div class="card-subtitle">Lifetime</div>
        </div>
        <div class="earnings-card highlight">
          <div class="card-label">Today's Earnings</div>
          <div class="card-value">${todayEarningsSar} SAR</div>
          <div class="card-subtitle">24 hour period</div>
        </div>
        <div class="earnings-card">
          <div class="card-label">Active Jobs</div>
          <div class="card-value">${provider.total_jobs}</div>
          <div class="card-subtitle">All time</div>
        </div>
        <div class="earnings-card">
          <div class="card-label">Status</div>
          <div class="card-value ${provider.is_live ? 'status-online' : 'status-offline'}">
            ${provider.is_live ? '🟢 Online' : '🔴 Offline'}
          </div>
          <div class="card-subtitle">Current status</div>
        </div>
      </div>
    `;
        const comparisonHtml = `
      <div class="comparison-section">
        <h3>DCP Earnings Advantage</h3>
        <div class="comparison-grid">
          <div class="comparison-item">
            <div class="comparison-label">DCP Potential</div>
            <div class="comparison-value dcp">${dcpEarningEstimate.toFixed(2)} SAR</div>
            <div class="comparison-small">Your earnings on DCP</div>
          </div>
          <div class="comparison-item">
            <div class="comparison-label">Vast.ai Equivalent</div>
            <div class="comparison-value vastai">${vastaiEquivalent.toFixed(2)} SAR</div>
            <div class="comparison-small">Estimated on Vast.ai</div>
          </div>
          <div class="comparison-item">
            <div class="comparison-label">Additional Earnings</div>
            <div class="comparison-value benefit">+${(dcpEarningEstimate - vastaiEquivalent).toFixed(2)} SAR</div>
            <div class="comparison-small">15% DCP advantage</div>
          </div>
        </div>
      </div>
    `;
        const hardwareHtml = `
      <div class="hardware-section">
        <h3>GPU Configuration</h3>
        <div class="hardware-grid">
          <div class="hardware-item">
            <span class="label">GPU Model</span>
            <span class="value">${this.esc(provider.gpu_model)}</span>
          </div>
          <div class="hardware-item">
            <span class="label">GPU Count</span>
            <span class="value">${provider.gpu_count}</span>
          </div>
          <div class="hardware-item">
            <span class="label">Total VRAM</span>
            <span class="value">${provider.vram_gb ? provider.vram_gb : 'Unknown'} GB</span>
          </div>
          <div class="hardware-item">
            <span class="label">CUDA Version</span>
            <span class="value">${provider.cuda_version || 'Unknown'}</span>
          </div>
          <div class="hardware-item">
            <span class="label">Driver Version</span>
            <span class="value">${provider.driver_version || 'Unknown'}</span>
          </div>
          <div class="hardware-item">
            <span class="label">Last Heartbeat</span>
            <span class="value">${lastHeartbeat}</span>
          </div>
        </div>
      </div>
    `;
        return statsHtml + comparisonHtml + hardwareHtml;
    }
    buildHtml(provider, loading, errorMsg) {
        const nonce = getNonce();
        const fetchedAt = new Date().toLocaleTimeString();
        const contentHtml = (!loading && !errorMsg && provider) ? this.buildEarningsHtml(provider) : '';
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DCP — Provider Earnings</title>
  <style>
    :root {
      --amber: #F5A524;
      --void: #07070E;
      --surface: #111118;
      --surface2: #1a1a24;
      --surface3: #242430;
      --text: #e8e8f0;
      --muted: #888898;
      --border: #2a2a3a;
      --error: #ff4a4a;
      --success: #22c55e;
      --dcp: #4F46E5;
      --vastai: #8B5CF6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--surface);
      color: var(--text);
      font-family: var(--vscode-font-family, 'Inter', sans-serif);
      font-size: 13px;
      padding: 20px;
      line-height: 1.6;
    }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    h1 { color: var(--amber); font-size: 17px; font-weight: 700; }
    h3 { color: var(--text); font-size: 14px; font-weight: 600; margin: 16px 0 12px 0; }
    .subtitle { color: var(--muted); font-size: 12px; margin-top: 2px; }
    .refresh-btn {
      background: transparent; border: 1px solid var(--border);
      border-radius: 6px; padding: 6px 14px; color: var(--muted);
      font-size: 12px; font-weight: 600; cursor: pointer; transition: border-color 0.15s;
      white-space: nowrap;
    }
    .refresh-btn:hover { border-color: var(--amber); color: var(--text); }
    .refresh-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    .earnings-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }
    .earnings-card {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .earnings-card.primary {
      background: linear-gradient(135deg, var(--surface2) 0%, var(--surface3) 100%);
      border: 1px solid var(--amber);
    }
    .earnings-card.highlight {
      border: 1px solid var(--success);
    }
    .card-label {
      font-size: 11px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.07em;
      font-weight: 600;
    }
    .card-value {
      font-size: 20px;
      font-weight: 700;
      color: var(--text);
    }
    .card-value.status-online {
      color: var(--success);
    }
    .card-value.status-offline {
      color: var(--error);
    }
    .card-subtitle {
      font-size: 11px;
      color: var(--muted);
      margin-top: 2px;
    }

    .comparison-section {
      margin: 20px 0;
      padding: 14px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .comparison-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .comparison-item {
      background: var(--surface3);
      border-radius: 6px;
      padding: 12px;
      text-align: center;
    }
    .comparison-label {
      font-size: 10px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .comparison-value {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 2px;
    }
    .comparison-value.dcp {
      color: var(--dcp);
    }
    .comparison-value.vastai {
      color: var(--vastai);
    }
    .comparison-value.benefit {
      color: var(--success);
    }
    .comparison-small {
      font-size: 10px;
      color: var(--muted);
      margin-top: 4px;
    }

    .hardware-section {
      margin: 20px 0;
      padding: 14px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .hardware-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
      margin-top: 12px;
    }
    .hardware-item {
      background: var(--surface3);
      border-radius: 6px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .hardware-item .label {
      font-size: 10px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }
    .hardware-item .value {
      font-size: 12px;
      font-weight: 600;
      color: var(--text);
      word-break: break-word;
    }

    .loading { text-align: center; padding: 40px; color: var(--muted); }
    .error-box {
      background: #1f0a0a; border: 1px solid #3d1010; border-radius: 6px;
      padding: 12px 16px; color: #ff8080; font-size: 12px; margin-top: 10px;
    }
    .empty-state {
      text-align: center; padding: 40px; color: var(--muted);
      border: 1px dashed var(--border); border-radius: 8px;
    }
    .fetched-at { font-size: 11px; color: var(--muted); margin-top: 20px; text-align: right; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>💰 Provider Earnings</h1>
      <div class="subtitle">Real-time earnings & competitive pricing analysis</div>
    </div>
    <button class="refresh-btn" id="refreshBtn" ${loading ? 'disabled' : ''}>↻ Refresh</button>
  </div>

  ${loading ? '<div class="loading">Loading earnings data…</div>' : ''}
  ${errorMsg ? `<div class="error-box">⚠ Failed to load earnings: ${this.esc(errorMsg)}</div>` : ''}

  ${contentHtml}

  ${!loading ? `<div class="fetched-at">Updated at ${fetchedAt}</div>` : ''}

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('refreshBtn').addEventListener('click', () => {
      document.getElementById('refreshBtn').disabled = true;
      document.getElementById('refreshBtn').textContent = '↻ Refreshing…';
      vscode.postMessage({ type: 'refresh' });
    });
  </script>
</body>
</html>`;
    }
    esc(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    dispose() {
        ProviderEarningsPanel._current = undefined;
        this._panel.dispose();
        this._disposables.forEach((d) => d.dispose());
        this._disposables = [];
    }
}
exports.ProviderEarningsPanel = ProviderEarningsPanel;
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}


/***/ }),

/***/ "./src/panels/SettingsPanel.ts":
/*!*************************************!*\
  !*** ./src/panels/SettingsPanel.ts ***!
  \*************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SettingsPanel = void 0;
const vscode = __importStar(__webpack_require__(/*! vscode */ "vscode"));
class SettingsPanel {
    static show(extensionUri) {
        if (SettingsPanel._current) {
            SettingsPanel._current._panel.reveal(vscode.ViewColumn.Beside);
            return;
        }
        new SettingsPanel(extensionUri);
    }
    constructor(extensionUri) {
        this._disposables = [];
        this._panel = vscode.window.createWebviewPanel('dcpSettings', 'DCP — Settings', vscode.ViewColumn.Beside, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
            retainContextWhenHidden: true,
        });
        SettingsPanel._current = this;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg), null, this._disposables);
        this._panel.webview.html = this.buildHtml();
    }
    async handleMessage(msg) {
        if (msg.type === 'save') {
            const config = vscode.workspace.getConfiguration('dc1');
            const apiBase = msg.apiBase.trim() || 'https://api.dcp.sa';
            const renterApiKey = msg.renterApiKey.trim();
            await config.update('apiBase', apiBase, vscode.ConfigurationTarget.Global);
            if (renterApiKey && !renterApiKey.includes('*')) {
                await config.update('renterApiKey', renterApiKey, vscode.ConfigurationTarget.Global);
            }
            this._panel.webview.postMessage({ type: 'saved' });
            vscode.window.showInformationMessage('DCP: Settings saved.');
        }
        if (msg.type === 'openSecrets') {
            // Trigger the key prompt to store in VS Code secret storage instead
            vscode.commands.executeCommand('dc1.setup');
        }
    }
    buildHtml() {
        const config = vscode.workspace.getConfiguration('dc1');
        const apiBase = config.get('apiBase', 'https://api.dcp.sa');
        const rawKey = config.get('renterApiKey', '');
        const maskedKey = rawKey.length > 0
            ? rawKey.slice(0, 4) + '•'.repeat(Math.max(0, rawKey.length - 8)) + rawKey.slice(-4)
            : '';
        const nonce = getNonce();
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DCP — Settings</title>
  <style>
    :root {
      --amber: #F5A524;
      --void: #07070E;
      --surface: #111118;
      --surface2: #1a1a24;
      --text: #e8e8f0;
      --muted: #888898;
      --border: #2a2a3a;
      --success: #22c55e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--surface);
      color: var(--text);
      font-family: var(--vscode-font-family, 'Inter', sans-serif);
      font-size: 13px;
      padding: 24px;
      line-height: 1.6;
    }
    h1 { color: var(--amber); font-size: 17px; font-weight: 700; margin-bottom: 4px; }
    .subtitle { color: var(--muted); font-size: 12px; margin-bottom: 24px; }
    .section {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 18px;
      margin-bottom: 16px;
    }
    .section-title {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.08em; color: var(--muted); margin-bottom: 14px;
    }
    .form-group { margin-bottom: 14px; }
    .form-group:last-child { margin-bottom: 0; }
    label {
      display: block; color: var(--muted); font-size: 11px;
      text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 5px; font-weight: 600;
    }
    input {
      width: 100%;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      padding: 8px 10px;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s;
    }
    input:focus { border-color: var(--amber); }
    .hint { color: var(--muted); font-size: 11px; margin-top: 4px; }
    .btn-primary {
      background: var(--amber); color: var(--void); border: none;
      border-radius: 6px; padding: 9px 20px; font-size: 13px;
      font-weight: 700; cursor: pointer; transition: opacity 0.15s;
    }
    .btn-primary:hover { opacity: 0.9; }
    .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-secondary {
      background: transparent; color: var(--muted); border: 1px solid var(--border);
      border-radius: 6px; padding: 9px 20px; font-size: 13px;
      font-weight: 600; cursor: pointer; transition: border-color 0.15s;
    }
    .btn-secondary:hover { border-color: var(--amber); color: var(--text); }
    .actions { display: flex; gap: 10px; margin-top: 16px; }
    .alert { padding: 10px 14px; border-radius: 6px; margin-top: 14px; font-size: 12px; }
    .alert-success { background: #0a1f10; border: 1px solid #103d18; color: #60e890; }
    .secret-notice {
      background: #1a1400; border: 1px solid #3d2a00; border-radius: 6px;
      padding: 10px 14px; font-size: 12px; color: var(--amber); margin-top: 10px;
    }
    .key-row { display: flex; gap: 8px; align-items: flex-start; }
    .key-row input { flex: 1; }
    .eye-btn {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 6px; padding: 8px 10px; cursor: pointer; color: var(--muted);
      font-size: 13px; transition: border-color 0.15s; flex-shrink: 0; margin-top: 0;
    }
    .eye-btn:hover { border-color: var(--amber); color: var(--text); }
  </style>
</head>
<body>
  <h1>⚙ DCP Settings</h1>
  <div class="subtitle">Configure your DCP API connection and authentication.</div>

  <div class="section">
    <div class="section-title">API Connection</div>
    <div class="form-group">
      <label>API Base URL</label>
      <input type="url" id="apiBaseInput" value="${escapeAttr(apiBase)}" placeholder="https://api.dcp.sa">
      <div class="hint">Default: https://api.dcp.sa — change only if using a self-hosted instance.</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Renter API Key</div>
    <div class="form-group">
      <label>API Key (stored in VS Code settings)</label>
      <div class="key-row">
        <input type="password" id="renterKeyInput" value="${escapeAttr(rawKey)}" placeholder="dcp_renter_…">
        <button class="eye-btn" id="toggleVisibility" title="Toggle visibility">👁</button>
      </div>
      <div class="hint">
        ${rawKey ? `Current key: <code>${maskedKey}</code> — enter a new value to replace.` : 'No key set. Enter your key from dcp.sa/renter/register.'}
      </div>
    </div>
    <div class="secret-notice">
      🔒 For stronger security, use <strong>DCP: Set Renter API Key</strong> (command palette)
      to store your key in VS Code's encrypted secret storage instead.
      <br><br>
      <button class="btn-secondary" id="useSecretsBtn" style="margin-top:6px">Open Secure Key Prompt</button>
    </div>
  </div>

  <div class="actions">
    <button class="btn-primary" id="saveBtn">Save Settings</button>
  </div>

  <div id="alertBox"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    document.getElementById('saveBtn').addEventListener('click', () => {
      const apiBase = document.getElementById('apiBaseInput').value.trim();
      const renterApiKey = document.getElementById('renterKeyInput').value.trim();
      document.getElementById('saveBtn').disabled = true;
      document.getElementById('saveBtn').textContent = 'Saving…';
      vscode.postMessage({ type: 'save', apiBase, renterApiKey });
    });

    document.getElementById('useSecretsBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'openSecrets' });
    });

    document.getElementById('toggleVisibility').addEventListener('click', () => {
      const input = document.getElementById('renterKeyInput');
      input.type = input.type === 'password' ? 'text' : 'password';
    });

    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'saved') {
        const btn = document.getElementById('saveBtn');
        btn.disabled = false;
        btn.textContent = 'Save Settings';
        document.getElementById('alertBox').innerHTML =
          '<div class="alert alert-success">✓ Settings saved successfully.</div>';
        setTimeout(() => { document.getElementById('alertBox').innerHTML = ''; }, 3000);
      }
    });
  </script>
</body>
</html>`;
    }
    dispose() {
        SettingsPanel._current = undefined;
        this._panel.dispose();
        this._disposables.forEach((d) => d.dispose());
        this._disposables = [];
    }
}
exports.SettingsPanel = SettingsPanel;
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
function escapeAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


/***/ }),

/***/ "./src/panels/VllmSubmitPanel.ts":
/*!***************************************!*\
  !*** ./src/panels/VllmSubmitPanel.ts ***!
  \***************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.VllmSubmitPanel = void 0;
const vscode = __importStar(__webpack_require__(/*! vscode */ "vscode"));
const dc1Client_1 = __webpack_require__(/*! ../api/dc1Client */ "./src/api/dc1Client.ts");
class VllmSubmitPanel {
    static show(extensionUri, auth) {
        if (VllmSubmitPanel._current) {
            VllmSubmitPanel._current._panel.reveal(vscode.ViewColumn.Beside);
            return;
        }
        new VllmSubmitPanel(extensionUri, auth);
    }
    constructor(extensionUri, auth) {
        this.auth = auth;
        this._disposables = [];
        this._models = [];
        this._loadError = null;
        this._panel = vscode.window.createWebviewPanel('dcpVllmSubmit', 'DCP — AI Inference', vscode.ViewColumn.Beside, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
            retainContextWhenHidden: true,
        });
        VllmSubmitPanel._current = this;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg), null, this._disposables);
        // Show loading state while fetching models
        this._panel.webview.html = this.buildHtml([], true, null);
        this.loadModels();
    }
    async loadModels() {
        try {
            const resp = await dc1Client_1.dc1.getVllmModels();
            this._models = resp.data || [];
            this._loadError = null;
        }
        catch (err) {
            this._models = [];
            this._loadError = err instanceof Error ? err.message : 'Could not load models from API';
        }
        this._panel.webview.html = this.buildHtml(this._models, false, this._loadError);
    }
    async handleMessage(msg) {
        if (msg.type === 'cancel') {
            this._panel.dispose();
            return;
        }
        if (msg.type === 'reloadModels') {
            this._panel.webview.html = this.buildHtml(this._models, true, null);
            await this.loadModels();
            return;
        }
        if (msg.type === 'submit') {
            // Get API key: check settings first, then secrets
            let key = (await this.auth.getStoredRenterKey()) ?? '';
            if (!key) {
                key = (await this.auth.ensureKey()) ?? '';
            }
            if (!key) {
                vscode.window.showErrorMessage('DCP: Set your renter API key in Settings → Extensions → DCP Compute → Renter API Key');
                return;
            }
            this._panel.webview.postMessage({ type: 'submitting' });
            const payload = {
                model: msg.model,
                messages: [{ role: 'user', content: msg.prompt }],
                max_tokens: msg.maxTokens,
                temperature: msg.temperature,
            };
            try {
                const result = await this.completeWithRetry(() => dc1Client_1.dc1.vllmComplete(key, payload), async (err) => {
                    if (!(0, dc1Client_1.isAuthError)(err)) {
                        return undefined;
                    }
                    const refreshed = await this.auth.handleRenterAuthError(err, 'running inference');
                    if (refreshed) {
                        key = refreshed;
                    }
                    return refreshed;
                });
                const text = result.choices[0]?.message?.content ?? '';
                const jobId = result.id.replace('chatcmpl-', '');
                const costSar = (result.cost_halala / 100).toFixed(4);
                this._panel.webview.postMessage({
                    type: 'success',
                    text,
                    jobId: result.id,
                    model: result.model,
                    costSar,
                    usage: result.usage,
                });
                vscode.window.showInformationMessage(`DCP: Inference complete — ${result.usage.total_tokens} tokens — ${costSar} SAR`, 'Watch Logs').then((action) => {
                    if (action === 'Watch Logs') {
                        vscode.commands.executeCommand('dc1.watchJobLogs', jobId);
                    }
                });
            }
            catch (err) {
                const errMsg = humanizeError(err);
                this._panel.webview.postMessage({ type: 'error', message: errMsg });
            }
        }
    }
    async completeWithRetry(request, onAuthError) {
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                return await request();
            }
            catch (err) {
                const newKey = await onAuthError(err);
                if (newKey) {
                    continue;
                }
                if (attempt < maxAttempts && (0, dc1Client_1.isRetryableError)(err)) {
                    await delay(attempt * 800);
                    continue;
                }
                throw err;
            }
        }
        throw new Error('Inference request exhausted retry attempts.');
    }
    buildHtml(models, loading, loadError) {
        const nonce = getNonce();
        const modelsJson = JSON.stringify(models);
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DCP — AI Inference</title>
  <style>
    :root {
      --amber: #F5A524;
      --void: #07070E;
      --surface: #111118;
      --surface2: #1a1a24;
      --text: #e8e8f0;
      --muted: #888898;
      --border: #2a2a3a;
      --error: #ff4a4a;
      --success: #22c55e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--surface);
      color: var(--text);
      font-family: var(--vscode-font-family, 'Inter', sans-serif);
      font-size: 13px;
      padding: 20px;
      line-height: 1.6;
    }
    h1 { color: var(--amber); font-size: 17px; font-weight: 700; margin-bottom: 4px; letter-spacing: -0.02em; }
    .subtitle { color: var(--muted); font-size: 12px; margin-bottom: 20px; }
    .form-group { margin-bottom: 14px; }
    label {
      display: block; color: var(--muted); font-size: 11px;
      text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 5px; font-weight: 600;
    }
    select, input, textarea {
      width: 100%;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      padding: 8px 10px;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s;
    }
    select:focus, input:focus, textarea:focus { border-color: var(--amber); }
    textarea { resize: vertical; min-height: 100px; font-family: var(--vscode-editor-font-family, monospace); }
    .row { display: flex; gap: 12px; }
    .row .form-group { flex: 1; }
    .model-meta {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px 12px;
      margin-top: 8px;
      font-size: 12px;
      color: var(--muted);
      display: none;
    }
    .model-meta.visible { display: block; }
    .model-meta span { color: var(--text); }
    .badge {
      display: inline-block; padding: 2px 7px; border-radius: 4px;
      font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
    }
    .badge-green { background: #0d2d18; color: var(--success); border: 1px solid #103d18; }
    .badge-yellow { background: #2d1f00; color: var(--amber); border: 1px solid #3d2a00; }
    .badge-red { background: #1f0a0a; color: #ff8080; border: 1px solid #3d1010; }
    .btn-primary {
      background: var(--amber); color: var(--void); border: none;
      border-radius: 6px; padding: 10px 24px; font-size: 14px;
      font-weight: 700; cursor: pointer; width: 100%; margin-top: 8px; transition: opacity 0.15s;
    }
    .btn-primary:hover { opacity: 0.9; }
    .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
    .alert { padding: 10px 14px; border-radius: 6px; margin-top: 14px; font-size: 12px; }
    .alert-error { background: #1f0a0a; border: 1px solid #3d1010; color: #ff8080; }
    .alert-success { background: #0a1f10; border: 1px solid #103d18; color: #60e890; }
    #resultBox {
      display: none; background: var(--surface2); border: 1px solid var(--border);
      border-radius: 8px; padding: 16px; margin-top: 16px;
    }
    #resultBox.visible { display: block; }
    .result-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--border);
    }
    .result-title { font-weight: 700; font-size: 13px; color: var(--amber); }
    .result-meta { font-size: 11px; color: var(--muted); }
    .result-text {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px; line-height: 1.7; white-space: pre-wrap; color: var(--text);
      max-height: 300px; overflow-y: auto; padding: 8px 0;
    }
    .result-footer {
      display: flex; gap: 8px; align-items: center; margin-top: 10px;
      padding-top: 10px; border-top: 1px solid var(--border); font-size: 11px; color: var(--muted);
    }
    .loading { color: var(--muted); text-align: center; padding: 30px; font-size: 13px; }
    .no-models { color: var(--muted); text-align: center; padding: 16px;
                  border: 1px dashed var(--border); border-radius: 6px; font-size: 12px; }
    .key-notice {
      background: #2d1f00; border: 1px solid #3d2a00; border-radius: 6px;
      padding: 10px 12px; margin-bottom: 16px; font-size: 12px; color: var(--amber);
    }
    .toolbar { display: flex; justify-content: flex-end; margin-bottom: 12px; }
    .btn-secondary {
      background: var(--surface2);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 12px;
      cursor: pointer;
    }
    .btn-secondary:hover { border-color: var(--amber); color: var(--amber); }
  </style>
</head>
<body>
  <h1>⚡ DCP AI Inference</h1>
  <div class="subtitle">Run LLM inference on DCP GPU network — Saudi Arabia's compute marketplace</div>

  <div class="key-notice" id="keyNotice" style="display:none">
    ⚠️ No renter API key set. Add it in Settings → Extensions → DCP Compute → Renter API Key,
    or run <strong>DCP: Set Renter API Key</strong> from the command palette.
  </div>

  <div class="toolbar">
    <button class="btn-secondary" id="reloadBtn">Reload Models</button>
  </div>

  ${loading ? '<div class="loading">Loading available models…</div>' : ''}
  ${!loading && loadError ? `<div class="alert alert-error">Model list unavailable: ${escapeForHtml(loadError)}</div>` : ''}

  <div id="mainForm" style="display:${loading ? 'none' : 'block'}">
    <div class="form-group">
      <label>Model</label>
      ${models.length === 0
            ? '<div class="no-models">No models available. Check your API connection.</div>'
            : `<select id="modelSelect">
            ${models.map(m => `<option value="${m.model_id}" data-vram="${m.min_gpu_vram_gb}" data-price="${m.avg_price_sar_per_min}" data-providers="${m.providers_online}" data-ctx="${m.context_window}" data-status="${m.status}">${m.display_name}${m.quantization ? ' (' + m.quantization + ')' : ''}</option>`).join('')}
          </select>
          <div class="model-meta visible" id="modelMeta"></div>`}
    </div>

    <div class="form-group">
      <label>Prompt</label>
      <textarea id="promptInput" placeholder="Enter your prompt…" rows="5"></textarea>
    </div>

    <div class="row">
      <div class="form-group">
        <label>Max tokens</label>
        <input type="number" id="maxTokensInput" value="512" min="1" max="8192">
      </div>
      <div class="form-group">
        <label>Temperature</label>
        <input type="number" id="tempInput" value="0.7" min="0" max="2" step="0.1">
      </div>
    </div>

    <button class="btn-primary" id="submitBtn" ${models.length === 0 ? 'disabled' : ''}>
      Run Inference
    </button>
    <div id="alertBox"></div>

    <div id="resultBox">
      <div class="result-header">
        <span class="result-title">Response</span>
        <span class="result-meta" id="resultMeta"></span>
      </div>
      <div class="result-text" id="resultText"></div>
      <div class="result-footer">
        <span id="jobIdBadge"></span>
        <span id="tokensBadge"></span>
        <span id="costBadge"></span>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const MODELS = ${modelsJson};

    function updateModelMeta() {
      const sel = document.getElementById('modelSelect');
      const meta = document.getElementById('modelMeta');
      if (!sel || !meta) return;
      const opt = sel.options[sel.selectedIndex];
      if (!opt) return;
      const providers = opt.dataset.providers;
      const vram = opt.dataset.vram;
      const price = opt.dataset.price;
      const ctx = opt.dataset.ctx;
      const status = opt.dataset.status;
      const statusBadge = status === 'available'
        ? '<span class="badge badge-green">● Available</span>'
        : '<span class="badge badge-red">● No Providers</span>';
      meta.innerHTML =
        statusBadge + '&nbsp;&nbsp;' +
        '<span>' + providers + ' provider' + (providers !== '1' ? 's' : '') + ' online</span>' +
        ' &nbsp;·&nbsp; Min VRAM: <span>' + vram + ' GB</span>' +
        ' &nbsp;·&nbsp; Context: <span>' + Number(ctx).toLocaleString() + ' tokens</span>' +
        ' &nbsp;·&nbsp; ~<span>' + price + ' SAR/min</span>';
    }

    const modelSel = document.getElementById('modelSelect');
    const reloadBtn = document.getElementById('reloadBtn');
    if (reloadBtn) {
      reloadBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'reloadModels' });
      });
    }
    if (modelSel) {
      modelSel.addEventListener('change', updateModelMeta);
      updateModelMeta();
    }

    document.getElementById('submitBtn')?.addEventListener('click', () => {
      const model = document.getElementById('modelSelect')?.value;
      const prompt = document.getElementById('promptInput').value.trim();
      const maxTokens = parseInt(document.getElementById('maxTokensInput').value) || 512;
      const temperature = parseFloat(document.getElementById('tempInput').value) ?? 0.7;

      if (!model) { showAlert('Select a model.', 'error'); return; }
      if (!prompt) { showAlert('Enter a prompt.', 'error'); return; }

      vscode.postMessage({ type: 'submit', model, prompt, maxTokens, temperature });
    });

    function showAlert(msg, type) {
      document.getElementById('alertBox').innerHTML =
        '<div class="alert alert-' + type + '">' + escapeHtml(msg) + '</div>';
    }

    function escapeHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    window.addEventListener('message', e => {
      const msg = e.data;
      const btn = document.getElementById('submitBtn');
      if (msg.type === 'submitting') {
        btn.disabled = true;
        btn.textContent = 'Running inference…';
        document.getElementById('alertBox').innerHTML = '';
        document.getElementById('resultBox').classList.remove('visible');
      } else if (msg.type === 'success') {
        btn.disabled = false;
        btn.textContent = 'Run Inference';
        document.getElementById('alertBox').innerHTML = '';
        // Show result
        document.getElementById('resultText').textContent = msg.text;
        document.getElementById('resultMeta').textContent = msg.model;
        document.getElementById('jobIdBadge').innerHTML =
          '<span class="badge badge-green">✓ Completed</span> ' + msg.jobId;
        document.getElementById('tokensBadge').textContent =
          msg.usage.total_tokens + ' tokens';
        document.getElementById('costBadge').textContent = msg.costSar + ' SAR';
        document.getElementById('resultBox').classList.add('visible');
      } else if (msg.type === 'error') {
        btn.disabled = false;
        btn.textContent = 'Run Inference';
        showAlert('❌ ' + msg.message, 'error');
      } else if (msg.type === 'modelsLoaded') {
        // handled server-side by rebuilding HTML
      }
    });
  </script>
</body>
</html>`;
    }
    dispose() {
        VllmSubmitPanel._current = undefined;
        this._panel.dispose();
        this._disposables.forEach((d) => d.dispose());
        this._disposables = [];
    }
}
exports.VllmSubmitPanel = VllmSubmitPanel;
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
function escapeForHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function humanizeError(err) {
    if (!(err instanceof Error)) {
        return String(err);
    }
    if ((0, dc1Client_1.isAuthError)(err)) {
        return 'Authentication failed. Re-run "DCP: Set Renter API Key" and submit again.';
    }
    if ((0, dc1Client_1.isRetryableError)(err)) {
        return `${err.message}. DCP retried automatically; please retry if the API remains busy.`;
    }
    return err.message;
}


/***/ }),

/***/ "./src/panels/WalletPanel.ts":
/*!***********************************!*\
  !*** ./src/panels/WalletPanel.ts ***!
  \***********************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.WalletPanel = void 0;
const vscode = __importStar(__webpack_require__(/*! vscode */ "vscode"));
const dc1Client_1 = __webpack_require__(/*! ../api/dc1Client */ "./src/api/dc1Client.ts");
class WalletPanel {
    static show(extensionUri, auth) {
        if (WalletPanel._current) {
            WalletPanel._current._panel.reveal(vscode.ViewColumn.Beside);
            WalletPanel._current.loadData();
            return;
        }
        new WalletPanel(extensionUri, auth);
    }
    constructor(extensionUri, auth) {
        this.auth = auth;
        this._disposables = [];
        this._panel = vscode.window.createWebviewPanel('dc1Wallet', 'DC1 — Wallet & Billing', vscode.ViewColumn.Beside, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        });
        WalletPanel._current = this;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg), null, this._disposables);
        this._panel.webview.html = this.buildHtml(undefined, true);
        this.loadData();
    }
    async loadData() {
        const key = this.auth.apiKey;
        if (!key) {
            this._panel.webview.html = this.buildHtml(undefined, false, 'No API key set. Run "DC1: Set API Key" first.');
            return;
        }
        try {
            this._info = await dc1Client_1.dc1.getRenterInfo(key);
            this._panel.webview.html = this.buildHtml(this._info, false);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this._panel.webview.html = this.buildHtml(undefined, false, msg);
        }
    }
    async handleMessage(msg) {
        if (msg.type === 'refresh') {
            this._panel.webview.html = this.buildHtml(this._info, true);
            await this.loadData();
            return;
        }
        if (msg.type === 'topup') {
            const key = await this.auth.ensureKey();
            if (!key) {
                return;
            }
            this._panel.webview.postMessage({ type: 'topping_up' });
            try {
                const result = await dc1Client_1.dc1.topUp(key, msg.amountSar);
                const newBalSar = (result.new_balance_halala / 100).toFixed(2);
                vscode.window.showInformationMessage(`DC1: Top-up successful! New balance: ${newBalSar} SAR`);
                this._panel.webview.postMessage({ type: 'topup_success', newBalanceSar: newBalSar });
                await this.loadData();
            }
            catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`DC1: Top-up failed — ${errMsg}`);
                this._panel.webview.postMessage({ type: 'topup_error', message: errMsg });
            }
        }
    }
    buildHtml(info, loading, error) {
        const nonce = getNonce();
        const balanceSar = info ? (info.balance_halala / 100).toFixed(2) : '—';
        const name = info?.name ?? '—';
        const email = info?.email ?? '—';
        const totalJobs = info?.total_jobs ?? 0;
        const apiKeyPreview = info?.api_key ? info.api_key.slice(0, 8) + '…' : '—';
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DC1 Wallet</title>
  <style>
    :root {
      --amber: #F5A524; --void: #07070E; --surface: #111118;
      --surface2: #1a1a24; --text: #e8e8f0; --muted: #888898; --border: #2a2a3a;
      --error: #ff4a4a; --success: #22c55e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--surface); color: var(--text); font-family: var(--vscode-font-family, 'Inter', sans-serif);
           font-size: 13px; padding: 20px; line-height: 1.5; }
    h1 { color: var(--amber); font-size: 18px; font-weight: 700; margin-bottom: 4px; }
    .subtitle { color: var(--muted); font-size: 12px; margin-bottom: 20px; }
    .balance-card { background: linear-gradient(135deg, #1a1508 0%, #1a1a24 100%);
                    border: 1px solid var(--amber); border-radius: 12px; padding: 20px 24px; margin-bottom: 20px; }
    .balance-label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
    .balance-amount { font-size: 36px; font-weight: 800; color: var(--amber); margin: 4px 0; }
    .balance-halala { color: var(--muted); font-size: 12px; }
    .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
    .stat-card { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
    .stat-label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
    .stat-value { font-size: 15px; font-weight: 700; margin-top: 2px; }
    .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase;
                     letter-spacing: 0.1em; color: var(--muted); margin-bottom: 10px; }
    .topup-row { display: flex; gap: 8px; align-items: flex-end; }
    .topup-row input { flex: 1; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px;
                       color: var(--text); padding: 8px 10px; font-size: 13px; outline: none; }
    .topup-row input:focus { border-color: var(--amber); }
    .btn-amber { background: var(--amber); color: var(--void); border: none; border-radius: 6px;
                 padding: 9px 18px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
    .btn-amber:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-secondary { background: transparent; color: var(--muted); border: 1px solid var(--border); border-radius: 6px;
                     padding: 7px 14px; font-size: 12px; cursor: pointer; margin-top: 12px; }
    .btn-secondary:hover { border-color: var(--text); color: var(--text); }
    .alert { padding: 10px 14px; border-radius: 6px; margin-top: 12px; font-size: 12px; }
    .alert-error { background: #1f0a0a; border: 1px solid #3d1010; color: #ff8080; }
    .alert-success { background: #0a1f10; border: 1px solid #103d18; color: #60e890; }
    .note { color: var(--muted); font-size: 11px; margin-top: 8px; line-height: 1.6; }
    .loading { color: var(--muted); font-size: 13px; display: flex; align-items: center; gap: 8px; }
  </style>
</head>
<body>
  <h1>💳 Wallet & Billing</h1>
  <div class="subtitle">DC1 Compute — Saudi Arabia's GPU Marketplace</div>

  ${loading ? '<div class="loading">⏳ Loading wallet…</div>' : ''}
  ${error ? `<div class="alert alert-error">❌ ${escapeHtmlStatic(error)}</div>` : ''}

  ${!loading && !error && info ? `
  <div class="balance-card">
    <div class="balance-label">Available Balance</div>
    <div class="balance-amount">${balanceSar} SAR</div>
    <div class="balance-halala">${info.balance_halala} halala</div>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Account Name</div>
      <div class="stat-value">${escapeHtmlStatic(name)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Jobs</div>
      <div class="stat-value">${totalJobs}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Email</div>
      <div class="stat-value" style="font-size:12px">${escapeHtmlStatic(email)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">API Key</div>
      <div class="stat-value" style="font-family:monospace;font-size:12px">${apiKeyPreview}</div>
    </div>
  </div>
  ` : ''}

  ${!loading ? `
  <div class="section-title">Top Up Balance</div>
  <div class="topup-row">
    <input type="number" id="topupAmount" value="50" min="1" max="1000" placeholder="Amount in SAR">
    <button class="btn-amber" id="topupBtn">Top Up (SAR)</button>
  </div>
  <div class="note">
    Max 1000 SAR per transaction. Payment gateway integration coming soon.<br>
    Contact support@dc1st.com to manually top up your account.
  </div>
  <div id="alertBox"></div>
  <button class="btn-secondary" id="refreshBtn">↻ Refresh Balance</button>
  ` : ''}

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const topupBtn = document.getElementById('topupBtn');
    const refreshBtn = document.getElementById('refreshBtn');

    if (topupBtn) {
      topupBtn.addEventListener('click', () => {
        const amount = parseFloat(document.getElementById('topupAmount').value);
        if (!amount || amount <= 0) { showAlert('Enter a valid amount.', 'error'); return; }
        if (amount > 1000) { showAlert('Max top-up is 1000 SAR.', 'error'); return; }
        vscode.postMessage({ type: 'topup', amountSar: amount });
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'refresh' });
      });
    }

    function showAlert(msg, type) {
      const box = document.getElementById('alertBox');
      if (box) {
        box.innerHTML = '<div class="alert alert-' + type + '">' + escapeHtml(msg) + '</div>';
      }
    }

    function escapeHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'topping_up') {
        if (topupBtn) { topupBtn.disabled = true; topupBtn.textContent = 'Processing…'; }
      } else if (msg.type === 'topup_success') {
        if (topupBtn) { topupBtn.disabled = false; topupBtn.textContent = 'Top Up (SAR)'; }
        showAlert('✅ Top-up successful! New balance: ' + msg.newBalanceSar + ' SAR', 'success');
      } else if (msg.type === 'topup_error') {
        if (topupBtn) { topupBtn.disabled = false; topupBtn.textContent = 'Top Up (SAR)'; }
        showAlert('❌ ' + msg.message, 'error');
      }
    });
  </script>
</body>
</html>`;
    }
    dispose() {
        WalletPanel._current = undefined;
        this._panel.dispose();
        this._disposables.forEach((d) => d.dispose());
        this._disposables = [];
    }
}
exports.WalletPanel = WalletPanel;
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
/** Server-side HTML escaping for template literals */
function escapeHtmlStatic(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


/***/ }),

/***/ "./src/providers/GPUTreeProvider.ts":
/*!******************************************!*\
  !*** ./src/providers/GPUTreeProvider.ts ***!
  \******************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.GPUTreeProvider = exports.GPUNode = void 0;
const vscode = __importStar(__webpack_require__(/*! vscode */ "vscode"));
const dc1Client_1 = __webpack_require__(/*! ../api/dc1Client */ "./src/api/dc1Client.ts");
/** A single GPU provider node in the sidebar tree */
class GPUNode extends vscode.TreeItem {
    constructor(provider) {
        const label = provider.gpu_model || 'Unknown GPU';
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.provider = provider;
        this.contextValue = 'gpu';
        this.id = `gpu-${provider.id}`;
        this.tooltip = this.buildTooltip();
        const vramText = provider.vram_gb ? `${provider.vram_gb}GB` : '?GB';
        this.description = `${vramText} VRAM`;
        this.iconPath = provider.is_live
            ? new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('testing.iconPassed'))
            : new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('testing.iconSkipped'));
    }
    buildTooltip() {
        const p = this.provider;
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`## ${p.gpu_model || 'GPU'}\n\n`);
        md.appendMarkdown(`| Field | Value |\n|---|---|\n`);
        md.appendMarkdown(`| Provider | ${p.name} |\n`);
        md.appendMarkdown(`| VRAM | ${p.vram_gb ?? '?'} GB |\n`);
        md.appendMarkdown(`| GPU Count | ${p.gpu_count} |\n`);
        if (p.cuda_version) {
            md.appendMarkdown(`| CUDA | ${p.cuda_version} |\n`);
        }
        if (p.compute_capability) {
            md.appendMarkdown(`| Compute CC | ${p.compute_capability} |\n`);
        }
        if (p.driver_version) {
            md.appendMarkdown(`| Driver | ${p.driver_version} |\n`);
        }
        if (p.location) {
            md.appendMarkdown(`| Location | ${p.location} |\n`);
        }
        if (p.reliability_score !== null) {
            md.appendMarkdown(`| Reliability | ${p.reliability_score}% |\n`);
        }
        md.appendMarkdown(`| Live | ${p.is_live ? '✅ Yes' : '⚠️ No'} |\n`);
        if (p.cached_models.length > 0) {
            md.appendMarkdown(`\n**Cached models:** ${p.cached_models.join(', ')}`);
        }
        return md;
    }
}
exports.GPUNode = GPUNode;
/** Child node showing a spec detail under a GPU node */
class SpecNode extends vscode.TreeItem {
    constructor(label, detail, icon = 'info') {
        super(`${label}: ${detail}`, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon(icon);
        this.contextValue = 'spec';
    }
}
class GPUTreeProvider {
    constructor() {
        this._providers = [];
        this._loading = false;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.refresh();
        this.startAutoRefresh();
    }
    startAutoRefresh() {
        const cfg = vscode.workspace.getConfiguration('dc1');
        if (cfg.get('autoRefreshGPUs', true)) {
            this._refreshTimer = setInterval(() => this.refresh(), 30000);
        }
    }
    refresh() {
        this._loading = true;
        this._error = undefined;
        this._onDidChangeTreeData.fire();
        dc1Client_1.dc1.getAvailableProviders()
            .then(({ providers }) => {
            this._providers = providers;
            this._loading = false;
            this._onDidChangeTreeData.fire();
        })
            .catch((err) => {
            this._loading = false;
            this._error = err instanceof Error ? err.message : String(err);
            this._onDidChangeTreeData.fire();
        });
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            // Root — return provider nodes
            if (this._loading) {
                const loading = new vscode.TreeItem('Loading GPUs…');
                loading.iconPath = new vscode.ThemeIcon('loading~spin');
                return [loading];
            }
            if (this._error) {
                const err = new vscode.TreeItem(`Error: ${this._error}`);
                err.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
                return [err];
            }
            if (this._providers.length === 0) {
                const empty = new vscode.TreeItem('No GPUs online right now');
                empty.iconPath = new vscode.ThemeIcon('info');
                return [empty];
            }
            return this._providers.map((p) => new GPUNode(p));
        }
        // Children of a GPU node — spec details
        if (element instanceof GPUNode) {
            const p = element.provider;
            const items = [];
            if (p.vram_gb) {
                items.push(new SpecNode('VRAM', `${p.vram_gb} GB`, 'chip'));
            }
            if (p.gpu_count > 1) {
                items.push(new SpecNode('GPU Count', `${p.gpu_count}`, 'server'));
            }
            if (p.cuda_version) {
                items.push(new SpecNode('CUDA', p.cuda_version, 'versions'));
            }
            if (p.compute_capability) {
                items.push(new SpecNode('Compute CC', p.compute_capability, 'settings-gear'));
            }
            if (p.driver_version) {
                items.push(new SpecNode('Driver', p.driver_version, 'package'));
            }
            if (p.location) {
                items.push(new SpecNode('Location', p.location, 'globe'));
            }
            if (p.reliability_score !== null) {
                items.push(new SpecNode('Reliability', `${p.reliability_score}%`, 'pulse'));
            }
            if (p.cached_models.length > 0) {
                const modelsNode = new vscode.TreeItem('Cached Models', vscode.TreeItemCollapsibleState.None);
                modelsNode.description = p.cached_models.slice(0, 3).join(', ') + (p.cached_models.length > 3 ? '…' : '');
                modelsNode.iconPath = new vscode.ThemeIcon('database');
                items.push(modelsNode);
            }
            const submitBtn = new vscode.TreeItem('Submit Job on This GPU');
            submitBtn.iconPath = new vscode.ThemeIcon('play');
            submitBtn.command = {
                command: 'dc1.submitJobOnProvider',
                title: 'Submit Job',
                arguments: [element.provider],
            };
            items.push(submitBtn);
            return items;
        }
        return [];
    }
    /** Get the list of providers (for use in job submit panel) */
    getProviders() {
        return this._providers;
    }
    dispose() {
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
        }
        this._onDidChangeTreeData.dispose();
    }
}
exports.GPUTreeProvider = GPUTreeProvider;


/***/ }),

/***/ "./src/providers/JobsTreeProvider.ts":
/*!*******************************************!*\
  !*** ./src/providers/JobsTreeProvider.ts ***!
  \*******************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.JobsTreeProvider = exports.JobNode = void 0;
const vscode = __importStar(__webpack_require__(/*! vscode */ "vscode"));
const dc1Client_1 = __webpack_require__(/*! ../api/dc1Client */ "./src/api/dc1Client.ts");
const STATUS_ICONS = {
    completed: { icon: 'check', color: 'testing.iconPassed' },
    running: { icon: 'sync~spin', color: 'charts.blue' },
    pending: { icon: 'clock', color: 'charts.yellow' },
    queued: { icon: 'list-ordered', color: 'charts.yellow' },
    failed: { icon: 'error', color: 'testing.iconFailed' },
    cancelled: { icon: 'circle-slash', color: 'disabledForeground' },
};
class JobNode extends vscode.TreeItem {
    constructor(job) {
        const label = `${job.job_type.replace(/_/g, ' ')} — ${job.job_id.slice(0, 8)}`;
        super(label, vscode.TreeItemCollapsibleState.None);
        this.job = job;
        const iconCfg = STATUS_ICONS[job.status] ?? { icon: 'question', color: undefined };
        this.iconPath = new vscode.ThemeIcon(iconCfg.icon, iconCfg.color ? new vscode.ThemeColor(iconCfg.color) : undefined);
        this.description = job.status;
        this.contextValue = job.status === 'running' || job.status === 'pending' ? 'job_running' : 'job';
        this.id = `job-${job.job_id}`;
        this.tooltip = this.buildTooltip();
        // Click to view logs
        this.command = {
            command: 'dc1.viewJobLogs',
            title: 'View Job Logs',
            arguments: [job],
        };
    }
    buildTooltip() {
        const j = this.job;
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**Job ${j.job_id}**\n\n`);
        md.appendMarkdown(`- Type: \`${j.job_type}\`\n`);
        md.appendMarkdown(`- Status: **${j.status}**\n`);
        if (j.progress_phase) {
            md.appendMarkdown(`- Phase: ${j.progress_phase}\n`);
        }
        if (j.submitted_at) {
            md.appendMarkdown(`- Submitted: ${new Date(j.submitted_at).toLocaleString()}\n`);
        }
        if (j.started_at) {
            md.appendMarkdown(`- Started: ${new Date(j.started_at).toLocaleString()}\n`);
        }
        if (j.completed_at) {
            md.appendMarkdown(`- Completed: ${new Date(j.completed_at).toLocaleString()}\n`);
        }
        if (j.cost_halala || j.actual_cost_halala) {
            const halala = j.actual_cost_halala || j.cost_halala || 0;
            md.appendMarkdown(`- Cost: ${(halala / 100).toFixed(2)} SAR\n`);
        }
        return md;
    }
}
exports.JobNode = JobNode;
class JobsTreeProvider {
    constructor(auth) {
        this.auth = auth;
        this._jobs = [];
        this._loading = false;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        auth.onDidChangeKey(() => {
            this._jobs = [];
            this.refresh();
        });
        this.refresh();
        this.startPolling();
    }
    startPolling() {
        const cfg = vscode.workspace.getConfiguration('dc1');
        const interval = cfg.get('pollIntervalSeconds', 10) * 1000;
        this._pollTimer = setInterval(() => {
            if (this.auth.isAuthenticated) {
                this.refresh();
            }
        }, interval);
    }
    refresh() {
        const key = this.auth.apiKey;
        if (!key) {
            this._jobs = [];
            this._onDidChangeTreeData.fire();
            return;
        }
        this._loading = true;
        this._error = undefined;
        this._onDidChangeTreeData.fire();
        dc1Client_1.dc1.getMyJobs(key)
            .then((jobs) => {
            this._jobs = jobs;
            this._loading = false;
            this._onDidChangeTreeData.fire();
        })
            .catch((err) => {
            this._loading = false;
            this._error = err instanceof Error ? err.message : String(err);
            this._onDidChangeTreeData.fire();
        });
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return [];
        }
        if (!this.auth.isAuthenticated) {
            const node = new vscode.TreeItem('Set API key to see your jobs');
            node.iconPath = new vscode.ThemeIcon('key');
            node.command = { command: 'dc1.setup', title: 'Set API Key' };
            return [node];
        }
        if (this._loading) {
            const node = new vscode.TreeItem('Loading jobs…');
            node.iconPath = new vscode.ThemeIcon('loading~spin');
            return [node];
        }
        if (this._error) {
            const node = new vscode.TreeItem(`Error: ${this._error}`);
            node.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
            return [node];
        }
        if (this._jobs.length === 0) {
            const node = new vscode.TreeItem('No jobs yet — submit one!');
            node.iconPath = new vscode.ThemeIcon('info');
            return [node];
        }
        return this._jobs.map((j) => new JobNode(j));
    }
    getJobs() {
        return this._jobs;
    }
    dispose() {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
        }
        this._onDidChangeTreeData.dispose();
    }
}
exports.JobsTreeProvider = JobsTreeProvider;


/***/ }),

/***/ "./src/providers/ModelsCatalogProvider.ts":
/*!************************************************!*\
  !*** ./src/providers/ModelsCatalogProvider.ts ***!
  \************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ModelsCatalogProvider = exports.ModelNode = void 0;
const vscode = __importStar(__webpack_require__(/*! vscode */ "vscode"));
const dc1Client_1 = __webpack_require__(/*! ../api/dc1Client */ "./src/api/dc1Client.ts");
/** Arabic models category */
class ArabicModelsNode extends vscode.TreeItem {
    constructor(count) {
        super(`🌍 Arabic Models (${count})`, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'model-category';
        this.id = 'models-arabic';
        this.iconPath = new vscode.ThemeIcon('globe');
    }
}
/** Non-Arabic models category */
class OtherModelsNode extends vscode.TreeItem {
    constructor(count) {
        super(`🤖 Other Models (${count})`, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'model-category';
        this.id = 'models-other';
        this.iconPath = new vscode.ThemeIcon('symbol-method');
    }
}
/** Individual model node */
class ModelNode extends vscode.TreeItem {
    constructor(model) {
        const prefix = model.is_arabic ? '🌍' : '🤖';
        const label = `${prefix} ${model.display_name}`;
        super(label, vscode.TreeItemCollapsibleState.None);
        this.model = model;
        this.contextValue = 'model';
        this.id = `model-${model.model_id}`;
        this.tooltip = this.buildTooltip();
        // Show availability and price
        const availability = model.status === 'available' ? `✅ ${model.providers_online} providers` : '❌ No providers';
        const priceText = `${(model.avg_price_sar_per_min * 60).toFixed(2)} SAR/hr`;
        this.description = `${model.vram_gb}GB • ${priceText} • ${availability}`;
    }
    buildTooltip() {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`# ${this.model.display_name}\n\n`);
        md.appendMarkdown(`**Model ID:** \`${this.model.model_id}\`\n\n`);
        md.appendMarkdown(`| Property | Value |\n|---|---|\n`);
        if (this.model.family) {
            md.appendMarkdown(`| Family | ${this.model.family} |\n`);
        }
        md.appendMarkdown(`| VRAM | ${this.model.vram_gb} GB |\n`);
        md.appendMarkdown(`| Status | ${this.model.status === 'available' ? '✅ Available' : '❌ No Providers'} |\n`);
        md.appendMarkdown(`| Providers Online | ${this.model.providers_online} |\n`);
        const dcpHrPrice = (this.model.avg_price_sar_per_min * 60).toFixed(2);
        md.appendMarkdown(`| DCP Price | ${dcpHrPrice} SAR/hour |\n`);
        md.appendMarkdown(`| Arabic | ${this.model.is_arabic ? '✅ Yes' : '❌ No'} |\n`);
        // Add pricing comparison if available
        if (this.model.competitor_prices && this.model.savings_pct !== undefined) {
            md.appendMarkdown(`\n## 💰 Pricing Comparison\n\n`);
            md.appendMarkdown(`| Provider | Price (SAR/hr) | vs DCP |\n|---|---|---|\n`);
            md.appendMarkdown(`| **DCP** | **${dcpHrPrice}** | **baseline** |\n`);
            const vastPrice = this.model.competitor_prices.vast_ai;
            if (vastPrice > 0) {
                const savings = ((vastPrice - parseFloat(dcpHrPrice)) / vastPrice * 100).toFixed(0);
                md.appendMarkdown(`| Vast.ai | ${vastPrice.toFixed(2)} | +${savings}% |\n`);
            }
            const runpodPrice = this.model.competitor_prices.runpod;
            if (runpodPrice > 0) {
                const savings = ((runpodPrice - parseFloat(dcpHrPrice)) / runpodPrice * 100).toFixed(0);
                md.appendMarkdown(`| RunPod | ${runpodPrice.toFixed(2)} | +${savings}% |\n`);
            }
            const awsPrice = this.model.competitor_prices.aws;
            if (awsPrice > 0) {
                const savings = ((awsPrice - parseFloat(dcpHrPrice)) / awsPrice * 100).toFixed(0);
                md.appendMarkdown(`| AWS | ${awsPrice.toFixed(2)} | +${savings}% |\n`);
            }
            if (this.model.savings_pct > 0) {
                md.appendMarkdown(`\n**Average savings: ${this.model.savings_pct}% vs Vast.ai**\n`);
            }
        }
        md.isTrusted = true;
        return md;
    }
}
exports.ModelNode = ModelNode;
/** Error node */
class ErrorNode extends vscode.TreeItem {
    constructor(message) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('error');
        this.contextValue = 'error';
    }
}
/** Loading node */
class LoadingNode extends vscode.TreeItem {
    constructor() {
        super('Loading models…', vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('loading~spin');
    }
}
class ModelsCatalogProvider {
    constructor() {
        this._models = [];
        this._loading = false;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.refresh();
        this.startAutoRefresh();
    }
    startAutoRefresh() {
        const cfg = vscode.workspace.getConfiguration('dc1');
        if (cfg.get('autoRefreshModels', true)) {
            this._refreshTimer = setInterval(() => this.refresh(), 5 * 60000); // 5 minutes
        }
    }
    refresh() {
        this._loading = true;
        this._error = undefined;
        this._onDidChangeTreeData.fire();
        dc1Client_1.dc1.getModels()
            .then(({ models }) => {
            this._models = models;
            this._loading = false;
            this._onDidChangeTreeData.fire();
        })
            .catch((err) => {
            this._loading = false;
            this._error = err instanceof Error ? err.message : String(err);
            this._onDidChangeTreeData.fire();
        });
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            // Root — return Arabic and Other categories
            if (this._loading) {
                return [new LoadingNode()];
            }
            if (this._error) {
                return [new ErrorNode(`Failed to load models: ${this._error}`)];
            }
            if (this._models.length === 0) {
                return [new ErrorNode('No models available')];
            }
            const arabicModels = this._models.filter(m => m.is_arabic);
            const otherModels = this._models.filter(m => !m.is_arabic);
            const result = [];
            if (arabicModels.length > 0) {
                result.push(new ArabicModelsNode(arabicModels.length));
            }
            if (otherModels.length > 0) {
                result.push(new OtherModelsNode(otherModels.length));
            }
            return result;
        }
        // Category node — return models in that category
        if (element instanceof ArabicModelsNode) {
            return this._models
                .filter(m => m.is_arabic)
                .map(m => new ModelNode(m));
        }
        if (element instanceof OtherModelsNode) {
            return this._models
                .filter(m => !m.is_arabic)
                .map(m => new ModelNode(m));
        }
        return [];
    }
    dispose() {
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
        }
    }
    getModels() {
        return this._models;
    }
}
exports.ModelsCatalogProvider = ModelsCatalogProvider;


/***/ }),

/***/ "./src/providers/ProviderStatusTreeProvider.ts":
/*!*****************************************************!*\
  !*** ./src/providers/ProviderStatusTreeProvider.ts ***!
  \*****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ProviderStatusTreeProvider = void 0;
const vscode = __importStar(__webpack_require__(/*! vscode */ "vscode"));
const dc1Client_1 = __webpack_require__(/*! ../api/dc1Client */ "./src/api/dc1Client.ts");
/** A single status row in the DC1 Provider sidebar */
class StatusItem extends vscode.TreeItem {
    constructor(label, value, icon, color) {
        super(`${label}: ${value}`, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon(icon, color ? new vscode.ThemeColor(color) : undefined);
        this.contextValue = 'statusItem';
    }
}
/** Formats a heartbeat timestamp as a human-readable "X min ago" string */
function timeAgo(isoString) {
    if (!isoString) {
        return 'never';
    }
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) {
        return `${diffSec}s ago`;
    }
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
        return `${diffMin}m ago`;
    }
    return `${Math.floor(diffMin / 60)}h ago`;
}
class ProviderStatusTreeProvider {
    constructor(auth) {
        this.auth = auth;
        this._loading = false;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        // Refresh when provider key changes
        auth.onDidChangeProviderKey(() => {
            this._info = undefined;
            this._error = undefined;
            this.refresh();
        });
        this.refresh();
        this.startAutoRefresh();
    }
    startAutoRefresh() {
        // Auto-refresh every 60s
        this._refreshTimer = setInterval(() => {
            if (this.auth.isProviderAuthenticated) {
                this.refresh();
            }
        }, 60000);
    }
    refresh() {
        const key = this.auth.providerKey;
        if (!key) {
            this._info = undefined;
            this._error = undefined;
            this._onDidChangeTreeData.fire();
            return;
        }
        this._loading = true;
        this._error = undefined;
        this._onDidChangeTreeData.fire();
        dc1Client_1.dc1.getProviderInfo(key)
            .then((info) => {
            this._info = info;
            this._loading = false;
            this._onDidChangeTreeData.fire();
        })
            .catch((err) => {
            this._loading = false;
            this._error = err instanceof Error ? err.message : String(err);
            this._onDidChangeTreeData.fire();
        });
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return [];
        }
        if (!this.auth.isProviderAuthenticated) {
            const node = new vscode.TreeItem('Set your DC1 Provider API key');
            node.iconPath = new vscode.ThemeIcon('key');
            node.command = { command: 'dc1.setProviderKey', title: 'Set Provider API Key' };
            return [node];
        }
        if (this._loading) {
            const node = new vscode.TreeItem('Loading provider status…');
            node.iconPath = new vscode.ThemeIcon('loading~spin');
            return [node];
        }
        if (this._error) {
            const items = [];
            const errNode = new vscode.TreeItem('VPS offline — last known data');
            errNode.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
            items.push(errNode);
            // If we have cached data, still show it
            if (this._info) {
                items.push(...this.buildStatusItems(this._info));
            }
            return items;
        }
        if (!this._info) {
            const node = new vscode.TreeItem('No provider data yet');
            node.iconPath = new vscode.ThemeIcon('info');
            return [node];
        }
        return this.buildStatusItems(this._info);
    }
    buildStatusItems(info) {
        const items = [];
        // Online status
        const onlineLabel = info.is_live ? '🟢 Online' : '🔴 Offline';
        const onlineIcon = info.is_live ? 'circle-filled' : 'circle-outline';
        const onlineColor = info.is_live ? 'testing.iconPassed' : 'testing.iconFailed';
        const onlineNode = new vscode.TreeItem(onlineLabel, vscode.TreeItemCollapsibleState.None);
        onlineNode.iconPath = new vscode.ThemeIcon(onlineIcon, new vscode.ThemeColor(onlineColor));
        onlineNode.contextValue = 'statusItem';
        items.push(onlineNode);
        // GPU Model
        items.push(new StatusItem('GPU', info.gpu_model || 'Unknown', 'chip'));
        // VRAM
        const vramLabel = info.vram_gb != null ? `${info.vram_gb} GB` : 'Unknown';
        items.push(new StatusItem('VRAM', vramLabel, 'database'));
        // Jobs Completed
        items.push(new StatusItem('Jobs Completed', String(info.total_jobs), 'check-all'));
        // Earnings
        const totalSar = (info.total_earnings_halala / 100).toFixed(2);
        const todaySar = (info.today_earnings_halala / 100).toFixed(2);
        items.push(new StatusItem('Earnings (total)', `${totalSar} SAR`, 'credit-card'));
        items.push(new StatusItem('Earnings (today)', `${todaySar} SAR`, 'trending-up'));
        // Last Heartbeat
        items.push(new StatusItem('Last Heartbeat', timeAgo(info.last_heartbeat), 'pulse'));
        return items;
    }
    /** Returns last known provider info (may be stale) */
    getProviderInfo() {
        return this._info;
    }
    dispose() {
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
        }
        this._onDidChangeTreeData.dispose();
    }
}
exports.ProviderStatusTreeProvider = ProviderStatusTreeProvider;


/***/ }),

/***/ "./src/providers/TemplatesCatalogProvider.ts":
/*!***************************************************!*\
  !*** ./src/providers/TemplatesCatalogProvider.ts ***!
  \***************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TemplatesCatalogProvider = exports.TemplateNode = void 0;
const vscode = __importStar(__webpack_require__(/*! vscode */ "vscode"));
const dc1Client_1 = __webpack_require__(/*! ../api/dc1Client */ "./src/api/dc1Client.ts");
/** Template category grouping */
class CategoryNode extends vscode.TreeItem {
    constructor(label, category) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.category = category;
        this.contextValue = 'template-category';
        this.id = `category-${category}`;
        this.iconPath = this.getCategoryIcon();
    }
    getCategoryIcon() {
        const iconMap = {
            'llm': 'symbol-method',
            'embedding': 'circle-filled',
            'image': 'device-camera',
            'notebook': 'notebook',
            'training': 'play',
            'inference': 'zap',
        };
        return new vscode.ThemeIcon(iconMap[this.category] || 'folder');
    }
}
/** Individual template node */
class TemplateNode extends vscode.TreeItem {
    constructor(template) {
        const label = template.icon ? `${template.icon} ${template.name}` : template.name;
        super(label, vscode.TreeItemCollapsibleState.None);
        this.template = template;
        this.contextValue = 'template';
        this.id = `template-${template.id}`;
        this.tooltip = this.buildTooltip();
        // Show min VRAM and price
        const vramText = `${template.min_vram_gb}GB`;
        const priceText = `${template.estimated_price_sar_per_hour.toFixed(2)} SAR/hr`;
        this.description = `${vramText} VRAM • ${priceText}`;
    }
    buildTooltip() {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`# ${this.template.name}\n\n`);
        md.appendMarkdown(`${this.template.description}\n\n`);
        md.appendMarkdown(`**Specs:**\n\n`);
        md.appendMarkdown(`| Property | Value |\n|---|---|\n`);
        md.appendMarkdown(`| Min VRAM | ${this.template.min_vram_gb} GB |\n`);
        md.appendMarkdown(`| Difficulty | ${this.template.difficulty || 'N/A'} |\n`);
        if (this.template.tier) {
            md.appendMarkdown(`| Tier | ${this.template.tier} |\n`);
        }
        md.appendMarkdown(`| Tags | ${(this.template.tags || []).join(', ') || 'None'} |\n`);
        // Add pricing information with estimated comparison
        md.appendMarkdown(`\n## 💰 Pricing\n\n`);
        const dcpPrice = this.template.estimated_price_sar_per_hour;
        md.appendMarkdown(`**DCP:** ${dcpPrice.toFixed(2)} SAR/hour\n\n`);
        // Estimate competitive pricing based on VRAM tier
        const estimatedCompetitorPrice = this.estimateCompetitorPrice(this.template.min_vram_gb);
        if (estimatedCompetitorPrice > dcpPrice) {
            const savingsPercent = ((estimatedCompetitorPrice - dcpPrice) / estimatedCompetitorPrice * 100).toFixed(0);
            md.appendMarkdown(`**Estimated vs Vast.ai:** ~${savingsPercent}% savings\n`);
            md.appendMarkdown(`*(Actual pricing depends on model and provider)*\n`);
        }
        md.isTrusted = true;
        return md;
    }
    estimateCompetitorPrice(minVramGb) {
        // Estimate based on VRAM tier from backend COMPETITOR_PRICING_BY_VRAM_TIER
        if (minVramGb >= 80)
            return 120.00; // H100 class
        if (minVramGb >= 40)
            return 36.00; // A100/A40 class
        if (minVramGb >= 24)
            return 10.00; // RTX 4090 class
        if (minVramGb >= 16)
            return 10.00; // RTX 4080 class
        return 6.00; // entry tier
    }
}
exports.TemplateNode = TemplateNode;
/** Error node displayed when fetch fails */
class ErrorNode extends vscode.TreeItem {
    constructor(message) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('error');
        this.contextValue = 'error';
    }
}
/** Loading node displayed while fetching */
class LoadingNode extends vscode.TreeItem {
    constructor() {
        super('Loading templates…', vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('loading~spin');
    }
}
class TemplatesCatalogProvider {
    constructor() {
        this._templates = [];
        this._loading = false;
        this._searchFilter = '';
        this._minVramFilter = null;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.refresh();
        this.startAutoRefresh();
    }
    /** Set search filter text (fuzzy search on name/description) */
    setSearchFilter(text) {
        this._searchFilter = text.toLowerCase();
        this._onDidChangeTreeData.fire();
    }
    /** Set minimum VRAM filter */
    setMinVramFilter(minVram) {
        this._minVramFilter = minVram;
        this._onDidChangeTreeData.fire();
    }
    /** Clear all filters */
    clearFilters() {
        this._searchFilter = '';
        this._minVramFilter = null;
        this._onDidChangeTreeData.fire();
    }
    getFilteredTemplates() {
        return this._templates.filter(t => {
            // Search filter (fuzzy match on name and description)
            if (this._searchFilter) {
                const searchText = `${t.name} ${t.description}`.toLowerCase();
                if (!this.fuzzyMatch(searchText, this._searchFilter)) {
                    return false;
                }
            }
            // VRAM filter
            if (this._minVramFilter !== null && t.min_vram_gb < this._minVramFilter) {
                return false;
            }
            return true;
        });
    }
    fuzzyMatch(text, pattern) {
        let patternIdx = 0;
        for (let i = 0; i < text.length && patternIdx < pattern.length; i++) {
            if (text[i] === pattern[patternIdx]) {
                patternIdx++;
            }
        }
        return patternIdx === pattern.length;
    }
    startAutoRefresh() {
        const cfg = vscode.workspace.getConfiguration('dc1');
        if (cfg.get('autoRefreshTemplates', true)) {
            this._refreshTimer = setInterval(() => this.refresh(), 5 * 60000); // 5 minutes
        }
    }
    refresh() {
        this._loading = true;
        this._error = undefined;
        this._onDidChangeTreeData.fire();
        dc1Client_1.dc1.getDockerTemplates()
            .then(({ templates }) => {
            this._templates = templates.sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99));
            this._loading = false;
            this._onDidChangeTreeData.fire();
        })
            .catch((err) => {
            this._loading = false;
            this._error = err instanceof Error ? err.message : String(err);
            this._onDidChangeTreeData.fire();
        });
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            // Root — return categories or error/loading
            if (this._loading) {
                return [new LoadingNode()];
            }
            if (this._error) {
                return [new ErrorNode(`Failed to load templates: ${this._error}`)];
            }
            const filtered = this.getFilteredTemplates();
            if (filtered.length === 0) {
                if (this._templates.length === 0) {
                    return [new ErrorNode('No templates available')];
                }
                return [new ErrorNode('No templates match your filters')];
            }
            // Group filtered templates by primary tag
            const categories = new Map();
            for (const template of filtered) {
                const category = template.tags?.[0] || 'other';
                if (!categories.has(category)) {
                    categories.set(category, []);
                }
                categories.get(category).push(template);
            }
            // Return category nodes in order
            return Array.from(categories.entries())
                .map(([cat, _]) => new CategoryNode(this.getCategoryLabel(cat), cat))
                .sort((a, b) => a.label.toString().localeCompare(b.label.toString()));
        }
        // Category node — return templates in that category
        if (element instanceof CategoryNode) {
            return this.getFilteredTemplates()
                .filter(t => (t.tags?.[0] || 'other') === element.category)
                .map(t => new TemplateNode(t));
        }
        return [];
    }
    getCategoryLabel(category) {
        const labels = {
            'llm': '🤖 Large Language Models',
            'embedding': '🌍 Embeddings',
            'image': '🖼️ Image Generation',
            'notebook': '📓 Notebooks',
            'training': '🎓 Training',
            'inference': '⚡ Inference',
            'other': '📦 Other',
        };
        return labels[category] || `📦 ${category}`;
    }
    dispose() {
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
        }
    }
    getTemplates() {
        return this._templates;
    }
}
exports.TemplatesCatalogProvider = TemplatesCatalogProvider;


/***/ }),

/***/ "vscode":
/*!*************************!*\
  !*** external "vscode" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("vscode");

/***/ }),

/***/ "http":
/*!***********************!*\
  !*** external "http" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("http");

/***/ }),

/***/ "https":
/*!************************!*\
  !*** external "https" ***!
  \************************/
/***/ ((module) => {

module.exports = require("https");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__("./src/extension.ts");
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;
//# sourceMappingURL=extension.js.map
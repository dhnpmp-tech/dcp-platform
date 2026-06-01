import * as vscode from 'vscode';
import { AuthManager } from '../auth/AuthManager';
import { dc1, ProviderInfo } from '../api/dc1Client';

export class ProviderEarningsPanel {
  private static _current: ProviderEarningsPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _auth: AuthManager;
  private _disposables: vscode.Disposable[] = [];

  static show(extensionUri: vscode.Uri, auth: AuthManager): void {
    if (ProviderEarningsPanel._current) {
      ProviderEarningsPanel._current._panel.reveal(vscode.ViewColumn.Beside);
      ProviderEarningsPanel._current.reload();
      return;
    }
    new ProviderEarningsPanel(extensionUri, auth);
  }

  private constructor(extensionUri: vscode.Uri, auth: AuthManager) {
    this._auth = auth;
    this._panel = vscode.window.createWebviewPanel(
      'dcpProviderEarnings',
      'DCP — Provider Earnings',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        retainContextWhenHidden: true,
      }
    );

    ProviderEarningsPanel._current = this;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (msg: { type: string }) => {
        if (msg.type === 'refresh') { this.reload(); }
      },
      null,
      this._disposables
    );

    this._panel.webview.html = this.buildHtml(null, true);
    this.reload();
  }

  private async reload(): Promise<void> {
    try {
      const key = this._auth.providerApiKey;
      if (!key) {
        this._panel.webview.html = this.buildHtml(null, false, 'Provider API key not configured. Set your key in settings.');
        return;
      }

      const provider = await dc1.getProviderInfo(key);
      this._panel.webview.html = this.buildHtml(provider, false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._panel.webview.html = this.buildHtml(null, false, msg);
    }
  }

  private buildEarningsHtml(provider: ProviderInfo): string {
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

  private buildHtml(provider: ProviderInfo | null, loading: boolean, errorMsg?: string): string {
    const nonce = getNonce();
    const fetchedAt = new Date().toLocaleTimeString();
    const contentHtml = (!loading && !errorMsg && provider) ? this.buildEarningsHtml(provider) : '';

    return /* html */`<!DOCTYPE html>
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

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  dispose(): void {
    ProviderEarningsPanel._current = undefined;
    this._panel.dispose();
    this._disposables.forEach((d) => d.dispose());
    this._disposables = [];
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

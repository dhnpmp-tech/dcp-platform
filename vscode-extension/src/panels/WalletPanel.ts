import * as vscode from 'vscode';
import { dc1, RenterInfo } from '../api/dc1Client';
import { AuthManager } from '../auth/AuthManager';

type WebviewMessage =
  | { type: 'topup'; amountSar: number }
  | { type: 'refresh' };

export class WalletPanel {
  private static _current: WalletPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _info: RenterInfo | undefined;

  static show(extensionUri: vscode.Uri, auth: AuthManager): void {
    if (WalletPanel._current) {
      WalletPanel._current._panel.reveal(vscode.ViewColumn.Beside);
      WalletPanel._current.loadData();
      return;
    }
    new WalletPanel(extensionUri, auth);
  }

  private constructor(
    extensionUri: vscode.Uri,
    private readonly auth: AuthManager
  ) {
    this._panel = vscode.window.createWebviewPanel(
      'dc1Wallet',
      'DC1 — Wallet & Billing',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      }
    );

    WalletPanel._current = this;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => this.handleMessage(msg),
      null,
      this._disposables
    );

    this._panel.webview.html = this.buildHtml(undefined, true);
    this.loadData();
  }

  private async loadData(): Promise<void> {
    const key = this.auth.apiKey;
    if (!key) {
      this._panel.webview.html = this.buildHtml(undefined, false, 'No API key set. Run "DC1: Set API Key" first.');
      return;
    }

    try {
      this._info = await dc1.getRenterInfo(key);
      this._panel.webview.html = this.buildHtml(this._info, false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._panel.webview.html = this.buildHtml(undefined, false, msg);
    }
  }

  private async handleMessage(msg: WebviewMessage): Promise<void> {
    if (msg.type === 'refresh') {
      this._panel.webview.html = this.buildHtml(this._info, true);
      await this.loadData();
      return;
    }

    if (msg.type === 'topup') {
      const key = await this.auth.ensureKey();
      if (!key) { return; }

      this._panel.webview.postMessage({ type: 'topping_up' });
      try {
        const result = await dc1.topUp(key, msg.amountSar);
        const newBalSar = (result.new_balance_halala / 100).toFixed(2);
        vscode.window.showInformationMessage(`DC1: Top-up successful! New balance: ${newBalSar} SAR`);
        this._panel.webview.postMessage({ type: 'topup_success', newBalanceSar: newBalSar });
        await this.loadData();
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`DC1: Top-up failed — ${errMsg}`);
        this._panel.webview.postMessage({ type: 'topup_error', message: errMsg });
      }
    }
  }

  private buildHtml(info: RenterInfo | undefined, loading: boolean, error?: string): string {
    const nonce = getNonce();
    const balanceSar = info ? (info.balance_halala / 100).toFixed(2) : '—';
    const name = info?.name ?? '—';
    const email = info?.email ?? '—';
    const totalJobs = info?.total_jobs ?? 0;
    const apiKeyPreview = info?.api_key ? info.api_key.slice(0, 8) + '…' : '—';

    return /* html */`<!DOCTYPE html>
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
    Contact support@dcp.sa to manually top up your account.
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

  dispose(): void {
    WalletPanel._current = undefined;
    this._panel.dispose();
    this._disposables.forEach((d) => d.dispose());
    this._disposables = [];
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/** Server-side HTML escaping for template literals */
function escapeHtmlStatic(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

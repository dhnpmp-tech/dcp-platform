/* ════════════════════════════════════════
   Renter shell — sidebar + topbar injection
   ════════════════════════════════════════ */
(function () {
  const NAV = [
    { sec: 'Build', items: [
      { k: 'dash',     ic: '⌂', label: 'Overview',     href: './Dashboard.html' },
      { k: 'pg',       ic: '▷', label: 'Playground',   href: './Playground.html' },
      { k: 'keys',     ic: '⚷', label: 'API keys',     href: './Keys.html',     bd: '3' },
      { k: 'usage',    ic: '△', label: 'Usage',        href: './Usage.html' },
    ]},
    { sec: 'Spend', items: [
      { k: 'wallet',   ic: '₪', label: 'Wallet',       href: './Wallet.html',   bd: 'SAR' },
      { k: 'invoices', ic: '≡', label: 'Invoices',     href: './Invoices.html' },
    ]},
    { sec: 'Account', items: [
      { k: 'settings', ic: '⚙', label: 'Settings',     href: './Settings.html' },
      { k: 'docs',     ic: '?', label: 'Docs',         href: '../../../docs/docs-three-pane.html', bd: '↗' },
    ]},
  ];

  const sb = document.getElementById('rt-sb');
  const page = sb ? sb.dataset.page : null;
  if (sb) {
    sb.innerHTML = `
      <div class="rt-sb-brand">
        <span class="wm">DCP<i>∞</i></span>
        <span class="ctx">Console</span>
      </div>
      <div class="rt-ws">
        <button class="rt-ws-btn" title="Switch workspace">
          <span class="av">N</span>
          <span class="body">
            <span class="nm">NextWave Commerce</span>
            <span class="sub">acme-prod · 3 members</span>
          </span>
          <span class="chev">⌄</span>
        </button>
      </div>
      <div class="rt-wallet">
        <div class="k">Balance</div>
        <div class="v">SAR 2,184<span class="u">.52</span></div>
        <div class="row"><span>Held in active jobs</span><b>SAR 2.72</b></div>
        <div class="row"><span>Burn · last 7 days</span><b>SAR 412</b></div>
        <button class="topup">+ Top up</button>
      </div>
      <nav class="rt-nav">
        ${NAV.map(s => `
          <div class="sec">${s.sec}</div>
          ${s.items.map(it => `
            <a href="${it.href}" class="${page === it.k ? 'on' : ''}">
              <span class="ic">${it.ic}</span>
              <span>${it.label}</span>
              <span class="bd">${it.bd || ''}</span>
            </a>
          `).join('')}
        `).join('')}
      </nav>
      <div class="rt-sb-foot">
        <div class="av">F</div>
        <div class="who">
          Fatima Al-Harbi
          <span class="e">fatima@nextwave.sa · Owner</span>
        </div>
        <span class="out" title="Sign out">↱</span>
      </div>
    `;
  }

  const tb = document.getElementById('rt-tb');
  if (tb) {
    const crumb = tb.dataset.crumb || 'Overview';
    tb.innerHTML = `
      <button class="mb-toggle" id="mb-toggle" aria-label="Menu">☰</button>
      <div class="crumb">
        <span>NextWave Commerce</span>
        <span class="sep">/</span>
        <span class="cur">${crumb}</span>
      </div>
      <span class="pill"><span class="d"></span> API live</span>
      <a class="keys" href="./Keys.html">⚷ API keys</a>
    `;
  }

  const bd = document.getElementById('rt-backdrop');
  const tg = document.getElementById('mb-toggle');
  tg && tg.addEventListener('click', () => { sb.classList.toggle('on'); bd && bd.classList.toggle('on'); });
  bd && bd.addEventListener('click', () => { sb.classList.remove('on'); bd.classList.remove('on'); });
})();

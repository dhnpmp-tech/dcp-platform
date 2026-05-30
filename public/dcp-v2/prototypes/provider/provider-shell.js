/* ════════════════════════════════════════
   Provider shell — sidebar + topbar injection
   Each page sets data-page on .pv-sb and data-crumb on .pv-tb;
   this script fills the rest. Keeps all 4 pages in sync.
   ════════════════════════════════════════ */
(function () {
  const NAV = [
    { sec: 'Operate', items: [
      { k: 'dash',     ic: '⌂', label: 'Dashboard',     href: './Dashboard.html' },
      { k: 'rigs',     ic: '☷', label: 'Rigs',          href: './Rigs.html',     bd: '4' },
      { k: 'earnings', ic: '△', label: 'Earnings',      href: './Earnings.html' },
      { k: 'payouts',  ic: '₪', label: 'Payouts',       href: './Payouts.html',  bd: 'SAR' },
    ]},
    { sec: 'Account', items: [
      { k: 'profile',  ic: '✦', label: 'Profile',       href: './Profile.html',  bd: 'Silver' },
      { k: 'settings', ic: '⚙', label: 'Settings',      href: './Settings.html' },
      { k: 'docs',     ic: '?', label: 'Provider docs', href: '../../../docs/docs-three-pane.html', bd: '↗' },
    ]},
  ];

  const sb = document.getElementById('pv-sb');
  const page = sb ? sb.dataset.page : null;
  if (sb) {
    sb.innerHTML = `
      <div class="pv-sb-brand">
        <span class="wm">DCP<i>∞</i></span>
        <span class="ctx">Provider</span>
      </div>
      <div class="pv-status">
        <div class="k">Earning today</div>
        <div class="v">SAR 218<span class="u">so far</span></div>
        <div class="live"><span class="d"></span> 2 of 4 rigs earning</div>
        <div class="row"><span>Yesterday</span><b>SAR 194</b></div>
        <div class="row"><span>This month</span><b>SAR 5,826</b></div>
      </div>
      <nav class="pv-nav">
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
      <div class="pv-sb-foot">
        <div class="av">Y</div>
        <div class="who">
          Yazeed Al-Qahtani
          <span class="e">riyadh-studio-01 · Silver</span>
        </div>
        <span class="out" title="Sign out">↱</span>
      </div>
    `;
  }

  const tb = document.getElementById('pv-tb');
  if (tb) {
    const crumb = tb.dataset.crumb || 'Dashboard';
    tb.innerHTML = `
      <button class="mb-toggle" id="mb-toggle" aria-label="Menu">☰</button>
      <div class="crumb">
        <span>riyadh-studio-01</span>
        <span class="sep">/</span>
        <span class="cur">${crumb}</span>
      </div>
      <span class="pill"><span class="d"></span> Live · earning</span>
      <button class="kill" title="Pause all rigs">◉ Kill switch</button>
    `;
  }

  // Mobile drawer
  const bd = document.getElementById('pv-backdrop');
  const tg = document.getElementById('mb-toggle');
  tg && tg.addEventListener('click', () => { sb.classList.toggle('on'); bd && bd.classList.toggle('on'); });
  bd && bd.addEventListener('click', () => { sb.classList.remove('on'); bd.classList.remove('on'); });
})();

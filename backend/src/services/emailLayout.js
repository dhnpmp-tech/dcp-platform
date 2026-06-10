'use strict';

/**
 * emailLayout.js — the single branded shell for ALL outgoing DCP emails.
 *
 * Design language: editorial-luxury dark (locked 2026-05-25).
 *   - Near-black navy background, warm-ivory text, hairline borders.
 *   - Serif display headlines (Georgia stack as the Instrument Serif
 *     fallback — mail clients don't load webfonts).
 *   - Mono small-caps labels (Courier stack as the JetBrains Mono fallback).
 *   - Restrained semantic accents: teal = active/positive, amber = attention.
 *     Never used as a filled header bar.
 *   - Ghost CTAs: 1px accent border, transparent fill, accent text.
 *   - Sharp corners, generous whitespace, max-width 600px centered.
 *
 * Email engineering constraints honored here so templates don't have to:
 *   - All styles inline, table-based layout (Outlook), role="presentation".
 *   - Dark background set on <body>, on the 100% wrapper table AND via
 *     bgcolor attributes (some clients strip body backgrounds).
 *   - Hidden preheader text.
 *   - Bilingual EN-then-AR sections; the AR section is a real dir="rtl" cell.
 *   - Plain footer with dcp.sa + a why-you-got-this line on every email.
 */

const COLORS = {
  bg: '#050a14',        // page background
  surface: '#0a0b1a',   // card surface
  surfaceDeep: '#04050d', // card-within-card (fact rows)
  border: '#1f2040',    // hairline
  text: '#f5f3ee',      // primary ivory
  text1: '#c9c5bd',     // secondary muted cream
  text2: '#7b7a92',     // tertiary purple-gray
  text3: '#4e4d67',     // quaternary captions
  teal: '#2dd4b6',      // semantic: active / positive / default action
  amber: '#ee7a3c',     // semantic: attention / warning
};

const FONTS = {
  serif: "Georgia,'Times New Roman',serif",
  body: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif",
  mono: "'Courier New',Courier,monospace",
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function accentFor(tone) {
  return tone === 'amber' ? COLORS.amber : COLORS.teal;
}

/**
 * Fact rows — the NODE / LAST SEEN / STATUS style card.
 * Hairline-bordered table, mono uppercase labels, ivory values.
 *
 * @param {Array<{k: string, v: string}>} rows
 * @param {{rtl?: boolean}} [opts]
 */
function renderFactRows(rows, { rtl = false } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const dir = rtl ? 'rtl' : 'ltr';
  const align = rtl ? 'right' : 'left';
  const valueAlign = rtl ? 'left' : 'right';
  const cells = rows
    .map(({ k, v }, i) => {
      const borderTop = i === 0 ? '' : `border-top:1px solid ${COLORS.border};`;
      return `<tr>
          <td dir="${dir}" style="${borderTop}padding:11px 16px;text-align:${align};font-family:${FONTS.mono};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${COLORS.text2};white-space:nowrap;">${escapeHtml(k)}</td>
          <td dir="${dir}" style="${borderTop}padding:11px 16px;text-align:${valueAlign};font-family:${FONTS.body};font-size:14px;color:${COLORS.text};">${escapeHtml(v)}</td>
        </tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${COLORS.surfaceDeep}" style="width:100%;margin:0 0 24px;border:1px solid ${COLORS.border};border-collapse:collapse;background:${COLORS.surfaceDeep};">${cells}</table>`;
}

/**
 * Ghost CTA button — 1px accent border, transparent fill, accent text, mono caps.
 */
function renderGhostButton({ label, url, tone = 'teal', rtl = false }) {
  const accent = accentFor(tone);
  const arrow = rtl ? '&#8592; ' : ' &#8594;';
  const inner = rtl ? `${arrow}${escapeHtml(label)}` : `${escapeHtml(label)}${arrow}`;
  return `<a href="${url}" style="display:inline-block;border:1px solid ${accent};background:transparent;color:${accent};text-decoration:none;padding:13px 30px;font-family:${FONTS.mono};font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">${inner}</a>`;
}

/**
 * renderEmail — the one branded HTML shell.
 *
 * @param {object} p
 * @param {string} p.preheader        hidden inbox-preview line
 * @param {string} [p.labelEn]        mono eyebrow, e.g. 'Job queued'
 * @param {string} [p.labelAr]
 * @param {string} p.headlineEn       serif display headline
 * @param {string} p.headlineAr
 * @param {string} [p.bodyEnHtml]     pre-rendered EN body HTML
 * @param {string} [p.bodyArHtml]     pre-rendered AR body HTML
 * @param {{label: string, labelAr?: string, url: string, tone?: 'teal'|'amber'}} [p.cta]
 * @param {Array<{k: string, v: string, kAr?: string, vAr?: string}>} [p.factRows]
 * @param {'teal'|'amber'} [p.tone]   accent tone for the eyebrow (default teal)
 * @param {string} [p.whyEn]          footer why-you-got-this line
 * @param {string} [p.whyAr]
 * @returns {string} full HTML document
 */
function renderEmail({
  preheader,
  labelEn,
  labelAr,
  headlineEn,
  headlineAr,
  bodyEnHtml = '',
  bodyArHtml = '',
  cta,
  factRows,
  tone = 'teal',
  whyEn,
  whyAr,
}) {
  const accent = accentFor(tone);

  const preheaderHtml = preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}${'&#8199;&#65279;&#847; '.repeat(20)}</div>`
    : '';

  const eyebrowEn = labelEn
    ? `<p style="font-family:${FONTS.mono};font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:${accent};margin:0 0 16px;">&mdash; ${escapeHtml(labelEn)}</p>`
    : '';
  const eyebrowAr = labelAr
    ? `<p style="font-family:${FONTS.mono};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${accent};margin:0 0 16px;">${escapeHtml(labelAr)} &mdash;</p>`
    : '';

  const factRowsEn = renderFactRows(factRows || [], { rtl: false });
  const factRowsAr = renderFactRows(
    (factRows || []).map((r) => ({ k: r.kAr || r.k, v: r.vAr || r.v })),
    { rtl: true }
  );

  const ctaEn = cta && cta.url
    ? `<p style="margin:4px 0 8px;">${renderGhostButton({ label: cta.label || 'Open DCP', url: cta.url, tone: cta.tone || tone })}</p>`
    : '';
  const ctaAr = cta && cta.url
    ? `<p style="margin:4px 0 8px;">${renderGhostButton({ label: cta.labelAr || cta.label || 'فتح DCP', url: cta.url, tone: cta.tone || tone, rtl: true })}</p>`
    : '';

  const whyEnHtml = whyEn
    ? `<p style="font-family:${FONTS.body};font-size:11px;line-height:1.6;color:${COLORS.text3};margin:10px 0 0;">${escapeHtml(whyEn)}</p>`
    : '';
  const whyArHtml = whyAr
    ? `<p dir="rtl" style="font-family:${FONTS.body};font-size:11px;line-height:1.7;color:${COLORS.text3};margin:6px 0 0;text-align:right;direction:rtl;">${escapeHtml(whyAr)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(headlineEn || 'DCP')}</title>
</head>
<body bgcolor="${COLORS.bg}" style="margin:0;padding:0;background:${COLORS.bg};font-family:${FONTS.body};color:${COLORS.text};-webkit-font-smoothing:antialiased;">
${preheaderHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${COLORS.bg}" style="background:${COLORS.bg};">
<tr><td align="center" style="padding:48px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="${COLORS.surface}" style="width:600px;max-width:600px;background:${COLORS.surface};border:1px solid ${COLORS.border};">

  <!-- Masthead: text wordmark over a hairline. Never a filled bar. -->
  <tr><td style="padding:26px 40px 22px;border-bottom:1px solid ${COLORS.border};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:${FONTS.serif};font-size:25px;color:${COLORS.text};letter-spacing:.01em;">DCP&#8734;</td>
      <td align="right" style="font-family:${FONTS.mono};font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:${COLORS.text3};">dcp.sa</td>
    </tr></table>
  </td></tr>

  <!-- EN section -->
  <tr><td style="padding:40px 40px 28px;">
    ${eyebrowEn}
    <h1 style="font-family:${FONTS.serif};font-weight:400;font-size:31px;line-height:1.18;color:${COLORS.text};margin:0 0 18px;">${escapeHtml(headlineEn)}</h1>
    ${bodyEnHtml}
    ${factRowsEn}
    ${ctaEn}
  </td></tr>

  <tr><td style="padding:0 40px;"><div style="border-top:1px solid ${COLORS.border};font-size:0;line-height:0;">&nbsp;</div></td></tr>

  <!-- AR section -->
  <tr><td dir="rtl" style="padding:34px 40px 36px;text-align:right;direction:rtl;">
    ${eyebrowAr}
    <h1 dir="rtl" style="font-family:${FONTS.serif};font-weight:400;font-size:29px;line-height:1.3;color:${COLORS.text};margin:0 0 18px;text-align:right;">${escapeHtml(headlineAr)}</h1>
    ${bodyArHtml}
    ${factRowsAr}
    ${ctaAr}
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:22px 40px 30px;border-top:1px solid ${COLORS.border};">
    <p style="font-family:${FONTS.mono};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${COLORS.text3};margin:0;">DCP&#8734; &middot; <a href="https://dcp.sa" style="color:${COLORS.text2};text-decoration:none;">dcp.sa</a> &middot; KSA-resident GPU compute</p>
    ${whyEnHtml}
    ${whyArHtml}
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

module.exports = {
  renderEmail,
  renderFactRows,
  renderGhostButton,
  escapeHtml,
  COLORS,
  FONTS,
};

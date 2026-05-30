const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'DCP Platform <noreply@dcp.sa>';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toSafeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatSar(value) {
  return toSafeNumber(value, 0).toFixed(2);
}

function formatHalalaAsSar(value) {
  return formatSar(toSafeNumber(value, 0) / 100);
}

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || 'https://dcp.sa').replace(/\/+$/, '');
}

function notificationFooterText() {
  return 'Manage notifications at dcp.sa/renter/settings';
}

function notificationFooterHtml() {
  return `<p style="margin-top:16px;color:#666;font-size:13px">Manage notifications at <a href="https://dcp.sa/renter/settings">dcp.sa/renter/settings</a></p>`;
}

// ── DCP-brand email shell ─────────────────────────────────────────────────
// Shared layout used by all transactional emails (job lifecycle, withdrawals,
// data-export). Matches buildWelcomeTemplate: 520px wide table on a #07070E
// body, amber #F5A524 header, EN section, <hr>, AR section. Each call passes
// EN + AR bodies (ready-rendered HTML strings) plus a single primary action.
//
// Keep this in sync with buildWelcomeTemplate's HTML so the brand reads as
// one product family across all touchpoints.
function buildBrandShell({
  headlineEn,
  headlineAr,
  bodyEn,
  bodyAr,
  ctaLabel,
  ctaLabelAr,
  ctaUrl,
  footerEn,
  footerAr,
}) {
  const cta = ctaUrl
    ? `<p style="margin:0 0 24px;"><a href="${ctaUrl}" style="display:inline-block;background:#F5A524;color:#07070E;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;">${escapeHtml(ctaLabel || 'Open in DCP')}</a></p>`
    : '';
  const ctaAr = ctaUrl
    ? `<p style="margin:0 0 24px;direction:rtl;text-align:right;"><a href="${ctaUrl}" style="display:inline-block;background:#F5A524;color:#07070E;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;">${escapeHtml(ctaLabelAr || ctaLabel || 'فتح')}</a></p>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#07070E;font-family:'Inter',Arial,sans-serif;color:#E5E5E5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#07070E;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#111118;border-radius:12px;overflow:hidden;max-width:520px;">
        <tr><td style="background:#F5A524;padding:20px 32px;">
          <h1 style="margin:0;color:#07070E;font-size:22px;font-weight:700;">DCP</h1>
        </td></tr>
        <tr><td style="padding:36px 32px;">
          <h2 style="color:#E5E5E5;font-size:20px;font-weight:700;margin:0 0 12px;">${escapeHtml(headlineEn)}</h2>
          ${bodyEn}
          ${cta}
          ${footerEn ? `<p style="color:#6B6B7A;font-size:12px;margin:0;">${escapeHtml(footerEn)}</p>` : ''}

          <hr style="border:none;border-top:1px solid #2A2A3A;margin:32px 0 24px;" />

          <h2 style="color:#E5E5E5;font-size:20px;font-weight:700;margin:0 0 12px;direction:rtl;text-align:right;">${escapeHtml(headlineAr)}</h2>
          <div style="direction:rtl;text-align:right;">${bodyAr}</div>
          ${ctaAr}
          ${footerAr ? `<p style="color:#6B6B7A;font-size:12px;margin:0;direction:rtl;text-align:right;">${escapeHtml(footerAr)}</p>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Helper for the labelled metadata rows used by job/withdrawal templates.
// Produces a vertical stack of muted-label / bright-value pairs, RTL-aware.
function brandMetaRows(rows, { rtl = false } = {}) {
  const align = rtl ? 'right' : 'left';
  const itemsHtml = rows
    .map(({ label, value }) => `
      <tr><td style="padding:6px 0;text-align:${align};">
        <span style="color:#6B6B7A;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(label)}</span>
        <br /><span style="color:#E5E5E5;font-size:14px;font-weight:600;">${escapeHtml(value)}</span>
      </td></tr>
    `)
    .join('');
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #2A2A3A;border-radius:8px;background:#0E0E18;padding:8px 16px;">${itemsHtml}</table>`;
}

async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[emailService] RESEND_API_KEY not set, skipping email to ${to}`);
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to,
        subject,
        html,
        text,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error(`[emailService] Failed to send email (${response.status}) to ${to}: ${details}`);
      return { ok: false, reason: 'provider_error', status: response.status };
    }

    return { ok: true };
  } catch (error) {
    console.error(`[emailService] Network error while emailing ${to}:`, error.message);
    return { ok: false, reason: 'network_error' };
  }
}

function buildWelcomeTemplate({ name, apiKey, role }) {
  const frontend = getFrontendUrl();
  const isProvider = role === 'provider';
  const dashboardUrl = `${frontend}${isProvider ? '/provider' : '/renter/marketplace'}`;
  const loginUrl = `${frontend}/login?role=${isProvider ? 'provider' : 'renter'}`;
  const docsUrl = `${frontend}/docs`;
  const setupUrl = `${frontend}/setup`;
  const roleLabel = isProvider ? 'Provider' : 'Renter';
  const roleLabelAr = isProvider ? 'مزود' : 'مستأجر';
  const nextStepEn = isProvider
    ? 'Open the dashboard to verify your provider app is online, see live earnings, and download the tray app for your OS.'
    : 'Open the marketplace to pick a model, top up if needed, and run your first inference call.';
  const nextStepAr = isProvider
    ? 'افتح لوحة التحكم للتحقق من اتصال تطبيق المزوّد، ومتابعة الأرباح، وتنزيل تطبيق الشريط لنظامك.'
    : 'افتح السوق لاختيار نموذج، اشحن رصيدك إذا لزم الأمر، وشغّل أول طلب استدلال.';

  return {
    subject: `Welcome to DCP, ${name} | مرحباً بك في DCP`,
    text: [
      `Welcome to DCP, ${name}!`,
      '',
      `Your ${roleLabel} account is ready.`,
      '',
      `Sign in any time at: ${loginUrl}`,
      `We'll email you a one-click sign-in link — no password, no codes.`,
      '',
      `Dashboard: ${dashboardUrl}`,
      `Docs: ${docsUrl}`,
      '',
      `Optional API key (for SDK / CLI use): ${apiKey}`,
      `Treat it like a password. You can rotate it anytime from your account settings.`,
      '',
      nextStepEn,
      '',
      '— The DCP team',
      '',
      '----',
      '',
      `مرحباً بك في DCP، ${name}!`,
      '',
      `حسابك كـ ${roleLabelAr} جاهز.`,
      '',
      `سجّل دخولك في أي وقت من: ${loginUrl}`,
      `سنرسل لك رابطًا لتسجيل الدخول — بدون كلمة سر أو رموز.`,
      '',
      `لوحة التحكم: ${dashboardUrl}`,
      `الدليل: ${docsUrl}`,
      '',
      `مفتاح API (اختياري، للاستخدام عبر SDK/CLI): ${apiKey}`,
      `تعامل معه ككلمة سر. يمكنك تدويره في أي وقت من إعدادات الحساب.`,
      '',
      nextStepAr,
      '',
      '— فريق DCP',
    ].join('\n'),
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#07070E;font-family:'Inter',Arial,sans-serif;color:#E5E5E5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#07070E;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#111118;border-radius:12px;overflow:hidden;max-width:520px;">
        <tr><td style="background:#F5A524;padding:20px 32px;">
          <h1 style="margin:0;color:#07070E;font-size:22px;font-weight:700;">DCP</h1>
        </td></tr>
        <tr><td style="padding:36px 32px;">
          <h2 style="color:#E5E5E5;font-size:22px;font-weight:700;margin:0 0 8px;">Welcome, ${escapeHtml(name)}</h2>
          <p style="color:#A0A0B0;font-size:15px;margin:0 0 24px;line-height:1.5;">Your <strong style="color:#E5E5E5;">${escapeHtml(roleLabel)}</strong> account is ready.</p>

          <p style="color:#A0A0B0;font-size:14px;margin:0 0 8px;line-height:1.5;">Sign in any time — we'll email you a one-click link, no password or codes.</p>
          <p style="margin:0 0 24px;"><a href="${loginUrl}" style="display:inline-block;background:#F5A524;color:#07070E;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;">Open Sign-In</a> &nbsp; <a href="${dashboardUrl}" style="color:#F5A524;font-size:14px;text-decoration:none;">Go to dashboard →</a></p>

          <p style="color:#6B6B7A;font-size:13px;margin:0 0 4px;">Next:</p>
          <p style="color:#A0A0B0;font-size:14px;margin:0 0 24px;line-height:1.5;">${escapeHtml(nextStepEn)}</p>

          <hr style="border:none;border-top:1px solid #2A2A3A;margin:24px 0;" />

          <p style="color:#6B6B7A;font-size:12px;margin:0 0 4px;">Optional API key (SDK / CLI use):</p>
          <p style="margin:0 0 6px;"><code style="background:#07070E;color:#F5A524;padding:8px 12px;border-radius:6px;font-size:12px;font-family:'Courier New',monospace;display:inline-block;word-break:break-all;">${escapeHtml(apiKey)}</code></p>
          <p style="color:#6B6B7A;font-size:11px;margin:0 0 24px;">Treat it like a password. Rotate from account settings anytime.</p>

          <p style="color:#6B6B7A;font-size:12px;margin:0;">Need help? <a href="${docsUrl}" style="color:#F5A524;text-decoration:none;">Docs</a> · <a href="${setupUrl}" style="color:#F5A524;text-decoration:none;">Provider setup</a></p>

          <hr style="border:none;border-top:1px solid #2A2A3A;margin:32px 0 24px;" />

          <h2 style="color:#E5E5E5;font-size:22px;font-weight:700;margin:0 0 8px;direction:rtl;text-align:right;">مرحبًا، ${escapeHtml(name)}</h2>
          <p style="color:#A0A0B0;font-size:15px;margin:0 0 24px;line-height:1.6;direction:rtl;text-align:right;">حسابك كـ <strong style="color:#E5E5E5;">${escapeHtml(roleLabelAr)}</strong> جاهز.</p>
          <p style="color:#A0A0B0;font-size:14px;margin:0 0 8px;line-height:1.6;direction:rtl;text-align:right;">سجّل دخولك في أي وقت — سنرسل لك رابطًا بنقرة واحدة، بدون كلمة سر أو رموز.</p>
          <p style="margin:0 0 24px;direction:rtl;text-align:right;"><a href="${loginUrl}" style="display:inline-block;background:#F5A524;color:#07070E;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;">تسجيل الدخول</a> &nbsp; <a href="${dashboardUrl}" style="color:#F5A524;font-size:14px;text-decoration:none;">فتح لوحة التحكم →</a></p>
          <p style="color:#A0A0B0;font-size:14px;margin:0 0 24px;line-height:1.6;direction:rtl;text-align:right;">${escapeHtml(nextStepAr)}</p>
          <p style="color:#6B6B7A;font-size:12px;margin:0;direction:rtl;text-align:right;">— فريق DCP</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
  };
}

function buildJobCompleteTemplate({ jobId, costSar, model, durationMinutes, providerEarningSar }) {
  const frontend = getFrontendUrl();
  const jobDetailUrl = `${frontend}/renter/jobs/${encodeURIComponent(String(jobId || ''))}`;
  const safeModel = model || 'General compute';
  const durationLabel = Number.isFinite(durationMinutes) ? `${durationMinutes} min` : 'N/A';
  const earningLabel = Number.isFinite(providerEarningSar) ? `${formatSar(providerEarningSar)} SAR` : 'N/A';
  const costLabel = formatSar(costSar);

  return {
    subject: `DCP Job #${jobId} completed — ${costLabel} SAR | اكتمل طلب DCP #${jobId}`,
    text: [
      `Your job #${jobId} is complete.`,
      `Model: ${safeModel}`,
      `Duration: ${durationLabel}`,
      `Cost: ${costLabel} SAR`,
      `Provider earning: ${earningLabel}`,
      `Job details: ${jobDetailUrl}`,
      '',
      `اكتمل الطلب #${jobId}.`,
      `النموذج: ${safeModel}`,
      `المدة: ${durationLabel}`,
      `التكلفة: ${costLabel} ريال`,
      `دخل المزود: ${earningLabel}`,
      `تفاصيل الطلب: ${jobDetailUrl}`,
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;color:#111;line-height:1.6">
        <h2>Job Completed</h2>
        <p>Your job <strong>#${escapeHtml(jobId)}</strong> has completed.</p>
        <ul>
          <li><strong>Model:</strong> ${escapeHtml(safeModel)}</li>
          <li><strong>Duration:</strong> ${escapeHtml(durationLabel)}</li>
          <li><strong>Cost:</strong> ${escapeHtml(costLabel)} SAR</li>
          <li><strong>Provider earning:</strong> ${escapeHtml(earningLabel)}</li>
        </ul>
        <p><a href="${jobDetailUrl}">View job details</a></p>
        <hr />
        <h2>اكتمل الطلب</h2>
        <p>تم اكتمال الطلب <strong>#${escapeHtml(jobId)}</strong>.</p>
        <ul>
          <li><strong>النموذج:</strong> ${escapeHtml(safeModel)}</li>
          <li><strong>المدة:</strong> ${escapeHtml(durationLabel)}</li>
          <li><strong>التكلفة:</strong> ${escapeHtml(costLabel)} ريال</li>
          <li><strong>دخل المزود:</strong> ${escapeHtml(earningLabel)}</li>
        </ul>
        <p><a href="${jobDetailUrl}">عرض تفاصيل الطلب</a></p>
      </div>
    `,
  };
}

function buildJobQueuedTemplate({
  jobId,
  jobType,
  imageType,
  quotedCostHalala,
  queuePosition,
  estimatedDurationMinutes,
}) {
  const frontend = getFrontendUrl();
  const jobDetailUrl = `${frontend}/renter/jobs/${encodeURIComponent(String(jobId || ''))}`;
  const quotedCostLabel = formatHalalaAsSar(quotedCostHalala);
  const queueLabel = Number.isFinite(Number(queuePosition)) ? String(Number(queuePosition)) : 'N/A';
  const durationLabel = Number.isFinite(Number(estimatedDurationMinutes))
    ? `${Number(estimatedDurationMinutes)} min`
    : 'N/A';
  const safeJobType = jobType || 'general';
  const safeImageType = imageType || 'default';
  const footer = notificationFooterText();

  const bodyEn = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 18px;line-height:1.5;">Your job <strong style="color:#E5E5E5;">#${escapeHtml(jobId)}</strong> has been accepted into the DCP queue.</p>
    ${brandMetaRows([
      { label: 'Job type', value: safeJobType },
      { label: 'Container image type', value: safeImageType },
      { label: 'Quoted cost', value: `${quotedCostLabel} SAR` },
      { label: 'Queue position', value: queueLabel },
      { label: 'Estimated duration', value: durationLabel },
    ])}
  `;
  const bodyAr = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 18px;line-height:1.6;">تم إدراج الطلب <strong style="color:#E5E5E5;">#${escapeHtml(jobId)}</strong> في طابور DCP.</p>
    ${brandMetaRows([
      { label: 'نوع المهمة', value: safeJobType },
      { label: 'نوع الحاوية', value: safeImageType },
      { label: 'التكلفة التقديرية', value: `${quotedCostLabel} ريال` },
      { label: 'ترتيب الطابور', value: queueLabel },
      { label: 'المدة التقديرية', value: durationLabel },
    ], { rtl: true })}
  `;

  return {
    subject: `Job queued on DCP — #${jobId} | تم إدراج الطلب في طابور DCP`,
    text: [
      `Your job #${jobId} has been queued on DCP.`,
      `Job type: ${safeJobType}`,
      `Container image type: ${safeImageType}`,
      `Quoted cost: ${quotedCostLabel} SAR`,
      `Queue position: ${queueLabel}`,
      `Estimated duration: ${durationLabel}`,
      `Track job: ${jobDetailUrl}`,
      '',
      `تم إدراج الطلب #${jobId} في طابور DCP.`,
      `نوع المهمة: ${safeJobType}`,
      `نوع الحاوية: ${safeImageType}`,
      `التكلفة التقديرية: ${quotedCostLabel} ريال`,
      `ترتيب الطابور: ${queueLabel}`,
      `المدة التقديرية: ${durationLabel}`,
      `متابعة الطلب: ${jobDetailUrl}`,
      '',
      footer,
    ].join('\n'),
    html: buildBrandShell({
      headlineEn: 'Job queued on DCP',
      headlineAr: 'تم إدراج الطلب في الطابور',
      bodyEn,
      bodyAr,
      ctaLabel: 'Track this job',
      ctaLabelAr: 'متابعة الطلب',
      ctaUrl: jobDetailUrl,
      footerEn: footer,
      footerAr: 'إدارة الإشعارات من dcp.sa/renter/settings',
    }),
  };
}

function buildJobStartedTemplate({
  jobId,
  jobType,
  imageType,
  estimatedDurationMinutes,
}) {
  const frontend = getFrontendUrl();
  const jobDetailUrl = `${frontend}/renter/jobs/${encodeURIComponent(String(jobId || ''))}`;
  const durationLabel = Number.isFinite(Number(estimatedDurationMinutes))
    ? `${Number(estimatedDurationMinutes)} min`
    : 'N/A';
  const safeJobType = jobType || 'general';
  const safeImageType = imageType || 'default';
  const footer = notificationFooterText();

  const bodyEn = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 18px;line-height:1.5;">Your job <strong style="color:#E5E5E5;">#${escapeHtml(jobId)}</strong> is now running on a DCP provider.</p>
    ${brandMetaRows([
      { label: 'Job type', value: safeJobType },
      { label: 'Container image type', value: safeImageType },
      { label: 'Estimated duration', value: durationLabel },
    ])}
  `;
  const bodyAr = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 18px;line-height:1.6;">الطلب <strong style="color:#E5E5E5;">#${escapeHtml(jobId)}</strong> قيد التنفيذ الآن على مزود DCP.</p>
    ${brandMetaRows([
      { label: 'نوع المهمة', value: safeJobType },
      { label: 'نوع الحاوية', value: safeImageType },
      { label: 'المدة التقديرية', value: durationLabel },
    ], { rtl: true })}
  `;

  return {
    subject: `Your DCP job has started — #${jobId} | بدأ تنفيذ طلبك على DCP`,
    text: [
      `Your job #${jobId} has started on a DCP provider.`,
      `Job type: ${safeJobType}`,
      `Container image type: ${safeImageType}`,
      `Estimated duration: ${durationLabel}`,
      `Track progress: ${jobDetailUrl}`,
      '',
      `بدأ تنفيذ الطلب #${jobId} على مزود في DCP.`,
      `نوع المهمة: ${safeJobType}`,
      `نوع الحاوية: ${safeImageType}`,
      `المدة التقديرية: ${durationLabel}`,
      `متابعة التنفيذ: ${jobDetailUrl}`,
      '',
      footer,
    ].join('\n'),
    html: buildBrandShell({
      headlineEn: 'Your job has started',
      headlineAr: 'بدأ تنفيذ الطلب',
      bodyEn,
      bodyAr,
      ctaLabel: 'Track progress',
      ctaLabelAr: 'متابعة التنفيذ',
      ctaUrl: jobDetailUrl,
      footerEn: footer,
      footerAr: 'إدارة الإشعارات من dcp.sa/renter/settings',
    }),
  };
}

function buildJobCompletedTemplate({
  jobId,
  actualCostHalala,
  gpuSecondsUsed,
  jobType,
  imageType,
}) {
  const frontend = getFrontendUrl();
  const jobDetailUrl = `${frontend}/renter/jobs/${encodeURIComponent(String(jobId || ''))}`;
  const costLabel = formatHalalaAsSar(actualCostHalala);
  const gpuSecondsLabel = Number.isFinite(Number(gpuSecondsUsed)) ? String(Number(gpuSecondsUsed)) : 'N/A';
  const safeJobType = jobType || 'general';
  const safeImageType = imageType || 'default';
  const footer = notificationFooterText();

  const bodyEn = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 18px;line-height:1.5;">Your job <strong style="color:#E5E5E5;">#${escapeHtml(jobId)}</strong> is complete and results are ready.</p>
    ${brandMetaRows([
      { label: 'Job type', value: safeJobType },
      { label: 'Container image type', value: safeImageType },
      { label: 'Actual cost', value: `${costLabel} SAR` },
      { label: 'GPU seconds used', value: gpuSecondsLabel },
    ])}
  `;
  const bodyAr = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 18px;line-height:1.6;">تم اكتمال الطلب <strong style="color:#E5E5E5;">#${escapeHtml(jobId)}</strong> والنتائج جاهزة.</p>
    ${brandMetaRows([
      { label: 'نوع المهمة', value: safeJobType },
      { label: 'نوع الحاوية', value: safeImageType },
      { label: 'التكلفة الفعلية', value: `${costLabel} ريال` },
      { label: 'ثواني GPU المستخدمة', value: gpuSecondsLabel },
    ], { rtl: true })}
  `;

  return {
    subject: `Job complete — results ready (#${jobId}) | اكتمل الطلب والنتائج جاهزة`,
    text: [
      `Your job #${jobId} is complete and results are ready.`,
      `Job type: ${safeJobType}`,
      `Container image type: ${safeImageType}`,
      `Actual cost: ${costLabel} SAR`,
      `GPU seconds used: ${gpuSecondsLabel}`,
      `Open results: ${jobDetailUrl}`,
      '',
      `اكتمل الطلب #${jobId} والنتائج جاهزة.`,
      `نوع المهمة: ${safeJobType}`,
      `نوع الحاوية: ${safeImageType}`,
      `التكلفة الفعلية: ${costLabel} ريال`,
      `ثواني GPU المستخدمة: ${gpuSecondsLabel}`,
      `عرض النتائج: ${jobDetailUrl}`,
      '',
      footer,
    ].join('\n'),
    html: buildBrandShell({
      headlineEn: 'Job complete — results ready',
      headlineAr: 'اكتمل الطلب والنتائج جاهزة',
      bodyEn,
      bodyAr,
      ctaLabel: 'Open results',
      ctaLabelAr: 'عرض النتائج',
      ctaUrl: jobDetailUrl,
      footerEn: footer,
      footerAr: 'إدارة الإشعارات من dcp.sa/renter/settings',
    }),
  };
}

function buildJobFailedTemplate({
  jobId,
  lastError,
  refundedAmountHalala,
  retryAttempts,
}) {
  const frontend = getFrontendUrl();
  const jobDetailUrl = `${frontend}/renter/jobs/${encodeURIComponent(String(jobId || ''))}`;
  const refundLabel = formatHalalaAsSar(refundedAmountHalala);
  const retryLabel = Number.isFinite(Number(retryAttempts)) ? String(Number(retryAttempts)) : '0';
  const safeError = lastError || 'No additional error details reported.';
  const footer = notificationFooterText();

  const bodyEn = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 18px;line-height:1.5;">Your job <strong style="color:#E5E5E5;">#${escapeHtml(jobId)}</strong> failed. Your balance has been fully refunded.</p>
    ${brandMetaRows([
      { label: 'Last error', value: safeError },
      { label: 'Refunded amount', value: `${refundLabel} SAR` },
      { label: 'Retry attempts', value: retryLabel },
    ])}
  `;
  const bodyAr = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 18px;line-height:1.6;">الطلب <strong style="color:#E5E5E5;">#${escapeHtml(jobId)}</strong> فشل وتم رد الرصيد بالكامل.</p>
    ${brandMetaRows([
      { label: 'آخر خطأ', value: safeError },
      { label: 'المبلغ المرتجع', value: `${refundLabel} ريال` },
      { label: 'عدد المحاولات', value: retryLabel },
    ], { rtl: true })}
  `;

  return {
    subject: `Job failed — funds refunded (#${jobId}) | فشل الطلب وتم رد المبلغ`,
    text: [
      `Your job #${jobId} failed and funds were refunded.`,
      `Last error: ${safeError}`,
      `Refunded amount: ${refundLabel} SAR`,
      `Retry attempts: ${retryLabel}`,
      `Job details: ${jobDetailUrl}`,
      '',
      `فشل الطلب #${jobId} وتم رد المبلغ.`,
      `آخر خطأ: ${safeError}`,
      `المبلغ المرتجع: ${refundLabel} ريال`,
      `عدد محاولات إعادة التشغيل: ${retryLabel}`,
      `تفاصيل الطلب: ${jobDetailUrl}`,
      '',
      footer,
    ].join('\n'),
    html: buildBrandShell({
      headlineEn: 'Job failed — funds refunded',
      headlineAr: 'فشل الطلب وتم رد المبلغ',
      bodyEn,
      bodyAr,
      ctaLabel: 'View job details',
      ctaLabelAr: 'عرض تفاصيل الطلب',
      ctaUrl: jobDetailUrl,
      footerEn: footer,
      footerAr: 'إدارة الإشعارات من dcp.sa/renter/settings',
    }),
  };
}

function buildWithdrawalApprovedTemplate({ amountSar }) {
  const amountLabel = formatSar(amountSar);
  const frontend = getFrontendUrl();
  const earningsUrl = `${frontend}/provider/earnings`;
  const bodyEn = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 18px;line-height:1.5;">Your withdrawal of <strong style="color:#E5E5E5;">${escapeHtml(amountLabel)} SAR</strong> has been approved and queued for processing.</p>
    ${brandMetaRows([
      { label: 'Amount', value: `${amountLabel} SAR` },
      { label: 'Expected processing time', value: '3-5 business days' },
    ])}
  `;
  const bodyAr = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 18px;line-height:1.6;">تمت الموافقة على السحب بقيمة <strong style="color:#E5E5E5;">${escapeHtml(amountLabel)} ريال</strong> وهو الآن قيد المعالجة.</p>
    ${brandMetaRows([
      { label: 'المبلغ', value: `${amountLabel} ريال` },
      { label: 'المدة المتوقعة', value: 'من 3 إلى 5 أيام عمل' },
    ], { rtl: true })}
  `;
  return {
    subject: `DCP: Withdrawal of ${amountLabel} SAR approved | تمت الموافقة على السحب`,
    text: [
      `Your withdrawal request for ${amountLabel} SAR has been approved.`,
      'Expected processing time: 3-5 business days.',
      `Earnings: ${earningsUrl}`,
      '',
      `تمت الموافقة على طلب السحب بمبلغ ${amountLabel} ريال.`,
      'المدة المتوقعة للتحويل: من 3 إلى 5 أيام عمل.',
    ].join('\n'),
    html: buildBrandShell({
      headlineEn: 'Withdrawal approved',
      headlineAr: 'تمت الموافقة على السحب',
      bodyEn,
      bodyAr,
      ctaLabel: 'View earnings',
      ctaLabelAr: 'عرض الأرباح',
      ctaUrl: earningsUrl,
    }),
  };
}

function buildWithdrawalRejectedTemplate({ amountSar, reason }) {
  const amountLabel = formatSar(amountSar);
  const safeReason = (reason || '').trim() || 'Not specified';
  const safeReasonAr = (reason || '').trim() || 'غير محدد';
  const frontend = getFrontendUrl();
  const earningsUrl = `${frontend}/provider/earnings`;
  const bodyEn = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 18px;line-height:1.5;">Your withdrawal request for <strong style="color:#E5E5E5;">${escapeHtml(amountLabel)} SAR</strong> was rejected. The amount has been returned to your DCP balance.</p>
    ${brandMetaRows([
      { label: 'Amount', value: `${amountLabel} SAR` },
      { label: 'Reason', value: safeReason },
    ])}
  `;
  const bodyAr = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 18px;line-height:1.6;">تم رفض طلب السحب بقيمة <strong style="color:#E5E5E5;">${escapeHtml(amountLabel)} ريال</strong>. تمت إعادة المبلغ إلى رصيدك في DCP.</p>
    ${brandMetaRows([
      { label: 'المبلغ', value: `${amountLabel} ريال` },
      { label: 'السبب', value: safeReasonAr },
    ], { rtl: true })}
  `;
  return {
    subject: `DCP: Withdrawal of ${amountLabel} SAR rejected | تم رفض طلب السحب`,
    text: [
      `Your withdrawal request for ${amountLabel} SAR was rejected.`,
      `Reason: ${safeReason}`,
      'The amount has been returned to your DCP balance.',
      `Earnings: ${earningsUrl}`,
      '',
      `تم رفض طلب السحب بمبلغ ${amountLabel} ريال.`,
      `السبب: ${safeReasonAr}`,
      'تمت إعادة المبلغ إلى رصيدك في DCP.',
    ].join('\n'),
    html: buildBrandShell({
      headlineEn: 'Withdrawal rejected',
      headlineAr: 'تم رفض طلب السحب',
      bodyEn,
      bodyAr,
      ctaLabel: 'Open earnings',
      ctaLabelAr: 'فتح الأرباح',
      ctaUrl: earningsUrl,
    }),
  };
}

// ─── Provider node offline (backlog gap #1) ─────────────────────────────────
// Sent on the online→offline transition so a provider whose node went dark
// hears about it immediately instead of silently not earning ("Node-2 stayed
// dark for days"). Includes the node name, last-seen time, and a link to the
// provider dashboard + troubleshooting docs.
function buildProviderOfflineTemplate({ providerName, lastSeen }) {
  const frontend = getFrontendUrl();
  const dashboardUrl = `${frontend}/provider`;
  const troubleshootUrl = `${frontend}/docs/provider/troubleshooting`;
  const safeName = (providerName || '').trim() || 'your node';
  const lastSeenLabel = lastSeen
    ? new Date(lastSeen).toUTCString()
    : 'no heartbeat on record';
  const lastSeenLabelAr = lastSeen
    ? new Date(lastSeen).toUTCString()
    : 'لا يوجد نبض مسجّل';

  const bodyEn = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 14px;line-height:1.5;">We stopped receiving heartbeats from <strong style="color:#E5E5E5;">${escapeHtml(safeName)}</strong>, so we've marked it offline. While it's offline it isn't accepting jobs — <strong style="color:#E5E5E5;">you've stopped earning</strong>.</p>
    <p style="color:#FFB95C;font-size:13px;margin:0 0 18px;font-weight:500;">Any job that was running on this node has been safely requeued to another provider, so renters are not affected.</p>
    ${brandMetaRows([
      { label: 'Node', value: safeName },
      { label: 'Last seen', value: lastSeenLabel },
      { label: 'Status', value: 'Offline — not earning' },
    ])}
    <p style="color:#A0A0B0;font-size:13px;margin:14px 0 0;line-height:1.5;">Common fixes: make sure the machine is powered on and online, confirm the DCP provider app / daemon is running, and check the dashboard for the live status. It will come back automatically once heartbeats resume.</p>
  `;
  const bodyAr = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 14px;line-height:1.6;">توقّفنا عن استقبال نبضات من <strong style="color:#E5E5E5;">${escapeHtml(safeName)}</strong>، لذلك تم تعيينه دون اتصال. أثناء عدم الاتصال لا يقبل الجهاز أي مهام — <strong style="color:#E5E5E5;">لقد توقّفت عن الكسب</strong>.</p>
    <p style="color:#FFB95C;font-size:13px;margin:0 0 18px;direction:rtl;text-align:right;font-weight:500;">أي مهمة كانت قيد التنفيذ على هذا الجهاز تمت إعادة جدولتها بأمان إلى مزود آخر، لذا لم يتأثر المستأجرون.</p>
    ${brandMetaRows([
      { label: 'الجهاز', value: safeName },
      { label: 'آخر اتصال', value: lastSeenLabelAr },
      { label: 'الحالة', value: 'غير متصل — لا كسب' },
    ], { rtl: true })}
    <p style="color:#A0A0B0;font-size:13px;margin:14px 0 0;line-height:1.6;direction:rtl;text-align:right;">حلول شائعة: تأكّد أن الجهاز يعمل ومتصل بالإنترنت، وأن تطبيق/خدمة مزوّد DCP قيد التشغيل، وراجع لوحة التحكم. سيعود تلقائياً بمجرد استئناف النبضات.</p>
  `;
  return {
    subject: `Your DCP node is offline — you've stopped earning | جهازك في DCP غير متصل`,
    text: [
      `${safeName} is offline — DCP stopped receiving heartbeats, so you've stopped earning.`,
      `Last seen: ${lastSeenLabel}`,
      `Any running job was safely requeued to another provider.`,
      `Bring it back: ${dashboardUrl}`,
      `Troubleshooting: ${troubleshootUrl}`,
      '',
      `${safeName} غير متصل — توقّف DCP عن استقبال النبضات، لذلك توقّفت عن الكسب.`,
      `آخر اتصال: ${lastSeenLabelAr}`,
      `تمت إعادة جدولة أي مهمة قيد التنفيذ بأمان إلى مزود آخر.`,
      `أعده للعمل: ${dashboardUrl}`,
    ].join('\n'),
    html: buildBrandShell({
      headlineEn: 'Your node is offline',
      headlineAr: 'جهازك غير متصل',
      bodyEn,
      bodyAr,
      ctaLabel: 'Open provider dashboard',
      ctaLabelAr: 'فتح لوحة المزوّد',
      ctaUrl: dashboardUrl,
    }),
  };
}

// ─── Auto-top-up emails (PR #427 follow-up) ─────────────────────────────────

function buildAutoTopupPaidTemplate({ amountSar, newBalanceSar, cardBrand, cardLast4 }) {
  const amountLabel = formatSar(amountSar);
  const balanceLabel = formatSar(newBalanceSar);
  const brandLabel = (cardBrand || 'Card').replace(/^./, (c) => c.toUpperCase());
  const cardLabel = cardLast4 ? `${brandLabel} •••• ${escapeHtml(cardLast4)}` : brandLabel;
  const frontend = getFrontendUrl();
  const billingUrl = `${frontend}/renter/billing`;

  const bodyEn = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 18px;line-height:1.5;">Your balance dropped below your auto-top-up threshold so we recharged your DCP balance using <strong style="color:#E5E5E5;">${escapeHtml(cardLabel)}</strong>.</p>
    ${brandMetaRows([
      { label: 'Amount charged', value: `${amountLabel} SAR` },
      { label: 'New balance', value: `${balanceLabel} SAR` },
      { label: 'Card', value: cardLabel },
    ])}
  `;
  const bodyAr = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 18px;line-height:1.6;">انخفض رصيدك دون حدّ الشحن التلقائي فقمنا بإعادة شحن رصيدك في DCP باستخدام <strong style="color:#E5E5E5;">${escapeHtml(cardLabel)}</strong>.</p>
    ${brandMetaRows([
      { label: 'المبلغ المخصوم', value: `${amountLabel} ريال` },
      { label: 'الرصيد الجديد', value: `${balanceLabel} ريال` },
      { label: 'البطاقة', value: cardLabel },
    ], { rtl: true })}
  `;
  return {
    subject: `Receipt: ${amountLabel} SAR DCP auto-top-up | إيصال الشحن التلقائي`,
    text: [
      `Your DCP balance was auto-recharged by ${amountLabel} SAR.`,
      `Card: ${cardLabel}`,
      `New balance: ${balanceLabel} SAR`,
      `Manage auto-top-up: ${billingUrl}`,
      '',
      `تمت إعادة شحن رصيدك في DCP تلقائياً بمبلغ ${amountLabel} ريال.`,
      `البطاقة: ${cardLabel}`,
      `الرصيد الجديد: ${balanceLabel} ريال`,
    ].join('\n'),
    html: buildBrandShell({
      headlineEn: 'Balance auto-topped up',
      headlineAr: 'تمت إعادة الشحن تلقائياً',
      bodyEn,
      bodyAr,
      ctaLabel: 'Manage auto-top-up',
      ctaLabelAr: 'إدارة الشحن التلقائي',
      ctaUrl: billingUrl,
    }),
  };
}

function buildAutoTopupFailedTemplate({ amountSar, reason, consecutiveFailures, pausedUntil, cardBrand, cardLast4 }) {
  const amountLabel = formatSar(amountSar);
  const brandLabel = (cardBrand || 'Card').replace(/^./, (c) => c.toUpperCase());
  const cardLabel = cardLast4 ? `${brandLabel} •••• ${escapeHtml(cardLast4)}` : brandLabel;
  const reasonLabel = (reason || '').trim() || 'Card declined';
  const frontend = getFrontendUrl();
  const billingUrl = `${frontend}/renter/billing`;
  const pausedNote = pausedUntil
    ? `<p style="color:#FF7A7A;font-size:13px;margin:0 0 18px;">Auto-top-up paused until ${escapeHtml(new Date(pausedUntil).toUTCString())} after ${consecutiveFailures} consecutive failures.</p>`
    : '';
  const pausedNoteAr = pausedUntil
    ? `<p style="color:#FF7A7A;font-size:13px;margin:0 0 18px;direction:rtl;text-align:right;">تم إيقاف الشحن التلقائي حتى ${escapeHtml(new Date(pausedUntil).toUTCString())} بعد ${consecutiveFailures} محاولات فاشلة.</p>`
    : '';

  const last4Tail = cardLast4 ? ` ••${escapeHtml(cardLast4)}` : '';
  const bodyEn = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 14px;line-height:1.5;">We tried to charge <strong style="color:#E5E5E5;">${escapeHtml(cardLabel)}</strong> for ${amountLabel} SAR to recharge your DCP balance, but the bank declined.</p>
    <p style="color:#7DD8C0;font-size:13px;margin:0 0 18px;font-weight:500;">Your DCP balance was not charged. Jobs will continue to run from your current balance until it&rsquo;s exhausted.</p>
    ${pausedNote}
    ${brandMetaRows([
      { label: 'Attempted amount', value: `${amountLabel} SAR` },
      { label: 'Card', value: cardLabel },
      { label: 'Bank reason', value: reasonLabel },
    ])}
    <p style="color:#A0A0B0;font-size:13px;margin:14px 0 0;">Common fixes: update the card details, contact your bank to lift a hold, or top up manually for now.</p>
  `;
  const bodyAr = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 14px;line-height:1.6;">حاولنا خصم ${amountLabel} ريال من <strong style="color:#E5E5E5;">${escapeHtml(cardLabel)}</strong> لإعادة شحن رصيدك في DCP، لكن البنك رفض العملية.</p>
    <p style="color:#7DD8C0;font-size:13px;margin:0 0 18px;direction:rtl;text-align:right;font-weight:500;">لم يُخصم من رصيد DCP. ستستمر مهامك بالعمل من رصيدك الحالي حتى نفاده.</p>
    ${pausedNoteAr}
    ${brandMetaRows([
      { label: 'المبلغ', value: `${amountLabel} ريال` },
      { label: 'البطاقة', value: cardLabel },
      { label: 'السبب من البنك', value: reasonLabel },
    ], { rtl: true })}
  `;
  return {
    subject: `Auto-top-up declined${last4Tail} — ${amountLabel} SAR not charged | تم رفض الشحن التلقائي`,
    text: [
      `Auto-top-up of ${amountLabel} SAR was declined by your bank.`,
      `Your DCP balance was NOT charged.`,
      `Card: ${cardLabel}`,
      `Bank reason: ${reasonLabel}`,
      pausedUntil ? `Auto-top-up paused until: ${new Date(pausedUntil).toUTCString()}` : '',
      `Update card: ${billingUrl}`,
    ].filter(Boolean).join('\n'),
    html: buildBrandShell({
      headlineEn: 'Auto-top-up failed',
      headlineAr: 'فشل الشحن التلقائي',
      bodyEn,
      bodyAr,
      ctaLabel: 'Update card',
      ctaLabelAr: 'تحديث البطاقة',
      ctaUrl: billingUrl,
    }),
  };
}

function buildAutoTopup3dsRequiredTemplate({ amountSar, verificationUrl, cardBrand, cardLast4 }) {
  const amountLabel = formatSar(amountSar);
  const brandLabel = (cardBrand || 'Card').replace(/^./, (c) => c.toUpperCase());
  const cardLabel = cardLast4 ? `${brandLabel} •••• ${escapeHtml(cardLast4)}` : brandLabel;
  const frontend = getFrontendUrl();
  const ctaUrl = verificationUrl || `${frontend}/renter/billing`;

  const bodyEn = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 14px;line-height:1.5;">To finish recharging your DCP balance with <strong style="color:#E5E5E5;">${escapeHtml(cardLabel)}</strong>, your bank needs you to complete 3D Secure verification.</p>
    <p style="color:#FFB95C;font-size:13px;margin:0 0 18px;font-weight:500;">Verification links typically expire in 15&ndash;30 minutes — please complete it soon, otherwise your DCP balance won&rsquo;t be topped up and the next inference job may hit the insufficient-balance gate.</p>
    ${brandMetaRows([
      { label: 'Amount', value: `${amountLabel} SAR` },
      { label: 'Card', value: cardLabel },
    ])}
  `;
  const bodyAr = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 14px;line-height:1.6;">لإتمام شحن رصيدك في DCP باستخدام <strong style="color:#E5E5E5;">${escapeHtml(cardLabel)}</strong>، يطلب البنك التحقّق عبر 3D Secure.</p>
    <p style="color:#FFB95C;font-size:13px;margin:0 0 18px;direction:rtl;text-align:right;font-weight:500;">عادةً ما تنتهي صلاحية رابط التحقّق خلال ١٥&ndash;٣٠ دقيقة — يُرجى إتمام التحقّق قريباً وإلا لن يُشحن رصيدك وقد ترفض المهمة التالية.</p>
    ${brandMetaRows([
      { label: 'المبلغ', value: `${amountLabel} ريال` },
      { label: 'البطاقة', value: cardLabel },
    ], { rtl: true })}
  `;
  return {
    subject: `Action needed: verify ${amountLabel} SAR auto-top-up | تحقّق مطلوب`,
    text: [
      `Your auto-top-up of ${amountLabel} SAR needs 3D Secure verification.`,
      `Verification links expire in ~15-30 minutes.`,
      `Card: ${cardLabel}`,
      `Verify: ${ctaUrl}`,
    ].join('\n'),
    html: buildBrandShell({
      headlineEn: 'Verify your auto-top-up',
      headlineAr: 'يرجى التحقّق من الشحن',
      bodyEn,
      bodyAr,
      ctaLabel: 'Verify with bank',
      ctaLabelAr: 'تحقّق الآن',
      ctaUrl,
    }),
  };
}

function buildDataExportReadyTemplate({ accountType, requestedAt, deliveryMode }) {
  const safeAccountType = accountType === 'provider' ? 'provider' : 'renter';
  const requestedLabel = requestedAt || new Date().toISOString();
  const isDirect = deliveryMode === 'direct';
  const frontend = getFrontendUrl();
  const settingsUrl = `${frontend}/${safeAccountType}/settings`;
  const deliveryText = isDirect
    ? 'Your export was delivered directly in the API response.'
    : 'Your export is ready for download from your account settings.';
  const deliveryTextAr = isDirect
    ? 'تم تسليم التصدير مباشرة في استجابة واجهة API.'
    : 'تصدير بياناتك جاهز للتنزيل من صفحة الإعدادات.';

  const bodyEn = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 18px;line-height:1.5;">We received your PDPL data export request for your <strong style="color:#E5E5E5;">${escapeHtml(safeAccountType)}</strong> account.</p>
    ${brandMetaRows([
      { label: 'Requested at', value: requestedLabel },
      { label: 'Account type', value: safeAccountType },
      { label: 'Status', value: deliveryText },
    ])}
  `;
  const bodyAr = `
    <p style="color:#A0A0B0;font-size:14px;margin:0 0 18px;line-height:1.6;">تم استلام طلب تصدير البيانات (PDPL) لحساب <strong style="color:#E5E5E5;">${escapeHtml(safeAccountType)}</strong>.</p>
    ${brandMetaRows([
      { label: 'وقت الطلب', value: requestedLabel },
      { label: 'نوع الحساب', value: safeAccountType },
      { label: 'الحالة', value: deliveryTextAr },
    ], { rtl: true })}
  `;

  return {
    subject: 'DCP data export request received | تم استلام طلب تصدير البيانات',
    text: [
      `We received your PDPL data export request (${safeAccountType}).`,
      `Requested at: ${requestedLabel}`,
      deliveryText,
      `Settings: ${settingsUrl}`,
      '',
      `تم استلام طلب تصدير البيانات وفق PDPL (${safeAccountType}).`,
      `وقت الطلب: ${requestedLabel}`,
      deliveryTextAr,
      `الإعدادات: ${settingsUrl}`,
    ].join('\n'),
    html: buildBrandShell({
      headlineEn: 'Data export request received',
      headlineAr: 'تم استلام طلب تصدير البيانات',
      bodyEn,
      bodyAr,
      ctaLabel: 'Open account settings',
      ctaLabelAr: 'فتح الإعدادات',
      ctaUrl: settingsUrl,
    }),
  };
}

async function sendWelcomeEmail(to, name, apiKey, role) {
  if (!to || !name || !apiKey) {
    return { ok: false, reason: 'invalid_arguments' };
  }

  const template = buildWelcomeTemplate({
    name,
    apiKey,
    role: role === 'provider' ? 'provider' : 'renter',
  });

  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

async function sendWithdrawalApprovedEmail(to, amountSar) {
  if (!to) {
    return { ok: false, reason: 'invalid_arguments' };
  }

  const template = buildWithdrawalApprovedTemplate({ amountSar });
  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

async function sendWithdrawalRejectedEmail(to, amountSar, reason) {
  if (!to) {
    return { ok: false, reason: 'invalid_arguments' };
  }

  const template = buildWithdrawalRejectedTemplate({ amountSar, reason });
  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

async function sendProviderOfflineEmail(to, data = {}) {
  if (!to) {
    return { ok: false, reason: 'invalid_arguments' };
  }
  const template = buildProviderOfflineTemplate({
    providerName: data.provider_name,
    lastSeen: data.last_seen,
  });
  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

async function sendJobQueued(to, data = {}) {
  if (!to || !data.job_id) {
    return { ok: false, reason: 'invalid_arguments' };
  }
  const template = buildJobQueuedTemplate({
    jobId: data.job_id,
    jobType: data.job_type,
    imageType: data.image_type,
    quotedCostHalala: data.quoted_cost_halala,
    queuePosition: data.queue_position,
    estimatedDurationMinutes: data.estimated_duration_minutes,
  });
  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

async function sendJobStarted(to, data = {}) {
  if (!to || !data.job_id) {
    return { ok: false, reason: 'invalid_arguments' };
  }
  const template = buildJobStartedTemplate({
    jobId: data.job_id,
    jobType: data.job_type,
    imageType: data.image_type,
    estimatedDurationMinutes: data.estimated_duration_minutes,
  });
  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

async function sendJobCompleted(to, data = {}) {
  if (!to || !data.job_id) {
    return { ok: false, reason: 'invalid_arguments' };
  }
  const template = buildJobCompletedTemplate({
    jobId: data.job_id,
    actualCostHalala: data.actual_cost_halala,
    gpuSecondsUsed: data.gpu_seconds_used,
    jobType: data.job_type,
    imageType: data.image_type,
  });
  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

async function sendJobFailed(to, data = {}) {
  if (!to || !data.job_id) {
    return { ok: false, reason: 'invalid_arguments' };
  }
  const template = buildJobFailedTemplate({
    jobId: data.job_id,
    lastError: data.last_error,
    refundedAmountHalala: data.refunded_amount_halala,
    retryAttempts: data.retry_attempts,
  });
  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

async function sendDataExportReady(to, data = {}) {
  if (!to) {
    return { ok: false, reason: 'invalid_arguments' };
  }
  const template = buildDataExportReadyTemplate({
    accountType: data.accountType,
    requestedAt: data.requestedAt,
    deliveryMode: data.deliveryMode,
  });
  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

// Backward compatibility for existing callers
async function sendJobCompleteEmail(to, jobId, costSar, model, details = {}) {
  return sendJobCompleted(to, {
    job_id: jobId,
    actual_cost_halala: Math.round(toSafeNumber(costSar, 0) * 100),
    gpu_seconds_used: details.gpuSecondsUsed,
    job_type: model || details.jobType,
    image_type: details.imageType,
  });
}

async function sendAutoTopupPaidEmail(to, data = {}) {
  if (!to) return { ok: false, reason: 'invalid_arguments' };
  const template = buildAutoTopupPaidTemplate({
    amountSar: data.amount_sar,
    newBalanceSar: data.new_balance_sar,
    cardBrand: data.card_brand,
    cardLast4: data.card_last4,
  });
  return sendEmail({ to, subject: template.subject, html: template.html, text: template.text });
}

async function sendAutoTopupFailedEmail(to, data = {}) {
  if (!to) return { ok: false, reason: 'invalid_arguments' };
  const template = buildAutoTopupFailedTemplate({
    amountSar: data.amount_sar,
    reason: data.reason,
    consecutiveFailures: data.consecutive_failures,
    pausedUntil: data.paused_until,
    cardBrand: data.card_brand,
    cardLast4: data.card_last4,
  });
  return sendEmail({ to, subject: template.subject, html: template.html, text: template.text });
}

async function sendAutoTopup3dsRequiredEmail(to, data = {}) {
  if (!to) return { ok: false, reason: 'invalid_arguments' };
  const template = buildAutoTopup3dsRequiredTemplate({
    amountSar: data.amount_sar,
    verificationUrl: data.verification_url,
    cardBrand: data.card_brand,
    cardLast4: data.card_last4,
  });
  return sendEmail({ to, subject: template.subject, html: template.html, text: template.text });
}

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendJobQueued,
  sendJobStarted,
  sendJobCompleted,
  sendJobFailed,
  sendJobCompleteEmail,
  sendWithdrawalApprovedEmail,
  sendWithdrawalRejectedEmail,
  sendProviderOfflineEmail,
  sendDataExportReady,
  sendAutoTopupPaidEmail,
  sendAutoTopupFailedEmail,
  sendAutoTopup3dsRequiredEmail,
};

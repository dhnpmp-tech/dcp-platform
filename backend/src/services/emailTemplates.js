'use strict';

/**
 * emailTemplates.js — every transactional email template, rendered through
 * the shared editorial-dark shell in emailLayout.js. Pure functions: each
 * build*Template returns { subject, text, html } and never sends anything.
 * Sending lives in emailService.js.
 */

const {
  renderEmail,
  escapeHtml,
  COLORS,
  FONTS,
} = require('./emailLayout');

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
  return 'Manage notifications at dcp.sa/v2/renter/settings';
}

// Why-you-got-this footer lines for renter job/billing notifications.
const WHY_RENTER_NOTIFICATIONS_EN =
  'You are receiving this because notifications are enabled for your DCP renter account. Manage notifications at dcp.sa/v2/renter/settings.';
const WHY_RENTER_NOTIFICATIONS_AR =
  'تصلك هذه الرسالة لأن الإشعارات مفعّلة لحسابك في DCP. إدارة الإشعارات من dcp.sa/v2/renter/settings.';
const WHY_PROVIDER_EN =
  'You are receiving this because you operate a provider node on dcp.sa.';
const WHY_PROVIDER_AR =
  'تصلك هذه الرسالة لأنك تشغّل جهاز مزوّد على dcp.sa.';

// ── Body paragraph helpers (inline-styled, EN LTR / AR RTL) ────────────────

function pEn(html) {
  return `<p style="font-family:${FONTS.body};font-size:14px;line-height:1.65;color:${COLORS.text1};margin:0 0 18px;">${html}</p>`;
}

function pAr(html) {
  return `<p dir="rtl" style="font-family:${FONTS.body};font-size:14px;line-height:1.8;color:${COLORS.text1};margin:0 0 18px;text-align:right;direction:rtl;">${html}</p>`;
}

// Small semantic note (amber = attention, teal = reassurance).
function noteEn(html, tone = 'amber') {
  const color = tone === 'teal' ? COLORS.teal : COLORS.amber;
  return `<p style="font-family:${FONTS.body};font-size:13px;line-height:1.6;color:${color};margin:0 0 18px;">${html}</p>`;
}

function noteAr(html, tone = 'amber') {
  const color = tone === 'teal' ? COLORS.teal : COLORS.amber;
  return `<p dir="rtl" style="font-family:${FONTS.body};font-size:13px;line-height:1.75;color:${color};margin:0 0 18px;text-align:right;direction:rtl;">${html}</p>`;
}

function strong(text) {
  return `<strong style="color:${COLORS.text};font-weight:600;">${escapeHtml(text)}</strong>`;
}

// ── Welcome ─────────────────────────────────────────────────────────────────
// SECURITY: the API key is deliberately NOT included in this email (or its
// plain-text part). Email is a long-lived, often-forwarded medium; the key is
// viewable after sign-in instead.
function buildWelcomeTemplate({ name, email, role }) {
  const frontend = getFrontendUrl();
  const isProvider = role === 'provider';
  const dashboardUrl = `${frontend}${isProvider ? '/v2/provider' : '/v2/renter/marketplace'}`;
  const authUrl = `${frontend}/v2/auth`;
  const docsUrl = `${frontend}/docs`;
  const roleLabel = isProvider ? 'Provider' : 'Renter';
  const roleLabelAr = isProvider ? 'مزود' : 'مستأجر';
  const nextStepEn = isProvider
    ? 'Open the dashboard to verify your provider app is online, see live earnings, and download the tray app for your OS.'
    : 'Open the marketplace to pick a model, top up if needed, and run your first inference call.';
  const nextStepAr = isProvider
    ? 'افتح لوحة التحكم للتحقق من اتصال تطبيق المزوّد، ومتابعة الأرباح، وتنزيل تطبيق الشريط لنظامك.'
    : 'افتح السوق لاختيار نموذج، اشحن رصيدك إذا لزم الأمر، وشغّل أول طلب استدلال.';

  const bodyEnHtml = [
    pEn(`Your ${strong(roleLabel)} account is ready. Sign-in is passwordless — we email you a one-time link each time.`),
    pEn(`For security, your API key is not included in this email. Sign in to view or rotate it from your account settings.`),
    pEn(escapeHtml(nextStepEn)),
  ].join('');
  const bodyArHtml = [
    pAr(`حسابك كـ ${strong(roleLabelAr)} جاهز. تسجيل الدخول بدون كلمة سر — نرسل لك رابطًا لمرة واحدة في كل مرة.`),
    pAr('لأسباب أمنية، لا يتضمن هذا البريد مفتاح API. سجّل الدخول لعرضه أو تدويره من إعدادات الحساب.'),
    pAr(escapeHtml(nextStepAr)),
  ].join('');

  return {
    subject: `Welcome to DCP, ${name} | مرحباً بك في DCP`,
    text: [
      `Welcome to DCP, ${name}.`,
      '',
      `Your ${roleLabel} account is ready.`,
      '',
      'For security, your API key is not included in this email.',
      `Sign in to view your key: ${authUrl}`,
      '',
      `Dashboard: ${dashboardUrl}`,
      `Docs: ${docsUrl}`,
      '',
      nextStepEn,
      '',
      '— The DCP team — dcp.sa',
      '',
      '----',
      '',
      `مرحباً بك في DCP، ${name}.`,
      '',
      `حسابك كـ ${roleLabelAr} جاهز.`,
      '',
      'لأسباب أمنية، لا يتضمن هذا البريد مفتاح API.',
      `سجّل الدخول لعرض المفتاح: ${authUrl}`,
      '',
      nextStepAr,
      '',
      '— فريق DCP',
    ].join('\n'),
    html: renderEmail({
      preheader: `Your ${roleLabel} account is ready. Sign in to view your API key.`,
      labelEn: 'Account ready',
      labelAr: 'الحساب جاهز',
      headlineEn: `Welcome, ${name}`,
      headlineAr: `مرحبًا، ${name}`,
      bodyEnHtml,
      bodyArHtml,
      factRows: [
        { k: 'Account', v: email || name, kAr: 'الحساب', vAr: email || name },
        { k: 'Role', v: roleLabel, kAr: 'الدور', vAr: roleLabelAr },
        { k: 'API key', v: 'Available after sign-in', kAr: 'مفتاح API', vAr: 'متاح بعد تسجيل الدخول' },
      ],
      cta: {
        label: 'Sign in to view your key',
        labelAr: 'سجّل الدخول لعرض المفتاح',
        url: authUrl,
      },
      whyEn: `You are receiving this because this address registered as a ${roleLabel.toLowerCase()} on dcp.sa.`,
      whyAr: `تصلك هذه الرسالة لأن هذا البريد سُجّل كـ${roleLabelAr} على dcp.sa.`,
    }),
  };
}

// ── Job lifecycle ───────────────────────────────────────────────────────────

function buildJobQueuedTemplate({
  jobId,
  jobType,
  imageType,
  quotedCostHalala,
  queuePosition,
  estimatedDurationMinutes,
}) {
  const frontend = getFrontendUrl();
  const jobDetailUrl = `${frontend}/v2/renter/jobs/${encodeURIComponent(String(jobId || ''))}`;
  const quotedCostLabel = formatHalalaAsSar(quotedCostHalala);
  const queueLabel = Number.isFinite(Number(queuePosition)) ? String(Number(queuePosition)) : 'N/A';
  const durationLabel = Number.isFinite(Number(estimatedDurationMinutes))
    ? `${Number(estimatedDurationMinutes)} min`
    : 'N/A';
  const safeJobType = jobType || 'general';
  const safeImageType = imageType || 'default';
  const footer = notificationFooterText();

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
    html: renderEmail({
      preheader: `Job #${jobId} accepted into the queue — position ${queueLabel}.`,
      labelEn: 'Job queued',
      labelAr: 'في الطابور',
      headlineEn: 'Job queued on DCP',
      headlineAr: 'تم إدراج الطلب في الطابور',
      bodyEnHtml: pEn(`Your job ${strong(`#${jobId}`)} has been accepted into the DCP queue.`),
      bodyArHtml: pAr(`تم إدراج الطلب ${strong(`#${jobId}`)} في طابور DCP.`),
      factRows: [
        { k: 'Job type', v: safeJobType, kAr: 'نوع المهمة', vAr: safeJobType },
        { k: 'Image type', v: safeImageType, kAr: 'نوع الحاوية', vAr: safeImageType },
        { k: 'Quoted cost', v: `${quotedCostLabel} SAR`, kAr: 'التكلفة التقديرية', vAr: `${quotedCostLabel} ريال` },
        { k: 'Queue position', v: queueLabel, kAr: 'ترتيب الطابور', vAr: queueLabel },
        { k: 'Est. duration', v: durationLabel, kAr: 'المدة التقديرية', vAr: durationLabel },
      ],
      cta: { label: 'Track this job', labelAr: 'متابعة الطلب', url: jobDetailUrl },
      whyEn: WHY_RENTER_NOTIFICATIONS_EN,
      whyAr: WHY_RENTER_NOTIFICATIONS_AR,
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
  const jobDetailUrl = `${frontend}/v2/renter/jobs/${encodeURIComponent(String(jobId || ''))}`;
  const durationLabel = Number.isFinite(Number(estimatedDurationMinutes))
    ? `${Number(estimatedDurationMinutes)} min`
    : 'N/A';
  const safeJobType = jobType || 'general';
  const safeImageType = imageType || 'default';
  const footer = notificationFooterText();

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
    html: renderEmail({
      preheader: `Job #${jobId} is now running on a DCP provider.`,
      labelEn: 'Job started',
      labelAr: 'قيد التنفيذ',
      headlineEn: 'Your job has started',
      headlineAr: 'بدأ تنفيذ الطلب',
      bodyEnHtml: pEn(`Your job ${strong(`#${jobId}`)} is now running on a DCP provider.`),
      bodyArHtml: pAr(`الطلب ${strong(`#${jobId}`)} قيد التنفيذ الآن على مزود DCP.`),
      factRows: [
        { k: 'Job type', v: safeJobType, kAr: 'نوع المهمة', vAr: safeJobType },
        { k: 'Image type', v: safeImageType, kAr: 'نوع الحاوية', vAr: safeImageType },
        { k: 'Est. duration', v: durationLabel, kAr: 'المدة التقديرية', vAr: durationLabel },
      ],
      cta: { label: 'Track progress', labelAr: 'متابعة التنفيذ', url: jobDetailUrl },
      whyEn: WHY_RENTER_NOTIFICATIONS_EN,
      whyAr: WHY_RENTER_NOTIFICATIONS_AR,
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
  const jobDetailUrl = `${frontend}/v2/renter/jobs/${encodeURIComponent(String(jobId || ''))}`;
  const costLabel = formatHalalaAsSar(actualCostHalala);
  const gpuSecondsLabel = Number.isFinite(Number(gpuSecondsUsed)) ? String(Number(gpuSecondsUsed)) : 'N/A';
  const safeJobType = jobType || 'general';
  const safeImageType = imageType || 'default';
  const footer = notificationFooterText();

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
    html: renderEmail({
      preheader: `Job #${jobId} complete — ${costLabel} SAR, results ready.`,
      labelEn: 'Job complete',
      labelAr: 'اكتمل الطلب',
      headlineEn: 'Job complete — results ready',
      headlineAr: 'اكتمل الطلب والنتائج جاهزة',
      bodyEnHtml: pEn(`Your job ${strong(`#${jobId}`)} is complete and results are ready.`),
      bodyArHtml: pAr(`تم اكتمال الطلب ${strong(`#${jobId}`)} والنتائج جاهزة.`),
      factRows: [
        { k: 'Job type', v: safeJobType, kAr: 'نوع المهمة', vAr: safeJobType },
        { k: 'Image type', v: safeImageType, kAr: 'نوع الحاوية', vAr: safeImageType },
        { k: 'Actual cost', v: `${costLabel} SAR`, kAr: 'التكلفة الفعلية', vAr: `${costLabel} ريال` },
        { k: 'GPU seconds', v: gpuSecondsLabel, kAr: 'ثواني GPU', vAr: gpuSecondsLabel },
      ],
      cta: { label: 'Open results', labelAr: 'عرض النتائج', url: jobDetailUrl },
      whyEn: WHY_RENTER_NOTIFICATIONS_EN,
      whyAr: WHY_RENTER_NOTIFICATIONS_AR,
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
  const jobDetailUrl = `${frontend}/v2/renter/jobs/${encodeURIComponent(String(jobId || ''))}`;
  const refundLabel = formatHalalaAsSar(refundedAmountHalala);
  const retryLabel = Number.isFinite(Number(retryAttempts)) ? String(Number(retryAttempts)) : '0';
  const safeError = lastError || 'No additional error details reported.';
  const footer = notificationFooterText();

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
    html: renderEmail({
      preheader: `Job #${jobId} failed — ${refundLabel} SAR refunded to your balance.`,
      labelEn: 'Job failed',
      labelAr: 'فشل الطلب',
      tone: 'amber',
      headlineEn: 'Job failed — funds refunded',
      headlineAr: 'فشل الطلب وتم رد المبلغ',
      bodyEnHtml: [
        pEn(`Your job ${strong(`#${jobId}`)} failed.`),
        noteEn('Your balance has been fully refunded.', 'teal'),
      ].join(''),
      bodyArHtml: [
        pAr(`الطلب ${strong(`#${jobId}`)} فشل.`),
        noteAr('تم رد الرصيد بالكامل.', 'teal'),
      ].join(''),
      factRows: [
        { k: 'Last error', v: safeError, kAr: 'آخر خطأ', vAr: safeError },
        { k: 'Refunded', v: `${refundLabel} SAR`, kAr: 'المبلغ المرتجع', vAr: `${refundLabel} ريال` },
        { k: 'Retry attempts', v: retryLabel, kAr: 'عدد المحاولات', vAr: retryLabel },
      ],
      cta: { label: 'View job details', labelAr: 'عرض تفاصيل الطلب', url: jobDetailUrl, tone: 'amber' },
      whyEn: WHY_RENTER_NOTIFICATIONS_EN,
      whyAr: WHY_RENTER_NOTIFICATIONS_AR,
    }),
  };
}

// ── Withdrawals ─────────────────────────────────────────────────────────────

function buildWithdrawalApprovedTemplate({ amountSar }) {
  const amountLabel = formatSar(amountSar);
  const frontend = getFrontendUrl();
  const earningsUrl = `${frontend}/v2/provider/earnings`;
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
    html: renderEmail({
      preheader: `${amountLabel} SAR approved — expect payout in 3-5 business days.`,
      labelEn: 'Withdrawal approved',
      labelAr: 'الموافقة على السحب',
      headlineEn: 'Withdrawal approved',
      headlineAr: 'تمت الموافقة على السحب',
      bodyEnHtml: pEn(`Your withdrawal of ${strong(`${amountLabel} SAR`)} has been approved and queued for processing.`),
      bodyArHtml: pAr(`تمت الموافقة على السحب بقيمة ${strong(`${amountLabel} ريال`)} وهو الآن قيد المعالجة.`),
      factRows: [
        { k: 'Amount', v: `${amountLabel} SAR`, kAr: 'المبلغ', vAr: `${amountLabel} ريال` },
        { k: 'Processing time', v: '3-5 business days', kAr: 'المدة المتوقعة', vAr: 'من 3 إلى 5 أيام عمل' },
      ],
      cta: { label: 'View earnings', labelAr: 'عرض الأرباح', url: earningsUrl },
      whyEn: WHY_PROVIDER_EN,
      whyAr: WHY_PROVIDER_AR,
    }),
  };
}

function buildWithdrawalRejectedTemplate({ amountSar, reason }) {
  const amountLabel = formatSar(amountSar);
  const safeReason = (reason || '').trim() || 'Not specified';
  const safeReasonAr = (reason || '').trim() || 'غير محدد';
  const frontend = getFrontendUrl();
  const earningsUrl = `${frontend}/v2/provider/earnings`;
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
    html: renderEmail({
      preheader: `${amountLabel} SAR rejected — amount returned to your balance.`,
      labelEn: 'Withdrawal rejected',
      labelAr: 'رفض السحب',
      tone: 'amber',
      headlineEn: 'Withdrawal rejected',
      headlineAr: 'تم رفض طلب السحب',
      bodyEnHtml: [
        pEn(`Your withdrawal request for ${strong(`${amountLabel} SAR`)} was rejected.`),
        noteEn('The amount has been returned to your DCP balance.', 'teal'),
      ].join(''),
      bodyArHtml: [
        pAr(`تم رفض طلب السحب بقيمة ${strong(`${amountLabel} ريال`)}.`),
        noteAr('تمت إعادة المبلغ إلى رصيدك في DCP.', 'teal'),
      ].join(''),
      factRows: [
        { k: 'Amount', v: `${amountLabel} SAR`, kAr: 'المبلغ', vAr: `${amountLabel} ريال` },
        { k: 'Reason', v: safeReason, kAr: 'السبب', vAr: safeReasonAr },
      ],
      cta: { label: 'Open earnings', labelAr: 'فتح الأرباح', url: earningsUrl, tone: 'amber' },
      whyEn: WHY_PROVIDER_EN,
      whyAr: WHY_PROVIDER_AR,
    }),
  };
}

// ─── Provider node offline (backlog gap #1) ─────────────────────────────────
// Sent on the online→offline transition so a provider whose node went dark
// hears about it immediately instead of silently not earning ("Node-2 stayed
// dark for days"). Includes the node name, last-seen time, and a link to the
// provider dashboard + troubleshooting docs.
//
// NOTE: the requeue line below is deliberate and accurate — running jobs ARE
// requeued by the offline detectors. Do not strengthen or weaken this claim
// without checking the requeue path first.
function buildProviderOfflineTemplate({ providerName, lastSeen }) {
  const frontend = getFrontendUrl();
  const dashboardUrl = `${frontend}/v2/provider`;
  const troubleshootUrl = `${frontend}/docs/provider-guide`;
  const safeName = (providerName || '').trim() || 'your node';
  const lastSeenLabel = lastSeen
    ? new Date(lastSeen).toUTCString()
    : 'no heartbeat on record';
  const lastSeenLabelAr = lastSeen
    ? new Date(lastSeen).toUTCString()
    : 'لا يوجد نبض مسجّل';

  return {
    subject: `Your DCP node is offline — you've stopped earning | جهازك في DCP غير متصل`,
    text: [
      `${safeName} is offline — DCP stopped receiving heartbeats, so you've stopped earning.`,
      `Last seen: ${lastSeenLabel}`,
      `Any running job was requeued and will resume on the next available provider.`,
      `Bring it back: ${dashboardUrl}`,
      `Troubleshooting: ${troubleshootUrl}`,
      '',
      `${safeName} غير متصل — توقّف DCP عن استقبال النبضات، لذلك توقّفت عن الكسب.`,
      `آخر اتصال: ${lastSeenLabelAr}`,
      `تمت إعادة جدولة أي مهمة قيد التنفيذ وستُستأنف على أول مزود متاح.`,
      `أعده للعمل: ${dashboardUrl}`,
    ].join('\n'),
    html: renderEmail({
      preheader: `${safeName} stopped sending heartbeats — it is offline and not earning.`,
      labelEn: 'Node offline',
      labelAr: 'الجهاز غير متصل',
      tone: 'amber',
      headlineEn: 'Your node is offline',
      headlineAr: 'جهازك غير متصل',
      bodyEnHtml: [
        pEn(`We stopped receiving heartbeats from ${strong(safeName)}, so we've marked it offline. While it's offline it isn't accepting jobs — ${strong("you've stopped earning")}.`),
        noteEn('Any job that was running on this node was requeued and will resume on the next available provider.'),
      ].join(''),
      bodyArHtml: [
        pAr(`توقّفنا عن استقبال نبضات من ${strong(safeName)}، لذلك تم تعيينه دون اتصال. أثناء عدم الاتصال لا يقبل الجهاز أي مهام — ${strong('لقد توقّفت عن الكسب')}.`),
        noteAr('أي مهمة كانت قيد التنفيذ على هذا الجهاز تمت إعادة جدولتها وستُستأنف على أول مزود متاح.'),
      ].join(''),
      factRows: [
        { k: 'Node', v: safeName, kAr: 'الجهاز', vAr: safeName },
        { k: 'Last seen', v: lastSeenLabel, kAr: 'آخر اتصال', vAr: lastSeenLabelAr },
        { k: 'Status', v: 'Offline — not earning', kAr: 'الحالة', vAr: 'غير متصل — لا كسب' },
      ],
      cta: { label: 'Open provider dashboard', labelAr: 'فتح لوحة المزوّد', url: dashboardUrl, tone: 'amber' },
      whyEn: `${WHY_PROVIDER_EN} Common fixes: make sure the machine is powered on and online, confirm the DCP provider app / daemon is running, and check the dashboard for the live status. It will come back automatically once heartbeats resume. Troubleshooting: ${troubleshootUrl}`,
      whyAr: 'حلول شائعة: تأكّد أن الجهاز يعمل ومتصل بالإنترنت، وأن تطبيق/خدمة مزوّد DCP قيد التشغيل، وراجع لوحة التحكم. سيعود تلقائياً بمجرد استئناف النبضات.',
    }),
  };
}

// ─── Auto-top-up emails (PR #427 follow-up) ─────────────────────────────────

function buildAutoTopupPaidTemplate({ amountSar, newBalanceSar, cardBrand, cardLast4 }) {
  const amountLabel = formatSar(amountSar);
  const balanceLabel = formatSar(newBalanceSar);
  const brandLabel = (cardBrand || 'Card').replace(/^./, (c) => c.toUpperCase());
  const cardLabel = cardLast4 ? `${brandLabel} •••• ${cardLast4}` : brandLabel;
  const frontend = getFrontendUrl();
  const billingUrl = `${frontend}/v2/renter/billing`;

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
    html: renderEmail({
      preheader: `${amountLabel} SAR charged — new balance ${balanceLabel} SAR.`,
      labelEn: 'Receipt',
      labelAr: 'إيصال',
      headlineEn: 'Balance auto-topped up',
      headlineAr: 'تمت إعادة الشحن تلقائياً',
      bodyEnHtml: pEn(`Your balance dropped below your auto-top-up threshold so we recharged your DCP balance using ${strong(cardLabel)}.`),
      bodyArHtml: pAr(`انخفض رصيدك دون حدّ الشحن التلقائي فقمنا بإعادة شحن رصيدك في DCP باستخدام ${strong(cardLabel)}.`),
      factRows: [
        { k: 'Amount charged', v: `${amountLabel} SAR`, kAr: 'المبلغ المخصوم', vAr: `${amountLabel} ريال` },
        { k: 'New balance', v: `${balanceLabel} SAR`, kAr: 'الرصيد الجديد', vAr: `${balanceLabel} ريال` },
        { k: 'Card', v: cardLabel, kAr: 'البطاقة', vAr: cardLabel },
      ],
      cta: { label: 'Manage auto-top-up', labelAr: 'إدارة الشحن التلقائي', url: billingUrl },
      whyEn: 'You are receiving this because auto-top-up is enabled on your DCP renter account.',
      whyAr: 'تصلك هذه الرسالة لأن الشحن التلقائي مفعّل في حسابك على DCP.',
    }),
  };
}

function buildAutoTopupFailedTemplate({ amountSar, reason, consecutiveFailures, pausedUntil, cardBrand, cardLast4 }) {
  const amountLabel = formatSar(amountSar);
  const brandLabel = (cardBrand || 'Card').replace(/^./, (c) => c.toUpperCase());
  const cardLabel = cardLast4 ? `${brandLabel} •••• ${cardLast4}` : brandLabel;
  const reasonLabel = (reason || '').trim() || 'Card declined';
  const frontend = getFrontendUrl();
  const billingUrl = `${frontend}/v2/renter/billing`;
  const pausedNote = pausedUntil
    ? noteEn(`Auto-top-up paused until ${escapeHtml(new Date(pausedUntil).toUTCString())} after ${escapeHtml(String(consecutiveFailures))} consecutive failures.`)
    : '';
  const pausedNoteAr = pausedUntil
    ? noteAr(`تم إيقاف الشحن التلقائي حتى ${escapeHtml(new Date(pausedUntil).toUTCString())} بعد ${escapeHtml(String(consecutiveFailures))} محاولات فاشلة.`)
    : '';
  const last4Tail = cardLast4 ? ` ••${cardLast4}` : '';

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
    html: renderEmail({
      preheader: `Card declined — ${amountLabel} SAR not charged, balance unchanged.`,
      labelEn: 'Payment declined',
      labelAr: 'رفض الدفع',
      tone: 'amber',
      headlineEn: 'Auto-top-up failed',
      headlineAr: 'فشل الشحن التلقائي',
      bodyEnHtml: [
        pEn(`We tried to charge ${strong(cardLabel)} for ${strong(`${amountLabel} SAR`)} to recharge your DCP balance, but the bank declined.`),
        noteEn('Your DCP balance was not charged. Jobs will continue to run from your current balance until it is exhausted.', 'teal'),
        pausedNote,
        pEn('Common fixes: update the card details, contact your bank to lift a hold, or top up manually for now.'),
      ].join(''),
      bodyArHtml: [
        pAr(`حاولنا خصم ${strong(`${amountLabel} ريال`)} من ${strong(cardLabel)} لإعادة شحن رصيدك في DCP، لكن البنك رفض العملية.`),
        noteAr('لم يُخصم من رصيد DCP. ستستمر مهامك بالعمل من رصيدك الحالي حتى نفاده.', 'teal'),
        pausedNoteAr,
      ].join(''),
      factRows: [
        { k: 'Attempted amount', v: `${amountLabel} SAR`, kAr: 'المبلغ', vAr: `${amountLabel} ريال` },
        { k: 'Card', v: cardLabel, kAr: 'البطاقة', vAr: cardLabel },
        { k: 'Bank reason', v: reasonLabel, kAr: 'السبب من البنك', vAr: reasonLabel },
      ],
      cta: { label: 'Update card', labelAr: 'تحديث البطاقة', url: billingUrl, tone: 'amber' },
      whyEn: 'You are receiving this because auto-top-up is enabled on your DCP renter account.',
      whyAr: 'تصلك هذه الرسالة لأن الشحن التلقائي مفعّل في حسابك على DCP.',
    }),
  };
}

function buildAutoTopup3dsRequiredTemplate({ amountSar, verificationUrl, cardBrand, cardLast4 }) {
  const amountLabel = formatSar(amountSar);
  const brandLabel = (cardBrand || 'Card').replace(/^./, (c) => c.toUpperCase());
  const cardLabel = cardLast4 ? `${brandLabel} •••• ${cardLast4}` : brandLabel;
  const frontend = getFrontendUrl();
  const ctaUrl = verificationUrl || `${frontend}/v2/renter/billing`;

  return {
    subject: `Action needed: verify ${amountLabel} SAR auto-top-up | تحقّق مطلوب`,
    text: [
      `Your auto-top-up of ${amountLabel} SAR needs 3D Secure verification.`,
      `Verification links expire in ~15-30 minutes.`,
      `Card: ${cardLabel}`,
      `Verify: ${ctaUrl}`,
    ].join('\n'),
    html: renderEmail({
      preheader: `Complete bank verification to finish the ${amountLabel} SAR top-up.`,
      labelEn: 'Action needed',
      labelAr: 'إجراء مطلوب',
      tone: 'amber',
      headlineEn: 'Verify your auto-top-up',
      headlineAr: 'يرجى التحقّق من الشحن',
      bodyEnHtml: [
        pEn(`To finish recharging your DCP balance with ${strong(cardLabel)}, your bank needs you to complete 3D Secure verification.`),
        noteEn('Verification links typically expire in 15&ndash;30 minutes — complete it soon, otherwise your DCP balance won&rsquo;t be topped up and the next inference job may hit the insufficient-balance gate.'),
      ].join(''),
      bodyArHtml: [
        pAr(`لإتمام شحن رصيدك في DCP باستخدام ${strong(cardLabel)}، يطلب البنك التحقّق عبر 3D Secure.`),
        noteAr('عادةً ما تنتهي صلاحية رابط التحقّق خلال ١٥&ndash;٣٠ دقيقة — يُرجى إتمام التحقّق قريباً وإلا لن يُشحن رصيدك وقد ترفض المهمة التالية.'),
      ].join(''),
      factRows: [
        { k: 'Amount', v: `${amountLabel} SAR`, kAr: 'المبلغ', vAr: `${amountLabel} ريال` },
        { k: 'Card', v: cardLabel, kAr: 'البطاقة', vAr: cardLabel },
      ],
      cta: { label: 'Verify with bank', labelAr: 'تحقّق الآن', url: ctaUrl, tone: 'amber' },
      whyEn: 'You are receiving this because auto-top-up is enabled on your DCP renter account.',
      whyAr: 'تصلك هذه الرسالة لأن الشحن التلقائي مفعّل في حسابك على DCP.',
    }),
  };
}

// ── PDPL data export ────────────────────────────────────────────────────────

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
    html: renderEmail({
      preheader: 'PDPL data export request received.',
      labelEn: 'Data export',
      labelAr: 'تصدير البيانات',
      headlineEn: 'Data export request received',
      headlineAr: 'تم استلام طلب تصدير البيانات',
      bodyEnHtml: pEn(`We received your PDPL data export request for your ${strong(safeAccountType)} account.`),
      bodyArHtml: pAr(`تم استلام طلب تصدير البيانات (PDPL) لحساب ${strong(safeAccountType)}.`),
      factRows: [
        { k: 'Requested at', v: requestedLabel, kAr: 'وقت الطلب', vAr: requestedLabel },
        { k: 'Account type', v: safeAccountType, kAr: 'نوع الحساب', vAr: safeAccountType },
        { k: 'Status', v: deliveryText, kAr: 'الحالة', vAr: deliveryTextAr },
      ],
      cta: { label: 'Open account settings', labelAr: 'فتح الإعدادات', url: settingsUrl },
      whyEn: 'You are receiving this because a data export was requested for your dcp.sa account.',
      whyAr: 'تصلك هذه الرسالة لأن طلب تصدير بيانات قُدّم لحسابك على dcp.sa.',
    }),
  };
}


module.exports = {
  toSafeNumber,
  formatSar,
  formatHalalaAsSar,
  getFrontendUrl,
  buildWelcomeTemplate,
  buildJobQueuedTemplate,
  buildJobStartedTemplate,
  buildJobCompletedTemplate,
  buildJobFailedTemplate,
  buildWithdrawalApprovedTemplate,
  buildWithdrawalRejectedTemplate,
  buildProviderOfflineTemplate,
  buildAutoTopupPaidTemplate,
  buildAutoTopupFailedTemplate,
  buildAutoTopup3dsRequiredTemplate,
  buildDataExportReadyTemplate,
};

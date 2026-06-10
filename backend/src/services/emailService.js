const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'DCP Platform <noreply@dcp.sa>';

const {
  toSafeNumber,
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
} = require('./emailTemplates');

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

// ── Public send API ─────────────────────────────────────────────────────────

/**
 * Send the post-registration welcome email.
 *
 * SECURITY: the plaintext API key is intentionally NOT a parameter anymore —
 * the email links to sign-in instead of embedding the credential.
 *
 * @param {string} to    recipient email
 * @param {string} name  display name
 * @param {'provider'|'renter'} role
 */
async function sendWelcomeEmail(to, name, role) {
  if (!to || !name) {
    return { ok: false, reason: 'invalid_arguments' };
  }

  const template = buildWelcomeTemplate({
    name,
    email: to,
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
  // exposed for preview/render tooling and tests
  _templates: {
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
  },
};

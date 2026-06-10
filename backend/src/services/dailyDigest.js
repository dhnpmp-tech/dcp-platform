/**
 * Daily digest — rolls renter_notifications rows into ONE email per renter
 * per day. Runs once daily at 07:00 UTC (10:00 KSA) by default.
 *
 * Replaces the per-job completion email burn:
 *   Before: 641 jobs/day * 1 email = 641 emails/day
 *   After:  ~30 active renters * 1 email = ~30 emails/day
 *
 * The cron is wired up from server.js with proper start/stop hooks. The
 * sweep is idempotent — already-digested notifications carry a
 * `digested_at` timestamp and are skipped on subsequent runs.
 */

const { sendEmail } = require('./emailService');
const { renderEmail, escapeHtml, COLORS, FONTS } = require('./emailLayout');

const DEFAULT_DIGEST_UTC_HOUR = 7;   // 10:00 KSA
const DEFAULT_DIGEST_UTC_MINUTE = 0;
const LOOKBACK_HOURS = 24;
const TICK_INTERVAL_MS = 60 * 1000;  // check every minute whether it's digest time

// Test/internal accounts that should not receive digest emails. The check is
// case-insensitive and matches both literal addresses and the *-test@ pattern.
const TEST_EMAIL_LITERALS = new Set([
  'tak@dcp.sa',
  'tareq-test@dcp.sa',
]);
const TEST_EMAIL_PATTERNS = [
  /^smoke-/i,
  /-test@/i,
  /\+test@/i,
];

function isTestEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const lower = email.toLowerCase();
  if (TEST_EMAIL_LITERALS.has(lower)) return true;
  return TEST_EMAIL_PATTERNS.some((re) => re.test(lower));
}

function formatSar(halala) {
  const n = Number(halala) || 0;
  return (n / 100).toFixed(2);
}

function safeJsonParse(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch (_err) {
    return {};
  }
}

/**
 * Group an array of notification rows by model, summing cost.
 * Returns rows sorted by count desc, then cost desc.
 */
function groupByModel(notifications) {
  const groups = new Map();
  for (const n of notifications) {
    const payload = safeJsonParse(n.payload);
    const model = payload.model || 'unknown';
    const costHalala = Number(payload.cost_halala) || 0;
    const existing = groups.get(model) || { model, count: 0, costHalala: 0 };
    existing.count += 1;
    existing.costHalala += costHalala;
    groups.set(model, existing);
  }
  return Array.from(groups.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.costHalala - a.costHalala;
  });
}

function buildDigestTemplate({ renterName, totalJobs, totalHalala, byModel, dashboardUrl }) {
  const totalSar = formatSar(totalHalala);
  const subject = `DCP daily — ${totalJobs} job${totalJobs === 1 ? '' : 's'} completed, ${totalSar} SAR spent`;

  // Model breakdown table — hairline borders, mono uppercase headers,
  // rendered once per language section (headers localized, data shared).
  const buildModelTable = ({ rtl }) => {
    const dir = rtl ? 'rtl' : 'ltr';
    const headers = rtl
      ? { model: 'النموذج', jobs: 'المهام', cost: 'التكلفة' }
      : { model: 'Model', jobs: 'Jobs', cost: 'Cost' };
    const startAlign = rtl ? 'right' : 'left';
    const endAlign = rtl ? 'left' : 'right';
    const th = (label, align) =>
      `<th dir="${dir}" style="padding:10px 14px;border-bottom:1px solid ${COLORS.border};font-family:${FONTS.mono};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${COLORS.text2};font-weight:400;text-align:${align};">${label}</th>`;
    const rows = byModel
      .map(
        (g, i) => `
        <tr>
          <td dir="${dir}" style="padding:10px 14px;${i === byModel.length - 1 ? '' : `border-bottom:1px solid ${COLORS.border};`}font-family:${FONTS.mono};font-size:13px;color:${COLORS.text};text-align:${startAlign};">${escapeHtml(g.model)}</td>
          <td dir="${dir}" style="padding:10px 14px;${i === byModel.length - 1 ? '' : `border-bottom:1px solid ${COLORS.border};`}font-family:${FONTS.body};font-size:13px;color:${COLORS.text1};text-align:${endAlign};">${g.count}</td>
          <td dir="${dir}" style="padding:10px 14px;${i === byModel.length - 1 ? '' : `border-bottom:1px solid ${COLORS.border};`}font-family:${FONTS.body};font-size:13px;color:${COLORS.text1};text-align:${endAlign};">${formatSar(g.costHalala)} ${rtl ? 'ريال' : 'SAR'}</td>
        </tr>`
      )
      .join('');
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${COLORS.surfaceDeep}" style="width:100%;margin:0 0 22px;border:1px solid ${COLORS.border};border-collapse:collapse;background:${COLORS.surfaceDeep};">
      <thead><tr>${th(headers.model, startAlign)}${th(headers.jobs, endAlign)}${th(headers.cost, endAlign)}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  };

  const modelRowsText = byModel
    .map((g) => `  ${g.model}: ${g.count} job(s), ${formatSar(g.costHalala)} SAR`)
    .join('\n');

  const greeting = renterName ? `Hi ${renterName.split(' ')[0]},` : 'Hi,';

  const bodyEnHtml = [
    `<p style="font-family:${FONTS.body};font-size:14px;line-height:1.65;color:${COLORS.text1};margin:0 0 8px;">${escapeHtml(greeting)}</p>`,
    `<p style="font-family:${FONTS.body};font-size:14px;line-height:1.65;color:${COLORS.text1};margin:0 0 18px;">A roll-up of the jobs that completed on your account in the last 24 hours. Total spent: <strong style="color:${COLORS.text};font-weight:600;">${totalSar} SAR</strong>.</p>`,
    buildModelTable({ rtl: false }),
    `<p style="font-family:${FONTS.body};font-size:12px;line-height:1.6;color:${COLORS.text2};margin:0 0 8px;">Per-job emails were retired in favor of this daily summary plus in-dashboard notifications. Real-time alerts are still sent for critical events such as low balance.</p>`,
  ].join('');

  const bodyArHtml = [
    `<p dir="rtl" style="font-family:${FONTS.body};font-size:14px;line-height:1.8;color:${COLORS.text1};margin:0 0 18px;text-align:right;direction:rtl;">ملخص المهام التي اكتملت على حسابك خلال آخر ٢٤ ساعة. إجمالي الإنفاق: <strong style="color:${COLORS.text};font-weight:600;">${totalSar} ريال</strong>.</p>`,
    buildModelTable({ rtl: true }),
  ].join('');

  const html = renderEmail({
    preheader: `${totalJobs} job${totalJobs === 1 ? '' : 's'} completed, ${totalSar} SAR spent in the last 24 hours.`,
    labelEn: 'Daily summary',
    labelAr: 'الملخص اليومي',
    headlineEn: `${totalJobs} job${totalJobs === 1 ? '' : 's'} completed`,
    // Arabic counting rules: 1 = مهمة, 2 = مهمتان, 3-10 = مهام, 11+ = مهمة.
    headlineAr: `اكتملت ${totalJobs} ${totalJobs === 1 ? 'مهمة' : totalJobs === 2 ? 'مهمتان' : totalJobs <= 10 ? 'مهام' : 'مهمة'}`,
    bodyEnHtml,
    bodyArHtml,
    cta: { label: 'Open dashboard', labelAr: 'فتح لوحة التحكم', url: dashboardUrl },
    whyEn: 'You are receiving this daily summary because jobs completed on your DCP renter account in the last 24 hours. Manage notifications at dcp.sa/renter/settings.',
    whyAr: 'تصلك هذه الرسالة لأن مهامًا اكتملت على حسابك في DCP خلال آخر ٢٤ ساعة. إدارة الإشعارات من dcp.sa/renter/settings.',
  });

  const text = [
    `DCP daily — ${totalJobs} job(s) completed, ${totalSar} SAR spent`,
    '',
    greeting,
    '',
    'In the last 24 hours:',
    modelRowsText,
    '',
    `Total: ${totalJobs} job(s), ${totalSar} SAR`,
    '',
    `Dashboard: ${dashboardUrl}`,
  ].join('\n');

  return { subject, html, text };
}

function getFrontendUrl() {
  const raw = process.env.FRONTEND_URL || process.env.PUBLIC_FRONTEND_URL || 'https://dcp.sa';
  return String(raw).replace(/\/+$/, '');
}

/**
 * Run the digest once. Idempotent: marks rows with digested_at so re-runs
 * don't re-send.
 *
 * @param {object} db better-sqlite3 handle
 * @returns {Promise<{ok: boolean, rentersEmailed: number, notificationsDigested: number, skipped: number}>}
 */
async function runDigest(db) {
  if (!db || typeof db.prepare !== 'function') {
    return { ok: false, rentersEmailed: 0, notificationsDigested: 0, skipped: 0, reason: 'no_db' };
  }

  // Check renter_notifications table exists (defensive against pre-migration).
  let tableExists = false;
  try {
    const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='renter_notifications'`).get();
    tableExists = Boolean(row);
  } catch (_err) {
    tableExists = false;
  }
  if (!tableExists) {
    return { ok: false, rentersEmailed: 0, notificationsDigested: 0, skipped: 0, reason: 'table_missing' };
  }

  // Pull all un-digested job_completed notifications from the lookback window.
  // We group them in JS to avoid SQLite-specific JSON functions.
  const rows = db
    .prepare(
      `SELECT n.id, n.renter_id, n.kind, n.payload, n.created_at,
              r.email, r.name, r.status
         FROM renter_notifications n
         JOIN renters r ON r.id = n.renter_id
        WHERE n.kind = 'job_completed'
          AND n.digested_at IS NULL
          AND n.created_at >= datetime('now', '-' || ? || ' hours')
        ORDER BY n.renter_id, n.created_at ASC`
    )
    .all(LOOKBACK_HOURS);

  if (rows.length === 0) {
    return { ok: true, rentersEmailed: 0, notificationsDigested: 0, skipped: 0 };
  }

  // Bucket by renter.
  const byRenter = new Map();
  for (const row of rows) {
    const bucket = byRenter.get(row.renter_id) || {
      renterId: row.renter_id,
      email: row.email,
      name: row.name,
      status: row.status,
      notifications: [],
    };
    bucket.notifications.push(row);
    byRenter.set(row.renter_id, bucket);
  }

  const markDigestedStmt = db.prepare(
    `UPDATE renter_notifications SET digested_at = datetime('now') WHERE id = ?`
  );
  const dashboardUrl = `${getFrontendUrl()}/dashboard`;

  let rentersEmailed = 0;
  let notificationsDigested = 0;
  let skipped = 0;

  for (const bucket of byRenter.values()) {
    if (!bucket.email || bucket.status !== 'active' || isTestEmail(bucket.email)) {
      // Mark as digested anyway so we don't keep re-scanning them every day.
      for (const n of bucket.notifications) {
        try { markDigestedStmt.run(n.id); } catch (_err) { /* best-effort */ }
      }
      skipped += bucket.notifications.length;
      continue;
    }

    const totalHalala = bucket.notifications.reduce((sum, n) => {
      const p = safeJsonParse(n.payload);
      return sum + (Number(p.cost_halala) || 0);
    }, 0);
    const byModel = groupByModel(bucket.notifications);

    const template = buildDigestTemplate({
      renterName: bucket.name,
      totalJobs: bucket.notifications.length,
      totalHalala,
      byModel,
      dashboardUrl,
    });

    let sendResult;
    try {
      sendResult = await sendEmail({
        to: bucket.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });
    } catch (err) {
      console.warn(`[dailyDigest] sendEmail threw for renter ${bucket.renterId}: ${err.message}`);
      sendResult = { ok: false, reason: 'exception' };
    }

    // Even on send failure we mark the rows as digested to avoid repeated
    // retries against a broken Resend account; the rows remain visible in
    // the dashboard so users still see them.
    for (const n of bucket.notifications) {
      try { markDigestedStmt.run(n.id); } catch (_err) { /* best-effort */ }
      notificationsDigested += 1;
    }

    if (sendResult?.ok) {
      rentersEmailed += 1;
      console.log(`[dailyDigest] sent digest to renter ${bucket.renterId} (${bucket.notifications.length} jobs, ${formatSar(totalHalala)} SAR)`);
    } else {
      console.warn(`[dailyDigest] digest send failed for renter ${bucket.renterId}: ${sendResult?.reason || 'unknown'}`);
    }
  }

  return { ok: true, rentersEmailed, notificationsDigested, skipped };
}

let digestTimer = null;
let lastFireDay = null; // ISO date 'YYYY-MM-DD' for the day we last fired

function shouldFireNow(now, targetHourUtc, targetMinuteUtc) {
  const day = now.toISOString().slice(0, 10);
  if (lastFireDay === day) return false;
  if (now.getUTCHours() !== targetHourUtc) return false;
  if (now.getUTCMinutes() < targetMinuteUtc) return false;
  return true;
}

function parseHourMinute(value, fallbackHour, fallbackMinute) {
  const match = String(value || '').trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return { hour: fallbackHour, minute: fallbackMinute };
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/**
 * Start the daily digest timer. Polls every minute, fires exactly once per
 * UTC day at the configured time. Idempotent across restarts because the
 * runDigest sweep skips already-digested rows.
 */
function startDailyDigest(db, options = {}) {
  if (!db) return null;
  stopDailyDigest();

  const flagEnabled = String(process.env.NOTIFICATIONS_V2_ENABLED || '').toLowerCase() === 'true';
  if (!flagEnabled && !options.forceEnable) {
    console.log('[dailyDigest] NOTIFICATIONS_V2_ENABLED is not "true" — daily digest not started.');
    return null;
  }

  const schedule = parseHourMinute(
    process.env.NOTIFICATIONS_DIGEST_UTC || `${DEFAULT_DIGEST_UTC_HOUR.toString().padStart(2, '0')}:${DEFAULT_DIGEST_UTC_MINUTE.toString().padStart(2, '0')}`,
    DEFAULT_DIGEST_UTC_HOUR,
    DEFAULT_DIGEST_UTC_MINUTE
  );

  const tick = () => {
    const now = new Date();
    if (!shouldFireNow(now, schedule.hour, schedule.minute)) return;
    lastFireDay = now.toISOString().slice(0, 10);
    runDigest(db)
      .then((res) => {
        console.log(`[dailyDigest] tick complete: ${JSON.stringify(res)}`);
      })
      .catch((err) => {
        console.error(`[dailyDigest] tick failed: ${err.message}`);
      });
  };

  digestTimer = setInterval(tick, TICK_INTERVAL_MS);
  if (typeof digestTimer.unref === 'function') digestTimer.unref();
  console.log(`[dailyDigest] started, will fire daily at ${schedule.hour.toString().padStart(2, '0')}:${schedule.minute.toString().padStart(2, '0')} UTC`);
  return digestTimer;
}

function stopDailyDigest() {
  if (digestTimer) {
    clearInterval(digestTimer);
    digestTimer = null;
  }
}

module.exports = {
  startDailyDigest,
  stopDailyDigest,
  runDigest,
  // exposed for tests
  _internals: {
    buildDigestTemplate,
    groupByModel,
    isTestEmail,
    parseHourMinute,
  },
};

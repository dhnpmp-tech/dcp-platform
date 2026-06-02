'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bi, useV2 } from '@/app/v2/lib/i18n'
import { getApiBase } from '@/lib/api'
import './admin.css'

type LoadState = 'checking' | 'loading' | 'ready' | 'missing-key' | 'error'
type Severity = 'critical' | 'watch' | 'routine'
type AgentMode = 'read' | 'notify' | 'propose' | 'guarded'

interface AdminStats {
  total_providers?: number
  online_now?: number
  total_renters?: number
  active_renters?: number
  total_jobs?: number
  completed_jobs?: number
  failed_jobs?: number
  active_jobs?: number
  total_revenue_halala?: number
  total_dc1_fees_halala?: number
  today_revenue_halala?: number
  today_jobs?: number
}

interface DashboardPayload {
  stats?: AdminStats
  gpu_breakdown?: unknown[]
  recent_signups?: unknown[]
  recent_heartbeats?: unknown[]
}

type DashboardResponse = DashboardPayload & {
  dashboard?: DashboardPayload
}

interface PaymentsAuditPayload {
  payouts?: unknown[]
  billing?: unknown[]
  auto_topup?: unknown[]
  refund_requests?: unknown[]
  summary?: {
    payouts?: Record<string, number>
    billing_attempts?: Record<string, number>
    auto_topup?: Record<string, number>
    refund_requests?: Record<string, number>
  }
}

interface HealthPayload {
  status?: string
  ok?: boolean
  database?: { status?: string }
  queues?: Record<string, unknown>
  cleanup?: Record<string, unknown>
  [key: string]: unknown
}

interface SecurityPayload {
  total?: number
  critical?: number
  high?: number
  recent?: unknown[]
  summary?: Record<string, number>
}

interface ProviderListPayload {
  providers?: unknown[]
  data?: unknown[]
  rows?: unknown[]
}

interface TaskItem {
  id: string
  titleEn: string
  titleAr: string
  detailEn: string
  detailAr: string
  owner: string
  source: string
  severity: Severity
  agentMode: AgentMode
  href: string
}

interface WorkflowItem {
  key: string
  labelEn: string
  labelAr: string
  value: string
  status: Severity
  noteEn: string
  noteAr: string
}

const API_BASE = getApiBase()
const AUTH_HREF = '/v2/auth?role=admin&method=apikey&redirect=/v2/admin'

const numFmt = new Intl.NumberFormat('en-US')

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function countList(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

function countByStatus(summary: Record<string, number> | undefined, keys: string[]): number {
  if (!summary) return 0
  return keys.reduce((total, key) => total + toNumber(summary[key]), 0)
}

function formatHalala(value: unknown): string {
  const sar = toNumber(value) / 100
  return `SAR ${sar.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

async function fetchJson<T>(path: string, token: string): Promise<T | null> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'x-admin-token': token },
  })
  if (res.status === 401) {
    throw new Error('admin-auth-expired')
  }
  if (!res.ok) return null
  return (await res.json().catch(() => null)) as T | null
}

function unwrapDashboard(payload: DashboardResponse | null): DashboardPayload | null {
  if (!payload) return null
  return payload.dashboard || payload
}

function providerRows(payload: ProviderListPayload | unknown[] | null): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!payload) return []
  return payload.providers || payload.data || payload.rows || []
}

function severityRank(severity: Severity): number {
  if (severity === 'critical') return 0
  if (severity === 'watch') return 1
  return 2
}

function agentLabel(mode: AgentMode): { en: string; ar: string } {
  if (mode === 'read') return { en: 'agent read', ar: 'قراءة للوكيل' }
  if (mode === 'notify') return { en: 'agent notify', ar: 'تنبيه الوكيل' }
  if (mode === 'propose') return { en: 'agent propose', ar: 'اقتراح الوكيل' }
  return { en: 'human approval', ar: 'موافقة بشرية' }
}

function buildTasks(
  dashboard: DashboardPayload | null,
  audit: PaymentsAuditPayload | null,
  health: HealthPayload | null,
  security: SecurityPayload | null,
  providers: unknown[],
): TaskItem[] {
  const stats = dashboard?.stats || {}
  const refundPending = countByStatus(audit?.summary?.refund_requests, ['pending', 'processing'])
  const payoutPending = countByStatus(audit?.summary?.payouts, ['pending', 'processing'])
  const billingExceptions = countByStatus(audit?.summary?.billing_attempts, ['error', 'insufficient_balance'])
  const autoTopupIssues = countByStatus(audit?.summary?.auto_topup, ['failed', 'capped', 'paused'])
  const failedJobs = toNumber(stats.failed_jobs)
  const activeJobs = toNumber(stats.active_jobs)
  const onlineProviders = toNumber(stats.online_now)
  const totalProviders = toNumber(stats.total_providers) || providers.length
  const criticalSecurity = toNumber(security?.critical) + toNumber(security?.high)
  const healthBad = health && (health.ok === false || String(health.status || '').toLowerCase().includes('fail'))

  const tasks: TaskItem[] = []

  if (refundPending > 0) {
    tasks.push({
      id: 'refunds',
      titleEn: `${refundPending} refund request${refundPending === 1 ? '' : 's'} need review`,
      titleAr: `${refundPending} طلب استرداد يحتاج مراجعة`,
      detailEn: 'Money movement stays human-approved; agents can summarize evidence and draft the decision.',
      detailAr: 'تبقى حركة الأموال بموافقة بشرية؛ يمكن للوكلاء تلخيص الأدلة وصياغة القرار.',
      owner: 'Finance',
      source: 'payments audit',
      severity: 'critical',
      agentMode: 'guarded',
      href: '/admin/payments',
    })
  }

  if (payoutPending > 0) {
    tasks.push({
      id: 'payouts',
      titleEn: `${payoutPending} provider payout${payoutPending === 1 ? '' : 's'} pending`,
      titleAr: `${payoutPending} دفعة مزوّد معلّقة`,
      detailEn: 'Review claimable earnings, payout account state, and admin notes before completion.',
      detailAr: 'راجع الأرباح القابلة للمطالبة وحالة حساب الدفع وملاحظات الإدارة قبل الإكمال.',
      owner: 'Finance',
      source: 'withdrawals',
      severity: 'critical',
      agentMode: 'guarded',
      href: '/admin/withdrawals',
    })
  }

  if (billingExceptions + autoTopupIssues > 0) {
    tasks.push({
      id: 'billing-exceptions',
      titleEn: `${billingExceptions + autoTopupIssues} billing exception${billingExceptions + autoTopupIssues === 1 ? '' : 's'}`,
      titleAr: `${billingExceptions + autoTopupIssues} استثناء فوترة`,
      detailEn: 'Agents may classify patterns; balance corrections and refunds require a human.',
      detailAr: 'يمكن للوكلاء تصنيف الأنماط؛ تصحيحات الرصيد والاسترداد تتطلب إنساناً.',
      owner: 'Finance',
      source: 'billing ledger',
      severity: 'watch',
      agentMode: 'propose',
      href: '/admin/payments',
    })
  }

  if (failedJobs > 0) {
    tasks.push({
      id: 'failed-jobs',
      titleEn: `${failedJobs} failed job${failedJobs === 1 ? '' : 's'} in history`,
      titleAr: `${failedJobs} مهمة فاشلة في السجل`,
      detailEn: 'Look for repeated provider, model, or routing failures before adding capacity.',
      detailAr: 'ابحث عن فشل متكرر حسب المزوّد أو النموذج أو التوجيه قبل إضافة السعة.',
      owner: 'Ops',
      source: 'jobs',
      severity: failedJobs > 10 ? 'critical' : 'watch',
      agentMode: 'propose',
      href: '/admin/jobs',
    })
  }

  if (activeJobs > 0) {
    tasks.push({
      id: 'active-jobs',
      titleEn: `${activeJobs} active job${activeJobs === 1 ? '' : 's'} running`,
      titleAr: `${activeJobs} مهمة نشطة قيد التشغيل`,
      detailEn: 'Monitor settlement and provider health; cancellation remains human-confirmed.',
      detailAr: 'راقب التسوية وصحة المزوّد؛ الإلغاء يبقى بتأكيد بشري.',
      owner: 'Ops',
      source: 'jobs',
      severity: 'routine',
      agentMode: 'notify',
      href: '/admin/jobs',
    })
  }

  if (onlineProviders === 0 || (totalProviders > 0 && onlineProviders / totalProviders < 0.35)) {
    tasks.push({
      id: 'fleet-capacity',
      titleEn: 'Fleet capacity is thin',
      titleAr: 'سعة الأسطول منخفضة',
      detailEn: 'Check verified-online state, endpoint reachability, and model coverage before promoting catalog availability.',
      detailAr: 'تحقق من الحالة المتحققة والوصول للنقاط وتغطية النماذج قبل إعلان التوفر.',
      owner: 'Fleet',
      source: 'provider health',
      severity: 'critical',
      agentMode: 'notify',
      href: '/admin/fleet',
    })
  }

  if (healthBad) {
    tasks.push({
      id: 'system-health',
      titleEn: 'System health needs review',
      titleAr: 'صحة النظام تحتاج مراجعة',
      detailEn: 'Review DB, queues, cleanup, and live service probes before trusting green dashboard totals.',
      detailAr: 'راجع قاعدة البيانات والطوابير والتنظيف وفحوصات الخدمة قبل الوثوق بالأرقام الخضراء.',
      owner: 'Engineering',
      source: 'admin health',
      severity: 'critical',
      agentMode: 'notify',
      href: '/admin/security',
    })
  }

  if (criticalSecurity > 0) {
    tasks.push({
      id: 'security',
      titleEn: `${criticalSecurity} high-priority security event${criticalSecurity === 1 ? '' : 's'}`,
      titleAr: `${criticalSecurity} حدث أمني عالي الأولوية`,
      detailEn: 'Agents can enrich context; token rotation and access revocation stay approval-gated.',
      detailAr: 'يمكن للوكلاء إثراء السياق؛ تدوير المفاتيح وسحب الوصول بموافقة.',
      owner: 'Security',
      source: 'security events',
      severity: 'critical',
      agentMode: 'guarded',
      href: '/admin/security',
    })
  }

  if (tasks.length === 0) {
    tasks.push({
      id: 'quiet-ops',
      titleEn: 'No urgent admin tasks detected',
      titleAr: 'لا توجد مهام إدارية عاجلة',
      detailEn: 'Use this quiet window for provider onboarding, pricing review, and access-policy hardening.',
      detailAr: 'استغل الهدوء لتجهيز المزوّدين ومراجعة التسعير وتقوية سياسات الوصول.',
      owner: 'Founders',
      source: 'command center',
      severity: 'routine',
      agentMode: 'propose',
      href: '/admin',
    })
  }

  return tasks.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)).slice(0, 7)
}

function buildWorkflows(
  dashboard: DashboardPayload | null,
  audit: PaymentsAuditPayload | null,
  health: HealthPayload | null,
  providers: unknown[],
): WorkflowItem[] {
  const stats = dashboard?.stats || {}
  const totalProviders = toNumber(stats.total_providers) || providers.length
  const onlineProviders = toNumber(stats.online_now)
  const providerRatio = totalProviders > 0 ? onlineProviders / totalProviders : 0
  const refundPending = countByStatus(audit?.summary?.refund_requests, ['pending', 'processing'])
  const payoutPending = countByStatus(audit?.summary?.payouts, ['pending', 'processing'])
  const billingExceptions = countByStatus(audit?.summary?.billing_attempts, ['error', 'insufficient_balance'])
  const healthStatus = health?.ok === false ? 'review' : String(health?.status || 'unknown')

  return [
    {
      key: 'launch',
      labelEn: 'Launch readiness',
      labelAr: 'جاهزية الإطلاق',
      value: providerRatio >= 0.5 && refundPending === 0 ? 'steady' : 'watch',
      status: providerRatio >= 0.5 && refundPending === 0 ? 'routine' : 'watch',
      noteEn: 'Combines supply, money queue, and system health into a simple founder signal.',
      noteAr: 'يجمع العرض وطابور المال وصحة النظام في إشارة مؤسسين بسيطة.',
    },
    {
      key: 'money',
      labelEn: 'Money queue',
      labelAr: 'طابور الأموال',
      value: `${refundPending + payoutPending}`,
      status: refundPending + payoutPending > 0 ? 'critical' : 'routine',
      noteEn: 'Refunds and payouts stay human-approved; agents can prepare summaries.',
      noteAr: 'الاستردادات والدفعات بموافقة بشرية؛ يمكن للوكلاء تحضير الملخصات.',
    },
    {
      key: 'fleet',
      labelEn: 'Serving supply',
      labelAr: 'عرض الخدمة',
      value: `${onlineProviders}/${totalProviders || 0}`,
      status: onlineProviders === 0 ? 'critical' : providerRatio < 0.5 ? 'watch' : 'routine',
      noteEn: 'Verified serving state matters more than heartbeat freshness.',
      noteAr: 'حالة الخدمة المتحققة أهم من حداثة النبض فقط.',
    },
    {
      key: 'billing',
      labelEn: 'Billing exceptions',
      labelAr: 'استثناءات الفوترة',
      value: `${billingExceptions}`,
      status: billingExceptions > 0 ? 'watch' : 'routine',
      noteEn: 'Agents may group errors, but balance changes need approval.',
      noteAr: 'يمكن للوكلاء تجميع الأخطاء، لكن تغييرات الرصيد تحتاج موافقة.',
    },
    {
      key: 'system',
      labelEn: 'System health',
      labelAr: 'صحة النظام',
      value: healthStatus,
      status: health?.ok === false ? 'critical' : 'routine',
      noteEn: 'DB, queue, cleanup, and probe status should be checked before launch pushes.',
      noteAr: 'يجب فحص قاعدة البيانات والطوابير والتنظيف والفحوصات قبل دفعات الإطلاق.',
    },
  ]
}

export default function V2AdminPage() {
  const router = useRouter()
  const { lang, toggle } = useV2()
  const [state, setState] = useState<LoadState>('checking')
  const [error, setError] = useState('')
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null)
  const [audit, setAudit] = useState<PaymentsAuditPayload | null>(null)
  const [health, setHealth] = useState<HealthPayload | null>(null)
  const [security, setSecurity] = useState<SecurityPayload | null>(null)
  const [providers, setProviders] = useState<unknown[]>([])
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('dc1_admin_token') : null
    if (!token) {
      setState('missing-key')
      router.replace(AUTH_HREF)
      return
    }

    setState('loading')
    setError('')
    try {
      const [dashRes, auditRes, healthRes, securityRes, providerRes] = await Promise.all([
        fetchJson<DashboardResponse>('/admin/dashboard', token),
        fetchJson<PaymentsAuditPayload>('/admin/payments/audit?limit=40', token),
        fetchJson<HealthPayload>('/admin/health', token),
        fetchJson<SecurityPayload>('/admin/security/summary', token),
        fetchJson<ProviderListPayload | unknown[]>('/admin/providers?page=0&limit=200', token),
      ])
      setDashboard(unwrapDashboard(dashRes))
      setAudit(auditRes)
      setHealth(healthRes)
      setSecurity(securityRes)
      setProviders(providerRows(providerRes))
      setRefreshedAt(new Date())
      setState('ready')
    } catch (err) {
      if (err instanceof Error && err.message === 'admin-auth-expired') {
        localStorage.removeItem('dc1_admin_token')
        setState('missing-key')
        router.replace(AUTH_HREF)
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to load admin command center.')
      setState('error')
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  const stats = dashboard?.stats || {}
  const tasks = useMemo(() => buildTasks(dashboard, audit, health, security, providers), [dashboard, audit, health, security, providers])
  const workflows = useMemo(() => buildWorkflows(dashboard, audit, health, providers), [dashboard, audit, health, providers])
  const urgentCount = tasks.filter((task) => task.severity === 'critical').length
  const watchCount = tasks.filter((task) => task.severity === 'watch').length
  const refreshedLabel = refreshedAt
    ? refreshedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : '--:--'

  return (
    <div className="v2-admin">
      <aside className="admin-rail">
        <Link href="/v2/home" className="admin-brand">
          <span>DCP</span><i>∞</i>
        </Link>
        <div className="rail-section">
          <a href="#command" className="rail-link on">
            <span>CC</span><Bi en="Command" ar="القيادة" />
          </a>
          <a href="#inbox" className="rail-link">
            <span>IN</span><Bi en="Inbox" ar="الصندوق" />
          </a>
          <a href="#agents" className="rail-link">
            <span>AG</span><Bi en="Agents" ar="الوكلاء" />
          </a>
          <a href="#workflows" className="rail-link">
            <span>WF</span><Bi en="Workflows" ar="التدفقات" />
          </a>
        </div>
        <div className="rail-section muted">
          <Link href="/admin" className="rail-link">
            <span>V1</span><Bi en="Current console" ar="اللوحة الحالية" />
          </Link>
          <Link href="/v2/auth?role=admin&method=apikey&redirect=/v2/admin" className="rail-link">
            <span>AK</span><Bi en="Admin key" ar="مفتاح الإدارة" />
          </Link>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-top">
          <div>
            <p className="admin-kicker"><Bi en="Founder operations · agent-aware" ar="عمليات المؤسسين · مدركة للوكلاء" /></p>
            <h1><Bi en="Admin command center" ar="مركز قيادة الإدارة" /></h1>
          </div>
          <div className="admin-top-actions">
            <button type="button" className="lang-switch" onClick={toggle} aria-label="Toggle language">
              <span className={lang === 'en' ? 'on' : undefined}>EN</span>
              <span className={lang === 'ar' ? 'on' : undefined}>ع</span>
            </button>
            <button type="button" className="admin-refresh" onClick={() => void load()} disabled={state === 'loading'}>
              <Bi en={state === 'loading' ? 'Refreshing' : 'Refresh'} ar={state === 'loading' ? 'جارٍ التحديث' : 'تحديث'} />
            </button>
          </div>
        </header>

        <section className="admin-status-strip" id="command" aria-label="Admin status">
          <div>
            <span className={`pulse ${urgentCount > 0 ? 'hot' : watchCount > 0 ? 'warm' : ''}`} />
            <strong>{urgentCount > 0 ? urgentCount : watchCount > 0 ? watchCount : 0}</strong>
            <Bi en={urgentCount > 0 ? 'urgent items' : watchCount > 0 ? 'watch items' : 'urgent items'} ar={urgentCount > 0 ? 'عناصر عاجلة' : watchCount > 0 ? 'عناصر مراقبة' : 'عناصر عاجلة'} />
          </div>
          <div>
            <span><Bi en="last refresh" ar="آخر تحديث" /></span>
            <strong>{refreshedLabel}</strong>
          </div>
          <div>
            <span><Bi en="agent default" ar="وضع الوكيل" /></span>
            <strong><Bi en="propose only" ar="اقتراح فقط" /></strong>
          </div>
          <div>
            <span><Bi en="write policy" ar="سياسة الكتابة" /></span>
            <strong><Bi en="guarded" ar="محروسة" /></strong>
          </div>
        </section>

        {state === 'missing-key' && (
          <section className="admin-state">
            <h2><Bi en="Admin key required" ar="مفتاح الإدارة مطلوب" /></h2>
            <p><Bi en="Use v2 admin sign-in to open the command center." ar="استخدم دخول الإدارة في v2 لفتح مركز القيادة." /></p>
            <Link href={AUTH_HREF}><Bi en="Open admin sign-in" ar="افتح دخول الإدارة" /></Link>
          </section>
        )}

        {state === 'error' && (
          <section className="admin-state error">
            <h2><Bi en="Command center could not load" ar="تعذر تحميل مركز القيادة" /></h2>
            <p>{error}</p>
            <button type="button" onClick={() => void load()}><Bi en="Try again" ar="حاول مرة أخرى" /></button>
          </section>
        )}

        {(state === 'checking' || state === 'loading') && (
          <section className="admin-skeleton" aria-label="Loading admin command center">
            <div /><div /><div /><div />
          </section>
        )}

        {state === 'ready' && (
          <>
            <section className="metric-grid" aria-label="Admin metrics">
              <div className="metric tall">
                <span className="metric-label"><Bi en="Revenue today" ar="إيراد اليوم" /></span>
                <strong>{formatHalala(stats.today_revenue_halala)}</strong>
                <small><Bi en={`${numFmt.format(toNumber(stats.today_jobs))} jobs today`} ar={`${numFmt.format(toNumber(stats.today_jobs))} مهمة اليوم`} /></small>
              </div>
              <div className="metric">
                <span className="metric-label"><Bi en="Serving providers" ar="المزوّدون النشطون" /></span>
                <strong>{numFmt.format(toNumber(stats.online_now))}<small> / {numFmt.format(toNumber(stats.total_providers))}</small></strong>
              </div>
              <div className="metric">
                <span className="metric-label"><Bi en="Active renters" ar="المستأجرون النشطون" /></span>
                <strong>{numFmt.format(toNumber(stats.active_renters))}<small> / {numFmt.format(toNumber(stats.total_renters))}</small></strong>
              </div>
              <div className="metric wide">
                <span className="metric-label"><Bi en="Jobs" ar="المهام" /></span>
                <strong>{numFmt.format(toNumber(stats.total_jobs))}</strong>
                <div className="metric-split">
                  <span><Bi en={`${numFmt.format(toNumber(stats.completed_jobs))} completed`} ar={`${numFmt.format(toNumber(stats.completed_jobs))} مكتملة`} /></span>
                  <span><Bi en={`${numFmt.format(toNumber(stats.failed_jobs))} failed`} ar={`${numFmt.format(toNumber(stats.failed_jobs))} فاشلة`} /></span>
                  <span><Bi en={`${numFmt.format(toNumber(stats.active_jobs))} active`} ar={`${numFmt.format(toNumber(stats.active_jobs))} نشطة`} /></span>
                </div>
              </div>
            </section>

            <section className="admin-two-col">
              <div className="ops-panel" id="inbox">
                <div className="section-head">
                  <div>
                    <p className="admin-kicker"><Bi en="Unified work queue" ar="طابور عمل موحّد" /></p>
                    <h2><Bi en="Ops inbox" ar="صندوق العمليات" /></h2>
                  </div>
                  <span>{tasks.length}</span>
                </div>
                <div className="task-list">
                  {tasks.map((task) => {
                    const label = agentLabel(task.agentMode)
                    return (
                      <article key={task.id} className={`task ${task.severity}`}>
                        <div className="task-main">
                          <div className="task-title-row">
                            <span className="severity-dot" />
                            <h3><Bi en={task.titleEn} ar={task.titleAr} /></h3>
                          </div>
                          <p><Bi en={task.detailEn} ar={task.detailAr} /></p>
                          <div className="task-meta">
                            <span>{task.owner}</span>
                            <span>{task.source}</span>
                            <span><Bi en={label.en} ar={label.ar} /></span>
                          </div>
                        </div>
                        <Link href={task.href} className="task-action">
                          <Bi en="Open" ar="فتح" />
                        </Link>
                      </article>
                    )
                  })}
                </div>
              </div>

              <div className="agent-panel" id="agents">
                <div className="section-head">
                  <div>
                    <p className="admin-kicker"><Bi en="Humans and agents" ar="البشر والوكلاء" /></p>
                    <h2><Bi en="Permission ladder" ar="سُلّم الصلاحيات" /></h2>
                  </div>
                </div>
                <div className="agent-ladder">
                  <div>
                    <b>01</b>
                    <strong><Bi en="Read" ar="قراءة" /></strong>
                    <p><Bi en="Inspect entities, incidents, balances, and health." ar="فحص الكيانات والحوادث والأرصدة والصحة." /></p>
                  </div>
                  <div>
                    <b>02</b>
                    <strong><Bi en="Notify" ar="تنبيه" /></strong>
                    <p><Bi en="Create alerts and summarize what changed." ar="إنشاء تنبيهات وتلخيص ما تغيّر." /></p>
                  </div>
                  <div>
                    <b>03</b>
                    <strong><Bi en="Propose" ar="اقتراح" /></strong>
                    <p><Bi en="Draft actions with evidence, risk, and rollback notes." ar="صياغة إجراءات مع دليل ومخاطر وملاحظات رجوع." /></p>
                  </div>
                  <div>
                    <b>04</b>
                    <strong><Bi en="Guarded write" ar="كتابة محروسة" /></strong>
                    <p><Bi en="Low-risk writes only by policy; money and fleet changes need human approval." ar="كتابة منخفضة المخاطر فقط حسب السياسة؛ المال والأسطول بموافقة بشرية." /></p>
                  </div>
                </div>
                <div className="agent-note">
                  <span><Bi en="Task envelope" ar="غلاف المهمة" /></span>
                  <p><Bi en="Every future agent action should carry owner, evidence, proposed change, permission class, and audit outcome." ar="كل إجراء مستقبلي للوكيل يجب أن يحمل المالك والدليل والتغيير المقترح وفئة الصلاحية ونتيجة التدقيق." /></p>
                </div>
              </div>
            </section>

            <section className="workflow-strip" id="workflows">
              <div className="section-head">
                <div>
                  <p className="admin-kicker"><Bi en="Operating model" ar="نموذج التشغيل" /></p>
                  <h2><Bi en="Workflow health" ar="صحة التدفقات" /></h2>
                </div>
              </div>
              <div className="workflow-grid">
                {workflows.map((item) => (
                  <article key={item.key} className={`workflow ${item.status}`}>
                    <div>
                      <span><Bi en={item.labelEn} ar={item.labelAr} /></span>
                      <strong>{item.value}</strong>
                    </div>
                    <p><Bi en={item.noteEn} ar={item.noteAr} /></p>
                  </article>
                ))}
              </div>
            </section>

            <section className="future-map">
              <div>
                <p className="admin-kicker"><Bi en="Next build layer" ar="طبقة البناء التالية" /></p>
                <h2><Bi en="What this interface is preparing for" ar="ما الذي تجهّزه هذه الواجهة" /></h2>
              </div>
              <div className="future-list">
                <span><Bi en="team roles" ar="أدوار الفريق" /></span>
                <span><Bi en="task ownership" ar="ملكية المهام" /></span>
                <span><Bi en="agent identities" ar="هويات الوكلاء" /></span>
                <span><Bi en="approval gates" ar="بوابات الموافقة" /></span>
                <span><Bi en="entity timelines" ar="جداول الكيانات" /></span>
                <span><Bi en="runbooks" ar="كتيبات التشغيل" /></span>
                <span><Bi en="incident summaries" ar="ملخصات الحوادث" /></span>
                <span><Bi en="access reviews" ar="مراجعات الوصول" /></span>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

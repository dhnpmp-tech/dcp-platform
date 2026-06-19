'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import SiteShell from '../components/chrome/SiteShell'
import { useLanguage } from '@/app/lib/i18n'

type ArtifactState = 'available' | 'planned'

interface Artifact {
  id: string
  title: string
  description: string
  state: ArtifactState
  href?: string
  asOf: string
  category: string
}

interface RoadmapCard {
  id: string
  title: string
  status: 'planned' | 'in_progress' | 'targeting_audit'
  target: string
  owner: string
  asOf: string
  detail: string
}

interface CopyBundle {
  hero: {
    badge: string
    title: string
    subtitle: string
  }
  sections: {
    compliance: string
    evidence: string
    roadmap: string
    procurement: string
  }
  cta: {
    title: string
    primary: string
    secondary: string
    helper: string
  }
  labels: {
    asOf: string
    available: string
    planned: string
    statusPlanned: string
    statusInProgress: string
    statusTargetingAudit: string
    sectionError: string
  }
  compliancePoints: Array<{ id: string; title: string; body: string }>
}

const API_SECTIONS = {
  evidence: '/api/trust-center/evidence',
  roadmap: '/api/trust-center/roadmap',
} as const

const DEFAULT_EVIDENCE: Record<'en' | 'ar', Artifact[]> = {
  en: [
    {
      id: 'pdpl-privacy-policy',
      title: 'PDPL Privacy Policy Controls',
      description: 'Operational privacy controls, retention windows, and legal basis summaries.',
      state: 'available',
      href: '/privacy',
      asOf: '2026-04-01',
      category: 'PDPL',
    },
    {
      id: 'security-whitepaper',
      title: 'Security Baseline Whitepaper',
      description: 'Network, container, and key-management controls currently enforced in production.',
      state: 'available',
      // Repointed from the dead /docs/enterprise-trust-package/* path (404) to the
      // live /security page, which is the real home for these production controls.
      href: '/security',
      asOf: '2026-04-01',
      category: 'Security',
    },
    {
      id: 'sla-trust-appendix',
      title: 'SLA and Trust Appendix',
      description: 'Service-level terms and trust control checklist for enterprise reviews.',
      state: 'available',
      // Repointed from the dead /docs/enterprise-trust-package/* path (404) to the
      // live /terms page, where the effective service-level terms actually live.
      href: '/terms',
      asOf: '2026-04-01',
      category: 'Operations',
    },
    {
      id: 'audit-log-export-contract',
      title: 'Audit Log Export Contract',
      description: 'Planned export bundle for evidence-ready job, payment, and admin traces.',
      state: 'planned',
      asOf: '2026-04-01',
      category: 'Audit',
    },
    {
      id: 'in-kingdom-residency-attestation',
      title: 'In-Kingdom Data Residency Attestation',
      description: 'Planned formal attestation package for procurement and legal teams.',
      state: 'planned',
      asOf: '2026-04-01',
      category: 'Residency',
    },
  ],
  ar: [
    {
      id: 'pdpl-privacy-policy',
      title: 'ضوابط الخصوصية وفق PDPL',
      description: 'ضوابط الخصوصية الفعلية، مدد الاحتفاظ، وأسس المعالجة القانونية.',
      state: 'available',
      href: '/privacy',
      asOf: '2026-04-01',
      category: 'PDPL',
    },
    {
      id: 'security-whitepaper',
      title: 'الورقة الأمنية الأساسية',
      description: 'ضوابط الشبكة والحاويات وإدارة المفاتيح المطبقة حالياً في الإنتاج.',
      state: 'available',
      // See EN note above: repointed to the live /security page.
      href: '/security',
      asOf: '2026-04-01',
      category: 'Security',
    },
    {
      id: 'sla-trust-appendix',
      title: 'ملحق SLA والثقة',
      description: 'شروط مستوى الخدمة وقائمة ضوابط الثقة لمراجعات المؤسسات.',
      state: 'available',
      // See EN note above: repointed to the live /terms page.
      href: '/terms',
      asOf: '2026-04-01',
      category: 'Operations',
    },
    {
      id: 'audit-log-export-contract',
      title: 'عقد تصدير سجل التدقيق',
      description: 'حزمة تصدير مخططة لسجلات الوظائف والمدفوعات وإجراءات الإدارة.',
      state: 'planned',
      asOf: '2026-04-01',
      category: 'Audit',
    },
    {
      id: 'in-kingdom-residency-attestation',
      title: 'إثبات إقامة البيانات داخل المملكة',
      description: 'حزمة اعتماد رسمية مخططة لمسارات المشتريات والمراجعة القانونية.',
      state: 'planned',
      asOf: '2026-04-01',
      category: 'Residency',
    },
  ],
}

const DEFAULT_ROADMAP: Record<'en' | 'ar', RoadmapCard[]> = {
  en: [
    {
      id: 'soc2-type-ii',
      title: 'SOC 2 Type II',
      status: 'in_progress',
      target: 'Scope freeze by Q3 2026',
      owner: 'Security + Platform',
      asOf: '2026-04-01',
      detail: 'Control mapping is active; evidence collection cadence is weekly.',
    },
    {
      id: 'iso-27001',
      title: 'ISO 27001',
      status: 'planned',
      target: 'Gap assessment in Q3 2026',
      owner: 'Compliance',
      asOf: '2026-04-01',
      detail: 'Statement of applicability and policy harmonization are queued.',
    },
    {
      id: 'residency-audit-pack',
      title: 'Data Residency Audit Pack',
      status: 'targeting_audit',
      target: 'Customer-ready pack in Q2 2026',
      owner: 'Enterprise Success',
      asOf: '2026-04-01',
      detail: 'Attestation templates and escalation workflow are being finalized.',
    },
  ],
  ar: [
    {
      id: 'soc2-type-ii',
      title: 'SOC 2 Type II',
      status: 'in_progress',
      target: 'تجميد النطاق خلال الربع الثالث 2026',
      owner: 'الأمن + المنصة',
      asOf: '2026-04-01',
      detail: 'مواءمة الضوابط جارية، وتجميع الأدلة يتم أسبوعياً.',
    },
    {
      id: 'iso-27001',
      title: 'ISO 27001',
      status: 'planned',
      target: 'تحليل الفجوات في الربع الثالث 2026',
      owner: 'الامتثال',
      asOf: '2026-04-01',
      detail: 'تجهيز بيان التطبيق وتوحيد السياسات ضمن المسار القادم.',
    },
    {
      id: 'residency-audit-pack',
      title: 'حزمة تدقيق إقامة البيانات',
      status: 'targeting_audit',
      target: 'حزمة جاهزة للعملاء في الربع الثاني 2026',
      owner: 'نجاح المؤسسات',
      asOf: '2026-04-01',
      detail: 'قوالب الاعتماد ومسار التصعيد النهائي قيد الإنهاء.',
    },
  ],
}

const COPY: Record<'en' | 'ar', CopyBundle> = {
  en: {
    hero: {
      badge: 'Enterprise Trust Center',
      title: 'Trust Artifacts for PDPL, Security, and Procurement Reviews',
      subtitle:
        'A live view of current controls, available evidence, and certification roadmap status for Saudi enterprise buyers.',
    },
    sections: {
      compliance: 'Control Posture',
      evidence: 'Evidence Library',
      roadmap: 'Certification Roadmap',
      procurement: 'Procurement Path',
    },
    cta: {
      title: 'Start Enterprise Review',
      primary: 'Contact Enterprise Support',
      secondary: 'Open Security Whitepaper',
      helper: 'Response target: first contact in one business day.',
    },
    labels: {
      asOf: 'As of',
      available: 'Available',
      planned: 'Planned',
      statusPlanned: 'Planned',
      statusInProgress: 'In Progress',
      statusTargetingAudit: 'Targeting Audit',
      sectionError: 'Section temporarily unavailable',
    },
    compliancePoints: [
      {
        id: 'pdpl',
        title: 'PDPL-oriented data handling',
        body: 'Policy and operational controls are documented with explicit retention and escalation paths.',
      },
      {
        id: 'residency',
        title: 'In-Kingdom workload posture',
        body: 'Enterprise review tracks focus on Saudi processing controls and verifiable infrastructure ownership.',
      },
      {
        id: 'audit',
        title: 'Auditability by design',
        body: 'Job lifecycle and administrative actions are aligned to exportable evidence requirements.',
      },
    ],
  },
  ar: {
    hero: {
      badge: 'مركز الثقة للمؤسسات',
      title: 'أدلة الثقة لمراجعات PDPL والأمن والمشتريات',
      subtitle:
        'عرض حي للضوابط الحالية، الأدلة المتاحة، وحالة خارطة الشهادات لعملاء المؤسسات في السعودية.',
    },
    sections: {
      compliance: 'وضع الضوابط',
      evidence: 'مكتبة الأدلة',
      roadmap: 'خارطة الشهادات',
      procurement: 'مسار المشتريات',
    },
    cta: {
      title: 'ابدأ مراجعة المؤسسة',
      primary: 'تواصل مع دعم المؤسسات',
      secondary: 'افتح الورقة الأمنية',
      helper: 'هدف الاستجابة: تواصل أولي خلال يوم عمل واحد.',
    },
    labels: {
      asOf: 'آخر تحديث',
      available: 'متاح',
      planned: 'مخطط',
      statusPlanned: 'مخطط',
      statusInProgress: 'قيد التنفيذ',
      statusTargetingAudit: 'جاهزية تدقيق',
      sectionError: 'القسم غير متاح مؤقتاً',
    },
    compliancePoints: [
      {
        id: 'pdpl',
        title: 'إدارة بيانات متوافقة مع PDPL',
        body: 'الضوابط والسياسات التشغيلية موثقة مع مدد احتفاظ ومسارات تصعيد واضحة.',
      },
      {
        id: 'residency',
        title: 'وضع المعالجة داخل المملكة',
        body: 'مسار التقييم المؤسسي يركز على ضوابط المعالجة في السعودية وإثباتات البنية التحتية.',
      },
      {
        id: 'audit',
        title: 'قابلية تدقيق مدمجة',
        body: 'دورة حياة الوظائف وإجراءات الإدارة مرتبطة بمتطلبات أدلة قابلة للتصدير.',
      },
    ],
  },
}

function parseJsonError(rawText: string): string | null {
  if (!rawText) return null
  try {
    const parsed = JSON.parse(rawText) as { error?: string }
    if (typeof parsed?.error === 'string' && parsed.error.trim()) {
      return parsed.error
    }
    return null
  } catch {
    return null
  }
}

function trackTrustCenterEvent(
  event: string,
  language: 'en' | 'ar',
  direction: 'ltr' | 'rtl',
  payload: Record<string, unknown> = {}
) {
  if (typeof window === 'undefined') return

  const detail = {
    event,
    source_page: 'trust_center',
    locale: language,
    direction,
    surface: 'trust_center',
    ...payload,
  }

  window.dispatchEvent(new CustomEvent('dc1_analytics', { detail }))

  const win = window as typeof window & {
    dataLayer?: Array<Record<string, unknown>>
    gtag?: (...args: unknown[]) => void
  }

  if (Array.isArray(win.dataLayer)) {
    win.dataLayer.push(detail)
  }

  if (typeof win.gtag === 'function') {
    win.gtag('event', event, detail)
  }
}

export default function TrustCenterPage() {
  const { language, dir } = useLanguage()
  const locale = language === 'ar' ? 'ar' : 'en'
  const copy = COPY[locale]

  const [evidence, setEvidence] = useState<Artifact[]>(DEFAULT_EVIDENCE[locale])
  const [roadmap, setRoadmap] = useState<RoadmapCard[]>(DEFAULT_ROADMAP[locale])
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({})
  const hasTrackedInitialView = useRef(false)

  useEffect(() => {
    setEvidence(DEFAULT_EVIDENCE[locale])
    setRoadmap(DEFAULT_ROADMAP[locale])
  }, [locale])

  useEffect(() => {
    if (hasTrackedInitialView.current) return
    hasTrackedInitialView.current = true
    trackTrustCenterEvent('trust_center_viewed', locale, dir)
  }, [dir, locale])

  useEffect(() => {
    const pullSection = async (
      sectionKey: keyof typeof API_SECTIONS,
      onSuccess: (value: unknown) => void
    ) => {
      try {
        const response = await fetch(API_SECTIONS[sectionKey], { cache: 'no-store' })
        const raw = await response.text()

        if (!response.ok) {
          const message = parseJsonError(raw)
          if (message) {
            setSectionErrors((prev) => ({ ...prev, [sectionKey]: message }))
            trackTrustCenterEvent('trust_center_error_seen', locale, dir, {
              section: sectionKey,
              error: message,
              status_code: response.status,
            })
          }
          return
        }

        if (!raw) return

        const parsed = JSON.parse(raw)
        onSuccess(parsed)
      } catch {
        // Keep static fallback when API is unavailable.
      }
    }

    void pullSection('evidence', (payload) => {
      if (Array.isArray(payload)) {
        const normalized = payload
          .filter((entry) => entry && typeof entry === 'object')
          .map((entry) => entry as Artifact)
          .filter((entry) => entry.id && entry.title && entry.state)

        if (normalized.length > 0) {
          setEvidence(normalized)
        }
      }
    })

    void pullSection('roadmap', (payload) => {
      if (Array.isArray(payload)) {
        const normalized = payload
          .filter((entry) => entry && typeof entry === 'object')
          .map((entry) => entry as RoadmapCard)
          .filter((entry) => entry.id && entry.title && entry.status)

        if (normalized.length > 0) {
          setRoadmap(normalized)
        }
      }
    })
  }, [dir, locale])

  const statusLabels = useMemo(
    () => ({
      planned: copy.labels.statusPlanned,
      in_progress: copy.labels.statusInProgress,
      targeting_audit: copy.labels.statusTargetingAudit,
    }),
    [copy.labels.statusInProgress, copy.labels.statusPlanned, copy.labels.statusTargetingAudit]
  )

  return (
    <SiteShell active="/trust-center">
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 lg:px-8 lg:pb-12" dir={dir}>
        <section className="rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-dc1-amber">{copy.hero.badge}</p>
          <h1 className="mt-3 text-3xl font-bold text-dc1-text-primary sm:text-4xl">{copy.hero.title}</h1>
          <p className="mt-3 max-w-3xl text-dc1-text-secondary">{copy.hero.subtitle}</p>

          <div className="mt-6 flex flex-wrap gap-2" aria-label="Trust center sections" data-testid="trust-center-sections">
            {[
              ['compliance', copy.sections.compliance],
              ['evidence', copy.sections.evidence],
              ['roadmap', copy.sections.roadmap],
              ['procurement', copy.sections.procurement],
            ].map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={() => {
                  trackTrustCenterEvent('trust_center_section_nav_clicked', locale, dir, {
                    section: id,
                  })
                }}
                className="rounded-md border border-dc1-border bg-dc1-surface-l2 px-3 py-1.5 text-sm text-dc1-text-secondary hover:border-dc1-amber hover:text-dc1-text-primary"
              >
                {label}
              </a>
            ))}
          </div>
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <section id="compliance" className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-6" data-testid="trust-section-compliance">
              <h2 className="text-xl font-semibold text-dc1-text-primary">{copy.sections.compliance}</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                {copy.compliancePoints.map((point) => (
                  <article key={point.id} className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4">
                    <h3 className="text-sm font-semibold text-dc1-text-primary">{point.title}</h3>
                    <p className="mt-2 text-sm text-dc1-text-secondary">{point.body}</p>
                  </article>
                ))}
              </div>
            </section>

            <section id="evidence" className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-6" data-testid="trust-section-evidence">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-xl font-semibold text-dc1-text-primary">{copy.sections.evidence}</h2>
                {sectionErrors.evidence ? (
                  <p className="text-xs text-rose-300" data-testid="trust-error-evidence">
                    {copy.labels.sectionError}: {sectionErrors.evidence}
                  </p>
                ) : null}
              </div>
              <div className="mt-4 grid gap-4">
                {evidence.map((item) => (
                  <article key={item.id} className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4" data-testid={`artifact-${item.id}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-dc1-void px-2 py-0.5 text-[11px] text-dc1-text-muted" dir="ltr">
                        {item.category}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                          item.state === 'available'
                            ? 'bg-emerald-500/20 text-emerald-200'
                            : 'bg-amber-500/20 text-amber-200'
                        }`}
                        data-testid={`artifact-state-${item.id}`}
                      >
                        {item.state === 'available' ? copy.labels.available : copy.labels.planned}
                      </span>
                      <span className="text-[11px] text-dc1-text-muted">
                        {copy.labels.asOf} {item.asOf}
                      </span>
                    </div>

                    <h3 className="mt-2 text-base font-semibold text-dc1-text-primary">{item.title}</h3>
                    <p className="mt-2 text-sm text-dc1-text-secondary">{item.description}</p>

                    <div className="mt-3">
                      {item.state === 'available' && item.href ? (
                        <Link
                          href={item.href}
                          className="text-sm font-medium text-dc1-amber hover:text-dc1-amber/80"
                          onClick={() => {
                            trackTrustCenterEvent('trust_center_artifact_clicked', locale, dir, {
                              artifact_id: item.id,
                              artifact_state: item.state,
                              destination: item.href,
                            })
                          }}
                          data-testid={`artifact-link-${item.id}`}
                        >
                          {locale === 'ar' ? 'عرض الدليل' : 'View artifact'}
                        </Link>
                      ) : (
                        <span className="text-sm text-dc1-text-muted" data-testid={`artifact-placeholder-${item.id}`}>
                          {locale === 'ar' ? 'سيتوفر بعد اكتمال المسار' : 'Will be published when milestone is complete'}
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section id="roadmap" className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-6" data-testid="trust-section-roadmap">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-xl font-semibold text-dc1-text-primary">{copy.sections.roadmap}</h2>
                {sectionErrors.roadmap ? (
                  <p className="text-xs text-rose-300" data-testid="trust-error-roadmap">
                    {copy.labels.sectionError}: {sectionErrors.roadmap}
                  </p>
                ) : null}
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                {roadmap.map((card) => (
                  <article key={card.id} className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4" data-testid={`roadmap-${card.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-dc1-text-primary" dir="ltr">{card.title}</h3>
                      <span className="rounded bg-dc1-void px-2 py-0.5 text-[11px] text-dc1-text-muted">
                        {statusLabels[card.status]}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-dc1-text-secondary">{card.detail}</p>
                    <p className="mt-3 text-xs text-dc1-text-muted" dir="ltr">{card.target}</p>
                    <p className="mt-1 text-xs text-dc1-text-muted">{card.owner}</p>
                    <p className="mt-1 text-xs text-dc1-text-muted">
                      {copy.labels.asOf} {card.asOf}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <section id="procurement" className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-6" data-testid="trust-section-procurement">
              <h2 className="text-xl font-semibold text-dc1-text-primary">{copy.sections.procurement}</h2>
              <p className="mt-3 text-sm text-dc1-text-secondary">
                {locale === 'ar'
                  ? 'ابدأ بمشاركة متطلبات الامتثال ونطاق العمل، وسيرد فريق المؤسسات بخطة تقييم واضحة وقابلة للتدقيق.'
                  : 'Share your compliance scope and workload profile; the enterprise team returns a review plan with explicit controls and decision checkpoints.'}
              </p>
              <div className="mt-4 rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4" dir="ltr">
                <p className="font-mono text-xs text-dc1-text-muted">/support?category=enterprise&source=trust-center</p>
              </div>
            </section>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5" data-testid="trust-sticky-cta-desktop">
              <p className="text-sm font-semibold text-dc1-text-primary">{copy.cta.title}</p>
              <p className="mt-2 text-xs text-dc1-text-secondary">{copy.cta.helper}</p>
              <div className="mt-4 flex flex-col gap-2">
                <Link
                  href="/support?category=enterprise&source=trust-center#contact-form"
                  className="btn btn-primary text-center"
                  onClick={() => {
                    trackTrustCenterEvent('trust_center_cta_clicked', locale, dir, {
                      cta_id: 'enterprise_support',
                      destination: '/support?category=enterprise&source=trust-center#contact-form',
                    })
                  }}
                  data-testid="trust-cta-primary"
                >
                  {copy.cta.primary}
                </Link>
                <Link
                  href="/security"
                  className="btn btn-secondary text-center"
                  onClick={() => {
                    trackTrustCenterEvent('trust_center_cta_clicked', locale, dir, {
                      cta_id: 'security_whitepaper',
                      destination: '/security',
                    })
                  }}
                  data-testid="trust-cta-secondary"
                >
                  {copy.cta.secondary}
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-dc1-border bg-dc1-surface-l1/95 p-3 backdrop-blur lg:hidden" data-testid="trust-sticky-cta-mobile">
        <Link
          href="/support?category=enterprise&source=trust-center-mobile#contact-form"
          className="btn btn-primary w-full justify-center"
          onClick={() => {
            trackTrustCenterEvent('trust_center_cta_clicked', locale, dir, {
              cta_id: 'enterprise_support_mobile',
              destination: '/support?category=enterprise&source=trust-center-mobile#contact-form',
            })
          }}
          data-testid="trust-cta-mobile"
        >
          {copy.cta.primary}
        </Link>
      </div>
    </SiteShell>
  )
}

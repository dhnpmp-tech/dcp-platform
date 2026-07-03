'use client'

// /trust-center — enterprise trust & compliance surface. Redesigned to the
// Midnight editorial-luxury design language (dcp-kit tokens, Instrument Serif
// headings, JetBrains Mono labels, SiteShell chrome). The OLD dc1-* Tailwind
// palette + rounded-card look is gone.
//
// i18n migrated to the (site) V2 i18n (useV2). Locale drives the COPY bundle
// and the live evidence/roadmap fetches keep their static bilingual fallback.
// Behaviour preserved: API hydration, analytics, sticky enterprise CTA,
// procurement path, and the link to the real /security posture page.

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import SiteShell from '../components/chrome/SiteShell'
import { useV2 } from '@/app/(site)/lib/i18n'

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
  hero: { badge: string; title: string; subtitle: string }
  sections: { compliance: string; evidence: string; roadmap: string; procurement: string }
  cta: { title: string; primary: string; secondary: string; helper: string }
  labels: {
    asOf: string
    available: string
    planned: string
    statusPlanned: string
    statusInProgress: string
    statusTargetingAudit: string
    sectionError: string
    viewArtifact: string
    artifactPending: string
    procurementBody: string
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
      href: '/security',
      asOf: '2026-04-01',
      category: 'Security',
    },
    {
      id: 'sla-trust-appendix',
      title: 'SLA and Trust Appendix',
      description: 'Service-level terms and trust control checklist for enterprise reviews.',
      state: 'available',
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
      href: '/security',
      asOf: '2026-04-01',
      category: 'Security',
    },
    {
      id: 'sla-trust-appendix',
      title: 'ملحق SLA والثقة',
      description: 'شروط مستوى الخدمة وقائمة ضوابط الثقة لمراجعات المؤسسات.',
      state: 'available',
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
      title: 'Trust artifacts for PDPL, security, and procurement reviews',
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
      title: 'Start an enterprise review',
      primary: 'Contact enterprise support',
      secondary: 'Open the security posture',
      helper: 'Response target: first contact within one business day.',
    },
    labels: {
      asOf: 'As of',
      available: 'Available',
      planned: 'Planned',
      statusPlanned: 'Planned',
      statusInProgress: 'In Progress',
      statusTargetingAudit: 'Targeting Audit',
      sectionError: 'Section temporarily unavailable',
      viewArtifact: 'View artifact →',
      artifactPending: 'Published when the milestone completes',
      procurementBody:
        'Share your compliance scope and workload profile; the enterprise team returns a review plan with explicit controls and decision checkpoints.',
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
      secondary: 'افتح الوضع الأمني',
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
      viewArtifact: 'عرض الدليل ←',
      artifactPending: 'سيُنشر عند اكتمال المسار',
      procurementBody:
        'شارك متطلبات الامتثال ونطاق العمل، وسيرد فريق المؤسسات بخطة تقييم واضحة وقابلة للتدقيق مع نقاط قرار محددة.',
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
  const { lang, dir } = useV2()
  const locale: 'en' | 'ar' = lang === 'ar' ? 'ar' : 'en'
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

  const sectionLinks: Array<[string, string]> = [
    ['compliance', copy.sections.compliance],
    ['evidence', copy.sections.evidence],
    ['roadmap', copy.sections.roadmap],
    ['enterprise', locale === 'ar' ? 'تشغيل مؤسسي' : 'Enterprise'],
    ['procurement', copy.sections.procurement],
  ]

  return (
    <SiteShell active="/trust-center">
      <main className="trust-center">
        {/* ── Hero ── */}
        <section className="hero" style={{ borderTop: 0 }}>
          <div className="hero-bg hero-bg--photo" aria-hidden="true">
            <img src="/home/skyline.webp" alt="" width={2000} height={849} decoding="async" />
          </div>
          <div className="wrap">
            <div className="hero-meta">
              <span className="left">
                <span className="dot">●</span> {copy.hero.badge}
              </span>
              <span>{locale === 'ar' ? 'حي · يتحدث أسبوعياً' : 'Live · refreshed weekly'}</span>
            </div>
            <span className="eyebrow">{copy.hero.badge}</span>
            <h1 className="hero-h">{copy.hero.title}</h1>
            <p className="hero-sub">{copy.hero.subtitle}</p>
            <div className="hero-ctas">
              {sectionLinks.map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="chip"
                  onClick={() =>
                    trackTrustCenterEvent('trust_center_section_nav_clicked', locale, dir, { section: id })
                  }
                >
                  {label}
                </a>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 26 }}>
              <span className="residency-badge ksa">
                <span className="flag">🇸🇦</span> PDPL
              </span>
              <span className="residency-badge ksa">
                <span className="flag">🇸🇦</span> {locale === 'ar' ? 'داخل المملكة' : 'KSA-resident'}
              </span>
              <span className="residency-badge ksa">
                <span className="flag">🇸🇦</span> ZATCA
              </span>
            </div>
          </div>
        </section>

        {/* ── Control posture ── */}
        <section id="compliance">
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">01 — {copy.sections.compliance}</span>
              <span>{locale === 'ar' ? 'مطبّق في الإنتاج' : 'Enforced in production'}</span>
            </div>
            <div className="grid-3">
              {copy.compliancePoints.map((point) => (
                <article className="surface" key={point.id}>
                  <h3 style={{ fontFamily: 'var(--serif)', fontSize: 24, margin: '0 0 8px', lineHeight: 1.1 }}>
                    {point.title}
                  </h3>
                  <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>{point.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Evidence library ── */}
        <section id="evidence">
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">02 — {copy.sections.evidence}</span>
              {sectionErrors.evidence ? (
                <span style={{ color: 'var(--err)' }} data-testid="trust-error-evidence">
                  {copy.labels.sectionError}: {sectionErrors.evidence}
                </span>
              ) : (
                <span>{locale === 'ar' ? 'متاح ومخطط' : 'Available + planned'}</span>
              )}
            </div>
            <div className="bill-list">
              {evidence.map((item) => (
                <div className="bill-row" key={item.id} data-testid={`artifact-${item.id}`}>
                  <div className="n" dir="ltr">{item.category}</div>
                  <div>
                    <div className="t">{item.title}</div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        className={item.state === 'available' ? 'badge ok' : 'badge warn'}
                        data-testid={`artifact-state-${item.id}`}
                      >
                        <span className="d" />
                        {item.state === 'available' ? copy.labels.available : copy.labels.planned}
                      </span>
                      <span className="badge">
                        {copy.labels.asOf} <span dir="ltr" style={{ marginInlineStart: 4 }}>{item.asOf}</span>
                      </span>
                    </div>
                  </div>
                  <div className="d">
                    <p style={{ margin: '0 0 12px' }}>{item.description}</p>
                    {item.state === 'available' && item.href ? (
                      <Link
                        href={item.href}
                        className="mono"
                        style={{ color: 'var(--teal)', fontSize: 12.5, letterSpacing: '.04em' }}
                        onClick={() =>
                          trackTrustCenterEvent('trust_center_artifact_clicked', locale, dir, {
                            artifact_id: item.id,
                            artifact_state: item.state,
                            destination: item.href,
                          })
                        }
                        data-testid={`artifact-link-${item.id}`}
                      >
                        {copy.labels.viewArtifact}
                      </Link>
                    ) : (
                      <span
                        className="mono"
                        style={{ color: 'var(--mut)', fontSize: 12 }}
                        data-testid={`artifact-placeholder-${item.id}`}
                      >
                        {copy.labels.artifactPending}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Certification roadmap ── */}
        <section id="roadmap">
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">03 — {copy.sections.roadmap}</span>
              {sectionErrors.roadmap ? (
                <span style={{ color: 'var(--err)' }} data-testid="trust-error-roadmap">
                  {copy.labels.sectionError}: {sectionErrors.roadmap}
                </span>
              ) : (
                <span>{locale === 'ar' ? '2026 وما بعده' : '2026 and beyond'}</span>
              )}
            </div>
            <div className="grid-3">
              {roadmap.map((card) => (
                <article className="m-card" style={{ gridColumn: 'auto' }} key={card.id} data-testid={`roadmap-${card.id}`}>
                  <span className="org" dir="ltr">{statusLabels[card.status]}</span>
                  <h3 className="mname" dir="ltr">{card.title}</h3>
                  <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, color: 'var(--ink-2)' }}>{card.detail}</p>
                  <div className="mrow">
                    <span dir="ltr">{card.target}</span>
                    <b dir="ltr">{card.owner}</b>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Enterprise: run it in your own VPC ── */}
        <section id="enterprise">
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">★ {locale === 'ar' ? 'تشغيل مؤسسي' : 'Enterprise deployment'}</span>
              <span>{locale === 'ar' ? 'بيئتك الخاصة · سيادة كاملة' : 'Your environment · full sovereignty'}</span>
            </div>
            <div className="grid-2">
              <div>
                <h2 className="st">
                  {locale === 'ar' ? (
                    <>شغّله في بيئتك الخاصة — <em style={{ fontStyle: 'normal', backgroundImage: 'var(--grad)', backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent' }}>تحت سيطرتك الكاملة.</em></>
                  ) : (
                    <>Run it in your own VPC — <em style={{ fontStyle: 'italic', backgroundImage: 'var(--grad)', backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent' }}>under your full control.</em></>
                  )}
                </h2>
                <p className="ss">
                  {locale === 'ar'
                    ? 'للبنوك والمستشفيات والجهات التنظيمية والوكالات: انشر DCP داخل بيئتك الخاصة على بنية تحتية سعودية، مع اتفاقية معالجة بيانات (DPA) واتفاقية خدمات رئيسية (MSA) وملحق تدفق البيانات. لا تخرج البيانات من ملكيتك إلا بإذنك.'
                    : 'For banks, hospitals, regulators, and agencies: deploy DCP inside your own VPC on Saudi-owned infrastructure, with a Data Processing Agreement (DPA), Master Services Agreement (MSA), and a data-flow appendix. Your data never leaves your perimeter unless you ask it to.'}
                </p>
                <ul style={{ margin: '20px 0 0', paddingInlineStart: 18, color: 'var(--ink-2)', fontSize: 14, lineHeight: 1.75 }}>
                  {(locale === 'ar'
                    ? [
                        'النشر داخل بيئتك (VPC) على بنية تحتية مملوكة سعودياً',
                        'DPA + MSA + ملحق تدفق البيانات موقّعة',
                        'سعة مخصصة أو محجوزة حسب الطلب',
                        'مدير نجاح عملاء (CSM) مخصص ونقاط قرار واضحة',
                        'مراجعة أمنية مشتركة قبل الإطلاق',
                        'لا نماذج عابرة للحدود إلا بإذن صريح منك',
                      ]
                    : [
                        'In-VPC deployment on Saudi-owned infrastructure',
                        'Signed DPA + MSA + data-flow appendix',
                        'Dedicated or reserved capacity on request',
                        'A named CSM and explicit decision checkpoints',
                        'Joint security review before go-live',
                        'No cross-border models without your explicit opt-in',
                      ]
                  ).map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
              <div className="surface">
                <p style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 22, lineHeight: 1.15 }}>
                  {locale === 'ar' ? 'ابدأ مراجعة مؤسسية' : 'Start an enterprise review'}
                </p>
                <p style={{ marginTop: 10, fontSize: 13, color: 'var(--mut)' }}>
                  {locale === 'ar' ? 'تواصل أولي خلال يوم عمل واحد.' : 'First contact in 1 business day.'}
                </p>
                <div className="col" style={{ marginTop: 18 }}>
                  <Link
                    href="/support?category=enterprise&source=trust-center#contact-form"
                    className="btn primary"
                    style={{ justifyContent: 'center' }}
                    onClick={() =>
                      trackTrustCenterEvent('trust_center_cta_clicked', locale, dir, {
                        cta_id: 'enterprise_vpc_sales',
                        destination: '/support?category=enterprise&source=trust-center#contact-form',
                      })
                    }
                  >
                    {locale === 'ar' ? 'تواصل مع المبيعات ←' : 'Talk to sales →'}
                  </Link>
                  <Link
                    href="/security"
                    className="btn ghost"
                    style={{ justifyContent: 'center' }}
                    onClick={() =>
                      trackTrustCenterEvent('trust_center_cta_clicked', locale, dir, {
                        cta_id: 'security_posture',
                        destination: '/security',
                      })
                    }
                  >
                    {locale === 'ar' ? 'الأمن السيبراني' : 'Security posture'}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Procurement path ── */}
        <section id="procurement">
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">04 — {copy.sections.procurement}</span>
              <span>{locale === 'ar' ? 'تواصل أولي خلال يوم عمل' : 'First contact in 1 business day'}</span>
            </div>
            <div className="grid-2">
              <div>
                <h2 className="st">{copy.cta.title}</h2>
                <p className="ss">{copy.labels.procurementBody}</p>
                <div className="callout" dir="ltr" style={{ marginTop: 24 }}>
                  <b>{locale === 'ar' ? 'مسار الدخول' : 'Intake route'}</b>
                  <span className="mono" style={{ fontSize: 12.5 }}>
                    /support?category=enterprise&amp;source=trust-center
                  </span>
                </div>
              </div>
              <div className="surface">
                <p style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 22, lineHeight: 1.15 }}>
                  {copy.cta.title}
                </p>
                <p style={{ marginTop: 10, fontSize: 13, color: 'var(--mut)' }}>{copy.cta.helper}</p>
                <div className="col" style={{ marginTop: 18 }}>
                  <Link
                    href="/support?category=enterprise&source=trust-center#contact-form"
                    className="btn primary"
                    style={{ justifyContent: 'center' }}
                    onClick={() =>
                      trackTrustCenterEvent('trust_center_cta_clicked', locale, dir, {
                        cta_id: 'enterprise_support',
                        destination: '/support?category=enterprise&source=trust-center#contact-form',
                      })
                    }
                    data-testid="trust-cta-primary"
                  >
                    {copy.cta.primary}
                  </Link>
                  <Link
                    href="/security"
                    className="btn ghost"
                    style={{ justifyContent: 'center' }}
                    onClick={() =>
                      trackTrustCenterEvent('trust_center_cta_clicked', locale, dir, {
                        cta_id: 'security_posture',
                        destination: '/security',
                      })
                    }
                    data-testid="trust-cta-secondary"
                  >
                    {copy.cta.secondary}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Mobile sticky enterprise CTA */}
      <div className="trust-sticky-mobile" data-testid="trust-sticky-cta-mobile">
        <Link
          href="/support?category=enterprise&source=trust-center-mobile#contact-form"
          className="btn primary"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={() =>
            trackTrustCenterEvent('trust_center_cta_clicked', locale, dir, {
              cta_id: 'enterprise_support_mobile',
              destination: '/support?category=enterprise&source=trust-center-mobile#contact-form',
            })
          }
          data-testid="trust-cta-mobile"
        >
          {copy.cta.primary}
        </Link>
      </div>

      <style jsx>{`
        .trust-sticky-mobile {
          position: fixed;
          inset-inline: 16px;
          bottom: 16px;
          z-index: 40;
          background: color-mix(in oklab, var(--paper) 94%, transparent);
          border: 1px solid var(--line);
          border-radius: 2px;
          padding: 12px;
          backdrop-filter: blur(8px);
          box-shadow: 0 20px 50px -20px rgba(0, 0, 0, 0.6);
        }
        @media (min-width: 901px) {
          .trust-sticky-mobile {
            display: none;
          }
        }
      `}</style>
    </SiteShell>
  )
}

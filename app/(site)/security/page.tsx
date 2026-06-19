'use client'

// /security — DCP's public security posture. This page is the real home for the
// production security controls that the trust center links to as the "Security
// Baseline Whitepaper" artifact (see app/(site)/trust-center/page.tsx). It was
// previously a 308 → /trust-center placeholder; that redirect is now removed in
// next.config.js so this page resolves directly.
//
// Built in the Midnight editorial-luxury design language (dcp-kit tokens,
// Instrument Serif headings, JetBrains Mono labels, SiteShell chrome),
// bilingual EN/AR via the (site) V2 i18n (useV2).

import Link from 'next/link'
import SiteShell from '../components/chrome/SiteShell'
import { useV2 } from '@/app/(site)/lib/i18n'

interface BiText {
  en: string
  ar: string
}

// Control domains — the production posture, grouped the way an enterprise
// security reviewer reads it.
const DOMAINS: { n: string; title: BiText; body: BiText; points: BiText[] }[] = [
  {
    n: '01',
    title: { en: 'Network & transport', ar: 'الشبكة والنقل' },
    body: {
      en: 'Provider rigs join a private WireGuard mesh; renter traffic reaches the platform over TLS only.',
      ar: 'تنضم أجهزة المزوّدين إلى شبكة WireGuard خاصة؛ ولا تصل حركة المستأجرين إلى المنصة إلا عبر TLS.',
    },
    points: [
      { en: 'Per-peer WireGuard keys — no rig is reachable from the open internet.', ar: 'مفاتيح WireGuard لكل عضو — لا يمكن الوصول إلى أي جهاز من الإنترنت المفتوح.' },
      { en: 'Public API served over HTTPS with modern TLS and strict transport security.', ar: 'الواجهة العامة تُقدَّم عبر HTTPS بـ TLS حديث وأمن نقل صارم.' },
      { en: 'Inference is routed only to rigs that pass a live reachability + inference probe.', ar: 'يُوجَّه الاستدلال فقط إلى الأجهزة التي تجتاز فحص وصول واستدلال حياً.' },
    ],
  },
  {
    n: '02',
    title: { en: 'Workload isolation', ar: 'عزل الأحمال' },
    body: {
      en: 'Renter inference runs inside an isolated runtime on the provider host — the prompt never touches the host filesystem.',
      ar: 'يعمل استدلال المستأجر داخل بيئة معزولة على مضيف المزوّد — ولا يلامس السؤال نظام ملفات المضيف.',
    },
    points: [
      { en: 'Each job runs in a contained runtime, separate from the host and other tenants.', ar: 'تعمل كل وظيفة في بيئة محتواة، منفصلة عن المضيف وعن بقية المستأجرين.' },
      { en: 'Providers serve compute, not custody — they never see renter data at rest.', ar: 'يقدّم المزوّدون حوسبة لا حفظاً — ولا يرون بيانات المستأجر المخزّنة إطلاقاً.' },
      { en: 'Stronger sandboxing (gVisor-class) is on the roadmap for the sandboxed tier.', ar: 'عزل أقوى (من فئة gVisor) مدرج في خارطة الطريق للطبقة المعزولة.' },
    ],
  },
  {
    n: '03',
    title: { en: 'Keys & access', ar: 'المفاتيح والوصول' },
    body: {
      en: 'Renter and provider keys are scoped, revocable, and never logged in clear text.',
      ar: 'مفاتيح المستأجرين والمزوّدين محدّدة النطاق وقابلة للإلغاء ولا تُسجَّل بنص واضح أبداً.',
    },
    points: [
      { en: 'API keys are minted per account and can be rotated or revoked at any time.', ar: 'تُنشأ مفاتيح الواجهة لكل حساب ويمكن تدويرها أو إلغاؤها في أي وقت.' },
      { en: 'Secrets live in environment configuration, never hardcoded in source.', ar: 'تعيش الأسرار في إعدادات البيئة، ولا تُكتب صراحة في الشفرة.' },
      { en: 'Administrative actions are gated and recorded for audit.', ar: 'إجراءات الإدارة محكومة ومسجّلة للتدقيق.' },
    ],
  },
  {
    n: '04',
    title: { en: 'Billing integrity', ar: 'سلامة الفوترة' },
    body: {
      en: 'Only successful inference is billed — metering is atomic, idempotent, and server-measured.',
      ar: 'يُفوتر الاستدلال الناجح فقط — والقياس ذري وغير مكرر ومُقاس على الخادم.',
    },
    points: [
      { en: 'Charges settle server-side, in Saudi Riyal, against measured token usage.', ar: 'تُسوّى الرسوم على الخادم، بالريال السعودي، مقابل استهلاك الرموز المقاس.' },
      { en: 'A balance gate returns HTTP 402 before any unpaid work runs.', ar: 'تعيد بوابة الرصيد رمز HTTP 402 قبل تشغيل أي عمل غير مدفوع.' },
      { en: 'Settlement is idempotent — a retried request cannot double-charge.', ar: 'التسوية غير قابلة للتكرار — لا يمكن لطلب مُعاد أن يخصم مرتين.' },
    ],
  },
]

// Residency / sovereignty posture — three terse guarantees.
const RESIDENCY: { k: string; body: BiText }[] = [
  {
    k: 'in_kingdom_default',
    body: { en: 'Sovereign requests touch only verified Saudi GPUs and never leave the Kingdom.', ar: 'الطلبات السيادية تلامس فقط معالجات سعودية متحققة ولا تغادر المملكة.' },
  },
  {
    k: 'frontier_opt_in',
    body: { en: 'Cross-border frontier models stay off until a tenant explicitly enables them.', ar: 'النماذج المتقدّمة عبر الحدود تبقى مغلقة حتى يفعّلها العميل صراحةً.' },
  },
  {
    k: 'pdpl_audit_trail',
    body: { en: 'Every route is logged for PDPL residency compliance.', ar: 'يُسجَّل كل توجيه لامتثال إقامة البيانات وفق PDPL.' },
  },
]

// Practices — how we run security day to day.
const PRACTICES: { title: BiText; body: BiText }[] = [
  {
    title: { en: 'Input validation at every boundary', ar: 'التحقق من المدخلات عند كل حد' },
    body: {
      en: 'Untrusted input is validated before it is processed; the platform fails fast with clear errors.',
      ar: 'يُتحقَّق من المدخلات غير الموثوقة قبل معالجتها؛ وتفشل المنصة بسرعة برسائل واضحة.',
    },
  },
  {
    title: { en: 'Least privilege', ar: 'أقل صلاحية' },
    body: {
      en: 'Services and accounts get only the access they need, and admin surfaces are gated.',
      ar: 'تحصل الخدمات والحسابات على الوصول اللازم فقط، وتكون أسطح الإدارة محكومة.',
    },
  },
  {
    title: { en: 'Audit-ready logging', ar: 'تسجيل جاهز للتدقيق' },
    body: {
      en: 'Job lifecycle, payment, and administrative actions are aligned to exportable evidence.',
      ar: 'دورة حياة الوظائف والمدفوعات وإجراءات الإدارة مرتبطة بأدلة قابلة للتصدير.',
    },
  },
  {
    title: { en: 'Coordinated disclosure', ar: 'إفصاح منسّق' },
    body: {
      en: 'Report a vulnerability to security@dcp.sa; we triage and respond before disclosure.',
      ar: 'أبلغ عن ثغرة إلى security@dcp.sa؛ نقوم بالفرز والرد قبل الإفصاح.',
    },
  },
]

export default function SecurityPage() {
  const { lang } = useV2()
  const isAr = lang === 'ar'
  const tr = (b: BiText) => (isAr ? b.ar : b.en)
  const rich = (en: React.ReactNode, ar: React.ReactNode) => (isAr ? ar : en)

  return (
    <SiteShell active="/trust-center">
      <main className="security">
        {/* ── Hero ── */}
        <section className="hero" style={{ borderTop: 0 }}>
          <div className="wrap">
            <div className="hero-meta">
              <span className="left">
                <span className="dot">●</span> {isAr ? 'الوضع الأمني · مطبّق في الإنتاج' : 'Security posture · enforced in production'}
              </span>
              <span>{isAr ? 'يصاحب مركز الثقة' : 'Companion to the trust center'}</span>
            </div>
            <span className="eyebrow">{isAr ? 'الأمن' : 'Security'}</span>
            <h1 className="hero-h">
              {rich(
                <>Sovereign by default, <em>secured</em> by design.</>,
                <>سيادي افتراضياً، <em>آمن</em> بالتصميم.</>
              )}
            </h1>
            <p className="hero-sub">
              {tr({
                en: 'The production controls behind every DCP request — network, isolation, keys, billing integrity, and Saudi data residency. This is the security baseline the trust center references.',
                ar: 'الضوابط الإنتاجية خلف كل طلب في DCP — الشبكة والعزل والمفاتيح وسلامة الفوترة وإقامة البيانات في السعودية. هذا هو الأساس الأمني الذي يشير إليه مركز الثقة.',
              })}
            </p>
            <div className="hero-ctas">
              <Link href="/support?category=enterprise&source=security#contact-form" className="btn primary lg">
                {tr({ en: 'Request a security review →', ar: 'اطلب مراجعة أمنية ←' })}
              </Link>
              <Link href="/trust-center" className="btn ghost lg">
                {tr({ en: 'Trust center', ar: 'مركز الثقة' })}
              </Link>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 26 }}>
              <span className="residency-badge ksa">
                <span className="flag">🇸🇦</span> PDPL
              </span>
              <span className="residency-badge ksa">
                <span className="flag">🇸🇦</span> {isAr ? 'داخل المملكة' : 'KSA-resident'}
              </span>
              <span className="residency-badge">
                <span className="flag">🔒</span> {isAr ? 'TLS · WireGuard' : 'TLS · WireGuard'}
              </span>
            </div>
          </div>
        </section>

        {/* ── Control domains ── */}
        <section>
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">01 — {tr({ en: 'Control domains', ar: 'مجالات الضوابط' })}</span>
              <span>{tr({ en: 'How a request stays safe', ar: 'كيف يبقى الطلب آمناً' })}</span>
            </div>
            <div className="grid-2">
              {DOMAINS.map((d) => (
                <article className="surface" key={d.n}>
                  <span className="mono" style={{ color: 'var(--teal)', fontSize: 11, letterSpacing: '.14em' }}>
                    {d.n}
                  </span>
                  <h3 style={{ fontFamily: 'var(--serif)', fontSize: 26, margin: '8px 0 8px', lineHeight: 1.1 }}>
                    {tr(d.title)}
                  </h3>
                  <p style={{ margin: '0 0 14px', fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>{tr(d.body)}</p>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {d.points.map((p) => (
                      <li
                        key={p.en}
                        style={{
                          display: 'flex',
                          gap: 12,
                          padding: '10px 0',
                          borderTop: '1px solid var(--hair)',
                          fontSize: 13.5,
                          lineHeight: 1.55,
                          color: 'var(--ink)',
                        }}
                      >
                        <span style={{ color: 'var(--teal)', fontFamily: 'var(--mono)', fontSize: 12 }}>✓</span>
                        <span>{tr(p)}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Residency ── */}
        <section>
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">02 — {tr({ en: 'Data residency', ar: 'إقامة البيانات' })}</span>
              <span>{tr({ en: 'In-Kingdom by default', ar: 'داخل المملكة افتراضياً' })}</span>
            </div>
            <div className="grid-2">
              <div>
                <h2 className="st">
                  {rich(
                    <>Your data <em>stays</em> in the Kingdom.</>,
                    <>بياناتك <em>تبقى</em> في المملكة.</>
                  )}
                </h2>
                <p className="ss">
                  {tr({
                    en: 'Sovereign requests run end-to-end on verified Saudi GPUs. A cross-border frontier model is the single exception — gated behind explicit per-tenant opt-in and logged distinctly.',
                    ar: 'تعمل الطلبات السيادية بالكامل على معالجات سعودية متحققة. النموذج المتقدّم عبر الحدود هو الاستثناء الوحيد — محكوم بإذن صريح لكل عميل ويُسجَّل بوضوح.',
                  })}
                </p>
              </div>
              <div className="capacity-gates-list" aria-label="Residency guarantees">
                {RESIDENCY.map((g, i) => (
                  <div className="callout" key={g.k} dir="ltr" style={{ marginTop: i === 0 ? 0 : 14 }}>
                    <b>{g.k}</b>
                    <span style={{ display: 'block', direction: isAr ? 'rtl' : 'ltr' }}>{tr(g.body)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Practices ── */}
        <section>
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">03 — {tr({ en: 'How we operate', ar: 'كيف نعمل' })}</span>
              <span>{tr({ en: 'Day-to-day practice', ar: 'الممارسة اليومية' })}</span>
            </div>
            <div className="trust-grid">
              {PRACTICES.map((p, i) => (
                <div className="tr" key={p.title.en}>
                  <div className="n">{String(i + 1).padStart(2, '0')}</div>
                  <h3>{tr(p.title)}</h3>
                  <p>{tr(p.body)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Roadmap note ── */}
        <section>
          <div className="wrap">
            <div className="section-meta">
              <span className="idx">04 — {tr({ en: 'On the roadmap', ar: 'في خارطة الطريق' })}</span>
              <span>{tr({ en: 'Tracked openly', ar: 'متابَع بشفافية' })}</span>
            </div>
            <div className="callout">
              <b>{tr({ en: 'Certifications in progress', ar: 'شهادات قيد التنفيذ' })}</b>
              <p style={{ margin: '0 0 6px' }}>
                {tr({
                  en: 'SOC 2 Type II control mapping is active and ISO 27001 gap assessment is queued. Live status for each artifact lives in the trust center.',
                  ar: 'مواءمة ضوابط SOC 2 Type II جارية، وتقييم فجوات ISO 27001 في الانتظار. الحالة الحية لكل دليل متاحة في مركز الثقة.',
                })}
              </p>
              <Link href="/trust-center#roadmap" className="mono" style={{ color: 'var(--teal)', fontSize: 12.5 }}>
                {tr({ en: 'See the certification roadmap →', ar: 'اطّلع على خارطة الشهادات ←' })}
              </Link>
            </div>
          </div>
        </section>

        {/* ── End CTA ── */}
        <div className="end-cta">
          <div className="wrap">
            <span className="eyebrow" style={{ justifyContent: 'center' }}>
              {tr({ en: 'For procurement & security teams', ar: 'لفرق المشتريات والأمن' })}
            </span>
            <div className="big">
              {rich(
                <>Review the <em>posture</em>.</>,
                <>راجع <em>الوضع</em>.</>
              )}
            </div>
            <p className="ss center">
              {tr({
                en: 'Open an enterprise security review and we will return a control-by-control plan, plus the trust artifacts your team needs.',
                ar: 'افتح مراجعة أمنية مؤسسية وسنعيد خطة ضابطاً بضابط، إضافة إلى أدلة الثقة التي يحتاجها فريقك.',
              })}
            </p>
            <div className="ctas">
              <Link href="/support?category=enterprise&source=security#contact-form" className="btn primary lg">
                {tr({ en: 'Request a security review →', ar: 'اطلب مراجعة أمنية ←' })}
              </Link>
              <a href="mailto:security@dcp.sa" className="btn ghost lg" dir="ltr">
                security@dcp.sa
              </a>
            </div>
          </div>
        </div>
      </main>
    </SiteShell>
  )
}

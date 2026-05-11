import { notFound } from 'next/navigation'
import Link from 'next/link'
import Header from '../../components/layout/Header'
import Footer from '../../components/layout/Footer'
import DocsSidebar from '../../components/docs/DocsSidebar'
import SimpleMdxRenderer from '../../components/docs/SimpleMdxRenderer'
import RoleIntentLink from '../../components/role-intent/RoleIntentLink'
import {
  getBreadcrumbs,
  getDocAlternates,
  getDocBySlug,
  getDocsCatalog,
  normalizeDocSlug,
} from '../../lib/docs'

interface DocsPageProps {
  params: {
    slug?: string[]
  }
}

export default function DocsPage({ params }: DocsPageProps) {
  if (!params.slug || params.slug.length === 0) {
    return (
      <div className="min-h-screen bg-dc1-void">
        <Header />

        <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-dc1-border bg-dc1-surface-l1 p-8 sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-dc1-amber">Docs Portal</p>
            <h1 className="mt-3 text-3xl font-bold text-dc1-text-primary sm:text-4xl">DCP Developer Documentation</h1>
            <p className="mt-4 max-w-3xl text-dc1-text-secondary">
              API-first onboarding for providers and renters on container-based GPU infrastructure in Saudi Arabia. Focus first on secure workflow setup, then scale job routing when demand and policy match.
            </p>
            <p className="mt-2 max-w-3xl text-dc1-text-secondary">
              بوابة توثيق ثنائية اللغة (عربي/إنجليزي) للتأهل السريع في حوسبة GPU داخل السعودية — تشغيل عبر حاويات، مع دعم حقيقي لنماذج الذكاء الاصطناعي العربية.
            </p>
            <div className="mt-6">
              <h2 className="text-lg font-semibold text-dc1-text-primary">Choose your mode</h2>
              <p className="mt-2 max-w-3xl text-sm text-dc1-text-secondary">
                Keep the same operating labels across DCP surfaces so next steps stay predictable.
              </p>
              <p className="mt-2 max-w-3xl text-sm text-dc1-text-secondary">
                اختر الوضع المناسب بنفس التسميات الموحدة عبر المنصة: Marketplace وPlayground وDocs/API وEnterprise Support.
              </p>
              <div className="mt-4 grid gap-3 lg:grid-cols-4">
                <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dc1-amber">Marketplace</p>
                  <p className="mt-2 text-sm text-dc1-text-secondary">
                    Browse live GPU options and shortlist a provider path.
                  </p>
                  <p className="mt-2 text-sm text-dc1-text-secondary">
                    تصفّح السوق الحي وحدد مسار المزود المناسب.
                  </p>
                  <RoleIntentLink href="/renter/marketplace" persistIntent="renter" source="docs_mode_card_marketplace" className="btn btn-primary btn-sm mt-4">
                    Open Marketplace
                  </RoleIntentLink>
                </div>
                <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dc1-amber">Playground</p>
                  <p className="mt-2 text-sm text-dc1-text-secondary">
                    Run a starter workload in-browser before deeper integration.
                  </p>
                  <p className="mt-2 text-sm text-dc1-text-secondary">
                    شغّل حمولة أولية من المتصفح قبل التوسّع في التكامل.
                  </p>
                  <RoleIntentLink href="/renter/playground?starter=1" persistIntent="renter" source="docs_mode_card_playground" className="btn btn-primary btn-sm mt-4">
                    Open Playground
                  </RoleIntentLink>
                </div>
                <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dc1-amber">Docs/API</p>
                  <p className="mt-2 text-sm text-dc1-text-secondary">
                    Use quickstart and API reference to integrate your container workflows.
                  </p>
                  <p className="mt-2 text-sm text-dc1-text-secondary">
                    راجع التوثيق ومرجع API لتكامل الحاويات بشكل واضح.
                  </p>
                  <Link href="/docs/api-reference" className="btn btn-primary btn-sm mt-4">
                    Open Docs/API
                  </Link>
                </div>
                <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dc1-amber">Enterprise Support</p>
                  <p className="mt-2 text-sm text-dc1-text-secondary">
                    Open enterprise procurement, security review, and rollout planning support.
                  </p>
                  <p className="mt-2 text-sm text-dc1-text-secondary">
                    افتح مسار دعم المؤسسات للمشتريات، مراجعة الأمان، وخطة الإطلاق.
                  </p>
                  <RoleIntentLink href="/support?category=enterprise&source=docs-enterprise-support-card" persistIntent="enterprise" source="docs_mode_card_enterprise_support" className="btn btn-primary btn-sm mt-4">
                    Open Enterprise Support
                  </RoleIntentLink>
                </div>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dc1-amber">Sovereign Compute</p>
                <p className="mt-2 text-sm text-dc1-text-secondary">All requests and billing settle inside Saudi Arabia. No US or EU cloud dependency, no cross-border data.</p>
              </div>
              <div className="rounded-lg border border-dc1-border bg-dc1-surface-l2 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dc1-amber">Arabic AI Models</p>
                <p className="mt-2 text-sm text-dc1-text-secondary">ALLaM 7B, Falcon H1, JAIS 13B, and BGE-M3 are documented as supported deployment paths.</p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <RoleIntentLink
                href="/docs/quickstart"
                source="docs_start_quickstart"
                applyDestination="docs_quickstart_cta"
                roleAwareHrefs={{
                  renter: '/docs/quickstart#renter-onboarding-checklist',
                  provider: '/docs/provider-guide#status-waiting-install-daemon',
                  enterprise: '/support?category=enterprise&source=docs-enterprise-support-quickstart',
                }}
                className="btn btn-primary btn-sm"
              >
                Start Quickstart
              </RoleIntentLink>
              <Link href="/docs/api-reference" className="btn btn-secondary btn-sm">View API reference</Link>
            </div>
            <div className="mt-5 rounded-lg border border-dc1-amber/30 bg-dc1-amber/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dc1-amber">Retail Readiness Status</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-md border border-dc1-border bg-dc1-surface-l2 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-dc1-text-primary">Available Now</p>
                  <ul className="mt-2 space-y-1 text-sm text-dc1-text-secondary">
                    <li>Container-based GPU execution with heartbeat visibility</li>
                    <li>Estimate-hold billing in halala with runtime settlement</li>
                    <li>Bilingual onboarding for renter/provider flows</li>
                  </ul>
                </div>
                <div className="rounded-md border border-dc1-border bg-dc1-surface-l2 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-dc1-text-primary">Roadmap Milestones</p>
                  <ul className="mt-2 space-y-1 text-sm text-dc1-text-secondary">
                    <li>Persistent Page Agents platform (planned milestone)</li>
                    <li>Expanded retail automation flows (planned milestone)</li>
                    <li>Payment rail expansion and payout hardening (planned milestone)</li>
                  </ul>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link href="/docs/roadmap/dcp-retail-readiness-2026-Q2" className="btn btn-secondary btn-sm">
                  View roadmap status
                </Link>
                <Link href="/support?category=enterprise&source=docs-enterprise-support-readiness" className="btn btn-secondary btn-sm">
                  Contact enterprise support
                </Link>
              </div>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="mb-5 text-xl font-semibold text-dc1-text-primary">Documentation Map</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Link href="/docs/api/openrouter-60s-quickstart" className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5">
                <h3 className="text-base font-semibold text-dc1-text-primary">60s First Request</h3>
                <p className="mt-1 text-sm text-dc1-text-secondary">Go from signup to first `/v1/chat/completions` call with cURL, Node, and Python paths.</p>
                <p className="mt-2 text-sm text-dc1-text-secondary">من التسجيل إلى أول طلب `/v1/chat/completions` خلال 60 ثانية مع مسارات cURL وNode وPython.</p>
              </Link>
              <Link href="/docs/provider-guide" className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5">
                <h3 className="text-base font-semibold text-dc1-text-primary">Provider Onboarding</h3>
                <p className="mt-1 text-sm text-dc1-text-secondary">Install daemon, verify heartbeat, and start earning with transparent status updates.</p>
                <p className="mt-2 text-sm text-dc1-text-secondary">دليل إعداد المزود: التثبيت، heartbeat، وإظهار حالة التشغيل بوضوح.</p>
              </Link>
              <Link href="/docs/renter-guide" className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5">
                <h3 className="text-base font-semibold text-dc1-text-primary">Renter Onboarding</h3>
                <p className="mt-1 text-sm text-dc1-text-secondary">Fund wallet, choose a provider, submit jobs, and retrieve results safely.</p>
                <p className="mt-2 text-sm text-dc1-text-secondary">دليل المستأجر: التسجيل، اختيار مزود، إرسال الوظيفة واستلام المخرجات.</p>
              </Link>
              <Link href="/docs/api-reference" className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5">
                <h3 className="text-base font-semibold text-dc1-text-primary">API Reference</h3>
                <p className="mt-1 text-sm text-dc1-text-secondary">Auth model, endpoint map, and error contract.</p>
                <p className="mt-2 text-sm text-dc1-text-secondary">مرجع API: المصادقة، النقاط الأساسية، وتنسيق الأخطاء.</p>
              </Link>
              <Link href="/docs/architecture-overview" className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5">
                <h3 className="text-base font-semibold text-dc1-text-primary">Architecture Overview</h3>
                <p className="mt-1 text-sm text-dc1-text-secondary">System map for Next.js, Express, daemon, and sync.</p>
                <p className="mt-2 text-sm text-dc1-text-secondary">نظرة شاملة على بنية النظام ومسار البيانات.</p>
              </Link>
              <Link href="/docs/openapi.yaml" className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-5">
                <h3 className="text-base font-semibold text-dc1-text-primary">OpenAPI Spec</h3>
                <p className="mt-1 text-sm text-dc1-text-secondary">Machine-readable contract for SDKs and tooling.</p>
                <p className="mt-2 text-sm text-dc1-text-secondary">مواصفة آلية للـ SDK والأدوات.</p>
              </Link>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    )
  }

  const normalizedSlug = normalizeDocSlug(params.slug)
  const doc = getDocBySlug(normalizedSlug)

  if (!doc) {
    notFound()
  }

  const { docs, tree } = getDocsCatalog()
  const breadcrumbs = getBreadcrumbs(doc.slugParts)
  const currentPath = `/docs/${doc.slug}`
  const currentLocale = doc.locale
  const alternates = getDocAlternates(doc.slugParts)

  return (
    <div className="min-h-screen bg-dc1-void">
      <Header />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-dc1-border bg-dc1-surface-l1 p-3 lg:hidden">
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-dc1-text-primary">
              {currentLocale === 'ar' ? 'فتح التنقل' : 'Open Navigation'}
            </summary>
            <div className="mt-4">
              <DocsSidebar
                tree={tree}
                docs={docs.map((entry) => ({
                  title: entry.title,
                  href: `/docs/${entry.slug}`,
                  locale: entry.locale,
                }))}
                currentPath={currentPath}
                currentLocale={currentLocale}
                englishHref={alternates.en}
                arabicHref={alternates.ar}
              />
            </div>
          </details>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
          <aside className="hidden h-fit rounded-lg border border-dc1-border bg-dc1-surface-l1 p-4 lg:block">
            <DocsSidebar
              tree={tree}
              docs={docs.map((entry) => ({
                title: entry.title,
                href: `/docs/${entry.slug}`,
                locale: entry.locale,
              }))}
              currentPath={currentPath}
              currentLocale={currentLocale}
              englishHref={alternates.en}
              arabicHref={alternates.ar}
            />
          </aside>

          <article className="min-w-0 overflow-hidden rounded-lg border border-dc1-border bg-dc1-surface-l1 p-6 sm:p-8">
            <nav
              className="mb-4 flex flex-wrap items-center gap-2 text-xs text-dc1-text-muted"
              aria-label="Breadcrumb"
            >
              <Link href="/docs" className="hover:text-dc1-amber">
                Docs
              </Link>
              {breadcrumbs.map((item) => (
                <span key={item.href} className="flex items-center gap-2">
                  <span>/</span>
                  <Link href={item.href} className="hover:text-dc1-amber">
                    {item.label}
                  </Link>
                </span>
              ))}
            </nav>

            <h1 className="text-3xl font-bold text-dc1-text-primary">{doc.title}</h1>
            {doc.description && (
              <p className="mt-3 text-base text-dc1-text-secondary">{doc.description}</p>
            )}

            <div className="docs-mdx mt-8">
              <SimpleMdxRenderer source={doc.body} />
            </div>
          </article>
        </div>
      </main>

      <Footer />
    </div>
  )
}
